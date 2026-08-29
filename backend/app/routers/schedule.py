from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import List, Optional, Dict
from datetime import datetime, date
import uuid
import json
from app.auth import get_current_user, require_operator, require_supervisor, CurrentUser
from app.database import get_supabase
from app.optimizer.cpsat_engine import run_optimizer, OptimizerParams
from app.utils.audit_helper import log_action

router = APIRouter(prefix="/schedule", tags=["Schedule"])

class Weights(BaseModel):
    branding: int = 3
    mileage: int = 2
    availability: int = 4
    shunting: int = 1

class ScheduleGenerateRequest(BaseModel):
    schedule_date: date
    num_slots: int = 18
    weights: Weights
    force_include: List[str] = []
    force_exclude: List[str] = []

@router.post("/generate")
async def generate_schedule(req: ScheduleGenerateRequest, current_user: CurrentUser = Depends(require_operator)):
    supabase = get_supabase()
    params = OptimizerParams(
        schedule_date=req.schedule_date,
        num_slots=req.num_slots,
        weights=req.weights.dict(),
        force_include=req.force_include,
        force_exclude=req.force_exclude
    )
    result = await run_optimizer(params, supabase)
    
    schedule_id = str(uuid.uuid4())
    schedule_date_str = req.schedule_date.isoformat()
    now_str = datetime.utcnow().isoformat()
    
    # Check if generated_by is a valid profile ID in Supabase
    gen_by_id = current_user.id
    if gen_by_id:
        chk = supabase.table("profiles").select("id").eq("id", gen_by_id).execute()
        if not chk.data or len(chk.data) == 0:
            gen_by_id = None
    
    optimization_params_clean = {
        "schedule_date": schedule_date_str,
        "num_slots": req.num_slots,
        "weights": req.weights.dict(),
        "force_include": req.force_include,
        "force_exclude": req.force_exclude
    }
    
    schedule_data = {
        "id": schedule_id,
        "schedule_date": schedule_date_str,
        "generated_at": now_str,
        "generated_by": gen_by_id,
        "optimization_params": optimization_params_clean,
        "induction_list": result["induction_list"],
        "conflicts": result["conflicts"],
        "total_inducted": result["stats"]["total_inducted"],
        "solver_time_ms": result["stats"]["solver_time_ms"],
        "is_final": False,
        "created_at": now_str
    }
    
    # Upsert schedule for date
    existing = supabase.table("schedules").select("id").eq("schedule_date", schedule_date_str).execute()
    if existing.data and len(existing.data) > 0:
        schedule_data["id"] = existing.data[0]["id"]
        res = supabase.table("schedules").update(schedule_data).eq("id", schedule_data["id"]).execute()
    else:
        res = supabase.table("schedules").insert(schedule_data).execute()
        
    if res.data and len(res.data) > 0:
        await log_action(supabase, current_user.id, current_user.name, "generate", "schedule", schedule_data["id"])
        return res.data[0]
    
    return schedule_data

@router.post("/whatif")
async def whatif_schedule(req: ScheduleGenerateRequest, current_user: CurrentUser = Depends(require_operator)):
    supabase = get_supabase()
    params = OptimizerParams(
        schedule_date=req.schedule_date,
        num_slots=req.num_slots,
        weights=req.weights.dict(),
        force_include=req.force_include,
        force_exclude=req.force_exclude
    )
    result = await run_optimizer(params, supabase)
    return result

@router.get("/latest")
def get_latest_schedule():
    supabase = get_supabase()
    res = supabase.table("schedules").select("*").order("schedule_date", desc=True).limit(1).execute()
    if res.data and len(res.data) > 0:
        return res.data[0]
    raise HTTPException(status_code=404, detail="No schedules found")

@router.get("/history")
def get_schedule_history():
    supabase = get_supabase()
    res = supabase.table("schedules").select("id, schedule_date, is_final, total_inducted, generated_at").order("schedule_date", desc=True).limit(30).execute()
    return res.data or []

@router.get("/{date}")
def get_schedule_by_date(date: str):
    supabase = get_supabase()
    res = supabase.table("schedules").select("*").eq("schedule_date", date).execute()
    if res.data and len(res.data) > 0:
        return res.data[0]
    raise HTTPException(status_code=404, detail="Schedule not found")

@router.put("/{id}/approve")
async def approve_schedule(id: str, current_user: CurrentUser = Depends(require_supervisor)):
    supabase = get_supabase()
    
    app_by_id = current_user.id
    if app_by_id:
        chk = supabase.table("profiles").select("id").eq("id", app_by_id).execute()
        if not chk.data or len(chk.data) == 0:
            app_by_id = None
            
    update_data = {
        "is_final": True,
        "approved_by": app_by_id,
        "approved_at": datetime.utcnow().isoformat()
    }
    res = supabase.table("schedules").update(update_data).eq("id", id).execute()
    if res.data and len(res.data) > 0:
        await log_action(supabase, current_user.id, current_user.name, "approve", "schedule", id)
        return res.data[0]
    raise HTTPException(status_code=404, detail="Schedule not found")
