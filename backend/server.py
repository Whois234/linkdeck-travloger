from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

from fastapi import FastAPI, APIRouter, HTTPException, Request, Response, UploadFile, File, Header, Query
from fastapi.responses import RedirectResponse, FileResponse
from fastapi.responses import JSONResponse
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import uuid
import bcrypt
from jose import jwt
import requests
from datetime import datetime, timezone, timedelta
from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime, timezone
from fastapi import HTTPException, Request
import cloudinary
import cloudinary.uploader
import os

cloudinary.config(
    cloud_name=os.environ.get("CLOUDINARY_CLOUD_NAME"),
    api_key=os.environ.get("CLOUDINARY_API_KEY"),
    api_secret=os.environ.get("CLOUDINARY_API_SECRET"),
)

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


def cloudinary_ready() -> bool:
    return all([
        os.environ.get("CLOUDINARY_CLOUD_NAME"),
        os.environ.get("CLOUDINARY_API_KEY"),
        os.environ.get("CLOUDINARY_API_SECRET"),
    ])


def resolve_pdf_url(pdf: dict, request: Optional[Request] = None) -> Optional[str]:
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
    parts = [part for part in [city, region, country] if part]
    return {
        "city": city,
        "region": region,
        "country": country,
        "label": ", ".join(parts) if parts else "Unknown",
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
        "pdf_deleted": bool(link.get("pdf_deleted")) or link.get("pdf_id") not in pdf_map,
        "session_count": len(sessions),
        "total_time_seconds": total_time,
        "avg_time_seconds": round(total_time / len(sessions)) if sessions else 0,
        "latest_session_started_at": latest_session.get("started_at") if latest_session else None,
        "latest_device": latest_session.get("device_type") if latest_session else None,
        "latest_platform": latest_session.get("platform") if latest_session else None,
        "latest_location": latest_session.get("location_label") if latest_session else None,
    }

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
    total_pdfs = await db.pdfs.count_documents({})
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
    pdfs = await db.pdfs.find({}, {"_id": 0, "id": 1, "file_name": 1}).to_list(10000)
    session_filter = {}
    if days and days > 0:
        session_filter = {"started_at": {"$gte": cutoff}}
    sessions = await db.view_sessions.find(session_filter).to_list(10000)
    pdf_map = {pdf["id"]: pdf.get("file_name", "Unknown PDF") for pdf in pdfs}

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

    links_by_pdf = {}
    opens_by_hour = {str(hour).zfill(2): 0 for hour in range(24)}

    for link in links:
        pdf_id = link.get("pdf_id")
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

    time_by_pdf = []
    for item in sessions_by_pdf.values():
        item["avg_time_seconds"] = round(item["total_time_seconds"] / item["sessions"]) if item["sessions"] else 0
        time_by_pdf.append(item)

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
        "time_by_pdf": sorted(time_by_pdf, key=lambda item: item["total_time_seconds"], reverse=True),
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
            "location_label": session.get("location_label") or "Unknown",
        })
    return {"items": activity}

# ---- PDF ENDPOINTS ----
UPLOAD_DIR = ROOT_DIR / "uploads"
UPLOAD_DIR.mkdir(exist_ok=True)


@api_router.post("/pdfs/upload")
async def upload_pdf(request: Request, file: UploadFile = File(...)):
    user = await get_current_user(request)

    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are allowed")

    content = await file.read()
    if len(content) > 50 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File too large. Max 50MB.")

    file_id = str(uuid.uuid4())
    safe_name = f"{file_id}_{Path(file.filename).name.replace(' ', '_')}"
    file_path = UPLOAD_DIR / safe_name

    file_url = None

    if cloudinary_ready():
        file.file.seek(0)
        result = cloudinary.uploader.upload(
            file.file,
            resource_type="raw",
            folder="linkdeck_pdfs",
            public_id=file_id,
            use_filename=False,
            overwrite=True,
        )
        file_url = result["secure_url"]
    else:
        with open(file_path, "wb") as f:
            f.write(content)
        base_url = str(request.base_url).rstrip("/")
        file_url = f"{base_url}/api/uploads/{safe_name}"

    pdf_doc = {
        "id": file_id,
        "user_id": user["_id"],
        "file_name": file.filename,
        "file_url": file_url,
        "storage_path": str(file_path),
        "file_size": len(content),
        "created_at": datetime.now(timezone.utc).isoformat()
    }

    await db.pdfs.insert_one(pdf_doc)

    return {
        "id": file_id,
        "file_name": file.filename,
        "file_url": file_url,
        "file_size": len(content),
        "link_count": 0,
        "created_at": pdf_doc["created_at"]
    }


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
    pdfs = await db.pdfs.find({"user_id": user["_id"]}, {"_id": 0}).sort("created_at", -1).to_list(1000)
    # Add link count for each PDF
    for pdf in pdfs:
        link_count = await db.links.count_documents({"pdf_id": pdf["id"]})
        pdf["link_count"] = link_count
    return pdfs


