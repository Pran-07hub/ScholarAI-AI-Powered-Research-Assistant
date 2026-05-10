import logging
from typing import List
from langchain_core.tools import tool
from utils.research_paper_summariser.vector_store import VectorStore

logger = logging.getLogger(__name__)

vector_store = VectorStore()

@tool
async def fetch_paper_details_tool(query: str, n_results: int = 5) -> str:
    """
    Query the internal knowledge base of previously fetched academic papers.
    Use this tool to extract detailed information, methodologies, findings, or 
    summarize specific papers that have already been retrieved by the `search_papers_tool`.
    
    Args:
        query (str): The specific question or topic to search for within the papers 
                     (e.g., "What datasets did they use in the multimodal RAG paper?").
        n_results (int): Number of relevant chunks to retrieve. Defaults to 5.
        
    Returns:
        str: Relevant text chunks from the papers.
    """
    logger.info(f"fetch_paper_details_tool called with query: {query}")
    
    chunks = vector_store.search_similar_chunks(query, n_results=n_results)
    
    if not chunks:
        return "No relevant information found in the currently loaded papers. You may need to search for new papers first."
        
    # Join chunks with clear separators for the LLM to read
    return "\n\n---\n\n".join(chunks)
