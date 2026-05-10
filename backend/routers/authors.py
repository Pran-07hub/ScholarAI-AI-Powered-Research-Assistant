"""
Author Tracker router
Search for researchers on Semantic Scholar, follow them, and fetch their latest papers.
"""

import asyncio
import time
import urllib.parse
from typing import Dict, List, Tuple, Optional

import aiohttp
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from beanie import Link

from models import User, TrackedAuthor
from auth import get_current_user

router = APIRouter(prefix="/authors", tags=["Author Tracker"])

_SS_BASE = "https://api.semanticscholar.org/graph/v1"
_cache: Dict[str, Tuple[list, float]] = {}
CACHE_TTL = 1800  # 30 min


async def _ss_get(path: str, params: dict = {}) -> dict:
    url = f"{_SS_BASE}{path}"
    async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=15)) as session:
        async with session.get(url, params=params, headers={"Accept": "application/json"}) as r:
            if r.status != 200:
                return {}
            return await r.json()


# ── Search / Lookup ───────────────────────────────────────────────────────────

def _build_queries(query: str) -> List[str]:
    """
    Generate a set of query variants for fuzzy fan-out.
    e.g. "partha pratim" → ["partha pratim", "pratim partha", "partha", "pratim"]
    """
    raw = query.strip()
    tokens = [t for t in raw.split() if len(t) > 1]
    seen: set = set()
    variants: List[str] = []
    for v in [raw, " ".join(reversed(tokens))] + tokens:
        vl = v.lower()
        if vl and vl not in seen:
            seen.add(vl)
            variants.append(v)
    return variants


def _fuzzy_score(name: str, query: str) -> float:
    """Score how well `name` matches `query` (higher = better)."""
    nl = name.lower()
    ql = query.lower().strip()
    qt = ql.split()
    nt = nl.split()

    if nl == ql:
        return 100.0

    score = 0.0
    # Bonus: all query tokens present as substrings of name tokens
    matched = sum(1 for q in qt if any(q in n for n in nt))
    score += (matched / max(len(qt), 1)) * 60
    # Bonus: full query is a substring of the name
    if ql in nl:
        score += 25
    # Bonus: individual query tokens found anywhere in the name
    for q in qt:
        if q in nl:
            score += 8 / max(len(qt), 1)
    # Boost shorter names (closer match) when scores are otherwise tied
    score -= len(nl) * 0.01
    return score


@router.get("/search")
async def search_authors(query: str, limit: int = 10):
    """Fuzzy author search: fans out multiple query variants in parallel then re-ranks."""
    cache_key = f"author_search_v2:{query.lower().strip()}:{limit}"
    if cache_key in _cache:
        data, ts = _cache[cache_key]
        if time.time() - ts < CACHE_TTL:
            return {"authors": data}

    variants = _build_queries(query)

    async def _fetch_one(q: str) -> list:
        try:
            data = await _ss_get(
                "/author/search",
                {
                    "query": q,
                    "fields": "authorId,name,affiliations,paperCount,citationCount,hIndex",
                    "limit": 20,
                },
            )
            return data.get("data", [])
        except Exception:
            return []

    try:
        results_lists = await asyncio.gather(*[_fetch_one(q) for q in variants])

        # Merge and deduplicate by authorId
        seen_ids: set = set()
        candidates = []
        for batch in results_lists:
            for a in batch:
                aid = a.get("authorId", "")
                if aid and aid not in seen_ids:
                    seen_ids.add(aid)
                    candidates.append(a)

        # Re-rank by fuzzy relevance to the original query
        candidates.sort(key=lambda a: _fuzzy_score(a.get("name", ""), query), reverse=True)

        authors = [
            {
                "id": a.get("authorId", ""),
                "name": a.get("name", ""),
                "affiliations": [aff.get("name", "") for aff in (a.get("affiliations") or [])[:2]],
                "paper_count": a.get("paperCount"),
                "citation_count": a.get("citationCount"),
                "h_index": a.get("hIndex"),
            }
            for a in candidates[:limit]
        ]

        _cache[cache_key] = (authors, time.time())
        return {"authors": authors}
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Semantic Scholar error: {e}")


@router.get("/{ss_id}/papers")
async def author_papers(ss_id: str, limit: int = 15):
    """Fetch latest papers for a Semantic Scholar author ID."""
    cache_key = f"author_papers:{ss_id}:{limit}"
    if cache_key in _cache:
        data, ts = _cache[cache_key]
        if time.time() - ts < CACHE_TTL:
            return {"papers": data}

    try:
        data = await _ss_get(
            f"/author/{ss_id}/papers",
            {
                "fields": "title,year,abstract,citationCount,openAccessPdf,externalIds",
                "limit": limit,
                "sort": "year:desc",
            },
        )
        papers = []
        for p in data.get("data", []):
            ext = p.get("externalIds") or {}
            arxiv_id = ext.get("ArXiv", "")
            url = (
                f"https://arxiv.org/abs/{arxiv_id}"
                if arxiv_id
                else f"https://www.semanticscholar.org/paper/{p.get('paperId', '')}"
            )
            papers.append({
                "id": p.get("paperId", ""),
                "title": p.get("title", ""),
                "year": p.get("year"),
                "abstract": (p.get("abstract") or "")[:400],
                "citation_count": p.get("citationCount"),
                "url": url,
                "pdf_url": (p.get("openAccessPdf") or {}).get("url", ""),
            })
        _cache[cache_key] = (papers, time.time())
        return {"papers": papers}
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Semantic Scholar error: {e}")


# ── Track / Untrack ───────────────────────────────────────────────────────────

class TrackAuthorRequest(BaseModel):
    author_name: str
    semantic_scholar_id: Optional[str] = None
    affiliation: Optional[str] = None
    h_index: Optional[int] = None
    paper_count: Optional[int] = None
    citation_count: Optional[int] = None


@router.get("/tracked")
async def list_tracked(current_user: User = Depends(get_current_user)):
    tracked = await TrackedAuthor.find(
        TrackedAuthor.user_id.id == current_user.id
    ).to_list()
    return {
        "authors": [
            {
                "id": str(t.id),
                "author_name": t.author_name,
                "semantic_scholar_id": t.semantic_scholar_id,
                "affiliation": t.affiliation,
                "h_index": t.h_index,
                "paper_count": t.paper_count,
                "citation_count": t.citation_count,
            }
            for t in tracked
        ]
    }


@router.post("/track")
async def track_author(
    request: TrackAuthorRequest,
    current_user: User = Depends(get_current_user),
):
    author = TrackedAuthor(
        user_id=current_user,
        author_name=request.author_name,
        semantic_scholar_id=request.semantic_scholar_id,
        affiliation=request.affiliation,
        h_index=request.h_index,
        paper_count=request.paper_count,
        citation_count=request.citation_count,
    )
    await author.insert()
    return {"message": "Author tracked", "id": str(author.id)}


@router.delete("/track/{tracked_id}")
async def untrack_author(
    tracked_id: str,
    current_user: User = Depends(get_current_user),
):
    author = await TrackedAuthor.get(tracked_id)
    if not author:
        raise HTTPException(status_code=404, detail="Not found")
    owner_id = author.user_id.ref.id if isinstance(author.user_id, Link) else author.user_id.id
    if str(owner_id) != str(current_user.id):
        raise HTTPException(status_code=403, detail="Forbidden")
    await author.delete()
    return {"message": "Untracked"}
