"""
Enrichissement des séances : détail des séries (Musculation) et traces GPS.

Ces deux données coûtent un appel API par activité, alors que la liste des
activités n'en coûte qu'un pour tout le monde. Garmin rate-limite agressivement
les IP cloud (GitHub Actions) : on ne récupère donc **que** ce qui manque, une
seule fois par activité, et on plafonne le nombre d'appels par exécution.
Ce qui n'a pas pu être récupéré le sera au run suivant.
"""

import json
import math
import os
import time

TRACKS_OUT = os.path.join(os.path.dirname(__file__), "data", "tracks.json")

# Plafond d'appels d'enrichissement par exécution. Deux runs par jour suffisent
# largement à absorber le rythme réel (quelques séances par semaine), et le
# backfill initial s'étale sur quelques jours sans jamais déclencher de 429.
MAX_CALLS_PER_RUN = 25
THROTTLE_S = 1.2


# ── Musculation ───────────────────────────────────────────────────────────────

# Catégories Garmin → libellé français. Le fallback prettifie le code inconnu,
# donc cette table n'a pas besoin d'être exhaustive.
EXERCISE_LABELS = {
    "PUSH_UP":            "Pompes",
    "BENCH_PRESS":        "Développé couché",
    "CRUNCH":             "Crunch",
    "SIT_UP":             "Relevé de buste",
    "PLANK":              "Gainage",
    "LEG_RAISE":          "Relevé de jambes",
    "HIP_RAISE":          "Pont fessier",
    "RUSSIAN_TWIST":      "Russian twist",
    "SQUAT":              "Squats",
    "LUNGE":              "Fentes",
    "BURPEE":             "Burpees",
    "PULL_UP":            "Tractions",
    "CHIN_UP":            "Tractions supination",
    "ROW":                "Rowing",
    "CURL":               "Curl biceps",
    "TRICEPS_EXTENSION":  "Extension triceps",
    "SHOULDER_PRESS":     "Développé épaules",
    "LATERAL_RAISE":      "Élévations latérales",
    "DEADLIFT":           "Soulevé de terre",
    "CALF_RAISE":         "Mollets",
    "FLYE":               "Écartés",
    "SHRUG":              "Shrugs",
    "CARDIO":             "Cardio",
    "UNKNOWN":            "Exercice",
    "REST":               "Repos",
}

# Regroupements suivis dans les stats de progression.
MUSCLE_GROUPS = {
    "pompes": {"PUSH_UP"},
    "abdos":  {"CRUNCH", "SIT_UP", "PLANK", "LEG_RAISE", "RUSSIAN_TWIST", "HIP_RAISE"},
    "jambes": {"SQUAT", "LUNGE", "DEADLIFT", "CALF_RAISE"},
    "tirage": {"PULL_UP", "CHIN_UP", "ROW"},
}


def exercise_label(code: str) -> str:
    if code in EXERCISE_LABELS:
        return EXERCISE_LABELS[code]
    return (code or "Exercice").replace("_", " ").capitalize()


def group_of(code: str):
    for group, codes in MUSCLE_GROUPS.items():
        if code in codes:
            return group
    return None


