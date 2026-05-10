from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from auth import create_access_token, get_current_user
from models import User
from datetime import timedelta
import requests
import os

router = APIRouter(prefix="/auth", tags=["Authentication"])

class OAuthLoginRequest(BaseModel):
    token: str # Google ID Token
    
class Token(BaseModel):
    access_token: str
    token_type: str

GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID")

@router.post("/login", response_model=Token)
async def login(request: OAuthLoginRequest):
    try:
        # Verify the access token by fetching user info
        response = requests.get(
            f"https://www.googleapis.com/oauth2/v3/userinfo?access_token={request.token}"
        )
        
        if response.status_code != 200:
             raise ValueError("Failed to fetch user info from Google")
             
        user_info = response.json()

        # Get the user's information
        email = user_info.get('email')
        name = user_info.get('name', 'User')
        picture = user_info.get('picture')
        google_id = user_info.get('sub')
        
        if not email:
             raise ValueError("Email not found in Google account")
        
        # Check if user exists
        user = await User.find_one(User.email == email)
        if not user:
            # Register new user
            user = User(
                email=email,
                oauth_provider="google",
                oauth_id=google_id,
                username=name,
                profile_picture=picture
            )
            await user.insert()
        
        access_token_expires = timedelta(minutes=60)
        access_token = create_access_token(
            data={"sub": user.email}, expires_delta=access_token_expires
        )
        return {"access_token": access_token, "token_type": "bearer"}
        
    except ValueError as e:
        # Invalid token
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid authentication credentials: {str(e)}",
            headers={"WWW-Authenticate": "Bearer"},
        )
    except Exception as e:
         raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Authentication failed: {str(e)}",
        )

@router.post("/refresh-token")
async def refresh_token(current_user: User = Depends(get_current_user)):
    # Simply issue a new token for the current user
    access_token = create_access_token(data={"sub": current_user.email})
    return {"access_token": access_token, "token_type": "bearer"}

@router.get("/me", response_model=User)
async def read_users_me(current_user: User = Depends(get_current_user)):
    return current_user

@router.post("/logout")
async def logout():
    return {"message": "Logout successful (Client should discard token)"}
