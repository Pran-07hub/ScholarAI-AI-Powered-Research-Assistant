"""
Research Timeline Service
Groups project papers by year and uses AI to synthesize the evolution of the field.
"""

import json
import re
from collections import defaultdict
from typing import List, Optional

from langchain_google_genai import ChatGoogleGenerativeAI
from utils.research_paper_summariser.config import get_google_api_key


def _group_papers_by_year(papers: list) -> dict:
    """Return {year: [paper, ...]} dict sorted by year descending."""
    grouped: dict = defaultdict(list)
    undated: list = []
    for p in papers:
        pub = p.get("publication_date") or p.get("year")
        year = None
        if pub:
            if isinstance(pub, str):
                m = re.search(r"\b(19|20)\d{2}\b", pub)
                year = int(m.group()) if m else None
            elif hasattr(pub, "year"):
                year = pub.year
            elif isinstance(pub, int):
                year = pub
        if year:
            grouped[year].append(p)
        else:
            undated.append(p)
    result = dict(sorted(grouped.items(), reverse=True))
    if undated:
        result["Unknown"] = undated
    return result


async def _synthesize_era(year: int | str, year_papers: list, field_name: str) -> str:
    """Use Gemini to produce a 2-3 sentence synthesis for papers in a given year."""
    summaries = "\n".join(
        f"- {p['title']} — {(p.get('abstract') or '')[:200]}"
        for p in year_papers[:10]
    )

    prompt = (
        f"You are summarising the research landscape in {field_name} for the year {year}.\n"
        f"Based on these papers:\n{summaries}\n\n"
        f"Write 2-3 concise sentences describing the key advances, themes, or shifts "
        f"visible in this year's research. Be specific and academic in tone."
    )

    try:
        llm = ChatGoogleGenerativeAI(
            model="gemini-2.5-flash",
            google_api_key=get_google_api_key(),
            temperature=0.4,
        )
        response = await llm.ainvoke(prompt)
        return (response.content if hasattr(response, "content") else str(response)).strip()
    except Exception:
        return ""


async def generate_timeline(papers: list, field_name: str = "the field") -> list:
    """
    Build a full research timeline.
    Returns a list of {year, papers: [...], synthesis: str} dicts, sorted newest first.
    """
    if not papers:
        return []

    # Normalise paper dicts (handle both Beanie docs and plain dicts)
    normalised = []
    for p in papers:
        if hasattr(p, "__dict__") or hasattr(p, "model_dump"):
            try:
                d = p.model_dump() if hasattr(p, "model_dump") else p.__dict__
            except Exception:
                d = {}
            d["_id"] = str(getattr(p, "id", d.get("_id", "")))
        else:
            d = dict(p)
        normalised.append(d)

    grouped = _group_papers_by_year(normalised)

    # Synthesise each era concurrently (cap at 5 years to control LLM costs)
    years = list(grouped.keys())[:8]

    synthesis_tasks = [
        _synthesize_era(yr, grouped[yr], field_name)
        for yr in years
    ]
    import asyncio
    syntheses = await asyncio.gather(*synthesis_tasks, return_exceptions=True)

    timeline = []
    for year, synthesis in zip(years, syntheses):
        era_papers = grouped[year]
        timeline.append({
            "year": year,
            "paper_count": len(era_papers),
            "papers": [
                {
                    "id": str(p.get("_id") or p.get("id", "")),
                    "title": p.get("title", ""),
                    "authors": p.get("authors", []),
                    "abstract": (p.get("abstract") or "")[:300],
                    "pdf_url": p.get("pdf_url") or p.get("url", ""),
                }
                for p in era_papers
            ],
            "synthesis": synthesis if isinstance(synthesis, str) else "",
        })

    return timeline
