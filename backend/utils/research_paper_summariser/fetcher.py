import arxiv
import asyncio
import aiohttp
import os
from typing import List
from .schemas import Paper


def _resolve_key(env_var: str, source_slug: str) -> str:
    """
    Return the API key for a source, preferring the authenticated user's stored key
    (from the request context) over the platform-wide environment variable.
    """
    try:
        from context import user_api_keys_ctx
        user_key = user_api_keys_ctx.get().get(source_slug, "").strip()
        if user_key:
            return user_key
    except Exception:
        pass
    return os.getenv(env_var, "").strip()


# ── ArXiv ─────────────────────────────────────────────────────────────────────

def fetch_arxiv_sync(keyword: str, max_results: int) -> List[Paper]:
    client = arxiv.Client()
    search = arxiv.Search(
        query=keyword,
        max_results=max_results,
        sort_by=arxiv.SortCriterion.Relevance
    )
    results = list(client.results(search))
    papers = []
    for result in results:
        paper = Paper(
            title=result.title,
            authors=[a.name for a in result.authors],
            summary=result.summary,
            source="ArXiv",
            published_date=result.published.strftime("%Y-%m-%d"),
            url=result.pdf_url
        )
        papers.append(paper)
    return papers


async def fetch_arxiv_papers(keyword: str, max_results: int) -> List[Paper]:
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, fetch_arxiv_sync, keyword, max_results)


# ── Semantic Scholar ───────────────────────────────────────────────────────────

async def fetch_semantic_scholar_papers(session: aiohttp.ClientSession, keyword: str, max_results: int) -> List[Paper]:
    url = "https://api.semanticscholar.org/graph/v1/paper/search"
    params = {
        "query": keyword,
        "limit": max_results,
        "fields": "title,authors,abstract,url,year"
    }
    try:
        async with session.get(url, params=params) as response:
            if response.status == 200:
                data = await response.json()
                papers = []
                for item in data.get("data", []):
                    authors = [author.get("name") for author in item.get("authors", [])] if item.get("authors") else []
                    summary = item.get("abstract") or "No abstract available"
                    published_date = str(item.get("year", "Unknown"))
                    paper_url = item.get("url") or ""
                    paper = Paper(
                        title=item.get("title", "Unknown Title"),
                        authors=authors,
                        summary=summary,
                        source="Semantic Scholar",
                        published_date=published_date,
                        url=paper_url
                    )
                    papers.append(paper)
                return papers
            else:
                text = await response.text()
                print(f"Semantic Scholar failed: {response.status} - {text}")
    except Exception as e:
        print(f"Error fetching from Semantic Scholar for {keyword}: {e}")
    return []


# ── Crossref ───────────────────────────────────────────────────────────────────

async def fetch_crossref_papers(session: aiohttp.ClientSession, keyword: str, max_results: int) -> List[Paper]:
    url = "https://api.crossref.org/works"
    params = {
        "query": keyword,
        "select": "title,author,abstract,URL,published-print,published-online",
        "rows": max_results
    }
    headers = {"User-Agent": "ScholarAI/1.0 (mailto:scholarai@example.com)"}
    try:
        async with session.get(url, params=params, headers=headers) as response:
            if response.status == 200:
                data = await response.json()
                papers = []
                for item in data.get("message", {}).get("items", []):
                    title = item.get("title", ["Unknown Title"])[0] if item.get("title") else "Unknown Title"
                    authors_data = item.get("author", [])
                    authors = [f"{a.get('given', '')} {a.get('family', '')}".strip() for a in authors_data]
                    summary = item.get("abstract", "No abstract available")
                    pub_date_parts = item.get("published-print", {}).get("date-parts", [["Unknown"]])[0]
                    if pub_date_parts[0] == "Unknown":
                        pub_date_parts = item.get("published-online", {}).get("date-parts", [["Unknown"]])[0]
                    published_date = "-".join(map(str, pub_date_parts)) if pub_date_parts[0] != "Unknown" else "Unknown"
                    paper_url = item.get("URL", "")
                    paper = Paper(
                        title=title,
                        authors=authors,
                        summary=summary,
                        source="Crossref",
                        published_date=published_date,
                        url=paper_url
                    )
                    papers.append(paper)
                return papers
    except Exception as e:
        print(f"Error fetching from Crossref for {keyword}: {e}")
    return []


