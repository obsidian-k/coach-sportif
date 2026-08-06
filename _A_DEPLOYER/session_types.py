"""
Typage des séances — source de vérité unique.

Importé par garmin_to_sessions.py (sync quotidienne) et par
reclass_sessions.py (reclassement rétroactif de l'historique).
Aucune dépendance externe : ce module doit rester importable partout.
"""

# typeKey Garmin → type interne
TYPE_MAP = {
    "running":           "course_ext",
    "treadmill_running": "course_tapis",
    "trail_running":     "course_ext",
    "indoor_rowing":     "rameur",
    "rowing":            "rameur",
    "cycling":           "velo",
    "indoor_cycling":    "velo",
    "road_biking":       "velo",
    "mountain_biking":   "vtt",
    "gravel_cycling":    "vtt",
    "hiking":            "rando",
    "walking":           "marche",
    "casual_walking":    "marche",
    "speed_walking":     "marche",
    "boxing":            "boxe",
    "cardio_training":   "cardio",
    "hiit":              "hiit",
    "strength_training": "renfo",
    "indoor_cardio":     "cardio",
    "jump_rope":         "corde",
    "fitness_equipment": "cardio",
    "other":             "autre",
}

LABEL_MAP = {
    "course_ext":   "Course ext.",
    "course_tapis": "Course tapis",
    "rameur":       "Rameur",
    "velo":         "Vélo apprt.",
    "vtt":          "VTT",
    "rando":        "Randonnée",
    "marche":       "Marche",
    "boxe":         "Boxe (cours)",
    "sac":          "Sac de frappe",
    "corde":        "Corde à sauter",
    "renfo":        "Renforcement",
    "hiit":         "HIIT",
    "cardio":       "Cardio",
    "autre":        "Autre",
}

# Types dont on veut la trace GPS (activités d'extérieur avec un parcours).
GPS_TYPES = {"rando", "vtt", "marche"}

# Types pour lesquels on va chercher le détail des séries (Garmin Musculation).
STRENGTH_TYPES = {"renfo"}

# Règles nom → type, évaluées dans l'ordre. Le nom prime sur le typeKey :
# Garmin range beaucoup d'activités en "other" alors que le nom est explicite
# ("Liffré Randonnée", "Fontainebleau VTT", "Entraînement HIIT").
NAME_RULES = [
    (("corde", "jump rope"),                       "corde"),
    (("sac de frappe", "punching"),                "sac"),
    (("boxe", "boxing"),                           "boxe"),
    (("rando", "hiking", "trek"),                  "rando"),
    (("vtt", "mountain bik", "gravel"),            "vtt"),
    (("marche", "walking"),                        "marche"),
    (("hiit",),                                    "hiit"),
    (("muscu", "renfo", "strength", "pompes"),     "renfo"),
    (("rameur", "rowing"),                         "rameur"),
    (("tapis", "treadmill"),                       "course_tapis"),
    (("course", "running", "footing"),             "course_ext"),
    (("vélo", "velo", "cycling", "bike"),          "velo"),
]


# Un cours de boxe dure ~1 h ; en dessous c'est du sac à la maison, même si
# l'activité s'appelle « Boxe » ou « KickBoxing ».
BOXE_COURS_MIN = 50


def refine(session_type: str, duration_min) -> str:
    """Affinages qui dépendent de la durée et non du nom."""
    if session_type == "boxe" and duration_min and duration_min < BOXE_COURS_MIN:
        return "sac"
    return session_type


def map_type(garmin_type: str, activity_name: str, duration_min=None) -> str:
    """Type de séance depuis le typeKey Garmin, affiné par le nom puis la durée."""
    gt = (garmin_type or "").lower().replace(" ", "_")
    name = (activity_name or "").lower()
    for needles, target in NAME_RULES:
        if any(n in name for n in needles):
            return refine(target, duration_min)
    return refine(TYPE_MAP.get(gt, "autre"), duration_min)


def label(session_type: str) -> str:
    return LABEL_MAP.get(session_type, "Autre")
