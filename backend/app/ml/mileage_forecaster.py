"""
KMRL Mileage Demand Forecaster
XGBoost regressor predicting km per trainset per service day.
Based on Kochi Metro operational patterns.
"""
import numpy as np
from xgboost import XGBRegressor
from sklearn.model_selection import train_test_split
from sklearn.metrics import mean_squared_error, mean_absolute_error, r2_score
import pickle
import os
import logging
from datetime import datetime, date, timedelta
from typing import Dict, Any

logger = logging.getLogger(__name__)

MODEL_PATH = os.path.join(os.path.dirname(__file__), "mileage_model.pkl")

# Kochi Metro Line operational constants
# Line 1 (Blue): Aluva ↔ Petta — ~25.6 km
# Line 2 planned extension adds further distance
KMRL_BASE_ROUTE_KM = 25.6
KMRL_DAILY_TRIPS_WEEKDAY = 11   # round trips per trainset
KMRL_DAILY_TRIPS_WEEKEND = 13   # higher weekend frequency
KMRL_DAILY_KM_WEEKDAY = KMRL_BASE_ROUTE_KM * 2 * KMRL_DAILY_TRIPS_WEEKDAY  # ~563 km
KMRL_DAILY_KM_WEEKEND = KMRL_BASE_ROUTE_KM * 2 * KMRL_DAILY_TRIPS_WEEKEND  # ~666 km

# Kerala public holidays (approximate)
KERALA_HOLIDAYS_MMDD = {
    "01-01", "01-26", "04-14", "05-01",
    "08-15", "10-02", "10-24", "11-01",
    "12-25",
}


def _is_kerala_holiday(dt: date) -> bool:
    return f"{dt.month:02d}-{dt.day:02d}" in KERALA_HOLIDAYS_MMDD


def _build_features(dt: date) -> np.ndarray:
    """Build feature vector for a given date."""
    dow = dt.weekday()  # 0=Mon, 6=Sun
    return np.array([[
        dow,                                          # day_of_week
        dt.month,                                     # month
        1 if dow >= 5 else 0,                         # is_weekend
        1 if dow == 0 else 0,                         # is_monday
        1 if dow == 4 else 0,                         # is_friday
        1 if dow == 6 else 0,                         # is_sunday
        1 if _is_kerala_holiday(dt) else 0,           # is_holiday
        1 if dt.month in [6, 7, 8] else 0,            # is_monsoon (lower ridership)
        1 if dt.month in [12, 1] else 0,              # is_peak_season
        KMRL_DAILY_KM_WEEKDAY,                        # base_weekday_km
        KMRL_DAILY_KM_WEEKEND,                        # base_weekend_km
    ]])


def generate_synthetic_training_data(days: int = 730) -> tuple:
    """
    Generate 2 years of synthetic KMRL mileage data with realistic patterns:
    - Higher km on weekends (more demand)
    - Lower km during heavy monsoon months (June–August)
    - Holiday spikes (tourists) or dips (govt holidays)
    - Gradual increase over time (growing ridership)
    """
    np.random.seed(42)
    start_date = date(2024, 1, 1)
    rows, targets = [], []

    for i in range(days):
        dt = start_date + timedelta(days=i)
        dow = dt.weekday()
        is_weekend = dow >= 5
        is_holiday = _is_kerala_holiday(dt)
        is_monsoon = dt.month in [6, 7, 8]
        is_peak = dt.month in [12, 1]

        # Base km (per trainset in service)
        base = KMRL_DAILY_KM_WEEKEND if is_weekend else KMRL_DAILY_KM_WEEKDAY

        # Adjustments
        if is_holiday:
            base *= 1.15      # holidays attract leisure riders
        if is_monsoon:
            base *= 0.90      # monsoon slightly reduces ridership
        if is_peak:
            base *= 1.10      # peak tourism season
        if dow == 0:          # Monday (recovery after weekend)
            base *= 0.95

        # Ridership growth (linear 2% per year)
        growth_factor = 1.0 + (i / 365) * 0.02
        base *= growth_factor

        # Add realistic noise
        km = base + np.random.normal(0, 15)
        km = max(km, 200)  # minimum (e.g. partial service day)

        features = [
            dow, dt.month, int(is_weekend), int(dow == 0), int(dow == 4),
            int(dow == 6), int(is_holiday), int(is_monsoon), int(is_peak),
            KMRL_DAILY_KM_WEEKDAY, KMRL_DAILY_KM_WEEKEND
        ]
        rows.append(features)
        targets.append(km)

    return np.array(rows), np.array(targets)