# ── OpenAlex ───────────────────────────────────────────────────────────────────

def _reconstruct_abstract(inverted_index: dict) -> str:
    """Reconstruct abstract text from OpenAlex inverted index format."""
    if not inverted_index:
        return "No abstract available"
    pos_word: dict[int, str] = {}
    for word, positions in inverted_index.items():
        for pos in positions:
            pos_word[pos] = word
    return " ".join(pos_word[i] for i in sorted(pos_word.keys()))


async def fetch_openalex_papers(session: aiohttp.ClientSession, keyword: str, max_results: int) -> List[Paper]:
    """
    Fetch from OpenAlex — a free, comprehensive scholarly graph with 250M+ works.
    No API key required; politely identifies with a mailto parameter.
    """
    url = "https://api.openalex.org/works"
    params = {
        "search": keyword,
        "per-page": max_results,
        "select": "title,authorships,abstract_inverted_index,publication_year,doi,open_access,primary_location",
        "mailto": "scholarai@example.com"
    }
    try:
        async with session.get(url, params=params, timeout=aiohttp.ClientTimeout(total=15)) as response:
            if response.status == 200:
                data = await response.json()
                papers = []
                for item in data.get("results", []):
                    title = item.get("title") or "Unknown Title"
                    authors = [
                        a.get("author", {}).get("display_name", "")
                        for a in item.get("authorships", [])
                        if a.get("author")
                    ]
                    abstract = _reconstruct_abstract(item.get("abstract_inverted_index") or {})
                    year = str(item.get("publication_year") or "Unknown")
                    doi = item.get("doi") or ""
                    oa_url = (item.get("open_access") or {}).get("oa_url") or ""
                    primary_url = ((item.get("primary_location") or {}).get("landing_page_url") or "")
                    paper_url = oa_url or primary_url or (f"https://doi.org/{doi}" if doi else "")
                    papers.append(Paper(
                        title=title,
                        authors=authors,
                        summary=abstract,
                        source="OpenAlex",
                        published_date=year,
                        url=paper_url
                    ))
                return papers
            else:
                print(f"OpenAlex failed: {response.status}")
    except Exception as e:
        print(f"Error fetching from OpenAlex for {keyword}: {e}")
    return []


# ── PubMed ─────────────────────────────────────────────────────────────────────

async def fetch_pubmed_papers(session: aiohttp.ClientSession, keyword: str, max_results: int) -> List[Paper]:
    """
    Fetch from PubMed/NCBI — authoritative source for biomedical and life science research.
    Uses the free E-utilities API (no key required, up to 3 req/sec).
    """
    base = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils"
    common = {"tool": "ScholarAI", "email": "scholarai@example.com"}

    try:
        # Step 1: Search for PMIDs
        async with session.get(
            f"{base}/esearch.fcgi",
            params={"db": "pubmed", "term": keyword, "retmax": max_results, "retmode": "json", **common},
            timeout=aiohttp.ClientTimeout(total=15)
        ) as resp:
            if resp.status != 200:
                return []
            data = await resp.json(content_type=None)
            ids = data.get("esearchresult", {}).get("idlist", [])

        if not ids:
            return []

        await asyncio.sleep(0.35)  # Stay within NCBI 3 req/sec limit

        # Step 2: Fetch summaries (includes title, authors, date — no abstract)
        async with session.get(
            f"{base}/esummary.fcgi",
            params={"db": "pubmed", "id": ",".join(ids), "retmode": "json", **common},
            timeout=aiohttp.ClientTimeout(total=15)
        ) as resp:
            if resp.status != 200:
                return []
            data = await resp.json(content_type=None)
            result = data.get("result", {})

        papers = []
        for pmid in ids:
            item = result.get(pmid, {})
            if not isinstance(item, dict):
                continue
            title = item.get("title", "Unknown Title")
            authors_list = [a.get("name", "") for a in item.get("authors", []) if a.get("authtype") == "Author"]
            pub_date = item.get("pubdate", "Unknown")
            url = f"https://pubmed.ncbi.nlm.nih.gov/{pmid}/"
            papers.append(Paper(
                title=title,
                authors=authors_list,
                summary="Abstract available on PubMed. Click the link to view full details.",
                source="PubMed",
                published_date=pub_date,
                url=url
            ))
        return papers

    except Exception as e:
        print(f"Error fetching from PubMed for {keyword}: {e}")
    return []


