"""
Citation Graph Service
Builds a citation relationship graph for a project's papers using Semantic Scholar.
Returns nodes + edges for force-directed visualization.
"""

import asyncio
import time
import urllib.parse
from typing import Dict, List, Tuple, Optional

import aiohttp
from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception_type

_SS_BASE = "https://api.semanticscholar.org/graph/v1"
_cache: Dict[str, Tuple[dict, float]] = {}
CACHE_TTL = 3600


class _RateLimitError(Exception):
    pass


@retry(
    retry=retry_if_exception_type(_RateLimitError),
    wait=wait_exponential(multiplier=1, min=2, max=30),
    stop=stop_after_attempt(4),
    reraise=False,
)
async def _ss_get(path: str, params: dict = {}) -> dict:
    url = f"{_SS_BASE}{path}"
    async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=15)) as session:
        async with session.get(url, params=params, headers={"Accept": "application/json"}) as r:
            if r.status == 429:
                raise _RateLimitError("Semantic Scholar rate limit hit")
            if r.status >= 500:
                raise _RateLimitError(f"Semantic Scholar server error {r.status}")
            if r.status != 200:
                return {}
            return await r.json()


async def _find_ss_id(title: str) -> Optional[str]:
    """Search Semantic Scholar for a paper by title and return its paperId."""
    cache_key = f"ss_id:{title[:80]}"
    if cache_key in _cache:
        data, ts = _cache[cache_key]
        if time.time() - ts < CACHE_TTL:
            return data.get("id")

    try:
        data = await _ss_get(
            "/paper/search",
            {"query": title, "fields": "paperId,title", "limit": 1},
        )
        papers = data.get("data", [])
        if papers:
            ss_id = papers[0].get("paperId")
            _cache[cache_key] = ({"id": ss_id}, time.time())
            return ss_id
    except Exception:
        pass
    return None


async def _get_references(ss_id: str) -> List[str]:
    """Return the paperIds that `ss_id` cites (its references)."""
    cache_key = f"refs:{ss_id}"
    if cache_key in _cache:
        data, ts = _cache[cache_key]
        if time.time() - ts < CACHE_TTL:
            return data.get("refs", [])

    try:
        data = await _ss_get(
            f"/paper/{ss_id}/references",
            {"fields": "paperId", "limit": 100},
        )
        refs = [
            r["citedPaper"]["paperId"]
            for r in data.get("data", [])
            if r.get("citedPaper", {}).get("paperId")
        ]
        _cache[cache_key] = ({"refs": refs}, time.time())
        return refs
    except Exception:
        return []


async def build_citation_graph(papers: list) -> dict:
    """
    Build nodes + edges for a citation graph.

    nodes: [{id, title, authors, year, url}]
    edges: [{source, target, type}]  type = 'internal' | 'external'

    Strategy:
    1. Find Semantic Scholar ID for each project paper (by title search)
    2. Fetch references for each paper
    3. Mark edges where both source and target are project papers as 'internal'
    4. Also include high-value external papers cited by multiple project papers
    """
    if not papers:
        return {"nodes": [], "edges": []}

    # Limit to avoid blowing SS rate limit
    capped_papers = papers[:20]

    # Step 1: Resolve SS IDs concurrently
    id_tasks = [_find_ss_id(p.get("title", "")) for p in capped_papers]
    ss_ids = await asyncio.gather(*id_tasks, return_exceptions=True)

    # Build mapping: local_index → ss_id (or None)
    paper_ss_map: Dict[int, Optional[str]] = {}
    ss_to_local: Dict[str, int] = {}  # ss_id → local index
    for i, ss_id in enumerate(ss_ids):
        sid = ss_id if isinstance(ss_id, str) else None
        paper_ss_map[i] = sid
        if sid:
            ss_to_local[sid] = i

    # Step 2: Fetch references for papers that resolved
    ref_tasks = [
        _get_references(paper_ss_map[i]) if paper_ss_map[i] else asyncio.sleep(0, result=[])
        for i in range(len(capped_papers))
    ]
    all_refs = await asyncio.gather(*ref_tasks, return_exceptions=True)

    # Step 3: Build nodes from project papers
    nodes = []
    for i, p in enumerate(capped_papers):
        import re
        pub = str(p.get("publication_date") or p.get("year") or "")
        year_m = re.search(r"\b(19|20)\d{2}\b", pub)
        year = year_m.group() if year_m else None
        nodes.append({
            "id": f"local_{i}",
            "title": p.get("title", "Untitled"),
            "authors": (p.get("authors") or [])[:3],
            "year": year,
            "url": p.get("pdf_url") or p.get("url") or "",
            "type": "project",  # project | external
            "ss_id": paper_ss_map.get(i),
        })

    # Step 4: Build edges + collect external nodes cited by 2+ project papers
    edges = []
    external_citation_count: Dict[str, int] = {}
    external_meta: Dict[str, dict] = {}

    for i, refs in enumerate(all_refs):
        if isinstance(refs, list):
            for ref_id in refs:
                if ref_id in ss_to_local:
                    # Internal edge: project paper → project paper
                    target_local = ss_to_local[ref_id]
                    if target_local != i:
                        edges.append({
                            "source": f"local_{i}",
                            "target": f"local_{target_local}",
                            "type": "internal",
                        })
                else:
                    # External reference
                    external_citation_count[ref_id] = external_citation_count.get(ref_id, 0) + 1

    # Fetch metadata for external papers cited by 2+ project papers
    popular_externals = [ss_id for ss_id, cnt in external_citation_count.items() if cnt >= 2]
    if popular_externals:
        # Batch fetch in one call (comma-separated IDs, max 500 chars)
        batch = popular_externals[:20]
        try:
            async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=12)) as session:
                for ext_id in batch:
                    async with session.get(
                        f"{_SS_BASE}/paper/{ext_id}",
                        params={"fields": "title,authors,year,externalIds"},
                        headers={"Accept": "application/json"},
                    ) as r:
                        if r.status == 200:
                            d = await r.json()
                            ext_id_val = ext_id
                            import re
                            nodes.append({
                                "id": f"ext_{ext_id_val}",
                                "title": d.get("title", "External paper"),
                                "authors": [a["name"] for a in (d.get("authors") or [])[:3]],
                                "year": str(d.get("year") or ""),
                                "url": f"https://www.semanticscholar.org/paper/{ext_id_val}",
                                "type": "external",
                                "ss_id": ext_id_val,
                                "cited_by_count": external_citation_count[ext_id_val],
                            })
                            # Add edges from project papers to this external node
                            for i, refs in enumerate(all_refs):
                                if isinstance(refs, list) and ext_id_val in refs:
                                    edges.append({
                                        "source": f"local_{i}",
                                        "target": f"ext_{ext_id_val}",
                                        "type": "external",
                                    })
        except Exception:
            pass

    return {
        "nodes": nodes,
        "edges": edges,
        "stats": {
            "project_papers": len(capped_papers),
            "external_nodes": len([n for n in nodes if n["type"] == "external"]),
            "internal_edges": len([e for e in edges if e["type"] == "internal"]),
            "external_edges": len([e for e in edges if e["type"] == "external"]),
        },
    }
