from pydantic import BaseModel
from typing import List, Optional

class SummaryRequest(BaseModel):
    query: str

class Paper(BaseModel):
    title: str
    authors: List[str]
    summary: str
    source: str
    published_date: str
    url: str
    doi: Optional[str] = None

class SummaryResponse(BaseModel):
    query: str
    summary: str
    papers: List[Paper]
