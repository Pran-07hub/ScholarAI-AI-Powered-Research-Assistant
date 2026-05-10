from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.prompts import PromptTemplate
from typing import List
import os

from .config import get_google_api_key

async def generate_keywords(query: str) -> List[str]:
    """
    Generates a list of keywords from the user query to search on Arxiv.
    """
    llm = ChatGoogleGenerativeAI(model="gemini-2.5-flash", google_api_key=get_google_api_key())
    
    prompt = PromptTemplate(
        input_variables=["query"],
        template="Extract as much distinct and relevant search keywords/phrases from the following research query. \n\nQuery: {query}\n\nReturn ONLY the keywords separated by commas, no other text."
    )
    
    chain = prompt | llm
    result = await chain.ainvoke({"query": query})
    
    keywords = [k.strip() for k in result.content.split(',')]
    return keywords
# from sklearn.feature_extraction.text import TfidfVectorizer

# def extract_keywords(text, k=5):
#     vectorizer = TfidfVectorizer(stop_words="english", max_features=k)
#     X = vectorizer.fit_transform([text])
#     return vectorizer.get_feature_names_out().tolist()
