from supabase import create_client, Client
from app.config import get_settings
from typing import Optional
from datetime import datetime
import logging

logger = logging.getLogger(__name__)
settings = get_settings()

def get_supabase() -> Client:
    return create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_ROLE_KEY)

def get_user_profile(user_id: str, email: str = "") -> Optional[dict]:
    supabase = get_supabase()
    try:
        res = supabase.table('profiles').select('*').eq('id', user_id).execute()
        if res.data and len(res.data) > 0:
            return res.data[0]
        
        # If no profile exists yet, create default profile for this user
        new_profile = {
            "id": user_id,
            "name": email.split("@")[0].capitalize() if email else "KMRL Employee",
            "employee_id": "EMP-" + user_id[:6].upper(),
            "department": "Operations & Rolling Stock",
            "role": "supervisor", # Default to supervisor for easy hackathon testing/demoing
            "is_active": True,
            "created_at": datetime.utcnow().isoformat(),
            "updated_at": datetime.utcnow().isoformat()
        }
        create_res = supabase.table('profiles').insert(new_profile).execute()
        if create_res.data and len(create_res.data) > 0:
            return create_res.data[0]
    except Exception as e:
        logger.error(f"Error fetching/creating profile for user {user_id}: {e}")
    return None
