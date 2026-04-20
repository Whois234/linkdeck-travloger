from dotenv import load_dotenv
from pathlib import Path
import ipaddress
import logging
import os
import uuid
from datetime import datetime, timezone, timedelta
from typing import Optional
from urllib.parse import quote

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

from fastapi import FastAPI, APIRouter, HTTPException, Request, Response
from fastapi.responses import RedirectResponse, FileResponse, StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import boto3
from botocore.config import Config
from botocore.exceptions import ClientError
import bcrypt
from jose import jwt
import requests
from pydantic import BaseModel, Field

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# JWT config
JWT_ALGORITHM = "HS256"
EXPIRED_ITINERARY_MESSAGE = (
    "Sorry, the itinerary is expired. Please contact travloger.in "
    "(wa.me/916281392007) for the latest itinerary."
)
IP_API_FIELDS = "status,message,query,country,countryCode,regionName,city"
MAX_PDF_SIZE_BYTES = 100 * 1024 * 1024
PRESIGNED_UPLOAD_TTL_SECONDS = 15 * 60
PRESIGNED_DOWNLOAD_TTL_SECONDS = 60 * 60


def s3_ready() -> bool:
    return all([
        os.environ.get("AWS_ACCESS_KEY_ID"),
        os.environ.get("AWS_SECRET_ACCESS_KEY"),
        os.environ.get("AWS_REGION"),
        os.environ.get("S3_PDF_BUCKET"),
    ])


def get_s3_client(addressing_style: str = "path", use_endpoint_override: bool = True):
    region = os.environ.get("AWS_REGION")
    client_kwargs = {
        "service_name": "s3",
        "region_name": region,
        "aws_access_key_id": os.environ.get("AWS_ACCESS_KEY_ID"),
        "aws_secret_access_key": os.environ.get("AWS_SECRET_ACCESS_KEY"),
        "config": Config(
            signature_version="s3v4",
            s3={"addressing_style": addressing_style},
        ),
    }
    if use_endpoint_override:
        client_kwargs["endpoint_url"] = f"https://s3.{region}.amazonaws.com"
    return boto3.client(
        **client_kwargs,
    )


def get_s3_bucket_name() -> str:
    return os.environ["S3_PDF_BUCKET"]


def get_s3_form_upload_url() -> str:
    region = os.environ["AWS_REGION"]
    bucket = get_s3_bucket_name()
    return f"https://{bucket}.s3.{region}.amazonaws.com"


def get_s3_key_prefix() -> str:
    return os.environ.get("S3_PDF_KEY_PREFIX", "pdfs").strip("/") or "pdfs"


def get_cloudfront_base_url() -> Optional[str]:
    domain = (os.environ.get("AWS_CLOUDFRONT_DOMAIN") or "").strip().rstrip("/")
    if not domain:
        return None
    if not domain.startswith("http://") and not domain.startswith("https://"):
        domain = f"https://{domain}"
    return domain


def sanitize_filename(file_name: str) -> str:
    name = Path(file_name or "document.pdf").name
    safe = "".join(ch if ch.isalnum() or ch in {"-", "_", "."} else "_" for ch in name)
    return safe or "document.pdf"


def build_pdf_object_key(user_id: str, pdf_id: str, file_name: str) -> str:
    return f"{get_s3_key_prefix()}/{user_id}/{pdf_id}/{sanitize_filename(file_name)}"


def validate_pdf_upload(file_name: str, file_size: int, content_type: Optional[str] = None) -> None:
    if not file_name or not file_name.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are allowed")
    if file_size <= 0:
        raise HTTPException(status_code=400, detail="PDF file is empty")
    if file_size > MAX_PDF_SIZE_BYTES:
        raise HTTPException(status_code=400, detail="File too large. Max 100MB.")
    normalized_content_type = (content_type or "").lower()
    if normalized_content_type and normalized_content_type not in {"application/pdf", "application/x-pdf", "application/octet-stream", "binary/octet-stream"}:
        raise HTTPException(status_code=400, detail="Invalid file type. Upload a PDF.")


def resolve_pdf_url(pdf: dict, request: Optional[Request] = None) -> Optional[str]:
    if pdf.get("storage_provider") == "s3" and pdf.get("object_key") and s3_ready():
        object_key = pdf["object_key"]
        cloudfront_base_url = get_cloudfront_base_url()
        if cloudfront_base_url:
            return f"{cloudfront_base_url}/{quote(object_key)}"
        try:
            return get_s3_client().generate_presigned_url(
                "get_object",
                Params={"Bucket": get_s3_bucket_name(), "Key": object_key},
                ExpiresIn=PRESIGNED_DOWNLOAD_TTL_SECONDS,
            )
        except Exception as exc:
            logger.error("Failed to generate S3 download URL for %s: %s", object_key, exc)

    file_url = pdf.get("file_url")
    if file_url:
        return file_url

    storage_path = pdf.get("storage_path")
    if not storage_path or request is None:
        return None

    filename = Path(storage_path).name
    return f"{str(request.base_url).rstrip('/')}/api/uploads/{filename}"


def inline_pdf_headers(file_name: str) -> dict:
    safe_name = Path(file_name or "document.pdf").name.replace('"', "")
    return {
        "Content-Disposition": f'inline; filename="{safe_name}"',
        "Cache-Control": "private, max-age=300",
    }


def normalize_datetime(value: Optional[str]) -> datetime:
    if not value:
        return datetime.min.replace(tzinfo=timezone.utc)
    try:
        return datetime.fromisoformat(value).astimezone(timezone.utc)
    except Exception:
        return datetime.min.replace(tzinfo=timezone.utc)


def infer_device_type(user_agent: str, is_mobile: bool) -> str:
    ua = (user_agent or "").lower()
    if is_mobile or "mobile" in ua or "android" in ua or "iphone" in ua:
        return "Mobile"
    if "ipad" in ua or "tablet" in ua:
        return "Tablet"
    return "Desktop"


def infer_platform(user_agent: str) -> str:
    ua = (user_agent or "").lower()
    if "iphone" in ua or "ipad" in ua or "ios" in ua:
        return "iOS"
    if "android" in ua:
        return "Android"
    if "windows" in ua:
        return "Windows"
    if "mac os" in ua or "macintosh" in ua:
        return "macOS"
    if "linux" in ua:
        return "Linux"
    return "Unknown"


def infer_browser(user_agent: str) -> str:
    ua = (user_agent or "").lower()
    if "edg/" in ua:
        return "Edge"
    if "chrome/" in ua and "edg/" not in ua:
        return "Chrome"
    if "safari/" in ua and "chrome/" not in ua:
        return "Safari"
    if "firefox/" in ua:
        return "Firefox"
    if "opr/" in ua or "opera/" in ua:
        return "Opera"
    return "Unknown"


def get_client_ip(request: Request) -> str:
    forwarded_for = request.headers.get("x-forwarded-for", "")
    if forwarded_for:
        return forwarded_for.split(",")[0].strip()
    real_ip = request.headers.get("x-real-ip")
    if real_ip:
        return real_ip.strip()
    client_host = getattr(request.client, "host", None)
    return client_host or ""


def get_location_snapshot(request: Request) -> dict:
    headers = request.headers
    city = headers.get("x-vercel-ip-city") or headers.get("cf-ipcity") or ""
    region = headers.get("x-vercel-ip-country-region") or headers.get("cf-region") or ""
    country = headers.get("x-vercel-ip-country") or headers.get("cf-ipcountry") or ""
    source = "headers" if any([city, region, country]) else None
    parts = [part for part in [city, region, country] if part]
    return {
        "city": city,
        "region": region,
        "country": country,
        "label": ", ".join(parts) if parts else None,
        "source": source,
    }


