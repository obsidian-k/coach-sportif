# Déployer — pas à pas

Aucun terminal, aucune installation. Tout se fait depuis le site GitHub.

---

## Étape 1 — Envoyer les fichiers

C'est le même geste à chaque fois que je te livre des changements.

1. Va sur **https://github.com/obsidian-k/coach-sportif**
2. Bouton **`Add file`** (à gauche du bouton vert `Code`) → **`Upload files`**
3. Ouvre le dossier **`_A_DEPLOYER`** sur ton ordinateur
4. Clique sur un fichier, fais **Ctrl+A**, puis **glisse tout** dans le grand
   rectangle de la page GitHub
5. Descends en bas → bouton vert **`Commit changes`**

Attends 2 minutes, recharge ton app avec **Ctrl+Shift+R**.

> Le dossier `.github` est masqué par défaut sous Windows. Dans l'explorateur :
> onglet *Affichage* → coche *Éléments masqués*.

---

## Étape 2 — Réparer l'historique ⚠️ **c'est ça qui fait apparaître tes randos**

Tant que tu n'as pas fait cette étape, tes 61 randonnées, 20 VTT et 7 marches
restent rangés dans « Autre ». Ce n'est pas un oubli : le code sait les
reconnaître, mais il faut le lancer **une fois** sur tes données en ligne.

1. Sur GitHub, onglet **`Actions`** (en haut de la page)
2. Colonne de gauche → **`Réparer l'historique`**
3. À droite, bouton **`Run workflow`**
4. **Coche la case `apply`** ← sans elle, c'est un essai à blanc
5. Bouton vert **`Run workflow`**

Attends 2 minutes, actualise : une coche verte ✅ doit apparaître.
Recharge ton app → les randos sont là, avec leur propre catégorie.

---

## Étape 3 — Le bouton « Envoyer sur ma montre »

Il est en bas de l'onglet **Coach**. Tu cliques, la séance part sur ta Garmin,
planifiée au bon jour. Compte environ une minute.

Sur la montre : **Entraînement → Entraînements du jour**. Tu appuies sur start,
elle annonce chaque bloc et vibre aux transitions.

### Si le bouton affiche une erreur de permission

C'est le cas le plus probable la première fois. Le jeton GitHub utilisé par
l'app sait écrire des fichiers, mais pas encore lancer un workflow.

1. Sur GitHub, en haut à droite : ta photo → **`Settings`**
2. Tout en bas de la colonne de gauche → **`Developer settings`**
3. **`Personal access tokens`** → clique sur le jeton du projet
4. Trouve la ligne **`Actions`** et mets-la sur **`Read and write`**
5. **`Update token`**

Reviens sur l'app, reclique. C'est réglé pour de bon.

---

## Ce qui se fait tout seul

- **Les tracés de randos** arrivent progressivement : 25 activités par
  synchronisation, deux fois par jour. Compte 3 ou 4 jours pour les 88.
  C'est volontairement lent pour que Garmin ne bloque pas ton compte.
- **Les séances partent aussi automatiquement** à chaque synchronisation.
  Le bouton sert quand tu veux la version à jour tout de suite.

---

## Si ça coince

**Le site n'a pas changé** → `Ctrl+Shift+R` d'abord. Sinon, onglet `Actions` :
une croix rouge ❌ ? Clique dessus pour lire l'erreur.

**Croix rouge sur un workflow Garmin** → presque toujours Garmin qui bloque
temporairement la connexion. Relance une heure plus tard, ça reprend où
c'en était.

**Revenir en arrière** → onglet `Commits` → clique sur le commit précédent →
bouton `Revert`. Tes données ne sont jamais perdues : chaque script fait une
copie de sauvegarde avant d'écrire.

**Bloqué** → capture d'écran de l'onglet `Actions`, je te dis quoi faire.

---

## À ne jamais faire

- ❌ Envoyer le dossier `data/` — la version en ligne contient plus de séances
  que ta copie locale. Le dossier `_A_DEPLOYER` ne le contient volontairement
  pas.
- ❌ Toucher aux dossiers `_Sauvegarde_v1` et `_Améliorations` : ce sont tes
  filets de sécurité, ils restent sur ton ordinateur.
