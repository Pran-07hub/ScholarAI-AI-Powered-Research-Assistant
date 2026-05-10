import logging
from typing import List
from models import Paper
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.prompts import ChatPromptTemplate
from utils.research_paper_summariser.config import get_google_api_key
from utils.json_repair import parse_json_with_retry, parse_json_robust

logger = logging.getLogger(__name__)

SYNTHESIS_PROMPT = """You are an expert academic researcher. Analyze the provided research papers and identify the main recurring topics discussed across them.

For each topic:
- Give it a concise, clear topic name (3-7 words max)
- Write a brief 1-2 sentence summary of what this topic is about
- List the IDs of ALL papers that discuss this topic

Return YOUR ENTIRE RESPONSE as a single valid JSON array (no markdown, no code blocks):
[
  {{
    "topic": "Topic Name Here",
    "summary": "Brief 1-2 sentence description.",
    "paper_ids": ["<paper_id_1>", "<paper_id_2>"]
  }}
]

Rules:
- Identify 3 to 7 topics maximum (quality over quantity)
- Every paper should appear under at least one topic
- paper_ids must match the exact Paper IDs provided in the input
- Return ONLY the JSON array, nothing else"""

GAP_ANALYSIS_PROMPT = """You are an expert academic researcher performing research gap analysis.

Based on the following papers, identify:
1. What is the current state of the field
2. What are the key limitations or weaknesses in existing research
3. What research questions remain underexplored
4. What future research directions are most promising

Return YOUR ENTIRE RESPONSE as a single valid JSON object (no markdown, no code blocks):
{{
  "current_state": "2-3 sentence summary of what we know",
  "limitations": ["limitation 1", "limitation 2", ...],
  "underexplored": ["gap 1", "gap 2", ...],
  "future_directions": ["direction 1", "direction 2", ...]
}}"""


def _build_llm(temperature: float = 0.2) -> ChatGoogleGenerativeAI:
    return ChatGoogleGenerativeAI(
        model="gemini-2.5-flash",
        google_api_key=get_google_api_key(),
        temperature=temperature,
    )


def _build_context(papers: List[Paper]) -> str:
    parts = [
        f"Paper ID: {str(p.id)}\nTitle: {p.title}\nAbstract: {p.abstract or 'No abstract available.'}"
        for p in papers
    ]
    return "\n\n---\n\n".join(parts)


def _validate_topics(topics: list, valid_ids: set) -> list:
    """Ensure every paper_id in the response actually exists in the input set."""
    cleaned = []
    for entry in topics:
        if not isinstance(entry, dict):
            continue
        valid_paper_ids = [pid for pid in entry.get("paper_ids", []) if pid in valid_ids]
        cleaned.append({
            "topic": entry.get("topic", "Unknown Topic"),
            "summary": entry.get("summary", ""),
            "paper_ids": valid_paper_ids,
        })
    return cleaned


async def synthesize_topics(papers: List[Paper]) -> list:
    """
    Uses Gemini to identify main topics discussed across a list of papers.
    Returns a list of topic dicts: {topic, summary, paper_ids}.
    """
    if not papers:
        return []

    valid_ids = {str(p.id) for p in papers}
    context = _build_context(papers)
    llm = _build_llm(temperature=0.2)

    prompt = ChatPromptTemplate.from_messages([
        ("system", SYNTHESIS_PROMPT),
        ("human", "Here are the papers to analyze:\n\n{context}\n\nIdentify the main topics and return the JSON array."),
    ])

    try:
        topics = await parse_json_with_retry(llm, prompt | llm, {"context": context}, expected_type="array")
        if not isinstance(topics, list):
            raise ValueError("Response is not a JSON array")
        return _validate_topics(topics, valid_ids)
    except Exception as e:
        logger.error(f"Topic synthesis failed: {e}", exc_info=True)
        return []


async def analyze_research_gaps_from_papers(papers: List[Paper]) -> dict:
    """
    Uses Gemini to perform a structured research gap analysis from a list of Paper documents.
    Returns {current_state, limitations, underexplored, future_directions}.
    """
    if not papers:
        return {}

    context = _build_context(papers)
    llm = _build_llm(temperature=0.3)

    prompt = ChatPromptTemplate.from_messages([
        ("system", GAP_ANALYSIS_PROMPT),
        ("human", "Analyze the research gaps in these papers:\n\n{context}\n\nReturn the JSON object now."),
    ])

    try:
        result = await parse_json_with_retry(llm, prompt | llm, {"context": context}, expected_type="object")
        for key in ("current_state", "limitations", "underexplored", "future_directions"):
            result.setdefault(key, [] if key != "current_state" else "")
        return result
    except Exception as e:
        logger.error(f"Gap analysis failed: {e}", exc_info=True)
        return {}
