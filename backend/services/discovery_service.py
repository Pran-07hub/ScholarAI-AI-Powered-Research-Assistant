"""
Discovery Service
Provides: trending papers (arxiv), seminal papers (Semantic Scholar),
and AI-powered "what to read next" recommendations.
"""

import asyncio
import time
from typing import List, Optional, Dict, Tuple
import urllib.parse

import aiohttp
from langchain_google_genai import ChatGoogleGenerativeAI
from utils.research_paper_summariser.config import get_google_api_key
from utils.json_repair import parse_json_robust

# ── Caching ────────────────────────────────────────────────────────────────────
_cache: Dict[str, Tuple[list, float]] = {}
CACHE_TTL = 3600  # 1 hour


def _cached(key: str, data: list) -> list:
    _cache[key] = (data, time.time())
    return data


def _from_cache(key: str) -> Optional[list]:
    if key in _cache:
        data, ts = _cache[key]
        if time.time() - ts < CACHE_TTL:
            return data
    return None


# ── Trending papers via arxiv ──────────────────────────────────────────────────

async def get_trending_papers(topic: str, limit: int = 12) -> list:
    """Fetch recent papers from arxiv sorted by submission date."""
    cache_key = f"trending:{topic}:{limit}"
    cached = _from_cache(cache_key)
    if cached is not None:
        return cached

    encoded = urllib.parse.quote(topic)
    url = (
        f"http://export.arxiv.org/api/query"
        f"?search_query=all:{encoded}"
        f"&sortBy=submittedDate&sortOrder=descending"
        f"&max_results={limit}"
    )

    try:
        async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=15)) as session:
            async with session.get(url) as resp:
                if resp.status != 200:
                    return []
                text = await resp.text()

        papers = _parse_arxiv_atom(text, topic)
        return _cached(cache_key, papers)
    except Exception:
        return []


def _parse_arxiv_atom(xml: str, topic: str) -> list:
    """Extract structured paper data from arxiv Atom XML."""
    papers = []

    entries = re.findall(r"<entry>(.*?)</entry>", xml, re.DOTALL)
    for entry in entries:
        def _tag(t: str) -> str:
            m = re.search(rf"<{t}[^>]*>(.*?)</{t}>", entry, re.DOTALL)
            return m.group(1).strip() if m else ""

        title = re.sub(r"\s+", " ", _tag("title"))
        abstract = re.sub(r"\s+", " ", _tag("summary"))
        published = _tag("published")[:10]
        link_m = re.search(r'<id>(.*?)</id>', entry)
        link = link_m.group(1).strip() if link_m else ""
        # Convert arxiv abs URL to PDF
        pdf_url = link.replace("/abs/", "/pdf/") + ".pdf" if "/abs/" in link else ""

        authors = re.findall(r"<name>(.*?)</name>", entry)

        arxiv_id = link.split("/abs/")[-1] if "/abs/" in link else ""

        papers.append({
            "id": arxiv_id,
            "title": title,
            "authors": authors[:5],
            "abstract": abstract[:500],
            "published_date": published,
            "url": link,
            "pdf_url": pdf_url,
            "source": "arxiv",
            "topic": topic,
            "citation_count": None,
        })
    return papers


# ── Seminal papers via Semantic Scholar ───────────────────────────────────────

_SS_BASE = "https://api.semanticscholar.org/graph/v1"
_SS_FIELDS = "title,authors,year,citationCount,abstract,openAccessPdf,externalIds"


async def get_seminal_papers(topic: str, limit: int = 12) -> list:
    """Fetch highly-cited (seminal) papers from Semantic Scholar."""
    cache_key = f"seminal:{topic}:{limit}"
    cached = _from_cache(cache_key)
    if cached is not None:
        return cached

    url = (
        f"{_SS_BASE}/paper/search"
        f"?query={urllib.parse.quote(topic)}"
        f"&fields={_SS_FIELDS}"
        f"&limit=50"  # fetch more, then sort by citations
    )

    try:
        async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=15)) as session:
            async with session.get(url, headers={"Accept": "application/json"}) as resp:
                if resp.status != 200:
                    return []
                data = await resp.json()

        raw_papers = data.get("data", [])
        # Sort by citation count descending
        raw_papers.sort(key=lambda p: p.get("citationCount") or 0, reverse=True)

        papers = []
        for p in raw_papers[:limit]:
            ext = p.get("externalIds") or {}
            arxiv_id = ext.get("ArXiv", "")
            url_link = (
                f"https://arxiv.org/abs/{arxiv_id}"
                if arxiv_id
                else f"https://www.semanticscholar.org/paper/{p.get('paperId', '')}"
            )
            papers.append({
                "id": p.get("paperId", ""),
                "title": p.get("title", ""),
                "authors": [a["name"] for a in (p.get("authors") or [])[:5]],
                "abstract": (p.get("abstract") or "")[:500],
                "published_date": str(p.get("year") or ""),
                "url": url_link,
                "pdf_url": (p.get("openAccessPdf") or {}).get("url", ""),
                "source": "semantic_scholar",
                "topic": topic,
                "citation_count": p.get("citationCount"),
            })
        return _cached(cache_key, papers)
    except Exception:
        return []


# ── AI-powered "what to read next" ────────────────────────────────────────────

async def get_reading_recommendations(
    project_name: str,
    description: str,
    existing_papers: List[dict],
    limit: int = 8,
) -> dict:
    """
    Use Gemini to recommend what the researcher should read next, based on
    their current papers and project context.
    Returns structured recommendations with reasoning.
    """
    if not existing_papers:
        return {"recommendations": [], "reasoning": "No papers in project yet."}

    paper_summaries = "\n".join(
        f"- {p['title']} ({', '.join(p.get('authors', [])[:2])})"
        for p in existing_papers[:20]
    )

    prompt = (
        f"You are an expert research assistant helping a researcher working on: '{project_name}'.\n"
        f"Description: {description or 'Not provided'}\n\n"
        f"They have already read these papers:\n{paper_summaries}\n\n"
        f"Based on the collection above, identify:\n"
        f"1. GAPS in their reading (important topics/methods they seem to have missed)\n"
        f"2. NEXT STEPS — specific types of papers they should seek out\n"
        f"3. SEARCH QUERIES — 3 concrete arxiv/Google Scholar search strings they should try\n\n"
        f"Return ONLY a JSON object with this exact structure:\n"
        f'{{\n'
        f'  "gaps": ["gap1", "gap2", ...],\n'
        f'  "next_steps": [{{"topic": "...", "reason": "...", "search_query": "..."}}],\n'
        f'  "reasoning": "1-2 sentence overall analysis"\n'
        f'}}\n\n'
        f"JSON:"
    )

    try:
        llm = ChatGoogleGenerativeAI(
            model="gemini-2.5-flash",
            google_api_key=get_google_api_key(),
            temperature=0.3,
        )
        response = await llm.ainvoke(prompt)
        text = response.content if hasattr(response, "content") else str(response)
        result = parse_json_robust(text, expected_type="object")

        # Fetch papers for the top recommended search queries
        searches = result.get("next_steps", [])[:3]
        enriched_steps = []
        for step in searches:
            query = step.get("search_query", step.get("topic", ""))
            papers = await get_trending_papers(query, limit=3)
            enriched_steps.append({**step, "sample_papers": papers})
        result["next_steps"] = enriched_steps
        return result
    except Exception as e:
        return {"recommendations": [], "reasoning": f"Could not generate recommendations: {e}"}
