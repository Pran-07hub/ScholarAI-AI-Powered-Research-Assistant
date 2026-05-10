import logging
from typing import List
from models import Paper
from beanie import PydanticObjectId
from services.synthesis import analyze_research_gaps_from_papers

logger = logging.getLogger(__name__)


async def analyze_research_gaps(paper_ids: List[str]) -> dict:
    """
    Fetch papers by ID and run research gap analysis using Gemini.
    Returns {current_state, limitations, underexplored, future_directions}.
    """
    papers: list[Paper] = []
    for pid in paper_ids:
        try:
            p = await Paper.get(PydanticObjectId(pid))
            if p:
                papers.append(p)
        except Exception as e:
            logger.warning(f"Could not fetch paper {pid}: {e}")

    if not papers:
        return {"error": "No valid papers found for gap analysis."}

    return await analyze_research_gaps_from_papers(papers)
