from fastapi import FastAPI, Request, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
from typing import Optional
import os
import asyncio
from contextlib import asynccontextmanager

from database import init_db
from routers import auth, users, projects, notes, citations, news, chats, conferences, discovery, writing_tools, authors, academic_workflow, collaboration, drafts, search, research_questions, papers, api_keys
from services.alerts_scheduler import start_scheduler, stop_scheduler
from services.chromadb_backup import restore_on_startup, backup_on_shutdown
from auth import get_current_user, get_current_user_optional
from models import User

load_dotenv()

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    await restore_on_startup()   # restore ChromaDB from GCS if configured
    await init_db()
    start_scheduler(app)
    yield
    # Shutdown
    stop_scheduler(app)
    await backup_on_shutdown()   # back up ChromaDB to GCS if configured

app = FastAPI(lifespan=lifespan)

# ── Rate limiting middleware for expensive AI endpoints ───────────────────────
import time
from collections import defaultdict
from fastapi.responses import JSONResponse

# Endpoints that trigger expensive Gemini API calls
_AI_ENDPOINTS = {
    "/summarize",
    "/projects/",        # covers analyze-gaps, synthesize, extract-all via prefix match
    "/academic-workflow",
    "/writing-tools",
    "/citations/check-missing",
    "/citations/consistency-check",
    "/discovery/recommendations",
}

_AI_MAX_RPM = int(os.getenv("AI_RATE_LIMIT_RPM", "20"))  # per user per minute

# In-memory store: {user_key: [timestamp, ...]}
_rate_store: dict = defaultdict(list)


def _is_ai_endpoint(path: str) -> bool:
    for ep in _AI_ENDPOINTS:
        if ep in path:
            return True
    return False


def _get_user_key(request: Request) -> str:
    auth = request.headers.get("Authorization", "")
    if auth.startswith("Bearer "):
        try:
            import jwt as _jwt
            payload = _jwt.decode(auth.split(" ", 1)[1], options={"verify_signature": False})
            return f"user:{payload.get('sub', '')}"
        except Exception:
            pass
    return f"ip:{request.client.host if request.client else 'unknown'}"


@app.middleware("http")
async def ai_rate_limit_middleware(request: Request, call_next):
    if _is_ai_endpoint(request.url.path) and request.method in ("POST", "GET"):
        key = _get_user_key(request)
        now = time.time()
        window = 60  # 1 minute rolling window
        # Clean up old entries
        _rate_store[key] = [t for t in _rate_store[key] if now - t < window]
        if len(_rate_store[key]) >= _AI_MAX_RPM:
            return JSONResponse(
                status_code=429,
                content={"detail": f"Rate limit exceeded. Max {_AI_MAX_RPM} AI requests per minute."},
                headers={"Retry-After": "60"},
            )
        _rate_store[key].append(now)
    return await call_next(request)

# CORS Configuration
# In production set ALLOWED_ORIGINS="https://your-domain.com,https://www.your-domain.com"
_allowed_origins_env = os.getenv("ALLOWED_ORIGINS", "")
origins = (
    [o.strip() for o in _allowed_origins_env.split(",") if o.strip()]
    if _allowed_origins_env
    else ["http://localhost:3000", "http://127.0.0.1:3000"]
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register Routers
app.include_router(auth.router)
app.include_router(users.router)
app.include_router(projects.router)
app.include_router(notes.router)
app.include_router(citations.router)
app.include_router(news.router) # /news/research route
app.include_router(news.alerts_router) # /alerts/*
app.include_router(chats.router) # /chats/*
app.include_router(conferences.router)       # /conferences/*
app.include_router(discovery.router)         # /discovery/*
app.include_router(writing_tools.router)     # /writing-tools/*
app.include_router(authors.router)           # /authors/*
app.include_router(academic_workflow.router) # /academic-workflow/*
app.include_router(collaboration.router)     # /projects/.../invite, /annotations/*
app.include_router(drafts.router)            # /drafts/*
app.include_router(search.router)            # /search
app.include_router(research_questions.router)  # /projects/{id}/research-questions
app.include_router(papers.router)              # /papers/{id}
app.include_router(api_keys.router)            # /api-keys/*

# Existing legacy routes or moved to routers if appropriate
# Keeping for compatibility if needed, otherwise rely on new structure

@app.get("/")
def read_root():
    return {"Hello": "Research OS API"}

# Updated to use new AgentExecutor logic
from services.research_service import process_query_stream
from services.schemas import SummaryRequest
from utils.news_fetcher import get_research_news, NewsRequest, NewsResponse
from fastapi.responses import StreamingResponse

@app.post("/summarize", tags=["Agent"])
async def summarize_papers(
    request: SummaryRequest,
    current_user: Optional[User] = Depends(get_current_user_optional),
):
    if current_user:
        from models import UserApiKeys
        from utils.encryption import decrypt_value
        doc = await UserApiKeys.find_one({"user_id.$id": current_user.id})
        if doc and doc.keys:
            request.user_keys = {src: decrypt_value(enc) for src, enc in doc.keys.items()}
    return StreamingResponse(process_query_stream(request), media_type="application/x-ndjson")

# The /news route is now handled by news router, but let's see if we need to keep this specific one
# The new router uses /news/research, this was /news.
# We can keep it for backward compat or deprecate.
@app.post("/news-legacy", response_model=NewsResponse, tags=["Legacy/Tools"])
async def fetch_news_legacy(request: NewsRequest):
    return await get_research_news(request)

# ── Private image proxy ───────────────────────────────────────────────────────
# Images are stored privately in GCS. This endpoint streams them back to the
# authenticated owner only — no public GCS URLs are ever exposed.
import io

@app.get("/uploads/{filename}", tags=["Uploads"])
async def serve_upload(filename: str, current_user: User = Depends(get_current_user)):
    """Stream a privately-stored note image from GCS after verifying auth."""
    import mimetypes
    from services.storage_service import download_bytes

    gcs_path = f"uploads/{filename}"
    try:
        data = await asyncio.get_event_loop().run_in_executor(
            None, download_bytes, gcs_path
        )
    except Exception:
        raise HTTPException(status_code=404, detail="Image not found")

    content_type = mimetypes.guess_type(filename)[0] or "application/octet-stream"
    return StreamingResponse(io.BytesIO(data), media_type=content_type)

