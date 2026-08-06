// Cloudflare Pages Function — déclenche l'envoi des séances sur la montre.
//
// Le navigateur ne peut pas parler à Garmin (pas de CORS, et il faudrait y
// exposer les identifiants). Il demande donc à GitHub Actions de le faire :
// c'est là que vivent déjà les secrets Garmin.
//
// POST /api/push-workout  → lance le workflow
// GET  /api/push-workout  → état du dernier lancement (pour le suivi côté app)
//
// Le token GitHub reste côté serveur, comme dans backup.js.

const OWNER = 'obsidian-k';
const REPO = 'coach-sportif';
const BRANCH = 'main';
const WORKFLOW = 'envoyer-seances.yml';

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });

function gh(token, path, opts = {}) {
  return fetch(`https://api.github.com/repos/${OWNER}/${REPO}/${path}`, {
    ...opts,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'coach-sportif-pages-fn',
      ...(opts.headers || {}),
    },
  });
}

function guard(context) {
  // Même défense que backup.js : Cloudflare Access bloque déjà l'anonyme au
  // bord et injecte cet en-tête pour toute requête authentifiée.
  if (!context.request.headers.get('Cf-Access-Jwt-Assertion')) {
    return json({ ok: false, error: 'unauthorized' }, 401);
  }
  if (!context.env.GITHUB_TOKEN) {
    return json({ ok: false, error: 'server_misconfig_no_token' }, 500);
  }
  return null;
}

export async function onRequestPost(context) {
  const bad = guard(context);
  if (bad) return bad;

  const token = context.env.GITHUB_TOKEN;
  // `date` = semaine de référence ; `only` = n'envoyer que cette séance-là.
  const isDate = v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
  let date = '', only = '';
  try {
    const body = await context.request.json();
    if (isDate(body?.date)) date = body.date;
    if (isDate(body?.only)) only = body.only;
  } catch {
    // Pas de corps : le workflow prendra la date du jour.
  }

  try {
    const r = await gh(token, `actions/workflows/${WORKFLOW}/dispatches`, {
      method: 'POST',
      body: JSON.stringify({ ref: BRANCH, inputs: { date, only } }),
    });

    // 204 = accepté. GitHub ne renvoie pas d'identifiant de run ici : le suivi
    // se fait par le GET ci-dessous.
    if (r.status === 204) return json({ ok: true, startedAt: Date.now() });

    const detail = await r.text();
    if (r.status === 403) {
      return json({
        ok: false, error: 'token_sans_droit_actions',
        message: "Le token GitHub n'a pas le droit de lancer des workflows "
               + "(permission « Actions : write » manquante).",
        detail,
      }, 403);
    }
    return json({ ok: false, error: `github_${r.status}`, detail }, 502);
  } catch (e) {
    return json({ ok: false, error: String(e.message || e) }, 502);
  }
}

export async function onRequestGet(context) {
  const bad = guard(context);
  if (bad) return bad;

  const token = context.env.GITHUB_TOKEN;
  try {
    const r = await gh(token, `actions/workflows/${WORKFLOW}/runs?per_page=1`);
    if (!r.ok) return json({ ok: false, error: `github_${r.status}` }, 502);
    const data = await r.json();
    const run = (data.workflow_runs || [])[0];
    if (!run) return json({ ok: true, status: 'none' });
    return json({
      ok: true,
      status: run.status,             // queued | in_progress | completed
      conclusion: run.conclusion,     // success | failure | cancelled | null
      startedAt: run.run_started_at,
      url: run.html_url,
    });
  } catch (e) {
    return json({ ok: false, error: String(e.message || e) }, 502);
  }
}

export const onRequest = async (context) => {
  const m = context.request.method;
  if (m === 'POST') return onRequestPost(context);
  if (m === 'GET') return onRequestGet(context);
  return json({ ok: false, error: 'method_not_allowed' }, 405);
};
