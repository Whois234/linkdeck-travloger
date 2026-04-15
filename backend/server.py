from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

from fastapi import FastAPI, APIRouter, HTTPException, Request, Response, UploadFile, File, Header, Query
from fastapi.responses import JSONResponse
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import uuid
import bcrypt
import jwt
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

def get_jwt_secret():
    return os.environ["JWT_SECRET"]

# Object Storage config
data = await file.read()

result = cloudinary.uploader.upload(
    data,
    resource_type="raw",
    folder="linkdeck_pdfs"
)

file_id = str(uuid.uuid4())

pdf_doc = {
    "id": file_id,
    "user_id": user["_id"],
    "file_name": file.filename,
    "file_url": result["secure_url"],  # ✅ MUST BE THIS
    "file_size": len(data),
    "created_at": datetime.now(timezone.utc).isoformat()
}

await db.pdfs.insert_one(pdf_doc)
return {
    "id": file_id,
    "file_name": file.filename,
    "file_size": len(data),
    "created_at": pdf_doc["created_at"]
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
        user["_id"] = str(user["_id"])
        user.pop("password_hash", None)
        return user
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")

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
    return {"id": user_id, "email": email, "name": input.name, "role": "user"}

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
    return {"id": user_id, "email": email, "name": user.get("name", ""), "role": user.get("role", "user")}

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
        return {"message": "Token refreshed"}
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Refresh token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid refresh token")

# ---- PDF ENDPOINTS ----
@api_router.post("/pdfs/upload")
async def upload_pdf(request: Request, file: UploadFile = File(...)):
    user = await get_current_user(request)
    if not file.filename.lower().endswith('.pdf'):
        raise HTTPException(status_code=400, detail="Only PDF files are allowed")
    if file.size and file.size > 50 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File too large. Max 50MB.")
data = await file.read()

# Upload to Cloudinary
result = cloudinary.uploader.upload(
    data,
    resource_type="raw",
    folder="linkdeck_pdfs"
)

file_id = str(uuid.uuid4())

pdf_doc = {
    "id": file_id,
    "user_id": str(user["_id"]),
    "file_name": file.filename,
    "file_url": result["secure_url"],  # 🔥 IMPORTANT
    "file_size": len(data),
    "created_at": datetime.now(timezone.utc).isoformat()
}
await db.pdfs.insert_one(pdf_doc)
return {"id": file_id, "file_name": file.filename, "file_size": len(data), "created_at": pdf_doc["created_at"]}

@api_router.get("/pdfs")
async def list_pdfs(request: Request):
    user = await get_current_user(request)
    pdfs = await db.pdfs.find({"user_id": user["_id"]}, {"_id": 0}).sort("created_at", -1).to_list(1000)
    # Add link count for each PDF
    for pdf in pdfs:
        link_count = await db.links.count_documents({"pdf_id": pdf["id"]})
        pdf["link_count"] = link_count
    return pdfs

@api_router.delete("/pdfs/{pdf_id}")
async def delete_pdf(pdf_id: str, request: Request):
    user = await get_current_user(request)
    pdf = await db.pdfs.find_one({"id": pdf_id, "user_id": user["_id"]})
    if not pdf:
        raise HTTPException(status_code=404, detail="PDF not found")
    await db.pdfs.delete_one({"id": pdf_id})
    await db.links.delete_many({"pdf_id": pdf_id})
    return {"message": "PDF deleted"}

# ---- LINK ENDPOINTS ----
@api_router.post("/links")
async def create_link(input: LinkCreateInput, request: Request):
    user = await get_current_user(request)
    pdf = await db.pdfs.find_one({"id": input.pdf_id, "user_id": user["_id"]})
    if not pdf:
        raise HTTPException(status_code=404, detail="PDF not found")
    unique_id = str(uuid.uuid4())[:8]
    link_doc = {
        "id": unique_id,
        "pdf_id": input.pdf_id,
        "user_id": user["_id"],
        "customer_name": input.customer_name,
        "customer_phone": input.customer_phone,
        "opened": False,
        "open_count": 0,
        "last_opened_at": None,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.links.insert_one(link_doc)
    return {
        "id": unique_id,
        "pdf_id": input.pdf_id,
        "pdf_name": pdf["file_name"],
        "customer_name": input.customer_name,
        "customer_phone": input.customer_phone,
        "opened": False,
        "open_count": 0,
        "last_opened_at": None,
        "created_at": link_doc["created_at"]
    }

@api_router.get("/links")
async def list_links(request: Request, status: Optional[str] = None, search: Optional[str] = None):
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
    links = await db.links.find(query, {"_id": 0}).sort("created_at", -1).to_list(1000)
    # Enrich with PDF names
    pdf_ids = list(set(l["pdf_id"] for l in links))
    pdfs = await db.pdfs.find({"id": {"$in": pdf_ids}}, {"_id": 0, "id": 1, "file_name": 1}).to_list(1000)
    pdf_map = {p["id"]: p["file_name"] for p in pdfs}
    for link in links:
        link["pdf_name"] = pdf_map.get(link["pdf_id"], "Unknown")
    return links

@api_router.delete("/links/{link_id}")
async def delete_link(link_id: str, request: Request):
    user = await get_current_user(request)
    link = await db.links.find_one({"id": link_id, "user_id": user["_id"]})
    if not link:
        raise HTTPException(status_code=404, detail="Link not found")
    await db.links.delete_one({"id": link_id})
    return {"message": "Link deleted"}

# ---- VIEW / TRACKING ENDPOINTS (PUBLIC) ----
@api_router.get("/view/{unique_id}/info")
async def get_pdf_info(unique_id: str):
    """Get PDF info for a link WITHOUT tracking. Used for rendering."""
    link = await db.links.find_one({"id": unique_id}, {"_id": 0})
    if not link:
        raise HTTPException(status_code=404, detail="Link not found")
    pdf = await db.pdfs.find_one({"id": link["pdf_id"]}, {"_id": 0})
    if not pdf:
        raise HTTPException(status_code=404, detail="PDF not found")
    return {"pdf_name": pdf["file_name"], "storage_path": pdf["storage_path"]}

@api_router.post("/view/{unique_id}/track")
async def track_visit(unique_id: str):
    """Track a single visit. Called once per page load."""
    link = await db.links.find_one({"id": unique_id}, {"_id": 0})
    if not link:
        raise HTTPException(status_code=404, detail="Link not found")
    now = datetime.now(timezone.utc).isoformat()
    await db.links.update_one(
        {"id": unique_id},
        {"$set": {"opened": True, "last_opened_at": now}, "$inc": {"open_count": 1}}
    )
    return {"tracked": True}

@api_router.get("/pdf-serve/{path:path}")
async def serve_pdf(path: str):
    try:
        data, content_type = get_object(path)
        return Response(content=data, media_type="application/pdf", headers={
            "Content-Disposition": "inline",
            "Cache-Control": "public, max-age=3600"
        })
    except Exception as e:
        logger.error(f"Error serving PDF: {e}")
        raise HTTPException(status_code=404, detail="PDF not found")

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

# Include router
app.include_router(api_router)

# CORS
from fastapi.middleware.cors import CORSMiddleware

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "https://linkdeck-travloger.vercel.app",
        "https://linkdeck-travloger-duqplmsi0-whois234s-projects.vercel.app"
    ],
    allow_origin_regex=r"https://.*\.vercel\.app",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
from fastapi import UploadFile, File
from uuid import uuid4
import os

UPLOAD_DIR = "uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)

@api_router.post("/pdfs/upload")
async def upload_pdf(
    file: UploadFile = File(...),
    request: Request = None
):
    user = await get_current_user(request)

    if not file.filename.endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files allowed")

    file_id = str(uuid4())
    file_path = f"{UPLOAD_DIR}/{file_id}_{file.filename}"

    # Save file
    with open(file_path, "wb") as f:
        content = await file.read()
        f.write(content)

    # Save to DB
    pdf_doc = {
        "id": file_id,
        "file_name": file.filename,
        "storage_path": file_path,
        "user_id": user["_id"],
        "link_count": 0,
        "created_at": datetime.now(timezone.utc).isoformat()
    }

    await db.pdfs.insert_one(pdf_doc)

    return {"message": "PDF uploaded successfully"}
# Startup
@app.on_event("startup")
async def startup():
    # Create indexes
    await db.users.create_index("email", unique=True)
    await db.links.create_index("id", unique=True)
    await db.pdfs.create_index("id", unique=True)
    await db.links.create_index("user_id")
    await db.pdfs.create_index("user_id")
    # Seed admin
    admin_email = os.environ.get("ADMIN_EMAIL", "admin@example.com")
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
    elif not verify_password(admin_password, existing["password_hash"]):
        await db.users.update_one({"email": admin_email}, {"$set": {"password_hash": hash_password(admin_password)}})
        logger.info("Admin password updated")
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