def merge_location_data(primary: dict, fallback: dict) -> dict:
    city = primary.get("city") or fallback.get("city")
    region = primary.get("region") or fallback.get("region")
    country = fallback.get("country") or primary.get("country")
    parts = [part for part in [city, region, country] if part]
    return {
        "city": city,
        "region": region,
        "country": country,
        "label": ", ".join(parts) if parts else None,
        "source": primary.get("source") if primary.get("city") and primary.get("region") else fallback.get("source") or primary.get("source"),
    }


def get_header_snapshot(request: Request) -> dict:
    relevant_headers = [
        "x-forwarded-for",
        "x-real-ip",
        "x-vercel-ip-city",
        "x-vercel-ip-country-region",
        "x-vercel-ip-country",
        "cf-connecting-ip",
        "cf-ipcity",
        "cf-region",
        "cf-ipcountry",
        "user-agent",
        "host",
        "origin",
        "referer",
    ]
    return {
        "captured_at": datetime.now(timezone.utc).isoformat(),
        "headers": {name: request.headers.get(name) for name in relevant_headers if request.headers.get(name)},
    }


def is_public_ip(ip_value: str) -> bool:
    if not ip_value:
        return False
    try:
        ip_obj = ipaddress.ip_address(ip_value)
        return not (ip_obj.is_private or ip_obj.is_loopback or ip_obj.is_reserved or ip_obj.is_multicast)
    except ValueError:
        return False


async def lookup_ip_geolocation(ip_address: str) -> dict:
    if not is_public_ip(ip_address):
        return {"city": None, "region": None, "country": None, "label": None, "source": None}

    cached = await db.geo_cache.find_one({"_id": ip_address})
    if cached:
        parts = [part for part in [cached.get("city"), cached.get("region"), cached.get("country")] if part]
        return {
            "city": cached.get("city"),
            "region": cached.get("region"),
            "country": cached.get("country"),
            "label": ", ".join(parts) if parts else None,
            "source": cached.get("source") or "cache",
        }

    try:
        response = requests.get(
            f"http://ip-api.com/json/{ip_address}",
            params={"fields": IP_API_FIELDS},
            timeout=3,
        )
        response.raise_for_status()
        payload = response.json()
    except Exception as exc:
        logger.warning(f"IP geolocation lookup failed for {ip_address}: {exc}")
        return {"city": None, "region": None, "country": None, "label": None, "source": None}

    if payload.get("status") != "success":
        return {"city": None, "region": None, "country": None, "label": None, "source": None}

    city = payload.get("city") or None
    region = payload.get("regionName") or None
    country = payload.get("country") or None
    source = "ip-api"
    await db.geo_cache.update_one(
        {"_id": ip_address},
        {"$set": {
            "city": city,
            "region": region,
            "country": country,
            "source": source,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }},
        upsert=True,
    )
    parts = [part for part in [city, region, country] if part]
    return {
        "city": city,
        "region": region,
        "country": country,
        "label": ", ".join(parts) if parts else None,
        "source": source,
    }


def get_link_pdf_name(link: dict, pdf_map: dict) -> str:
    return (
        link.get("pdf_name_snapshot")
        or pdf_map.get(link.get("pdf_id"))
        or "Deleted PDF"
    )


def get_session_pdf_name(session: dict, pdf_map: dict) -> str:
    return (
        session.get("pdf_name_snapshot")
        or pdf_map.get(session.get("pdf_id"))
        or "Deleted PDF"
    )


def get_session_number(session: dict, sorted_sessions_for_link: list[dict]) -> int:
    for index, item in enumerate(sorted_sessions_for_link, start=1):
        if item.get("_id") == session.get("_id"):
            return index
    return 0


async def build_link_summary(link: dict, pdf_map: dict) -> dict:
    sessions = await db.view_sessions.find({"link_id": link["_id"]}).sort("started_at", 1).to_list(1000)
    total_time = sum(int(session.get("duration_seconds") or 0) for session in sessions)
    latest_session = sessions[-1] if sessions else None
    return {
        **link,
        "pdf_name": get_link_pdf_name(link, pdf_map),
        "pdf_deleted": bool(link.get("pdf_deleted")) or (link.get("pdf_id") not in pdf_map and not link.get("pdf_archived")),
        "pdf_archived": bool(link.get("pdf_archived")),
        "session_count": len(sessions),
        "total_time_seconds": total_time,
        "avg_time_seconds": round(total_time / len(sessions)) if sessions else 0,
        "latest_session_started_at": latest_session.get("started_at") if latest_session else None,
        "latest_device": latest_session.get("device_type") if latest_session else None,
        "latest_platform": latest_session.get("platform") if latest_session else None,
        "latest_location": latest_session.get("location_label") if latest_session else None,
    }


def normalize_page_durations(raw_page_durations: Optional[dict]) -> dict[str, int]:
    normalized = {}
    if not isinstance(raw_page_durations, dict):
        return normalized
    for key, value in raw_page_durations.items():
        try:
            page_key = str(int(key))
            normalized[page_key] = max(0, min(int(value or 0), 24 * 60 * 60))
        except Exception:
            continue
    return normalized


def build_page_breakdown(raw_page_durations: Optional[dict]) -> list[dict]:
    normalized = normalize_page_durations(raw_page_durations)
    items = [
        {"page_number": int(page), "duration_seconds": duration}
        for page, duration in normalized.items()
    ]
    return sorted(items, key=lambda item: item["page_number"])

def get_jwt_secret():
    return os.environ["JWT_SECRET"]

# Object Storage config



# Password hashing
def hash_password(password: str) -> str:
    salt = bcrypt.gensalt()
    hashed = bcrypt.hashpw(password.encode("utf-8"), salt)
    return hashed.decode("utf-8")

def verify_password(plain_password: str, hashed_password: str) -> bool:
    return bcrypt.checkpw(plain_password.encode("utf-8"), hashed_password.encode("utf-8"))

# JWT tokens
def create_access_token(user_id: str, email: str) -> str:
    payload = {"sub": user_id, "email": email, "exp": datetime.now(timezone.utc) + timedelta(minutes=60), "type": "access"}
    return jwt.encode(payload, get_jwt_secret(), algorithm=JWT_ALGORITHM)

def create_refresh_token(user_id: str) -> str:
    payload = {"sub": user_id, "exp": datetime.now(timezone.utc) + timedelta(days=7), "type": "refresh"}
    return jwt.encode(payload, get_jwt_secret(), algorithm=JWT_ALGORITHM)

# Auth helper
async def get_current_user(request: Request) -> dict:
    token = request.cookies.get("access_token")
    if not token:
        auth_header = request.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            token = auth_header[7:]
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = jwt.decode(token, get_jwt_secret(), algorithms=[JWT_ALGORITHM])
        if payload.get("type") != "access":
            raise HTTPException(status_code=401, detail="Invalid token type")
        from bson import ObjectId
        user = await db.users.find_one({"_id": ObjectId(payload["sub"])})
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        user["_id"] = str(user["_id"])
        user.pop("password_hash", None)
        return user
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")


async def get_current_admin(request: Request) -> dict:
    user = await get_current_user(request)
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    return user

# Pydantic models
class RegisterInput(BaseModel):
    email: str
    password: str
    name: str = "User"

class LoginInput(BaseModel):
    email: str
    password: str

class LinkCreateInput(BaseModel):
    pdf_id: str
    customer_name: str
    customer_phone: str

