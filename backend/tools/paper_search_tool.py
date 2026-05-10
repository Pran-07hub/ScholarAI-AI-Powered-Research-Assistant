import logging
from typing import List, Dict, Any
from langchain_core.tools import tool
from utils.research_paper_summariser.fetcher import fetch_papers
from utils.research_paper_summariser.vector_store import VectorStore

logger = logging.getLogger(__name__)

# Initialize VectorStore singleton or reuse where possible. 
# For simplicity, we'll instantiate it here as it was done in the previous service.
vector_store = VectorStore()

@tool
async def search_papers_tool(keywords: List[str]) -> List[Dict[str, Any]]:
    """
    Search for academic papers based on a list of keywords.
    Use this tool when you need to find new research papers, articles, or studies 
    on a specific topic.
    
    Args:
        keywords (List[str]): A list of search query strings (e.g. ["multimodal RAG", "vision transformers"]).
        
    Returns:
        List[Dict]: A list of papers with their metadata (title, authors, summary, url, etc.).
    """
    logger.info(f"search_papers_tool called with keywords: {keywords}")
    
    # Fetch papers using existing logic
    papers = await fetch_papers(keywords)
    
    if not papers:
        logger.warning(f"No papers found for keywords: {keywords}")
        return []
        
    # Add to vector store for later RAG querying by the paper_fetch_tool
    vector_store.add_papers(papers)
    
    # Convert Pydantic objects to dicts for the agent
    return [paper.dict() for paper in papers]
