"""
Robust JSON parsing utilities for Gemini AI responses.
Handles malformed JSON via progressive repair strategies before giving up.
"""
import json
import re
import logging
from typing import Any, Optional

logger = logging.getLogger(__name__)


def _strip_fences(text: str) -> str:
    """Remove markdown code fences."""
    return re.sub(r"```(?:json)?\s*|\s*```", "", text).strip()


def _truncate_at_last_valid(text: str, expected_start: str) -> str:
    """Try to truncate trailing garbage after the last valid JSON closing bracket/brace."""
    if expected_start == "[":
        # Find last ] that closes the array
        idx = text.rfind("]")
        if idx != -1:
            return text[: idx + 1]
    elif expected_start == "{":
        idx = text.rfind("}")
        if idx != -1:
            return text[: idx + 1]
    return text


def _remove_trailing_commas(text: str) -> str:
    """Remove trailing commas before closing braces/brackets (common LLM mistake)."""
    text = re.sub(r",\s*}", "}", text)
    text = re.sub(r",\s*]", "]", text)
    return text


def _fix_unquoted_keys(text: str) -> str:
    """Quote bare word keys in JSON objects."""
    return re.sub(r'(\{|,)\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*:', r'\1 "\2":', text)


def parse_json_robust(text: str, expected_type: str = "any") -> Any:
    """
    Parse JSON from an LLM response with progressive repair strategies.

    Args:
        text: Raw LLM response text.
        expected_type: "array", "object", or "any" — used to guide repair.

    Returns:
        Parsed Python object, or raises ValueError if all strategies fail.
    """
    if not text:
        raise ValueError("Empty response")

    # Strategy 1: strip fences and parse directly
    cleaned = _strip_fences(text)
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        pass

    # Strategy 2: find the JSON substring (array or object)
    start_char = "[" if expected_type == "array" else "{"
    end_char = "]" if expected_type == "array" else "}"
    if expected_type == "any":
        # Try both, prefer the one that appears first
        arr_idx = cleaned.find("[")
        obj_idx = cleaned.find("{")
        if arr_idx == -1 and obj_idx == -1:
            raise ValueError("No JSON structure found in response")
        if arr_idx != -1 and (obj_idx == -1 or arr_idx < obj_idx):
            start_char, end_char = "[", "]"
        else:
            start_char, end_char = "{", "}"

    start_idx = cleaned.find(start_char)
    if start_idx == -1:
        raise ValueError(f"No JSON {start_char} found in response")

    substring = cleaned[start_idx:]
    try:
        return json.loads(substring)
    except json.JSONDecodeError:
        pass

    # Strategy 3: truncate at last valid closing char
    truncated = _truncate_at_last_valid(substring, start_char)
    try:
        return json.loads(truncated)
    except json.JSONDecodeError:
        pass

    # Strategy 4: remove trailing commas
    fixed = _remove_trailing_commas(truncated)
    try:
        return json.loads(fixed)
    except json.JSONDecodeError:
        pass

    # Strategy 5: fix unquoted keys
    fixed2 = _fix_unquoted_keys(fixed)
    try:
        return json.loads(fixed2)
    except json.JSONDecodeError as e:
        raise ValueError(f"All JSON repair strategies failed. Last error: {e}. Text: {text[:200]}")


async def parse_json_with_retry(
    llm,
    prompt_chain,
    invoke_args: dict,
    expected_type: str = "any",
    max_retries: int = 2,
) -> Any:
    """
    Invoke an LLM chain and parse the JSON response with automatic retry on failure.
    On first failure, asks the LLM to fix its own output.

    Args:
        llm: The LangChain LLM instance.
        prompt_chain: Runnable chain (prompt | llm).
        invoke_args: Arguments to pass to chain.ainvoke().
        expected_type: "array", "object", or "any".
        max_retries: Number of fix-and-retry attempts.

    Returns:
        Parsed Python object.
    """
    response = await prompt_chain.ainvoke(invoke_args)
    raw = response.content if hasattr(response, "content") else str(response)

    try:
        return parse_json_robust(raw, expected_type)
    except ValueError as first_error:
        logger.warning(f"Initial JSON parse failed: {first_error}. Attempting repair via LLM.")

    for attempt in range(max_retries):
        fix_prompt = (
            f"Your previous response was not valid JSON. Please fix it.\n\n"
            f"Original response:\n{raw}\n\n"
            f"Return ONLY the corrected valid JSON {'array' if expected_type == 'array' else 'object'}, "
            f"no markdown, no explanation:"
        )
        try:
            fix_response = await llm.ainvoke(fix_prompt)
            fix_raw = fix_response.content if hasattr(fix_response, "content") else str(fix_response)
            result = parse_json_robust(fix_raw, expected_type)
            logger.info(f"JSON repaired on attempt {attempt + 1}")
            return result
        except (ValueError, Exception) as e:
            logger.warning(f"Repair attempt {attempt + 1} failed: {e}")

    raise ValueError(f"Failed to get valid JSON after {max_retries} repair attempts")
