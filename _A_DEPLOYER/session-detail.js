/* ═══════════════════════════════════════════════════════════
   SESSION DETAIL — tracés de randos, profils altimétriques,
   détail des séries de musculation.

   Tout est dessiné en SVG à partir des variables CSS du thème :
   aucune dépendance, aucune clé API, aucun fond de carte externe,
   et le rendu suit automatiquement le thème clair/sombre.
   ═══════════════════════════════════════════════════════════ */

// ─── Chargement paresseux des traces ──────────────────────────────────────────
// tracks.json pèse quelques centaines de Ko : on ne le charge qu'à la première
// ouverture d'une séance qui en a besoin, jamais au démarrage de l'app.
const Tracks = {
  _cache: null,
  _pending: null,

  async all() {
    if (this._cache) return this._cache;
    if (this._pending) return this._pending;
    this._pending = fetch('./data/tracks.json?t=' + Date.now())
      .then(r => (r.ok ? r.json() : {}))
      .catch(() => ({}))
      .then(d => { this._cache = d || {}; this._pending = null; return this._cache; });
    return this._pending;
  },

  async get(sessionId) {
    const all = await this.all();
    const t = all[sessionId];
    return t && t.pts && t.pts.length > 1 ? t : null;
  },
};

// ─── Tracé du parcours ────────────────────────────────────────────────────────

/**
 * Projette les points GPS dans le repère du SVG.
 * La longitude est resserrée par cos(latitude) pour que le tracé garde ses
 * proportions réelles — sans quoi une boucle apparaîtrait étirée en largeur.
 */
function projectTrack(pts, w, h, pad) {
  const latMid = pts.reduce((a, p) => a + p[0], 0) / pts.length;
  const kx = Math.cos(latMid * Math.PI / 180);
  const xs = pts.map(p => p[1] * kx);
  const ys = pts.map(p => -p[0]);           // latitude vers le haut
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const spanX = maxX - minX || 1e-9;
  const spanY = maxY - minY || 1e-9;
  const scale = Math.min((w - 2 * pad) / spanX, (h - 2 * pad) / spanY);
  // Centrage dans la zone utile
  const offX = (w - spanX * scale) / 2;
  const offY = (h - spanY * scale) / 2;
  return xs.map((x, i) => [
    offX + (x - minX) * scale,
    offY + (ys[i] - minY) * scale,
  ]);
}

function pathFrom(coords) {
  return coords.map((c, i) => `${i ? 'L' : 'M'}${c[0].toFixed(1)} ${c[1].toFixed(1)}`).join(' ');
}

/**
 * Tracé du parcours en SVG, aux couleurs du type de séance.
 * `color` provient de TYPES : la charte est appliquée par construction.
 */
function renderTrackSVG(track, color, opts = {}) {
  const w = opts.width || 520;
  const h = opts.height || 300;
  const pad = 18;
  const pts = track.pts;
  if (!pts || pts.length < 2) return '';

  const coords = projectTrack(pts, w, h, pad);
  const d = pathFrom(coords);
  const start = coords[0];
  const end = coords[coords.length - 1];
  const uid = 'trk' + Math.random().toString(36).slice(2, 8);

  // Boucle : si l'arrivée est à moins de 2 % de la diagonale du départ, on
  // n'affiche qu'un seul marqueur — sinon les deux se chevauchent.
  const diag = Math.hypot(w, h);
  const isLoop = Math.hypot(end[0] - start[0], end[1] - start[1]) < diag * 0.02;

  return `
<svg class="track-svg" viewBox="0 0 ${w} ${h}" width="100%" preserveAspectRatio="xMidYMid meet" role="img"
     aria-label="Tracé du parcours">
  <defs>
    <linearGradient id="${uid}g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%"   stop-color="${color}" stop-opacity="0.55"/>
      <stop offset="100%" stop-color="${color}" stop-opacity="1"/>
    </linearGradient>
    <filter id="${uid}f" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="4" result="b"/>
      <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>
  <path d="${d}" fill="none" stroke="${color}" stroke-opacity=".18"
        stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="${d}" fill="none" stroke="url(#${uid}g)" stroke-width="2.6"
        stroke-linecap="round" stroke-linejoin="round" filter="url(#${uid}f)"/>
  <circle cx="${start[0].toFixed(1)}" cy="${start[1].toFixed(1)}" r="5.5"
          fill="var(--surface)" stroke="${color}" stroke-width="2.5"/>
  ${isLoop ? '' : `<circle cx="${end[0].toFixed(1)}" cy="${end[1].toFixed(1)}" r="4"
          fill="${color}" stroke="var(--surface)" stroke-width="2"/>`}
</svg>`;
}

// ─── Profil altimétrique ──────────────────────────────────────────────────────

