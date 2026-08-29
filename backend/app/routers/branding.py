from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, date
import uuid
from app.auth import get_current_user, require_operator, require_supervisor, CurrentUser
from app.database import get_supabase
from app.utils.audit_helper import log_action

router = APIRouter(prefix="/branding", tags=["Branding"])

class BrandingContractCreate(BaseModel):
    trainset_id: str
    advertiser_name: str
    campaign_name: str
    required_hours_per_week: float
    contract_start: date
    contract_end: date
    priority_score: int
    penalty_per_hour_missed: float
    notes: Optional[str] = None

class BrandingContractUpdate(BaseModel):
    advertiser_name: Optional[str] = None
    campaign_name: Optional[str] = None
    required_hours_per_week: Optional[float] = None
    priority_score: Optional[int] = None
    is_active: Optional[bool] = None

class LogHours(BaseModel):
    hours_added: float

@router.get("")
def list_branding_contracts():
    supabase = get_supabase()
    res = supabase.table("branding_contracts").select("*, trainsets(number)").execute()
    return res.data

@router.post("")
async def create_contract(data: BrandingContractCreate, current_user: CurrentUser = Depends(require_operator)):
    supabase = get_supabase()
    contract = data.dict()
    contract["id"] = str(uuid.uuid4())
    contract["contract_start"] = contract["contract_start"].isoformat()
    contract["contract_end"] = contract["contract_end"].isoformat()
    contract["is_active"] = True
    contract["actual_hours_this_week"] = 0.0
    contract["total_hours_served"] = 0.0
    contract["created_at"] = datetime.utcnow().isoformat()
    contract["updated_at"] = datetime.utcnow().isoformat()
    
    res = supabase.table("branding_contracts").insert(contract).execute()
    if res.data:
        await log_action(supabase, current_user.id, current_user.name, "create", "branding", contract["id"], after=res.data[0])
        return res.data[0]
    raise HTTPException(status_code=400, detail="Failed to create contract")

@router.put("/{id}")
async def update_contract(id: str, data: BrandingContractUpdate, current_user: CurrentUser = Depends(require_operator)):
    supabase = get_supabase()
    before = supabase.table("branding_contracts").select("*").eq("id", id).execute()
    if not before.data:
        raise HTTPException(status_code=404, detail="Not found")
        
    update_data = data.dict(exclude_unset=True)
    update_data["updated_at"] = datetime.utcnow().isoformat()
    
    res = supabase.table("branding_contracts").update(update_data).eq("id", id).execute()
    if res.data:
        await log_action(supabase, current_user.id, current_user.name, "update", "branding", id, before=before.data[0], after=res.data[0])
        return res.data[0]
    raise HTTPException(status_code=400, detail="Update failed")

@router.delete("/{id}")
async def delete_contract(id: str, current_user: CurrentUser = Depends(require_supervisor)):
    supabase = get_supabase()
    res = supabase.table("branding_contracts").delete().eq("id", id).execute()
    await log_action(supabase, current_user.id, current_user.name, "delete", "branding", id)
    return {"message": "Contract deleted"}

@router.post("/{id}/log-hours")
async def log_exposure_hours(id: str, data: LogHours, current_user: CurrentUser = Depends(require_operator)):
    supabase = get_supabase()
    contract_res = supabase.table("branding_contracts").select("*").eq("id", id).execute()
    if not contract_res.data:
        raise HTTPException(status_code=404, detail="Not found")
        
    contract = contract_res.data[0]
    new_week = float(contract.get("actual_hours_this_week", 0)) + data.hours_added
    new_total = float(contract.get("total_hours_served", 0)) + data.hours_added
    
    res = supabase.table("branding_contracts").update({
        "actual_hours_this_week": new_week,
        "total_hours_served": new_total,
        "updated_at": datetime.utcnow().isoformat()
    }).eq("id", id).execute()
    
    if res.data:
        await log_action(supabase, current_user.id, current_user.name, "log_hours", "branding", id, after={"added": data.hours_added, "new_total": new_total})
        return res.data[0]
    raise HTTPException(status_code=400, detail="Failed to log hours")

@router.get("/sla-risk")
def get_sla_risk():
    supabase = get_supabase()
    res = supabase.table("branding_contracts").select("*").eq("is_active", True).execute()
    at_risk = []
    for c in res.data:
        req = float(c.get("required_hours_per_week", 0))
        act = float(c.get("actual_hours_this_week", 0))
        if req > 0 and (act / req) < 0.8:
            at_risk.append(c)
    return at_risk
