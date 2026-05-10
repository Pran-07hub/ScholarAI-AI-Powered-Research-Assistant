import os
from langchain_core.tools import tool

@tool
def web_search_tool(query: str) -> str:
    """
    Use this tool to search the general web for information.
    Best for real-time news, general concepts, or when academic papers don't have the answer.
    """
    try:
        from langchain_community.utilities import GoogleSearchAPIWrapper
        # This requires GOOGLE_API_KEY and GOOGLE_CSE_ID to be set in the environment
        google_search = GoogleSearchAPIWrapper()
        return google_search.run(query)
    except Exception as e:
        return f"Error performing web search: {str(e)}. To fix this, ensure GOOGLE_CSE_ID is set in your .env file."
