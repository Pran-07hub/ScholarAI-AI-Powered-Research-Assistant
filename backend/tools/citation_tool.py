from langchain_core.tools import tool
import logging

logger = logging.getLogger(__name__)

@tool
def generate_citation_tool(title: str, authors: list[str], year: str, url: str, format: str = "APA") -> str:
    """
    Generate an academic citation for a given paper.
    Use this tool when the user explicitly requests citations for papers.
    
    Args:
        title (str): Title of the paper.
        authors (list[str]): List of author names.
        year (str): Publication year.
        url (str): URL or source of the paper.
        format (str): Desired format, e.g., "APA", "MLA", or "Chicago". Defaults to "APA".
        
    Returns:
        str: The formatted citation string.
    """
    logger.info(f"generate_citation_tool called for {title} in {format} format")
    
    format = format.upper()
    authors_str = ", ".join(authors) if authors else "Unknown"
    
    if format == "APA":
        # Basic approximation of APA
        # Author, A. A., & Author, B. B. (Year). Title of article. Source. URL
        return f"{authors_str} ({year}). {title}. Retrieved from {url}"
    elif format == "MLA":
        # Basic approximation of MLA 
        # Author. "Title of Article." Source, Year. URL
        return f'{authors_str}. "{title}." {year}, {url}.'
    elif format == "CHICAGO":
        # Author. "Title of Article." Year. URL.
        return f'{authors_str}. "{title}." {year}. {url}.'
    else:
        return f"{authors_str} ({year}). {title}. {url}"
