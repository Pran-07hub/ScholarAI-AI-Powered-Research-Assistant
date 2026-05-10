"""
User API key management — store, validate, update, and delete per-user
premium API keys for paper sources (CORE, IEEE, Springer, Scopus, SerpAPI).

Keys are AES-encrypted (Fernet/AES-128-CBC) before being stored in MongoDB.
Plaintext values are never returned in any API response.
"""
import asyncio
import aiohttp
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from models import User, UserApiKeys
from auth import get_current_user
from utils.encryption import encrypt_value

router = APIRouter(prefix="/api-keys", tags=["API Keys"])

VALID_SOURCES = {"core", "ieee", "springer", "scopus", "serp"}

SOURCE_META = {
    "core":     {"label": "CORE",                      "description": "200M+ open-access papers aggregated from repositories worldwide"},
    "ieee":     {"label": "IEEE Xplore",               "description": "Authoritative source for engineering, CS, and electronics research"},
    "springer": {"label": "Springer Nature",           "description": "Broad multidisciplinary journal coverage across all disciplines"},
    "scopus":   {"label": "Scopus (Elsevier)",         "description": "90M+ peer-reviewed records across journals, books, and conferences"},
    "serp":     {"label": "Google Scholar via SerpAPI","description": "Broadest academic search engine covering all disciplines and grey literature"},
}


class SaveKeyRequest(BaseModel):
    key: str


# ── Per-source validators ─────────────────────────────────────────────────────

async def _validate_core(key: str) -> tuple[bool, str]:
    async with aiohttp.ClientSession() as session:
        try:
            async with session.post(
                "https://api.core.ac.uk/v3/search/works",
                json={"q": "test", "limit": 1},
                headers={"Authorization": f"Bearer {key}"},
                timeout=aiohttp.ClientTimeout(total=10),
            ) as resp:
                if resp.status == 200:
                    return True, "Valid"
                if resp.status in (401, 403):
                    return False, "Invalid key — rejected by CORE."
                return False, f"CORE returned unexpected status {resp.status}."
        except aiohttp.ClientError as e:
            return False, f"Could not reach CORE: {e}"


async def _validate_ieee(key: str) -> tuple[bool, str]:
    async with aiohttp.ClientSession() as session:
        try:
            async with session.get(
                "https://ieeexploreapi.ieee.org/api/v1/search/articles",
                params={"querytext": "test", "max_records": 1, "apikey": key, "format": "json"},
                timeout=aiohttp.ClientTimeout(total=10),
            ) as resp:
                if resp.status == 200:
                    return True, "Valid"
                if resp.status in (401, 403):
                    return False, "Invalid key — rejected by IEEE Xplore."
                return False, f"IEEE returned unexpected status {resp.status}."
        except aiohttp.ClientError as e:
            return False, f"Could not reach IEEE: {e}"


async def _validate_springer(key: str) -> tuple[bool, str]:
    async with aiohttp.ClientSession() as session:
        try:
            async with session.get(
                "https://api.springernature.com/openaccess/json",
                params={"q": "test", "p": 1, "api_key": key},
                timeout=aiohttp.ClientTimeout(total=10),
            ) as resp:
                if resp.status == 200:
                    return True, "Valid"
                if resp.status in (401, 403):
                    return False, "Invalid key — rejected by Springer Nature."
                return False, f"Springer returned unexpected status {resp.status}."
        except aiohttp.ClientError as e:
            return False, f"Could not reach Springer: {e}"


async def _validate_scopus(key: str) -> tuple[bool, str]:
    async with aiohttp.ClientSession() as session:
        try:
            async with session.get(
                "https://api.elsevier.com/content/search/scopus",
                params={"query": "test", "count": 1},
                headers={"X-ELS-APIKey": key, "Accept": "application/json"},
                timeout=aiohttp.ClientTimeout(total=10),
            ) as resp:
                if resp.status == 200:
                    return True, "Valid"
                if resp.status in (401, 403):
                    return False, "Invalid key — rejected by Scopus."
                return False, f"Scopus returned unexpected status {resp.status}."
        except aiohttp.ClientError as e:
            return False, f"Could not reach Scopus: {e}"


async def _validate_serp(key: str) -> tuple[bool, str]:
    async with aiohttp.ClientSession() as session:
        try:
            async with session.get(
                "https://serpapi.com/account.json",
                params={"api_key": key},
                timeout=aiohttp.ClientTimeout(total=10),
            ) as resp:
                if resp.status == 200:
                    return True, "Valid"
                if resp.status in (401, 403):
                    return False, "Invalid key — rejected by SerpAPI."
                return False, f"SerpAPI returned unexpected status {resp.status}."
        except aiohttp.ClientError as e:
            return False, f"Could not reach SerpAPI: {e}"


_VALIDATORS = {
    "core":     _validate_core,
    "ieee":     _validate_ieee,
    "springer": _validate_springer,
    "scopus":   _validate_scopus,
    "serp":     _validate_serp,
}


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("")
async def list_api_keys(current_user: User = Depends(get_current_user)):
    """Return which sources have a key configured. Key values are never included."""
    doc = await UserApiKeys.find_one({"user_id.$id": current_user.id})
    configured = set(doc.keys.keys()) if doc else set()
    return {
        "sources": [
            {
                "source": src,
                "label": SOURCE_META[src]["label"],
                "description": SOURCE_META[src]["description"],
                "configured": src in configured,
            }
            for src in VALID_SOURCES
        ]
    }


@router.put("/{source}")
async def save_api_key(
    source: str,
    body: SaveKeyRequest,
    current_user: User = Depends(get_current_user),
):
    """Validate the key against the live API, then encrypt and store it."""
    if source not in VALID_SOURCES:
        raise HTTPException(status_code=400, detail=f"Unknown source '{source}'. Valid: {sorted(VALID_SOURCES)}")

    key = body.key.strip()
    if not key:
        raise HTTPException(status_code=422, detail="Key must not be empty.")

    try:
        is_valid, message = await asyncio.wait_for(_VALIDATORS[source](key), timeout=12)
    except asyncio.TimeoutError:
        raise HTTPException(
            status_code=504,
            detail=f"Validation timed out — {SOURCE_META[source]['label']} did not respond in time.",
        )
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Validation request failed: {e}")

    if not is_valid:
        raise HTTPException(status_code=422, detail=message)

    encrypted = encrypt_value(key)
    doc = await UserApiKeys.find_one({"user_id.$id": current_user.id})
    if doc:
        doc.keys[source] = encrypted
        doc.updated_at = datetime.utcnow()
        await doc.save()
    else:
        doc = UserApiKeys(user_id=current_user, keys={source: encrypted})
        await doc.insert()

    return {
        "source": source,
        "label": SOURCE_META[source]["label"],
        "configured": True,
        "message": f"{SOURCE_META[source]['label']} key saved successfully.",
    }


@router.delete("/{source}")
async def delete_api_key(
    source: str,
    current_user: User = Depends(get_current_user),
):
    """Remove a stored API key for the given source."""
    if source not in VALID_SOURCES:
        raise HTTPException(status_code=400, detail=f"Unknown source '{source}'.")

    doc = await UserApiKeys.find_one({"user_id.$id": current_user.id})
    if not doc or source not in doc.keys:
        raise HTTPException(status_code=404, detail=f"No {SOURCE_META[source]['label']} key found.")

    doc.keys.pop(source)
    doc.updated_at = datetime.utcnow()
    await doc.save()
    return {
        "source": source,
        "configured": False,
        "message": f"{SOURCE_META[source]['label']} key removed.",
    }
