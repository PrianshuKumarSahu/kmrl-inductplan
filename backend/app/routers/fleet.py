from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime, date, timedelta
import uuid
import re
from app.auth import get_current_user, require_operator, require_supervisor, CurrentUser
from app.database import get_supabase
from app.utils.audit_helper import log_action

router = APIRouter(prefix="/fleet", tags=["Fleet"])

UUID_PATTERN = re.compile(r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$', re.I)

class TrainsetCreate(BaseModel):
    id: Optional[str] = None
    number: str
    name: Optional[str] = None
    total_mileage_km: float = 0.0
    current_bay_position: Optional[str] = None
    status: str = "ready"
    cert_rs_valid_until: Optional[date] = None
    cert_signalling_valid_until: Optional[date] = None
    cert_telecom_valid_until: Optional[date] = None
    year_of_manufacture: Optional[int] = None
    manufacturer: Optional[str] = "BEML"
    notes: Optional[str] = None

class TrainsetUpdate(BaseModel):
    name: Optional[str] = None
    total_mileage_km: Optional[float] = None
    current_bay_position: Optional[str] = None
    status: Optional[str] = None
    cert_rs_valid_until: Optional[date] = None
    cert_signalling_valid_until: Optional[date] = None
    cert_telecom_valid_until: Optional[date] = None
    notes: Optional[str] = None

class MileageLog(BaseModel):
    km_added: float
    log_date: Optional[date] = None
    service_slot: Optional[str] = "Regular Turnout"

@router.get("/stats/overview")
def get_fleet_stats():
    supabase = get_supabase()
    trainsets = supabase.table("trainsets").select("total_mileage_km,cert_rs_valid_until,cert_signalling_valid_until,cert_telecom_valid_until").execute().data or []
    
    total_km = sum(float(t.get("total_mileage_km") or 0) for t in trainsets)
    avg_km = total_km / len(trainsets) if trainsets else 0
    
    today = datetime.utcnow().date()
    expiring_count = 0
    for t in trainsets:
        for cert in ["cert_rs_valid_until", "cert_signalling_valid_until", "cert_telecom_valid_until"]:
            if t.get(cert):
                try:
                    c_date = datetime.strptime(t[cert][:10], "%Y-%m-%d").date()
                    if 0 <= (c_date - today).days <= 30:
                        expiring_count += 1
                        break
                except Exception:
                    pass
            
    critical_jobs = supabase.table("job_cards").select("id").in_("status", ["open", "in_progress"]).eq("priority", "critical").execute().data or []
    
    return {
        "total_mileage_avg": round(avg_km, 2),
        "certs_expiring_soon": expiring_count,
        "open_critical_jobs": len(critical_jobs),
        "total_fleet_count": len(trainsets)
    }

@router.get("")
def list_fleet():
    supabase = get_supabase()
    res = supabase.table("trainsets").select("*").execute()
    trainsets = res.data or []
    
    today = datetime.utcnow().date()
    # computed fields
    for t in trainsets:
        t["cert_status"] = "valid"
        for cert in ["cert_rs_valid_until", "cert_signalling_valid_until", "cert_telecom_valid_until"]:
            if t.get(cert):
                try:
                    cert_date = datetime.strptime(t[cert][:10], "%Y-%m-%d").date()
                    days = (cert_date - today).days
                    if days < 0:
                        t["cert_status"] = "expired"
                        break
                    elif days <= 30 and t["cert_status"] != "expired":
                        t["cert_status"] = "expiring"
                except Exception:
                    pass
        
        # critical jobs check
        jobs_res = supabase.table("job_cards").select("id").eq("trainset_id", t["id"]).in_("status", ["open", "in_progress"]).eq("priority", "critical").execute()
        t["has_critical_jobs"] = len(jobs_res.data or []) > 0
        
    trainsets.sort(key=lambda x: float(x.get("total_mileage_km") or 0), reverse=True)
    for i, t in enumerate(trainsets):
        t["mileage_rank"] = i + 1
        
    return trainsets

@router.post("")
async def create_trainset(data: TrainsetCreate, current_user: CurrentUser = Depends(require_operator)):
    supabase = get_supabase()
    trainset = data.dict(exclude_none=True)
    
    # Ensure ID is a valid UUID
    if not trainset.get("id") or not UUID_PATTERN.match(str(trainset.get("id"))):
        trainset["id"] = str(uuid.uuid4())
        
    for k, v in trainset.items():
        if isinstance(v, (date, datetime)):
            trainset[k] = v.isoformat()
            
    now_str = datetime.utcnow().isoformat()
    trainset["created_at"] = now_str
    trainset["updated_at"] = now_str
    
    res = supabase.table("trainsets").insert(trainset).execute()
    if res.data and len(res.data) > 0:
        await log_action(supabase, current_user.id, current_user.name, "create", "trainset", trainset["id"], after=res.data[0])
        return res.data[0]
    raise HTTPException(status_code=400, detail="Failed to create trainset")

@router.get("/{id}")
def get_trainset(id: str):
    supabase = get_supabase()
    res = supabase.table("trainsets").select("*").eq("id", id).execute()
    if not res.data or len(res.data) == 0:
        raise HTTPException(status_code=404, detail="Trainset not found")
    t = res.data[0]
    
    # Job cards
    jobs = supabase.table("job_cards").select("*").eq("trainset_id", id).order("created_at", desc=True).execute()
    t["job_cards"] = jobs.data or []
    
    # Mileage history (last 30 logs)
    logs = supabase.table("mileage_logs").select("*").eq("trainset_id", id).order("log_date", desc=True).limit(30).execute()
    t["mileage_history"] = logs.data or []
    
    # Active branding contract
    brand = supabase.table("branding_contracts").select("*").eq("trainset_id", id).eq("is_active", True).execute()
    t["branding_contract"] = brand.data[0] if brand.data and len(brand.data) > 0 else None
    
    return t

@router.put("/{id}")
async def update_trainset(id: str, data: TrainsetUpdate, current_user: CurrentUser = Depends(require_operator)):
    supabase = get_supabase()
    old_res = supabase.table("trainsets").select("*").eq("id", id).execute()
    if not old_res.data:
        raise HTTPException(status_code=404, detail="Trainset not found")
        
    update_dict = data.dict(exclude_none=True)
    for k, v in update_dict.items():
        if isinstance(v, (date, datetime)):
            update_dict[k] = v.isoformat()
    update_dict["updated_at"] = datetime.utcnow().isoformat()
    
    res = supabase.table("trainsets").update(update_dict).eq("id", id).execute()
    if res.data:
        await log_action(supabase, current_user.id, current_user.name, "update", "trainset", id, before=old_res.data[0], after=res.data[0])
        return res.data[0]
    raise HTTPException(status_code=400, detail="Failed to update trainset")

@router.delete("/{id}")
async def delete_trainset(id: str, current_user: CurrentUser = Depends(require_supervisor)):
    supabase = get_supabase()
    res = supabase.table("trainsets").delete().eq("id", id).execute()
    await log_action(supabase, current_user.id, current_user.name, "delete", "trainset", id)
    return {"status": "deleted", "id": id}

@router.post("/{id}/mileage")
async def log_mileage(id: str, data: MileageLog, current_user: CurrentUser = Depends(require_operator)):
    supabase = get_supabase()
    log_date_val = data.log_date or datetime.utcnow().date()
    log_date_str = log_date_val.isoformat() if isinstance(log_date_val, date) else str(log_date_val)
    
    # Get current trainset mileage
    ts = supabase.table("trainsets").select("total_mileage_km").eq("id", id).execute()
    if not ts.data:
        raise HTTPException(status_code=404, detail="Trainset not found")
        
    curr_km = float(ts.data[0].get("total_mileage_km") or 0)
    new_km = curr_km + data.km_added
    
    # Update trainset
    supabase.table("trainsets").update({
        "total_mileage_km": new_km,
        "updated_at": datetime.utcnow().isoformat()
    }).eq("id", id).execute()
    
    # Insert log
    log_entry = {
        "id": str(uuid.uuid4()),
        "trainset_id": id,
        "log_date": log_date_str,
        "km_added": data.km_added,
        "cumulative_km": new_km,
        "service_slot": data.service_slot,
        "recorded_by": current_user.id,
        "created_at": datetime.utcnow().isoformat()
    }
    res = supabase.table("mileage_logs").insert(log_entry).execute()
    if res.data:
        await log_action(supabase, current_user.id, current_user.name, "log_mileage", "trainset", id, after=log_entry)
        return res.data[0]
    return log_entry
