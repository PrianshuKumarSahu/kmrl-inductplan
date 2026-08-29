from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from typing import List, Optional
from app.auth import get_current_user, CurrentUser, require_supervisor
from app.database import get_supabase
from datetime import datetime

router = APIRouter(prefix="/auth", tags=["Auth"])

class ProfileCreate(BaseModel):
    name: str
    employee_id: str
    department: str
    role: str

class ProfileUpdate(BaseModel):
    role: Optional[str] = None
    is_active: Optional[bool] = None

@router.post("/profile")
def create_or_get_profile(profile: ProfileCreate, current_user: CurrentUser = Depends(get_current_user)):
    supabase = get_supabase()
    res = supabase.table("profiles").select("*").eq("id", current_user.id).execute()
    if res.data:
        return res.data[0]
    
    new_profile = {
        "id": current_user.id,
        "name": profile.name,
        "employee_id": profile.employee_id,
        "department": profile.department,
        "role": profile.role,
        "is_active": True,
        "created_at": datetime.utcnow().isoformat(),
        "updated_at": datetime.utcnow().isoformat()
    }
    insert_res = supabase.table("profiles").insert(new_profile).execute()
    if insert_res.data:
        return insert_res.data[0]
    raise HTTPException(status_code=400, detail="Failed to create profile")

@router.get("/me")
def get_me(current_user: CurrentUser = Depends(get_current_user)):
    supabase = get_supabase()
    res = supabase.table("profiles").select("*").eq("id", current_user.id).execute()
    if res.data:
        return res.data[0]
    raise HTTPException(status_code=404, detail="Profile not found")

@router.get("/users")
def list_users(current_user: CurrentUser = Depends(require_supervisor)):
    supabase = get_supabase()
    res = supabase.table("profiles").select("*").execute()
    return res.data

@router.put("/users/{user_id}")
def update_user(user_id: str, update_data: ProfileUpdate, current_user: CurrentUser = Depends(require_supervisor)):
    supabase = get_supabase()
    data = {}
    if update_data.role is not None:
        data["role"] = update_data.role
    if update_data.is_active is not None:
        data["is_active"] = update_data.is_active
        
    data["updated_at"] = datetime.utcnow().isoformat()
    
    res = supabase.table("profiles").update(data).eq("id", user_id).execute()
    if res.data:
        return res.data[0]
    raise HTTPException(status_code=404, detail="User not found")
