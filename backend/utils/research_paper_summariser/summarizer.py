from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.prompts import PromptTemplate
from langchain_core.documents import Document
import os

from .config import get_google_api_key

async def generate_summary(query: str, context_chunks: list[str]) -> str:
    """
    Generates a final summary based on the query and retrieved context chunks.
    """
    llm = ChatGoogleGenerativeAI(model="gemini-2.5-flash", google_api_key=get_google_api_key())
    
    prompt_template = """
You are an expert researcher who has deeply read and synthesized the academic literature in this field.

Using the provided research context, produce a single, cohesive, field-level synthesis that reflects
the current understanding of the topic, as if written by a researcher after thoroughly reviewing
the relevant papers.

Guidelines for your response:
- Do NOT provide individual paper summaries.
- Do NOT mention specific documents unless absolutely necessary.
- Internally aggregate and reason over all the research, but present only the final synthesis.
- Write in a continuous, explanatory narrative (not bullet points unless truly needed).
- Assume the reader is a researcher seeking deep understanding, not a quick overview.

Your response should clearly:
1. Explain what is currently known in this research area and how the understanding has evolved.
2. Convey the maturity of the field (e.g., emerging, active, saturated) based on the body of work.
3. Describe the dominant paradigms, methodologies, and models that define the current state of the art.
4. Highlight major consensus, debates, limitations, and open research directions.

User Query:
{query}

Research Context:
{context}

Field-Level Synthesis:
"""

    
    prompt = PromptTemplate(template=prompt_template, input_variables=["query", "context"])
    
    # Simple stuffing method
    context_text = "\n\n".join(context_chunks)
    
    chain = prompt | llm
    result = await chain.ainvoke({"query": query, "context": context_text})
    
    return result.content

async def generate_summary_stream(query: str, context_chunks: list[str]):
    """
    Generates a streaming summary based on the query and retrieved context chunks.
    """
    llm = ChatGoogleGenerativeAI(model="gemini-2.5-flash", google_api_key=get_google_api_key())
    
    prompt_template = """
You are an expert researcher who has deeply read and synthesized the academic literature in this field.

Using the provided research context, produce a single, cohesive, field-level synthesis that reflects
the current understanding of the topic, as if written by a researcher after thoroughly reviewing
the relevant papers.

Guidelines for your response:
- Do NOT provide individual paper summaries.
- Do NOT mention specific documents unless absolutely necessary.
- Internally aggregate and reason over all the research, but present only the final synthesis.
- Write in a continuous, explanatory narrative (not bullet points unless truly needed).
- Assume the reader is a researcher seeking deep understanding, not a quick overview.

Your response should clearly:
1. Explain what is currently known in this research area and how the understanding has evolved.
2. Convey the maturity of the field (e.g., emerging, active, saturated) based on the body of work.
3. Describe the dominant paradigms, methodologies, and models that define the current state of the art.
4. Highlight major consensus, debates, limitations, and open research directions.

User Query:
{query}

Research Context:
{context}

Field-Level Synthesis:
"""
    
    prompt = PromptTemplate(template=prompt_template, input_variables=["query", "context"])
    
    context_text = "\n\n".join(context_chunks)
    
    chain = prompt | llm
    
    async for chunk in chain.astream({"query": query, "context": context_text}):
        yield chunk.content
