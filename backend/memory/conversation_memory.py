import logging
from typing import List, Dict
from langchain_core.messages import HumanMessage, AIMessage, SystemMessage, BaseMessage

logger = logging.getLogger(__name__)

def build_chat_history(messages: List[Dict[str, str]]) -> List[BaseMessage]:
    """
    Constructs a list of Langchain BaseMessages from a list of dicts.
    Useful for stateless HTTP APIs to reconstruct the conversation history.
    """
    history = []
    
    for msg in messages:
        role = msg.get("role", "")
        content = msg.get("content", "")
        
        if not content:
            continue
            
        if role == "user":
            history.append(HumanMessage(content=content))
        elif role == "assistant":
            history.append(AIMessage(content=content))
        elif role == "system":
            history.append(SystemMessage(content=content))
            
    return history
