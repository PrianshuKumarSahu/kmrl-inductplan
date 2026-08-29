from datetime import datetime
import logging

logger = logging.getLogger(__name__)

async def log_action(supabase, user_id: str, user_name: str, action: str, resource_type: str, resource_id: str, before=None, after=None):
    try:
        # Check if user_id is a valid profile or pass None if foreign key would fail
        valid_user_id = user_id
        if user_id:
            chk = supabase.table("profiles").select("id").eq("id", user_id).execute()
            if not chk.data or len(chk.data) == 0:
                valid_user_id = None
                
        log_data = {
            "user_id": valid_user_id,
            "user_name": user_name or "KMRL Staff",
            "action": action,
            "resource_type": resource_type,
            "resource_id": str(resource_id),
            "before_state": before,
            "after_state": after,
            "timestamp": datetime.utcnow().isoformat()
        }
        supabase.table("audit_logs").insert(log_data).execute()
    except Exception as e:
        logger.warning(f"Audit log failed silently: {e}")