# ── ERIC (Education Resources Information Center) ─────────────────────────────

async def fetch_eric_papers(session: aiohttp.ClientSession, keyword: str, max_results: int) -> List[Paper]:
    """
    Fetch from ERIC — US Dept of Education database for education research.
    Completely free, no API key required.
    API docs: https://eric.ed.gov/?api
    """
    url = "https://api.ies.ed.gov/eric/"
    params = {
        "search": keyword,
        "format": "json",
        "rows": max_results,
        "fields": "title,author,description,publicationdateyear,id,url"
    }
    try:
        async with session.get(url, params=params, timeout=aiohttp.ClientTimeout(total=15)) as response:
            if response.status == 200:
                data = await response.json(content_type=None)
                papers = []
                for item in data.get("response", {}).get("docs", []):
                    title = item.get("title", "Unknown Title")
                    authors_raw = item.get("author", [])
                    authors = authors_raw if isinstance(authors_raw, list) else [authors_raw]
                    summary = item.get("description", "No abstract available")
                    year = str(item.get("publicationdateyear", "Unknown"))
                    eric_id = item.get("id", "")
                    paper_url = item.get("url") or (f"https://eric.ed.gov/?id={eric_id}" if eric_id else "")
                    papers.append(Paper(
                        title=title,
                        authors=authors,
                        summary=summary,
                        source="ERIC",
                        published_date=year,
                        url=paper_url
                    ))
                return papers
            else:
                print(f"ERIC failed: {response.status}")
    except Exception as e:
        print(f"Error fetching from ERIC for {keyword}: {e}")
    return []


# ── Europe PMC ─────────────────────────────────────────────────────────────────

async def fetch_europe_pmc_papers(session: aiohttp.ClientSession, keyword: str, max_results: int) -> List[Paper]:
    """
    Fetch from Europe PMC — broader than PubMed, includes full abstracts,
    covers life sciences, preprints, and clinical literature. Free, no key needed.
    """
    url = "https://www.ebi.ac.uk/europepmc/webservices/rest/search"
    params = {
        "query": keyword,
        "format": "json",
        "pageSize": max_results,
        "resultType": "core"
    }
    try:
        async with session.get(url, params=params, timeout=aiohttp.ClientTimeout(total=15)) as response:
            if response.status == 200:
                data = await response.json(content_type=None)
                papers = []
                for item in data.get("resultList", {}).get("result", []):
                    title = item.get("title", "Unknown Title")
                    authors_str = item.get("authorString", "")
                    authors = [a.strip() for a in authors_str.split(",")] if authors_str else []
                    summary = item.get("abstractText", "No abstract available")
                    year = str(item.get("pubYear", "Unknown"))
                    pmid = item.get("pmid")
                    doi = item.get("doi")
                    paper_url = (
                        f"https://europepmc.org/article/MED/{pmid}" if pmid
                        else (f"https://doi.org/{doi}" if doi else "")
                    )
                    papers.append(Paper(
                        title=title,
                        authors=authors,
                        summary=summary,
                        source="Europe PMC",
                        published_date=year,
                        url=paper_url
                    ))
                return papers
            else:
                print(f"Europe PMC failed: {response.status}")
    except Exception as e:
        print(f"Error fetching from Europe PMC for {keyword}: {e}")
    return []


# ── CORE ───────────────────────────────────────────────────────────────────────

