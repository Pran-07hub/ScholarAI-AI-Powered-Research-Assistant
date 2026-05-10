"""
Academic Workflow Service
Grant writing assistant, thesis outline generator, rebuttal helper.
All streaming via Gemini.
"""

import re
from typing import AsyncGenerator, List
from langchain_google_genai import ChatGoogleGenerativeAI
from utils.research_paper_summariser.config import get_google_api_key


def _get_llm(temperature: float = 0.5):
    return ChatGoogleGenerativeAI(
        model="gemini-2.5-flash",
        google_api_key=get_google_api_key(),
        temperature=temperature,
    )


def _paper_context(papers: list, max_papers: int = 20) -> str:
    lines = []
    for i, p in enumerate(papers[:max_papers], 1):
        authors = ", ".join((p.get("authors") or [])[:2])
        pub = str(p.get("publication_date") or p.get("year") or "")
        year_m = re.search(r"\b(19|20)\d{2}\b", pub)
        year = year_m.group() if year_m else ""
        abstract = (p.get("abstract") or "")[:250]
        lines.append(
            f"[{i}] \"{p.get('title', 'Untitled')}\" — {authors} ({year})\n"
            f"    {abstract}"
        )
    return "\n\n".join(lines)


# ── Grant Writing Assistant ───────────────────────────────────────────────────

async def stream_grant_literature_review(
    papers: list,
    project_name: str,
    grant_context: str = "",
) -> AsyncGenerator[str, None]:
    """
    Stream a literature review section structured for a grant proposal.
    grant_context: optional text describing the grant aim / funding body.
    """
    context = _paper_context(papers)
    grant_info = f"\nGrant context: {grant_context}" if grant_context else ""

    prompt = (
        f"You are a research grant writing expert helping a researcher write a literature review "
        f"section for a grant proposal on: '{project_name}'.{grant_info}\n\n"
        f"Using the papers below, write a compelling literature review (500–700 words) structured as:\n"
        f"1. **Background & Significance** — establish why this research area matters\n"
        f"2. **Current State of Knowledge** — summarise what is known, citing the papers\n"
        f"3. **Critical Gaps** — identify what is missing or unresolved\n"
        f"4. **How This Project Addresses the Gap** — 2-3 sentences positioning the proposed work\n\n"
        f"Use citations like [Author et al., YEAR]. Be persuasive and grant-appropriate in tone.\n\n"
        f"Papers:\n{context}\n\nLiterature Review:"
    )

    llm = _get_llm(temperature=0.5)
    async for chunk in llm.astream(prompt):
        text = chunk.content if hasattr(chunk, "content") else str(chunk)
        if text:
            yield text


# ── Thesis Outline Generator ──────────────────────────────────────────────────

async def stream_thesis_outline(
    papers: list,
    project_name: str,
    thesis_type: str = "PhD",
) -> AsyncGenerator[str, None]:
    """
    Stream a structured thesis outline from the project's paper collection.
    thesis_type: 'PhD', 'Masters', 'Undergraduate'
    """
    context = _paper_context(papers)

    prompt = (
        f"You are an academic writing coach helping a {thesis_type} student structure their thesis "
        f"on: '{project_name}'.\n\n"
        f"Based on the papers in their collection (listed below), generate a detailed thesis outline "
        f"with chapter titles, section headings, and 2-3 bullet points per section explaining what "
        f"should be covered. The outline should reflect a {thesis_type}-level thesis and logically "
        f"build from background → methodology → contributions → evaluation → conclusion.\n\n"
        f"Also suggest which papers are most relevant to each chapter.\n\n"
        f"Papers:\n{context}\n\nThesis Outline:"
    )

    llm = _get_llm(temperature=0.6)
    async for chunk in llm.astream(prompt):
        text = chunk.content if hasattr(chunk, "content") else str(chunk)
        if text:
            yield text


# ── Rebuttal Helper ───────────────────────────────────────────────────────────

async def stream_rebuttal_response(
    papers: list,
    project_name: str,
    reviewer_comments: str,
) -> AsyncGenerator[str, None]:
    """
    Given reviewer comments, find supporting papers and draft a point-by-point rebuttal.
    """
    context = _paper_context(papers)

    prompt = (
        f"You are helping a researcher write a rebuttal to peer-review comments on their paper "
        f"about '{project_name}'.\n\n"
        f"Reviewer comments:\n{reviewer_comments}\n\n"
        f"Papers available in their collection:\n{context}\n\n"
        f"For each reviewer concern:\n"
        f"1. Acknowledge the concern professionally\n"
        f"2. Provide a concise counter-argument or clarification\n"
        f"3. If a paper above supports your position, cite it as [Author et al., YEAR]\n"
        f"4. State any planned revisions if applicable\n\n"
        f"Write the rebuttal in a polite, professional, and confident academic tone.\n\nRebuttal:"
    )

    llm = _get_llm(temperature=0.4)
    async for chunk in llm.astream(prompt):
        text = chunk.content if hasattr(chunk, "content") else str(chunk)
        if text:
            yield text