def parse_exercise_sets(raw: dict) -> dict:
    """Agrège la réponse /exerciseSets en un résumé par exercice.

    Garmin renvoie une ligne par série, alternant séries actives et repos.
    Les exercices au poids du corps comptent des répétitions ; le gainage est
    mesuré en durée — on garde les deux, sans les mélanger.
    """
    sets = (raw or {}).get("exerciseSets") or []
    by_code = {}

    for st in sets:
        if (st.get("setType") or "").upper() != "ACTIVE":
            continue  # on ignore les blocs de repos
        exercises = st.get("exercises") or []
        if not exercises:
            continue
        # Garmin propose plusieurs candidats avec une probabilité ; on prend
        # le plus probable, et à défaut le premier.
        best = max(exercises, key=lambda e: e.get("probability") or 0)
        code = (best.get("category") or best.get("name") or "UNKNOWN").upper()

        reps = st.get("repetitionCount") or 0
        dur = st.get("duration") or 0
        weight = st.get("weight")  # en grammes chez Garmin

        e = by_code.setdefault(code, {
            "code": code, "label": exercise_label(code), "group": group_of(code),
            "sets": 0, "reps": 0, "seconds": 0, "reps_detail": [], "weight_kg": None,
        })
        e["sets"] += 1
        if reps:
            e["reps"] += int(reps)
            e["reps_detail"].append(int(reps))
        if dur:
            e["seconds"] += int(round(dur))
        if weight:
            kg = round(weight / 1000, 1)
            e["weight_kg"] = max(e["weight_kg"] or 0, kg)

    exercises = sorted(by_code.values(), key=lambda e: (-e["reps"], -e["seconds"]))
    return {
        "exercises": exercises,
        "reps_total": sum(e["reps"] for e in exercises),
        "sets_total": sum(e["sets"] for e in exercises),
    }


def activity_id(session: dict):
    """Identifiant d'activité Garmin utilisable pour les appels /details.

    Les séances importées par CSV ont un id synthétique (« g_2025-11-16_29 »)
    et non l'activityId Garmin : elles ne sont pas enrichissables tant que
    relink_garmin_ids.py ne leur a pas rattaché un `garmin_id`.
    """
    gid = session.get("garmin_id")
    if gid and str(gid).isdigit():
        return str(gid)
    sid = str(session.get("id") or "")
    raw = sid[2:] if sid.startswith("g_") else sid
    return raw if raw.isdigit() else None


def fetch_exercise_sets(api, activity_id: str):
    """Détail des séries d'une activité Musculation. None si indisponible."""
    raw_id = activity_id[2:] if activity_id.startswith("g_") else activity_id
    if not raw_id.isdigit():
        return None
    try:
        raw = api.get_activity_exercise_sets(raw_id)
    except Exception as e:
        if "429" in str(e):
            raise
        return None
    parsed = parse_exercise_sets(raw)
    return parsed if parsed["exercises"] else None


# ── Traces GPS ────────────────────────────────────────────────────────────────

def _perp_distance(pt, start, end):
    """Distance perpendiculaire d'un point au segment, en degrés projetés.

    La longitude est resserrée par cos(latitude) pour que la simplification
    ne déforme pas les traces est-ouest.
    """
    kx = math.cos(math.radians(start[0]))
    x0, y0 = pt[1] * kx, pt[0]
    x1, y1 = start[1] * kx, start[0]
    x2, y2 = end[1] * kx, end[0]
    dx, dy = x2 - x1, y2 - y1
    if dx == 0 and dy == 0:
        return math.hypot(x0 - x1, y0 - y1)
    t = max(0, min(1, ((x0 - x1) * dx + (y0 - y1) * dy) / (dx * dx + dy * dy)))
    return math.hypot(x0 - (x1 + t * dx), y0 - (y1 + t * dy))


def simplify(points, tolerance):
    """Douglas-Peucker itératif (pas de récursion : certaines traces ont 20 000 points)."""
    if len(points) < 3:
        return list(points)
    keep = [False] * len(points)
    keep[0] = keep[-1] = True
    stack = [(0, len(points) - 1)]
    while stack:
        first, last = stack.pop()
        if last <= first + 1:
            continue
        max_d, idx = -1, first
        for i in range(first + 1, last):
            d = _perp_distance(points[i], points[first], points[last])
            if d > max_d:
                max_d, idx = d, i
        if max_d > tolerance:
            keep[idx] = True
            stack.append((first, idx))
            stack.append((idx, last))
    return [p for p, k in zip(points, keep) if k]


def simplify_to(points, target=250):
    """Simplifie jusqu'à approcher `target` points, en ajustant la tolérance."""
    if len(points) <= target:
        return list(points)
    lo, hi = 0.0, 0.05
    best = points
    for _ in range(18):
        mid = (lo + hi) / 2
        out = simplify(points, mid)
        if len(out) > target:
            lo = mid
        else:
            best, hi = out, mid
    return best