function renderProfileSVG(track, color, opts = {}) {
  const prof = track.profile;
  if (!prof || prof.length < 4) return '';
  const w = opts.width || 520;
  const h = opts.height || 96;
  const padT = 10, padB = 18;

  const min = Math.min(...prof), max = Math.max(...prof);
  const span = Math.max(max - min, 10);        // évite d'amplifier un terrain plat
  const usable = h - padT - padB;
  const x = i => (i / (prof.length - 1)) * w;
  const y = v => padT + usable - ((v - min) / span) * usable;

  const line = prof.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');
  const area = `${line} L${w} ${h - padB} L0 ${h - padB} Z`;
  const uid = 'prf' + Math.random().toString(36).slice(2, 8);
  const km = track.dist_km;

  return `
<svg class="profile-svg" viewBox="0 0 ${w} ${h}" width="100%" preserveAspectRatio="none" role="img"
     aria-label="Profil altimétrique : ${min} à ${max} mètres">
  <defs>
    <linearGradient id="${uid}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%"   stop-color="${color}" stop-opacity=".38"/>
      <stop offset="100%" stop-color="${color}" stop-opacity="0"/>
    </linearGradient>
  </defs>
  <line x1="0" y1="${h - padB}" x2="${w}" y2="${h - padB}"
        stroke="var(--border-strong)" stroke-width="1"/>
  <path d="${area}" fill="url(#${uid})"/>
  <path d="${line}" fill="none" stroke="${color}" stroke-width="1.8"
        stroke-linejoin="round" stroke-linecap="round"/>
  <text x="2" y="${padT - 1}" class="profile-lbl">${max} m</text>
  <text x="2" y="${h - 5}" class="profile-lbl">${min} m</text>
  ${km ? `<text x="${w - 2}" y="${h - 5}" class="profile-lbl" text-anchor="end">${km} km</text>` : ''}
</svg>`;
}

// ─── Blocs d'affichage ────────────────────────────────────────────────────────

function statChip(value, label) {
  return `<div class="ds-stat"><span class="ds-val">${value}</span><span class="ds-key">${label}</span></div>`;
}

/** Encart complet d'une séance à parcours : stats, tracé, profil. */
function trackBlockHtml(session, track) {
  const color = typeColor(session.type);
  const stats = [];
  const dist = session.distance_km || track.dist_km;
  if (dist) stats.push(statChip(`${dist} km`, 'distance'));
  if (track.gain_m) stats.push(statChip(`+${track.gain_m} m`, 'dénivelé'));
  if (track.loss_m) stats.push(statChip(`−${track.loss_m} m`, 'descente'));
  // La pente se calcule sur la distance de la trace, pas celle de la séance :
  // les deux peuvent différer, et mélanger les sources donnerait un ratio faux.
  if (track.dist_km && track.gain_m) {
    stats.push(statChip(`${Math.round(track.gain_m / track.dist_km)} m/km`, 'pente moy.'));
  }
  if (session.duration_min) stats.push(statChip(formatDuration(session.duration_min), 'durée'));
  if (track.ele_max) stats.push(statChip(`${track.ele_max} m`, 'point haut'));

  return `
    <div class="detail-section">
      <div class="ds-stats">${stats.join('')}</div>
      <div class="track-wrap">${renderTrackSVG(track, color)}</div>
      ${renderProfileSVG(track, color)}
    </div>`;
}

/** Encart des séries de musculation. */
function exercisesBlockHtml(session) {
  const ex = session.exercises;
  if (!ex || !ex.length) return '';
  const color = typeColor(session.type);
  const maxReps = Math.max(...ex.map(e => e.reps || 0), 1);
  // Le gainage se mesure en secondes : il lui faut sa propre échelle, sinon
  // sa barre reste vide à côté des exercices comptés en répétitions.
  const maxSecs = Math.max(...ex.filter(e => !e.reps).map(e => e.seconds || 0), 1);

  const rows = ex.map(e => {
    const width = e.reps
      ? Math.max(4, (e.reps / maxReps) * 100)
      : Math.max(4, ((e.seconds || 0) / maxSecs) * 100);
    // Gainage & co : mesurés en durée, pas en répétitions.
    const measure = e.reps
      ? `${e.reps} <span class="ex-unit">reps</span>`
      : `${Math.round(e.seconds)} <span class="ex-unit">s</span>`;
    const detail = e.reps_detail && e.reps_detail.length > 1
      ? `<span class="ex-detail">${e.reps_detail.join(' · ')}</span>` : '';
    const weight = e.weight_kg ? `<span class="ex-weight">${e.weight_kg} kg</span>` : '';
    return `
      <div class="ex-row">
        <div class="ex-head">
          <span class="ex-name">${e.label}</span>
          <span class="ex-measure">${measure}</span>
        </div>
        <div class="ex-bar-bg"><div class="ex-bar" style="width:${width}%;background:${color}"></div></div>
        <div class="ex-meta">
          <span class="ex-sets">${e.sets} série${e.sets > 1 ? 's' : ''}</span>
          ${detail}${weight}
        </div>
      </div>`;
  }).join('');

  const totals = [];
  if (session.reps_total) totals.push(statChip(session.reps_total, 'répétitions'));
  if (session.sets_total) totals.push(statChip(session.sets_total, 'séries'));
  if (session.duration_min) totals.push(statChip(formatDuration(session.duration_min), 'durée'));

  return `
    <div class="detail-section">
      <div class="ds-stats">${totals.join('')}</div>
      <div class="ex-list">${rows}</div>
    </div>`;
}

