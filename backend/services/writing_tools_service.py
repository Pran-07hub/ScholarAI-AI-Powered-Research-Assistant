"""
Writing Tools Service
Provides: related work generator (streaming), contradiction detector,
LaTeX export, and BibTeX generation.
"""

import json
import re
from typing import List, AsyncGenerator

from langchain_google_genai import ChatGoogleGenerativeAI
from utils.research_paper_summariser.config import get_google_api_key


def _get_llm(temperature: float = 0.4):
    return ChatGoogleGenerativeAI(
        model="gemini-2.5-flash",
        google_api_key=get_google_api_key(),
        temperature=temperature,
    )


def _build_paper_context(papers: list) -> str:
    lines = []
    for i, p in enumerate(papers, 1):
        authors = ", ".join(p.get("authors") or [])
        year = ""
        pub = p.get("publication_date") or p.get("year") or ""
        if pub:
            m = re.search(r"\b(19|20)\d{2}\b", str(pub))
            year = m.group() if m else str(pub)[:4]
        abstract = (p.get("abstract") or "")[:350]
        lines.append(
            f"[{i}] \"{p.get('title', 'Untitled')}\" — {authors} ({year})\n"
            f"    Abstract: {abstract}"
        )
    return "\n\n".join(lines)


# ── Related Work Generator ────────────────────────────────────────────────────

async def stream_related_work(papers: list, project_name: str, temperature: float = 0.4) -> AsyncGenerator[str, None]:
    """Stream a LaTeX-ready related work section for the given papers."""
    if not papers:
        yield "No papers provided."
        return

    context = _build_paper_context(papers)
    prompt = (
        f"You are writing the 'Related Work' section of a research paper on '{project_name}'.\n\n"
        f"Using ONLY the papers listed below, write a cohesive, well-structured related work section "
        f"of approximately 400-600 words. Group papers thematically. Use inline citations in the "
        f"format [Author et al., YEAR]. Do not invent papers not in the list.\n\n"
        f"Papers:\n{context}\n\n"
        f"Related Work:"
    )

    llm = _get_llm(temperature=temperature)
    async for chunk in llm.astream(prompt):
        text = chunk.content if hasattr(chunk, "content") else str(chunk)
        if text:
            yield text


# ── Contradiction Detector ────────────────────────────────────────────────────

async def detect_contradictions(papers: list) -> dict:
    """
    Use Gemini to identify factual or methodological contradictions across papers.
    Returns {contradictions: [{paper_a, paper_b, claim_a, claim_b, topic}], summary: str}
    """
    if len(papers) < 2:
        return {"contradictions": [], "summary": "Need at least 2 papers to detect contradictions."}

    context = _build_paper_context(papers[:15])

    prompt = (
        "You are a critical research analyst. Analyze the following papers and identify "
        "any factual, methodological, or conclusions-based contradictions between them.\n\n"
        f"Papers:\n{context}\n\n"
        "Identify up to 5 notable contradictions or disagreements. If there are none, say so.\n"
        "Return ONLY a JSON object:\n"
        '{\n'
        '  "contradictions": [\n'
        '    {\n'
        '      "paper_a_index": 1,\n'
        '      "paper_b_index": 2,\n'
        '      "topic": "topic of disagreement",\n'
        '      "claim_a": "what paper A claims",\n'
        '      "claim_b": "what paper B claims",\n'
        '      "severity": "major|minor"\n'
        '    }\n'
        '  ],\n'
        '  "summary": "1-2 sentence overall assessment"\n'
        '}\n\nJSON:'
    )

    try:
        llm = _get_llm(temperature=0.2)
        response = await llm.ainvoke(prompt)
        text = response.content if hasattr(response, "content") else str(response)
        text = re.sub(r"```(?:json)?\s*|\s*```", "", text).strip()
        result = json.loads(text)

        # Attach paper titles for readability
        for c in result.get("contradictions", []):
            a_idx = c.get("paper_a_index", 1) - 1
            b_idx = c.get("paper_b_index", 1) - 1
            c["paper_a_title"] = papers[a_idx]["title"] if 0 <= a_idx < len(papers) else ""
            c["paper_b_title"] = papers[b_idx]["title"] if 0 <= b_idx < len(papers) else ""

        return result
    except Exception as e:
        return {"contradictions": [], "summary": f"Analysis failed: {e}"}


# ── LaTeX / BibTeX Export ─────────────────────────────────────────────────────

def _make_cite_key(paper: dict, index: int) -> str:
    """Generate a BibTeX cite key like Smith2023."""
    authors = paper.get("authors") or []
    first_author = authors[0].split()[-1] if authors else "Unknown"
    pub = str(paper.get("publication_date") or paper.get("year") or "")
    year_m = re.search(r"\b(19|20)\d{2}\b", pub)
    year = year_m.group() if year_m else str(index)
    # Keep only alphanumeric chars
    key = re.sub(r"[^A-Za-z0-9]", "", first_author) + year
    return key or f"paper{index}"


def generate_bibtex(papers: list) -> str:
    """Generate a BibTeX bibliography string for a list of papers."""
    entries = []
    for i, paper in enumerate(papers, 1):
        key = _make_cite_key(paper, i)
        authors = paper.get("authors") or []
        author_str = " and ".join(authors) if authors else "Unknown"
        pub = str(paper.get("publication_date") or paper.get("year") or "")
        year_m = re.search(r"\b(19|20)\d{2}\b", pub)
        year = year_m.group() if year_m else "n.d."
        title = paper.get("title", "Untitled").replace("{", "").replace("}", "")
        abstract = (paper.get("abstract") or "").replace("{", "").replace("}", "")[:300]
        url = paper.get("pdf_url") or paper.get("url") or ""
        venue = paper.get("venue") or paper.get("source") or "preprint"

        entry = (
            f"@article{{{key},\n"
            f"  title   = {{{title}}},\n"
            f"  author  = {{{author_str}}},\n"
            f"  year    = {{{year}}},\n"
            f"  journal = {{{venue}}},\n"
            f"  note    = {{{url}}},\n"
            f"  abstract= {{{abstract}}}\n"
            f"}}"
        )
        entries.append(entry)

    return "\n\n".join(entries)


def generate_latex_section(papers: list, section_title: str = "Bibliography") -> str:
    """
    Generate a minimal LaTeX document snippet with \\bibliography commands
    plus a formatted reference list using \\bibitem.
    """
    lines = [
        f"% ── {section_title} ──────────────────────────────────────────",
        r"\begin{thebibliography}{99}",
        "",
    ]

    for i, paper in enumerate(papers, 1):
        key = _make_cite_key(paper, i)
        authors = paper.get("authors") or []
        author_str = ", ".join(authors[:3])
        if len(authors) > 3:
            author_str += " et al."
        pub = str(paper.get("publication_date") or paper.get("year") or "n.d.")
        year_m = re.search(r"\b(19|20)\d{2}\b", pub)
        year = year_m.group() if year_m else pub[:4]
        title = paper.get("title", "Untitled")
        venue = paper.get("venue") or paper.get("source") or ""
        url = paper.get("pdf_url") or paper.get("url") or ""

        bibitem = (
            f"\\bibitem{{{key}}}\n"
            f"  {author_str} ({year}).\n"
            f"  \\textit{{{title}}}."
        )
        if venue:
            bibitem += f"\n  {venue}."
        if url:
            bibitem += f"\n  \\url{{{url}}}"
        lines.append(bibitem)
        lines.append("")

    lines.append(r"\end{thebibliography}")
    return "\n".join(lines)
