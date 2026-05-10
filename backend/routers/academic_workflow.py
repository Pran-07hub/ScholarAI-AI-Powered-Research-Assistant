from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Optional
from beanie import PydanticObjectId, Link

from models import User, Project, Paper
from auth import get_current_user
from services.academic_workflow_service import (
    stream_grant_literature_review,
    stream_thesis_outline,
    stream_rebuttal_response,
)

router = APIRouter(prefix="/academic-workflow", tags=["Academic Workflow"])


async def _get_project_papers(project_id: PydanticObjectId, current_user: User):
    project = await Project.get(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    owner_id = project.user_id.ref.id if isinstance(project.user_id, Link) else project.user_id.id
    # Allow project members too
    member_ids = []
    for m in (project.members or []):
        mid = m.ref.id if isinstance(m, Link) else m.id
        member_ids.append(str(mid))
    if str(owner_id) != str(current_user.id) and str(current_user.id) not in member_ids:
        raise HTTPException(status_code=403, detail="Forbidden")
    papers = await Paper.find(Paper.project_id.id == project.id).to_list()
    return project, [
        {
            "title": p.title,
            "authors": p.authors,
            "abstract": p.abstract or "",
            "publication_date": p.publication_date.isoformat() if p.publication_date else "",
        }
        for p in papers
    ]


class GrantRequest(BaseModel):
    grant_context: Optional[str] = ""


class ThesisRequest(BaseModel):
    thesis_type: Optional[str] = "PhD"


class RebuttalRequest(BaseModel):
    reviewer_comments: str


@router.post("/grant/{project_id}")
async def grant_literature_review(
    project_id: PydanticObjectId,
    body: GrantRequest,
    current_user: User = Depends(get_current_user),
):
    """Stream a grant-proposal literature review section."""
    project, papers = await _get_project_papers(project_id, current_user)
    if not papers:
        raise HTTPException(status_code=400, detail="No papers in project")

    async def generate():
        async for chunk in stream_grant_literature_review(papers, project.name, body.grant_context or ""):
            yield chunk

    return StreamingResponse(generate(), media_type="text/plain")


@router.post("/thesis/{project_id}")
async def thesis_outline(
    project_id: PydanticObjectId,
    body: ThesisRequest,
    current_user: User = Depends(get_current_user),
):
    """Stream a thesis chapter outline."""
    project, papers = await _get_project_papers(project_id, current_user)
    if not papers:
        raise HTTPException(status_code=400, detail="No papers in project")

    async def generate():
        async for chunk in stream_thesis_outline(papers, project.name, body.thesis_type or "PhD"):
            yield chunk

    return StreamingResponse(generate(), media_type="text/plain")


@router.post("/rebuttal/{project_id}")
async def rebuttal_helper(
    project_id: PydanticObjectId,
    body: RebuttalRequest,
    current_user: User = Depends(get_current_user),
):
    """Stream a point-by-point reviewer rebuttal using project papers."""
    if not body.reviewer_comments.strip():
        raise HTTPException(status_code=400, detail="reviewer_comments is required")
    project, papers = await _get_project_papers(project_id, current_user)

    async def generate():
        async for chunk in stream_rebuttal_response(papers, project.name, body.reviewer_comments):
            yield chunk

    return StreamingResponse(generate(), media_type="text/plain")
