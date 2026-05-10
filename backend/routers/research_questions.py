"""
Research Question Tracker
Allows users to define formal research questions per project and tag papers
as supporting, contradicting, or partially addressing each question.
"""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import List, Optional
from models import User, Project, Paper, ResearchQuestion
from auth import get_current_user
from utils.project_access import require_project_access
from utils.sanitize import sanitize_plain_text
from beanie import PydanticObjectId, Link
from datetime import datetime

router = APIRouter(prefix="/projects/{project_id}/research-questions", tags=["Research Questions"])


class QuestionCreate(BaseModel):
    question: str
    description: Optional[str] = None


class PaperTagRequest(BaseModel):
    paper_id: str
    stance: str  # "supports" | "contradicts" | "partial"
    note: Optional[str] = None


@router.post("")
async def create_question(
    project_id: PydanticObjectId,
    body: QuestionCreate,
    current_user: User = Depends(get_current_user),
):
    project = await Project.get(project_id)
    require_project_access(project, current_user)

    rq = ResearchQuestion(
        project_id=project,
        question=sanitize_plain_text(body.question),
        description=sanitize_plain_text(body.description) if body.description else None,
    )
    await rq.insert()
    return rq


@router.get("")
async def list_questions(
    project_id: PydanticObjectId,
    current_user: User = Depends(get_current_user),
):
    project = await Project.get(project_id)
    require_project_access(project, current_user)

    questions = await ResearchQuestion.find(
        ResearchQuestion.project_id.id == project.id
    ).sort(-ResearchQuestion.created_at).to_list()
    return questions


@router.get("/{question_id}")
async def get_question(
    project_id: PydanticObjectId,
    question_id: PydanticObjectId,
    current_user: User = Depends(get_current_user),
):
    project = await Project.get(project_id)
    require_project_access(project, current_user)

    rq = await ResearchQuestion.get(question_id)
    if not rq:
        raise HTTPException(status_code=404, detail="Research question not found")
    return rq


@router.put("/{question_id}")
async def update_question(
    project_id: PydanticObjectId,
    question_id: PydanticObjectId,
    body: QuestionCreate,
    current_user: User = Depends(get_current_user),
):
    project = await Project.get(project_id)
    require_project_access(project, current_user)

    rq = await ResearchQuestion.get(question_id)
    if not rq:
        raise HTTPException(status_code=404, detail="Research question not found")

    rq.question = sanitize_plain_text(body.question)
    rq.description = sanitize_plain_text(body.description) if body.description else None
    rq.updated_at = datetime.utcnow()
    await rq.save()
    return rq


@router.delete("/{question_id}")
async def delete_question(
    project_id: PydanticObjectId,
    question_id: PydanticObjectId,
    current_user: User = Depends(get_current_user),
):
    project = await Project.get(project_id)
    require_project_access(project, current_user)

    rq = await ResearchQuestion.get(question_id)
    if not rq:
        raise HTTPException(status_code=404, detail="Research question not found")
    await rq.delete()
    return {"message": "Deleted"}


@router.post("/{question_id}/tag-paper")
async def tag_paper(
    project_id: PydanticObjectId,
    question_id: PydanticObjectId,
    body: PaperTagRequest,
    current_user: User = Depends(get_current_user),
):
    """Tag a paper as supporting, contradicting, or partially addressing a research question."""
    if body.stance not in ("supports", "contradicts", "partial"):
        raise HTTPException(status_code=400, detail="stance must be 'supports', 'contradicts', or 'partial'")

    project = await Project.get(project_id)
    require_project_access(project, current_user)

    rq = await ResearchQuestion.get(question_id)
    if not rq:
        raise HTTPException(status_code=404, detail="Research question not found")

    # Verify paper exists and belongs to this project
    try:
        paper = await Paper.get(PydanticObjectId(body.paper_id))
    except Exception:
        paper = None
    if not paper:
        raise HTTPException(status_code=404, detail="Paper not found")

    paper_proj_id = str(paper.project_id.ref.id if isinstance(paper.project_id, Link) else paper.project_id.id)
    if paper_proj_id != str(project_id):
        raise HTTPException(status_code=403, detail="Paper does not belong to this project")

    # Remove any existing tag for this paper
    rq.paper_tags = [t for t in rq.paper_tags if t.get("paper_id") != body.paper_id]

    tag = {
        "paper_id": body.paper_id,
        "paper_title": paper.title,
        "stance": body.stance,
        "note": sanitize_plain_text(body.note) if body.note else None,
    }
    rq.paper_tags.append(tag)
    rq.updated_at = datetime.utcnow()
    await rq.save()
    return rq


@router.delete("/{question_id}/tag-paper/{paper_id}")
async def remove_paper_tag(
    project_id: PydanticObjectId,
    question_id: PydanticObjectId,
    paper_id: str,
    current_user: User = Depends(get_current_user),
):
    project = await Project.get(project_id)
    require_project_access(project, current_user)

    rq = await ResearchQuestion.get(question_id)
    if not rq:
        raise HTTPException(status_code=404, detail="Research question not found")

    rq.paper_tags = [t for t in rq.paper_tags if t.get("paper_id") != paper_id]
    rq.updated_at = datetime.utcnow()
    await rq.save()
    return rq
