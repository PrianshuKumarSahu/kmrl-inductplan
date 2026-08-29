from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime
import uuid
from app.auth import get_current_user, require_operator, CurrentUser
from app.database import get_supabase
from app.utils.maximo_parser import parse_maximo_csv
from app.utils.audit_helper import log_action

router = APIRouter(prefix="/jobcards", tags=["Job Cards"])

class JobCardCreate(BaseModel):
    trainset_id: str
    maximo_ref: Optional[str] = None
    description: str
    category: Optional[str] = None
    priority: str = "normal"
    estimated_hours: Optional[float] = None

class JobCardUpdate(BaseModel):
    status: Optional[str] = None
    actual_hours: Optional[float] = None

@router.get("")
def list_jobcards(trainset_id: Optional[str] = None, status: Optional[str] = None, priority: Optional[str] = None):
    supabase = get_supabase()
    query = supabase.table("job_cards").select("*")
    if trainset_id:
        query = query.eq("trainset_id", trainset_id)
    if status:
        query = query.eq("status", status)
    if priority:
        query = query.eq("priority", priority)
        
    res = query.execute()
    return res.data

@router.post("")
async def create_jobcard(data: JobCardCreate, current_user: CurrentUser = Depends(require_operator)):
    supabase = get_supabase()
    job_card = data.dict(exclude_none=True)
    job_card["id"] = str(uuid.uuid4())
    job_card["status"] = "open"
    job_card["raised_by"] = current_user.id
    job_card["opened_at"] = datetime.utcnow().isoformat()
    job_card["created_at"] = datetime.utcnow().isoformat()
    job_card["updated_at"] = datetime.utcnow().isoformat()
    
    res = supabase.table("job_cards").insert(job_card).execute()
    if res.data:
        await log_action(supabase, current_user.id, current_user.name, "create", "job_card", job_card["id"], after=res.data[0])
        return res.data[0]
    raise HTTPException(status_code=400, detail="Failed to create job card")

@router.put("/{id}")
async def update_jobcard(id: str, data: JobCardUpdate, current_user: CurrentUser = Depends(require_operator)):
    supabase = get_supabase()
    before = supabase.table("job_cards").select("*").eq("id", id).execute()
    if not before.data:
        raise HTTPException(status_code=404, detail="Not found")
        
    update_data = data.dict(exclude_unset=True)
    update_data["updated_at"] = datetime.utcnow().isoformat()
    if update_data.get("status") == "closed":
        update_data["closed_at"] = datetime.utcnow().isoformat()
        
    res = supabase.table("job_cards").update(update_data).eq("id", id).execute()
    if res.data:
        await log_action(supabase, current_user.id, current_user.name, "update", "job_card", id, before=before.data[0], after=res.data[0])
        return res.data[0]
    raise HTTPException(status_code=400, detail="Update failed")

@router.post("/import")
async def import_jobcards(file: UploadFile = File(...), current_user: CurrentUser = Depends(require_operator)):
    content = await file.read()
    text = content.decode("utf-8")
    parsed_jobs = parse_maximo_csv(text)
    
    supabase = get_supabase()
    trainsets = supabase.table("trainsets").select("id, number").execute().data
    ts_map = {t["number"]: t["id"] for t in trainsets}
    
    inserted = 0
    for job in parsed_jobs:
        ts_num = job.pop("trainset_number", None)
        if ts_num and ts_num in ts_map:
            job["id"] = str(uuid.uuid4())
            job["trainset_id"] = ts_map[ts_num]
            job["created_at"] = datetime.utcnow().isoformat()
            job["updated_at"] = datetime.utcnow().isoformat()
            job["raised_by"] = current_user.id
            supabase.table("job_cards").insert(job).execute()
            inserted += 1
            
    await log_action(supabase, current_user.id, current_user.name, "import", "job_card", "bulk", after={"inserted": inserted})
    return {"message": f"Imported {inserted} job cards successfully"}

@router.get("/summary")
def get_jobcard_summary():
    supabase = get_supabase()
    res = supabase.table("job_cards").select("status, priority, trainset_id").execute()
    summary = {}
    for j in res.data:
        ts = j["trainset_id"]
        if ts not in summary:
            summary[ts] = {"total": 0, "open_critical": 0}
        summary[ts]["total"] += 1
        if j["status"] in ["open", "in_progress"] and j["priority"] == "critical":
            summary[ts]["open_critical"] += 1
    return summary
