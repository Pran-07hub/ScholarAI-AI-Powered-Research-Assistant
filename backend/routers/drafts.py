from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import List, Optional
from models import Draft, Project, User
from auth import get_current_user
from beanie import PydanticObjectId, Link
from datetime import datetime, timezone
from utils.project_access import require_project_access, ProjectRole

router = APIRouter(prefix="/drafts", tags=["Drafts"])


class DraftCreate(BaseModel):
    project_id: str
    title: str
    content: str = ""
    status: str = "outline"


class DraftUpdate(BaseModel):
    title: Optional[str] = None
    content: Optional[str] = None
    status: Optional[str] = None


def _resolve_id(link_or_id) -> str:
    if isinstance(link_or_id, Link):
        return str(link_or_id.ref.id)
    return str(link_or_id.id)


@router.post("/")
async def create_draft(data: DraftCreate, current_user: User = Depends(get_current_user)):
    """Create a new draft document in a project."""
    project = await Project.get(PydanticObjectId(data.project_id))
    require_project_access(project, current_user)

    draft = Draft(
        project_id=project,
        title=data.title,
        content=data.content,
        version=1,
        status=data.status,
    )
    await draft.insert()
    return draft


@router.get("/project/{project_id}")
async def list_drafts(
    project_id: PydanticObjectId,
    current_user: User = Depends(get_current_user),
):
    """List all drafts in a project."""
    project = await Project.get(project_id)
    require_project_access(project, current_user)

    drafts = await Draft.find(Draft.project_id.id == project_id).sort(-Draft.updated_at).to_list()
    return drafts


@router.get("/{draft_id}")
async def get_draft(draft_id: PydanticObjectId, current_user: User = Depends(get_current_user)):
    """Get a single draft."""
    draft = await Draft.get(draft_id)
    if not draft:
        raise HTTPException(status_code=404, detail="Draft not found")

    project = await Project.get(
        draft.project_id.ref.id if isinstance(draft.project_id, Link) else draft.project_id.id
    )
    require_project_access(project, current_user)
    return draft


@router.put("/{draft_id}")
async def update_draft(
    draft_id: PydanticObjectId,
    data: DraftUpdate,
    current_user: User = Depends(get_current_user),
):
    """Update draft content, title, or status. Bumps version on content change."""
    draft = await Draft.get(draft_id)
    if not draft:
        raise HTTPException(status_code=404, detail="Draft not found")

    project = await Project.get(
        draft.project_id.ref.id if isinstance(draft.project_id, Link) else draft.project_id.id
    )
    require_project_access(project, current_user)

    if data.title is not None:
        draft.title = data.title
    if data.content is not None and data.content != draft.content:
        draft.content = data.content
        draft.version += 1
    if data.status is not None:
        draft.status = data.status

    draft.updated_at = datetime.now(timezone.utc)
    await draft.save()
    return draft


@router.delete("/{draft_id}")
async def delete_draft(draft_id: PydanticObjectId, current_user: User = Depends(get_current_user)):
    """Delete a draft."""
    draft = await Draft.get(draft_id)
    if not draft:
        raise HTTPException(status_code=404, detail="Draft not found")

    project = await Project.get(
        draft.project_id.ref.id if isinstance(draft.project_id, Link) else draft.project_id.id
    )
    require_project_access(project, current_user, min_role=ProjectRole.OWNER)
    await draft.delete()
    return {"message": "Draft deleted"}


@router.post("/{draft_id}/ai-improve")
async def ai_improve_draft(
    draft_id: PydanticObjectId,
    current_user: User = Depends(get_current_user),
):
    """Use Gemini to improve the draft's academic tone and clarity."""
    from langchain_google_genai import ChatGoogleGenerativeAI
    from utils.research_paper_summariser.config import get_google_api_key

    draft = await Draft.get(draft_id)
    if not draft:
        raise HTTPException(status_code=404, detail="Draft not found")

    project = await Project.get(
        draft.project_id.ref.id if isinstance(draft.project_id, Link) else draft.project_id.id
    )
    require_project_access(project, current_user)

    if not draft.content.strip():
        raise HTTPException(status_code=400, detail="Draft content is empty")

    # Adjust strictness based on user preferences
    strictness = current_user.preferences.ai_strictness
    tone_instruction = {
        "strict": "Use highly formal academic language with precise terminology.",
        "balanced": "Use clear academic language that is readable and professional.",
        "creative": "Improve clarity and flow while keeping the author's voice.",
    }.get(strictness, "Use clear academic language.")

    prompt = (
        f"You are an expert academic writing assistant. {tone_instruction}\n\n"
        f"Improve the following draft. Fix grammar, enhance clarity, improve academic tone, "
        f"and ensure logical flow. Return ONLY the improved text, nothing else:\n\n"
        f"{draft.content}"
    )

    try:
        llm = ChatGoogleGenerativeAI(
            model="gemini-2.5-flash",
            google_api_key=get_google_api_key(),
            temperature=0.3,
        )
        response = await llm.ainvoke(prompt)
        improved = response.content if hasattr(response, "content") else str(response)
        return {"improved_content": improved.strip(), "original_version": draft.version}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"AI improvement failed: {str(e)}")