async def fetch_core_papers(session: aiohttp.ClientSession, keyword: str, max_results: int) -> List[Paper]:
    """
    Fetch from CORE — aggregates 200M+ open-access papers across thousands of
    repositories worldwide. Free API key at https://core.ac.uk/services/api
    Set CORE_API_KEY in .env to enable.
    """
    api_key = _resolve_key("CORE_API_KEY", "core")
    if not api_key:
        return []

    url = "https://api.core.ac.uk/v3/search/works"
    headers = {"Authorization": f"Bearer {api_key}"}
    payload = {"q": keyword, "limit": max_results}
    try:
        async with session.post(url, json=payload, headers=headers, timeout=aiohttp.ClientTimeout(total=15)) as response:
            if response.status == 200:
                data = await response.json()
                papers = []
                for item in data.get("results", []):
                    title = item.get("title", "Unknown Title")
                    authors = [a.get("name", "") for a in item.get("authors", []) if a.get("name")]
                    summary = item.get("abstract", "No abstract available")
                    year = str(item.get("yearPublished", "Unknown"))
                    doi = item.get("doi") or ""
                    paper_url = item.get("downloadUrl") or item.get("sourceFulltextUrls", [None])[0] or (
                        f"https://doi.org/{doi}" if doi else ""
                    )
                    papers.append(Paper(
                        title=title,
                        authors=authors,
                        summary=summary,
                        source="CORE",
                        published_date=year,
                        url=paper_url
                    ))
                return papers
            else:
                print(f"CORE failed: {response.status}")
    except Exception as e:
        print(f"Error fetching from CORE for {keyword}: {e}")
    return []


# ── IEEE Xplore ────────────────────────────────────────────────────────────────

async def fetch_ieee_papers(session: aiohttp.ClientSession, keyword: str, max_results: int) -> List[Paper]:
    """
    Fetch from IEEE Xplore — authoritative source for engineering, CS, and electronics.
    Free API key at https://developer.ieee.org/member/register
    Set IEEE_API_KEY in .env to enable.
    """
    api_key = _resolve_key("IEEE_API_KEY", "ieee")
    if not api_key:
        return []

    url = "https://ieeexploreapi.ieee.org/api/v1/search/articles"
    params = {
        "querytext": keyword,
        "max_records": max_results,
        "apikey": api_key,
        "format": "json"
    }
    try:
        async with session.get(url, params=params, timeout=aiohttp.ClientTimeout(total=15)) as response:
            if response.status == 200:
                data = await response.json()
                papers = []
                for item in data.get("articles", []):
                    title = item.get("title", "Unknown Title")
                    authors = [a.get("full_name", "") for a in item.get("authors", {}).get("authors", [])]
                    summary = item.get("abstract", "No abstract available")
                    year = str(item.get("publication_year", "Unknown"))
                    paper_url = item.get("html_url") or item.get("pdf_url") or ""
                    papers.append(Paper(
                        title=title,
                        authors=authors,
                        summary=summary,
                        source="IEEE Xplore",
                        published_date=year,
                        url=paper_url
                    ))
                return papers
            else:
                print(f"IEEE Xplore failed: {response.status}")
    except Exception as e:
        print(f"Error fetching from IEEE Xplore for {keyword}: {e}")
    return []


# ── Springer Nature ────────────────────────────────────────────────────────────

async def fetch_springer_papers(session: aiohttp.ClientSession, keyword: str, max_results: int) -> List[Paper]:
    """
    Fetch from Springer Nature Open Access API — broad journal coverage across
    all disciplines. Free API key at https://dev.springernature.com/
    Set SPRINGER_API_KEY in .env to enable.
    """
    api_key = _resolve_key("SPRINGER_API_KEY", "springer")
    if not api_key:
        return []

    url = "https://api.springernature.com/openaccess/json"
    params = {
        "q": keyword,
        "api_key": api_key,
        "p": max_results,
        "s": 1
    }
    try:
        async with session.get(url, params=params, timeout=aiohttp.ClientTimeout(total=15)) as response:
            if response.status == 200:
                data = await response.json()
                papers = []
                for item in data.get("records", []):
                    title = item.get("title", "Unknown Title")
                    creators = item.get("creators", [])
                    authors = [c.get("creator", "") for c in creators if c.get("creator")]
                    summary = item.get("abstract", "No abstract available")
                    pub_date = item.get("publicationDate", "Unknown")[:4] if item.get("publicationDate") else "Unknown"
                    doi = item.get("doi", "")
                    paper_url = item.get("url", [{}])[0].get("value", "") or (f"https://doi.org/{doi}" if doi else "")
                    papers.append(Paper(
                        title=title,
                        authors=authors,
                        summary=summary,
                        source="Springer Nature",
                        published_date=pub_date,
                        url=paper_url
                    ))
                return papers
            else:
                print(f"Springer Nature failed: {response.status}")
    except Exception as e:
        print(f"Error fetching from Springer Nature for {keyword}: {e}")
    return []


