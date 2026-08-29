"""
KMRL CP-SAT Optimizer Engine
Uses Google OR-Tools CP-SAT solver for multi-objective train induction planning.
"""
from dataclasses import dataclass, field
from typing import List, Dict, Any, Optional
from datetime import datetime, date, timedelta
from ortools.sat.python import cp_model
import time
import logging

logger = logging.getLogger(__name__)

SCALE = 1000  # Scale floats to integers for CP-SAT solver accuracy


@dataclass
class OptimizerParams:
    schedule_date: date
    num_slots: int = 18
    weights: Dict[str, int] = field(default_factory=lambda: {
        "availability": 4,
        "branding": 3,
        "mileage": 2,
        "shunting": 1,
    })
    force_include: List[str] = field(default_factory=list)
    force_exclude: List[str] = field(default_factory=list)


def _cert_days(cert_str: Optional[str], reference_date: date) -> Optional[int]:
    """Returns days until cert expiry from reference_date, or None if not set."""
    if not cert_str:
        return None
    try:
        cert_date = datetime.strptime(cert_str[:10], "%Y-%m-%d").date()
        return (cert_date - reference_date).days
    except (ValueError, TypeError):
        return None


def _build_explanation(t: dict, inducted: bool, conflicts: List[str], scores: Dict) -> str:
    """Generate detailed, human-readable explanation for the induction decision."""
    if not inducted:
        if conflicts:
            return "❌ STANDBY / WITHDRAWN — " + "; ".join(conflicts)
        reasons = []
        if scores.get("mileage_score", 0) < 60:
            reasons.append(f"Higher accumulated mileage ({t.get('mileage_km', 0):,.0f} km) prioritized for rest")
        if scores.get("branding_score", 0) == 0:
            reasons.append("No urgent advertiser SLA obligations")
        if scores.get("shunting_score", 0) < 70:
            reasons.append(f"Deep bay location ({t.get('current_bay_position', 'IBL')})")
        return "⏸ STANDBY RESERVE — " + ("; ".join(reasons) if reasons else "Lower composite multi-objective score compared to top 18 rakes")

    parts = []
    parts.append("✅ All 3 fitness certs valid (RS/SIG/TEL)")
    
    if scores.get("branding_score", 0) > 40 and t.get("branding_advertiser"):
        parts.append(f"📢 Active branding SLA ({t.get('branding_advertiser')}, priority {t.get('branding_priority_score', 8)}/10)")
        
    if scores.get("mileage_score", 0) >= 70:
        parts.append(f"⚖️ Favorable mileage ({t.get('mileage_km', 0):,.0f} km) balances fleet lifecycle wear")
        
    if scores.get("shunting_score", 0) >= 80:
        parts.append(f"🚉 Fast turnout from bay {t.get('current_bay_position', 'Front Line')}")

    return "✅ INDUCTED — " + "; ".join(parts)


