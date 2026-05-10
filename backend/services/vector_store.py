"""
vector_store.py — Per-project ChromaDB vector store for ScholarAI.

Each project gets its own named collection, so users' papers are
fully isolated from each other.
"""
from __future__ import annotations

import os
import logging
from typing import Optional

logger = logging.getLogger(__name__)

_CHROMA_PATH = os.getenv("CHROMA_PERSIST_PATH", "/app/chromadb")
_EMBED_MODEL = "all-MiniLM-L6-v2"

_client = None
_ef = None


def _get_client():
    global _client, _ef
    if _client is not None:
        return _client, _ef

    import chromadb
    from chromadb.utils import embedding_functions

    os.makedirs(_CHROMA_PATH, exist_ok=True)
    _client = chromadb.PersistentClient(path=_CHROMA_PATH)
    _ef = embedding_functions.SentenceTransformerEmbeddingFunction(
        model_name=_EMBED_MODEL
    )
    logger.info("ChromaDB client initialised at %s", _CHROMA_PATH)
    return _client, _ef


def _col_name(project_id: str) -> str:
    # ChromaDB names: 3-63 chars, alphanumeric + hyphens only
    return f"proj-{project_id}"


# ── Write ─────────────────────────────────────────────────────────────────────

def index_papers(project_id: str, papers: list[dict]) -> None:
    """
    Upsert papers into the project's ChromaDB collection.

    Each dict in `papers` must have:
        id   : str   — MongoDB ObjectId as string (used as ChromaDB doc id)
        text : str   — abstract or full text to embed
    Optional keys: title, authors (list[str] or str), source, pdf_url
    """
    if not papers:
        return

    client, ef = _get_client()
    collection = client.get_or_create_collection(
        name=_col_name(project_id),
        embedding_function=ef,
        metadata={"hnsw:space": "cosine"},
    )

    ids, documents, metadatas = [], [], []
    for p in papers:
        text = (p.get("text") or "").strip()
        if not text:
            continue
        authors = p.get("authors", "")
        if isinstance(authors, list):
            authors = ", ".join(authors)
        ids.append(str(p["id"]))
        documents.append(text)
        metadatas.append({
            "title":   p.get("title", ""),
            "authors": authors,
            "source":  p.get("source", ""),
            "pdf_url": p.get("pdf_url") or "",
        })

    if ids:
        collection.upsert(ids=ids, documents=documents, metadatas=metadatas)
        logger.info("Indexed %d papers into ChromaDB collection '%s'", len(ids), project_id)


# ── Read ──────────────────────────────────────────────────────────────────────

def search_similar_papers(project_id: str, query: str, n_results: int = 6) -> list[dict]:
    """
    Semantic search over the project's indexed papers.

    Returns a list of dicts with keys: id, title, authors, source, pdf_url, text.
    Returns [] if the project has no indexed papers yet.
    """
    client, ef = _get_client()
    try:
        collection = client.get_collection(name=_col_name(project_id), embedding_function=ef)
    except Exception:
        return []  # collection doesn't exist yet

    count = collection.count()
    if count == 0:
        return []

    results = collection.query(
        query_texts=[query],
        n_results=min(n_results, count),
        include=["documents", "metadatas"],
    )

    papers = []
    for doc_id, doc, meta in zip(
        results.get("ids", [[]])[0],
        results.get("documents", [[]])[0],
        results.get("metadatas", [[]])[0],
    ):
        papers.append({
            "id":      doc_id,
            "text":    doc,
            "title":   meta.get("title", ""),
            "authors": meta.get("authors", ""),
            "source":  meta.get("source", ""),
            "pdf_url": meta.get("pdf_url", ""),
        })

    return papers


# ── Delete ────────────────────────────────────────────────────────────────────

def delete_project_collection(project_id: str) -> None:
    """Remove the entire collection when a project is deleted."""
    client, _ = _get_client()
    try:
        client.delete_collection(_col_name(project_id))
        logger.info("Deleted ChromaDB collection for project '%s'", project_id)
    except Exception as e:
        logger.warning("Could not delete ChromaDB collection for project '%s': %s", project_id, e)
