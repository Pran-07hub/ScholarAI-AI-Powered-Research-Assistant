import os
import random
import logging

logger = logging.getLogger(__name__)

def get_google_api_key() -> str:
    """
    Retrieves a Google API key from the environment.
    Supports rotation if GOOGLE_API_KEYS (comma-separated) is set.
    Falls back to GOOGLE_API_KEY if GOOGLE_API_KEYS is not found.
    """
    # api_keys_str = os.getenv("GOOGLE_API_KEYS")
    
    # if api_keys_str:
    #     keys = [k.strip() for k in api_keys_str.split(',') if k.strip()]
    #     if keys:
    #         selected_key = random.choice(keys)
    #         # logger.info(f"Using API Key: ...{selected_key[-4:]}") # Optional: Log used key for debugging
    #         return selected_key
            
    # Fallback to single key
    key = os.getenv("GOOGLE_API_KEY")
    if not key:
        raise RuntimeError("GOOGLE_API_KEY environment variable is not set.")
    return key
