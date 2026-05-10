from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from typing import List, Optional
from models import Note, Project, User, Paper, Chat
from auth import get_current_user
from beanie import PydanticObjectId, Link
from pydantic import BaseModel
from datetime import datetime
from utils.sanitize import sanitize_plain_text, sanitize_rich_text, sanitize_list
import os, uuid, asyncio


class NoteCreate(BaseModel):
    project_id: PydanticObjectId
    title: str
    content: str
    tags: List[str] = []
    is_private: bool = False
    allowed_collaborators: List[str] = []


class NoteUpdate(BaseModel):
    project_id: PydanticObjectId
    title: str
    content: str
    tags: List[str] = []
    is_private: Optional[bool] = None
    allowed_collaborators: Optional[List[str]] = None


router = APIRouter(prefix="/notes", tags=["Notes"])


# ── Access helpers ─────────────────────────────────────────────────────────────

def _resolve_id(link_field) -> str:
    if isinstance(link_field, Link):
        return str(link_field.ref.id)
    return str(link_field.id)


def _can_member_see_note(note: Note, user_id: str) -> bool:
    """Return True if a collaborator (non-owner) should have access to this note."""
    if note.is_private:
        return False
    if not note.allowed_collaborators:
        return True  # public to all project members
    return user_id in note.allowed_collaborators


