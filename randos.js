/* ═══════════════════════════════════════════════════════════
   RANDONNÉES — onglet dédié.

   Une rando ne se juge pas comme une course : ce qui compte c'est le
   terrain parcouru, le dénivelé avalé, et le tracé lui-même. D'où une
   galerie de tracés plutôt qu'une liste de lignes.
   ═══════════════════════════════════════════════════════════ */

// Disciplines regroupées ici : tout ce qui se fait sur un sentier.
const RANDO_TYPES = ['rando', 'vtt', 'marche'];

const RANDO_STATE = { type: 'all', year: 'all' };

function randoList(sessions) {
  return sessions
    .filter(s => RANDO_TYPES.includes(s.type))
    .filter(s => RANDO_STATE.type === 'all' || s.type === RANDO_STATE.type)
    .filter(s => RANDO_STATE.year === 'all' || s.date.startsWith(RANDO_STATE.year))
    .sort((a, b) => b.date.localeCompare(a.date));
}

function randoTotals(list) {
  return list.reduce((t, s) => ({
    n: t.n + 1,
    km: t.km + (s.distance_km || 0),
    gain: t.gain + (s.elevation_m || 0),
    min: t.min + (s.duration_min || 0),
  }), { n: 0, km: 0, gain: 0, min: 0 });
}

async function randos(main) {
  const all = DB.getSessions();
  const every = all.filter(s => RANDO_TYPES.includes(s.type));

  if (!every.length) {
    main.innerHTML = `
      <div class="page-header"><h2>Randonnées</h2></div>
      <div class="empty-state"><p>Aucune randonnée enregistrée pour l'instant.</p></div>`;
    return;
  }

  const years = [...new Set(every.map(s => s.date.slice(0, 4)))].sort().reverse();
  const usedTypes = RANDO_TYPES.filter(t => every.some(s => s.type === t));

  main.innerHTML = `
    <div class="page-header">
      <h2>Randonnées</h2>
      <div class="page-sub">Tes sorties sur sentier, tracé par tracé</div>
    </div>
    <div class="rando-filters" id="rando-filters"></div>
    <div id="rando-kpis"></div>
    <div class="rando-grid" id="rando-grid"></div>`;

  // Filtres discipline + année
  const f = document.getElementById('rando-filters');
  const chip = (label, active, onClick) => {
    const b = document.createElement('button');
    b.className = `rf-chip${active ? ' active' : ''}`;
    b.textContent = label;
    b.onclick = onClick;
    return b;
  };
  f.appendChild(chip('Tout', RANDO_STATE.type === 'all', () => { RANDO_STATE.type = 'all'; randos(main); }));
  usedTypes.forEach(t => f.appendChild(
    chip(`${typeIcon(t)} ${typeLabel(t)}`, RANDO_STATE.type === t, () => { RANDO_STATE.type = t; randos(main); })));
  const sep = document.createElement('span');
  sep.className = 'rf-sep';
  f.appendChild(sep);
  f.appendChild(chip('Toutes années', RANDO_STATE.year === 'all', () => { RANDO_STATE.year = 'all'; randos(main); }));
  years.forEach(y => f.appendChild(
    chip(y, RANDO_STATE.year === y, () => { RANDO_STATE.year = y; randos(main); })));

  const list = randoList(all);
  renderRandoKpis(list, document.getElementById('rando-kpis'));
  await renderRandoGrid(list, document.getElementById('rando-grid'));
}

