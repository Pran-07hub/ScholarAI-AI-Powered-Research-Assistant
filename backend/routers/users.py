from fastapi import APIRouter, Depends, HTTPException
from models import User, UserPreferences
from auth import get_current_user
from pydantic import BaseModel
from datetime import datetime

router = APIRouter(prefix="/users", tags=["Users"])

@router.get("/{user_id}", response_model=User)
async def get_user_profile(user_id: str, current_user: User = Depends(get_current_user)):
    user = await User.get(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user

@router.put("/{user_id}", response_model=User)
async def update_user_profile(user_id: str, user_update: User, current_user: User = Depends(get_current_user)):
    user = await User.get(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Ensure current user is modifying their own profile
    if str(user.id) != str(current_user.id):
        raise HTTPException(status_code=403, detail="Forbidden")

    user.username = user_update.username
    user.college = user_update.college
    user.updated_at = datetime.utcnow()
    await user.save()
    return user

@router.delete("/{user_id}")
async def delete_user(user_id: str, current_user: User = Depends(get_current_user)):
    user = await User.get(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    if str(user.id) != str(current_user.id):
        raise HTTPException(status_code=403, detail="Forbidden")
    
    await user.delete()
    return {"message": "User deleted successfully"}

@router.get("/{user_id}/preferences", response_model=UserPreferences)
async def get_user_preferences(user_id: str, current_user: User = Depends(get_current_user)):
    user = await User.get(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user.preferences

@router.put("/{user_id}/preferences", response_model=UserPreferences)
async def update_user_preferences(user_id: str, prefs: UserPreferences, current_user: User = Depends(get_current_user)):
    user = await User.get(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
        
    if str(user.id) != str(current_user.id):
        raise HTTPException(status_code=403, detail="Forbidden")

    user.preferences = prefs
    await user.save()
    return user.preferences
