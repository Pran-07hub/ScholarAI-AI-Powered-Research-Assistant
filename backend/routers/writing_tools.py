from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse, PlainTextResponse
from pydantic import BaseModel
from typing import List, Optional
from beanie import PydanticObjectId

from models import User, Project, Paper
from auth import get_current_user
from services.writing_tools_service import (
    stream_related_work,
    detect_contradictions,
    generate_bibtex,
    generate_latex_section,
)
from utils.project_access import require_project_access

router = APIRouter(prefix="/writing-tools", tags=["Writing Tools"])

# ai_strictness → LLM temperature mapping
_STRICTNESS_TEMP = {"strict": 0.1, "balanced": 0.3, "creative": 0.6}


async def _load_project_papers(project_id: PydanticObjectId, current_user: User) -> tuple:
    """Load, authorise project, and return (project, papers_list)."""
    project = await Project.get(project_id)
    require_project_access(project, current_user)
    papers = await Paper.find(Paper.project_id.id == project.id).to_list()
    return project, papers


def _papers_to_dicts(papers) -> list:
    return [
        {
            "title": p.title,
            "authors": p.authors,
            "abstract": p.abstract or "",
            "publication_date": p.publication_date.isoformat() if p.publication_date else "",
            "venue": getattr(p, "venue", None) or "",
            "pdf_url": p.pdf_url or "",
            "source": p.source,
        }
        for p in papers
    ]


# ── Related Work Generator ────────────────────────────────────────────────────

@router.post("/related-work/{project_id}")
async def related_work(
    project_id: PydanticObjectId,
    current_user: User = Depends(get_current_user),
):
    """Stream a Related Work section drafted from the project's papers."""
    project, papers = await _load_project_papers(project_id, current_user)
    if not papers:
        raise HTTPException(status_code=400, detail="No papers in project")

    paper_dicts = _papers_to_dicts(papers)

    temperature = _STRICTNESS_TEMP.get(current_user.preferences.ai_strictness, 0.4)

    async def generate():
        async for chunk in stream_related_work(paper_dicts, project.name, temperature=temperature):
            yield chunk

    return StreamingResponse(generate(), media_type="text/plain")


# ── Contradiction Detector ────────────────────────────────────────────────────

@router.post("/contradictions/{project_id}")
async def contradiction_detector(
    project_id: PydanticObjectId,
    current_user: User = Depends(get_current_user),
):
    """Detect factual/methodological contradictions across project papers."""
    project, papers = await _load_project_papers(project_id, current_user)
    if len(papers) < 2:
        raise HTTPException(status_code=400, detail="Need at least 2 papers")

    paper_dicts = _papers_to_dicts(papers)
    result = await detect_contradictions(paper_dicts)
    return result


# ── Export Endpoints ──────────────────────────────────────────────────────────

@router.get("/export/{project_id}/bibtex")
async def export_bibtex(
    project_id: PydanticObjectId,
    current_user: User = Depends(get_current_user),
):
    """Download a BibTeX file for all papers in the project."""
    project, papers = await _load_project_papers(project_id, current_user)
    if not papers:
        raise HTTPException(status_code=400, detail="No papers in project")

    bibtex = generate_bibtex(_papers_to_dicts(papers))
    filename = project.name.replace(" ", "_")[:40] + ".bib"
    return PlainTextResponse(
        content=bibtex,
        media_type="text/plain",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/export/{project_id}/latex")
async def export_latex(
    project_id: PydanticObjectId,
    current_user: User = Depends(get_current_user),
):
    """Download a LaTeX bibliography snippet for all papers in the project."""
    project, papers = await _load_project_papers(project_id, current_user)
    if not papers:
        raise HTTPException(status_code=400, detail="No papers in project")

    latex = generate_latex_section(
        _papers_to_dicts(papers),
        section_title=f"References — {project.name}",
    )
    filename = project.name.replace(" ", "_")[:40] + "_bibliography.tex"
    return PlainTextResponse(
        content=latex,
        media_type="text/plain",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