// ─── Progression en musculation ───────────────────────────────────────────────

// Groupes suivis dans le temps. Doit rester aligné sur MUSCLE_GROUPS
// (garmin_enrich.py), qui écrit le champ `group` de chaque exercice.
const STRENGTH_GROUPS = [
  { key: 'pompes', label: 'Pompes',  color: '#4ade80' },
  { key: 'abdos',  label: 'Abdos',   color: '#22d3ee' },
  { key: 'jambes', label: 'Jambes',  color: '#a855f7' },
  { key: 'tirage', label: 'Tirage',  color: '#f59e0b' },
];

/** Cumul mensuel de répétitions par groupe musculaire. */
function strengthByMonth(sessions) {
  const months = {};
  for (const s of sessions) {
    if (!s.exercises || !s.exercises.length) continue;
    const m = (s.date || '').slice(0, 7);
    if (!m) continue;
    const bucket = months[m] || (months[m] = {});
    for (const e of s.exercises) {
      if (!e.group || !e.reps) continue;
      bucket[e.group] = (bucket[e.group] || 0) + e.reps;
    }
  }
  return months;
}

/**
 * Courbe de progression en musculation.
 * Ne s'affiche que s'il y a de la matière : tant que Garmin Musculation n'a
 * pas été utilisé, ce bloc reste absent plutôt que d'afficher un graphe vide.
 */
function renderStrengthProgress(sessions, container) {
  if (!container) return;
  const byMonth = strengthByMonth(sessions);
  const months = Object.keys(byMonth).sort().slice(-12);
  const active = STRENGTH_GROUPS.filter(g => months.some(m => byMonth[m][g.key]));

  if (months.length < 2 || !active.length) {
    container.innerHTML = '';
    return;
  }

  const totals = active.map(g => ({
    ...g, total: months.reduce((a, m) => a + (byMonth[m][g.key] || 0), 0),
  }));

  container.innerHTML = `
    <div class="charts-row">
      <div class="chart-wrap" style="flex:2">
        <div class="chart-lbl">Répétitions par mois — musculation</div>
        <div class="chart-container" style="height:220px"><canvas id="chart-strength"></canvas></div>
      </div>
      <div class="chart-wrap" style="flex:1">
        <div class="chart-lbl">Volume cumulé</div>
        <div class="strength-totals">
          ${totals.map(g => `
            <div class="st-row">
              <span class="st-dot" style="background:${g.color}"></span>
              <span class="st-lbl">${g.label}</span>
              <span class="st-val">${g.total.toLocaleString('fr-FR')}</span>
            </div>`).join('')}
        </div>
      </div>
    </div>`;

  const labels = months.map(m =>
    new Date(m + '-01T12:00:00').toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' }));

  if (chartInstances.strength) { chartInstances.strength.destroy(); }
  chartInstances.strength = new Chart(document.getElementById('chart-strength'), {
    type: 'line',
    data: {
      labels,
      datasets: active.map(g => ({
        label: g.label,
        data: months.map(m => byMonth[m][g.key] || 0),
        borderColor: g.color,
        backgroundColor: g.color + '22',
        borderWidth: 2,
        tension: .32,
        pointRadius: 2.5,
        fill: true,
      })),
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: true, labels: { boxWidth: 10, font: { size: 10 } } } },
      scales: {
        y: { beginAtZero: true, title: { display: true, text: 'répétitions' } },
      },
    },
  });
}

/**
 * Remplit le conteneur de détail d'une séance.
 * Asynchrone à cause du chargement paresseux des traces ; le reste est immédiat.
 */
async function renderSessionDetail(session, container) {
  if (!container) return;
  container.innerHTML = '';

  const exHtml = exercisesBlockHtml(session);
  if (exHtml) container.innerHTML = exHtml;

  if (isTraceType(session.type)) {
    const track = await Tracks.get(session.id);
    if (track) container.innerHTML = trackBlockHtml(session, track) + container.innerHTML;
  }

  container.classList.toggle('hidden', !container.innerHTML.trim());
}
