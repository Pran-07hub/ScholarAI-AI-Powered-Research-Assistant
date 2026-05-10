import os
from motor.motor_asyncio import AsyncIOMotorClient
from beanie import init_beanie
from dotenv import load_dotenv
import certifi

load_dotenv()

async def init_db():
    client = AsyncIOMotorClient(
        os.getenv("MONGODB_URI", "mongodb://localhost:27017"),
        tls=True,
        tlsCAFile=certifi.where()
    )
    # We will import models inside the function to avoid circular imports if needed, 
    # or just import them at top level if structure permits. 
    # For now, let's assume they are in models.py
    from models import (
        User, Project, Paper, Note, Draft, Alert, Chat,
        TrackedConference, TrackedAuthor, ProjectInvite, PaperAnnotation,
        ResearchQuestion, UserApiKeys
    )

    await init_beanie(database=client.research_os, document_models=[
        User, Project, Paper, Note, Draft, Alert, Chat,
        TrackedConference, TrackedAuthor, ProjectInvite, PaperAnnotation,
        ResearchQuestion, UserApiKeys
    ])
