"""
Conversion des séances du coach en entraînements structurés Garmin.

Le but : ne plus rien avoir à mémoriser. La séance part sur la montre,
planifiée au bon jour ; elle annonce chaque bloc, vibre aux transitions et
affiche l'allure cible.

Portée : la course (avec cibles d'allure) et les séances rythmées par le
temps (sac, corde, rameur, vélo). Le renforcement compté en répétitions n'est
pas transposable — la montre ne sait pas guider « 12 pompes » — ces séances
restent affichées dans l'app et ne sont pas envoyées.
"""

import json

# ── Vocabulaire Garmin ────────────────────────────────────────────────────────
# Identifiants de l'API Garmin Connect (workout-service). Ce sont des constantes
# du service, pas des valeurs arbitraires.
SPORT_TYPES = {
    "running": {"sportTypeId": 1, "sportTypeKey": "running"},
    "cycling": {"sportTypeId": 2, "sportTypeKey": "cycling"},
    "other":   {"sportTypeId": 4, "sportTypeKey": "other"},
}

STEP_TYPES = {
    "warmup":    {"stepTypeId": 1, "stepTypeKey": "warmup"},
    "cooldown":  {"stepTypeId": 2, "stepTypeKey": "cooldown"},
    "interval":  {"stepTypeId": 3, "stepTypeKey": "interval"},
    "recovery":  {"stepTypeId": 4, "stepTypeKey": "recovery"},
    "rest":      {"stepTypeId": 5, "stepTypeKey": "rest"},
    "repeat":    {"stepTypeId": 6, "stepTypeKey": "repeat"},
}

END_CONDITIONS = {
    "time":     {"conditionTypeId": 2, "conditionTypeKey": "time"},
    "distance": {"conditionTypeId": 3, "conditionTypeKey": "distance"},
    "lap":      {"conditionTypeId": 1, "conditionTypeKey": "lap.button"},
    "iterations": {"conditionTypeId": 7, "conditionTypeKey": "iterations"},
}

PACE_TARGET = {"workoutTargetTypeId": 6, "workoutTargetTypeKey": "pace.zone"}
NO_TARGET = {"workoutTargetTypeId": 1, "workoutTargetTypeKey": "no.target"}

# Type de séance interne → sport Garmin.
SPORT_BY_TYPE = {
    "course_ext": "running",
    "course_tapis": "running",
    "velo": "cycling",
    "vtt": "cycling",
    "rameur": "other",
    "sac": "other",
    "corde": "other",
    "boxe": "other",
    "cardio": "other",
    "hiit": "other",
}

# Séances qu'on n'envoie pas : la montre ne sait pas guider des répétitions.
UNSUPPORTED_TYPES = {"renfo"}

# Le pas d'une étape « kind » interne vers le vocabulaire Garmin.
KIND_TO_STEP = {
    "warmup": "warmup",
    "work": "interval",
    "recovery": "recovery",
    "rest": "rest",
    "cooldown": "cooldown",
}


def _pace_to_mps(sec_per_km: float) -> float:
    """Allure (s/km) → vitesse (m/s), l'unité attendue par Garmin."""
    return 1000.0 / sec_per_km


def _leaf_step(step: dict, order: int) -> dict:
    """Une étape élémentaire au format Garmin."""
    out = {
        "type": "ExecutableStepDTO",
        "stepOrder": order,
        "stepType": STEP_TYPES[KIND_TO_STEP.get(step.get("kind"), "interval")],
        "childStepId": None,
        "description": step.get("label") or None,
        "targetType": NO_TARGET,
        "targetValueOne": None,
        "targetValueTwo": None,
    }

    if step.get("distanceKm"):
        out["endCondition"] = END_CONDITIONS["distance"]
        out["endConditionValue"] = float(step["distanceKm"]) * 1000.0   # mètres
    elif step.get("seconds"):
        out["endCondition"] = END_CONDITIONS["time"]
        out["endConditionValue"] = float(step["seconds"])
    else:
        # Répétitions ou étape libre : la montre attend un appui sur le bouton.
        out["endCondition"] = END_CONDITIONS["lap"]
        out["endConditionValue"] = None

    pace = step.get("paceTarget")
    if pace and len(pace) == 2:
        fast, slow = float(pace[0]), float(pace[1])
        # Garmin raisonne en vitesse : la borne basse est la plus lente.
        out["targetType"] = PACE_TARGET
        out["targetValueOne"] = round(_pace_to_mps(slow), 4)
        out["targetValueTwo"] = round(_pace_to_mps(fast), 4)

    return out