function renderRandoKpis(list, el) {
  const t = randoTotals(list);
  const longest = list.reduce((a, s) => ((s.distance_km || 0) > (a?.distance_km || 0) ? s : a), null);
  const steepest = list.reduce((a, s) => ((s.elevation_m || 0) > (a?.elevation_m || 0) ? s : a), null);

  el.innerHTML = `
    <div class="kpi-row">
      <div class="kpi-card">
        <div class="kpi-lbl">Sorties</div>
        <div class="kpi-num">${t.n}</div>
        <div class="kpi-sub">${formatDuration(t.min)} cumulées</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-lbl">Distance</div>
        <div class="kpi-num">${Math.round(t.km)}<span class="u"> km</span></div>
        <div class="kpi-sub">au total</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-lbl">Dénivelé</div>
        <div class="kpi-num">${(t.gain / 1000).toFixed(1).replace('.', ',')}<span class="u"> km</span></div>
        <div class="kpi-sub">${Math.round(t.gain).toLocaleString('fr-FR')} m grimpés</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-lbl">Plus longue</div>
        <div class="kpi-num" style="font-size:1.9rem">${longest?.distance_km ? `${longest.distance_km} km` : '·'}</div>
        <div class="kpi-sub">${longest ? formatDate(longest.date) : ''}</div>
      </div>
    </div>`;
}

/**
 * Galerie de tracés. Le chargement de tracks.json est asynchrone, donc on
 * dessine d'abord les cartes puis on y injecte les tracés : la page ne reste
 * jamais vide en attendant le réseau.
 */
async function renderRandoGrid(list, el) {
  el.innerHTML = list.map(s => {
    const bits = [];
    if (s.distance_km) bits.push(`${s.distance_km} km`);
    if (s.elevation_m) bits.push(`+${s.elevation_m} m`);
    if (s.duration_min) bits.push(formatDuration(s.duration_min));
    return `
      <article class="rando-card" data-id="${s.id}">
        <div class="rc-trace" id="rc-${cssId(s.id)}">
          <div class="rc-placeholder"><span class="rc-dots"></span></div>
        </div>
        <div class="rc-body">
          <div class="rc-title">${cleanTitle(s)}</div>
          <div class="rc-date">${formatDate(s.date)}</div>
          <div class="rc-stats">${bits.map(b => `<span>${b}</span>`).join('')}</div>
        </div>
      </article>`;
  }).join('');

  el.querySelectorAll('.rando-card').forEach(card => {
    card.onclick = () => {
      const s = DB.getSessions().find(x => String(x.id) === card.dataset.id);
      if (s) openEditModal(s);
    };
  });

  const tracks = await Tracks.all();
  let missing = 0;
  list.forEach(s => {
    const holder = document.getElementById(`rc-${cssId(s.id)}`);
    if (!holder) return;
    const tr = tracks[s.id];
    if (tr && tr.pts && tr.pts.length > 1) {
      holder.innerHTML = renderTrackSVG(tr, typeColor(s.type), { width: 300, height: 190 });
    } else {
      missing++;
      holder.innerHTML = `<div class="rc-placeholder rc-empty">
        <span>${typeIcon(s.type)}</span></div>`;
    }
  });

  if (missing) renderTraceNotice(el, missing, list.length);
}

/** Un id de séance peut contenir des caractères invalides pour un sélecteur. */
function cssId(id) { return String(id).replace(/[^a-zA-Z0-9_-]/g, '_'); }

/**
 * Message honnête quand des tracés manquent : ils ne sont pas « en cours de
 * calcul », ils n'ont pas encore été téléchargés depuis Garmin.
 */
function renderTraceNotice(el, missing, total) {
  const note = document.createElement('div');
  note.className = 'rando-notice';
  note.innerHTML = missing === total
    ? `<b>Les tracés ne sont pas encore descendus de Garmin.</b>
       Sur GitHub, onglet <i>Actions</i> → <i>Réparer l'historique</i> → coche
       <i>apply</i> → <i>Run workflow</i>. Compte 2 à 3 minutes, puis recharge
       cette page.`
    : `${missing} tracé${missing > 1 ? 's' : ''} sur ${total} pas encore
       téléchargé${missing > 1 ? 's' : ''}. La synchronisation les récupère
       progressivement, ou relance <i>Réparer l'historique</i> sur GitHub pour
       tout descendre d'un coup.`;
  el.parentElement.insertBefore(note, el);
}