async def run_optimizer(params: OptimizerParams, supabase) -> Dict[str, Any]:
    """
    Run CP-SAT optimizer and return ranked induction list with realistic multi-objective scores.
    """
    start_time = time.time()
    tomorrow = params.schedule_date + timedelta(days=1)

    # ── 1. Fetch live data from Supabase ───────────────────────────────────
    trainsets = supabase.table("trainsets").select("*").execute().data or []
    all_jobs = supabase.table("job_cards").select("trainset_id,priority,status,description").in_(
        "status", ["open", "in_progress"]
    ).execute().data or []
    all_branding = supabase.table("branding_contracts").select(
        "trainset_id,priority_score,required_hours_per_week,actual_hours_this_week,"
        "advertiser_name,contract_end,penalty_per_hour_missed"
    ).eq("is_active", True).execute().data or []

    # Index jobs and branding by trainset_id
    jobs_by_ts: Dict[str, List[dict]] = {}
    for j in all_jobs:
        jobs_by_ts.setdefault(j["trainset_id"], []).append(j)

    branding_by_ts: Dict[str, dict] = {}
    for b in all_branding:
        branding_by_ts[b["trainset_id"]] = b

    # Fleet mileage statistics for equal wear balancing
    mileages = [float(t.get("total_mileage_km") or 130000) for t in trainsets]
    min_km = min(mileages) if mileages else 110000
    max_km = max(mileages) if mileages else 180000
    km_range = max(1.0, max_km - min_km)
    fleet_avg_km = sum(mileages) / len(mileages) if mileages else 135000

    # ── 2. Per-trainset pre-processing & multi-objective score breakdown ──
    ts_data: List[Dict] = []

    for t in trainsets:
        tid = t["id"]
        conflicts: List[str] = []
        cert_status: Dict[str, str] = {}

        # 1. Fitness certificate checks
        rs_days = _cert_days(t.get("cert_rs_valid_until"), tomorrow)
        sig_days = _cert_days(t.get("cert_signalling_valid_until"), tomorrow)
        tel_days = _cert_days(t.get("cert_telecom_valid_until"), tomorrow)

        for cert_name, days in [("RS", rs_days), ("Signalling", sig_days), ("Telecom", tel_days)]:
            if days is None:
                cert_status[cert_name] = "unknown"
                conflicts.append(f"{cert_name} cert not verified")
            elif days < 0:
                cert_status[cert_name] = "expired"
                conflicts.append(f"{cert_name} cert expired {abs(days)} day(s) ago")
            elif days == 0:
                cert_status[cert_name] = "expires_today"
                conflicts.append(f"{cert_name} cert expires today")
            elif days <= 7:
                cert_status[cert_name] = "expiring_soon"
                conflicts.append(f"Warning: {cert_name} cert expires in {days} days")
            else:
                cert_status[cert_name] = "valid"

        is_cert_valid = all(
            d is not None and d > 0
            for d in [rs_days, sig_days, tel_days]
        )

        # 2. Open Job cards check
        ts_jobs = jobs_by_ts.get(tid, [])
        has_critical = any(j.get("priority") == "critical" for j in ts_jobs)
        has_high = any(j.get("priority") == "high" for j in ts_jobs)
        open_critical_count = sum(1 for j in ts_jobs if j.get("priority") == "critical")
        open_high_count = sum(1 for j in ts_jobs if j.get("priority") == "high")

        if has_critical:
            conflicts.append(f"{open_critical_count} CRITICAL Maximo work order(s) blocking turnout")
        elif has_high:
            conflicts.append(f"{open_high_count} High-priority maintenance job card(s) open")

        # ── 3. Component Scores (0 to 100 float) ─────────────────────────

        # A. Availability Score (0..100)
        if not is_cert_valid or has_critical:
            avail_score_float = 0.0
        else:
            min_days = min(d for d in [rs_days, sig_days, tel_days] if d is not None)
            cert_factor = min(min_days / 60.0, 1.0) * 80.0 + 20.0  # 20..100
            penalty = 25.0 if has_high else (10.0 if len(ts_jobs) > 0 else 0.0)
            status_penalty = 15.0 if t.get("status") == "standby" else 0.0
            avail_score_float = max(10.0, cert_factor - penalty - status_penalty)

        # B. Branding Score (0..100)
        brand_score_float = 15.0  # Base score for unbranded
        branding_advertiser = None
        branding_priority_score = 0
        bc = branding_by_ts.get(tid)
        if bc:
            branding_advertiser = bc.get("advertiser_name")
            prio = float(bc.get("priority_score") or 8)
            branding_priority_score = int(prio)
            req_hrs = float(bc.get("required_hours_per_week") or 40)
            act_hrs = float(bc.get("actual_hours_this_week") or 0)
            
            # If actual hours are behind required SLA, boost score significantly to prevent penalty
            sla_deficit = max(0.0, (req_hrs - act_hrs) / max(1.0, req_hrs))
            brand_score_float = min(100.0, (prio * 7.5) + (sla_deficit * 25.0) + 10.0)

        # C. Mileage Balancing Score (0..100)
        # Rakes with lower accumulated mileage get HIGHER score so they run more and wear equalizes
        km = float(t.get("total_mileage_km") or 130000)
        km_normalized = (km - min_km) / km_range  # 0.0 (lowest km) to 1.0 (highest km)
        mile_score_float = max(25.0, min(100.0, 95.0 - (km_normalized * 55.0)))

        # D. Shunting Score (0..100)
        bay = str(t.get("current_bay_position") or "IBL-C1").upper()
        if bay.startswith("IBL-A") or bay.startswith("IBL-B"):
            shunt_score_float = 95.0  # Prime turnout bays
        elif bay.startswith("IBL-C") or bay.startswith("IBL-D"):
            shunt_score_float = 80.0  # Mid stabling lines
        elif bay.startswith("IBL-E") or bay.startswith("IBL-F"):
            shunt_score_float = 65.0  # Deep stabling lines
        else:
            shunt_score_float = 45.0  # Heavy overhaul / maintenance shed

        ts_data.append({
            "id": tid,
            "number": t.get("number", ""),
            "name": t.get("name", ""),
            "is_cert_valid": is_cert_valid,
            "has_critical": has_critical,
            "has_high": has_high,
            "conflicts": conflicts,
            "cert_status": cert_status,
            "availability_score": avail_score_float,
            "branding_score": brand_score_float,
            "mileage_score": mile_score_float,
            "shunting_score": shunt_score_float,
            "mileage_km": km,
            "branding_advertiser": branding_advertiser,
            "branding_priority_score": branding_priority_score,
            "current_bay_position": bay,
            "status": t.get("status", "ready"),
        })

    # ── 3. CP-SAT Integer Programming Model ────────────────────────────────
    model = cp_model.CpModel()
    induct_vars: Dict[str, cp_model.IntVar] = {}

    for t in ts_data:
        var = model.NewBoolVar(f"induct_{t['id']}")
        induct_vars[t["id"]] = var

        # Hard constraint: strictly prohibit induction if cert invalid or critical job open
        if not t["is_cert_valid"] or t["has_critical"]:
            model.Add(var == 0)

        # Force overrides
        if t["id"] in params.force_include:
            if t["is_cert_valid"] and not t["has_critical"]:
                model.Add(var == 1)

        if t["id"] in params.force_exclude:
            model.Add(var == 0)

    # Exactly num_slots inducted (bounded by total eligible rakes)
    eligible_count = sum(
        1 for t in ts_data
        if t["is_cert_valid"] and not t["has_critical"]
        and t["id"] not in params.force_exclude
    )
    actual_slots = min(params.num_slots, eligible_count)
    model.Add(sum(induct_vars.values()) == actual_slots)

    # ── 4. Objective Function (Multi-Objective Maximization) ──────────────
    w_avail = params.weights.get("availability", 4)
    w_brand = params.weights.get("branding", 3)
    w_mile = params.weights.get("mileage", 2)
    w_shunt = params.weights.get("shunting", 1)
    total_weight = max(1, w_avail + w_brand + w_mile + w_shunt)

    objective_terms = []
    for t in ts_data:
        var = induct_vars[t["id"]]
        # Integer scaled combined score
        combined_int = int(
            (
                w_avail * t["availability_score"]
                + w_brand * t["branding_score"]
                + w_mile * t["mileage_score"]
                + w_shunt * t["shunting_score"]
            ) * SCALE
        )
        objective_terms.append(var * combined_int)

    model.Maximize(sum(objective_terms))

    # ── 5. Solve ──────────────────────────────────────────────────────────
    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = 15.0
    solver.parameters.num_search_workers = 4
    status = solver.Solve(model)

    solver_time_ms = int((time.time() - start_time) * 1000)
    logger.info(f"CP-SAT status: {solver.StatusName(status)}, time: {solver_time_ms}ms")

    # ── 6. Build Individual Results & Normalized Scores ───────────────────
    inducted_list: List[Dict] = []
    standby_list: List[Dict] = []
    global_conflicts: List[Dict] = []

    for t in ts_data:
        var_val = solver.Value(induct_vars[t["id"]]) if status in (cp_model.OPTIMAL, cp_model.FEASIBLE) else 0
        inducted = var_val == 1

        # Composite score calculation (correct 0..100 float range)
        raw_composite = (
            w_avail * t["availability_score"]
            + w_brand * t["branding_score"]
            + w_mile * t["mileage_score"]
            + w_shunt * t["shunting_score"]
        ) / float(total_weight)
        
        final_score = round(max(5.0, min(99.5, raw_composite)), 1)

        per_scores = {
            "availability_score": t["availability_score"],
            "branding_score": t["branding_score"],
            "mileage_score": t["mileage_score"],
            "shunting_score": t["shunting_score"],
        }
        explanation = _build_explanation(t, inducted, t["conflicts"], per_scores)

        entry = {
            "trainset_id": t["id"],
            "number": t["number"],
            "name": t["name"],
            "inducted": inducted,
            "score": final_score,
            "explanation": explanation,
            "conflicts": t["conflicts"],
            "cert_status": t["cert_status"],
            "mileage_km": t["mileage_km"],
            "bay_position": t["current_bay_position"],
            "branding_advertiser": t["branding_advertiser"],
            "has_critical_jobs": t["has_critical"],
            "has_high_jobs": t["has_high"],
        }

        if inducted:
            inducted_list.append(entry)
        else:
            standby_list.append(entry)
            if t["conflicts"]:
                global_conflicts.append({
                    "trainset_id": t["id"],
                    "number": t["number"],
                    "reasons": t["conflicts"],
                })

    # Sort inducted by score descending and assign ranks 1..N
    inducted_list.sort(key=lambda x: x["score"], reverse=True)
    for rank, item in enumerate(inducted_list, start=1):
        item["rank"] = rank

    # Sort standby by score descending
    standby_list.sort(key=lambda x: x["score"], reverse=True)
    for item in standby_list:
        item["rank"] = None

    full_list = inducted_list + standby_list

    return {
        "induction_list": full_list,
        "conflicts": global_conflicts,
        "stats": {
            "total_inducted": len(inducted_list),
            "total_standby": len(standby_list),
            "total_conflicts": len(global_conflicts),
            "solver_time_ms": solver_time_ms,
            "solver_status": solver.StatusName(status),
            "eligible_count": eligible_count,
            "actual_slots": actual_slots,
        },
    }
