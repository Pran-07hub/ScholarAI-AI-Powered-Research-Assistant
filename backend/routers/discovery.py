from fastapi import APIRouter, Depends, HTTPException
from beanie import PydanticObjectId
from models import User, Project, Paper
from auth import get_current_user
from services.discovery_service import (
    get_trending_papers,
    get_seminal_papers,
    get_reading_recommendations,
)
from services.citation_graph_service import build_citation_graph
from utils.project_access import require_project_access

router = APIRouter(prefix="/discovery", tags=["Discovery"])


@router.get("/trending")
async def trending_papers(
    topic: str = "machine learning",
    limit: int = 12,
    current_user: User = Depends(get_current_user),
):
    """Fetch recently submitted papers. If topic is not provided, uses user's research_domains."""
    effective_topic = topic
    if topic == "machine learning" and current_user.preferences.research_domains:
        # Use first research domain as default instead of generic fallback
        effective_topic = current_user.preferences.research_domains[0]
    papers = await get_trending_papers(effective_topic, limit=limit)
    return {"papers": papers, "topic": effective_topic}


@router.get("/seminal")
async def seminal_papers(
    topic: str = "machine learning",
    limit: int = 12,
    current_user: User = Depends(get_current_user),
):
    """Fetch highly-cited (seminal) papers. Uses user's research_domains as default topic."""
    effective_topic = topic
    if topic == "machine learning" and current_user.preferences.research_domains:
        effective_topic = current_user.preferences.research_domains[0]
    papers = await get_seminal_papers(effective_topic, limit=limit)
    return {"papers": papers, "topic": effective_topic}


@router.get("/recommendations/{project_id}")
async def reading_recommendations(
    project_id: PydanticObjectId,
    current_user: User = Depends(get_current_user),
):
    """AI-powered 'what should I read next' based on the project's existing papers."""
    project = await Project.get(project_id)
    require_project_access(project, current_user)

    papers = await Paper.find(Paper.project_id.id == project.id).to_list()
    papers_dicts = [
        {
            "title": p.title,
            "authors": p.authors,
            "abstract": p.abstract or "",
        }
        for p in papers
    ]

    # Enrich context with user's research domains
    domain_context = ", ".join(current_user.preferences.research_domains) if current_user.preferences.research_domains else ""
    description = project.description or ""
    if domain_context:
        description = f"{description}\nResearcher's domains: {domain_context}".strip()

    result = await get_reading_recommendations(
        project.name,
        description,
        papers_dicts,
    )
    return result


@router.get("/citation-graph/{project_id}")
async def citation_graph(
    project_id: PydanticObjectId,
    current_user: User = Depends(get_current_user),
):
    """
    Build a citation relationship graph for all papers in a project.
    Returns nodes + edges for force-directed visualization.
    """
    project = await Project.get(project_id)
    require_project_access(project, current_user)

    papers = await Paper.find(Paper.project_id.id == project.id).to_list()
    papers_dicts = [
        {
            "title": p.title,
            "authors": p.authors,
            "publication_date": p.publication_date.isoformat() if p.publication_date else "",
            "pdf_url": p.pdf_url or "",
        }
        for p in papers
    ]

    graph = await build_citation_graph(papers_dicts)
    return graph