def _haversine_km(a, b):
    R = 6371.0
    la1, lo1, la2, lo2 = map(math.radians, (a[0], a[1], b[0], b[1]))
    h = math.sin((la2 - la1) / 2) ** 2 + math.cos(la1) * math.cos(la2) * math.sin((lo2 - lo1) / 2) ** 2
    return 2 * R * math.asin(math.sqrt(h))


def _cumulative_km(points):
    out, total = [0.0], 0.0
    for i in range(1, len(points)):
        total += _haversine_km(points[i - 1], points[i])
        out.append(total)
    return out


def elevation_profile(points, elevations, samples=120):
    """Profil altimétrique échantillonné à pas de distance constant.

    Volontairement indépendant de la simplification géométrique : un sentier
    peut être rectiligne (donc réduit à deux points par Douglas-Peucker) tout
    en ayant un dénivelé important. Le profil se lit en fonction de la
    distance parcourue, pas de la forme du tracé.
    """
    clean = [(p, e) for p, e in zip(points, elevations) if e is not None]
    if len(clean) < 4:
        return None
    pts = [c[0] for c in clean]
    eles = [c[1] for c in clean]
    cum = _cumulative_km(pts)
    total = cum[-1]
    if total <= 0:
        return None

    out, j = [], 0
    for i in range(samples):
        target = total * i / (samples - 1)
        while j < len(cum) - 2 and cum[j + 1] < target:
            j += 1
        span = cum[j + 1] - cum[j]
        t = 0 if span <= 0 else (target - cum[j]) / span
        out.append(round(eles[j] + t * (eles[j + 1] - eles[j])))
    return {"ele": out, "dist_km": round(total, 2)}


def _elevation_stats(elevations, threshold=3.0):
    """D+ / D- cumulés, avec un seuil qui absorbe le bruit du baromètre."""
    clean = [e for e in elevations if e is not None]
    if len(clean) < 2:
        return None, None, None, None
    gain = loss = 0.0
    ref = clean[0]
    for e in clean[1:]:
        delta = e - ref
        if abs(delta) < threshold:
            continue
        if delta > 0:
            gain += delta
        else:
            loss -= delta
        ref = e
    return int(gain), int(loss), int(min(clean)), int(max(clean))


def parse_track(raw: dict, target_points=250):
    """Extrait une trace exploitable de la réponse /details."""
    metrics = (raw or {}).get("activityDetailMetrics") or []
    descriptors = (raw or {}).get("metricDescriptors") or []
    if not metrics or not descriptors:
        return None

    idx = {}
    for d in descriptors:
        key = (d.get("key") or "").lower()
        if key in ("directlatitude", "directlongitude", "directelevation"):
            idx[key] = d.get("metricsIndex")
    if "directlatitude" not in idx or "directlongitude" not in idx:
        return None

    pts, eles = [], []
    for m in metrics:
        vals = m.get("metrics") or []
        try:
            lat = vals[idx["directlatitude"]]
            lon = vals[idx["directlongitude"]]
        except (IndexError, TypeError):
            continue
        if lat is None or lon is None:
            continue
        pts.append((lat, lon))
        ele = None
        if "directelevation" in idx:
            try:
                ele = vals[idx["directelevation"]]
            except (IndexError, TypeError):
                ele = None
        eles.append(ele)

    if len(pts) < 10:
        return None

    # Deux échantillonnages distincts, pour deux usages distincts :
    #  · la géométrie du tracé (carte)   → Douglas-Peucker
    #  · le profil altimétrique (courbe) → pas de distance constant
    kept = simplify_to(pts, target_points)
    profile = elevation_profile(pts, eles)
    gain, loss, ele_min, ele_max = _elevation_stats(eles)

    lats = [p[0] for p in kept]
    lons = [p[1] for p in kept]

    return {
        "pts": [[round(p[0], 5), round(p[1], 5)] for p in kept],
        "profile": profile["ele"] if profile else None,
        "dist_km": profile["dist_km"] if profile else round(_cumulative_km(pts)[-1], 2),
        "bbox": [min(lats), min(lons), max(lats), max(lons)],
        "gain_m": gain,
        "loss_m": loss,
        "ele_min": ele_min,
        "ele_max": ele_max,
        "points_src": len(pts),
    }


