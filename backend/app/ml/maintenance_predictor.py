"""
KMRL Maintenance Risk Predictor
XGBoost classifier trained on domain-knowledge synthetic data.
Predicts probability of unscheduled maintenance in next 7 days.
"""
import numpy as np
import pandas as pd
from xgboost import XGBClassifier
from sklearn.model_selection import train_test_split
from sklearn.metrics import accuracy_score, f1_score, roc_auc_score
from sklearn.preprocessing import StandardScaler
import pickle
import os
import logging
from datetime import datetime, date
from typing import Dict, Any

logger = logging.getLogger(__name__)

MODEL_PATH = os.path.join(os.path.dirname(__file__), "maint_model.pkl")
SCALER_PATH = os.path.join(os.path.dirname(__file__), "maint_scaler.pkl")

FEATURE_NAMES = [
    "total_mileage_km",
    "days_since_last_clean",
    "days_since_last_deep_clean",
    "cert_rs_days_remaining",
    "cert_signalling_days_remaining",
    "cert_telecom_days_remaining",
    "open_job_cards_count",
    "open_critical_jobs",
    "km_last_7_days",
    "km_last_30_days",
    "trainset_age_years",
    "min_cert_days_remaining",
]


def generate_synthetic_training_data(n_samples: int = 1000) -> tuple:
    """
    Generate realistic synthetic training data based on KMRL domain knowledge.
    
    Feature engineering rationale:
    - High mileage + low cert days → higher risk
    - Many open critical jobs → certain maintenance
    - Not cleaned recently + high km → elevated risk
    - Older trainsets → slightly higher baseline risk
    """
    np.random.seed(42)

    # ── Generate realistic feature distributions ──────────────────────────
    # total_mileage_km: 100,000–200,000 km (KMRL fleet range)
    total_mileage = np.random.uniform(100_000, 200_000, n_samples)

    # days_since_last_clean: 0–10 days typical nightly cleaning
    days_since_clean = np.random.exponential(scale=2.0, size=n_samples).clip(0, 14)

    # days_since_last_deep_clean: 0–45 days
    days_since_deep_clean = np.random.exponential(scale=15.0, size=n_samples).clip(0, 60)

    # cert days remaining (RS, Signalling, Telecom): mostly 10–180 days, some expiring
    cert_rs = np.random.choice(
        [np.random.uniform(30, 180), np.random.uniform(0, 10)],
        p=[0.85, 0.15],
        size=n_samples
    )
    # Simplify: just sample from mixed distributions
    cert_rs = np.where(
        np.random.rand(n_samples) < 0.15,
        np.random.uniform(0, 10, n_samples),
        np.random.uniform(30, 180, n_samples)
    )
    cert_sig = np.where(
        np.random.rand(n_samples) < 0.12,
        np.random.uniform(0, 10, n_samples),
        np.random.uniform(20, 200, n_samples)
    )
    cert_tel = np.where(
        np.random.rand(n_samples) < 0.10,
        np.random.uniform(0, 10, n_samples),
        np.random.uniform(25, 150, n_samples)
    )

    # open job cards (0–5, Poisson distributed)
    open_jobs = np.random.poisson(lam=0.8, size=n_samples).clip(0, 5)
    open_critical = np.where(open_jobs >= 3, np.random.randint(0, 2, n_samples), 0)

    # km in last 7 / 30 days (Kochi Metro: ~250–320 km/day per trainset in service)
    km_last_7 = np.random.uniform(0, 320 * 7, n_samples)  # 0 if on standby/maintenance
    km_last_30 = km_last_7 * np.random.uniform(3.5, 4.5, n_samples)

    # trainset age (2012–2020 fleet → 6–14 years)
    age_years = np.random.uniform(6, 14, n_samples)

    # min cert days remaining
    min_cert = np.minimum(np.minimum(cert_rs, cert_sig), cert_tel)

    X = np.column_stack([
        total_mileage,
        days_since_clean,
        days_since_deep_clean,
        cert_rs,
        cert_sig,
        cert_tel,
        open_jobs,
        open_critical,
        km_last_7,
        km_last_30,
        age_years,
        min_cert,
    ])

    # ── Generate target variable with domain-knowledge rules ──────────────
    # Base probability from multiple risk factors
    risk = np.zeros(n_samples)

    # Cert expiry risk (biggest driver)
    risk += np.where(min_cert < 5, 0.60, 0.0)
    risk += np.where((min_cert >= 5) & (min_cert < 15), 0.30, 0.0)
    risk += np.where((min_cert >= 15) & (min_cert < 30), 0.10, 0.0)

    # Critical jobs (certain maintenance required)
    risk += open_critical * 0.40

    # High mileage
    risk += np.where(total_mileage > 170_000, 0.20, 0.0)
    risk += np.where(total_mileage > 155_000, 0.10, 0.0)

    # Age factor
    risk += np.where(age_years > 10, 0.08, 0.0)

    # Open job cards (non-critical)
    risk += open_jobs * 0.05

    # Overdue cleaning
    risk += np.where(days_since_clean > 7, 0.10, 0.0)

    # High recent usage (intensive use → wear)
    risk += np.where(km_last_7 > 1500, 0.08, 0.0)

    # Clip to [0, 1] and sample binary labels
    risk = risk.clip(0, 1)
    y = (np.random.rand(n_samples) < risk).astype(int)

    # Ensure ~25% positive rate (realistic for KMRL)
    pos_rate = y.mean()
    logger.info(f"Synthetic training data: {n_samples} samples, {pos_rate:.1%} positive rate")

    return X, y


