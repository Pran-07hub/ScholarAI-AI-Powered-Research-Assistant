"""
Standalone papers endpoints (not project-scoped).
"""

import os
import io
import re
import asyncio
import logging

import aiohttp
from fastapi import APIRouter, Depends, HTTPException
from models import User, Project, Paper
from auth import get_current_user
from beanie import PydanticObjectId, Link

router = APIRouter(prefix="/papers", tags=["Papers"])
logger = logging.getLogger(__name__)


@router.get("/{paper_id}")
async def get_paper(
    paper_id: PydanticObjectId,
    current_user: User = Depends(get_current_user),
):
    """Get a single paper by ID (verifies user has access to its project)."""
    paper = await Paper.get(paper_id)
    if not paper:
        raise HTTPException(status_code=404, detail="Paper not found")

    project_id = paper.project_id.ref.id if isinstance(paper.project_id, Link) else paper.project_id.id
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

    return paper


@router.post("/{paper_id}/fetch-full-text")
async def fetch_full_text(
    paper_id: PydanticObjectId,
    current_user: User = Depends(get_current_user),
):
    """Fetch and store full text for a paper from its original source."""
    paper = await Paper.get(paper_id)
    if not paper:
        raise HTTPException(status_code=404, detail="Paper not found")

    project_id = paper.project_id.ref.id if isinstance(paper.project_id, Link) else paper.project_id.id
    project = await Project.get(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    owner_id = str(project.user_id.ref.id if isinstance(project.user_id, Link) else project.user_id.id)
    member_ids = [str(m.ref.id if isinstance(m, Link) else m.id) for m in (project.members or [])]
    if str(current_user.id) != owner_id and str(current_user.id) not in member_ids:
        raise HTTPException(status_code=403, detail="Forbidden")

    if paper.full_text_status == "available":
        return {"status": "available", "message": "Full text already loaded"}

    paper.full_text_status = "fetching"
    await paper.save()

    full_text: str | None = None
    status = "unavailable"
    source = (paper.source or "").lower()

    try:
        if "arxiv" in source:
            full_text, status = await _fetch_arxiv_full_text(paper)
        elif "europe" in source or "europepmc" in source:
            full_text, status = await _fetch_europepmc_full_text(paper)
        elif "pubmed" in source:
            full_text, status = await _fetch_pubmed_full_text(paper)
        elif "semantic" in source:
            full_text, status = await _fetch_semantic_scholar_full_text(paper)
        elif "scopus" in source:
            full_text, status = await _fetch_scopus_full_text(paper)
        else:
            # OpenAlex, Crossref, CORE, IEEE, Springer, Google Scholar, manual, etc.
            full_text, status = await _fetch_pdf_full_text(paper)

        # Universal fallback: if still unavailable and we have a DOI, try Unpaywall
        if status != "available" and paper.doi:
            full_text, status = await _fetch_via_unpaywall(paper)
    except Exception as e:
        logger.error("Full text fetch failed for paper %s: %s", paper_id, e)
        status = "unavailable"

    paper.full_text = full_text
    paper.full_text_status = status
    await paper.save()

    if full_text and status == "available":
        try:
            from services.vector_store import index_papers
            await asyncio.get_event_loop().run_in_executor(None, index_papers, str(project_id), [{
                "id":      str(paper.id),
                "text":    full_text,
                "title":   paper.title,
                "authors": paper.authors,
                "source":  paper.source,
                "pdf_url": paper.pdf_url or "",
            }])
        except Exception as e:
            logger.warning("ChromaDB re-indexing failed for paper %s: %s", paper_id, e)

    return {
        "status": status,
        "message": "Full text loaded" if status == "available" else "Full text unavailable for this paper",
    }


# ── Source-specific fetchers ───────────────────────────────────────────────────

async def _fetch_scopus_full_text(paper: Paper) -> tuple[str | None, str]:
    """
    Elsevier Article Retrieval API — returns full text for OA papers.
    NOTE: Requires institutional access (X-ELS-InstToken) for non-OA papers.
    Free developer keys will get 401/403 for most articles.
    """
    api_key = os.getenv("SCOPUS_API_KEY", "").strip()
    if not api_key or not paper.doi:
        return None, "unavailable"

    url = f"https://api.elsevier.com/content/article/doi/{paper.doi}"
    headers = {"X-ELS-APIKey": api_key, "Accept": "application/json"}
    inst_token = os.getenv("ELSEVIER_INST_TOKEN", "").strip()
    if inst_token:
        headers["X-ELS-InstToken"] = inst_token

    async with aiohttp.ClientSession() as session:
        async with session.get(url, headers=headers, timeout=aiohttp.ClientTimeout(total=30)) as resp:
            if resp.status in (401, 403):
                return None, "unavailable"
            if resp.status == 200:
                data = await resp.json()
                ftr = data.get("full-text-retrieval-response", {})
                text = ftr.get("originalText", "")
                if not text:
                    body = ftr.get("body", {})
                    sections = body.get("section", [])
                    if isinstance(sections, list):
                        parts = []
                        for s in sections:
                            if isinstance(s, dict):
                                para = s.get("para", "")
                                if isinstance(para, list):
                                    parts.extend(str(p) for p in para if p)
                                elif para:
                                    parts.append(str(para))
                        text = "\n\n".join(parts)
                text = text.strip()
                if text:
                    return text, "available"
    return None, "unavailable"


async def _fetch_pubmed_full_text(paper: Paper) -> tuple[str | None, str]:
    """
    Try PubMed Central (PMC) full-text XML for papers that have a PMC ID.
    Falls back to _fetch_pdf_full_text if no PMC ID is found.
    """
    pdf_url = paper.pdf_url or ""
    pmid_match = re.search(r'pubmed\.ncbi\.nlm\.nih\.gov/(\d+)', pdf_url)
    if not pmid_match:
        return None, "unavailable"

    pmid = pmid_match.group(1)
    base = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils"
    common = {"tool": "ScholarAI", "email": "scholarai@example.com"}

    async with aiohttp.ClientSession() as session:
        try:
            # Check if this PMID has a PMC article
            async with session.get(
                f"{base}/elink.fcgi",
                params={"dbfrom": "pubmed", "db": "pmc", "id": pmid, "retmode": "json", **common},
                timeout=aiohttp.ClientTimeout(total=15),
            ) as resp:
                if resp.status != 200:
                    return None, "unavailable"
                data = await resp.json(content_type=None)
                link_sets = data.get("linksets", [{}])[0]
                link_set_dbs = link_sets.get("linksetdbs", [])
                pmc_ids = []
                for lsdb in link_set_dbs:
                    if lsdb.get("dbto") == "pmc":
                        pmc_ids = lsdb.get("links", [])
                        break

            if not pmc_ids:
                return None, "unavailable"

            pmc_id = pmc_ids[0]
            xml_url = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi"
            async with session.get(
                xml_url,
                params={"db": "pmc", "id": str(pmc_id), "rettype": "xml", "retmode": "xml", **common},
                timeout=aiohttp.ClientTimeout(total=30),
            ) as resp:
                if resp.status != 200:
                    return None, "unavailable"
                xml_text = await resp.text()
                from bs4 import BeautifulSoup
                soup = BeautifulSoup(xml_text, "xml")
                for tag in soup(["ref", "xref", "table-wrap", "fig"]):
                    tag.decompose()
                text = re.sub(r'\n{3,}', '\n\n', soup.get_text(separator="\n", strip=True)).strip()
                if len(text) > 200:
                    return text, "available"
        except Exception as e:
            logger.warning("PubMed PMC full-text fetch failed for pmid=%s: %s", pmid, e)

    return None, "unavailable"


async def _fetch_semantic_scholar_full_text(paper: Paper) -> tuple[str | None, str]:
    """
    Use Semantic Scholar Graph API to get the open-access PDF URL, then download it.
    """
    pdf_url = paper.pdf_url or ""
    # Extract S2 paper ID from URL like semanticscholar.org/paper/Title/hash
    s2_match = re.search(r'semanticscholar\.org/paper/[^/]+/([a-f0-9]{40})', pdf_url, re.I)
    if not s2_match:
        return None, "unavailable"

    s2_id = s2_match.group(1)
    api_url = f"https://api.semanticscholar.org/graph/v1/paper/{s2_id}"
    params = {"fields": "openAccessPdf,externalIds"}

    async with aiohttp.ClientSession() as session:
        try:
            async with session.get(api_url, params=params, timeout=aiohttp.ClientTimeout(total=15)) as resp:
                if resp.status != 200:
                    return None, "unavailable"
                data = await resp.json()
                oa = data.get("openAccessPdf") or {}
                oa_url = oa.get("url", "")
                if oa_url:
                    # Temporarily set pdf_url so _fetch_pdf_full_text can use it
                    paper.pdf_url = oa_url
                    result = await _fetch_pdf_full_text(paper)
                    return result
        except Exception as e:
            logger.warning("Semantic Scholar full-text fetch failed: %s", e)

    return None, "unavailable"


async def _fetch_via_unpaywall(paper: Paper) -> tuple[str | None, str]:
    """
    Universal fallback: query Unpaywall for a legal open-access PDF by DOI.
    Free, no API key required. Works for any source that has a DOI.
    """
    if not paper.doi:
        return None, "unavailable"

    url = f"https://api.unpaywall.org/v2/{paper.doi}"
    params = {"email": "scholarai@example.com"}

    async with aiohttp.ClientSession() as session:
        try:
            async with session.get(url, params=params, timeout=aiohttp.ClientTimeout(total=15)) as resp:
                if resp.status != 200:
                    return None, "unavailable"
                data = await resp.json()
                # Try best OA location first, then all locations
                best = data.get("best_oa_location") or {}
                oa_locations = [best] + (data.get("oa_locations") or [])
                for loc in oa_locations:
                    pdf_url = loc.get("url_for_pdf") or loc.get("url") or ""
                    if not pdf_url:
                        continue
                    paper.pdf_url = pdf_url
                    result = await _fetch_pdf_full_text(paper)
                    if result[1] == "available":
                        return result
        except Exception as e:
            logger.warning("Unpaywall fetch failed for doi=%s: %s", paper.doi, e)

    return None, "unavailable"


def _extract_arxiv_id(paper: Paper) -> str | None:
    """Extract arXiv ID from pdf_url or abstract field."""
    for candidate in [paper.pdf_url or "", paper.abstract or ""]:
        m = re.search(r'arxiv\.org/(?:abs|pdf)/([^\s\?#]+)', candidate, re.I)
        if m:
            return m.group(1).rstrip("/").replace(".pdf", "")
    return None


async def _fetch_arxiv_full_text(paper: Paper) -> tuple[str | None, str]:
    """Fetch ar5iv HTML version of the paper and extract plain text."""
    arxiv_id = _extract_arxiv_id(paper)
    if not arxiv_id:
        return None, "unavailable"

    ar5iv_url = f"https://ar5iv.labs.arxiv.org/html/{arxiv_id}"

    async with aiohttp.ClientSession() as session:
        try:
            async with session.get(ar5iv_url, timeout=aiohttp.ClientTimeout(total=40)) as resp:
                if resp.status == 200:
                    html = await resp.text()
                    from bs4 import BeautifulSoup
                    soup = BeautifulSoup(html, "html.parser")
                    for tag in soup(["script", "style", "nav", "header", "footer", "figure"]):
                        tag.decompose()
                    article = soup.find("article") or soup.find("main") or soup.body
                    if article:
                        text = article.get_text(separator="\n", strip=True)
                        text = re.sub(r'\n{3,}', '\n\n', text).strip()
                        if len(text) > 200:
                            return text, "available"
        except Exception as e:
            logger.warning("ar5iv fetch failed for arxiv_id=%s: %s", arxiv_id, e)

    return None, "unavailable"


async def _fetch_europepmc_full_text(paper: Paper) -> tuple[str | None, str]:
    """EBI EuropePMC fullTextXML endpoint."""
    pdf_url = paper.pdf_url or ""
    m = re.search(r'europepmc\.org/article/([A-Z]+)/(\d+)', pdf_url, re.I)
    if not m:
        return None, "unavailable"

    src, ext_id = m.group(1).upper(), m.group(2)
    url = f"https://www.ebi.ac.uk/europepmc/webservices/rest/{src}/{ext_id}/fullTextXML"

    async with aiohttp.ClientSession() as session:
        async with session.get(url, timeout=aiohttp.ClientTimeout(total=30)) as resp:
            if resp.status == 200:
                xml_text = await resp.text()
                from bs4 import BeautifulSoup
                soup = BeautifulSoup(xml_text, "xml")
                for tag in soup(["ref", "xref", "table-wrap"]):
                    tag.decompose()
                text = re.sub(r'\n{3,}', '\n\n', soup.get_text(separator="\n", strip=True)).strip()
                if len(text) > 200:
                    return text, "available"
    return None, "unavailable"


async def _fetch_pdf_full_text(paper: Paper) -> tuple[str | None, str]:
    """Download pdf_url and extract text with pypdf."""
    if not paper.pdf_url:
        return None, "unavailable"

    async with aiohttp.ClientSession() as session:
        try:
            async with session.get(paper.pdf_url, timeout=aiohttp.ClientTimeout(total=60)) as resp:
                if resp.status == 200:
                    content_type = resp.headers.get("content-type", "")
                    is_pdf = "pdf" in content_type.lower() or paper.pdf_url.lower().endswith(".pdf")
                    if is_pdf:
                        pdf_bytes = await resp.read()
                        text = _extract_text_from_pdf(pdf_bytes)
                        if text and len(text) > 200:
                            return text, "available"
        except Exception as e:
            logger.warning("PDF fetch failed for %s: %s", paper.pdf_url, e)

    return None, "unavailable"


def _extract_text_from_pdf(pdf_bytes: bytes) -> str | None:
    try:
        from pypdf import PdfReader
        reader = PdfReader(io.BytesIO(pdf_bytes))
        pages = [page.extract_text() or "" for page in reader.pages]
        text = "\n\n".join(p for p in pages if p).strip()
        return text or None
    except Exception as e:
        logger.warning("pypdf extraction failed: %s", e)
        return None
