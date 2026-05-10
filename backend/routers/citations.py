from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from typing import List, Optional
from models import Paper, Project, User
from auth import get_current_user
from beanie import PydanticObjectId, Link
import re
import json
import logging

router = APIRouter(prefix="/citations", tags=["Citations"])
logger = logging.getLogger(__name__)


class CitationRequest(BaseModel):
    paper_id: PydanticObjectId
    style: Optional[str] = None  # APA, MLA, IEEE, Chicago, BibTeX; defaults to user pref


class CheckMissingRequest(BaseModel):
    text: str
    project_id: PydanticObjectId


class ConsistencyCheckRequest(BaseModel):
    text: str


def _format_authors_apa(authors: List[str]) -> str:
    """APA 7th: Last, F. M. for each author; et al. if more than 20."""
    if not authors:
        return "Unknown Author"
    if len(authors) > 20:
        formatted = [_apa_name(a) for a in authors[:19]]
        formatted.append("...")
        formatted.append(_apa_name(authors[-1]))
        return ", ".join(formatted)
    return ", ".join(_apa_name(a) for a in authors)


def _apa_name(name: str) -> str:
    """Convert 'First Last' or 'Last, First' to 'Last, F.' APA style."""
    name = name.strip()
    if not name:
        return "Unknown"
    if "," in name:
        parts = [p.strip() for p in name.split(",", 1)]
        last = parts[0]
        first = parts[1] if len(parts) > 1 else ""
    else:
        parts = name.split()
        last = parts[-1]
        first = " ".join(parts[:-1])
    initials = " ".join(f"{w[0]}." for w in first.split() if w) if first else ""
    return f"{last}, {initials}".rstrip(", ") if initials else last


def _format_authors_mla(authors: List[str]) -> str:
    """MLA 9th: First author Last, First; others First Last; et al. after 3."""
    if not authors:
        return "Unknown Author"
    if len(authors) > 3:
        return f"{_mla_first_author(authors[0])}, et al"
    result = [_mla_first_author(authors[0])]
    for a in authors[1:]:
        result.append(a.strip())
    return ", and ".join([", ".join(result[:-1]), result[-1]]) if len(result) > 1 else result[0]


def _mla_first_author(name: str) -> str:
    name = name.strip()
    if "," in name:
        return name
    parts = name.split()
    if len(parts) >= 2:
        return f"{parts[-1]}, {' '.join(parts[:-1])}"
    return name


def _format_authors_ieee(authors: List[str]) -> str:
    """IEEE: F. Last for each; et al. after 3 in references."""
    if not authors:
        return "Unknown Author"
    formatted = []
    for a in authors[:6]:
        a = a.strip()
        if "," in a:
            parts = [p.strip() for p in a.split(",", 1)]
            last = parts[0]
            first = parts[1] if len(parts) > 1 else ""
        else:
            parts = a.split()
            last = parts[-1]
            first = " ".join(parts[:-1])
        initials = "".join(f"{w[0]}. " for w in first.split() if w).strip() if first else ""
        formatted.append(f"{initials} {last}".strip() if initials else last)
    if len(authors) > 6:
        formatted.append("et al.")
    return ", ".join(formatted)


def _format_authors_chicago(authors: List[str]) -> str:
    """Chicago 17th: same as MLA first author style."""
    return _format_authors_mla(authors)


def _make_bibtex_key(authors: List[str], year) -> str:
    last = "unknown"
    if authors:
        name = authors[0].strip()
        last = name.split(",")[0].split()[-1] if name else "unknown"
        last = re.sub(r"[^a-zA-Z]", "", last).lower()
    return f"{last}{year}"


def format_citation(paper: Paper, style: str) -> str:
    style = style.upper()
    authors = paper.authors or []
    year = paper.publication_date.year if paper.publication_date else "n.d."
    title = paper.title or "Untitled"
    venue = paper.venue if paper.venue else None

    if style == "APA":
        author_str = _format_authors_apa(authors)
        venue_part = f" *{venue}*." if venue else ""
        return f"{author_str} ({year}). {title}.{venue_part}"

    elif style == "MLA":
        author_str = _format_authors_mla(authors)
        venue_part = f" *{venue}*," if venue else ""
        return f'{author_str}. "{title}."{venue_part} {year}.'

    elif style == "IEEE":
        author_str = _format_authors_ieee(authors)
        venue_part = f", *{venue}*" if venue else ""
        return f'{author_str}, "{title},"{venue_part}, {year}.'

    elif style == "CHICAGO":
        author_str = _format_authors_chicago(authors)
        venue_part = f" *{venue}*." if venue else ""
        return f'{author_str}. "{title}."{venue_part} {year}.'

    elif style in ("BIBTEX", "LATEX"):
        key = _make_bibtex_key(authors, year)
        author_bib = " and ".join(authors) if authors else "Unknown Author"
        venue_field = f"  journal = {{{venue}}},\n" if venue else ""
        return (
            f"@article{{{key},\n"
            f"  author = {{{author_bib}}},\n"
            f"  title = {{{title}}},\n"
            f"{venue_field}"
            f"  year = {{{year}}}\n"
            f"}}"
        )
    else:
        # Fallback plain
        author_str = _format_authors_apa(authors)
        return f"{author_str} ({year}). {title}."


