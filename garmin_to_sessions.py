"""
Garmin → Coach Sportif : convertit les activités Garmin en sessions.json
Usage : python garmin_to_sessions.py [--days 30]
"""

import json
import os
import sys
import time
import hashlib
from datetime import datetime, timedelta, timezone

try:
    from garminconnect import Garmin
    from dotenv import load_dotenv
except ImportError:
    print("❌ Dépendances manquantes. Installe-les d'abord :")
    print("   pip install garminconnect python-dotenv")
    sys.exit(1)

# ── Config ────────────────────────────────────────────────────────────────────
SESSIONS_OUT = os.path.join(os.path.dirname(__file__), "data", "sessions.json")
SLEEP_OUT    = os.path.join(os.path.dirname(__file__), "data", "sleep.json")

TYPE_MAP = {
    "running":           "course_ext",
    "treadmill_running": "course_tapis",
    "indoor_rowing":     "rameur",
    "rowing":            "rameur",
    "cycling":           "velo",
    "indoor_cycling":    "velo",
    "boxing":            "boxe",
    "cardio_training":   "cardio",
    "strength_training": "renfo",
    "jump_rope":         "corde",
    "fitness_equipment": "cardio",
    "other":             "autre",
}

LABEL_MAP = {
    "course_ext":   "Course ext.",
    "course_tapis": "Course tapis",
    "rameur":       "Rameur",
    "velo":         "Vélo apprt.",
    "boxe":         "Boxe (cours)",
    "sac":          "Sac de frappe",
    "corde":        "Corde à sauter",
    "renfo":        "Renforcement",
    "cardio":       "Cardio",
    "autre":        "Autre",
}


def map_type(garmin_type: str, activity_name: str) -> str:
    gt = (garmin_type or "").lower().replace(" ", "_")
    name = (activity_name or "").lower()
    # Affiner depuis le nom
    if "corde" in name or "jump rope" in name:
        return "corde"
    if "sac" in name or "punching" in name:
        return "sac"
    if "boxe" in name or "boxing" in name:
        return "boxe"
    if "tapis" in name or "treadmill" in name:
        return "course_tapis"
    return TYPE_MAP.get(gt, "autre")


def sec_to_min(s):
    return round(s / 60, 1) if s else None


def mps_to_sec_per_km(mps):
    if not mps or mps <= 0:
        return None
    return round(1000 / mps)


def garmin_activity_to_session(act: dict) -> dict:
    date_str = (act.get("startTimeLocal") or "")[:10]
    if not date_str:
        return None

    act_type = act.get("activityType", {}).get("typeKey", "other")
    act_name = act.get("activityName", "")
    s_type = map_type(act_type, act_name)

    dur_sec = act.get("duration") or act.get("movingDuration")
    dist_m = act.get("distance")
    avg_speed = act.get("averageSpeed")
    avg_hr = act.get("averageHR")
    max_hr = act.get("maxHR")
    calories = act.get("calories")
    elevation = act.get("elevationGain")

    dist_km = round(dist_m / 1000, 2) if dist_m and dist_m > 0 else None
    pace = mps_to_sec_per_km(avg_speed) if s_type in ("course_ext", "course_tapis") else None

    act_id = str(act.get("activityId", ""))
    garmin_id = f"g_{act_id}" if act_id else f"g_{date_str}_{hashlib.md5(act_name.encode()).hexdigest()[:6]}"

    return {
        "id": garmin_id,
        "date": date_str,
        "source": "garmin",
        "type": s_type,
        "title": act_name or LABEL_MAP.get(s_type, "Activité"),
        "duration_min": sec_to_min(dur_sec),
        "calories": int(calories) if calories else None,
        "distance_km": dist_km,
        "pace_sec_km": pace,
        "hr_avg": int(avg_hr) if avg_hr else None,
        "hr_max": int(max_hr) if max_hr else None,
        "elevation_m": int(elevation) if elevation and elevation > 0 else None,
        "rounds": None,
        "notes": "",
    }


# Code de sortie « transitoire » : rien d'actionnable (rate limit Garmin).
# On sort en 0 pour ne pas faire échouer le job CI ni déclencher un mail d'alerte.
EXIT_TRANSIENT = 0


