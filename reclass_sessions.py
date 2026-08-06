"""
Réparation rétroactive de l'historique des séances.

Deux corrections :

1. Types — les randos, VTT, marches et HIIT importés avant l'ajout de ces
   types sont tombés dans « autre » (le typeKey Garmin n'était pas mappé).
   On rejoue les règles de nommage de session_types.py.

2. Allures — recalculées depuis distance ÷ durée pour la course à pied,
   supprimées ailleurs. La colonne « allure » des exports CSV est peu fiable
   (jusqu'à 2:33/km enregistré pour une sortie réellement à 7:22/km), et sur
   une rando cette métrique n'informe pas : elle trompe.

Usage :
    python reclass_sessions.py            # aperçu, n'écrit rien
    python reclass_sessions.py --apply    # applique et sauvegarde

Idempotent : le relancer après application ne change plus rien.
"""

import argparse
import json
import os
import shutil
from collections import Counter

from session_types import NAME_RULES, label, refine

SESSIONS = os.path.join(os.path.dirname(__file__), "data", "sessions.json")

# Paire indoor/outdoor que le nom ne permet pas de trancher de façon fiable :
# le typeKey Garmin d'origine fait autorité, on n'y touche pas.
TRUSTED_PAIRS = [{"course_ext", "course_tapis"}]

# L'allure n'a de sens que pour la course à pied. Ailleurs (rando, VTT,
# marche), c'est la vitesse ou la distance qui parlent — et les valeurs
# importées y sont notoirement fausses. On les supprime plutôt que de les
# corriger : une donnée absente vaut mieux qu'une donnée trompeuse.
PACE_TYPES = {"course_ext", "course_tapis"}

# Écart au-delà duquel on signale la correction dans l'aperçu (en secondes).
PACE_REPORT_DELTA = 20


def bad_paces(sessions):
    """Allures à corriger : (séance, nouvelle_valeur_ou_None).

    L'allure est une donnée *dérivée* : distance ÷ durée. La stocker n'apporte
    rien et l'expose à la corruption. Mesuré sur cet historique, les séances
    venant de l'API Garmin ont un rapport allure_stockée/allure_calculée de
    exactement 1,00 — recalculer ne les change donc pas — tandis que les
    imports CSV descendent jusqu'à 0,35 (une sortie à 7:22/km enregistrée
    à 2:33/km). On recalcule systématiquement : c'est sans effet sur les
    données saines et ça répare les autres, sans seuil arbitraire.
    """
    out = []
    for s in sessions:
        pace = s.get("pace_sec_km")
        if not pace:
            continue
        if s.get("type") not in PACE_TYPES:
            out.append((s, None))          # métrique hors sujet → on retire
            continue
        dist, dur = s.get("distance_km"), s.get("duration_min")
        if not dist or not dur:
            continue                       # rien pour recalculer : on ne touche pas
        elapsed = round(dur * 60 / dist)
        if elapsed != pace:
            out.append((s, elapsed))
    return out


def type_from_title(title: str, duration_min=None):
    """Type déduit du seul titre de l'activité, ou None si aucune règle ne matche."""
    name = (title or "").lower()
    for needles, target in NAME_RULES:
        if any(n in name for n in needles):
            return refine(target, duration_min)
    return None


def should_reclass(current: str, proposed: str) -> bool:
    if not proposed or proposed == current:
        return False
    for pair in TRUSTED_PAIRS:
        if current in pair and proposed in pair:
            return False
    return True


def main():
    ap = argparse.ArgumentParser(description="Reclasse l'historique des séances")
    ap.add_argument("--apply", action="store_true", help="Écrit les changements (sinon : aperçu seul)")
    args = ap.parse_args()

    with open(SESSIONS, encoding="utf-8") as f:
        sessions = json.load(f)

    changes = []
    for s in sessions:
        proposed = type_from_title(s.get("title"), s.get("duration_min"))
        if should_reclass(s.get("type"), proposed):
            changes.append((s, s["type"], proposed))

    paces = bad_paces(sessions)

    if not changes and not paces:
        print("✅ Rien à réparer — l'historique est déjà à jour.")
        return

    if changes:
        moves = Counter((old, new) for _, old, new in changes)
        print(f"📋 {len(changes)} séance(s) à reclasser sur {len(sessions)} :\n")
        for (old, new), n in moves.most_common():
            print(f"   {label(old):<14} → {label(new):<14} {n:>3} séance(s)")
        print("\n   Exemples :")
        for sess, old, new in changes[:8]:
            print(f"   · {sess['date']}  {sess['title'][:42]:<42} {old} → {new}")

    if paces:
        drop = [x for x in paces if x[1] is None]
        fix = [x for x in paces if x[1] is not None]
        print(f"\n⏱️  {len(paces)} allure(s) à corriger :")
        if drop:
            print(f"   · {len(drop)} supprimée(s) — allure hors sujet "
                  f"(rando, VTT, marche…) et valeurs peu fiables")
        big = [x for x in fix if abs(x[0]['pace_sec_km'] - x[1]) >= PACE_REPORT_DELTA]
        if fix:
            print(f"   · {len(fix)} recalculée(s) depuis distance ÷ durée")
        for sess, calc in big[:10]:
            cur = sess['pace_sec_km']
            print(f"     {sess['date']}  {sess['title'][:30]:<30} "
                  f"{cur//60}:{cur%60:02d} → {calc//60}:{calc%60:02d}")

    if not args.apply:
        print("\nℹ️  Aperçu seul. Relance avec --apply pour écrire.")
        return

    shutil.copyfile(SESSIONS, SESSIONS + ".bak")
    for sess, _, new in changes:
        sess["type"] = new
    for sess, calc in paces:
        sess["pace_sec_km"] = calc          # None si non recalculable
    with open(SESSIONS, "w", encoding="utf-8") as f:
        json.dump(sessions, f, ensure_ascii=False, indent=2)

    print(f"\n💾 {len(changes)} séance(s) reclassée(s), {len(paces)} allure(s) corrigée(s) → {SESSIONS}")
    print(f"   Sauvegarde de l'ancien fichier : {os.path.basename(SESSIONS)}.bak")
    print("\n   Répartition après reclassement :")
    for t, n in Counter(s["type"] for s in sessions).most_common():
        print(f"   {label(t):<14} {n:>3}")


if __name__ == "__main__":
    main()
