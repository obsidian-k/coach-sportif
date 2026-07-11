# Coach Sportif → Cloudflare : le guide pas-à-pas

*Expliqué simplement. Suis les étapes dans l'ordre, coche au fur et à mesure. Compte ~30 min la première fois.*

---

## En 3 phrases

- Ton appli est un site **statique** (des fichiers). Cloudflare Pages sait l'héberger gratuitement.
- La **récup Garmin ne bouge pas** : c'est GitHub qui va la chercher tout seul, 2× par jour. On n'y touche pas.
- On met un **cadenas Google** devant l'appli (Cloudflare Access) : seul toi, avec ton compte Google, peux entrer.

**Compte à utiliser :** le compte Cloudflare de ta holding **Obsidian Capital**. On y rattache ton **Gmail perso** en plus de l'adresse Obsidian, pour que tu puisses te connecter avec l'un ou l'autre.

---

## Ce dont tu as besoin avant de commencer

1. Accès au **dashboard Cloudflare** d'Obsidian Capital (https://dash.cloudflare.com).
2. Ton compte **GitHub** (celui qui possède le repo `gr0ss0m0d0/coach-sportif`).
3. 5 minutes dans la **Google Cloud Console** (gratuit, on t'explique) — ou l'option « code par email » si tu veux zapper cette étape (voir Partie B, encart).

---

## PARTIE A — Mettre l'appli en ligne (Cloudflare Pages)

Objectif : que `coach-sportif` s'affiche sur une adresse `https://…pages.dev`.

1. Va sur **https://dash.cloudflare.com** et connecte-toi au compte **Obsidian Capital**.
2. Menu de gauche → **Workers & Pages**.
3. Bouton **Create** → onglet **Pages** → **Connect to Git**.
4. Autorise Cloudflare à voir ton GitHub, puis choisis le repo **coach-sportif**. Clique **Begin setup**.
5. Réglages de build — c'est un site statique, donc **on laisse presque tout vide** :
   - **Framework preset** : `None`
   - **Build command** : *(laisse vide)*
   - **Build output directory** : `/`  *(la racine — juste une barre oblique)*
6. Clique **Save and Deploy**. Attends ~1 min.
7. Cloudflare te donne une adresse du type **`https://coach-sportif.pages.dev`**. Ouvre-la : ton appli s'affiche.

> À ce stade elle est **en ligne et publique**. Pas de panique : on ferme l'accès juste après, en Partie B.

*Bonus (optionnel) : si tu veux une adresse propre genre `coach.obsidiancapital.fr`, tu pourras l'ajouter plus tard dans l'onglet **Custom domains** du projet. Pas nécessaire pour que ça marche.*

---

## PARTIE B — Mettre le cadenas Google (Cloudflare Access)

Objectif : quand quelqu'un ouvre l'appli, il doit se connecter avec **ton** Google, sinon porte fermée.

### B.1 — Brancher Google comme méthode de connexion

1. Dans Cloudflare, menu de gauche → **Zero Trust** *(si c'est la première fois, il te demande un nom d'équipe/team name : mets ce que tu veux, ex. `obsidian`, et prends le plan **Free**).*
2. Une fois dans Zero Trust : **Settings** → **Authentication** → **Login methods** → **Add new**. *(selon la version : Integrations → Identity providers → Add new.)*
3. Choisis **Google**.
4. Google te demande un **Client ID** et un **Client Secret**. Tu les crées en 5 min ici :
   - Ouvre **https://console.cloud.google.com** → crée un projet (bouton en haut, ex. `coach-access`).
   - Menu → **APIs & Services** → **Credentials** → **Create credentials** → **OAuth client ID**.
   - Type d'application : **Web application**.
   - Dans **Authorized redirect URIs**, colle l'URL que **Cloudflare** t'affiche sur la page Google (elle ressemble à `https://<ton-team>.cloudflareaccess.com/cdn-cgi/access/callback`).
   - Valide → Google te donne le **Client ID** et le **Client Secret**. Copie-les.
   - Reviens sur Cloudflare, colle les deux, **Save**.
5. Clique **Test** à côté du provider Google : une fenêtre Google s'ouvre, tu te connectes, ça doit dire **succès**.

> **Pas envie de toucher à Google Cloud ?** Cloudflare propose **One-time PIN** (code à usage unique par email) : zéro config, tu l'actives en un clic à l'étape B.2 au lieu de Google. Tu reçois un code par mail à chaque connexion. Moins « joli » que le bouton Google, mais aucune manip technique. Tu peux même mettre les deux.

### B.2 — Créer la règle « seul moi entre »

1. Zero Trust → **Access controls** → **Applications** → **Add an application** *(ou Create new application)*.
2. Type : **Self-hosted**.
3. **Application name** : `Coach Sportif`.
4. **Application domain** : mets ici l'adresse de ton appli, ex. `coach-sportif.pages.dev` *(ou ton domaine perso si tu en as mis un)*. Laisse le chemin vide → ça protège **tout**, y compris `/api/backup`.
5. Section **Identity providers** : coche **Google** (et/ou One-time PIN). Active **Instant auth** si Google est le seul.
6. Étape suivante → **Add a policy** :
   - **Policy name** : `Moi`
   - **Action** : **Allow**
   - **Configure rules** → Selector : **Emails** → Value : ajoute **tes deux adresses**, l'une après l'autre :
     - `sebastien.gros1@gmail.com`
     - `sebastien@obsidiancapital.fr`
7. Enregistre l'application.

> Résultat : n'importe qui d'autre qui tombe sur l'URL voit un écran de connexion Google et se fait jeter. Toi, tu entres avec l'un de tes deux comptes. Le jour où tu veux retirer une adresse, tu l'effaces de la liste — sans rien casser.

---

## PARTIE C — Donner à l'appli la clé pour sauvegarder (secret GitHub)

Objectif : quand tu ajoutes une séance à la main, l'appli l'écrit dans GitHub **via un serveur** (le fichier `functions/api/backup.js`), sans jamais exposer de mot de passe dans ton navigateur.

### C.1 — Fabriquer la clé GitHub (token)

1. Va sur **https://github.com/settings/personal-access-tokens/new** (Fine-grained token).
2. **Token name** : `coach-sportif-backup`.
3. **Expiration** : mets la plus longue possible (ex. 1 an — tu la renouvelleras).
4. **Repository access** → **Only select repositories** → choisis **coach-sportif**.
5. **Permissions** → **Repository permissions** → **Contents** → passe sur **Read and write**.
6. Génère le token, **copie-le** (il ne s'affiche qu'une fois).

### C.2 — Coller la clé dans Cloudflare (en secret)

1. Cloudflare → **Workers & Pages** → ton projet **coach-sportif** → **Settings** → **Variables and secrets** *(ou Environment variables)*.
2. **Add** une variable :
   - **Nom** : `GITHUB_TOKEN` *(exactement ça, en majuscules)*
   - **Valeur** : colle le token GitHub
   - **Type** : choisis **Secret** (encrypted) — comme ça il devient invisible après enregistrement.
3. **Save**.
4. Redéploie pour que le secret soit pris en compte : onglet **Deployments** → sur le dernier déploiement, **⋯** → **Retry deployment** *(ou pousse un petit commit).*

---

## PARTIE D — Test final (2 min)

1. Ouvre ton appli (`https://coach-sportif.pages.dev`). → Tu dois voir l'**écran de connexion Google**. Connecte-toi. ✅
2. Va dans l'onglet **Sauvegarde / Import** de l'appli → la carte doit dire **« Sauvegarde automatique active »**. ✅
3. Ajoute une **séance test** à la main. Attends 3 s → petit message **« ✅ Sauvegardé »**. ✅
4. Va voir le repo GitHub → le fichier `data/sessions.json` doit avoir un **commit récent** (« app: sauvegarde… »). ✅
5. Attends le lendemain (ou lance la sync à la main) : tes activités Garmin remontent toujours. ✅

Si les 5 sont verts : **migration réussie, tout est verrouillé.**

---

## Ce qui a changé côté code (déjà fait pour toi)

- **Supprimé** : l'ancien système qui stockait une clé GitHub **en clair dans le navigateur** (le point faible réel). Plus aucun token côté client.
- **Ajouté** : l'appli sauvegarde désormais via `/api/backup`, protégé par le cadenas Google. Le secret vit **uniquement** sur le serveur Cloudflare.
- **Nettoyé** : un bloc d'octets corrompus en fin de fichier `app.js`.
- **Inchangé** : la récup Garmin (GitHub Actions), la lecture des données, tout le reste de l'appli.

---

## Dépannage express

| Symptôme | Cause probable | Solution |
|---|---|---|
| L'appli s'ouvre **sans** demander Google | La policy Access ne couvre pas le bon domaine | Partie B.2 étape 4 : vérifie que le domaine = ton adresse exacte |
| Séance ajoutée mais **« ❌ Échec »** | Secret `GITHUB_TOKEN` absent ou mal nommé, ou pas redéployé | Partie C.2 : renomme en `GITHUB_TOKEN`, puis Retry deployment |
| **401 unauthorized** sur la sauvegarde | Requête pas passée par le cadenas Access | Vérifie que tu es bien connecté via Google (recharge la page) |
| Erreur **502** à la sauvegarde | Token GitHub expiré ou sans droit Contents | Refais un token (Partie C.1) et recolle-le |
| Garmin ne remonte plus | Secrets GitHub Actions (`GARMIN_EMAIL`/`PASSWORD`) | GitHub → repo → Settings → Secrets and variables → Actions |

---

*Ordre imposé : A (en ligne) → B (cadenas) → C (secret) → D (test). Ne saute pas d'étape.*