def fetch_resting_hr(api, d):
    """FC au repos du jour (hors bloc sommeil, endpoint séparé)."""
    try:
        data = api.get_rhr_day(d) or {}
        mm = (data.get("allMetrics") or {}).get("metricsMap") or {}
        arr = mm.get("WELLNESS_RESTING_HEART_RATE") or []
        if arr and arr[0].get("value"):
            return int(arr[0]["value"])
        if data.get("restingHeartRate"):
            return int(data["restingHeartRate"])
    except Exception:
        pass
    return None


def fetch_hrv(api, d):
    """HRV (variabilité cardiaque) moyenne de la nuit — indicateur de récup."""
    try:
        summ = (api.get_hrv_data(d) or {}).get("hrvSummary") or {}
        v = summ.get("lastNightAvg") or summ.get("weeklyAvg")
        if v:
            return int(v)
    except Exception:
        pass
    return None


def login_with_retry(email: str, password: str, attempts: int = 4):
    """Connexion Garmin avec backoff. Garmin rate-limite (HTTP 429) les IPs
    cloud (GitHub Actions) : on réessaie avec des pauses croissantes.

    Retourne (api, None) si OK, sinon (None, "rate_limit" | "other")."""
    delay = 30  # secondes, doublé à chaque tentative
    last_err = ""
    for i in range(1, attempts + 1):
        try:
            api = Garmin(email=email, password=password)
            api.login()
            return api, None
        except Exception as e:
            last_err = str(e)
            is_rate_limit = "429" in last_err or "rate limit" in last_err.lower() \
                or "too many requests" in last_err.lower() \
                or "retrieve user settings" in last_err.lower()
            tag = "rate limit" if is_rate_limit else "erreur"
            if i < attempts:
                print(f"⚠️  Connexion échouée ({tag}) — tentative {i}/{attempts} : {last_err}")
                print(f"   ⏳ Nouvelle tentative dans {delay}s…")
                time.sleep(delay)
                delay *= 2
            else:
                print(f"❌ Connexion échouée après {attempts} tentatives : {last_err}")
                return None, ("rate_limit" if is_rate_limit else "other")
    return None, "other"


def load_existing(path: str) -> list:
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return []