def train_from_supabase(supabase) -> Dict[str, Any]:
    """Train the mileage demand forecaster."""
    X, y = generate_synthetic_training_data(730)

    # Try to augment with real mileage logs
    try:
        logs = supabase.table("mileage_logs").select("log_date,km_added").execute().data
        if len(logs) > 30:
            from collections import defaultdict
            daily_totals = defaultdict(list)
            for log in logs:
                daily_totals[log["log_date"]].append(float(log.get("km_added") or 0))

            real_rows, real_targets = [], []
            for date_str, kms in daily_totals.items():
                try:
                    dt = datetime.strptime(date_str[:10], "%Y-%m-%d").date()
                    avg_km = np.mean(kms)
                    features = _build_features(dt)[0].tolist()
                    real_rows.append(features)
                    real_targets.append(avg_km)
                except Exception:
                    continue

            if real_rows:
                X = np.vstack([X, real_rows])
                y = np.concatenate([y, real_targets])
                logger.info(f"Augmented mileage model with {len(real_rows)} real log days")
    except Exception as e:
        logger.warning(f"Could not fetch mileage logs: {e}")

    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)

    reg = XGBRegressor(
        n_estimators=200,
        max_depth=4,
        learning_rate=0.05,
        subsample=0.8,
        colsample_bytree=0.8,
        random_state=42,
    )
    reg.fit(X_train, y_train, eval_set=[(X_test, y_test)], verbose=False)

    y_pred = reg.predict(X_test)
    rmse = float(np.sqrt(mean_squared_error(y_test, y_pred)))
    mae = float(mean_absolute_error(y_test, y_pred))
    r2 = float(r2_score(y_test, y_pred))

    with open(MODEL_PATH, "wb") as f:
        pickle.dump(reg, f)

    logger.info(f"Mileage model trained: RMSE={rmse:.1f}, MAE={mae:.1f}, R²={r2:.3f}")
    return {
        "rmse": round(rmse, 2),
        "mae": round(mae, 2),
        "r2_score": round(r2, 4),
        "training_samples": len(X_train),
        "test_samples": len(X_test),
    }


def predict_for_date(target_date: date) -> float:
    """Predict expected km per inducted trainset for a given date."""
    try:
        with open(MODEL_PATH, "rb") as f:
            reg = pickle.load(f)
    except FileNotFoundError:
        logger.warning("Mileage model not found, using heuristic")
        dow = target_date.weekday()
        base = KMRL_DAILY_KM_WEEKEND if dow >= 5 else KMRL_DAILY_KM_WEEKDAY
        if _is_kerala_holiday(target_date):
            base *= 1.12
        if target_date.month in [6, 7, 8]:
            base *= 0.92
        return round(base, 1)

    features = _build_features(target_date)
    pred = reg.predict(features)[0]
    return round(float(pred), 1)


def predict_next_7_days(from_date: date = None) -> list:
    """Return predicted km for next 7 days as a list of dicts."""
    if from_date is None:
        from_date = date.today()
    return [
        {
            "date": (from_date + timedelta(days=i)).isoformat(),
            "day_name": (from_date + timedelta(days=i)).strftime("%A"),
            "predicted_km": predict_for_date(from_date + timedelta(days=i)),
        }
        for i in range(7)
    ]
