from .schemas import SummaryRequest, SummaryResponse
from .preprocessing import preprocess_query
from .keyword_generator import generate_keywords
from .fetcher import fetch_papers
from .vector_store import VectorStore
from .summarizer import generate_summary
import asyncio
import logging

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

async def process_query(request: SummaryRequest) -> SummaryResponse:
    query = request.query
    logger.info(f"Received query: {query}")
    
    # 1. Preprocess Query
    processed_query = await preprocess_query(query)
    logger.info(f"Processed Query: {processed_query}")
    
    # 2. Check for past summaries
    vector_store = VectorStore()
    # past_summary = vector_store.search_past_summaries(processed_query)
    # if past_summary:
    #     logger.info("Found past summary reference.")
    #     return SummaryResponse(
    #         query=query,
    #         summary=past_summary[0],
    #         papers=[]
    #     )

    # 3. Generate Keywords
    keywords = await generate_keywords(processed_query)
    logger.info(f"Generated Keywords: {keywords}")
    
    # 4. Fetch Papers
    papers = await fetch_papers(keywords)
    logger.info(f"Fetched {len(papers)} papers.")
    
    # 5. Store embeddings
    if papers:
        vector_store.add_papers(papers)
    else:
        logger.warning("No papers found.")
    
    # 6. RAG: Fetch relevant chunks
    relevant_chunks = vector_store.search_similar_chunks(processed_query)
    logger.info(f"Retrieved {len(relevant_chunks)} relevant chunks.")
    
    if not relevant_chunks:
        return SummaryResponse(
            query=query,
            summary="No relevant papers found to summarize.",
            papers=[]
        )
    
    # 7. Generate Summary
    logger.info("Generating final summary...")
    summary_text = await generate_summary(processed_query, relevant_chunks)
    logger.info("Summary generation complete.")
    
    # 8. Store Summary
    vector_store.add_summary_record(processed_query, summary_text)
    
    return SummaryResponse(
        query=query,
        summary=summary_text,
        papers=papers
    )

from .summarizer import generate_summary_stream
import json

async def process_query_stream(request: SummaryRequest):
    query = request.query
    logger.info(f"Received query for stream: {query}")
    
    yield json.dumps({"type": "status", "message": "Analyzing query..."}) + "\n"
    
    # 1. Preprocess Query
    processed_query = await preprocess_query(query)
    
    # 2. Check for past summaries (Skipping for now or implement if needed)
    
    # 3. Generate Keywords
    yield json.dumps({"type": "status", "message": "Generating search keywords..."}) + "\n"
    keywords = await generate_keywords(processed_query)
    
    # 4. Fetch Papers
    yield json.dumps({"type": "status", "message": f"Fetching papers for keywords: {', '.join(keywords)}..."}) + "\n"
    papers = await fetch_papers(keywords)
    
    # Convert Pydantic models to dicts for JSON serialization
    papers_data = [paper.dict() for paper in papers]
    yield json.dumps({"type": "papers", "data": papers_data}) + "\n"
    
    # 5. Store embeddings
    vector_store = VectorStore()
    if papers:
        vector_store.add_papers(papers)
    
    # 6. RAG: Fetch relevant chunks
    yield json.dumps({"type": "status", "message": "Analyzing papers and extracting relevant info..."}) + "\n"
    relevant_chunks = vector_store.search_similar_chunks(processed_query)
    
    if not relevant_chunks:
        yield json.dumps({"type": "content", "data": "No relevant papers found to summarize."}) + "\n"
        return
    
    # 7. Generate Summary Stream
    yield json.dumps({"type": "status", "message": "Generating synthesis..."}) + "\n"
    async for chunk in generate_summary_stream(processed_query, relevant_chunks):
        yield json.dumps({"type": "content", "data": chunk}) + "\n"
        
    # 8. Store Summary (Optional, requires full text aggregation if needed)
