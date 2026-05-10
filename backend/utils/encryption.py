"""
AES-based encryption for user API keys using Fernet (AES-128-CBC + HMAC-SHA256).

Generate a production key with:
    python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
Then set ENCRYPTION_SECRET=<value> in your .env
"""
import os
import base64
import hashlib
from cryptography.fernet import Fernet, InvalidToken

_fernet: Fernet | None = None


def _get_fernet() -> Fernet:
    global _fernet
    if _fernet is None:
        secret = os.getenv("ENCRYPTION_SECRET", "").strip()
        if not secret:
            # Dev fallback — must be overridden in production via ENCRYPTION_SECRET env var
            raw = hashlib.sha256(b"dev-only-do-not-use-in-production").digest()
            secret = base64.urlsafe_b64encode(raw).decode()
        _fernet = Fernet(secret.encode())
    return _fernet


def encrypt_value(plaintext: str) -> str:
    """Encrypt a string and return the ciphertext as a string."""
    return _get_fernet().encrypt(plaintext.encode()).decode()


def decrypt_value(ciphertext: str) -> str:
    """Decrypt a ciphertext string and return the plaintext. Raises ValueError on failure."""
    try:
        return _get_fernet().decrypt(ciphertext.encode()).decode()
    except InvalidToken:
        raise ValueError("Failed to decrypt — the key may be corrupted. Please re-enter it.")
