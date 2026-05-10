from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from typing import List, Optional
from models import User, Alert, Project, Paper, Note
from auth import get_current_user
from utils.news_fetcher import get_research_news, NewsRequest, NewsResponse
from beanie import PydanticObjectId, Link
from datetime import datetime

router = APIRouter(prefix="/news", tags=["Research News"])
alerts_router = APIRouter(prefix="/alerts", tags=["News Alerts"])


class SaveArticleRequest(BaseModel):
    title: str
    link: str
    summary: Optional[str] = None
    source: str = ""
    project_id: str


@router.get("/research")
async def research_news(domain: str = "", keywords: str = ""):
    """Fetch research news by domain and/or keywords."""
    raw = f"{domain} {keywords}".strip()
    # Support comma-separated keywords
    topics = [t.strip() for t in raw.replace(",", " ").split() if t.strip()]
    if not topics:
        topics = ["academic research"]
    response = await get_research_news(NewsRequest(topics=topics[:5]))
    return response


@router.get("/project/{project_id}")
async def project_contextual_news(
    project_id: PydanticObjectId,
    current_user: User = Depends(get_current_user)
):
    """
    Fetch news articles that are contextually relevant to the given project.
    Derives search topics automatically from the project name, description,
    and saved paper titles.
    """
    project = await Project.get(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    owner_id = str(project.user_id.ref.id if isinstance(project.user_id, Link) else project.user_id.id)
    member_ids = [
        str(m.ref.id if isinstance(m, Link) else m.id)
        for m in (project.members or [])
    ]
    if str(current_user.id) != owner_id and str(current_user.id) not in member_ids:
        raise HTTPException(status_code=403, detail="Forbidden")

    # Build a deduplicated set of search topics from the project context
    topics: List[str] = []

    if project.name:
        topics.append(project.name)

    if project.description:
        # Use first 80 chars of description as a topic
        topics.append(project.description[:80].strip())

    # Pull up to 6 papers and extract short keyword phrases from their titles
    papers = await Paper.find(Paper.project_id.id == project.id).to_list()
    for paper in papers[:6]:
        # Take the first 5 meaningful words from the title as a search phrase
        words = [w for w in paper.title.split() if len(w) > 2][:5]
        if words:
            topics.append(" ".join(words))

    # Deduplicate while preserving order
    seen = set()
    unique_topics: List[str] = []
    for t in topics:
        if t.lower() not in seen:
            seen.add(t.lower())
            unique_topics.append(t)

    if not unique_topics:
        unique_topics = ["academic research"]

    response = await get_research_news(NewsRequest(topics=unique_topics[:6], limit=6))
    return response


@router.get("/search")
async def search_news(
    keywords: str = Query(..., description="Comma-separated keywords"),
    limit: int = Query(10, ge=1, le=30),
):
    """Search news by custom keywords (not project-scoped)."""
    topics = [t.strip() for t in keywords.replace(",", " ").split() if t.strip()]
    if not topics:
        raise HTTPException(status_code=400, detail="keywords must not be empty")
    response = await get_research_news(NewsRequest(topics=topics[:5], limit=limit))
    return response


@router.post("/save-to-notes")
async def save_article_as_note(
    body: SaveArticleRequest,
    current_user: User = Depends(get_current_user),
):
    """Save a news article as a note in the given project."""
    project = await Project.get(PydanticObjectId(body.project_id))
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    # Verify access
    owner_id = project.user_id.ref.id if isinstance(project.user_id, Link) else project.user_id.id
    member_ids = [
        str(m.ref.id if isinstance(m, Link) else m.id)
        for m in (project.members or [])
    ]
    if str(owner_id) != str(current_user.id) and str(current_user.id) not in member_ids:
        raise HTTPException(status_code=403, detail="Forbidden")

    content = f"**Source:** [{body.source}]({body.link})\n\n"
    if body.summary:
        content += f"{body.summary}\n\n"
    content += f"[Read full article]({body.link})"

    note = Note(
        project_id=project,
        title=body.title[:200],
        content=content,
        tags=["news", body.source] if body.source else ["news"],
    )
    await note.insert()
    return {"message": "Article saved as note", "note_id": str(note.id)}


@alerts_router.post("/subscribe")
async def subscribe_alert(alert: Alert, current_user: User = Depends(get_current_user)):
    alert.user_id = current_user
    await alert.insert()
    return {"message": "Subscribed to alert", "alert_id": str(alert.id)}


@alerts_router.delete("/unsubscribe/{alert_id}")
async def unsubscribe_alert(alert_id: str, current_user: User = Depends(get_current_user)):
    alert = await Alert.get(alert_id)
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")
    alert_owner_id = alert.user_id.ref.id if isinstance(alert.user_id, Link) else alert.user_id.id
    if str(alert_owner_id) != str(current_user.id):
        raise HTTPException(status_code=403, detail="Forbidden")
    await alert.delete()
    return {"message": "Unsubscribed"}