# ── Scopus (Elsevier) ──────────────────────────────────────────────────────────

async def fetch_scopus_papers(session: aiohttp.ClientSession, keyword: str, max_results: int) -> List[Paper]:
    """
    Fetch from Scopus — Elsevier's flagship multidisciplinary abstract & citation database.
    Covers 90M+ records across peer-reviewed journals. Requires SCOPUS_API_KEY in .env.
    Note: The free-tier key returns metadata (title, creator, date, DOI) without full abstracts.
    """
    api_key = _resolve_key("SCOPUS_API_KEY", "scopus")
    if not api_key:
        return []

    url = "https://api.elsevier.com/content/search/scopus"
    params = {
        "query": keyword,
        "count": max_results,
        "field": "dc:title,dc:creator,dc:description,prism:coverDate,prism:doi,eid"
    }
    headers = {
        "X-ELS-APIKey": api_key,
        "Accept": "application/json"
    }
    try:
        async with session.get(url, params=params, headers=headers, timeout=aiohttp.ClientTimeout(total=15)) as response:
            if response.status == 200:
                data = await response.json()
                papers = []
                for item in data.get("search-results", {}).get("entry", []):
                    title = item.get("dc:title", "Unknown Title")
                    creator = item.get("dc:creator", "")
                    authors = [creator] if creator else []
                    summary = item.get("dc:description", "Abstract available on Scopus. Click the link to view full details.")
                    pub_date = item.get("prism:coverDate", "Unknown")[:4]  # just the year
                    doi = item.get("prism:doi", "")
                    eid = item.get("eid", "")
                    paper_url = (
                        f"https://www.scopus.com/record/display.uri?eid={eid}&origin=resultslist"
                        if eid else (f"https://doi.org/{doi}" if doi else "")
                    )
                    papers.append(Paper(
                        title=title,
                        authors=authors,
                        summary=summary,
                        source="Scopus",
                        published_date=pub_date,
                        url=paper_url,
                        doi=doi if doi else None,
                    ))
                return papers
            else:
                text = await response.text()
                print(f"Scopus failed: {response.status} - {text[:200]}")
    except Exception as e:
        print(f"Error fetching from Scopus for {keyword}: {e}")
    return []


# ── Google Scholar via SerpAPI ─────────────────────────────────────────────────

async def fetch_google_scholar_papers(session: aiohttp.ClientSession, keyword: str, max_results: int) -> List[Paper]:
    """
    Fetch from Google Scholar via SerpAPI — broadest academic search engine covering
    all disciplines including grey literature and citations.
    Requires SERP_API_KEY in .env (https://serpapi.com/).
    """
    api_key = _resolve_key("SERP_API_KEY", "serp")
    if not api_key:
        return []

    url = "https://serpapi.com/search.json"
    params = {
        "engine": "google_scholar",
        "q": keyword,
        "num": max_results,
        "api_key": api_key
    }
    try:
        async with session.get(url, params=params, timeout=aiohttp.ClientTimeout(total=20)) as response:
            if response.status == 200:
                data = await response.json()
                papers = []
                for item in data.get("organic_results", []):
                    title = item.get("title", "Unknown Title")
                    pub_info = item.get("publication_info", {})
                    # Extract authors from publication_info.authors list
                    authors_list = pub_info.get("authors", [])
                    if authors_list:
                        authors = [a.get("name", "") for a in authors_list if a.get("name")]
                    else:
                        # Fall back to parsing the summary string "Author1, Author2 - Journal, Year"
                        summary_str = pub_info.get("summary", "")
                        author_part = summary_str.split(" - ")[0] if " - " in summary_str else ""
                        authors = [a.strip() for a in author_part.split(",")] if author_part else []

                    snippet = item.get("snippet", "No abstract available")
                    # Extract year from publication_info summary if present
                    pub_summary = pub_info.get("summary", "")
                    year = "Unknown"
                    for part in pub_summary.split(","):
                        part = part.strip()
                        if part.isdigit() and len(part) == 4:
                            year = part
                            break

                    paper_url = item.get("link", "")
                    papers.append(Paper(
                        title=title,
                        authors=authors,
                        summary=snippet,
                        source="Google Scholar",
                        published_date=year,
                        url=paper_url
                    ))
                return papers
            else:
                text = await response.text()
                print(f"SerpAPI (Google Scholar) failed: {response.status} - {text[:200]}")
    except Exception as e:
        print(f"Error fetching from Google Scholar (SerpAPI) for {keyword}: {e}")
    return []


