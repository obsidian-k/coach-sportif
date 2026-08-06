"""
Rattache les séances importées par CSV à leur activité Garmin.

Les séances importées depuis un export CSV portent un id synthétique
(« g_2025-11-16_29 ») : sans l'activityId Garmin, impossible de récupérer
leur trace GPS ni le détail de leurs séries. Ce script interroge l'API sur
tout l'historique et apparie chaque séance orpheline à une activité réelle
par date + durée, puis écrit un champ `garmin_id`.

L'id d'origine n'est jamais modifié : il sert de clé de déduplication et
peut être référencé ailleurs. On ajoute, on ne remplace pas.

Usage :
    python relink_garmin_ids.py            # aperçu
    python relink_garmin_ids.py --apply    # écrit les garmin_id
"""

import argparse
import json
import os
import shutil
import sys
from datetime import datetime, timezone

try:
    from garminconnect import Garmin
    from dotenv import load_dotenv
except ImportError:
    print("❌ Dépendances manquantes : pip install garminconnect python-dotenv")
    sys.exit(1)

from garmin_to_sessions import login_with_retry, sec_to_min
from session_types import GPS_TYPES, STRENGTH_TYPES, map_type

SESSIONS = os.path.join(os.path.dirname(__file__), "data", "sessions.json")

# Tolérance d'appariement sur la durée. Les exports CSV arrondissent, et la
# durée « mouvement » diffère de la durée totale : 2 min d'écart est réaliste
# sans risquer de confondre deux séances distinctes du même jour.
DURATION_TOLERANCE_MIN = 2.0


def candidates_for(session, by_date):
    """Activités Garmin plausibles pour une séance, de la meilleure à la pire."""
    same_day = by_date.get(session["date"], [])
    if not same_day:
        return []
    dur = session.get("duration_min")
    scored = []
    for act in same_day:
        # Le type doit concorder : deux activités le même jour, c'est courant.
        if act["type"] != session.get("type"):
            continue
        if dur and act["duration_min"]:
            delta = abs(act["duration_min"] - dur)
            if delta > DURATION_TOLERANCE_MIN:
                continue
            scored.append((delta, act))
        else:
            scored.append((DURATION_TOLERANCE_MIN, act))
    scored.sort(key=lambda x: x[0])
    return [a for _, a in scored]


def main():
    ap = argparse.ArgumentParser(description="Rattache les séances CSV à leur activité Garmin")
    ap.add_argument("--apply", action="store_true", help="Écrit les garmin_id (sinon : aperçu)")
    ap.add_argument("--since", default="2018-01-01", help="Date de début de la recherche")
    args = ap.parse_args()

    with open(SESSIONS, encoding="utf-8") as f:
        sessions = json.load(f)

    orphans = [
        s for s in sessions
        if (s.get("type") in GPS_TYPES or s.get("type") in STRENGTH_TYPES)
        and not s.get("garmin_id")
        and not str(s.get("id", ""))[2:].isdigit()
    ]
    if not orphans:
        print("✅ Toutes les séances concernées ont déjà un activityId Garmin.")
        return

    print(f"🔗 {len(orphans)} séance(s) à rattacher (randos, VTT, marches, muscu).")

    email = os.environ.get("GARMIN_EMAIL")
    password = os.environ.get("GARMIN_PASSWORD")
    if not email or not password:
        load_dotenv(os.path.join(os.path.dirname(__file__), "Mcp", "garmin_mcp-main", ".env"), override=True)
        email, password = os.getenv("GARMIN_EMAIL"), os.getenv("GARMIN_PASSWORD")
    if not email or not password:
        print("❌ GARMIN_EMAIL / GARMIN_PASSWORD non définis.")
        sys.exit(1)

    print(f"🔗 Connexion Garmin Connect ({email})…")
    api, fail = login_with_retry(email, password)
    if api is None:
        print("❌ Connexion impossible — réessaie plus tard.")
        sys.exit(0 if fail == "rate_limit" else 1)

    today = datetime.now(tz=timezone.utc).strftime("%Y-%m-%d")
    print(f"📥 Récupération de l'historique Garmin depuis {args.since}…")
    try:
        activities = api.get_activities_by_date(args.since, today)
    except Exception as e:
        print(f"❌ Erreur récupération : {e}")
        sys.exit(0 if "429" in str(e) else 1)
    print(f"✅ {len(activities)} activités reçues")

    by_date = {}
    for a in activities:
        d = (a.get("startTimeLocal") or "")[:10]
        aid = str(a.get("activityId") or "")
        if not d or not aid.isdigit():
            continue
        dur = sec_to_min(a.get("duration") or a.get("movingDuration"))
        by_date.setdefault(d, []).append({
            "id": aid,
            "type": map_type(a.get("activityType", {}).get("typeKey", "other"),
                             a.get("activityName", ""), dur),
            "duration_min": dur,
            "name": a.get("activityName", ""),
        })

    used = {s["garmin_id"] for s in sessions if s.get("garmin_id")}
    matched, ambiguous, unmatched = [], [], []

    for s in orphans:
        cands = [c for c in candidates_for(s, by_date) if c["id"] not in used]
        if not cands:
            unmatched.append(s)
        else:
            best = cands[0]
            used.add(best["id"])
            matched.append((s, best))
            if len(cands) > 1:
                ambiguous.append((s, cands))

    print(f"\n📋 {len(matched)} appariée(s) · {len(unmatched)} sans correspondance")
    for s, a in matched[:10]:
        print(f"   ✓ {s['date']}  {s['title'][:34]:<34} {s['duration_min']}min → {a['id']}")
    if ambiguous:
        print(f"\n⚠️  {len(ambiguous)} cas avec plusieurs candidats (le plus proche en durée a été retenu) :")
        for s, cs in ambiguous[:5]:
            print(f"   {s['date']} {s['title'][:28]:<28} → " +
                  ", ".join(f"{c['id']}({c['duration_min']}min)" for c in cs[:3]))
    if unmatched:
        print(f"\n○ Sans correspondance (activité supprimée de Garmin, ou hors historique) :")
        for s in unmatched[:8]:
            print(f"   {s['date']} {s['title'][:34]:<34} {s.get('duration_min')}min")

    if not args.apply:
        print("\nℹ️  Aperçu seul. Relance avec --apply pour écrire.")
        return

    shutil.copyfile(SESSIONS, SESSIONS + ".bak")
    for s, a in matched:
        s["garmin_id"] = a["id"]
    with open(SESSIONS, "w", encoding="utf-8") as f:
        json.dump(sessions, f, ensure_ascii=False, indent=2)
    print(f"\n💾 {len(matched)} garmin_id écrit(s) → {SESSIONS}")
    print("   Lance maintenant `python garmin_to_sessions.py` pour récupérer traces et séries.")


if __name__ == "__main__":
    main()
