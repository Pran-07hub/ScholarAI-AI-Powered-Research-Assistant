from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import List, Optional
from beanie import PydanticObjectId, Link

from models import User, Project, Paper, TrackedConference
from auth import get_current_user
from services.conference_service import fetch_wikicfp_conferences, get_conferences_for_project

router = APIRouter(prefix="/conferences", tags=["Conferences"])


class TrackConferenceRequest(BaseModel):
    conference_name: str
    conference_website: Optional[str] = None
    topics: List[str] = []


@router.get("")
async def list_conferences(topics: str = "machine learning", limit: int = 20):
    """List upcoming conferences for comma-separated topics."""
    topic_list = [t.strip() for t in topics.split(",") if t.strip()]

    all_conferences: list = []
    seen: set = set()
    for topic in topic_list[:3]:
        confs = await fetch_wikicfp_conferences(topic, limit=limit)
        for c in confs:
            if c["name"] not in seen:
                seen.add(c["name"])
                all_conferences.append(c)

    return {"conferences": all_conferences}


@router.get("/project/{project_id}")
async def project_conferences(
    project_id: PydanticObjectId,
    current_user: User = Depends(get_current_user),
):
    """Get conferences relevant to a project based on its papers and description."""
    project = await Project.get(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    owner_id = project.user_id.ref.id if isinstance(project.user_id, Link) else project.user_id.id
    if str(owner_id) != str(current_user.id):
        raise HTTPException(status_code=403, detail="Forbidden")

    papers = await Paper.find(Paper.project_id.id == project.id).to_list()
    paper_titles = [p.title for p in papers[:12]]

    conferences = await get_conferences_for_project(
        project.name,
        project.description or "",
        paper_titles,
    )
    return {"conferences": conferences}


@router.get("/tracked")
async def get_tracked_conferences(current_user: User = Depends(get_current_user)):
    """Return all conferences the user is tracking."""
    tracked = await TrackedConference.find(
        TrackedConference.user_id.id == current_user.id
    ).to_list()
    return {
        "tracked": [
            {
                "id": str(t.id),
                "conference_name": t.conference_name,
                "conference_website": t.conference_website,
                "topics": t.topics,
                "created_at": t.created_at.isoformat(),
            }
            for t in tracked
        ]
    }


@router.post("/track")
async def track_conference(
    request: TrackConferenceRequest,
    current_user: User = Depends(get_current_user),
):
    """Start tracking a conference."""
    tracked = TrackedConference(
        user_id=current_user,
        conference_name=request.conference_name,
        conference_website=request.conference_website,
        topics=request.topics,
    )
    await tracked.insert()
    return {"message": "Conference tracked", "id": str(tracked.id)}


@router.delete("/track/{tracked_id}")
async def untrack_conference(
    tracked_id: str,
    current_user: User = Depends(get_current_user),
):
    """Stop tracking a conference."""
    tracked = await TrackedConference.get(tracked_id)
    if not tracked:
        raise HTTPException(status_code=404, detail="Not found")

    owner_id = tracked.user_id.ref.id if isinstance(tracked.user_id, Link) else tracked.user_id.id
    if str(owner_id) != str(current_user.id):
        raise HTTPException(status_code=403, detail="Forbidden")

    await tracked.delete()
    return {"message": "Untracked"}
