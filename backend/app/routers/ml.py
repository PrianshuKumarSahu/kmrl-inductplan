"""
KMRL ML Router — endpoints for predictions, training, and model status.
"""
from fastapi import APIRouter, Depends, HTTPException
from typing import Optional
from app.auth import get_current_user, require_supervisor, CurrentUser
from app.database import get_supabase
from app.ml.training_pipeline import run_full_training
from app.ml.maintenance_predictor import predict as predict_maintenance, get_risk_label
from app.ml.mileage_forecaster import predict_for_date, predict_next_7_days
from datetime import datetime, date, timedelta

router = APIRouter(prefix="/ml", tags=["Machine Learning"])


def _extract_features(trainset: dict, supabase) -> dict:
    """Extract real features for a trainset from Supabase data."""
    tid = trainset["id"]
    today = date.today()

    # Cert days remaining
    def cert_days(field: str) -> float:
        val = trainset.get(field)
        if not val:
            return 90.0
        try:
            d = datetime.strptime(val[:10], "%Y-%m-%d").date()
            return float((d - today).days)
        except Exception:
            return 90.0

    # Days since last clean
    def days_since(field: str) -> float:
        val = trainset.get(field)
        if not val:
            return 5.0
        try:
            dt = datetime.fromisoformat(val.replace("Z", "+00:00"))
            return float((datetime.utcnow() - dt.replace(tzinfo=None)).days)
        except Exception:
            return 5.0

    # Job cards
    jobs = supabase.table("job_cards").select("priority,status").eq("trainset_id", tid).in_(
        "status", ["open", "in_progress"]
    ).execute().data
    open_jobs = len(jobs)
    open_critical = sum(1 for j in jobs if j["priority"] == "critical")

    # Recent mileage from logs
    recent_logs = supabase.table("mileage_logs").select("km_added,log_date").eq(
        "trainset_id", tid
    ).gte("log_date", (today - timedelta(days=30)).isoformat()).execute().data

    km_last_7 = sum(
        float(l.get("km_added") or 0) for l in recent_logs
        if l.get("log_date") and (today - datetime.strptime(l["log_date"], "%Y-%m-%d").date()).days <= 7
    )
    km_last_30 = sum(float(l.get("km_added") or 0) for l in recent_logs)

    # Last maintenance event
    last_maint = supabase.table("maintenance_events").select("event_date").eq(
        "trainset_id", tid
    ).order("event_date", desc=True).limit(1).execute().data
    days_since_maint = 60.0
    if last_maint and last_maint[0].get("event_date"):
        try:
            maint_date = datetime.strptime(last_maint[0]["event_date"][:10], "%Y-%m-%d").date()
            days_since_maint = float((today - maint_date).days)
        except Exception:
            pass

    # Age
    mfg_year = trainset.get("year_of_manufacture") or 2015
    age_years = float(today.year - mfg_year)

    return {
        "total_mileage_km": float(trainset.get("total_mileage_km") or 0),
        "days_since_last_clean": days_since("last_cleaned_at"),
        "days_since_last_deep_clean": days_since("last_deep_cleaned_at"),
        "cert_rs_days_remaining": cert_days("cert_rs_valid_until"),
        "cert_signalling_days_remaining": cert_days("cert_signalling_valid_until"),
        "cert_telecom_days_remaining": cert_days("cert_telecom_valid_until"),
        "open_job_cards_count": open_jobs,
        "open_critical_jobs": open_critical,
        "km_last_7_days": km_last_7,
        "km_last_30_days": km_last_30,
        "trainset_age_years": age_years,
        "days_since_last_maintenance": days_since_maint,
    }


@router.post("/train")
async def trigger_training(current_user: CurrentUser = Depends(require_supervisor)):
    """Trigger full model retraining. Supervisor only."""
    supabase = get_supabase()
    try:
        metrics = await run_full_training(supabase)
        return {"status": "success", "metrics": metrics, "trained_at": datetime.utcnow().isoformat()}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Training failed: {str(e)}")


@router.get("/predictions")
def get_predictions():
    """
    Get maintenance risk prediction and mileage forecast for all trainsets.
    Features are extracted from live Supabase data.
    """
    supabase = get_supabase()
    trainsets = supabase.table("trainsets").select("*").execute().data
    tomorrow = date.today() + timedelta(days=1)
    expected_km = predict_for_date(tomorrow)
    predictions = []

    for t in trainsets:
        features = _extract_features(t, supabase)
        risk_prob = predict_maintenance(features)
        risk_label = get_risk_label(risk_prob)

        # Cert days for display
        def cert_days_display(field):
            val = t.get(field)
            if not val:
                return None
            try:
                d = datetime.strptime(val[:10], "%Y-%m-%d").date()
                return (d - date.today()).days
            except Exception:
                return None

        predictions.append({
            "trainset_id": t["id"],
            "number": t["number"],
            "name": t.get("name", ""),
            "status": t.get("status", "ready"),
            "maintenance_risk_probability": risk_prob,
            "maintenance_risk_percent": round(risk_prob * 100, 1),
            "risk_label": risk_label,
            "expected_km_tomorrow": expected_km,
            "features_used": features,
            "cert_rs_days": cert_days_display("cert_rs_valid_until"),
            "cert_sig_days": cert_days_display("cert_signalling_valid_until"),
            "cert_tel_days": cert_days_display("cert_telecom_valid_until"),
        })

    # Sort by risk descending
    predictions.sort(key=lambda x: x["maintenance_risk_probability"], reverse=True)
    return predictions


@router.get("/forecast/mileage")
def get_mileage_forecast():
    """Get 7-day mileage demand forecast."""
    return predict_next_7_days(date.today())


@router.get("/status")
def get_ml_status():
    """Get currently active ML model info."""
    supabase = get_supabase()
    res = supabase.table("ml_models").select("*").eq("is_active", True).order(
        "trained_at", desc=True
    ).execute()
    return res.data


@router.get("/history")
def get_ml_history():
    """Get ML model training history."""
    supabase = get_supabase()
    res = supabase.table("ml_models").select("*").order("trained_at", desc=True).limit(20).execute()
    return res.data