@api_router.get("/pdfs/archived")
async def list_archived_pdfs(request: Request):
    user = await get_current_user(request)
    archived_links = await db.links.find(
        {"user_id": user["_id"], "pdf_deleted": True}
    ).to_list(5000)

    archived_by_pdf = {}
    for link in archived_links:
        pdf_key = link.get("pdf_id") or link.get("pdf_name_snapshot") or link.get("_id")
        if pdf_key not in archived_by_pdf:
            archived_by_pdf[pdf_key] = {
                "pdf_id": link.get("pdf_id"),
                "pdf_name": link.get("pdf_name_snapshot") or "Deleted PDF",
                "pdf_deleted_at": link.get("pdf_deleted_at"),
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
        if not item.get("pdf_deleted_at") and link.get("pdf_deleted_at"):
            item["pdf_deleted_at"] = link.get("pdf_deleted_at")

    archived_pdf_ids = [item.get("pdf_id") for item in archived_by_pdf.values() if item.get("pdf_id")]
    sessions = await db.view_sessions.find(
        {"user_id": user["_id"], "pdf_deleted": True, "pdf_id": {"$in": archived_pdf_ids}}
    ).to_list(10000) if archived_pdf_ids else []

    for session in sessions:
        pdf_key = session.get("pdf_id") or session.get("pdf_name_snapshot")
        if pdf_key not in archived_by_pdf:
            archived_by_pdf[pdf_key] = {
                "pdf_id": session.get("pdf_id"),
                "pdf_name": session.get("pdf_name_snapshot") or "Deleted PDF",
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
    await db.pdfs.delete_one({"id": pdf_id})
    await db.links.update_many(
        {"pdf_id": pdf_id, "user_id": user["_id"]},
        {"$set": {
            "pdf_deleted": True,
            "pdf_name_snapshot": pdf.get("file_name", "Deleted PDF"),
            "pdf_deleted_at": datetime.now(timezone.utc).isoformat(),
        }}
    )
    await db.view_sessions.update_many(
        {"pdf_id": pdf_id, "user_id": user["_id"]},
        {"$set": {
            "pdf_deleted": True,
            "pdf_name_snapshot": pdf.get("file_name", "Deleted PDF"),
        }}
    )
    return {"message": "PDF deleted. Link analytics remain available, but the itinerary is now expired."}

# ---- LINK ENDPOINTS ----
@api_router.post("/links")
async def create_link(input: LinkCreateInput, request: Request):
    user = await get_current_user(request)
    pdf = await db.pdfs.find_one({"id": input.pdf_id, "user_id": user["_id"]})
    if not pdf:
        raise HTTPException(status_code=404, detail="PDF not found")
    unique_id = str(uuid.uuid4())[:8]
    link_doc = {
        "_id": unique_id,
        "pdf_id": input.pdf_id,
        "user_id": user["_id"],
        "customer_name": input.customer_name,
        "customer_phone": input.customer_phone,
        "pdf_name_snapshot": pdf.get("file_name", "Unknown PDF"),
        "pdf_deleted": False,
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
    for index, session in enumerate(sessions, start=1):
        sessions_payload.append({
            "session_id": session.get("_id"),
            "session_number": index,
            "started_at": session.get("started_at"),
            "last_seen_at": session.get("last_seen_at"),
            "duration_seconds": int(session.get("duration_seconds") or 0),
            "device_type": session.get("device_type") or infer_device_type(session.get("user_agent", ""), bool(session.get("is_mobile"))),
            "platform": session.get("platform") or infer_platform(session.get("user_agent", "")),
            "browser": session.get("browser") or infer_browser(session.get("user_agent", "")),
            "location_label": session.get("location_label") or "Unknown",
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
            "pdf_deleted": bool(link.get("pdf_deleted")) or link.get("pdf_id") not in pdf_map,
            "created_at": link.get("created_at"),
            "open_count": int(link.get("open_count") or 0),
            "last_opened_at": link.get("last_opened_at"),
            "session_count": len(sessions_payload),
            "total_time_seconds": total_time,
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
    if not pdf or link.get("pdf_deleted"):
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
    if not pdf or link.get("pdf_deleted"):
        raise HTTPException(status_code=410, detail=EXPIRED_ITINERARY_MESSAGE)

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
    if not pdf or link.get("pdf_deleted"):
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
        upstream = requests.get(pdf_url, timeout=30)
        upstream.raise_for_status()
    except Exception as e:
        logger.error(f"Error fetching PDF for inline view: {e}")
        raise HTTPException(status_code=404, detail="PDF file is missing. Please re-upload the PDF.")

    return Response(
        content=upstream.content,
        media_type="application/pdf",
        headers=inline_pdf_headers(pdf.get("file_name", "document.pdf")),
    )

@api_router.post("/view/{unique_id}/track")
async def track_visit(unique_id: str):
    """Track a single visit. Called once per page load."""
    link = await db.links.find_one({"_id": unique_id})
    if not link:
        raise HTTPException(status_code=404, detail="Link not found")
    pdf = await db.pdfs.find_one({"id": link.get("pdf_id")}, {"_id": 0, "id": 1})
    if link.get("pdf_deleted") or not pdf:
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
    if link.get("pdf_deleted") or not pdf:
        raise HTTPException(status_code=410, detail=EXPIRED_ITINERARY_MESSAGE)

    session_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    user_agent = request.headers.get("user-agent", "")
    location = get_location_snapshot(request)
    await db.view_sessions.insert_one({
        "_id": session_id,
        "link_id": unique_id,
        "pdf_id": link.get("pdf_id"),
        "user_id": link.get("user_id"),
        "pdf_name_snapshot": link.get("pdf_name_snapshot"),
        "pdf_deleted": bool(link.get("pdf_deleted")),
        "customer_name": link.get("customer_name"),
        "customer_phone": link.get("customer_phone"),
        "started_at": now,
        "last_seen_at": now,
        "duration_seconds": 0,
        "screen_width": input.screen_width,
        "screen_height": input.screen_height,
        "is_mobile": input.is_mobile,
        "device_type": infer_device_type(user_agent, input.is_mobile),
        "platform": infer_platform(user_agent),
        "browser": infer_browser(user_agent),
        "user_agent": user_agent,
        "ip_address": get_client_ip(request),
        "location_city": location.get("city"),
        "location_region": location.get("region"),
        "location_country": location.get("country"),
        "location_label": location.get("label"),
    })
    return {"session_id": session_id}


@api_router.post("/view/{unique_id}/session/heartbeat")
async def heartbeat_view_session(unique_id: str, input: ViewSessionHeartbeatInput):
    duration = max(0, min(int(input.duration_seconds or 0), 24 * 60 * 60))
    result = await db.view_sessions.update_one(
        {"_id": input.session_id, "link_id": unique_id},
        {"$set": {
            "duration_seconds": duration,
            "last_seen_at": datetime.now(timezone.utc).isoformat()
        }}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Session not found")
    return {"tracked": True}

# ---- DASHBOARD STATS ----
@api_router.get("/dashboard/stats")
async def dashboard_stats(request: Request):
    user = await get_current_user(request)
    total_pdfs = await db.pdfs.count_documents({"user_id": user["_id"]})
    total_links = await db.links.count_documents({"user_id": user["_id"]})
    opened_links = await db.links.count_documents({"user_id": user["_id"], "opened": True})
    return {
        "total_pdfs": total_pdfs,
        "total_links": total_links,
        "opened_links": opened_links,
        "unopened_links": total_links - opened_links
    }

# CORS
from fastapi.middleware.cors import CORSMiddleware

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
        f.write(f"## PDF Endpoints\n- POST /api/pdfs/upload\n- GET /api/pdfs\n- DELETE /api/pdfs/{{pdf_id}}\n\n")
        f.write(f"## Link Endpoints\n- POST /api/links\n- GET /api/links\n- DELETE /api/links/{{link_id}}\n\n")
        f.write(f"## View Endpoints\n- GET /api/view/{{unique_id}}\n- GET /api/pdf-serve/{{path}}\n\n")
        f.write(f"## Dashboard\n- GET /api/dashboard/stats\n")

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
