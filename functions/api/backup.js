// Cloudflare Pages Function — proxy de sauvegarde vers GitHub.
// Le token GitHub vit UNIQUEMENT ici, en secret serveur (env.GITHUB_TOKEN).
// Le navigateur n'appelle que /api/backup (même origine) : aucun token exposé.
//
// Docs :
//  - Pages Functions           https://developers.cloudflare.com/pages/functions/
//  - Secrets (chiffrés)         https://developers.cloudflare.com/workers/configuration/secrets/
//  - Bindings côté Pages        https://developers.cloudflare.com/pages/functions/bindings/

const OWNER = 'obsidian-k';
const REPO = 'coach-sportif';
const BRANCH = 'main';

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });

// base64 UTF-8 safe (l'API GitHub Contents attend du contenu base64)
function b64(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

export async function onRequestPost(context) {
  const { request, env } = context;

  // Défense en profondeur : Cloudflare Access bloque déjà l'anonyme au bord,
  // et injecte cet en-tête pour toute requête authentifiée. On refuse sinon.
  if (!request.headers.get('Cf-Access-Jwt-Assertion')) {
    return json({ ok: false, error: 'unauthorized' }, 401);
  }

  const token = env.GITHUB_TOKEN;
  if (!token) return json({ ok: false, error: 'server_misconfig_no_token' }, 500);

  let payload;
  try {
    payload = await request.json();
  } catch {
    return json({ ok: false, error: 'bad_json' }, 400);
  }

  const files = [];
  if (Array.isArray(payload.sessions)) files.push(['data/sessions.json', payload.sessions]);
  if (payload.settings && typeof payload.settings === 'object') files.push(['data/settings.json', payload.settings]);
  if (!files.length) return json({ ok: false, error: 'nothing_to_save' }, 400);

  const gh = (path, opts = {}) =>
    fetch(`https://api.github.com/repos/${OWNER}/${REPO}/contents/${path}`, {
      ...opts,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'User-Agent': 'coach-sportif-pages-fn',
        ...(opts.headers || {}),
      },
    });

  try {
    for (const [path, obj] of files) {
      // Relire le sha courant juste avant l'écriture (évite les conflits 409).
      let sha = null;
      const cur = await gh(`${path}?ref=${BRANCH}&t=${Date.now()}`);
      if (cur.status === 200) sha = (await cur.json()).sha;
      else if (cur.status !== 404) throw new Error(`GET ${path}: ${cur.status}`);

      const body = {
        message: `app: sauvegarde ${path.split('/').pop()} ${new Date().toISOString().slice(0, 10)}`,
        content: b64(JSON.stringify(obj, null, 2)),
        branch: BRANCH,
      };
      if (sha) body.sha = sha;

      const put = await gh(path, { method: 'PUT', body: JSON.stringify(body) });
      if (!put.ok) throw new Error(`PUT ${path}: ${put.status}`);
    }
    return json({ ok: true });
  } catch (e) {
    return json({ ok: false, error: String(e.message || e) }, 502);
  }
}

// Toute autre méthode → 405
export const onRequest = async (context) => {
  if (context.request.method === 'POST') return onRequestPost(context);
  return json({ ok: false, error: 'method_not_allowed' }, 405);
};