async def _get_project_and_role(project_id, current_user: User):
    """Return (project, is_owner, is_member) or raise 404/403."""
    project = await Project.get(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    owner_id = _resolve_id(project.user_id)
    member_ids = [_resolve_id(m) for m in (project.members or [])]
    uid = str(current_user.id)
    is_owner = uid == owner_id
    is_member = uid in member_ids
    if not is_owner and not is_member:
        raise HTTPException(status_code=403, detail="Forbidden")
    return project, is_owner, is_member


# ── Endpoints ──────────────────────────────────────────────────────────────────

@router.get("/", response_model=List[Note])
async def list_notes(project_id: PydanticObjectId, current_user: User = Depends(get_current_user)):
    project, is_owner, _ = await _get_project_and_role(project_id, current_user)
    all_notes = await Note.find(Note.project_id.id == project.id).to_list()
    if is_owner:
        return all_notes
    uid = str(current_user.id)
    return [n for n in all_notes if _can_member_see_note(n, uid)]


@router.post("/", response_model=Note)
async def create_note(note_in: NoteCreate, current_user: User = Depends(get_current_user)):
    project, is_owner, _ = await _get_project_and_role(note_in.project_id, current_user)
    # Only owner can set privacy settings
    is_private = note_in.is_private if is_owner else False
    allowed_collaborators = note_in.allowed_collaborators if is_owner else []
    note = Note(
        project_id=project,
        title=sanitize_plain_text(note_in.title),
        content=sanitize_rich_text(note_in.content),
        tags=sanitize_list(note_in.tags),
        is_private=is_private,
        allowed_collaborators=allowed_collaborators,
    )
    await note.insert()
    return note


@router.get("/{note_id}", response_model=Note)
async def get_note(note_id: PydanticObjectId, current_user: User = Depends(get_current_user)):
    note = await Note.get(note_id)
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")
    project_ref = _resolve_id(note.project_id)
    project, is_owner, _ = await _get_project_and_role(PydanticObjectId(project_ref), current_user)
    if not is_owner and not _can_member_see_note(note, str(current_user.id)):
        raise HTTPException(status_code=403, detail="Forbidden")
    return note


@router.put("/{note_id}", response_model=Note)
async def update_note(note_id: PydanticObjectId, note_update: NoteUpdate, current_user: User = Depends(get_current_user)):
    note = await Note.get(note_id)
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")
    project_ref = _resolve_id(note.project_id)
    project, is_owner, _ = await _get_project_and_role(PydanticObjectId(project_ref), current_user)
    if not is_owner and not _can_member_see_note(note, str(current_user.id)):
        raise HTTPException(status_code=403, detail="Forbidden")

    note.title = sanitize_plain_text(note_update.title)
    note.content = sanitize_rich_text(note_update.content)
    note.tags = sanitize_list(note_update.tags)
    note.updated_at = datetime.utcnow()

    # Only owner can change privacy settings
    if is_owner:
        if note_update.is_private is not None:
            note.is_private = note_update.is_private
        if note_update.allowed_collaborators is not None:
            note.allowed_collaborators = note_update.allowed_collaborators

    await note.save()
    return note


@router.delete("/{note_id}")
async def delete_note(note_id: PydanticObjectId, current_user: User = Depends(get_current_user)):
    note = await Note.get(note_id)
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")
    project_ref = _resolve_id(note.project_id)
    project, is_owner, _ = await _get_project_and_role(PydanticObjectId(project_ref), current_user)
    if not is_owner and not _can_member_see_note(note, str(current_user.id)):
        raise HTTPException(status_code=403, detail="Forbidden")
    await note.delete()
    return {"message": "Note deleted"}


# ── AI Note Generation ────────────────────────────────────────────────────────

class NoteGenerateRequest(BaseModel):
    prompt: Optional[str] = ""
    chat_history: Optional[List[dict]] = []  # [{role, content}]


@router.post("/{note_id}/ai-generate")
async def ai_generate_note(
    note_id: PydanticObjectId,
    request: NoteGenerateRequest,
    current_user: User = Depends(get_current_user),
):
    note = await Note.get(note_id)
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")
    project_ref = _resolve_id(note.project_id)
    project, is_owner, _ = await _get_project_and_role(PydanticObjectId(project_ref), current_user)
    if not is_owner and not _can_member_see_note(note, str(current_user.id)):
        raise HTTPException(status_code=403, detail="Forbidden")

    # Gather sibling notes for context (up to 4)
    all_notes = await Note.find(Note.project_id.id == project.id).to_list()
    sibling_notes = [n for n in all_notes if str(n.id) != str(note.id)][:4]

    context_parts: list[str] = []

    # Current note
    context_parts.append(
        f"## Note Being Edited: {note.title or 'Untitled'}\n{note.content or '(empty)'}"
    )

    # Sibling notes
    if sibling_notes:
        context_parts.append("## Other Notes in This Project:")
        for sn in sibling_notes:
            context_parts.append(f"### {sn.title or 'Untitled'}\n{sn.content[:600] if sn.content else '(empty)'}")

    # Fetch project papers abstracts
    project_papers = await Paper.find(Paper.project_id.id == project.id).to_list()
    if project_papers:
        context_parts.append("## Project Reference Papers:")
        for p in project_papers[:5]:
            context_parts.append(f"### {p.title}\nAbstract: {p.abstract[:500] if p.abstract else '(No abstract)'}")

    # Fetch user's recent chats to provide overarching "memory"
    recent_chats = await Chat.find(Chat.user_id.id == current_user.id).sort(-Chat.updated_at).limit(3).to_list()
    if recent_chats:
        context_parts.append("## Recent Research Conversations (User Memory):")
        for c in recent_chats:
            context_parts.append(f"### Chat: {c.title}")
            for msg in c.messages[-4:]:
                role_label = "Researcher" if msg.get("role") == "user" else "AI Assistant"
                content_preview = (msg.get("content") or "")[:400]
                context_parts.append(f"**{role_label}:** {content_preview}")

    # Recent chat history (last 8 messages, trimmed)
    if request.chat_history:
        context_parts.append("## Active Research Chat Context:")
        for msg in request.chat_history[-8:]:
            role_label = "Researcher" if msg.get("role") == "user" else "AI Assistant"
            content_preview = (msg.get("content") or "")[:400]
            context_parts.append(f"**{role_label}:** {content_preview}")

    full_context = "\n\n".join(context_parts)
    user_task = request.prompt or "Generate insightful additions, observations, or expansions relevant to this note."

    system_instruction = (
        "You are an expert academic research assistant helping a researcher develop their notes. "
        "Based on the provided context, generate high-quality, relevant content to enhance the note. "
        "Output ONLY the new content in Markdown format — no preamble, no explanation, no meta-commentary."
    )

    from langchain_google_genai import ChatGoogleGenerativeAI
    from utils.research_paper_summariser.config import get_google_api_key

    llm = ChatGoogleGenerativeAI(
        model="gemini-2.5-flash",
        google_api_key=get_google_api_key(),
        temperature=0.4,
    )

    full_prompt = f"{system_instruction}\n\n{full_context}\n\n---\nTask: {user_task}"

    try:
        response = await llm.ainvoke(full_prompt)
        generated = response.content if hasattr(response, "content") else str(response)
        return {"generated_text": generated.strip()}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"AI generation failed: {str(e)}")


# ── Image Upload ──────────────────────────────────────────────────────────────

@router.post("/upload-image")
async def upload_image(file: UploadFile = File(...), current_user: User = Depends(get_current_user)):
    """Upload an image file for embedding in notes. Stored privately in GCS."""
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="Only image files are allowed.")

    ext = os.path.splitext(file.filename or "img.png")[1] or ".png"
    filename = f"{uuid.uuid4().hex}{ext}"
    gcs_path = f"uploads/{filename}"

    contents = await file.read()

    try:
        import asyncio
        from services.storage_service import upload_bytes
        ct = file.content_type or "image/png"
        await asyncio.get_event_loop().run_in_executor(
            None, lambda: upload_bytes(contents, gcs_path, content_type=ct)
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to upload image: {e}")

    # Return a backend-proxied URL so access is always auth-gated
    url = f"/api/uploads/{filename}"
    return {"url": url, "filename": filename}
