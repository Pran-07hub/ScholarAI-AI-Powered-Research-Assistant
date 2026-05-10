from pydantic import BaseModel
from typing import List, Optional

class NewsRequest(BaseModel):
    topics: List[str]
    limit: Optional[int] = 5

class NewsArticle(BaseModel):
    title: str
    link: str
    published: str
    source: str
    summary: Optional[str] = None

class NewsResponse(BaseModel):
    articles: List[NewsArticle]