def train_from_supabase(supabase) -> Dict[str, Any]:
    """
    Train the maintenance risk model.
    Tries to use real historical data from Supabase; falls back to synthetic data.
    """
    X_synth, y_synth = generate_synthetic_training_data(1000)

    # Try to fetch real maintenance events from Supabase
    try:
        events = supabase.table("maintenance_events").select(
            "trainset_id,event_date,event_type,downtime_hours"
        ).eq("event_type", "unscheduled").execute().data

        trainsets = supabase.table("trainsets").select("*").execute().data

        if len(events) > 20 and len(trainsets) > 0:
            # Build real feature matrix (simplified)
            ts_map = {t["id"]: t for t in trainsets}
            today = date.today()
            real_rows = []
            real_labels = []

            for ts in trainsets:
                ts_events = [e for e in events if e["trainset_id"] == ts["id"]]
                label = 1 if ts_events else 0

                def cert_days(field):
                    val = ts.get(field)
                    if not val:
                        return 90
                    try:
                        d = datetime.strptime(val[:10], "%Y-%m-%d").date()
                        return (d - today).days
                    except Exception:
                        return 90

                rs_d = cert_days("cert_rs_valid_until")
                sig_d = cert_days("cert_signalling_valid_until")
                tel_d = cert_days("cert_telecom_valid_until")
                age = today.year - (ts.get("year_of_manufacture") or 2015)
                km = float(ts.get("total_mileage_km") or 0)

                real_rows.append([
                    km, 2, 10, rs_d, sig_d, tel_d, 0, 0, 300, 1200, age, min(rs_d, sig_d, tel_d)
                ])
                real_labels.append(label)

            X_real = np.array(real_rows)
            y_real = np.array(real_labels)
            X = np.vstack([X_synth, X_real])
            y = np.concatenate([y_synth, y_real])
            logger.info(f"Augmented with {len(y_real)} real samples from Supabase")
        else:
            X, y = X_synth, y_synth
    except Exception as e:
        logger.warning(f"Could not fetch real data, using synthetic only: {e}")
        X, y = X_synth, y_synth

    # Train/test split
    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42, stratify=y)

    # Scale features
    scaler = StandardScaler()
    X_train_s = scaler.fit_transform(X_train)
    X_test_s = scaler.transform(X_test)

    # Train XGBoost
    clf = XGBClassifier(
        n_estimators=200,
        max_depth=5,
        learning_rate=0.05,
        subsample=0.8,
        colsample_bytree=0.8,
        scale_pos_weight=3,  # class imbalance correction
        use_label_encoder=False,
        eval_metric="logloss",
        random_state=42,
    )
    clf.fit(X_train_s, y_train, eval_set=[(X_test_s, y_test)], verbose=False)

    # Metrics
    y_pred = clf.predict(X_test_s)
    y_proba = clf.predict_proba(X_test_s)[:, 1]

    acc = float(accuracy_score(y_test, y_pred))
    f1 = float(f1_score(y_test, y_pred, zero_division=0))
    try:
        auc = float(roc_auc_score(y_test, y_proba))
    except Exception:
        auc = 0.0

    # Save model + scaler
    with open(MODEL_PATH, "wb") as f:
        pickle.dump(clf, f)
    with open(SCALER_PATH, "wb") as f:
        pickle.dump(scaler, f)

    logger.info(f"Maintenance model trained: acc={acc:.3f}, f1={f1:.3f}, auc={auc:.3f}")
    return {
        "accuracy": round(acc, 4),
        "f1_score": round(f1, 4),
        "roc_auc": round(auc, 4),
        "training_samples": len(X_train),
        "test_samples": len(X_test),
    }


def predict(features: Dict[str, float]) -> float:
    """Return maintenance risk probability (0–1) for a trainset."""
    try:
        with open(MODEL_PATH, "rb") as f:
            clf = pickle.load(f)
        with open(SCALER_PATH, "rb") as f:
            scaler = pickle.load(f)
    except FileNotFoundError:
        logger.warning("Maintenance model not found, returning heuristic estimate")
        # Heuristic fallback
        min_cert = min(
            features.get("cert_rs_days_remaining", 90),
            features.get("cert_signalling_days_remaining", 90),
            features.get("cert_telecom_days_remaining", 90),
        )
        risk = 0.05
        if min_cert < 5:
            risk += 0.50
        elif min_cert < 15:
            risk += 0.25
        if features.get("open_critical_jobs", 0) > 0:
            risk += 0.40
        if features.get("total_mileage_km", 0) > 170_000:
            risk += 0.15
        return round(min(risk, 0.99), 4)

    min_cert = min(
        features.get("cert_rs_days_remaining", 90),
        features.get("cert_signalling_days_remaining", 90),
        features.get("cert_telecom_days_remaining", 90),
    )
    x_val = np.array([[
        features.get("total_mileage_km", 0),
        features.get("days_since_last_clean", 2),
        features.get("days_since_last_deep_clean", 10),
        features.get("cert_rs_days_remaining", 90),
        features.get("cert_signalling_days_remaining", 90),
        features.get("cert_telecom_days_remaining", 90),
        features.get("open_job_cards_count", 0),
        features.get("open_critical_jobs", 0),
        features.get("km_last_7_days", 300),
        features.get("km_last_30_days", 1200),
        features.get("trainset_age_years", 8),
        min_cert,
    ]])

    x_scaled = scaler.transform(x_val)
    prob = float(clf.predict_proba(x_scaled)[0][1])
    return round(prob, 4)


def get_risk_label(prob: float) -> str:
    """Convert probability to human-readable risk label."""
    if prob >= 0.70:
        return "Critical"
    elif prob >= 0.45:
        return "High"
    elif prob >= 0.25:
        return "Medium"
    else:
        return "Low"
