from datetime import datetime
import uuid
from app.ml.maintenance_predictor import train_from_supabase as train_maint
from app.ml.mileage_forecaster import train_from_supabase as train_mileage

async def run_full_training(supabase):
    # Train both models
    maint_metrics = train_maint(supabase)
    mileage_metrics = train_mileage(supabase)
    
    now = datetime.utcnow().isoformat()
    
    # Save metadata to DB
    models = [
        {
            "id": str(uuid.uuid4()),
            "model_name": "xgboost_maint",
            "model_type": "maintenance_risk",
            "version": "1.0",
            "accuracy": maint_metrics.get("accuracy", 0.0),
            "f1_score": maint_metrics.get("f1_score", 0.0),
            "training_samples": maint_metrics.get("training_samples", 0),
            "is_active": True,
            "trained_at": now,
            "created_at": now
        },
        {
            "id": str(uuid.uuid4()),
            "model_name": "xgboost_mileage",
            "model_type": "mileage_demand",
            "version": "1.0",
            "accuracy": mileage_metrics.get("rmse", 0.0), # Storing RMSE here for simplicity
            "f1_score": 0.0,
            "training_samples": mileage_metrics.get("training_samples", 0),
            "is_active": True,
            "trained_at": now,
            "created_at": now
        }
    ]
    
    # Deactivate old models
    supabase.table("ml_models").update({"is_active": False}).neq("id", "0").execute()
    
    # Insert new
    supabase.table("ml_models").insert(models).execute()
    
    return {
        "maintenance": maint_metrics,
        "mileage": mileage_metrics
    }
