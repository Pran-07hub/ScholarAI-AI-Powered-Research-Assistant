import tiktoken
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.prompts import PromptTemplate
import os

from .config import get_google_api_key

# Initialize tokenizer (using cl100k_base which is used by GPT-4, adequate approximation for Gemini)
tokenizer = tiktoken.get_encoding("cl100k_base")

def count_tokens(text: str) -> int:
    return len(tokenizer.encode(text))

async def preprocess_query(query: str, max_tokens: int = 500) -> str:
    """
    Checks token count of the query. If it exceeds max_tokens, summarizes it.
    """
    token_count = count_tokens(query)
    
    if token_count <= max_tokens:
        return query
    
    # If query is too long, we summarize it
    llm = ChatGoogleGenerativeAI(model="gemini-2.5-flash", google_api_key=get_google_api_key())
    
    prompt = PromptTemplate(
        input_variables=["original_query"],
        template="The following query is too long. Please summarize it while retaining the core research intent and key requirements: \n\n{original_query}"
    )
    
    chain = prompt | llm
    result = await chain.ainvoke({"original_query": query})
    return result.content
