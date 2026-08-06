# Coach Sportif — scripts de maintenance

Tout tourne sans intervention via GitHub Actions (`.github/workflows/garmin-sync.yml`,
deux passages par jour). Ce document ne sert que pour les opérations manuelles.

## À faire une fois : rattacher l'historique

Les randos, VTT et séances de muscu importés par CSV n'ont pas d'identifiant
d'activité Garmin — sans lui, impossible de récupérer leur trace GPS ni le
détail de leurs séries. Ce script les apparie aux activités réelles par date
et durée.

```bash
python relink_garmin_ids.py            # aperçu
python relink_garmin_ids.py --apply    # écrit les garmin_id
```

Ensuite, la sync récupérera progressivement traces et séries (25 activités
par passage, pour ne pas déclencher le rate limit Garmin — l'historique se
complète donc sur quelques jours).

## Réparer l'historique

Reclasse les types depuis le nom de l'activité et recalcule les allures.
Idempotent : sans effet si tout est déjà propre.

```bash
python reclass_sessions.py             # aperçu
python reclass_sessions.py --apply
```

## Synchronisation Garmin

```bash
python garmin_to_sessions.py --days 60 --sleep-days 14
python garmin_to_sessions.py --no-enrich          # sans traces ni séries
python garmin_to_sessions.py --enrich-max 50      # relever le plafond d'appels
```

## Séances sur la montre

```bash
python push_workouts.py                # aperçu de ce qui serait envoyé
python push_workouts.py --apply        # envoie et planifie
node build_week.js --no-weather        # juste voir le plan en JSON
```

Sur la montre : **Entraînement → Entraînements du jour**. La séance annonce
chaque bloc, vibre aux transitions et affiche l'allure cible.

Les séances de renforcement comptées en répétitions ne sont pas envoyées :
une montre ne sait pas guider « 12 pompes ». Elles restent dans l'app.

## Organisation du code

| Fichier | Rôle |
|---|---|
| `session_types.py` | Typage des séances — **source de vérité unique**, partagée par la sync et le reclassement |
| `garmin_enrich.py` | Séries de muscu et traces GPS : récupération, simplification, cache |
| `garmin_workout.py` | Étapes structurées → format d'entraînement Garmin |
| `build_week.js` | Fait tourner le moteur du coach sous Node (même code que l'app) |
| `coach-engine.js` | Moteur adaptatif : forme, météo, construction des séances |
| `session-detail.js` | Tracés SVG, profils altimétriques, détail des séries |
| `performance.js` | Onglet Performance : progression par discipline |

Deux principes à ne pas casser :

- **Les séances sont décrites par des étapes structurées**, la phrase française
  en est déduite. C'est ce qui permet d'envoyer la même séance sur la montre.
  Écrire directement de la prose dans `blocks` reviendrait à te faire mémoriser
  la séance en courant.
- **L'allure est dérivée, jamais stockée** (`sessionPace` dans `app.js`). La
  colonne « allure » des exports CSV s'est révélée fausse jusqu'à un facteur 3.
