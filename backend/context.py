"""
Async context variables for passing per-request state (like user API keys)
to utility functions and tools without changing their signatures.
"""
from contextvars import ContextVar

# Maps source slug -> decrypted API key for the current request's authenticated user.
# e.g. {"scopus": "abc123", "ieee": "xyz456"}
# Defaults to empty dict (no user keys) for unauthenticated requests.
user_api_keys_ctx: ContextVar[dict] = ContextVar("user_api_keys", default={})
