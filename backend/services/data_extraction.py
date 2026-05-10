import logging
from typing import List
from models import Paper
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.prompts import ChatPromptTemplate
from utils.research_paper_summariser.config import get_google_api_key
from utils.json_repair import parse_json_robust

logger = logging.getLogger(__name__)

EXTRACTION_FIELDS = ["sample_size", "study_type", "effect_size", "population", "methodology"]

SYSTEM_PROMPT = """You are an expert academic researcher performing structured data extraction from research paper metadata.
For each paper provided, extract the following fields from its title and abstract:
- sample_size: Total number of participants or samples (e.g., "n=120", "N/A (Review)")
- study_type: Study design (e.g., "RCT", "Meta-analysis", "Systematic Review", "Cohort", "Case-control")
- effect_size: Primary effect size or key quantitative finding (e.g., "d=0.89", "OR=1.45", "N/A")
- population: Study population description (e.g., "Adults 18-65", "Pediatric patients", "General")
- methodology: Brief description of the research methodology used

Return YOUR ENTIRE RESPONSE as a single valid JSON object (no markdown, no code blocks):
{{
  "<paper_id>": {{
    "sample_size": "...",
    "study_type": "...",
    "effect_size": "...",
    "population": "...",
    "methodology": "..."
  }}
}}

If a field cannot be determined from the provided text, use "Not specified"."""

BATCH_SIZE = 8  # Papers per LLM call to stay within context limits


def _build_llm() -> ChatGoogleGenerativeAI:
    return ChatGoogleGenerativeAI(
        model="gemini-2.5-flash",
        google_api_key=get_google_api_key(),
        temperature=0.1,
    )


async def _extract_batch(papers: List[Paper], llm: ChatGoogleGenerativeAI) -> dict:
    """Extract structured fields for a batch of papers. Returns partial dict on failure."""
    context_parts = [
        f"Paper ID: {str(p.id)}\nTitle: {p.title}\nAbstract: {p.abstract or 'No abstract available.'}"
        for p in papers
    ]
    context = "\n\n---\n\n".join(context_parts)

    prompt = ChatPromptTemplate.from_messages([
        ("system", SYSTEM_PROMPT),
        ("human", "Extract structured data from these papers:\n\n{context}\n\nReturn the JSON object now."),
    ])
    chain = prompt | llm

    try:
        response = await chain.ainvoke({"context": context})
        raw = response.content.strip() if hasattr(response, "content") else str(response)
        return parse_json_robust(raw, expected_type="object")
    except Exception as e:
        logger.error(f"Batch extraction error: {e}", exc_info=True)
        return {
            str(p.id): {field: "Extraction failed" for field in EXTRACTION_FIELDS}
            for p in papers
        }


async def extract_paper_data(papers: List[Paper]) -> dict:
    """
    Uses Gemini to extract structured data fields from a list of papers.
    Papers are processed in batches to avoid context-window limits.
    Returns a dict mapping paper_id -> extracted fields dict.
    """
    if not papers:
        return {}

    llm = _build_llm()
    merged: dict = {}

    batches = [papers[i:i + BATCH_SIZE] for i in range(0, len(papers), BATCH_SIZE)]
    logger.info(f"Extracting data for {len(papers)} papers in {len(batches)} batch(es)")

    for i, batch in enumerate(batches):
        logger.info(f"Processing extraction batch {i + 1}/{len(batches)} ({len(batch)} papers)")
        batch_result = await _extract_batch(batch, llm)
        merged.update(batch_result)

    return merged
