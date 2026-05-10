import sys
from dotenv import load_dotenv
load_dotenv('backend/.env')
sys.path.append('backend')
from agents.research_agent import create_research_agent

try:
    agent = create_research_agent()
    print("Agent created successfully")
except Exception as e:
    import traceback
    traceback.print_exc()
