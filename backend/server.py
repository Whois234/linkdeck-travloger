from dotenv import load_dotenv
from pathlib import Path
import hashlib
import ipaddress
import logging
import os
import re
import secrets
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
from bson import ObjectId
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


def normalize_contact_phone(phone: str) -> str:
    return "".join(ch for ch in str(phone or "") if ch.isdigit())


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

DEFAULT_MODULE_ACCESS = {
    "dashboard": "edit",
    "pdfs": "edit",
    "contacts": "edit",
    "tripdeck": "edit",
}


def normalize_module_access(value: Optional[dict]) -> dict:
    normalized = dict(DEFAULT_MODULE_ACCESS)
    if isinstance(value, dict):
        for key in DEFAULT_MODULE_ACCESS:
            candidate = value.get(key)
            if candidate in {"none", "view", "edit"}:
                normalized[key] = candidate
    return normalized


def serialize_user_payload(user: dict) -> dict:
    return {
        "id": str(user["_id"]),
        "email": user.get("email", ""),
        "name": user.get("name", ""),
        "role": user.get("role", "user"),
        "active": bool(user.get("active", True)),
        "module_access": normalize_module_access(user.get("module_access")),
    }


async def get_admin_user_ids() -> list[str]:
    admin_docs = await db.users.find({"role": "admin"}, {"_id": 1}).to_list(1000)
    return [str(item["_id"]) for item in admin_docs]


async def get_accessible_pdf_query(user: dict) -> dict:
    base_query = {"archived": {"$ne": True}, "upload_status": {"$ne": "pending"}}
    if user.get("role") == "admin":
        return base_query
    admin_user_ids = await get_admin_user_ids()
    return {
        **base_query,
        "$or": [
            {"user_id": user["_id"]},
            {"user_id": {"$in": admin_user_ids}},
            {"shared_with_users": True},
        ],
    }


async def get_accessible_folder_query(user: dict) -> dict:
    base_query = {"archived": {"$ne": True}}
    if user.get("role") == "admin":
        return base_query
    admin_user_ids = await get_admin_user_ids()
    return {
        **base_query,
        "$or": [
            {"user_id": user["_id"]},
            {"user_id": {"$in": admin_user_ids}},
            {"shared_with_users": True},
        ],
    }



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
        if user.get("active", True) is False:
            raise HTTPException(status_code=403, detail="User is deactivated")
        user["_id"] = str(user["_id"])
        user.pop("password_hash", None)
        user["module_access"] = normalize_module_access(user.get("module_access"))
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
    folder_id: Optional[str] = None

class PdfUploadCompleteInput(BaseModel):
    pdf_id: str

class AdminCreateUserInput(BaseModel):
    email: str
    password: str
    name: str = "User"
    role: str = "user"
    active: bool = True
    module_access: Optional[dict] = None

class AdminResetPasswordInput(BaseModel):
    password: str

class AdminUserUpdateInput(BaseModel):
    name: Optional[str] = None
    role: Optional[str] = None
    active: Optional[bool] = None
    module_access: Optional[dict] = None

class AdminContactUpdateInput(BaseModel):
    customer_name: str
    customer_phone: str

class FolderCreateInput(BaseModel):
    name: str


class FolderUpdateInput(BaseModel):
    name: Optional[str] = None

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

class GateLinkCreateInput(BaseModel):
    pdf_id: str
    gate_schema: list = Field(default_factory=list)

class GateSubmitInput(BaseModel):
    form_data: dict
    screen_width: Optional[int] = None
    screen_height: Optional[int] = None
    is_mobile: Optional[bool] = False

class GateVerifyInput(BaseModel):
    access_token: str

class GateHeartbeatInput(BaseModel):
    access_token: str
    duration_seconds: int

class GateSchemaUpdateInput(BaseModel):
    gate_schema: list

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
        "active": True,
        "module_access": dict(DEFAULT_MODULE_ACCESS),
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    result = await db.users.insert_one(user_doc)
    user_id = str(result.inserted_id)
    access_token = create_access_token(user_id, email)
    refresh_token = create_refresh_token(user_id)
    is_https = "https" in os.environ.get("FRONTEND_URL", "")
    response.set_cookie(key="access_token", value=access_token, httponly=True, secure=is_https, samesite="none", max_age=3600, path="/")
    response.set_cookie(key="refresh_token", value=refresh_token, httponly=True, secure=is_https, samesite="none", max_age=604800, path="/")
    return {**serialize_user_payload({"_id": user_id, **user_doc}), "access_token": access_token}

