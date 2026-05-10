"""
storage_service.py — Google Cloud Storage helper for ScholarAI.

Used to persist uploads, FAISS indexes, and other artifacts to GCS so
they survive container restarts and can be shared across instances.

Requires:
    pip install google-cloud-storage

Environment variables:
    GCS_BUCKET_NAME               — name of your GCS bucket
    GOOGLE_APPLICATION_CREDENTIALS — path to service-account key JSON
                                     (omit to use Application Default Credentials)
"""

from __future__ import annotations

import os
import logging
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)

_client = None
_bucket = None


def _get_bucket():
    """Lazily initialise the GCS client and return the configured bucket."""
    global _client, _bucket
    if _bucket is not None:
        return _bucket

    try:
        from google.cloud import storage  # type: ignore
    except ImportError as exc:
        raise ImportError(
            "google-cloud-storage is not installed. "
            "Add it to requirements.txt: google-cloud-storage"
        ) from exc

    bucket_name = os.getenv("GCS_BUCKET_NAME")
    if not bucket_name:
        raise ValueError("GCS_BUCKET_NAME environment variable is not set.")

    _client = storage.Client()
    _bucket = _client.bucket(bucket_name)
    return _bucket


# ─── Upload ───────────────────────────────────────────────────────────────────

def upload_file(local_path: str | Path, gcs_path: str, *, content_type: Optional[str] = None) -> str:
    """Upload a local file to GCS.

    Args:
        local_path:   Absolute or relative path to the source file.
        gcs_path:     Destination object name inside the bucket (e.g. "uploads/paper.pdf").
        content_type: Optional MIME type override.

    Returns:
        The public GCS URI: ``gs://<bucket>/<gcs_path>``
    """
    bucket = _get_bucket()
    blob = bucket.blob(gcs_path)
    blob.upload_from_filename(str(local_path), content_type=content_type)
    uri = f"gs://{bucket.name}/{gcs_path}"
    logger.info("Uploaded %s → %s", local_path, uri)
    return uri


def upload_bytes(data: bytes, gcs_path: str, *, content_type: str = "application/octet-stream") -> str:
    """Upload raw bytes to GCS."""
    bucket = _get_bucket()
    blob = bucket.blob(gcs_path)
    blob.upload_from_string(data, content_type=content_type)
    uri = f"gs://{bucket.name}/{gcs_path}"
    logger.info("Uploaded bytes → %s", uri)
    return uri


# ─── Download ─────────────────────────────────────────────────────────────────

def download_file(gcs_path: str, local_path: str | Path) -> None:
    """Download a GCS object to a local file.

    Creates parent directories automatically.
    """
    local_path = Path(local_path)
    local_path.parent.mkdir(parents=True, exist_ok=True)
    bucket = _get_bucket()
    blob = bucket.blob(gcs_path)
    blob.download_to_filename(str(local_path))
    logger.info("Downloaded gs://%s/%s → %s", bucket.name, gcs_path, local_path)


def download_bytes(gcs_path: str) -> bytes:
    """Download a GCS object and return its content as bytes."""
    bucket = _get_bucket()
    blob = bucket.blob(gcs_path)
    data = blob.download_as_bytes()
    logger.info("Downloaded bytes from gs://%s/%s", bucket.name, gcs_path)
    return data


# ─── List / Delete ────────────────────────────────────────────────────────────

def list_files(prefix: str = "") -> list[str]:
    """Return a list of object names under *prefix* in the bucket."""
    bucket = _get_bucket()
    return [blob.name for blob in bucket.list_blobs(prefix=prefix)]


def delete_file(gcs_path: str) -> None:
    """Delete a single object from GCS (no-op if it doesn't exist)."""
    bucket = _get_bucket()
    blob = bucket.blob(gcs_path)
    blob.delete()
    logger.info("Deleted gs://%s/%s", bucket.name, gcs_path)


def file_exists(gcs_path: str) -> bool:
    """Return True if the object exists in GCS."""
    bucket = _get_bucket()
    return bucket.blob(gcs_path).exists()


# ─── Signed URL (for time-limited browser downloads) ─────────────────────────

def generate_signed_url(gcs_path: str, expiration_minutes: int = 60) -> str:
    """Generate a temporary signed URL for browser-accessible download."""
    import datetime
    bucket = _get_bucket()
    blob = bucket.blob(gcs_path)
    url = blob.generate_signed_url(
        expiration=datetime.timedelta(minutes=expiration_minutes),
        method="GET",
    )
    return url