def fetch_track(api, activity_id: str, target_points=250):
    """Trace GPS simplifiée d'une activité. None si pas de GPS."""
    raw_id = activity_id[2:] if activity_id.startswith("g_") else activity_id
    if not raw_id.isdigit():
        return None
    try:
        # maxpoly plafonne déjà côté serveur : moins de données à transférer.
        raw = api.get_activity_details(raw_id, maxchart=0, maxpoly=2000)
    except Exception as e:
        if "429" in str(e):
            raise
        return None
    return parse_track(raw, target_points)


# ── Persistance des traces ────────────────────────────────────────────────────

def load_tracks() -> dict:
    try:
        with open(TRACKS_OUT, encoding="utf-8") as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return {}


def save_tracks(tracks: dict):
    os.makedirs(os.path.dirname(TRACKS_OUT), exist_ok=True)
    with open(TRACKS_OUT, "w", encoding="utf-8") as f:
        json.dump(tracks, f, ensure_ascii=False, separators=(",", ":"))


# ── Orchestration ─────────────────────────────────────────────────────────────

def enrich(api, sessions, gps_types, strength_types, max_calls=MAX_CALLS_PER_RUN):
    """Complète les séances qui n'ont pas encore leur détail. Modifie `sessions`.

    Retourne (nb_muscu, nb_traces, budget_epuise).
    """
    tracks = load_tracks()
    calls = 0
    n_str = n_gps = n_skipped = 0
    exhausted = False

    # Les plus récentes d'abord : si le budget saute, on a enrichi ce qui compte.
    ordered = sorted(sessions, key=lambda s: s.get("date") or "", reverse=True)

    for s in ordered:
        if calls >= max_calls:
            exhausted = True
            break
        sid, stype = s.get("id"), s.get("type")
        if not sid:
            continue
        if stype not in strength_types and stype not in gps_types:
            continue

        # Sans activityId Garmin, aucun appel ne peut aboutir : on n'entame
        # pas le budget pour rien (c'est le rôle de relink_garmin_ids.py).
        aid = activity_id(s)
        if not aid:
            n_skipped += 1
            continue

        try:
            if stype in strength_types and "exercises" not in s:
                data = fetch_exercise_sets(api, aid)
                calls += 1
                # On marque même quand c'est vide : sans ça on rappellerait
                # l'API à chaque run pour une séance sans détail exploitable.
                s["exercises"] = data["exercises"] if data else []
                if data:
                    s["reps_total"] = data["reps_total"]
                    s["sets_total"] = data["sets_total"]
                    n_str += 1
                time.sleep(THROTTLE_S)

            elif stype in gps_types and sid not in tracks:
                tr = fetch_track(api, aid)
                calls += 1
                tracks[sid] = tr or {}
                if tr:
                    if tr.get("gain_m") and not s.get("elevation_m"):
                        s["elevation_m"] = tr["gain_m"]
                    n_gps += 1
                time.sleep(THROTTLE_S)

        except Exception as e:
            if "429" in str(e):
                print(f"ℹ️  Rate limit Garmin pendant l'enrichissement — "
                      f"on s'arrête là, reprise au prochain run ({calls} appels).")
                exhausted = True
                break
            continue

    save_tracks(tracks)
    if n_skipped:
        print(f"   ℹ️  {n_skipped} séance(s) sans activityId Garmin (import CSV) — "
              f"lance `python relink_garmin_ids.py --apply` pour les rattacher.")
    return n_str, n_gps, exhausted
