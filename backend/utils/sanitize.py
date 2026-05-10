"""
Input sanitization utilities.
Use these on all user-supplied text stored in MongoDB and returned to the frontend.
"""
import re
from typing import Optional

# Allowed HTML tags for rich-text fields (note content can have basic formatting)
_ALLOWED_TAGS = ["b", "i", "em", "strong", "u", "p", "br", "ul", "ol", "li", "blockquote", "code", "pre"]
_ALLOWED_ATTRS: dict = {}  # no attributes allowed


def sanitize_rich_text(text: Optional[str]) -> str:
    """
    Sanitize user-supplied rich text (e.g., note content).
    Strips all HTML except a safe subset of formatting tags.
    """
    if not text:
        return ""
    try:
        import bleach
        return bleach.clean(text, tags=_ALLOWED_TAGS, attributes=_ALLOWED_ATTRS, strip=True)
    except ImportError:
        # Fallback: strip all tags if bleach not installed
        return _strip_all_tags(text)


def sanitize_plain_text(text: Optional[str]) -> str:
    """
    Sanitize plain text fields (titles, names, short strings).
    Strips all HTML tags entirely.
    """
    if not text:
        return ""
    try:
        import bleach
        return bleach.clean(text, tags=[], attributes={}, strip=True).strip()
    except ImportError:
        return _strip_all_tags(text).strip()


def _strip_all_tags(text: str) -> str:
    """Regex fallback that removes all HTML tags."""
    return re.sub(r"<[^>]+>", "", text)


def sanitize_list(items: list) -> list:
    """Sanitize a list of plain text strings (e.g., authors, tags)."""
    return [sanitize_plain_text(item) for item in items if item]
