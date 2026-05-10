from beanie import Document, Link
from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime, timezone
from enum import Enum

class CitationStyle(str, Enum):
    APA = "APA"
    MLA = "MLA"
    IEEE = "IEEE"
    BIBTEX = "BibTeX"

class UserPreferences(BaseModel):
    research_domains: List[str] = []
    citation_style: CitationStyle = CitationStyle.APA
    alert_frequency: str = "daily"
    ai_strictness: str = "balanced"

class User(Document):
    email: str = Field(unique=True)
    oauth_provider: str
    oauth_id: str
    username: str
    profile_picture: Optional[str] = None
    college: Optional[str] = None
    preferences: UserPreferences = UserPreferences()
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    class Settings:
        name = "users"

class Project(Document):
    name: str
    description: Optional[str] = None
    user_id: Link[User]
    members: List[Link[User]] = []
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    class Settings:
        name = "projects"

class Paper(Document):
    project_id: Link[Project]
    title: str
    authors: List[str] = []
    abstract: Optional[str] = None
    publication_date: Optional[datetime] = None
    venue: Optional[str] = None
    pdf_url: Optional[str] = None
    source: str = "manual"
    doi: Optional[str] = None
    embeddings: List[float] = []
    extracted_data: Optional[dict] = None
    full_text: Optional[str] = None
    full_text_status: str = "none"  # "none" | "fetching" | "available" | "unavailable"
    created_at: datetime = Field(default_factory=datetime.utcnow)

    class Settings:
        name = "papers"

class Note(Document):
    project_id: Link[Project]
    paper_id: Optional[Link[Paper]] = None
    title: str
    content: str
    tags: List[str] = []
    is_private: bool = False
    # Empty list means all project collaborators can see it; otherwise only listed user IDs
    allowed_collaborators: List[str] = []
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    class Settings:
        name = "notes"

class Draft(Document):
    project_id: Link[Project]
    title: str
    content: str
    version: int = 1
    status: str = "outline"
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    class Settings:
        name = "drafts"

class Alert(Document):
    user_id: Link[User]
    keywords: List[str]
    frequency: str = "daily"
    created_at: datetime = Field(default_factory=datetime.utcnow)

    class Settings:
        name = "alerts"


class Chat(Document):
    """Persisted chat session — stores all messages and links to a project."""
    user_id: Link[User]
    project_id: Optional[Link[Project]] = None
    title: str = "New Chat"
    # Each message: {"role": "user"|"assistant", "content": str, "created_at": ISO str}
    messages: List[dict] = []
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    class Settings:
        name = "chats"


class ProjectInvite(Document):
    """Pending invitation to collaborate on a project."""
    project_id: Link["Project"]
    inviter_id: Link[User]
    invitee_email: str
    status: str = "pending"   # pending | accepted | declined
    created_at: datetime = Field(default_factory=datetime.utcnow)

    class Settings:
        name = "project_invites"


class PaperAnnotation(Document):
    """A highlight/comment added to a paper by a project member."""
    paper_id: Link["Paper"]
    project_id: Link["Project"]
    user_id: Link[User]
    content: str                      # the annotation text / comment
    quote: Optional[str] = None       # highlighted text, if any
    color: str = "yellow"             # yellow | green | blue | pink | purple
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    class Settings:
        name = "paper_annotations"


class TrackedAuthor(Document):
    """A researcher the user is following."""
    user_id: Link[User]
    author_name: str
    semantic_scholar_id: Optional[str] = None
    affiliation: Optional[str] = None
    h_index: Optional[int] = None
    paper_count: Optional[int] = None
    citation_count: Optional[int] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)

    class Settings:
        name = "tracked_authors"


class TrackedConference(Document):
    """A conference the user is tracking for deadline alerts."""
    user_id: Link[User]
    conference_name: str
    conference_website: Optional[str] = None
    topics: List[str] = []
    created_at: datetime = Field(default_factory=datetime.utcnow)

    class Settings:
        name = "tracked_conferences"


class ResearchQuestion(Document):
    """A formal research question within a project."""
    project_id: Link["Project"]
    question: str
    description: Optional[str] = None
    # List of {"paper_id": str, "stance": "supports"|"contradicts"|"partial", "note": str}
    paper_tags: List[dict] = []
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    class Settings:
        name = "research_questions"


class UserApiKeys(Document):
    """
    Encrypted premium API keys for a user.
    Stored in a separate collection to avoid leaking keys via User responses.

    keys maps source slug -> AES-encrypted key value, e.g.:
      {"scopus": "gAAAAAB...", "ieee": "gAAAAAB..."}

    Valid source slugs: core, ieee, springer, scopus, serp
    """
    user_id: Link[User]
    keys: dict = {}
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    class Settings:
        name = "user_api_keys"
