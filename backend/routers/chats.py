import asyncio
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from typing import List, Optional
from models import Chat, User, Project
from auth import get_current_user
from beanie import PydanticObjectId, Link
from datetime import datetime, timezone

router = APIRouter(prefix="/chats", tags=["Chats"])


class ChatCreate(BaseModel):
    project_id: Optional[str] = None
    title: Optional[str] = None

class ChatRename(BaseModel):
    title: str

class AppendMessagesRequest(BaseModel):
    messages: List[dict]  # [{"role": "user"|"assistant", "content": "..."}]


def _owner_id(chat: Chat) -> str:
    return str(chat.user_id.ref.id if isinstance(chat.user_id, Link) else chat.user_id.id)


@router.post("/")
async def create_chat(data: ChatCreate, current_user: User = Depends(get_current_user)):
    """Create a new empty chat session and return its ID."""
    project = None
    if data.project_id:
        try:
            project = await Project.get(PydanticObjectId(data.project_id))
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid project ID")
        if not project:
            raise HTTPException(status_code=404, detail="Project not found")

    chat = Chat(
        user_id=current_user,
        project_id=project,
        title=data.title or "New Chat",
        messages=[],
    )
    await chat.insert()
    return chat


@router.get("/")
async def list_chats(
    project_id: Optional[str] = None,
    current_user: User = Depends(get_current_user),
):
    """Return chats for the current user, optionally filtered by project, newest first."""
    query = Chat.find(Chat.user_id.id == current_user.id)
    if project_id:
        try:
            pid = PydanticObjectId(project_id)
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid project ID")
        query = query.find(Chat.project_id.id == pid)
    chats = await query.sort(-Chat.updated_at).to_list()
    return chats


@router.get("/{chat_id}")
async def get_chat(
    chat_id: PydanticObjectId,
    current_user: User = Depends(get_current_user),
    offset: int = Query(default=0, ge=0, description="Number of messages to skip from the start"),
    limit: int = Query(default=100, ge=1, le=500, description="Max number of messages to return"),
):
    """Return a single chat with paginated messages."""
    chat = await Chat.get(chat_id)
    if not chat:
        raise HTTPException(status_code=404, detail="Chat not found")
    if _owner_id(chat) != str(current_user.id):
        raise HTTPException(status_code=403, detail="Forbidden")

    all_messages = chat.messages or []
    total = len(all_messages)
    paginated = all_messages[offset: offset + limit]

    return {
        "id": str(chat.id),
        "title": chat.title,
        "project_id": str(chat.project_id.ref.id if isinstance(chat.project_id, Link) else chat.project_id.id) if chat.project_id else None,
        "user_id": str(chat.user_id.ref.id if isinstance(chat.user_id, Link) else chat.user_id.id),
        "messages": paginated,
        "total_messages": total,
        "offset": offset,
        "limit": limit,
        "created_at": chat.created_at,
        "updated_at": chat.updated_at,
    }


@router.post("/{chat_id}/messages")
async def append_messages(
    chat_id: PydanticObjectId,
    request: AppendMessagesRequest,
    current_user: User = Depends(get_current_user),
):
    """
    Append one or more messages to an existing chat.
    Also updates the chat title from the first user message if still 'New Chat'.
    """
    chat = await Chat.get(chat_id)
    if not chat:
        raise HTTPException(status_code=404, detail="Chat not found")
    if _owner_id(chat) != str(current_user.id):
        raise HTTPException(status_code=403, detail="Forbidden")

    now = datetime.now(timezone.utc).isoformat()
    stamped = [
        {"role": m.get("role", "user"), "content": m.get("content", ""), "created_at": now}
        for m in request.messages
        if m.get("content", "").strip()
    ]
    chat.messages = (chat.messages or []) + stamped

    # Auto-title: kick off in background so the response isn't blocked
    needs_title = chat.title == "New Chat"
    first_user_msg = None
    if needs_title:
        for msg in stamped:
            if msg["role"] == "user" and msg["content"]:
                first_user_msg = msg["content"]
                chat.title = first_user_msg[:70].strip()  # immediate fallback title
                break

    chat.updated_at = datetime.now(timezone.utc)
    await chat.save()

    if needs_title and first_user_msg:
        asyncio.create_task(_generate_title_in_background(chat.id, first_user_msg))

    return chat


async def _generate_title_in_background(chat_id: PydanticObjectId, user_message: str):
    """Generate an AI title for the chat without blocking the response."""
    try:
        from langchain_google_genai import ChatGoogleGenerativeAI
        from utils.research_paper_summariser.config import get_google_api_key
        llm = ChatGoogleGenerativeAI(
            model="gemini-2.5-flash",
            google_api_key=get_google_api_key(),
            temperature=0.4,
        )
        prompt = f"Generate a highly concise 3-4 word title for a research chat that starts with this message:\n\n{user_message}\n\nReturn ONLY the title text, nothing else."
        response = await llm.ainvoke(prompt)
        generated_title = (response.content if hasattr(response, 'content') else str(response)).strip()
        if generated_title.startswith('"') and generated_title.endswith('"'):
            generated_title = generated_title[1:-1]
        generated_title = generated_title[:100].strip()
        if generated_title:
            chat = await Chat.get(chat_id)
            if chat:
                chat.title = generated_title
                await chat.save()
    except Exception:
        pass  # fallback title was already set synchronously


@router.delete("/{chat_id}")
async def delete_chat(chat_id: PydanticObjectId, current_user: User = Depends(get_current_user)):
    chat = await Chat.get(chat_id)
    if not chat:
        raise HTTPException(status_code=404, detail="Chat not found")
    if _owner_id(chat) != str(current_user.id):
        raise HTTPException(status_code=403, detail="Forbidden")
    await chat.delete()
    return {"message": "Chat deleted"}

@router.put("/{chat_id}/rename")
async def rename_chat(
    chat_id: PydanticObjectId, 
    data: ChatRename, 
    current_user: User = Depends(get_current_user)
):
    chat = await Chat.get(chat_id)
    if not chat:
        raise HTTPException(status_code=404, detail="Chat not found")
    if _owner_id(chat) != str(current_user.id):
        raise HTTPException(status_code=403, detail="Forbidden")

    chat.title = data.title.strip() or "Untitled Chat"
    chat.updated_at = datetime.now(timezone.utc)
    await chat.save()
    return chat
