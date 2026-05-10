"""
Conference Calendar Service
Fetches upcoming academic conferences and deadlines from WikiCFP RSS feeds.
"""

import feedparser
import asyncio
import re
import time
import urllib.parse
from typing import List, Optional, Dict, Tuple
from bs4 import BeautifulSoup
from dateutil import parser as dateutil_parser

# Cache TTL: 6 hours
_cache: Dict[str, Tuple[list, float]] = {}
CACHE_TTL = 6 * 3600

# Map common research domain terms to WikiCFP category slugs
DOMAIN_TO_WIKICFP: Dict[str, str] = {
    "machine learning": "machine+learning",
    "deep learning": "deep+learning",
    "artificial intelligence": "artificial+intelligence",
    "natural language processing": "natural+language+processing",
    "nlp": "natural+language+processing",
    "computer vision": "computer+vision",
    "cv": "computer+vision",
    "data mining": "data+mining",
    "information retrieval": "information+retrieval",
    "robotics": "robotics",
    "bioinformatics": "bioinformatics",
    "networking": "networking",
    "cybersecurity": "security",
    "security": "security",
    "databases": "database",
    "database": "database",
    "software engineering": "software+engineering",
    "human computer interaction": "hci",
    "hci": "hci",
    "systems": "systems",
    "ai": "artificial+intelligence",
    "ml": "machine+learning",
    "reinforcement learning": "reinforcement+learning",
    "knowledge graphs": "knowledge+graph",
    "graph neural networks": "graph+neural+network",
    "multimodal": "multimodal",
    "speech": "speech",
    "healthcare": "healthcare",
    "medical imaging": "medical+imaging",
}


def _parse_date_flexible(date_str: str) -> Optional[str]:
    """Parse a date string into ISO format. Returns None if unparseable."""
    if not date_str:
        return None
    clean = date_str.strip()
    if clean.lower() in {"n/a", "tba", "tbd", "-", ""}:
        return None
    try:
        dt = dateutil_parser.parse(clean, fuzzy=True)
        return dt.strftime("%Y-%m-%d")
    except Exception:
        # Return as-is if it looks like a year is present (human-readable fallback)
        if re.search(r"\d{4}", clean):
            return clean[:60]
        return None


def _parse_wikicfp_entry(entry: dict, topic: str) -> Optional[dict]:
    """Parse one feedparser entry from WikiCFP into a structured dict."""
    try:
        raw_title = entry.get("title", "")
        # Strip "CFP:" prefix that WikiCFP prepends
        title = re.sub(r"^CFP\s*:\s*", "", raw_title).strip()
        link = entry.get("link", "")

        # Try to extract a short acronym (2-8 uppercase letters, optionally followed by year)
        acronym = ""
        acronym_match = re.search(r"\b([A-Z]{2,8})(?:[- ]\d{2,4})?\b", title)
        if acronym_match:
            acronym = acronym_match.group(0).strip()

        # Parse HTML description for structured dates
        description = entry.get("summary", "") or entry.get("description", "")
        submission_deadline = notification_date = camera_ready = conference_date = location = None

        if description:
            soup = BeautifulSoup(description, "html.parser")
            for row in soup.find_all("tr"):
                cells = row.find_all(["th", "td"])
                if len(cells) < 2:
                    continue
                label = cells[0].get_text(strip=True).lower()
                value = cells[-1].get_text(strip=True)

                if any(k in label for k in ("submission", "abstract", "paper deadline")):
                    submission_deadline = _parse_date_flexible(value)
                elif "notification" in label:
                    notification_date = _parse_date_flexible(value)
                elif "camera" in label or "final version" in label:
                    camera_ready = _parse_date_flexible(value)
                elif label in ("when", "dates") or "conference date" in label:
                    conference_date = _parse_date_flexible(value)
                elif label in ("where", "location"):
                    location = value[:100] if value else None

        return {
            "name": title,
            "acronym": acronym,
            "topics": [topic],
            "submission_deadline": submission_deadline,
            "notification_date": notification_date,
            "camera_ready": camera_ready,
            "conference_date": conference_date,
            "location": location,
            "website": link,
            "source": "wikicfp",
            "rank": None,
        }
    except Exception:
        return None


async def fetch_wikicfp_conferences(topic: str, limit: int = 15) -> list:
    """Fetch and parse WikiCFP RSS entries for a given topic. Results are cached."""
    normalized = topic.lower().strip()
    wikicfp_cat = DOMAIN_TO_WIKICFP.get(normalized, urllib.parse.quote(normalized))

    if wikicfp_cat in _cache:
        cached_data, ts = _cache[wikicfp_cat]
        if time.time() - ts < CACHE_TTL:
            return cached_data[:limit]

    rss_url = f"http://www.wikicfp.com/cfp/rss?cat={wikicfp_cat}"

    try:
        loop = asyncio.get_event_loop()
        feed = await asyncio.wait_for(
            loop.run_in_executor(None, feedparser.parse, rss_url),
            timeout=12.0,
        )
        conferences = []
        for entry in feed.entries:
            try:
                conf = _parse_wikicfp_entry(entry, topic)
                if conf:
                    conferences.append(conf)
            except Exception:
                continue  # skip malformed entries, keep the rest

        _cache[wikicfp_cat] = (conferences, time.time())
        return conferences[:limit]
    except asyncio.TimeoutError:
        # WikiCFP is slow — return cached if available (even if stale), else empty
        if wikicfp_cat in _cache:
            return _cache[wikicfp_cat][0][:limit]
        return []
    except Exception:
        return []


def _infer_topics_from_text(text: str) -> List[str]:
    """Return known WikiCFP topics found in free text."""
    lower = text.lower()
    found = []
    for domain in DOMAIN_TO_WIKICFP:
        if domain in lower and domain not in found:
            found.append(domain)
    # Prefer more specific terms over broad ones
    if "deep learning" in found and "machine learning" in found:
        found.remove("machine learning")
    if "nlp" in found and "natural language processing" in found:
        found.remove("nlp")
    if "cv" in found and "computer vision" in found:
        found.remove("cv")
    if "ai" in found and "artificial intelligence" in found:
        found.remove("ai")
    if "ml" in found and "machine learning" in found:
        found.remove("ml")
    return found


async def get_conferences_for_project(
    project_name: str,
    description: str,
    paper_titles: List[str],
) -> list:
    """Return relevant upcoming conferences derived from project context."""
    combined_text = " ".join([project_name, description] + paper_titles)
    topics = _infer_topics_from_text(combined_text)

    if not topics:
        topics = ["artificial intelligence", "machine learning"]

    all_conferences: list = []
    seen_names: set = set()

    # Fetch for up to 3 topics concurrently
    tasks = [fetch_wikicfp_conferences(t, limit=15) for t in topics[:3]]
    results = await asyncio.gather(*tasks, return_exceptions=True)

    for confs in results:
        if isinstance(confs, list):
            for c in confs:
                if c["name"] and c["name"] not in seen_names:
                    seen_names.add(c["name"])
                    all_conferences.append(c)

    # Sort: conferences with upcoming submission deadlines first
    def _sort_key(c: dict) -> str:
        dl = c.get("submission_deadline") or ""
        return dl if dl else "9999-12-31"

    all_conferences.sort(key=_sort_key)
    return all_conferences[:25]
