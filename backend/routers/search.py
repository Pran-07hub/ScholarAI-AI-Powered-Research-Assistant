"""
Global search endpoint.
Searches across Papers (title/abstract), Notes (content/title),
and Annotations (content/quote) within projects the user has access to.
"""

from fastapi import APIRouter, Depends, Query
from typing import List, Optional
from models import User, Project, Paper, Note, PaperAnnotation
from auth import get_current_user
from beanie import PydanticObjectId, Link

router = APIRouter(prefix="/search", tags=["Search"])


def _text_match(text: Optional[str], q: str) -> bool:
    if not text:
        return False
    return q.lower() in text.lower()


@router.get("")
async def global_search(
    q: str = Query(..., min_length=2, description="Search query"),
    project_id: Optional[str] = Query(None, description="Limit search to a specific project"),
    limit: int = Query(30, ge=1, le=100),
    current_user: User = Depends(get_current_user),
):
    """
    Search across papers, notes, and annotations.
    If project_id is provided, only searches within that project.
    Otherwise searches across all projects the user has access to.
    """
    uid = current_user.id
    results = []

    # Resolve accessible project IDs
    if project_id:
        try:
            pid = PydanticObjectId(project_id)
        except Exception:
            return {"results": [], "total": 0}

        project = await Project.get(pid)
        if not project:
            return {"results": [], "total": 0}

        owner_id = project.user_id.ref.id if isinstance(project.user_id, Link) else project.user_id.id
        member_ids = [
            str(m.ref.id if isinstance(m, Link) else m.id)
            for m in (project.members or [])
        ]
        if str(owner_id) != str(uid) and str(uid) not in member_ids:
            return {"results": [], "total": 0}

        accessible_projects = [project]
    else:
        accessible_projects = await Project.find({
            "$or": [
                {"user_id.$id": uid},
                {"members.$id": uid},
            ]
        }).to_list()

    accessible_project_ids = {str(p.id) for p in accessible_projects}
    project_name_map = {str(p.id): p.name for p in accessible_projects}

    # Search papers
    papers = await Paper.find_all().to_list()
    for paper in papers:
        pid_str = str(paper.project_id.ref.id if isinstance(paper.project_id, Link) else paper.project_id.id)
        if pid_str not in accessible_project_ids:
            continue
        if _text_match(paper.title, q) or _text_match(paper.abstract, q):
            results.append({
                "type": "paper",
                "id": str(paper.id),
                "title": paper.title,
                "snippet": _get_snippet(paper.abstract or "", q),
                "authors": paper.authors[:3],
                "project_id": pid_str,
                "project_name": project_name_map.get(pid_str, ""),
                "created_at": paper.created_at.isoformat(),
            })

    # Search notes
    notes = await Note.find_all().to_list()
    for note in notes:
        pid_str = str(note.project_id.ref.id if isinstance(note.project_id, Link) else note.project_id.id)
        if pid_str not in accessible_project_ids:
            continue
        if _text_match(note.title, q) or _text_match(note.content, q):
            results.append({
                "type": "note",
                "id": str(note.id),
                "title": note.title,
                "snippet": _get_snippet(note.content, q),
                "project_id": pid_str,
                "project_name": project_name_map.get(pid_str, ""),
                "created_at": note.updated_at.isoformat(),
            })

    # Search annotations
    annotations = await PaperAnnotation.find_all().to_list()
    for ann in annotations:
        pid_str = str(ann.project_id.ref.id if isinstance(ann.project_id, Link) else ann.project_id.id)
        if pid_str not in accessible_project_ids:
            continue
        if _text_match(ann.content, q) or _text_match(ann.quote, q):
            results.append({
                "type": "annotation",
                "id": str(ann.id),
                "title": ann.content[:80],
                "snippet": _get_snippet(ann.content, q),
                "quote": ann.quote,
                "project_id": pid_str,
                "project_name": project_name_map.get(pid_str, ""),
                "created_at": ann.created_at.isoformat(),
            })

    # Sort by recency
    results.sort(key=lambda x: x["created_at"], reverse=True)
    total = len(results)
    results = results[:limit]

    return {"results": results, "total": total, "query": q}


def _get_snippet(text: str, q: str, context: int = 120) -> str:
    """Return a short snippet with the match highlighted in context."""
    if not text:
        return ""
    lower = text.lower()
    idx = lower.find(q.lower())
    if idx == -1:
        return text[:context] + ("…" if len(text) > context else "")
    start = max(0, idx - 40)
    end = min(len(text), idx + len(q) + 80)
    snippet = ("…" if start > 0 else "") + text[start:end] + ("…" if end < len(text) else "")
    return snippet
