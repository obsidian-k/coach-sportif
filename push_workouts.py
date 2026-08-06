"""
Envoie les séances de la semaine sur la montre Garmin, planifiées au bon jour.

Enchaînement :
    node build_week.js   → le plan de la semaine (étapes structurées)
    garmin_workout.py    → conversion au format Garmin
    ici                  → upload + planification

Sur la montre : Entraînement → la séance du jour est là, elle annonce chaque
bloc, vibre aux transitions et affiche l'allure cible. Rien à mémoriser.

Usage :
    python push_workouts.py              # aperçu, n'envoie rien
    python push_workouts.py --apply      # envoie et planifie

Idempotent : une séance déjà envoyée pour une date donnée est remplacée,
jamais dupliquée.
"""

import argparse
import json
import os
import subprocess
import sys

try:
    from garminconnect import Garmin
    from dotenv import load_dotenv
except ImportError:
    print("❌ Dépendances manquantes : pip install garminconnect python-dotenv")
    sys.exit(1)

from garmin_workout import build_workout, summarize
from garmin_to_sessions import login_with_retry, EXIT_TRANSIENT

ROOT = os.path.dirname(os.path.abspath(__file__))
STATE = os.path.join(ROOT, "data", "pushed_workouts.json")

# Préfixe des séances créées par le coach : sert à les reconnaître et à les
# remplacer sans toucher aux entraînements créés à la main dans Garmin.
NAME_PREFIX = "Coach"


def build_week(ref_date=None, weather=True):
    """Fait tourner le moteur (Node) et récupère le plan de la semaine."""
    cmd = ["node", os.path.join(ROOT, "build_week.js")]
    if ref_date:
        cmd += ["--date", ref_date]
    if not weather:
        cmd.append("--no-weather")
    r = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
    if r.returncode != 0:
        raise RuntimeError(f"build_week.js a échoué : {r.stderr.strip()}")
    if r.stderr.strip():
        print(f"   ℹ️  {r.stderr.strip()}")
    return json.loads(r.stdout)


def load_state():
    try:
        with open(STATE, encoding="utf-8") as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return {}


def save_state(state):
    os.makedirs(os.path.dirname(STATE), exist_ok=True)
    with open(STATE, "w", encoding="utf-8") as f:
        json.dump(state, f, ensure_ascii=False, indent=2)


def workout_name(day):
    return f"{NAME_PREFIX} · {day['session']['title']}"


def remove_previous(api, state, date):
    """Supprime la séance déjà poussée pour cette date, s'il y en a une."""
    prev = state.get(date)
    if not prev:
        return
    try:
        api.delete_workout(prev["workout_id"])
    except Exception:
        # Déjà supprimée côté Garmin, ou plus accessible : sans conséquence,
        # on continue et on écrasera l'entrée d'état.
        pass


def main():
    ap = argparse.ArgumentParser(description="Envoie les séances du coach sur la montre")
    ap.add_argument("--apply", action="store_true", help="Envoie réellement (sinon : aperçu)")
    ap.add_argument("--date", help="Date de référence (défaut : aujourd'hui)")
    ap.add_argument("--only", help="N'envoyer que la séance de cette date (AAAA-MM-JJ)")
    ap.add_argument("--no-weather", action="store_true", help="Ignorer la météo")
    args = ap.parse_args()

    try:
        week = build_week(args.date, weather=not args.no_weather)
    except Exception as e:
        print(f"❌ {e}")
        sys.exit(1)

    print(f"📅 Semaine du {week['ref']} — forme : {week['form']['label']}\n")

    days = week["days"]
    if args.only:
        days = [d for d in days if d["date"] == args.only]
        if not days:
            print(f"Aucune séance prévue le {args.only} — rien à envoyer.")
            return
        print(f"➡️  Envoi de la seule séance du {args.only}\n")

    planned = []
    for day in days:
        w = build_workout(day["session"], name=workout_name(day))
        print(f"── {day['date']} ──")
        if not w:
            print(f"   ○ {day['session']['title']} — pas transposable sur la montre "
                  f"(séance en répétitions), elle reste dans l'app.\n")
            continue
        print("   " + summarize(w).replace("\n", "\n   ") + "\n")
        planned.append((day["date"], w))

    if not planned:
        print("Rien à envoyer cette semaine.")
        return

    if not args.apply:
        print("ℹ️  Aperçu seul. Relance avec --apply pour envoyer sur la montre.")
        return

    email = os.environ.get("GARMIN_EMAIL")
    password = os.environ.get("GARMIN_PASSWORD")
    if not email or not password:
        load_dotenv(os.path.join(ROOT, "Mcp", "garmin_mcp-main", ".env"), override=True)
        email, password = os.getenv("GARMIN_EMAIL"), os.getenv("GARMIN_PASSWORD")
    if not email or not password:
        print("❌ GARMIN_EMAIL / GARMIN_PASSWORD non définis.")
        sys.exit(1)

    print(f"🔗 Connexion Garmin Connect ({email})…")
    api, fail = login_with_retry(email, password)
    if api is None:
        if fail == "rate_limit":
            print("ℹ️  Rate limit Garmin — envoi reporté au prochain run. Pas d'échec CI.")
            sys.exit(EXIT_TRANSIENT)
        sys.exit(1)

    state = load_state()
    sent = 0
    for date, w in planned:
        try:
            remove_previous(api, state, date)
            created = api.upload_workout(w)
            wid = created.get("workoutId") if isinstance(created, dict) else None
            if not wid:
                print(f"   ⚠️  {date} : réponse inattendue de Garmin, séance non planifiée.")
                continue
            api.schedule_workout(wid, date)
            state[date] = {"workout_id": wid, "name": w["workoutName"]}
            sent += 1
            print(f"   ✅ {date} — « {w['workoutName']} » envoyée et planifiée (id {wid})")
        except Exception as e:
            if "429" in str(e):
                print("ℹ️  Rate limit Garmin — on s'arrête là, reprise au prochain run.")
                break
            print(f"   ⚠️  {date} : échec de l'envoi — {e}")

    save_state(state)
    print(f"\n💾 {sent} séance(s) sur la montre. "
          f"Sur Garmin : Entraînement → Entraînements du jour.")


if __name__ == "__main__":
    main()