class PdfUploadInitiateInput(BaseModel):
    file_name: str
    file_size: int
    content_type: str = "application/pdf"

class PdfUploadCompleteInput(BaseModel):
    pdf_id: str

class AdminCreateUserInput(BaseModel):
    email: str
    password: str
    name: str = "User"

class AdminResetPasswordInput(BaseModel):
    password: str

class ViewSessionStartInput(BaseModel):
    screen_width: Optional[int] = None
    screen_height: Optional[int] = None
    is_mobile: bool = False

class ViewSessionHeartbeatInput(BaseModel):
    session_id: str
    duration_seconds: int
    current_page: Optional[int] = None
    total_pages: Optional[int] = None
    page_durations: dict[str, int] = Field(default_factory=dict)

# Create app
app = FastAPI()
api_router = APIRouter(prefix="/api")

# ---- AUTH ENDPOINTS ----
@api_router.post("/auth/register")
async def register(input: RegisterInput, response: Response):
    email = input.email.strip().lower()
    existing = await db.users.find_one({"email": email})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    hashed = hash_password(input.password)
    user_doc = {
        "email": email,
        "password_hash": hashed,
        "name": input.name,
        "role": "user",
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    result = await db.users.insert_one(user_doc)
    user_id = str(result.inserted_id)
    access_token = create_access_token(user_id, email)
    refresh_token = create_refresh_token(user_id)
    is_https = "https" in os.environ.get("FRONTEND_URL", "")
    response.set_cookie(key="access_token", value=access_token, httponly=True, secure=is_https, samesite="none", max_age=3600, path="/")
    response.set_cookie(key="refresh_token", value=refresh_token, httponly=True, secure=is_https, samesite="none", max_age=604800, path="/")
    return {"id": user_id, "email": email, "name": input.name, "role": "user", "access_token": access_token}

@api_router.post("/auth/login")
async def login(input: LoginInput, request: Request, response: Response):
    email = input.email.strip().lower()
    user = await db.users.find_one({"email": email})
    if not user:
        raise HTTPException(status_code=401, detail="Invalid email or password")
    if not verify_password(input.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    user_id = str(user["_id"])
    access_token = create_access_token(user_id, email)
    refresh_token = create_refresh_token(user_id)
    is_https = "https" in os.environ.get("FRONTEND_URL", "")
    response.set_cookie(key="access_token", value=access_token, httponly=True, secure=is_https, samesite="none", max_age=3600, path="/")
    response.set_cookie(key="refresh_token", value=refresh_token, httponly=True, secure=is_https, samesite="none", max_age=604800, path="/")
    return {"id": user_id, "email": email, "name": user.get("name", ""), "role": user.get("role", "user"), "access_token": access_token}

@api_router.post("/auth/logout")
async def logout(response: Response):
    response.delete_cookie("access_token", path="/")
    response.delete_cookie("refresh_token", path="/")
    return {"message": "Logged out"}

@api_router.get("/auth/me")
async def get_me(request: Request):
    user = await get_current_user(request)
    return {"id": user["_id"], "email": user["email"], "name": user.get("name", ""), "role": user.get("role", "user")}

@api_router.post("/auth/refresh")
async def refresh_token(request: Request, response: Response):
    token = request.cookies.get("refresh_token")
    if not token:
        raise HTTPException(status_code=401, detail="No refresh token")
    try:
        payload = jwt.decode(token, get_jwt_secret(), algorithms=[JWT_ALGORITHM])
        if payload.get("type") != "refresh":
            raise HTTPException(status_code=401, detail="Invalid token type")
        from bson import ObjectId
        user = await db.users.find_one({"_id": ObjectId(payload["sub"])})
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        user_id = str(user["_id"])
        access_token = create_access_token(user_id, user["email"])
        is_https = "https" in os.environ.get("FRONTEND_URL", "")
        response.set_cookie(key="access_token", value=access_token, httponly=True, secure=is_https, samesite="none", max_age=3600, path="/")
        return {"message": "Token refreshed", "access_token": access_token}
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Refresh token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid refresh token")


# ---- ADMIN ENDPOINTS ----
@api_router.get("/admin/users")
async def list_users(request: Request):
    await get_current_admin(request)
    users = await db.users.find(
        {},
        {"password_hash": 0}
    ).sort("created_at", -1).to_list(1000)

    return [
        {
            "id": str(user["_id"]),
            "email": user.get("email", ""),
            "name": user.get("name", ""),
            "role": user.get("role", "user"),
            "created_at": user.get("created_at"),
            "password_status": "Password Set" if user.get("password_hash") else "No Password"
        }
        for user in users
    ]


@api_router.post("/admin/users")
async def admin_create_user(input: AdminCreateUserInput, request: Request):
    await get_current_admin(request)
    email = input.email.strip().lower()
    if not email or not input.password:
        raise HTTPException(status_code=400, detail="Email and temporary password are required")

    existing = await db.users.find_one({"email": email})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")

    user_doc = {
        "email": email,
        "password_hash": hash_password(input.password),
        "name": input.name.strip() or "User",
        "role": "user",
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    result = await db.users.insert_one(user_doc)
    return {
        "id": str(result.inserted_id),
        "email": user_doc["email"],
        "name": user_doc["name"],
        "role": user_doc["role"],
        "created_at": user_doc["created_at"],
        "password_status": "Password Set"
    }


@api_router.post("/admin/users/{user_id}/reset-password")
async def admin_reset_password(user_id: str, input: AdminResetPasswordInput, request: Request):
    await get_current_admin(request)
    if not input.password:
        raise HTTPException(status_code=400, detail="New password is required")

    from bson import ObjectId
    try:
        object_id = ObjectId(user_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid user ID")

    result = await db.users.update_one(
        {"_id": object_id},
        {"$set": {"password_hash": hash_password(input.password)}}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="User not found")
    return {"message": "Password reset successfully"}


@api_router.get("/admin/stats")
async def admin_stats(request: Request):
    await get_current_admin(request)
    total_users = await db.users.count_documents({})
    total_pdfs = await db.pdfs.count_documents({"archived": {"$ne": True}, "upload_status": {"$ne": "pending"}})
    total_links = await db.links.count_documents({})
    opened_links = await db.links.count_documents({"opened": True})
    return {
        "total_users": total_users,
        "total_pdfs": total_pdfs,
        "total_links": total_links,
        "opened_links": opened_links,
        "unopened_links": total_links - opened_links
    }


@api_router.get("/admin/analytics")
async def admin_analytics(
    request: Request,
    days: Optional[int] = 30,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None
):
    await get_current_admin(request)

    date_filter = {}
    cutoff = None
    if start_date or end_date:
        date_filter["created_at"] = {}
        if start_date:
            date_filter["created_at"]["$gte"] = f"{start_date}T00:00:00+00:00"
        if end_date:
            date_filter["created_at"]["$lte"] = f"{end_date}T23:59:59+00:00"
    elif days and days > 0:
        cutoff = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
        date_filter = {"created_at": {"$gte": cutoff}}

    links = await db.links.find(date_filter).to_list(10000)
    pdfs = await db.pdfs.find({}, {"_id": 0, "id": 1, "file_name": 1, "archived": 1, "archived_at": 1, "upload_status": 1}).to_list(10000)
    session_filter = {}
    if days and days > 0:
        session_filter = {"started_at": {"$gte": cutoff}}
    sessions = await db.view_sessions.find(session_filter).to_list(10000)
    pdf_map = {pdf["id"]: pdf.get("file_name", "Unknown PDF") for pdf in pdfs}
    pdf_meta_map = {
        pdf["id"]: {
            "pdf_id": pdf["id"],
            "pdf_name": pdf.get("file_name", "Unknown PDF"),
            "archived": bool(pdf.get("archived")),
            "archived_at": pdf.get("archived_at"),
            "upload_status": pdf.get("upload_status"),
        }
        for pdf in pdfs
    }

    def is_in_selected_range(value: Optional[str]) -> bool:
        if not value:
            return False
        try:
            dt = datetime.fromisoformat(value).astimezone(timezone.utc)
            if start_date and dt < datetime.fromisoformat(f"{start_date}T00:00:00+00:00"):
                return False
            if end_date and dt > datetime.fromisoformat(f"{end_date}T23:59:59+00:00"):
                return False
            if cutoff and dt < datetime.fromisoformat(cutoff):
                return False
            return True
        except Exception:
            return False

    pdf_state_by_id = {
        pdf_id: ("archived" if meta.get("archived") else "active")
        for pdf_id, meta in pdf_meta_map.items()
    }
    for link in links:
        pdf_id = link.get("pdf_id")
        if not pdf_id:
            continue
        if link.get("pdf_deleted"):
            pdf_state_by_id[pdf_id] = "deleted"
        elif link.get("pdf_archived") and pdf_state_by_id.get(pdf_id) != "deleted":
            pdf_state_by_id[pdf_id] = "archived"
    for session in sessions:
        pdf_id = session.get("pdf_id")
        if not pdf_id:
            continue
        if session.get("pdf_deleted"):
            pdf_state_by_id[pdf_id] = "deleted"
        elif session.get("pdf_archived") and pdf_state_by_id.get(pdf_id) != "deleted":
            pdf_state_by_id[pdf_id] = "archived"

    links_by_pdf = {}
    opens_by_hour = {str(hour).zfill(2): 0 for hour in range(24)}

    for link in links:
        pdf_id = link.get("pdf_id")
        if pdf_state_by_id.get(pdf_id) in {"archived", "deleted"}:
            continue
        pdf_name = get_link_pdf_name(link, pdf_map)
        if pdf_id not in links_by_pdf:
            links_by_pdf[pdf_id] = {"pdf_id": pdf_id, "pdf_name": pdf_name, "links": 0, "opens": 0}
        links_by_pdf[pdf_id]["links"] += 1
        links_by_pdf[pdf_id]["opens"] += int(link.get("open_count") or 0)

        opened_at = link.get("last_opened_at")
        if is_in_selected_range(opened_at):
            try:
                opened_dt = datetime.fromisoformat(opened_at).astimezone(timezone.utc)
                opens_by_hour[str(opened_dt.hour).zfill(2)] += 1
            except Exception:
                pass

    total_duration = sum(int(session.get("duration_seconds") or 0) for session in sessions)
    tracked_sessions = len(sessions)
    avg_time_spent = round(total_duration / tracked_sessions) if tracked_sessions else 0
    total_opens = sum(int(link.get("open_count") or 0) for link in links)
    avg_opens_per_link = round(total_opens / len(links), 2) if links else 0

    sessions_by_pdf = {}
    for session in sessions:
        pdf_id = session.get("pdf_id")
        pdf_name = get_session_pdf_name(session, pdf_map)
        if pdf_id not in sessions_by_pdf:
            sessions_by_pdf[pdf_id] = {"pdf_id": pdf_id, "pdf_name": pdf_name, "sessions": 0, "total_time_seconds": 0}
        sessions_by_pdf[pdf_id]["sessions"] += 1
        sessions_by_pdf[pdf_id]["total_time_seconds"] += int(session.get("duration_seconds") or 0)

    active_time_by_pdf = []
    archived_time_by_pdf = {
        pdf_id: {
            "pdf_id": pdf_id,
            "pdf_name": meta["pdf_name"],
            "sessions": 0,
            "total_time_seconds": 0,
            "avg_time_seconds": 0,
            "archived_at": meta.get("archived_at"),
        }
        for pdf_id, meta in pdf_meta_map.items()
        if meta.get("archived") and meta.get("upload_status") != "pending"
    }
    for item in sessions_by_pdf.values():
        item["avg_time_seconds"] = round(item["total_time_seconds"] / item["sessions"]) if item["sessions"] else 0
        pdf_state = pdf_state_by_id.get(item["pdf_id"], "active")
        if pdf_state == "deleted":
            continue
        if pdf_state == "archived":
            archived_item = archived_time_by_pdf.get(item["pdf_id"], {
                "pdf_id": item["pdf_id"],
                "pdf_name": item["pdf_name"],
                "sessions": 0,
                "total_time_seconds": 0,
                "avg_time_seconds": 0,
                "archived_at": None,
            })
            archived_item.update({
                "pdf_name": item["pdf_name"],
                "sessions": item["sessions"],
                "total_time_seconds": item["total_time_seconds"],
                "avg_time_seconds": item["avg_time_seconds"],
                "archived_at": archived_item.get("archived_at"),
            })
            archived_time_by_pdf[item["pdf_id"]] = archived_item
        else:
            active_time_by_pdf.append(item)

    return {
        "summary": {
            "total_links": len(links),
            "total_opens": total_opens,
            "avg_opens_per_link": avg_opens_per_link,
            "tracked_sessions": tracked_sessions,
            "total_time_seconds": total_duration,
            "avg_time_seconds": avg_time_spent,
        },
        "links_by_pdf": sorted(links_by_pdf.values(), key=lambda item: item["links"], reverse=True),
        "opens_by_hour": [{"hour": f"{hour}:00", "opens": opens} for hour, opens in opens_by_hour.items()],
        "time_by_pdf": sorted(active_time_by_pdf, key=lambda item: item["total_time_seconds"], reverse=True),
        "archived_time_by_pdf": sorted(archived_time_by_pdf.values(), key=lambda item: normalize_datetime(item.get("archived_at")), reverse=True),
    }


@api_router.get("/admin/recent-activity")
async def admin_recent_activity(request: Request, limit: int = 20):
    await get_current_admin(request)
    pdfs = await db.pdfs.find({}, {"_id": 0, "id": 1, "file_name": 1}).to_list(10000)
    pdf_map = {pdf["id"]: pdf.get("file_name", "Unknown PDF") for pdf in pdfs}
    sessions = await db.view_sessions.find({}).sort("started_at", -1).to_list(max(1, min(limit, 100)))
    link_ids = list({session.get("link_id") for session in sessions if session.get("link_id")})
    all_sessions_for_links = await db.view_sessions.find({"link_id": {"$in": link_ids}}).sort("started_at", 1).to_list(10000) if link_ids else []
    sessions_by_link = {}
    for session in all_sessions_for_links:
        sessions_by_link.setdefault(session.get("link_id"), []).append(session)

    activity = []
    for session in sessions:
        per_link_sessions = sessions_by_link.get(session.get("link_id"), [])
        activity.append({
            "session_id": session.get("_id"),
            "link_id": session.get("link_id"),
            "customer_name": session.get("customer_name") or "Unknown Customer",
            "customer_phone": session.get("customer_phone") or "--",
            "pdf_name": get_session_pdf_name(session, pdf_map),
            "session_number": get_session_number(session, per_link_sessions),
            "started_at": session.get("started_at"),
            "duration_seconds": int(session.get("duration_seconds") or 0),
            "device_type": session.get("device_type") or infer_device_type(session.get("user_agent", ""), bool(session.get("is_mobile"))),
            "platform": session.get("platform") or infer_platform(session.get("user_agent", "")),
            "browser": session.get("browser") or infer_browser(session.get("user_agent", "")),
            "location_label": session.get("location_label"),
            "location_source": session.get("location_source"),
        })
    return {"items": activity}


@api_router.delete("/admin/recent-activity/{session_id}")
async def delete_recent_activity_session(session_id: str, request: Request):
    await get_current_admin(request)
    session = await db.view_sessions.find_one({"_id": session_id})
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    await db.view_sessions.delete_one({"_id": session_id})
    return {"message": "Session deleted"}


@api_router.delete("/admin/pdfs/{pdf_id}")
async def admin_delete_pdf(pdf_id: str, request: Request):
    await get_current_admin(request)
    pdf = await db.pdfs.find_one({"id": pdf_id})
    if not pdf:
        raise HTTPException(status_code=404, detail="PDF not found")

    archived_at = datetime.now(timezone.utc).isoformat()
    await db.pdfs.update_one(
        {"id": pdf_id},
        {"$set": {"archived": True, "archived_at": archived_at}}
    )
    await db.links.update_many(
        {"pdf_id": pdf_id},
        {"$set": {
            "pdf_archived": True,
            "pdf_name_snapshot": pdf.get("file_name", "Deleted PDF"),
            "pdf_archived_at": archived_at,
        }}
    )
    await db.view_sessions.update_many(
        {"pdf_id": pdf_id},
        {"$set": {
            "pdf_archived": True,
            "pdf_name_snapshot": pdf.get("file_name", "Deleted PDF"),
            "pdf_archived_at": archived_at,
        }}
    )
    return {"message": "PDF archived from admin. Existing customer links still work, and analytics remain available."}


@api_router.post("/admin/pdfs/{pdf_id}/reactivate")
async def admin_reactivate_pdf(pdf_id: str, request: Request):
    await get_current_admin(request)
    pdf = await db.pdfs.find_one({"id": pdf_id})
    if not pdf:
        raise HTTPException(status_code=404, detail="PDF not found")

    await db.pdfs.update_one(
        {"id": pdf_id},
        {"$set": {"archived": False, "archived_at": None}}
    )
    await db.links.update_many(
        {"pdf_id": pdf_id},
        {"$set": {"pdf_archived": False}, "$unset": {"pdf_archived_at": ""}}
    )
    await db.view_sessions.update_many(
        {"pdf_id": pdf_id},
        {"$set": {"pdf_archived": False}, "$unset": {"pdf_archived_at": ""}}
    )
    return {"message": "PDF reactivated"}


@api_router.delete("/admin/pdfs/{pdf_id}/permanent")
async def admin_permanently_delete_pdf(pdf_id: str, request: Request):
    await get_current_admin(request)
    pdf = await db.pdfs.find_one({"id": pdf_id})
    if not pdf:
        raise HTTPException(status_code=404, detail="PDF not found")

    deleted_at = datetime.now(timezone.utc).isoformat()
    if pdf.get("storage_provider") == "s3" and pdf.get("bucket") and pdf.get("object_key") and s3_ready():
        try:
            get_s3_client().delete_object(Bucket=pdf["bucket"], Key=pdf["object_key"])
        except Exception as exc:
            logger.warning("Failed to delete S3 object for %s: %s", pdf.get("object_key"), exc)

    await db.pdfs.delete_one({"id": pdf_id})
    await db.links.update_many(
        {"pdf_id": pdf_id},
        {"$set": {
            "pdf_deleted": True,
            "pdf_archived": False,
            "pdf_name_snapshot": pdf.get("file_name", "Deleted PDF"),
            "pdf_deleted_at": deleted_at,
        }, "$unset": {"pdf_archived_at": ""}}
    )
    await db.view_sessions.update_many(
        {"pdf_id": pdf_id},
        {"$set": {
            "pdf_deleted": True,
            "pdf_archived": False,
            "pdf_name_snapshot": pdf.get("file_name", "Deleted PDF"),
            "pdf_deleted_at": deleted_at,
        }, "$unset": {"pdf_archived_at": ""}}
    )
    return {"message": "PDF permanently deleted"}

# ---- PDF ENDPOINTS ----
UPLOAD_DIR = ROOT_DIR / "uploads"
UPLOAD_DIR.mkdir(exist_ok=True)


@api_router.post("/pdfs/upload/initiate")
async def initiate_pdf_upload(input: PdfUploadInitiateInput, request: Request):
    user = await get_current_user(request)
    if not s3_ready():
        raise HTTPException(status_code=503, detail="S3 storage is not configured")

    validate_pdf_upload(input.file_name, input.file_size, input.content_type)

    file_id = str(uuid.uuid4())
    object_key = build_pdf_object_key(user["_id"], file_id, input.file_name)
    now = datetime.now(timezone.utc).isoformat()

    pdf_doc = {
        "id": file_id,
        "user_id": user["_id"],
        "file_name": Path(input.file_name or "document.pdf").name,
        "file_size": int(input.file_size),
        "content_type": input.content_type or "application/pdf",
        "storage_provider": "s3",
        "bucket": get_s3_bucket_name(),
        "object_key": object_key,
        "file_url": None,
        "storage_path": None,
        "upload_status": "pending",
        "archived": False,
        "archived_at": None,
        "created_at": now,
        "updated_at": now,
    }

    await db.pdfs.insert_one(pdf_doc)

    try:
        presigned_post = get_s3_client(addressing_style="virtual", use_endpoint_override=False).generate_presigned_post(
            Bucket=get_s3_bucket_name(),
            Key=object_key,
            Conditions=[
                ["content-length-range", 1, MAX_PDF_SIZE_BYTES],
            ],
            ExpiresIn=PRESIGNED_UPLOAD_TTL_SECONDS,
        )
    except Exception as exc:
        await db.pdfs.delete_one({"id": file_id, "user_id": user["_id"]})
        logger.error("Failed to create S3 upload URL for %s: %s", object_key, exc)
        raise HTTPException(status_code=500, detail="Could not start PDF upload")

    return {
        "id": file_id,
        "upload_url": get_s3_form_upload_url(),
        "upload_fields": presigned_post["fields"],
        "upload_method": "post",
        "object_key": object_key,
        "content_type": pdf_doc["content_type"],
        "expires_in": PRESIGNED_UPLOAD_TTL_SECONDS,
    }


@api_router.post("/pdfs/upload/complete")
async def complete_pdf_upload(input: PdfUploadCompleteInput, request: Request):
    user = await get_current_user(request)
    pdf = await db.pdfs.find_one({"id": input.pdf_id, "user_id": user["_id"]})
    if not pdf:
        raise HTTPException(status_code=404, detail="Pending PDF upload not found")
    if pdf.get("storage_provider") != "s3":
        raise HTTPException(status_code=400, detail="Unsupported PDF storage provider")

    try:
        metadata = get_s3_client().head_object(Bucket=pdf["bucket"], Key=pdf["object_key"])
    except ClientError as exc:
        logger.error("Failed to confirm S3 upload for %s: %s", pdf.get("object_key"), exc)
        raise HTTPException(status_code=400, detail="PDF upload not found in S3. Please upload again.")

    content_length = int(metadata.get("ContentLength") or 0)
    content_type = metadata.get("ContentType") or pdf.get("content_type") or "application/pdf"
    validate_pdf_upload(pdf.get("file_name"), content_length, content_type)

    delivery_url = resolve_pdf_url({**pdf, "upload_status": "ready"})
    updated_at = datetime.now(timezone.utc).isoformat()
    await db.pdfs.update_one(
        {"id": input.pdf_id, "user_id": user["_id"]},
        {"$set": {
            "file_size": content_length,
            "content_type": content_type,
            "etag": str(metadata.get("ETag") or "").strip('"'),
            "upload_status": "ready",
            "file_url": delivery_url if delivery_url and get_cloudfront_base_url() else None,
            "updated_at": updated_at,
            "uploaded_at": updated_at,
        }}
    )

    return {
        "id": pdf["id"],
        "file_name": pdf["file_name"],
        "file_size": content_length,
        "link_count": 0,
        "created_at": pdf["created_at"],
        "file_url": delivery_url,
    }


@api_router.post("/pdfs/upload")
async def upload_pdf_legacy():
    raise HTTPException(status_code=410, detail="Use the presigned upload flow: /api/pdfs/upload/initiate and /api/pdfs/upload/complete")


@api_router.get("/uploads/{filename}")
async def get_uploaded_pdf(filename: str):
    file_path = UPLOAD_DIR / filename
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="PDF not found")
    return FileResponse(
        file_path,
        media_type="application/pdf",
        headers=inline_pdf_headers(filename),
    )


@api_router.get("/pdfs")
async def list_pdfs(request: Request):
    user = await get_current_user(request)
    pdfs = await db.pdfs.find(
        {"user_id": user["_id"], "archived": {"$ne": True}, "upload_status": {"$ne": "pending"}},
        {"_id": 0}
    ).sort("created_at", -1).to_list(1000)
    # Add link count for each PDF
    for pdf in pdfs:
        link_count = await db.links.count_documents({"pdf_id": pdf["id"]})
        pdf["link_count"] = link_count
    return pdfs


@api_router.get("/pdfs/archived")
async def list_archived_pdfs(request: Request):
    user = await get_current_user(request)
    archived_links = await db.links.find(
        {"user_id": user["_id"], "$or": [{"pdf_deleted": True}, {"pdf_archived": True}]}
    ).to_list(5000)

    archived_by_pdf = {}
    for link in archived_links:
        pdf_key = link.get("pdf_id") or link.get("pdf_name_snapshot") or link.get("_id")
        if pdf_key not in archived_by_pdf:
            archived_by_pdf[pdf_key] = {
                "pdf_id": link.get("pdf_id"),
                "pdf_name": link.get("pdf_name_snapshot") or "Archived PDF",
                "pdf_deleted_at": link.get("pdf_archived_at") or link.get("pdf_deleted_at"),
                "link_count": 0,
                "opened_links": 0,
                "total_opens": 0,
                "tracked_sessions": 0,
                "total_time_seconds": 0,
                "latest_opened_at": None,
            }

        item = archived_by_pdf[pdf_key]
        item["link_count"] += 1
        item["opened_links"] += 1 if link.get("opened") else 0
        item["total_opens"] += int(link.get("open_count") or 0)
        latest_opened_at = link.get("last_opened_at")
        if normalize_datetime(latest_opened_at) > normalize_datetime(item.get("latest_opened_at")):
            item["latest_opened_at"] = latest_opened_at
        archived_at = link.get("pdf_archived_at") or link.get("pdf_deleted_at")
        if not item.get("pdf_deleted_at") and archived_at:
            item["pdf_deleted_at"] = archived_at

    archived_pdf_ids = [item.get("pdf_id") for item in archived_by_pdf.values() if item.get("pdf_id")]
    sessions = await db.view_sessions.find(
        {"user_id": user["_id"], "$or": [{"pdf_deleted": True}, {"pdf_archived": True}], "pdf_id": {"$in": archived_pdf_ids}}
    ).to_list(10000) if archived_pdf_ids else []

    for session in sessions:
        pdf_key = session.get("pdf_id") or session.get("pdf_name_snapshot")
        if pdf_key not in archived_by_pdf:
            archived_by_pdf[pdf_key] = {
                "pdf_id": session.get("pdf_id"),
                "pdf_name": session.get("pdf_name_snapshot") or "Archived PDF",
                "pdf_deleted_at": None,
                "link_count": 0,
                "opened_links": 0,
                "total_opens": 0,
                "tracked_sessions": 0,
                "total_time_seconds": 0,
                "latest_opened_at": None,
            }
        archived_by_pdf[pdf_key]["tracked_sessions"] += 1
        archived_by_pdf[pdf_key]["total_time_seconds"] += int(session.get("duration_seconds") or 0)

    return sorted(
        archived_by_pdf.values(),
        key=lambda item: normalize_datetime(item.get("pdf_deleted_at")),
        reverse=True,
    )

@api_router.delete("/pdfs/{pdf_id}")
async def delete_pdf(pdf_id: str, request: Request):
    user = await get_current_user(request)
    pdf = await db.pdfs.find_one({"id": pdf_id, "user_id": user["_id"]})
    if not pdf:
        raise HTTPException(status_code=404, detail="PDF not found")
    archived_at = datetime.now(timezone.utc).isoformat()
    await db.pdfs.update_one(
        {"id": pdf_id, "user_id": user["_id"]},
        {"$set": {"archived": True, "archived_at": archived_at}}
    )
    await db.links.update_many(
        {"pdf_id": pdf_id, "user_id": user["_id"]},
        {"$set": {
            "pdf_archived": True,
            "pdf_name_snapshot": pdf.get("file_name", "Deleted PDF"),
            "pdf_archived_at": archived_at,
        }}
    )
    await db.view_sessions.update_many(
        {"pdf_id": pdf_id, "user_id": user["_id"]},
        {"$set": {
            "pdf_archived": True,
            "pdf_name_snapshot": pdf.get("file_name", "Deleted PDF"),
            "pdf_archived_at": archived_at,
        }}
    )
    return {"message": "PDF archived. Existing customer links still work, and analytics remain available."}

# ---- LINK ENDPOINTS ----
@api_router.post("/links")
async def create_link(input: LinkCreateInput, request: Request):
    user = await get_current_user(request)
    pdf = await db.pdfs.find_one({"id": input.pdf_id, "user_id": user["_id"], "upload_status": {"$ne": "pending"}})
    if not pdf:
        raise HTTPException(status_code=404, detail="PDF not found")
    if pdf.get("archived"):
        raise HTTPException(status_code=400, detail="Archived PDFs cannot be used for new links")
    unique_id = str(uuid.uuid4())[:8]
    link_doc = {
        "_id": unique_id,
        "pdf_id": input.pdf_id,
        "user_id": user["_id"],
        "customer_name": input.customer_name,
        "customer_phone": input.customer_phone,
        "pdf_name_snapshot": pdf.get("file_name", "Unknown PDF"),
        "pdf_deleted": False,
        "pdf_archived": bool(pdf.get("archived")),
        "opened": False,
        "open_count": 0,
        "last_opened_at": None,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.links.insert_one(link_doc)
    return {
        "_id": unique_id,
        "pdf_id": input.pdf_id,
        "pdf_name": pdf["file_name"],
        "customer_name": input.customer_name,
        "customer_phone": input.customer_phone,
        "opened": False,
        "open_count": 0,
        "last_opened_at": None,
        "created_at": link_doc["created_at"],
        "url": f"/view/{unique_id}"
    }

@api_router.get("/links")
async def list_links(
    request: Request,
    status: Optional[str] = None,
    search: Optional[str] = None,
    sort: Optional[str] = None
):
    user = await get_current_user(request)
    query = {"user_id": user["_id"]}
    if status == "opened":
        query["opened"] = True
    elif status == "not_opened":
        query["opened"] = False
    if search:
        query["$or"] = [
            {"customer_name": {"$regex": search, "$options": "i"}},
            {"customer_phone": {"$regex": search, "$options": "i"}}
        ]
    links = await db.links.find(query).sort("created_at", -1).to_list(1000)
    # Enrich with PDF names
    pdf_ids = list(set(l["pdf_id"] for l in links))
    pdfs = await db.pdfs.find({"id": {"$in": pdf_ids}}, {"_id": 0, "id": 1, "file_name": 1}).to_list(1000)
    pdf_map = {p["id"]: p["file_name"] for p in pdfs}
    summaries = []
    for link in links:
        summaries.append(await build_link_summary(link, pdf_map))

    if sort == "recently_opened":
        summaries.sort(key=lambda item: normalize_datetime(item.get("last_opened_at")), reverse=True)
    elif sort == "time_spent":
        summaries.sort(key=lambda item: int(item.get("total_time_seconds") or 0), reverse=True)
    elif sort == "most_opened":
        summaries.sort(key=lambda item: int(item.get("open_count") or 0), reverse=True)
    else:
        summaries.sort(key=lambda item: normalize_datetime(item.get("created_at")), reverse=True)

    return summaries


@api_router.get("/links/{link_id}/insights")
async def get_link_insights(link_id: str, request: Request):
    user = await get_current_user(request)
    link = await db.links.find_one({"_id": link_id, "user_id": user["_id"]})
    if not link:
        raise HTTPException(status_code=404, detail="Link not found")

    pdfs = await db.pdfs.find({"id": link.get("pdf_id")}, {"_id": 0, "id": 1, "file_name": 1}).to_list(1)
    pdf_map = {pdf["id"]: pdf.get("file_name", "Unknown PDF") for pdf in pdfs}
    sessions = await db.view_sessions.find({"link_id": link_id}).sort("started_at", 1).to_list(1000)
    sessions_payload = []
    aggregate_page_totals = {}
    for index, session in enumerate(sessions, start=1):
        page_breakdown = build_page_breakdown(session.get("page_durations"))
        for item in page_breakdown:
            page_key = str(item["page_number"])
            aggregate_page_totals[page_key] = aggregate_page_totals.get(page_key, 0) + item["duration_seconds"]
        sessions_payload.append({
            "session_id": session.get("_id"),
            "session_number": index,
            "started_at": session.get("started_at"),
            "last_seen_at": session.get("last_seen_at"),
            "duration_seconds": int(session.get("duration_seconds") or 0),
            "current_page": session.get("current_page"),
            "total_pages": session.get("total_pages"),
            "device_type": session.get("device_type") or infer_device_type(session.get("user_agent", ""), bool(session.get("is_mobile"))),
            "platform": session.get("platform") or infer_platform(session.get("user_agent", "")),
            "browser": session.get("browser") or infer_browser(session.get("user_agent", "")),
            "location_label": session.get("location_label"),
            "location_source": session.get("location_source"),
            "page_breakdown": page_breakdown,
            "screen_width": session.get("screen_width"),
            "screen_height": session.get("screen_height"),
        })

    total_time = sum(item["duration_seconds"] for item in sessions_payload)
    return {
        "link": {
            "_id": link.get("_id"),
            "customer_name": link.get("customer_name"),
            "customer_phone": link.get("customer_phone"),
            "pdf_name": get_link_pdf_name(link, pdf_map),
            "pdf_deleted": bool(link.get("pdf_deleted")) or (link.get("pdf_id") not in pdf_map and not link.get("pdf_archived")),
            "pdf_archived": bool(link.get("pdf_archived")),
            "created_at": link.get("created_at"),
            "open_count": int(link.get("open_count") or 0),
            "last_opened_at": link.get("last_opened_at"),
            "session_count": len(sessions_payload),
            "total_time_seconds": total_time,
            "page_breakdown": sorted(
                [{"page_number": int(page), "duration_seconds": duration} for page, duration in aggregate_page_totals.items()],
                key=lambda item: item["page_number"]
            ),
        },
        "sessions": sessions_payload,
    }

@api_router.delete("/links/{link_id}")
async def delete_link(link_id: str, request: Request):
    user = await get_current_user(request)
    link = await db.links.find_one({"_id": link_id, "user_id": user["_id"]})
    if not link:
        raise HTTPException(status_code=404, detail="Link not found")
    await db.links.delete_one({"_id": link_id})
    return {"message": "Link deleted"}

# ---- VIEW / TRACKING ENDPOINTS (PUBLIC) ----
@api_router.get("/view/{link_id}")
async def view_pdf(link_id: str):
    link = await db.links.find_one({"_id": link_id})
    if not link:
        raise HTTPException(status_code=404, detail="Link not found")

    pdf = await db.pdfs.find_one({"id": link["pdf_id"]}, {"_id": 0})
    if not pdf:
        raise HTTPException(status_code=410, detail=EXPIRED_ITINERARY_MESSAGE)

    pdf_url = resolve_pdf_url(pdf)
    if not pdf_url:
        raise HTTPException(status_code=404, detail="PDF file is missing. Please re-upload the PDF.")

    now = datetime.now(timezone.utc).isoformat()
    await db.links.update_one(
        {"_id": link_id},
        {"$set": {"opened": True, "last_opened_at": now}, "$inc": {"open_count": 1}}
    )

    return RedirectResponse(url=pdf_url)


@api_router.get("/view/{unique_id}/info")
async def get_pdf_info(unique_id: str, request: Request):
    """Get PDF info for a link WITHOUT tracking. Used for rendering."""
    link = await db.links.find_one({"_id": unique_id})
    if not link:
        raise HTTPException(status_code=404, detail="Link not found")
    pdf = await db.pdfs.find_one({"id": link["pdf_id"]}, {"_id": 0})
    if not pdf:
        raise HTTPException(status_code=410, detail=EXPIRED_ITINERARY_MESSAGE)

    pdf_url = resolve_pdf_url(pdf, request)
    if not pdf_url:
        raise HTTPException(status_code=404, detail="PDF file is missing. Please re-upload the PDF.")

    return {
        "pdf_name": link.get("pdf_name_snapshot") or pdf["file_name"],
        "file_url": f"{str(request.base_url).rstrip('/')}/api/view/{unique_id}/pdf",
    }


@api_router.get("/view/{unique_id}/pdf")
async def get_pdf_file(unique_id: str, request: Request):
    """Serve the linked PDF inline so browsers show it instead of downloading it."""
    link = await db.links.find_one({"_id": unique_id})
    if not link:
        raise HTTPException(status_code=404, detail="Link not found")

    pdf = await db.pdfs.find_one({"id": link["pdf_id"]}, {"_id": 0})
    if not pdf:
        raise HTTPException(status_code=410, detail=EXPIRED_ITINERARY_MESSAGE)

    storage_path = pdf.get("storage_path")
    if storage_path and Path(storage_path).exists():
        return FileResponse(
            storage_path,
            media_type="application/pdf",
            headers=inline_pdf_headers(pdf.get("file_name", "document.pdf")),
        )

    pdf_url = resolve_pdf_url(pdf, request)
    if not pdf_url:
        raise HTTPException(status_code=404, detail="PDF file is missing. Please re-upload the PDF.")

    try:
        upstream = requests.get(pdf_url, stream=True, timeout=60)
        upstream.raise_for_status()
    except Exception as exc:
        logger.error("Error streaming PDF for inline view: %s", exc)
        raise HTTPException(status_code=404, detail="PDF file is missing. Please re-upload the PDF.")

    response_headers = inline_pdf_headers(pdf.get("file_name", "document.pdf"))
    content_length = upstream.headers.get("Content-Length")
    if content_length:
        response_headers["Content-Length"] = content_length

    return StreamingResponse(
        upstream.iter_content(chunk_size=1024 * 64),
        media_type="application/pdf",
        headers=response_headers,
    )

@api_router.post("/view/{unique_id}/track")
async def track_visit(unique_id: str):
    """Track a single visit. Called once per page load."""
    link = await db.links.find_one({"_id": unique_id})
    if not link:
        raise HTTPException(status_code=404, detail="Link not found")
    pdf = await db.pdfs.find_one({"id": link.get("pdf_id")}, {"_id": 0, "id": 1})
    if not pdf:
        raise HTTPException(status_code=410, detail=EXPIRED_ITINERARY_MESSAGE)
    now = datetime.now(timezone.utc).isoformat()
    await db.links.update_one(
        {"_id": unique_id},
        {"$set": {"opened": True, "last_opened_at": now}, "$inc": {"open_count": 1}}
    )
    return {"tracked": True}


@api_router.post("/view/{unique_id}/session/start")
async def start_view_session(unique_id: str, input: ViewSessionStartInput, request: Request):
    link = await db.links.find_one({"_id": unique_id})
    if not link:
        raise HTTPException(status_code=404, detail="Link not found")
    pdf = await db.pdfs.find_one({"id": link.get("pdf_id")}, {"_id": 0, "id": 1})
    if not pdf:
        raise HTTPException(status_code=410, detail=EXPIRED_ITINERARY_MESSAGE)

    session_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    user_agent = request.headers.get("user-agent", "")
    client_ip = get_client_ip(request)
    location = get_location_snapshot(request)
    needs_ip_enrichment = not location.get("city") or not location.get("region")
    if needs_ip_enrichment:
        ip_lookup = await lookup_ip_geolocation(client_ip)
        if ip_lookup.get("label"):
            location = merge_location_data(location, ip_lookup)
    await db.view_sessions.insert_one({
        "_id": session_id,
        "link_id": unique_id,
        "pdf_id": link.get("pdf_id"),
        "user_id": link.get("user_id"),
        "pdf_name_snapshot": link.get("pdf_name_snapshot"),
        "pdf_deleted": bool(link.get("pdf_deleted")),
        "pdf_archived": bool(link.get("pdf_archived")),
        "customer_name": link.get("customer_name"),
        "customer_phone": link.get("customer_phone"),
        "started_at": now,
        "last_seen_at": now,
        "duration_seconds": 0,
        "current_page": 1,
        "total_pages": None,
        "page_durations": {},
        "screen_width": input.screen_width,
        "screen_height": input.screen_height,
        "is_mobile": input.is_mobile,
        "device_type": infer_device_type(user_agent, input.is_mobile),
        "platform": infer_platform(user_agent),
        "browser": infer_browser(user_agent),
        "user_agent": user_agent,
        "ip_address": client_ip,
        "location_city": location.get("city"),
        "location_region": location.get("region"),
        "location_country": location.get("country"),
        "location_label": location.get("label"),
        "location_source": location.get("source"),
        "request_header_snapshot": get_header_snapshot(request),
    })
    return {"session_id": session_id}


@api_router.post("/view/{unique_id}/session/heartbeat")
async def heartbeat_view_session(unique_id: str, input: ViewSessionHeartbeatInput):
    duration = max(0, min(int(input.duration_seconds or 0), 24 * 60 * 60))
    page_durations = normalize_page_durations(input.page_durations)
    update_payload = {
        "duration_seconds": duration,
        "last_seen_at": datetime.now(timezone.utc).isoformat()
    }
    if input.current_page:
        update_payload["current_page"] = max(1, int(input.current_page))
    if input.total_pages:
        update_payload["total_pages"] = max(1, int(input.total_pages))
    if page_durations:
        update_payload["page_durations"] = page_durations
    result = await db.view_sessions.update_one(
        {"_id": input.session_id, "link_id": unique_id},
        {"$set": update_payload}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Session not found")
    return {"tracked": True}

# ---- DASHBOARD STATS ----
@api_router.get("/dashboard/stats")
async def dashboard_stats(request: Request):
    user = await get_current_user(request)
    total_pdfs = await db.pdfs.count_documents({"user_id": user["_id"], "archived": {"$ne": True}, "upload_status": {"$ne": "pending"}})
    total_links = await db.links.count_documents({"user_id": user["_id"]})
    opened_links = await db.links.count_documents({"user_id": user["_id"], "opened": True})
    return {
        "total_pdfs": total_pdfs,
        "total_links": total_links,
        "opened_links": opened_links,
        "unopened_links": total_links - opened_links
    }

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "https://itinerary.travloger.in",
        "https://linkdeck-travloger.vercel.app",
        "https://linkdeck-travloger-duqplmsi0-whois234s-projects.vercel.app"
    ],
    allow_origin_regex=r"https://.*\.vercel\.app",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include router after all routes are defined
app.include_router(api_router)
# Startup
@app.on_event("startup")
async def startup():
    # Create indexes
    await db.users.create_index("email", unique=True)
    await db.pdfs.create_index("id", unique=True)
    await db.links.create_index("user_id")
    await db.pdfs.create_index("user_id")
    # Seed admin
    admin_email = os.environ.get("ADMIN_EMAIL", "admin@travloger.in")
    admin_password = os.environ.get("ADMIN_PASSWORD", "admin123")
    existing = await db.users.find_one({"email": admin_email})
    if existing is None:
        hashed = hash_password(admin_password)
        await db.users.insert_one({
            "email": admin_email,
            "password_hash": hashed,
            "name": "Admin",
            "role": "admin",
            "created_at": datetime.now(timezone.utc).isoformat()
        })
        logger.info(f"Admin user created: {admin_email}")
    else:
        updates = {"role": "admin", "name": existing.get("name") or "Admin"}
        if not verify_password(admin_password, existing["password_hash"]):
            updates["password_hash"] = hash_password(admin_password)
            logger.info("Admin password updated")
        await db.users.update_one({"email": admin_email}, {"$set": updates})
        logger.info(f"Admin user verified: {admin_email}")
    # Init storage
    # Disabled emergent storage (not needed)
admin_email = "admin@travloger.in"
admin_password = "admin123"
logger.info("Skipping external storage init")
# Write test credentials
os.makedirs("memory", exist_ok=True)
with open("memory/test_credentials.md", "w") as f:
        f.write(f"# Test Credentials\n\n")
        f.write(f"## Admin\n- Email: {admin_email}\n- Password: {admin_password}\n- Role: admin\n\n")
        f.write(f"## Auth Endpoints\n- POST /api/auth/register\n- POST /api/auth/login\n- POST /api/auth/logout\n- GET /api/auth/me\n- POST /api/auth/refresh\n\n")
        f.write(f"## PDF Endpoints\n- POST /api/pdfs/upload/initiate\n- POST /api/pdfs/upload/complete\n- GET /api/pdfs\n- DELETE /api/pdfs/{{pdf_id}}\n\n")
        f.write(f"## Link Endpoints\n- POST /api/links\n- GET /api/links\n- DELETE /api/links/{{link_id}}\n\n")
        f.write(f"## View Endpoints\n- GET /api/view/{{unique_id}}\n- GET /api/view/{{unique_id}}/pdf\n\n")
        f.write(f"## Dashboard\n- GET /api/dashboard/stats\n")

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