# ── Main Aggregator ────────────────────────────────────────────────────────────

async def fetch_papers(keywords: List[str], max_results_per_keyword: int = 3) -> List[Paper]:
    """
    Fetch papers from multiple academic sources and deduplicate by normalized title.

    Always-on (no key needed):
      ArXiv, Crossref, OpenAlex, Semantic Scholar, PubMed, ERIC, Europe PMC

    Key-gated (set in .env to enable):
      CORE_API_KEY     → CORE (200M+ open-access aggregator)
      SCOPUS_API_KEY   → Scopus (90M+ peer-reviewed records, Elsevier)
      SERP_API_KEY     → Google Scholar via SerpAPI (broadest coverage)
      IEEE_API_KEY     → IEEE Xplore (engineering / CS / electronics)
      SPRINGER_API_KEY → Springer Nature (multidisciplinary journals)
    """
    all_papers_dict: dict[str, Paper] = {}

    async with aiohttp.ClientSession() as session:
        # Parallel-safe sources (no strict rate limits)
        parallel_tasks = []
        for keyword in keywords:
            parallel_tasks.append(fetch_arxiv_papers(keyword, max_results_per_keyword))
            parallel_tasks.append(fetch_crossref_papers(session, keyword, max_results_per_keyword))
            parallel_tasks.append(fetch_openalex_papers(session, keyword, max_results_per_keyword))
            parallel_tasks.append(fetch_eric_papers(session, keyword, max_results_per_keyword))
            parallel_tasks.append(fetch_europe_pmc_papers(session, keyword, max_results_per_keyword))
            parallel_tasks.append(fetch_core_papers(session, keyword, max_results_per_keyword))
            parallel_tasks.append(fetch_ieee_papers(session, keyword, max_results_per_keyword))
            parallel_tasks.append(fetch_springer_papers(session, keyword, max_results_per_keyword))
            parallel_tasks.append(fetch_scopus_papers(session, keyword, max_results_per_keyword))
            parallel_tasks.append(fetch_google_scholar_papers(session, keyword, max_results_per_keyword))

        parallel_results = await asyncio.gather(*parallel_tasks, return_exceptions=True)

        # Rate-limited sources fetched sequentially
        sequential_results = []
        for keyword in keywords:
            # Semantic Scholar: 1 req/sec
            try:
                sm_results = await fetch_semantic_scholar_papers(session, keyword, max_results_per_keyword)
                sequential_results.append(sm_results)
                await asyncio.sleep(1.1)
            except Exception as e:
                sequential_results.append(e)

            # PubMed: 3 req/sec without key
            try:
                pm_results = await fetch_pubmed_papers(session, keyword, max_results_per_keyword)
                sequential_results.append(pm_results)
                await asyncio.sleep(0.35)
            except Exception as e:
                sequential_results.append(e)

        for result_list in list(parallel_results) + sequential_results:
            if isinstance(result_list, Exception):
                print(f"Exception during fetch: {result_list}")
                continue
            for paper in result_list:
                dedup_key = paper.title.lower().strip()
                if dedup_key not in all_papers_dict:
                    all_papers_dict[dedup_key] = paper

    return list(all_papers_dict.values())
