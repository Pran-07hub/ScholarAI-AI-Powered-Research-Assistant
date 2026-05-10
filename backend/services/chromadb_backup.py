"""
ChromaDB GCS Backup Service

On startup: restore /app/chromadb from GCS if the bucket env var is set.
On shutdown: tar and upload /app/chromadb to GCS.

Environment variables:
  CHROMADB_BACKUP_BUCKET  — GCS bucket name (e.g. "my-bucket")
                            If unset, backup/restore is silently skipped.
  CHROMADB_BACKUP_OBJECT  — Object name inside the bucket (default: "chromadb_backup.tar.gz")
  CHROMADB_DIR            — Local directory to back up (default: "/app/chromadb")
"""

import asyncio
import logging
import os
import tarfile
import io
import tempfile

logger = logging.getLogger(__name__)

BUCKET = os.getenv("CHROMADB_BACKUP_BUCKET", "")
OBJECT = os.getenv("CHROMADB_BACKUP_OBJECT", "chromadb_backup.tar.gz")
CHROMA_DIR = os.getenv("CHROMADB_DIR", "/app/chromadb")


def _get_gcs_client():
    from google.cloud import storage
    return storage.Client()


def _restore_sync() -> bool:
    """Download and extract ChromaDB backup from GCS. Returns True on success."""
    try:
        client = _get_gcs_client()
        bucket = client.bucket(BUCKET)
        blob = bucket.blob(OBJECT)

        if not blob.exists():
            logger.info("No ChromaDB backup found in GCS (%s/%s) — starting fresh", BUCKET, OBJECT)
            return False

        logger.info("Restoring ChromaDB from GCS: gs://%s/%s", BUCKET, OBJECT)
        data = blob.download_as_bytes()

        os.makedirs(CHROMA_DIR, exist_ok=True)
        with tarfile.open(fileobj=io.BytesIO(data), mode="r:gz") as tar:
            tar.extractall(path=os.path.dirname(CHROMA_DIR))

        logger.info("ChromaDB restored successfully (%d bytes)", len(data))
        return True
    except Exception as e:
        logger.warning("ChromaDB GCS restore failed: %s", e)
        return False


def _backup_sync() -> bool:
    """Tar the ChromaDB directory and upload to GCS. Returns True on success."""
    if not os.path.isdir(CHROMA_DIR):
        logger.info("ChromaDB directory %s does not exist — nothing to back up", CHROMA_DIR)
        return False

    try:
        logger.info("Backing up ChromaDB to GCS: gs://%s/%s", BUCKET, OBJECT)
        buf = io.BytesIO()
        with tarfile.open(fileobj=buf, mode="w:gz") as tar:
            tar.add(CHROMA_DIR, arcname=os.path.basename(CHROMA_DIR))
        buf.seek(0)
        data = buf.read()

        client = _get_gcs_client()
        bucket = client.bucket(BUCKET)
        blob = bucket.blob(OBJECT)
        blob.upload_from_string(data, content_type="application/gzip")

        logger.info("ChromaDB backed up successfully (%d bytes)", len(data))
        return True
    except Exception as e:
        logger.warning("ChromaDB GCS backup failed: %s", e)
        return False


async def restore_on_startup() -> None:
    """Restore ChromaDB from GCS backup on app startup (async wrapper)."""
    if not BUCKET:
        logger.debug("CHROMADB_BACKUP_BUCKET not set — skipping restore")
        return
    loop = asyncio.get_event_loop()
    await loop.run_in_executor(None, _restore_sync)


async def backup_on_shutdown() -> None:
    """Back up ChromaDB to GCS on app shutdown (async wrapper)."""
    if not BUCKET:
        return
    loop = asyncio.get_event_loop()
    await loop.run_in_executor(None, _backup_sync)
