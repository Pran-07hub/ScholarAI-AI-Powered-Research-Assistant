from pydantic import BaseModel, Field
from typing import List, Optional, Dict


class SummaryRequest(BaseModel):
    query: str
    history: Optional[List[Dict[str, str]]] = Field(
        default=[],
        description="List of past messages in the conversation. Each dict should have 'role' and 'content' keys."
    )
    selected_paper_ids: Optional[List[str]] = Field(
        default=[],
        description="List of paper MongoDB IDs to use as explicit context."
    )
    project_id: Optional[str] = Field(
        default=None,
        description="Active project ID. When provided and no paper IDs are selected, all project papers are auto-loaded as context."
    )
    user_keys: Optional[Dict[str, str]] = Field(
        default={},
        description="Decrypted user API keys (source slug -> key). Populated server-side from UserApiKeys; never sent by the client.",
    )


class Paper(BaseModel):
    title: str
    authors: List[str]
    summary: str
    source: str
    published_date: str
    url: str


class SummaryResponse(BaseModel):
    query: str
    summary: str
    papers: List[Paper]