def main():
    import argparse
    parser = argparse.ArgumentParser(description="Sync Garmin → sessions.json")
    parser.add_argument("--days", type=int, default=60, help="Nombre de jours à récupérer (défaut: 60)")
    parser.add_argument("--all", action="store_true", help="Récupérer toutes les activités depuis 2018")
    parser.add_argument("--sleep-days", type=int, default=30, help="Jours de sommeil à récupérer (défaut: 30 ; grande valeur = backfill historique)")
    args = parser.parse_args()

    # Credentials — env vars first (GitHub Actions), fallback to .env file (local)
    email = os.environ.get("GARMIN_EMAIL")
    password = os.environ.get("GARMIN_PASSWORD")
    if not email or not password:
        env_path = os.path.join(os.path.dirname(__file__), "Mcp", "garmin_mcp-main", ".env")
        load_dotenv(env_path, override=True)
        email = os.getenv("GARMIN_EMAIL")
        password = os.getenv("GARMIN_PASSWORD")
    if not email or not password:
        print("❌ GARMIN_EMAIL / GARMIN_PASSWORD non définis (ni env vars, ni .env)")
        sys.exit(1)

    print(f"🔗 Connexion Garmin Connect ({email})…")
    api, fail = login_with_retry(email, password)
    if api is None:
        if fail == "rate_limit":
            # Transitoire : Garmin a rate-limité l'IP. Les données seront
            # rattrapées au prochain run (la fenêtre couvre {args.days} jours).
            print("ℹ️  Rate limit Garmin (429) — sync ignorée pour cette fois, "
                  "rattrapage au prochain run. Pas d'échec CI.")
            sys.exit(EXIT_TRANSIENT)
        sys.exit(1)

    # Plage de dates
    end_date = datetime.now(tz=timezone.utc)
    start_date = datetime(2018, 1, 1, tzinfo=timezone.utc) if args.all else end_date - timedelta(days=args.days)

    print(f"📥 Récupération des activités depuis {start_date.date()}…")
    try:
        activities = api.get_activities_by_date(
            start_date.strftime("%Y-%m-%d"),
            end_date.strftime("%Y-%m-%d"),
        )
    except Exception as e:
        msg = str(e)
        if "429" in msg or "rate limit" in msg.lower() or "too many requests" in msg.lower():
            print(f"ℹ️  Rate limit Garmin (429) à la récupération — rattrapage au prochain run : {msg}")
            sys.exit(EXIT_TRANSIENT)
        print(f"❌ Erreur récupération : {e}")
        sys.exit(1)

    print(f"✅ {len(activities)} activités Garmin reçues")

    # Conversion
    sessions_new = []
    for act in activities:
        s = garmin_activity_to_session(act)
        if s and s["date"]:
            sessions_new.append(s)

    # Fusion avec existant
    os.makedirs(os.path.dirname(SESSIONS_OUT), exist_ok=True)
    existing = load_existing(SESSIONS_OUT)
    existing_ids = {s["id"] for s in existing}

    added = 0
    for s in sessions_new:
        if s["id"] not in existing_ids:
            existing.append(s)
            added += 1

    # Tri par date décroissante
    existing.sort(key=lambda s: s["date"], reverse=True)

    with open(SESSIONS_OUT, "w", encoding="utf-8") as f:
        json.dump(existing, f, ensure_ascii=False, indent=2)

    print(f"💾 {added} nouvelles séances ajoutées → {SESSIONS_OUT} ({len(existing)} total)")

    # ── Sommeil ───────────────────────────────────────────────────────────────
    sleep_days = args.sleep_days
    backfill = sleep_days > 90        # mode historique : throttle + arrêt auto + reprise
    throttle = 0.8 if backfill else 0.0
    MAX_EMPTY = 60                    # nuits vides d'affilée → fin de l'historique
    print(f"🌙 Récupération du sommeil ({sleep_days} nuits{' — backfill historique' if backfill else ''})…")

    # On charge l'existant d'abord : en backfill on saute les dates déjà connues
    # (sauf les 3 plus récentes, qu'on rafraîchit) → reprise possible si coupé.
    existing_sleep = load_existing(SLEEP_OUT)
    by_date = {e["date"]: e for e in existing_sleep if isinstance(e, dict) and e.get("date")}

    sleep_entries = []
    empty_streak = 0
    for i in range(sleep_days):
        d = (end_date - timedelta(days=i)).strftime("%Y-%m-%d")
        if backfill and i > 3 and d in by_date:
            continue  # déjà en base, on évite l'appel API

        raw = None
        try:
            raw = api.get_sleep_data(d)
        except Exception as e:
            if "429" in str(e):
                time.sleep(30)  # rate limit : on souffle puis une seule reprise
                try: raw = api.get_sleep_data(d)
                except Exception: raw = None

        dto = (raw or {}).get("dailySleepDTO") or {}
        dur_s = dto.get("sleepTimeSeconds") or 0
        if dur_s < 3600:
            empty_streak += 1
            if backfill and empty_streak >= MAX_EMPTY:
                print(f"⏹️  {MAX_EMPTY} nuits vides d'affilée — fin de l'historique disponible.")
                break
            if throttle: time.sleep(throttle)
            continue
        empty_streak = 0

        rhr = dto.get("restingHeartRate")
        hrv = dto.get("avgOvernightHrv")
        # FC repos + HRV : endpoints séparés (appels en plus) → seulement 14 j récents.
        if i < 14:
            if rhr is None: rhr = fetch_resting_hr(api, d)
            if hrv is None: hrv = fetch_hrv(api, d)
        sleep_entries.append({
            "date":        d,
            "duration_h":  round(dur_s / 3600, 2),
            "rem_h":       round((dto.get("remSleepSeconds") or 0) / 3600, 2),
            "deep_h":      round((dto.get("deepSleepSeconds") or 0) / 3600, 2),
            "light_h":     round((dto.get("lightSleepSeconds") or 0) / 3600, 2),
            "score":       (dto.get("sleepScores") or {}).get("overall", {}).get("value"),
            "resting_hr":  rhr,
            "hrv":         hrv,
        })
        if throttle: time.sleep(throttle)

    # Fusion avec l'historique existant (par date) : on accumule au lieu d'écraser.
    for e in sleep_entries:
        by_date[e["date"]] = e  # les valeurs fraîches priment
    merged = sorted(by_date.values(), key=lambda x: x["date"], reverse=True)
    with open(SLEEP_OUT, "w", encoding="utf-8") as f:
        json.dump(merged, f, ensure_ascii=False, indent=2)
    print(f"💾 {len(sleep_entries)} nuits mises à jour, {len(merged)} au total → {SLEEP_OUT}")


if __name__ == "__main__":
    main()