def _repeat_step(step: dict, order: int, child_start: int) -> dict:
    """Un bloc répété : Garmin l'exprime par une étape « repeat » qui englobe ses enfants."""
    children = []
    for i, child in enumerate(step.get("steps", [])):
        c = _leaf_step(child, child_start + i)
        c["childStepId"] = 1
        children.append(c)
    return {
        "type": "RepeatGroupDTO",
        "stepOrder": order,
        "stepType": STEP_TYPES["repeat"],
        "childStepId": 1,
        "numberOfIterations": int(step.get("repeat", 1)),
        "smartRepeat": False,
        "endCondition": END_CONDITIONS["iterations"],
        "endConditionValue": float(step.get("repeat", 1)),
        "workoutSteps": children,
    }


def build_workout(session: dict, name: str = None) -> dict:
    """Séance du coach → payload d'entraînement Garmin. None si non transposable."""
    stype = session.get("type")
    if stype in UNSUPPORTED_TYPES:
        return None
    steps = session.get("steps")
    if not steps:
        return None

    sport = SPORT_TYPES[SPORT_BY_TYPE.get(stype, "other")]

    garmin_steps = []
    order = 1
    for st in steps:
        if st.get("kind") == "interval" and st.get("steps"):
            # Les répétitions à compter (pompes, squats) ne se guident pas :
            # si le bloc n'a aucune étape minutée, on ne l'envoie pas.
            if not any(c.get("seconds") or c.get("distanceKm") for c in st["steps"]):
                continue
            garmin_steps.append(_repeat_step(st, order, order + 1))
            order += 1 + len(st["steps"])
        else:
            if not (st.get("seconds") or st.get("distanceKm")):
                continue
            garmin_steps.append(_leaf_step(st, order))
            order += 1

    if not garmin_steps:
        return None

    return {
        "sportType": sport,
        "workoutName": (name or session.get("title") or "Séance")[:80],
        "description": session.get("focus") or "",
        "workoutSegments": [{
            "segmentOrder": 1,
            "sportType": sport,
            "workoutSteps": garmin_steps,
        }],
    }


def summarize(workout: dict) -> str:
    """Résumé lisible d'un payload, pour les logs et les tests."""
    if not workout:
        return "(non transposable)"
    lines = [f"{workout['workoutName']}  [{workout['sportType']['sportTypeKey']}]"]
    for st in workout["workoutSegments"][0]["workoutSteps"]:
        if st["type"] == "RepeatGroupDTO":
            lines.append(f"  {st['numberOfIterations']} ×")
            for c in st["workoutSteps"]:
                lines.append("    " + _describe(c))
        else:
            lines.append("  " + _describe(st))
    return "\n".join(lines)


def _describe(step: dict) -> str:
    cond = step["endCondition"]["conditionTypeKey"]
    val = step.get("endConditionValue")
    if cond == "time":
        v = int(val)
        amount = f"{v} s" if v < 60 else (f"{v//60} min {v%60}s" if v % 60 else f"{v//60} min")
    elif cond == "distance":
        amount = f"{val/1000:g} km"
    else:
        amount = "libre"
    out = f"{step['stepType']['stepTypeKey']:<9} {amount}"
    if step.get("targetValueOne"):
        slow = 1000.0 / step["targetValueOne"]
        fast = 1000.0 / step["targetValueTwo"]
        out += f"  @ {int(fast)//60}:{int(fast)%60:02d}–{int(slow)//60}:{int(slow)%60:02d}/km"
    if step.get("description"):
        out += f"  — {step['description']}"
    return out


if __name__ == "__main__":
    import sys
    week = json.load(sys.stdin)
    for day in week["days"]:
        print(f"\n── {day['date']} ──")
        print(summarize(build_workout(day["session"])))
