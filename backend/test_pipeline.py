import asyncio
import os
import sys

from dotenv import load_dotenv
load_dotenv()

# Add backend to path so we can import modules
sys.path.append(os.path.join(os.path.dirname(__file__), '..'))

from backend.utils.research_paper_summariser.service import process_query
from backend.utils.research_paper_summariser.schemas import SummaryRequest

async def test_summary():
    # Ensure API key is set
    if not os.getenv("GOOGLE_API_KEY") and not os.getenv("GOOGLE_API_KEYS"):
        print("Error: GOOGLE_API_KEY or GOOGLE_API_KEYS environment variable not set.")
        return

    query = "latest advancements in large language models efficiency"
    print(f"Testing with query: {query}")
    
    try:
        request = SummaryRequest(query=query)
        response = await process_query(request)
        
        print("\n--- Summary ---")
        print(response.summary)
        print("\n--- Papers Found ---")
        for paper in response.papers:
            print(f"- {paper.title} ({paper.published_date})")
            
        print("\nTest completed successfully!")
        
    except Exception as e:
        print(f"An error occurred: {e}")

if __name__ == "__main__":
    asyncio.run(test_summary())
