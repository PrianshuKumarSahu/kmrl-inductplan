from fastapi import APIRouter, Depends, Query
from typing import Optional
from app.auth import get_current_user, require_supervisor, CurrentUser
from app.database import get_supabase

router = APIRouter(prefix="/audit", tags=["Audit Log"])

@router.get("")
def get_audit_logs(
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=100),
    user_id: Optional[str] = None,
    resource_type: Optional[str] = None,
    current_user: CurrentUser = Depends(require_supervisor)
):
    supabase = get_supabase()
    query = supabase.table("audit_logs").select("*", count="exact")
    
    if user_id:
        query = query.eq("user_id", user_id)
    if resource_type:
        query = query.eq("resource_type", resource_type)
        
    start_idx = (page - 1) * limit
    end_idx = start_idx + limit - 1
    
    res = query.order("timestamp", desc=True).range(start_idx, end_idx).execute()
    
    return {
        "data": res.data,
        "total": res.count,
        "page": page,
        "limit": limit
    }