@router.post("/generate")
async def generate_citation(
    request: CitationRequest,
    current_user: User = Depends(get_current_user),
):
    paper = await Paper.get(request.paper_id)
    if not paper:
        raise HTTPException(status_code=404, detail="Paper not found")

    style = request.style or current_user.preferences.citation_style.value
    citation = format_citation(paper, style)
    return {"citation": citation, "style": style}


@router.get("/project/{project_id}/bibliography")
async def get_project_bibliography(
    project_id: PydanticObjectId,
    style: Optional[str] = Query(default=None),
    current_user: User = Depends(get_current_user),
):
    project = await Project.get(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    owner_id = project.user_id.ref.id if isinstance(project.user_id, Link) else project.user_id.id
    member_ids = [
        str(m.ref.id if isinstance(m, Link) else m.id)
        for m in (project.members or [])
    ]
    if str(owner_id) != str(current_user.id) and str(current_user.id) not in member_ids:
        raise HTTPException(status_code=403, detail="Forbidden")

    # Default to user's preferred style if not specified
    resolved_style = style or current_user.preferences.citation_style.value

    papers = await Paper.find(Paper.project_id.id == project_id).to_list()
    bibliography = [format_citation(p, resolved_style) for p in papers]

    return {"style": resolved_style, "references": bibliography}


@router.post("/check-missing")
async def check_missing_citations(
    request: CheckMissingRequest,
    current_user: User = Depends(get_current_user),
):
    """Use Gemini to identify claims in text that lack citations, matched against project papers."""
    from langchain_google_genai import ChatGoogleGenerativeAI
    from utils.research_paper_summariser.config import get_google_api_key

    project = await Project.get(request.project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    papers = await Paper.find(Paper.project_id.id == request.project_id).to_list()
    paper_list = "\n".join(
        f"- [{str(p.id)}] {p.title} ({', '.join(p.authors[:2])}{'...' if len(p.authors) > 2 else ''}, "
        f"{p.publication_date.year if p.publication_date else 'n.d.'})"
        for p in papers
    )

    prompt = f"""You are an academic writing assistant. Analyze the following text and identify sentences or claims that make factual assertions but lack an in-text citation.

TEXT TO ANALYZE:
{request.text[:4000]}

AVAILABLE PAPERS IN PROJECT:
{paper_list if paper_list else "No papers available."}

Return a JSON array of objects. Each object should have:
- "claim": the exact sentence or phrase that needs a citation
- "suggestion": the paper ID from the list that best supports this claim (or null if none match)
- "reason": brief explanation

Return ONLY valid JSON, no markdown:
[{{"claim": "...", "suggestion": "paper_id_or_null", "reason": "..."}}]"""

    try:
        llm = ChatGoogleGenerativeAI(
            model="gemini-2.5-flash",
            google_api_key=get_google_api_key(),
            temperature=0.2,
        )
        response = await llm.ainvoke(prompt)
        raw = re.sub(r"```(?:json)?\s*|\s*```", "", response.content.strip())
        results = json.loads(raw)
        if not isinstance(results, list):
            results = []
    except Exception as e:
        logger.error(f"check-missing citations failed: {e}")
        raise HTTPException(status_code=500, detail="Failed to analyze citations")

    return {"missing_citations": results, "total": len(results)}


@router.post("/consistency-check")
async def check_consistency(
    request: ConsistencyCheckRequest,
    current_user: User = Depends(get_current_user),
):
    """Detect mixed citation styles in a document."""
    from langchain_google_genai import ChatGoogleGenerativeAI
    from utils.research_paper_summariser.config import get_google_api_key

    prompt = f"""You are an academic writing expert. Analyze the citation style used in the following text.

TEXT:
{request.text[:4000]}

Identify:
1. Which citation style appears to be predominantly used (APA, MLA, IEEE, Chicago, BibTeX, or mixed)
2. Any inconsistencies (e.g., some in-text citations use "(Author, Year)" while others use "[1]")
3. Specific examples of inconsistent citations found

Return ONLY valid JSON:
{{
  "dominant_style": "APA|MLA|IEEE|Chicago|mixed|unknown",
  "is_consistent": true|false,
  "inconsistencies": ["description of issue 1", ...],
  "examples": [{{"text": "citation text", "issue": "what's wrong"}}]
}}"""

    try:
        llm = ChatGoogleGenerativeAI(
            model="gemini-2.5-flash",
            google_api_key=get_google_api_key(),
            temperature=0.1,
        )
        response = await llm.ainvoke(prompt)
        raw = re.sub(r"```(?:json)?\s*|\s*```", "", response.content.strip())
        result = json.loads(raw)
    except Exception as e:
        logger.error(f"consistency-check failed: {e}")
        raise HTTPException(status_code=500, detail="Failed to check citation consistency")

    return result
