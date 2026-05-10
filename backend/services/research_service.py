import json
import logging
import asyncio
from typing import AsyncGenerator

from .schemas import SummaryRequest
from memory.conversation_memory import build_chat_history
from agents.research_agent import create_research_agent
from langchain_core.messages import HumanMessage
from models import Paper, Project
from beanie import PydanticObjectId, Link

logger = logging.getLogger(__name__)


async def _load_context_papers(request: SummaryRequest) -> str:
    """
    Build a context string from paper context using two strategies:

    1. Explicit paper IDs selected by the user → load those directly from MongoDB.
    2. Project-level context → semantic search via ChromaDB to pick the top-N
       most relevant papers, avoiding context-window overload on large projects.
       Falls back to loading all project papers from MongoDB if ChromaDB has no
       indexed papers yet (e.g. first query after a fresh deploy).
    """
    # ── Strategy 1: explicit paper selection ─────────────────────────────────
    if request.selected_paper_ids:
        context_papers: list[str] = []
        for pid in request.selected_paper_ids:
            try:
                p = await Paper.get(PydanticObjectId(pid))
                if p:
                    context_papers.append(
                        f"Title: {p.title}\n"
                        f"Authors: {', '.join(p.authors) if p.authors else 'Unknown'}\n"
                        f"Abstract: {p.abstract or 'No abstract'}"
                    )
            except Exception as e:
                logger.warning(f"Failed to fetch context paper {pid}: {e}")

        if not context_papers:
            return ""
        return (
            "\n\n*** SELECTED PAPER CONTEXT ***\n"
            + "\n---\n".join(context_papers)
            + "\n****************************\n"
        )

    # ── Strategy 2: project-level semantic search ─────────────────────────────
    if not request.project_id:
        return ""

    # Try ChromaDB first (fast, relevant, scales to many papers)
    try:
        from services.vector_store import search_similar_papers
        results = search_similar_papers(request.project_id, request.query, n_results=6)
        if results:
            context_parts = [
                f"Title: {r['title']}\n"
                f"Authors: {r['authors']}\n"
                f"Abstract: {r['text']}"
                for r in results
            ]
            logger.info("ChromaDB returned %d relevant papers for project %s", len(results), request.project_id)
            return (
                "\n\n*** RELEVANT PROJECT PAPERS ***\n"
                + "\n---\n".join(context_parts)
                + "\n****************************\n"
            )
    except Exception as e:
        logger.warning("ChromaDB search failed, falling back to MongoDB: %s", e)

    # Fallback: load all project papers from MongoDB
    try:
        project = await Project.get(PydanticObjectId(request.project_id))
        if project:
            papers = await Paper.find(Paper.project_id.id == project.id).to_list()
            context_parts = [
                f"Title: {p.title}\n"
                f"Authors: {', '.join(p.authors) if p.authors else 'Unknown'}\n"
                f"Abstract: {p.abstract or 'No abstract'}"
                for p in papers
            ]
            if context_parts:
                logger.info("MongoDB fallback: loaded %d papers for project %s", len(papers), request.project_id)
                return (
                    "\n\n*** PROJECT PAPERS CONTEXT ***\n"
                    + "\n---\n".join(context_parts)
                    + "\n****************************\n"
                )
    except Exception as e:
        logger.warning("MongoDB fallback also failed: %s", e)

    return ""


async def process_query_stream(request: SummaryRequest) -> AsyncGenerator[str, None]:
    """
    Process a request using the conversational ReAct agent.
    Yields NDJSON chunks for the frontend.
    """
    from context import user_api_keys_ctx
    ctx_token = user_api_keys_ctx.set(request.user_keys or {})

    query = request.query
    history = build_chat_history(request.history or [])
    logger.info(f"Received query: '{query}' with {len(history)} history messages.")

    # Load paper context
    has_selected = bool(request.selected_paper_ids)
    has_project = bool(request.project_id)

    if has_selected or has_project:
        status_msg = "Loading selected paper context..." if has_selected else "Loading project context..."
        yield json.dumps({"type": "status", "message": status_msg}) + "\n"

    context_text = await _load_context_papers(request)

    # Initialize the agent
    agent = create_research_agent()
    yield json.dumps({"type": "status", "message": "Agent thinking..."}) + "\n"

    if context_text:
        input_messages = history + [HumanMessage(content=context_text + "\nUser Query: " + query)]
    else:
        input_messages = history + [HumanMessage(content=query)]

    try:
        async for event in agent.astream_events(
            {"messages": input_messages},
            version="v2",
            config={"recursion_limit": 50}
        ):
            kind = event["event"]
            name = event.get("name")

            if kind == "on_chat_model_stream":
                chunk = event["data"]["chunk"]
                if getattr(chunk, "content", None):
                    if isinstance(chunk.content, str):
                        yield json.dumps({"type": "content", "data": chunk.content}) + "\n"
                    elif isinstance(chunk.content, list):
                        text_parts = []
                        for block in chunk.content:
                            if isinstance(block, dict) and "text" in block:
                                text_parts.append(block["text"])
                            elif isinstance(block, str):
                                text_parts.append(block)
                        if text_parts:
                            yield json.dumps({"type": "content", "data": "".join(text_parts)}) + "\n"

            elif kind == "on_tool_start":
                status_map = {
                    "search_papers_tool": "Searching for relevant papers...",
                    "fetch_paper_details_tool": "Extracting information from papers...",
                    "generate_citation_tool": "Formatting citation...",
                }
                msg = status_map.get(name, f"Using tool {name}...")
                yield json.dumps({"type": "status", "message": msg}) + "\n"

            elif kind == "on_tool_end":
                if name == "search_papers_tool":
                    raw_output = event["data"].get("output", [])
                    try:
                        if isinstance(raw_output, list):
                            # LangGraph returned the value directly
                            papers_data = raw_output
                        elif isinstance(raw_output, str):
                            # String — try JSON first, then Python literal
                            try:
                                papers_data = json.loads(raw_output)
                            except Exception:
                                import ast
                                papers_data = ast.literal_eval(raw_output)
                        elif hasattr(raw_output, "content") and isinstance(raw_output.content, str):
                            # ToolMessage — content is JSON-encoded by LangChain 1.x
                            try:
                                papers_data = json.loads(raw_output.content)
                            except Exception:
                                import ast
                                papers_data = ast.literal_eval(raw_output.content)
                        else:
                            papers_data = []
                    except Exception as e:
                        logger.warning(f"Could not parse papers output: {e}")
                        papers_data = []

                    if isinstance(papers_data, list):
                        yield json.dumps({"type": "papers", "data": papers_data}) + "\n"
                    yield json.dumps({"type": "status", "message": "Analyzing paper results..."}) + "\n"

                elif name == "fetch_paper_details_tool":
                    yield json.dumps({"type": "status", "message": "Synthesizing extracted details..."}) + "\n"

    except asyncio.CancelledError:
        logger.warning("Request cancelled by client.")
        yield json.dumps({"type": "content", "data": "\n\n**[Generation stopped by user]**"}) + "\n"
        raise
    except Exception as e:
        logger.error(f"Error during agent execution: {e}", exc_info=True)
        yield json.dumps({"type": "content", "data": f"\n\n**Error:** {str(e)}"}) + "\n"
    finally:
        yield json.dumps({"type": "status", "message": ""}) + "\n"
        user_api_keys_ctx.reset(ctx_token)