@api_router.post("/auth/login")
async def login(input: LoginInput, request: Request, response: Response):
    email = input.email.strip().lower()
    user = await db.users.find_one({"email": email})
    if not user:
        raise HTTPException(status_code=401, detail="Invalid email or password")
    if not verify_password(input.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    if user.get("active", True) is False:
        raise HTTPException(status_code=403, detail="User is deactivated")
    user_id = str(user["_id"])
    access_token = create_access_token(user_id, email)
    refresh_token = create_refresh_token(user_id)
    is_https = "https" in os.environ.get("FRONTEND_URL", "")
    response.set_cookie(key="access_token", value=access_token, httponly=True, secure=is_https, samesite="none", max_age=3600, path="/")
    response.set_cookie(key="refresh_token", value=refresh_token, httponly=True, secure=is_https, samesite="none", max_age=604800, path="/")
    return {**serialize_user_payload(user), "access_token": access_token}

@api_router.post("/auth/logout")
async def logout(response: Response):
    response.delete_cookie("access_token", path="/")
    response.delete_cookie("refresh_token", path="/")
    return {"message": "Logged out"}

@api_router.get("/auth/me")
async def get_me(request: Request):
    user = await get_current_user(request)
    return serialize_user_payload(user)

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
            "active": bool(user.get("active", True)),
            "module_access": normalize_module_access(user.get("module_access")),
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

    role = input.role if input.role in {"admin", "user"} else "user"
    user_doc = {
        "email": email,
        "password_hash": hash_password(input.password),
        "name": input.name.strip() or "User",
        "role": role,
        "active": bool(input.active),
        "module_access": normalize_module_access(input.module_access),
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    result = await db.users.insert_one(user_doc)
    return {
        "id": str(result.inserted_id),
        "email": user_doc["email"],
        "name": user_doc["name"],
        "role": user_doc["role"],
        "active": bool(input.active),
        "module_access": normalize_module_access(input.module_access),
        "created_at": user_doc["created_at"],
        "password_status": "Password Set"
    }


@api_router.put("/admin/users/{user_id}")
async def admin_update_user(user_id: str, input: AdminUserUpdateInput, request: Request):
    admin = await get_current_admin(request)
    try:
        object_id = ObjectId(user_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid user ID")

    user = await db.users.find_one({"_id": object_id})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if str(user["_id"]) == admin["_id"] and input.active is False:
        raise HTTPException(status_code=400, detail="You cannot deactivate your own admin account")

    updates = {}
    if input.name is not None:
        updates["name"] = input.name.strip() or user.get("name") or "User"
    if input.role is not None:
        if input.role not in {"admin", "user"}:
            raise HTTPException(status_code=400, detail="Role must be admin or user")
        updates["role"] = input.role
    if input.active is not None:
        updates["active"] = bool(input.active)
    if input.module_access is not None:
        updates["module_access"] = normalize_module_access(input.module_access)

    if updates:
        await db.users.update_one({"_id": object_id}, {"$set": updates})

    updated = await db.users.find_one({"_id": object_id})
    return {
        "id": str(updated["_id"]),
        "email": updated.get("email", ""),
        "name": updated.get("name", ""),
        "role": updated.get("role", "user"),
        "active": bool(updated.get("active", True)),
        "module_access": normalize_module_access(updated.get("module_access")),
        "created_at": updated.get("created_at"),
        "password_status": "Password Set" if updated.get("password_hash") else "No Password",
    }


@api_router.delete("/admin/users/{user_id}")
async def admin_delete_user(user_id: str, request: Request):
    admin = await get_current_admin(request)
    try:
        object_id = ObjectId(user_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid user ID")

    if user_id == admin["_id"]:
        raise HTTPException(status_code=400, detail="You cannot delete your own admin account")

    result = await db.users.delete_one({"_id": object_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="User not found")
    return {"message": "User deleted"}


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


@api_router.get("/admin/contacts")
async def admin_list_contacts(request: Request, search: Optional[str] = None):
    await get_current_admin(request)
    contacts = await db.contacts.find({}).sort("updated_at", -1).to_list(10000)
    users = await db.users.find({}, {"name": 1, "email": 1}).to_list(10000)
    links = await db.links.find({}).to_list(10000)

    user_map = {
        str(user["_id"]): {
            "user_name": user.get("name") or "Unknown User",
            "user_email": user.get("email") or "--",
        }
        for user in users
    }

    contact_stats = {}
    for link in links:
        user_id = link.get("user_id")
        phone_key = normalize_contact_phone(link.get("customer_phone", ""))
        if not phone_key or not user_id:
            continue
        key = (user_id, phone_key)
        created_at = link.get("created_at")
        last_opened_at = link.get("last_opened_at")
        stats = contact_stats.setdefault(key, {
            "total_links": 0,
            "opened_links": 0,
            "total_opens": 0,
            "latest_link_created_at": None,
            "latest_opened_at": None,
            "latest_pdf_name": link.get("pdf_name_snapshot") or "Unknown PDF",
        })
        stats["total_links"] += 1
        if link.get("opened") or int(link.get("open_count") or 0) > 0:
            stats["opened_links"] += 1
        stats["total_opens"] += int(link.get("open_count") or 0)
        if created_at and normalize_datetime(created_at) >= normalize_datetime(stats["latest_link_created_at"]):
            stats["latest_link_created_at"] = created_at
            stats["latest_pdf_name"] = link.get("pdf_name_snapshot") or stats["latest_pdf_name"]
        if last_opened_at and normalize_datetime(last_opened_at) >= normalize_datetime(stats["latest_opened_at"]):
            stats["latest_opened_at"] = last_opened_at

    items = []
    for contact in contacts:
        user_id = contact.get("user_id")
        phone_key = contact.get("contact_phone_normalized") or normalize_contact_phone(contact.get("customer_phone", ""))
        stats = contact_stats.get((user_id, phone_key), {})
        owner = user_map.get(user_id, {"user_name": "Unknown User", "user_email": "--"})
        items.append({
            "id": str(contact.get("_id")),
            "user_id": user_id,
            "user_name": owner["user_name"],
            "user_email": owner["user_email"],
            "customer_name": contact.get("customer_name") or "Unknown Contact",
            "customer_phone": contact.get("customer_phone") or "--",
            "contact_phone_normalized": phone_key,
            "created_at": contact.get("created_at"),
            "updated_at": contact.get("updated_at"),
            "last_link_created_at": contact.get("last_link_created_at") or stats.get("latest_link_created_at"),
            "latest_opened_at": contact.get("latest_opened_at") or stats.get("latest_opened_at"),
            "latest_pdf_name": contact.get("latest_pdf_name") or stats.get("latest_pdf_name"),
            "total_links": stats.get("total_links", 0),
            "opened_links": stats.get("opened_links", 0),
            "total_opens": stats.get("total_opens", 0),
        })
    if search:
        needle = search.strip().lower()
        items = [
            item for item in items
            if needle in (item.get("customer_name") or "").lower()
            or needle in (item.get("customer_phone") or "").lower()
            or needle in (item.get("user_name") or "").lower()
            or needle in (item.get("latest_pdf_name") or "").lower()
        ]
    return items


@api_router.put("/admin/contacts/{contact_id}")
async def admin_update_contact(contact_id: str, input: AdminContactUpdateInput, request: Request):
    await get_current_admin(request)
    customer_name = input.customer_name.strip()
    customer_phone = input.customer_phone.strip()
    normalized_phone = normalize_contact_phone(customer_phone)
    if not customer_name:
        raise HTTPException(status_code=400, detail="Contact name is required")
    if not normalized_phone:
        raise HTTPException(status_code=400, detail="Valid contact phone is required")
    try:
        object_id = ObjectId(contact_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid contact ID")

    existing = await db.contacts.find_one({"_id": object_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Contact not found")

    await db.contacts.update_one(
        {"_id": object_id},
        {"$set": {
            "customer_name": customer_name,
            "customer_phone": customer_phone,
            "contact_phone_normalized": normalized_phone,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }}
    )
    return {"message": "Contact updated"}


@api_router.delete("/admin/contacts/{contact_id}")
async def admin_delete_contact(contact_id: str, request: Request):
    await get_current_admin(request)
    try:
        object_id = ObjectId(contact_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid contact ID")

    result = await db.contacts.delete_one({"_id": object_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Contact not found")
    return {"message": "Contact deleted"}


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
    users = await db.users.find({}, {"name": 1, "email": 1}).to_list(10000)
    pdfs = await db.pdfs.find({}, {"_id": 0, "id": 1, "file_name": 1, "archived": 1, "archived_at": 1, "upload_status": 1, "folder_id": 1, "folder_name": 1}).to_list(10000)
    session_filter = {}
    if days and days > 0:
        session_filter = {"started_at": {"$gte": cutoff}}
    sessions = await db.view_sessions.find(session_filter).to_list(10000)
    pdf_map = {pdf["id"]: pdf.get("file_name", "Unknown PDF") for pdf in pdfs}
    user_map = {
        str(user["_id"]): user.get("name") or user.get("email") or "Unknown User"
        for user in users
    }
    pdf_meta_map = {
        pdf["id"]: {
            "pdf_id": pdf["id"],
            "pdf_name": pdf.get("file_name", "Unknown PDF"),
            "folder_id": pdf.get("folder_id"),
            "folder_name": pdf.get("folder_name"),
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
            sessions_by_pdf[pdf_id] = {
                "pdf_id": pdf_id,
                "pdf_name": pdf_name,
                "folder_id": pdf_meta_map.get(pdf_id, {}).get("folder_id"),
                "folder_name": pdf_meta_map.get(pdf_id, {}).get("folder_name"),
                "sessions": 0,
                "total_time_seconds": 0,
            }
        sessions_by_pdf[pdf_id]["sessions"] += 1
        sessions_by_pdf[pdf_id]["total_time_seconds"] += int(session.get("duration_seconds") or 0)

    active_time_by_pdf = []
    archived_time_by_pdf = {
        pdf_id: {
            "pdf_id": pdf_id,
            "pdf_name": meta["pdf_name"],
            "folder_id": meta.get("folder_id"),
            "folder_name": meta.get("folder_name"),
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
                "folder_id": item.get("folder_id"),
                "folder_name": item.get("folder_name"),
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

    # Include active PDFs that have 0 sessions (e.g. gate-only PDFs never opened via direct links)
    tracked_pdf_ids = {item["pdf_id"] for item in active_time_by_pdf}
    for pdf_id, meta in pdf_meta_map.items():
        if (
            not meta.get("archived")
            and meta.get("upload_status") != "pending"
            and pdf_id not in tracked_pdf_ids
        ):
            active_time_by_pdf.append({
                "pdf_id": pdf_id,
                "pdf_name": meta["pdf_name"],
                "folder_id": meta.get("folder_id"),
                "folder_name": meta.get("folder_name"),
                "sessions": 0,
                "total_time_seconds": 0,
                "avg_time_seconds": 0,
            })

    user_daily_activity = {}
    for link in links:
        created_at = link.get("created_at")
        user_id = link.get("user_id")
        if not created_at or not user_id:
            continue
        try:
            created_dt = datetime.fromisoformat(created_at).astimezone(timezone.utc)
        except Exception:
            continue
        day_label = created_dt.strftime("%d %b")
        activity_key = (created_dt.date().isoformat(), user_id)
        if activity_key not in user_daily_activity:
            user_daily_activity[activity_key] = {
                "date": created_dt.date().isoformat(),
                "date_label": day_label,
                "user_id": user_id,
                "user_name": user_map.get(user_id, "Unknown User"),
                "links_created": 0,
                "opened_links": 0,
                "total_opens": 0,
            }
        user_daily_activity[activity_key]["links_created"] += 1
        if link.get("opened") or int(link.get("open_count") or 0) > 0:
            user_daily_activity[activity_key]["opened_links"] += 1
        user_daily_activity[activity_key]["total_opens"] += int(link.get("open_count") or 0)

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
        "user_daily_activity": sorted(
            user_daily_activity.values(),
            key=lambda item: (item["date"], item["user_name"]),
            reverse=True,
        ),
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


@api_router.get("/folders")
async def list_folders(request: Request, status: Optional[str] = "active"):
    user = await get_current_user(request)
    query = await get_accessible_folder_query(user)
    if status == "archived":
        query["archived"] = True
        query.pop("$or", None) if user.get("role") == "admin" else None
        if user.get("role") != "admin":
            admin_user_ids = await get_admin_user_ids()
            query = {
                "archived": True,
                "$or": [
                    {"user_id": user["_id"]},
                    {"user_id": {"$in": admin_user_ids}},
                    {"shared_with_users": True},
                ],
            }
    elif status != "all":
        query["archived"] = {"$ne": True}
    folders = await db.pdf_folders.find(query, {"_id": 0}).sort("created_at", -1).to_list(1000)
    pdfs = await db.pdfs.find({"upload_status": {"$ne": "pending"}}, {"_id": 0, "id": 1, "folder_id": 1, "archived": 1}).to_list(5000)
    counts = {}
    for pdf in pdfs:
        folder_id = pdf.get("folder_id")
        if not folder_id:
            continue
        bucket = counts.setdefault(folder_id, {"active_pdfs": 0, "archived_pdfs": 0})
        if pdf.get("archived"):
            bucket["archived_pdfs"] += 1
        else:
            bucket["active_pdfs"] += 1
    return [{**folder, **counts.get(folder["id"], {"active_pdfs": 0, "archived_pdfs": 0})} for folder in folders]


@api_router.post("/admin/folders")
async def create_folder(input: FolderCreateInput, request: Request):
    admin = await get_current_admin(request)
    name = (input.name or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Folder name is required")
    now = datetime.now(timezone.utc).isoformat()
    folder = {
        "id": str(uuid.uuid4()),
        "name": name,
        "user_id": admin["_id"],
        "shared_with_users": True,
        "archived": False,
        "archived_at": None,
        "created_at": now,
        "updated_at": now,
    }
    await db.pdf_folders.insert_one(folder)
    return folder


@api_router.put("/admin/folders/{folder_id}")
async def update_folder(folder_id: str, input: FolderUpdateInput, request: Request):
    await get_current_admin(request)
    folder = await db.pdf_folders.find_one({"id": folder_id})
    if not folder:
        raise HTTPException(status_code=404, detail="Folder not found")
    updates = {"updated_at": datetime.now(timezone.utc).isoformat()}
    if input.name is not None:
        name = input.name.strip()
        if not name:
            raise HTTPException(status_code=400, detail="Folder name is required")
        updates["name"] = name
    await db.pdf_folders.update_one({"id": folder_id}, {"$set": updates})
    return {"message": "Folder updated"}


@api_router.delete("/admin/folders/{folder_id}")
async def archive_folder(folder_id: str, request: Request):
    await get_current_admin(request)
    folder = await db.pdf_folders.find_one({"id": folder_id})
    if not folder:
        raise HTTPException(status_code=404, detail="Folder not found")
    archived_at = datetime.now(timezone.utc).isoformat()
    await db.pdf_folders.update_one({"id": folder_id}, {"$set": {"archived": True, "archived_at": archived_at, "updated_at": archived_at}})
    await db.pdfs.update_many({"folder_id": folder_id}, {"$set": {"archived": True, "archived_at": archived_at, "updated_at": archived_at}})
    await db.links.update_many({"folder_id": folder_id}, {"$set": {"folder_archived": True}})
    return {"message": "Folder archived"}


@api_router.post("/admin/folders/{folder_id}/reactivate")
async def reactivate_folder(folder_id: str, request: Request):
    await get_current_admin(request)
    folder = await db.pdf_folders.find_one({"id": folder_id})
    if not folder:
        raise HTTPException(status_code=404, detail="Folder not found")
    now = datetime.now(timezone.utc).isoformat()
    await db.pdf_folders.update_one({"id": folder_id}, {"$set": {"archived": False, "archived_at": None, "updated_at": now}})
    await db.pdfs.update_many({"folder_id": folder_id}, {"$set": {"archived": False, "archived_at": None, "updated_at": now}})
    return {"message": "Folder reactivated"}


@api_router.delete("/admin/folders/{folder_id}/permanent")
async def permanently_delete_folder(folder_id: str, request: Request):
    await get_current_admin(request)
    folder = await db.pdf_folders.find_one({"id": folder_id})
    if not folder:
        raise HTTPException(status_code=404, detail="Folder not found")
    await db.pdf_folders.delete_one({"id": folder_id})
    await db.pdfs.update_many({"folder_id": folder_id}, {"$unset": {"folder_id": "", "folder_name": ""}, "$set": {"updated_at": datetime.now(timezone.utc).isoformat()}})
    return {"message": "Folder permanently deleted"}

# ---- PDF ENDPOINTS ----
UPLOAD_DIR = ROOT_DIR / "uploads"
UPLOAD_DIR.mkdir(exist_ok=True)


@api_router.post("/pdfs/upload/initiate")
async def initiate_pdf_upload(input: PdfUploadInitiateInput, request: Request):
    user = await get_current_user(request)
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Only admins can upload PDFs")
    if not s3_ready():
        raise HTTPException(status_code=503, detail="S3 storage is not configured")

    validate_pdf_upload(input.file_name, input.file_size, input.content_type)
    folder = None
    if input.folder_id:
        folder = await db.pdf_folders.find_one({"id": input.folder_id, "archived": {"$ne": True}})
        if not folder:
            raise HTTPException(status_code=404, detail="Folder not found")

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
        "folder_id": folder.get("id") if folder else None,
        "folder_name": folder.get("name") if folder else None,
        "managed_by_admin": True,
        "shared_with_users": True,
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
        "folder_id": pdf.get("folder_id"),
        "folder_name": pdf.get("folder_name"),
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
    query = await get_accessible_pdf_query(user)
    pdfs = await db.pdfs.find(query, {"_id": 0}).sort("created_at", -1).to_list(1000)
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
    accessible_query = await get_accessible_pdf_query(user)
    pdf = await db.pdfs.find_one({"id": input.pdf_id, **accessible_query})
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
        "folder_id": pdf.get("folder_id"),
        "folder_name": pdf.get("folder_name"),
        "pdf_deleted": False,
        "pdf_archived": bool(pdf.get("archived")),
        "opened": False,
        "open_count": 0,
        "last_opened_at": None,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.links.insert_one(link_doc)
    normalized_phone = normalize_contact_phone(input.customer_phone)
    if normalized_phone:
        await db.contacts.update_one(
            {"user_id": user["_id"], "contact_phone_normalized": normalized_phone},
            {
                "$set": {
                    "customer_name": input.customer_name.strip(),
                    "customer_phone": input.customer_phone.strip(),
                    "contact_phone_normalized": normalized_phone,
                    "updated_at": link_doc["created_at"],
                    "last_link_created_at": link_doc["created_at"],
                    "latest_pdf_id": input.pdf_id,
                    "latest_pdf_name": pdf.get("file_name", "Unknown PDF"),
                },
                "$setOnInsert": {
                    "created_at": link_doc["created_at"],
                },
            },
            upsert=True,
        )
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


@api_router.get("/contacts")
async def list_contacts(request: Request):
    user = await get_current_user(request)
    contacts = await db.contacts.find({"user_id": user["_id"]}).sort("updated_at", -1).to_list(10000)
    links = await db.links.find({"user_id": user["_id"]}).to_list(10000)

    contact_stats = {}
    for link in links:
        phone_key = normalize_contact_phone(link.get("customer_phone", ""))
        if not phone_key:
            continue
        created_at = link.get("created_at")
        last_opened_at = link.get("last_opened_at")
        stats = contact_stats.setdefault(phone_key, {
            "total_links": 0,
            "opened_links": 0,
            "total_opens": 0,
            "latest_link_created_at": None,
            "latest_opened_at": None,
            "latest_pdf_name": link.get("pdf_name_snapshot") or "Unknown PDF",
        })
        stats["total_links"] += 1
        if link.get("opened") or int(link.get("open_count") or 0) > 0:
            stats["opened_links"] += 1
        stats["total_opens"] += int(link.get("open_count") or 0)
        if created_at and normalize_datetime(created_at) >= normalize_datetime(stats["latest_link_created_at"]):
            stats["latest_link_created_at"] = created_at
            stats["latest_pdf_name"] = link.get("pdf_name_snapshot") or stats["latest_pdf_name"]
        if last_opened_at and normalize_datetime(last_opened_at) >= normalize_datetime(stats["latest_opened_at"]):
            stats["latest_opened_at"] = last_opened_at

    items = []
    for contact in contacts:
        phone_key = contact.get("contact_phone_normalized") or normalize_contact_phone(contact.get("customer_phone", ""))
        stats = contact_stats.get(phone_key, {})
        items.append({
            "id": str(contact.get("_id")),
            "customer_name": contact.get("customer_name") or "Unknown Contact",
            "customer_phone": contact.get("customer_phone") or "--",
            "contact_phone_normalized": phone_key,
            "created_at": contact.get("created_at"),
            "updated_at": contact.get("updated_at"),
            "last_link_created_at": contact.get("last_link_created_at") or stats.get("latest_link_created_at"),
            "latest_opened_at": stats.get("latest_opened_at"),
            "latest_pdf_name": contact.get("latest_pdf_name") or stats.get("latest_pdf_name"),
            "total_links": stats.get("total_links", 0),
            "opened_links": stats.get("opened_links", 0),
            "total_opens": stats.get("total_opens", 0),
        })

    return items

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

# ---- GATE (TRIPDECK LEAD CAPTURE) ----

@api_router.get("/view/{unique_id}/gate")
async def get_gate_config(unique_id: str):
    link = await db.links.find_one({"_id": unique_id})
    if not link:
        raise HTTPException(status_code=404, detail="Link not found")
    if not link.get("gate_enabled"):
        return {"enabled": False}
    return {
        "enabled": True,
        "schema": link.get("gate_schema", []),
        "pdf_name": link.get("pdf_name_snapshot", ""),
    }


@api_router.post("/view/{unique_id}/gate/submit")
async def submit_gate_form(unique_id: str, input: GateSubmitInput, request: Request):
    link = await db.links.find_one({"_id": unique_id})
    if not link:
        raise HTTPException(status_code=404, detail="Link not found")
    if not link.get("gate_enabled"):
        raise HTTPException(status_code=400, detail="Gate not enabled for this link")
    pdf = await db.pdfs.find_one({"id": link.get("pdf_id")})
    if not pdf:
        raise HTTPException(status_code=410, detail="PDF no longer available")

    user_agent = request.headers.get("user-agent", "")
    client_ip = get_client_ip(request)
    location = get_location_snapshot(request)
    if not location.get("city") or not location.get("region"):
        ip_lookup = await lookup_ip_geolocation(client_ip)
        if ip_lookup.get("label"):
            location = merge_location_data(location, ip_lookup)

    access_token = str(uuid.uuid4())
    device_fingerprint = hashlib.md5(f"{client_ip}:{user_agent}".encode()).hexdigest()
    now = datetime.now(timezone.utc).isoformat()

    await db.gate_submissions.insert_one({
        "link_id": unique_id,
        "user_id": link.get("user_id"),
        "form_data": input.form_data,
        "access_token": access_token,
        "device_fingerprint": device_fingerprint,
        "ip_address": client_ip,
        "device_type": infer_device_type(user_agent, input.is_mobile or False),
        "browser": infer_browser(user_agent),
        "os": infer_platform(user_agent),
        "city": location.get("city"),
        "region": location.get("region"),
        "country": location.get("country"),
        "location_label": location.get("label"),
        "submitted_at": now,
        "last_seen_at": now,
        "time_spent_seconds": 0,
    })
    return {"access_token": access_token}


@api_router.post("/view/{unique_id}/gate/verify")
async def verify_gate_access(unique_id: str, input: GateVerifyInput):
    link = await db.links.find_one({"_id": unique_id})
    if not link or not link.get("gate_enabled"):
        return {"valid": True}
    sub = await db.gate_submissions.find_one(
        {"link_id": unique_id, "access_token": input.access_token}
    )
    return {"valid": bool(sub)}


@api_router.post("/view/{unique_id}/gate/heartbeat")
async def gate_heartbeat(unique_id: str, input: GateHeartbeatInput):
    duration = max(0, min(int(input.duration_seconds or 0), 24 * 60 * 60))
    await db.gate_submissions.update_one(
        {"link_id": unique_id, "access_token": input.access_token},
        {"$set": {
            "time_spent_seconds": duration,
            "last_seen_at": datetime.now(timezone.utc).isoformat(),
        }},
    )
    return {"tracked": True}


@api_router.get("/links/{link_id}/gate-submissions")
async def get_gate_submissions(link_id: str, request: Request):
    user = await get_current_user(request)
    link = await db.links.find_one({"_id": link_id, "user_id": user["_id"]})
    if not link:
        raise HTTPException(status_code=404, detail="Link not found")
    subs = await db.gate_submissions.find({"link_id": link_id}).sort("submitted_at", -1).to_list(1000)
    return [
        {
            "id": str(s["_id"]),
            "form_data": s.get("form_data", {}),
            "ip_address": s.get("ip_address"),
            "device_type": s.get("device_type"),
            "browser": s.get("browser"),
            "os": s.get("os"),
            "location_label": s.get("location_label"),
            "city": s.get("city"),
            "region": s.get("region"),
            "country": s.get("country"),
            "submitted_at": s.get("submitted_at"),
            "time_spent_seconds": s.get("time_spent_seconds", 0),
        }
        for s in subs
    ]


@api_router.patch("/links/{link_id}/gate")
async def update_gate_schema(link_id: str, input: GateSchemaUpdateInput, request: Request):
    user = await get_current_user(request)
    link = await db.links.find_one({"_id": link_id, "user_id": user["_id"]})
    if not link:
        raise HTTPException(status_code=404, detail="Link not found")
    await db.links.update_one({"_id": link_id}, {"$set": {"gate_schema": input.gate_schema}})
    return {"message": "Gate schema updated"}


@api_router.patch("/links/{link_id}/archive")
async def toggle_gate_link_archive(link_id: str, request: Request):
    user = await get_current_user(request)
    link = await db.links.find_one({"_id": link_id, "user_id": user["_id"]})
    if not link:
        raise HTTPException(status_code=404, detail="Link not found")
    new_status = not bool(link.get("gate_archived"))
    await db.links.update_one({"_id": link_id}, {"$set": {"gate_archived": new_status}})
    return {"archived": new_status}


@api_router.get("/gate-links")
async def list_gate_links(request: Request):
    user = await get_current_user(request)
    links = await db.links.find(
        {"user_id": user["_id"], "gate_enabled": True}
    ).sort("created_at", -1).to_list(1000)
    result = []
    for link in links:
        link_id = link["_id"]
        submission_count = await db.gate_submissions.count_documents({"link_id": link_id})
        result.append({
            "_id": link_id,
            "pdf_name": link.get("pdf_name_snapshot", "Unknown PDF"),
            "pdf_id": link.get("pdf_id"),
            "gate_schema": link.get("gate_schema", []),
            "submission_count": submission_count,
            "open_count": link.get("open_count", 0),
            "created_at": link.get("created_at"),
            "gate_archived": bool(link.get("gate_archived")),
        })
    return result


@api_router.get("/gate-links/{link_id}")
async def get_gate_link(link_id: str, request: Request):
    user = await get_current_user(request)
    link = await db.links.find_one({"_id": link_id, "user_id": user["_id"], "gate_enabled": True})
    if not link:
        raise HTTPException(status_code=404, detail="Link not found")
    submission_count = await db.gate_submissions.count_documents({"link_id": link_id})
    return {
        "_id": link_id,
        "pdf_name": link.get("pdf_name_snapshot", "Unknown PDF"),
        "pdf_id": link.get("pdf_id"),
        "gate_schema": link.get("gate_schema", []),
        "submission_count": submission_count,
        "open_count": link.get("open_count", 0),
        "created_at": link.get("created_at"),
        "gate_archived": bool(link.get("gate_archived")),
    }


@api_router.post("/gate-links")
async def create_gate_link(input: GateLinkCreateInput, request: Request):
    user = await get_current_user(request)
    accessible_query = await get_accessible_pdf_query(user)
    pdf = await db.pdfs.find_one({"id": input.pdf_id, **accessible_query})
    if not pdf:
        raise HTTPException(status_code=404, detail="PDF not found")
    if pdf.get("archived"):
        raise HTTPException(status_code=400, detail="Archived PDFs cannot be used for gate links")
    unique_id = str(uuid.uuid4())[:8]
    now = datetime.now(timezone.utc).isoformat()
    link_doc = {
        "_id": unique_id,
        "pdf_id": input.pdf_id,
        "user_id": user["_id"],
        "customer_name": "",
        "customer_phone": "",
        "pdf_name_snapshot": pdf.get("file_name", "Unknown PDF"),
        "folder_id": pdf.get("folder_id"),
        "folder_name": pdf.get("folder_name"),
        "pdf_deleted": False,
        "pdf_archived": bool(pdf.get("archived")),
        "opened": False,
        "open_count": 0,
        "last_opened_at": None,
        "gate_enabled": True,
        "gate_schema": input.gate_schema,
        "created_at": now,
    }
    await db.links.insert_one(link_doc)
    return {
        "_id": unique_id,
        "pdf_name": pdf["file_name"],
        "pdf_id": input.pdf_id,
        "gate_schema": input.gate_schema,
        "submission_count": 0,
        "open_count": 0,
        "created_at": now,
        "url": f"/view/{unique_id}",
    }


@api_router.get("/leads")
async def get_leads(request: Request):
    """Return all unique leads (deduplicated by phone+email) across all gate links."""
    user = await get_current_user(request)

    links = await db.links.find(
        {"user_id": user["_id"], "gate_enabled": True}
    ).to_list(1000)

    if not links:
        return []

    link_map = {link["_id"]: link for link in links}
    link_ids = list(link_map.keys())

    all_subs = await db.gate_submissions.find(
        {"link_id": {"$in": link_ids}}
    ).sort("submitted_at", -1).to_list(10000)

    leads_map: dict = {}

    for sub in all_subs:
        link = link_map.get(sub.get("link_id"), {})
        gate_schema = link.get("gate_schema", [])
        form_data = sub.get("form_data", {})

        phone_val = None
        email_val = None
        name_val = None

        for field in gate_schema:
            label = field.get("label", "")
            val = (form_data.get(label) or "").strip()
            ftype = field.get("field_type", "text")
            if ftype == "phone" and val and not phone_val:
                phone_val = val
            elif ftype == "email" and val and not email_val:
                email_val = val.lower()
            elif ftype in ("text",) and val and not name_val:
                name_val = val

        id_parts = []
        if phone_val:
            id_parts.append(f"p:{phone_val}")
        if email_val:
            id_parts.append(f"e:{email_val}")
        if not id_parts:
            id_parts = [f"{k}:{v}" for k, v in sorted(form_data.items()) if v]
        identity_key = "|".join(sorted(id_parts)) if id_parts else f"anon:{str(sub['_id'])}"

        session = {
            "id": str(sub["_id"]),
            "link_id": sub.get("link_id"),
            "pdf_name": link.get("pdf_name_snapshot", "Unknown PDF"),
            "submitted_at": sub.get("submitted_at"),
            "device_type": sub.get("device_type"),
            "browser": sub.get("browser"),
            "os": sub.get("os"),
            "location_label": sub.get("location_label"),
            "time_spent_seconds": sub.get("time_spent_seconds", 0),
            "form_data": form_data,
        }

        if identity_key not in leads_map:
            leads_map[identity_key] = {
                "identity_key": identity_key,
                "name": name_val or "Unknown",
                "phone": phone_val,
                "email": email_val,
                "last_seen": sub.get("submitted_at"),
                "first_seen": sub.get("submitted_at"),
                "sessions": [],
                "pdfs_accessed": [],
            }

        lead = leads_map[identity_key]
        lead["sessions"].append(session)

        if name_val and lead["name"] == "Unknown":
            lead["name"] = name_val
        if phone_val and not lead["phone"]:
            lead["phone"] = phone_val
        if email_val and not lead["email"]:
            lead["email"] = email_val

        pdf_name = link.get("pdf_name_snapshot", "Unknown PDF")
        if pdf_name not in lead["pdfs_accessed"]:
            lead["pdfs_accessed"].append(pdf_name)

        sub_at = sub.get("submitted_at")
        if sub_at and lead["first_seen"] and sub_at < lead["first_seen"]:
            lead["first_seen"] = sub_at

    result = []
    for lead in leads_map.values():
        result.append({
            "identity_key": lead["identity_key"],
            "name": lead["name"],
            "phone": lead["phone"],
            "email": lead["email"],
            "first_seen": lead["first_seen"],
            "last_seen": lead["last_seen"],
            "session_count": len(lead["sessions"]),
            "pdfs_accessed": lead["pdfs_accessed"],
            "sessions": lead["sessions"],
        })

    result.sort(key=lambda l: l.get("last_seen") or "", reverse=True)
    return result


class DeleteLeadInput(BaseModel):
    session_ids: list


@api_router.delete("/leads")
async def delete_lead(input: DeleteLeadInput, request: Request):
    """Delete all gate submissions for a given lead (by session IDs)."""
    user = await get_current_user(request)
    if not input.session_ids:
        raise HTTPException(status_code=400, detail="No session IDs provided")

    link_ids = [
        link["_id"]
        for link in await db.links.find(
            {"user_id": user["_id"], "gate_enabled": True}, {"_id": 1}
        ).to_list(1000)
    ]

    valid_ids = [ObjectId(sid) for sid in input.session_ids if ObjectId.is_valid(sid)]
    result = await db.gate_submissions.delete_many({
        "_id": {"$in": valid_ids},
        "link_id": {"$in": link_ids},
    })
    return {"deleted": result.deleted_count}


@api_router.get("/gate-analytics")
async def get_gate_analytics(request: Request):
    """Return aggregated analytics across all gate links for the user."""
    user = await get_current_user(request)

    links = await db.links.find(
        {"user_id": user["_id"], "gate_enabled": True}
    ).to_list(1000)

    if not links:
        return {
            "total_submissions": 0, "total_opens": 0, "total_links": 0,
            "pdfs": [], "regions": [], "countries": [], "devices": [],
            "os": [], "browsers": [], "hourly": [], "day_of_week": [],
            "daily_trend": [], "avg_time_spent": 0,
        }

    link_map = {link["_id"]: link for link in links}
    link_ids = list(link_map.keys())

    all_subs = await db.gate_submissions.find(
        {"link_id": {"$in": link_ids}}
    ).to_list(10000)

    total_submissions = len(all_subs)
    total_opens = sum(link.get("open_count", 0) for link in links)

    pdf_stats: dict = {}
    country_stats: dict = {}
    city_stats: dict = {}
    device_stats: dict = {}
    os_stats: dict = {}
    browser_stats: dict = {}
    hour_stats: dict = {str(h): 0 for h in range(24)}
    dow_stats: dict = {str(d): 0 for d in range(7)}
    daily_stats: dict = {}
    total_time = 0

    DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]

    for sub in all_subs:
        link = link_map.get(sub.get("link_id"), {})
        pdf_name = link.get("pdf_name_snapshot", "Unknown PDF")

        if pdf_name not in pdf_stats:
            pdf_stats[pdf_name] = {
                "name": pdf_name,
                "submissions": 0,
                "opens": link.get("open_count", 0),
                "total_time": 0,
            }
        pdf_stats[pdf_name]["submissions"] += 1
        pdf_stats[pdf_name]["total_time"] += sub.get("time_spent_seconds", 0)

        country = (sub.get("country") or "Unknown").strip() or "Unknown"
        country_stats[country] = country_stats.get(country, 0) + 1

        city_raw = sub.get("city") or ""
        region_raw = sub.get("region") or ""
        city_label = ", ".join(filter(None, [city_raw, region_raw])) or "Unknown"
        city_stats[city_label] = city_stats.get(city_label, 0) + 1

        device = (sub.get("device_type") or "Unknown").strip()
        device_stats[device] = device_stats.get(device, 0) + 1

        os_name = (sub.get("os") or "Unknown").strip()
        os_stats[os_name] = os_stats.get(os_name, 0) + 1

        browser = (sub.get("browser") or "Unknown").strip()
        browser_stats[browser] = browser_stats.get(browser, 0) + 1

        time_spent = sub.get("time_spent_seconds", 0) or 0
        total_time += time_spent

        submitted_at = sub.get("submitted_at")
        if submitted_at:
            try:
                dt = datetime.fromisoformat(submitted_at.replace("Z", "+00:00"))
                hour_stats[str(dt.hour)] = hour_stats.get(str(dt.hour), 0) + 1
                dow_stats[str(dt.weekday())] = dow_stats.get(str(dt.weekday()), 0) + 1
                day_str = dt.strftime("%Y-%m-%d")
                daily_stats[day_str] = daily_stats.get(day_str, 0) + 1
            except Exception:
                pass

    for p in pdf_stats.values():
        p["avg_time"] = round(p["total_time"] / p["submissions"]) if p["submissions"] else 0

    return {
        "total_submissions": total_submissions,
        "total_opens": total_opens,
        "total_links": len(links),
        "avg_time_spent": round(total_time / total_submissions) if total_submissions else 0,
        "pdfs": sorted(pdf_stats.values(), key=lambda x: x["submissions"], reverse=True),
        "countries": sorted(
            [{"name": k, "count": v} for k, v in country_stats.items()],
            key=lambda x: x["count"], reverse=True
        )[:15],
        "cities": sorted(
            [{"name": k, "count": v} for k, v in city_stats.items()],
            key=lambda x: x["count"], reverse=True
        )[:15],
        "devices": [{"name": k, "count": v} for k, v in device_stats.items()],
        "os": sorted(
            [{"name": k, "count": v} for k, v in os_stats.items()],
            key=lambda x: x["count"], reverse=True
        ),
        "browsers": sorted(
            [{"name": k, "count": v} for k, v in browser_stats.items()],
            key=lambda x: x["count"], reverse=True
        ),
        "hourly": [{"hour": h, "label": f"{h:02d}:00", "count": hour_stats.get(str(h), 0)} for h in range(24)],
        "day_of_week": [{"day": d, "label": DAY_NAMES[d], "count": dow_stats.get(str(d), 0)} for d in range(7)],
        "daily_trend": sorted(
            [{"date": k, "count": v} for k, v in daily_stats.items()],
            key=lambda x: x["date"]
        )[-30:],
    }


# ---- DASHBOARD STATS ----
@api_router.get("/dashboard/stats")
async def dashboard_stats(request: Request):
    user = await get_current_user(request)
    total_pdfs = await db.pdfs.count_documents(await get_accessible_pdf_query(user))
    total_links = await db.links.count_documents({"user_id": user["_id"]})
    opened_links = await db.links.count_documents({"user_id": user["_id"], "opened": True})
    return {
        "total_pdfs": total_pdfs,
        "total_links": total_links,
        "opened_links": opened_links,
        "unopened_links": total_links - opened_links
    }

# ---- TRIPDECK — HELPERS ----

def _slugify(text: str) -> str:
    slug = text.lower().strip()
    slug = re.sub(r"[^\w\s-]", "", slug)
    slug = re.sub(r"[\s_]+", "-", slug)
    slug = re.sub(r"-+", "-", slug)
    return slug.strip("-") or "tripdeck"


async def _make_unique_slug(title: str) -> str:
    base = _slugify(title)
    for _ in range(10):
        suffix = secrets.token_hex(3)
        candidate = f"{base}-{suffix}"
        if not await db.tripdecks.find_one({"slug": candidate}):
            return candidate
    return f"td-{secrets.token_hex(6)}"


def _serialize(doc: dict) -> dict:
    if not isinstance(doc, dict):
        return doc
    out = {}
    for k, v in doc.items():
        if isinstance(v, ObjectId):
            out[k] = str(v)
        elif isinstance(v, list):
            out[k] = [
                _serialize(item) if isinstance(item, dict) else (str(item) if isinstance(item, ObjectId) else item)
                for item in v
            ]
        elif isinstance(v, dict):
            out[k] = _serialize(v)
        else:
            out[k] = v
    return out


def _serialize_response(r: dict) -> dict:
    s = _serialize(r)
    s.pop("pdf_access_token", None)
    s.pop("pdf_access_token_expires_at", None)
    return s


# ---- TRIPDECK PYDANTIC MODELS ----

class DestinationInput(BaseModel):
    name: str
    duration: str
    hero_image_url: str
    pdf_id: str
    form_schema_id: str
    order: int = 0


class TripDeckCreateInput(BaseModel):
    title: str
    description: Optional[str] = None


class TripDeckUpdateInput(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None


class DestinationUpdateInput(BaseModel):
    name: Optional[str] = None
    duration: Optional[str] = None
    hero_image_url: Optional[str] = None
    pdf_id: Optional[str] = None
    form_schema_id: Optional[str] = None
    order: Optional[int] = None


class ReorderInput(BaseModel):
    destination_ids: list[str]


class FormFieldInput(BaseModel):
    label: str
    field_type: str
    placeholder: Optional[str] = None
    options: list[str] = Field(default_factory=list)
    is_required: bool = True
    order: int = 0


class FormSchemaCreateInput(BaseModel):
    name: str
    fields: list[FormFieldInput] = Field(default_factory=list)


class FormSchemaUpdateInput(BaseModel):
    name: Optional[str] = None
    fields: Optional[list[FormFieldInput]] = None


class FormSubmitInput(BaseModel):
    responses: dict
    customer_name: str
    customer_phone: str
    customer_email: Optional[str] = None


# ---- TRIPDECK CRUD ----

@api_router.post("/tripdeck")
async def create_tripdeck(input: TripDeckCreateInput, request: Request):
    user = await get_current_user(request)
    if not input.title or not input.title.strip():
        raise HTTPException(status_code=400, detail="TripDeck title is required")
    now = datetime.now(timezone.utc).isoformat()
    slug = await _make_unique_slug(input.title)
    doc = {
        "user_id": user["_id"],
        "title": input.title.strip(),
        "description": (input.description or "").strip() or None,
        "slug": slug,
        "status": "active",
        "destinations": [],
        "total_opens": 0,
        "created_at": now,
        "updated_at": now,
    }
    result = await db.tripdecks.insert_one(doc)
    doc["_id"] = result.inserted_id
    return _serialize(doc)


@api_router.get("/tripdeck")
async def list_tripdecks(request: Request):
    user = await get_current_user(request)
    docs = await db.tripdecks.find({"user_id": user["_id"]}).sort("created_at", -1).to_list(1000)
    result = []
    for doc in docs:
        serialized = _serialize(doc)
        tripdeck_id = str(doc["_id"])
        serialized["form_response_count"] = await db.form_responses.count_documents({"tripdeck_id": tripdeck_id})
        serialized["destination_count"] = len(doc.get("destinations", []))
        result.append(serialized)
    return result


@api_router.get("/tripdeck/{tripdeck_id}")
async def get_tripdeck(tripdeck_id: str, request: Request):
    user = await get_current_user(request)
    try:
        oid = ObjectId(tripdeck_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid TripDeck ID")
    doc = await db.tripdecks.find_one({"_id": oid, "user_id": user["_id"]})
    if not doc:
        raise HTTPException(status_code=404, detail="TripDeck not found")
    serialized = _serialize(doc)
    serialized["form_response_count"] = await db.form_responses.count_documents({"tripdeck_id": tripdeck_id})
    return serialized


@api_router.put("/tripdeck/{tripdeck_id}")
async def update_tripdeck(tripdeck_id: str, input: TripDeckUpdateInput, request: Request):
    user = await get_current_user(request)
    try:
        oid = ObjectId(tripdeck_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid TripDeck ID")
    doc = await db.tripdecks.find_one({"_id": oid, "user_id": user["_id"]})
    if not doc:
        raise HTTPException(status_code=404, detail="TripDeck not found")
    updates = {"updated_at": datetime.now(timezone.utc).isoformat()}
    if input.title is not None:
        if not input.title.strip():
            raise HTTPException(status_code=400, detail="Title cannot be empty")
        updates["title"] = input.title.strip()
    if input.description is not None:
        updates["description"] = input.description.strip() or None
    if input.status is not None:
        if input.status not in {"active", "archived"}:
            raise HTTPException(status_code=400, detail="Status must be 'active' or 'archived'")
        updates["status"] = input.status
    await db.tripdecks.update_one({"_id": oid}, {"$set": updates})
    updated = await db.tripdecks.find_one({"_id": oid})
    return _serialize(updated)


@api_router.delete("/tripdeck/{tripdeck_id}")
async def delete_tripdeck(tripdeck_id: str, request: Request):
    user = await get_current_user(request)
    try:
        oid = ObjectId(tripdeck_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid TripDeck ID")
    doc = await db.tripdecks.find_one({"_id": oid, "user_id": user["_id"]})
    if not doc:
        raise HTTPException(status_code=404, detail="TripDeck not found")
    await db.tripdecks.delete_one({"_id": oid})
    await db.form_responses.delete_many({"tripdeck_id": tripdeck_id})
    return {"message": "TripDeck deleted"}


# ---- DESTINATION MANAGEMENT ----

@api_router.post("/tripdeck/{tripdeck_id}/destination")
async def add_destination(tripdeck_id: str, input: DestinationInput, request: Request):
    user = await get_current_user(request)
    try:
        oid = ObjectId(tripdeck_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid TripDeck ID")
    doc = await db.tripdecks.find_one({"_id": oid, "user_id": user["_id"]})
    if not doc:
        raise HTTPException(status_code=404, detail="TripDeck not found")
    pdf = await db.pdfs.find_one({"id": input.pdf_id, "user_id": user["_id"], "upload_status": {"$ne": "pending"}})
    if not pdf:
        raise HTTPException(status_code=404, detail="PDF not found")
    try:
        schema_oid = ObjectId(input.form_schema_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid form schema ID")
    schema = await db.form_schemas.find_one({"_id": schema_oid, "user_id": user["_id"]})
    if not schema:
        raise HTTPException(status_code=404, detail="Form schema not found")
    dest = {
        "_id": ObjectId(),
        "name": input.name.strip(),
        "duration": input.duration.strip(),
        "hero_image_url": input.hero_image_url.strip(),
        "pdf_id": input.pdf_id,
        "form_schema_id": input.form_schema_id,
        "order": input.order,
    }
    now = datetime.now(timezone.utc).isoformat()
    await db.tripdecks.update_one(
        {"_id": oid},
        {"$push": {"destinations": dest}, "$set": {"updated_at": now}}
    )
    return _serialize(dest)


@api_router.put("/tripdeck/{tripdeck_id}/destination/{dest_id}")
async def update_destination(tripdeck_id: str, dest_id: str, input: DestinationUpdateInput, request: Request):
    user = await get_current_user(request)
    try:
        oid = ObjectId(tripdeck_id)
        dest_oid = ObjectId(dest_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid ID")
    doc = await db.tripdecks.find_one({"_id": oid, "user_id": user["_id"]})
    if not doc:
        raise HTTPException(status_code=404, detail="TripDeck not found")
    dest = next((d for d in doc.get("destinations", []) if d.get("_id") == dest_oid), None)
    if not dest:
        raise HTTPException(status_code=404, detail="Destination not found")
    update_fields: dict = {}
    if input.name is not None:
        update_fields["destinations.$.name"] = input.name.strip()
    if input.duration is not None:
        update_fields["destinations.$.duration"] = input.duration.strip()
    if input.hero_image_url is not None:
        update_fields["destinations.$.hero_image_url"] = input.hero_image_url.strip()
    if input.pdf_id is not None:
        pdf = await db.pdfs.find_one({"id": input.pdf_id, "user_id": user["_id"], "upload_status": {"$ne": "pending"}})
        if not pdf:
            raise HTTPException(status_code=404, detail="PDF not found")
        update_fields["destinations.$.pdf_id"] = input.pdf_id
    if input.form_schema_id is not None:
        try:
            schema_oid = ObjectId(input.form_schema_id)
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid form schema ID")
        schema = await db.form_schemas.find_one({"_id": schema_oid, "user_id": user["_id"]})
        if not schema:
            raise HTTPException(status_code=404, detail="Form schema not found")
        update_fields["destinations.$.form_schema_id"] = input.form_schema_id
    if input.order is not None:
        update_fields["destinations.$.order"] = input.order
    if update_fields:
        update_fields["updated_at"] = datetime.now(timezone.utc).isoformat()
        await db.tripdecks.update_one(
            {"_id": oid, "destinations._id": dest_oid},
            {"$set": update_fields}
        )
    updated = await db.tripdecks.find_one({"_id": oid})
    updated_dest = next((d for d in updated.get("destinations", []) if d.get("_id") == dest_oid), None)
    return _serialize(updated_dest) if updated_dest else {}


@api_router.delete("/tripdeck/{tripdeck_id}/destination/{dest_id}")
async def remove_destination(tripdeck_id: str, dest_id: str, request: Request):
    user = await get_current_user(request)
    try:
        oid = ObjectId(tripdeck_id)
        dest_oid = ObjectId(dest_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid ID")
    doc = await db.tripdecks.find_one({"_id": oid, "user_id": user["_id"]})
    if not doc:
        raise HTTPException(status_code=404, detail="TripDeck not found")
    now = datetime.now(timezone.utc).isoformat()
    await db.tripdecks.update_one(
        {"_id": oid},
        {"$pull": {"destinations": {"_id": dest_oid}}, "$set": {"updated_at": now}}
    )
    return {"message": "Destination removed"}


@api_router.put("/tripdeck/{tripdeck_id}/destinations/reorder")
async def reorder_destinations(tripdeck_id: str, input: ReorderInput, request: Request):
    user = await get_current_user(request)
    try:
        oid = ObjectId(tripdeck_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid TripDeck ID")
    doc = await db.tripdecks.find_one({"_id": oid, "user_id": user["_id"]})
    if not doc:
        raise HTTPException(status_code=404, detail="TripDeck not found")
    dest_map = {str(d["_id"]): d for d in doc.get("destinations", [])}
    reordered = []
    for idx, dest_id_str in enumerate(input.destination_ids):
        if dest_id_str not in dest_map:
            raise HTTPException(status_code=400, detail=f"Destination {dest_id_str} not found in this TripDeck")
        dest = dict(dest_map[dest_id_str])
        dest["order"] = idx
        reordered.append(dest)
    now = datetime.now(timezone.utc).isoformat()
    await db.tripdecks.update_one(
        {"_id": oid},
        {"$set": {"destinations": reordered, "updated_at": now}}
    )
    return _serialize({"destinations": reordered})


# ---- FORM SCHEMA CRUD ----

_VALID_FIELD_TYPES = {"text", "phone", "email", "dropdown", "date", "number"}


@api_router.post("/form-schema")
async def create_form_schema(input: FormSchemaCreateInput, request: Request):
    user = await get_current_user(request)
    if not input.name or not input.name.strip():
        raise HTTPException(status_code=400, detail="Form schema name is required")
    for field in input.fields:
        if field.field_type not in _VALID_FIELD_TYPES:
            raise HTTPException(status_code=400, detail=f"Invalid field_type '{field.field_type}'")
    now = datetime.now(timezone.utc).isoformat()
    doc = {
        "user_id": user["_id"],
        "name": input.name.strip(),
        "fields": [
            {
                "_id": ObjectId(),
                "label": f.label.strip(),
                "field_type": f.field_type,
                "placeholder": f.placeholder or None,
                "options": f.options if f.field_type == "dropdown" else [],
                "is_required": f.is_required,
                "order": f.order,
            }
            for f in input.fields
        ],
        "created_at": now,
        "updated_at": now,
    }
    result = await db.form_schemas.insert_one(doc)
    doc["_id"] = result.inserted_id
    return _serialize(doc)


@api_router.get("/form-schema")
async def list_form_schemas(request: Request):
    user = await get_current_user(request)
    docs = await db.form_schemas.find({"user_id": user["_id"]}).sort("created_at", -1).to_list(1000)
    return [_serialize(d) for d in docs]


@api_router.get("/form-schema/{schema_id}")
async def get_form_schema(schema_id: str, request: Request):
    user = await get_current_user(request)
    try:
        oid = ObjectId(schema_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid schema ID")
    doc = await db.form_schemas.find_one({"_id": oid, "user_id": user["_id"]})
    if not doc:
        raise HTTPException(status_code=404, detail="Form schema not found")
    return _serialize(doc)


@api_router.put("/form-schema/{schema_id}")
async def update_form_schema(schema_id: str, input: FormSchemaUpdateInput, request: Request):
    user = await get_current_user(request)
    try:
        oid = ObjectId(schema_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid schema ID")
    doc = await db.form_schemas.find_one({"_id": oid, "user_id": user["_id"]})
    if not doc:
        raise HTTPException(status_code=404, detail="Form schema not found")
    updates = {"updated_at": datetime.now(timezone.utc).isoformat()}
    if input.name is not None:
        if not input.name.strip():
            raise HTTPException(status_code=400, detail="Name cannot be empty")
        updates["name"] = input.name.strip()
    if input.fields is not None:
        for field in input.fields:
            if field.field_type not in _VALID_FIELD_TYPES:
                raise HTTPException(status_code=400, detail=f"Invalid field_type '{field.field_type}'")
        updates["fields"] = [
            {
                "_id": ObjectId(),
                "label": f.label.strip(),
                "field_type": f.field_type,
                "placeholder": f.placeholder or None,
                "options": f.options if f.field_type == "dropdown" else [],
                "is_required": f.is_required,
                "order": f.order,
            }
            for f in input.fields
        ]
    await db.form_schemas.update_one({"_id": oid}, {"$set": updates})
    updated = await db.form_schemas.find_one({"_id": oid})
    return _serialize(updated)


@api_router.delete("/form-schema/{schema_id}")
async def delete_form_schema(schema_id: str, request: Request):
    user = await get_current_user(request)
    try:
        oid = ObjectId(schema_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid schema ID")
    doc = await db.form_schemas.find_one({"_id": oid, "user_id": user["_id"]})
    if not doc:
        raise HTTPException(status_code=404, detail="Form schema not found")
    await db.form_schemas.delete_one({"_id": oid})
    return {"message": "Form schema deleted"}


# ---- PUBLIC TRIPDECK ENDPOINTS ----

@api_router.get("/public/tripdeck/{slug}")
async def get_public_tripdeck(slug: str, request: Request):
    doc = await db.tripdecks.find_one({"slug": slug, "status": "active"})
    if not doc:
        raise HTTPException(status_code=404, detail="TripDeck not found")
    await db.tripdecks.update_one({"_id": doc["_id"]}, {"$inc": {"total_opens": 1}})
    serialized = _serialize(doc)
    public_destinations = []
    for dest in serialized.get("destinations", []):
        pdf = await db.pdfs.find_one({"id": dest.get("pdf_id")})
        pdf_available = bool(pdf and not pdf.get("archived") and pdf.get("upload_status") == "ready")
        schema = None
        if dest.get("form_schema_id"):
            try:
                schema_doc = await db.form_schemas.find_one({"_id": ObjectId(dest["form_schema_id"])})
                if schema_doc:
                    schema = _serialize(schema_doc)
            except Exception:
                pass
        public_destinations.append({
            "_id": dest["_id"],
            "name": dest.get("name"),
            "duration": dest.get("duration"),
            "hero_image_url": dest.get("hero_image_url"),
            "pdf_available": pdf_available,
            "form_schema": schema,
            "order": dest.get("order", 0),
        })
    public_destinations.sort(key=lambda d: d.get("order", 0))
    return {
        "_id": serialized["_id"],
        "title": serialized.get("title"),
        "description": serialized.get("description"),
        "slug": serialized.get("slug"),
        "destinations": public_destinations,
    }


@api_router.post("/public/tripdeck/{slug}/destination/{dest_id}/submit")
async def submit_lead_form(slug: str, dest_id: str, input: FormSubmitInput, request: Request):
    doc = await db.tripdecks.find_one({"slug": slug, "status": "active"})
    if not doc:
        raise HTTPException(status_code=404, detail="TripDeck not found")
    try:
        dest_oid = ObjectId(dest_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid destination ID")
    dest = next((d for d in doc.get("destinations", []) if d.get("_id") == dest_oid), None)
    if not dest:
        raise HTTPException(status_code=404, detail="Destination not found")
    pdf = await db.pdfs.find_one({"id": dest.get("pdf_id")})
    if not pdf or pdf.get("archived") or pdf.get("upload_status") != "ready":
        raise HTTPException(status_code=410, detail="This itinerary is no longer available")
    tripdeck_id = str(doc["_id"])
    user_agent = request.headers.get("user-agent", "")
    client_ip = get_client_ip(request)
    location = get_location_snapshot(request)
    if not location.get("city") or not location.get("region"):
        ip_lookup = await lookup_ip_geolocation(client_ip)
        if ip_lookup.get("label"):
            location = merge_location_data(location, ip_lookup)
    pdf_access_token = secrets.token_urlsafe(32)
    token_expires_at = (datetime.now(timezone.utc) + timedelta(hours=24)).isoformat()
    now = datetime.now(timezone.utc).isoformat()
    response_doc = {
        "tripdeck_id": tripdeck_id,
        "destination_id": dest_id,
        "form_schema_id": dest.get("form_schema_id"),
        "user_id": doc.get("user_id"),
        "pdf_id": dest.get("pdf_id"),
        "responses": input.responses,
        "customer_name": input.customer_name.strip(),
        "customer_phone": input.customer_phone.strip(),
        "customer_email": (input.customer_email or "").strip() or None,
        "ip_address": client_ip,
        "device": infer_device_type(user_agent, False),
        "browser": infer_browser(user_agent),
        "location": location.get("label") or None,
        "pdf_access_token": pdf_access_token,
        "pdf_access_token_expires_at": token_expires_at,
        "submitted_at": now,
    }
    await db.form_responses.insert_one(response_doc)
    normalized_phone = normalize_contact_phone(input.customer_phone)
    if normalized_phone and doc.get("user_id"):
        await db.contacts.update_one(
            {
                "user_id": doc.get("user_id"),
                "customer_phone": normalized_phone,
            },
            {
                "$set": {
                    "customer_name": input.customer_name.strip(),
                    "latest_pdf_name": pdf.get("file_name"),
                    "latest_pdf_id": dest.get("pdf_id"),
                    "latest_opened_at": now,
                    "latest_tripdeck_id": tripdeck_id,
                    "latest_tripdeck_slug": slug,
                    "updated_at": now,
                },
                "$setOnInsert": {
                    "created_at": now,
                    "source": "tripdeck",
                },
                "$inc": {
                    "total_submissions": 1,
                },
            },
            upsert=True,
        )
    return {
        "success": True,
        "pdf_access_token": pdf_access_token,
        "expires_at": token_expires_at,
        "message": "Form submitted successfully",
    }


@api_router.get("/public/tripdeck/{slug}/destination/{dest_id}/pdf")
async def get_tripdeck_pdf(slug: str, dest_id: str, token: str, request: Request):
    if not token:
        raise HTTPException(status_code=401, detail="Access token required")
    doc = await db.tripdecks.find_one({"slug": slug})
    if not doc:
        raise HTTPException(status_code=404, detail="TripDeck not found")
    try:
        dest_oid = ObjectId(dest_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid destination ID")
    dest = next((d for d in doc.get("destinations", []) if d.get("_id") == dest_oid), None)
    if not dest:
        raise HTTPException(status_code=404, detail="Destination not found")
    tripdeck_id = str(doc["_id"])
    form_response = await db.form_responses.find_one({
        "tripdeck_id": tripdeck_id,
        "destination_id": dest_id,
        "pdf_access_token": token,
    })
    if not form_response:
        raise HTTPException(status_code=403, detail="Invalid or expired access token")
    expires_at = form_response.get("pdf_access_token_expires_at")
    if expires_at:
        try:
            expiry_dt = datetime.fromisoformat(expires_at).astimezone(timezone.utc)
            if datetime.now(timezone.utc) > expiry_dt:
                raise HTTPException(status_code=403, detail="Access token has expired. Please submit the form again.")
        except HTTPException:
            raise
        except Exception:
            pass
    pdf = await db.pdfs.find_one({"id": dest.get("pdf_id")}, {"_id": 0})
    if not pdf or pdf.get("archived"):
        raise HTTPException(status_code=410, detail="This itinerary is no longer available")
    pdf_url = resolve_pdf_url(pdf, request)
    if not pdf_url:
        raise HTTPException(status_code=404, detail="PDF file is missing")
    try:
        upstream = requests.get(pdf_url, stream=True, timeout=60)
        upstream.raise_for_status()
    except Exception as exc:
        logger.error("Error streaming TripDeck PDF: %s", exc)
        raise HTTPException(status_code=404, detail="PDF file is missing")
    response_headers = inline_pdf_headers(pdf.get("file_name", "document.pdf"))
    content_length = upstream.headers.get("Content-Length")
    if content_length:
        response_headers["Content-Length"] = content_length
    return StreamingResponse(
        upstream.iter_content(chunk_size=1024 * 64),
        media_type="application/pdf",
        headers=response_headers,
    )


# ---- FORM RESPONSES (agent views) ----

@api_router.get("/tripdeck/{tripdeck_id}/responses")
async def get_tripdeck_responses(tripdeck_id: str, request: Request):
    user = await get_current_user(request)
    try:
        oid = ObjectId(tripdeck_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid TripDeck ID")
    doc = await db.tripdecks.find_one({"_id": oid, "user_id": user["_id"]})
    if not doc:
        raise HTTPException(status_code=404, detail="TripDeck not found")
    responses = await db.form_responses.find({"tripdeck_id": tripdeck_id}).sort("submitted_at", -1).to_list(5000)
    return [_serialize_response(r) for r in responses]


@api_router.get("/tripdeck/{tripdeck_id}/destination/{dest_id}/responses")
async def get_destination_responses(tripdeck_id: str, dest_id: str, request: Request):
    user = await get_current_user(request)
    try:
        oid = ObjectId(tripdeck_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid TripDeck ID")
    doc = await db.tripdecks.find_one({"_id": oid, "user_id": user["_id"]})
    if not doc:
        raise HTTPException(status_code=404, detail="TripDeck not found")
    responses = await db.form_responses.find(
        {"tripdeck_id": tripdeck_id, "destination_id": dest_id}
    ).sort("submitted_at", -1).to_list(5000)
    return [_serialize_response(r) for r in responses]


@api_router.get("/tripdeck/{tripdeck_id}/responses/export")
async def export_tripdeck_responses(tripdeck_id: str, request: Request):
    user = await get_current_user(request)
    try:
        oid = ObjectId(tripdeck_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid TripDeck ID")
    doc = await db.tripdecks.find_one({"_id": oid, "user_id": user["_id"]})
    if not doc:
        raise HTTPException(status_code=404, detail="TripDeck not found")
    responses = await db.form_responses.find({"tripdeck_id": tripdeck_id}).sort("submitted_at", -1).to_list(10000)
    dest_map = {str(d["_id"]): d.get("name", "Unknown") for d in doc.get("destinations", [])}
    all_labels: list[str] = []
    seen: set[str] = set()
    for r in responses:
        for label in (r.get("responses") or {}).keys():
            if label not in seen:
                all_labels.append(label)
                seen.add(label)
    headers = ["Submitted At", "Destination", "Customer Name", "Customer Phone", "Customer Email", "Device", "Browser", "Location"] + all_labels
    rows = [headers]
    for r in responses:
        dest_name = dest_map.get(r.get("destination_id"), "Unknown Destination")
        base = [
            r.get("submitted_at", ""),
            dest_name,
            r.get("customer_name", ""),
            r.get("customer_phone", ""),
            r.get("customer_email") or "",
            r.get("device", ""),
            r.get("browser", ""),
            r.get("location") or "",
        ]
        field_values = [(r.get("responses") or {}).get(label, "") for label in all_labels]
        rows.append(base + field_values)

    def _csv_cell(value) -> str:
        s = "" if value is None else str(value)
        if any(ch in s for ch in [",", '"', "\n"]):
            s = '"' + s.replace('"', '""') + '"'
        return s

    csv_content = "\n".join(",".join(_csv_cell(cell) for cell in row) for row in rows)
    return Response(
        content=csv_content,
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="tripdeck-responses-{tripdeck_id}.csv"'},
    )


# ---- TRIPDECK ANALYTICS ----

@api_router.get("/tripdeck/{tripdeck_id}/analytics")
async def get_tripdeck_analytics(tripdeck_id: str, request: Request):
    user = await get_current_user(request)
    try:
        oid = ObjectId(tripdeck_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid TripDeck ID")
    doc = await db.tripdecks.find_one({"_id": oid, "user_id": user["_id"]})
    if not doc:
        raise HTTPException(status_code=404, detail="TripDeck not found")
    tripdeck_id_str = str(doc["_id"])
    responses = await db.form_responses.find({"tripdeck_id": tripdeck_id_str}).to_list(10000)
    total_opens = doc.get("total_opens", 0)
    total_submissions = len(responses)
    dest_stats = {}
    for dest in doc.get("destinations", []):
        dest_id_str = str(dest["_id"])
        dest_stats[dest_id_str] = {
            "destination_id": dest_id_str,
            "destination_name": dest.get("name"),
            "form_submissions": 0,
        }
    for r in responses:
        dest_id_str = r.get("destination_id")
        if dest_id_str in dest_stats:
            dest_stats[dest_id_str]["form_submissions"] += 1
    return {
        "tripdeck_id": tripdeck_id_str,
        "title": doc.get("title"),
        "total_opens": total_opens,
        "total_submissions": total_submissions,
        "conversion_rate": round(total_submissions / total_opens * 100, 1) if total_opens else 0,
        "destination_stats": list(dest_stats.values()),
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
    await db.tripdecks.create_index("slug", unique=True)
    await db.tripdecks.create_index("user_id")
    await db.form_schemas.create_index("user_id")
    await db.form_responses.create_index("tripdeck_id")
    await db.form_responses.create_index([("tripdeck_id", 1), ("destination_id", 1)])
    await db.form_responses.create_index("pdf_access_token")
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
