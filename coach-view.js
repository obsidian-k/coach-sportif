/* ═══════════════════════════════════════════════════════════
   VUE COACH — propositions adaptatives + météo
   Dépend de coach-engine.js et des helpers d'app.js
   ═══════════════════════════════════════════════════════════ */

let coachForecast = null;
let coachWeatherErr = null;
let coachOverride = JSON.parse(localStorage.getItem('coach_override') || '{}');
let coachPlan = null;

async function ensureForecast() {
  if (coachForecast) return coachForecast;
  const st = DB.getSettings();
  try {
    coachForecast = await Weather.get(st.lat ?? 48.1206, st.lon ?? -1.5117);
    coachWeatherErr = null;
  } catch (e) { coachWeatherErr = e.message; }
  return coachForecast;
}

function buildPlan() {
  // On purge les surcharges manuelles périmées (dates passées)
  const t = today();
  Object.keys(coachOverride).forEach(d => { if (d < t) delete coachOverride[d]; });
  coachPlan = CoachEngine.week(DB.getSessions(), coachForecast, DB.getSettings(), t, coachOverride);
  return coachPlan;
}

async function coachView(main) {
  const st = DB.getSettings();
  const ctx = CoachEngine.context(DB.getSessions(), today());
  main.innerHTML = `
    <div class="page-header">
      <h2>Coach</h2>
      <div class="page-sub">Séances proposées les jours de télétravail · ${st.place || 'Noyal-sur-Vilaine'}
        <button class="link-btn" onclick="coachSetPlace()">changer de lieu</button></div>
    </div>
    ${coachDayPickerHtml(st)}
    ${coachStateHtml(ctx)}
    <div id="coach-days"><div class="loader">Lecture de la météo…</div></div>
  `;
  bindDayPicker();
  await ensureForecast();
  buildPlan();
  renderCoachDays();
  renderPushButtons();
}

/* ─── Choix des jours d'entraînement ───────────────────────────────────────── */

const DOW_SHORT = { 1: 'Lun', 2: 'Mar', 3: 'Mer', 4: 'Jeu', 5: 'Ven', 6: 'Sam', 7: 'Dim' };

function coachDayPickerHtml(st) {
  const active = st.coach_days || [2, 5, 7];
  const btns = [1, 2, 3, 4, 5, 6, 7].map(d =>
    `<button class="dp-day${active.includes(d) ? ' on' : ''}" data-dow="${d}">${DOW_SHORT[d]}</button>`
  ).join('');
  return `
    <div class="day-picker">
      <span class="dp-lbl">Mes jours d'entraînement</span>
      <div class="dp-days">${btns}</div>
      <span class="dp-count" id="dp-count">${active.length} séance${active.length > 1 ? 's' : ''} / semaine</span>
    </div>`;
}

function bindDayPicker() {
  document.querySelectorAll('.dp-day').forEach(btn => {
    btn.onclick = () => {
      const dow = +btn.dataset.dow;
      const st = DB.getSettings();
      let days = [...(st.coach_days || [])];
      days = days.includes(dow) ? days.filter(d => d !== dow) : [...days, dow];
      // Au moins un jour, sinon le coach n'a plus rien à proposer.
      if (!days.length) { toast('Garde au moins un jour', 'warn'); return; }
      days.sort((a, b) => a - b);
      DB.saveSettings({ ...st, coach_days: days });
      coachView(document.getElementById('main'));
    };
  });
}

/* ─── Envoi sur la montre ────────────────────────────────────────────────────
   Un bouton PAR SÉANCE : tu choisis celle que tu veux sur ta montre, quand
   tu veux. Le navigateur ne peut pas parler à Garmin, il demande à GitHub
   Actions de le faire — les identifiants Garmin restent là-bas.
   ------------------------------------------------------------------------- */

// Séances que la montre ne sait pas guider (répétitions à compter).
const PUSH_UNSUPPORTED = ['renfo'];

// État d'envoi par date : idle | sending | waiting | done | error
const pushState = {};
const pushTimers = {};

function renderPushButtons() {
  if (!coachPlan) return;
  coachPlan.days.forEach(d => renderPushButton(d.date));
}

function renderPushButton(date, message = '') {
  const el = document.getElementById(`push-${date}`);
  if (!el || !coachPlan) return;
  const day = coachPlan.days.find(x => x.date === date);
  if (!day) return;

  if (PUSH_UNSUPPORTED.includes(day.session.type)) {
    el.innerHTML = `<div class="push-note">Séance en répétitions : une montre ne
      sait pas guider « 12 pompes ». Elle reste ici.</div>`;
    return;
  }

  const state = pushState[date] || 'idle';
  const labels = {
    idle:    'Envoyer sur ma montre',
    sending: 'Envoi…',
    waiting: 'Préparation…',
    done:    'Sur ta montre ✓',
    error:   'Réessayer',
  };
  const busy = state === 'sending' || state === 'waiting';

  el.className = `cday-push ${state}`;
  el.innerHTML = `
    <button class="btn-watch" data-date="${date}" ${busy ? 'disabled' : ''}>
      ${busy ? '<span class="push-spin"></span>' : '<span class="watch-ico">⌚</span>'}
      ${labels[state]}
    </button>
    ${state === 'done'
      ? '<div class="push-note">Sur la montre : <b>Entraînement → Entraînements du jour</b></div>'
      : ''}
    ${message ? `<div class="push-msg">${message}</div>` : ''}`;

  const btn = el.querySelector('.btn-watch');
  if (btn && !busy) btn.onclick = () => pushToWatch(date);
}

async function pushToWatch(date) {
  pushState[date] = 'sending';
  renderPushButton(date);
  try {
    const r = await fetch('/api/push-workout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date: today(), only: date }),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok || !data.ok) {
      pushState[date] = 'error';
      renderPushButton(date, pushErrorText(r.status, data));
      return;
    }
    pushState[date] = 'waiting';
    renderPushButton(date);
    pollPushStatus(date);
  } catch (e) {
    pushState[date] = 'error';
    renderPushButton(date, `Impossible de joindre le serveur (${e.message}).`);
  }
}

function pushErrorText(status, data) {
  if (status === 401) return 'Session expirée, recharge la page.';
  if (data.error === 'token_sans_droit_actions') {
    return "Le jeton GitHub n'a pas le droit de lancer un workflow. "
         + "Sur GitHub : <i>Settings → Developer settings → Personal access tokens</i>, "
         + "puis passe <b>Actions</b> sur <b>Read and write</b>.";
  }
  if (data.error === 'server_misconfig_no_token') {
    return 'Jeton GitHub absent côté serveur (variable GITHUB_TOKEN sur Cloudflare).';
  }
  return data.message || data.detail || 'Échec du lancement. Réessaie dans un instant.';
}

/** Suit l'exécution côté GitHub. L'envoi prend ~1 min. */
function pollPushStatus(date, tries = 0) {
  clearTimeout(pushTimers[date]);
  if (tries > 36) {                       // ~3 min
    pushState[date] = 'error';
    renderPushButton(date, "Plus long que prévu. Va voir l'onglet <i>Actions</i> sur GitHub.");
    return;
  }
  pushTimers[date] = setTimeout(async () => {
    try {
      const r = await fetch('/api/push-workout');
      const d = await r.json();
      if (d.ok && d.status === 'completed') {
        if (d.conclusion === 'success') {
          pushState[date] = 'done';
          renderPushButton(date);
        } else {
          pushState[date] = 'error';
          renderPushButton(date,
            `Échec côté Garmin. <a href="${d.url}" target="_blank" rel="noopener">Voir le détail</a>. `
            + 'Souvent Garmin bloque temporairement : réessaie dans une heure.');
        }
        return;
      }
      pollPushStatus(date, tries + 1);
    } catch {
      pollPushStatus(date, tries + 1);
    }
  }, 5000);
}

function coachStateHtml(ctx) {
  const f = ctx.form;
  const cls = { coupure: 'warn', reprise: 'warn', surcharge: 'bad', progression: 'ok', regulier: '' }[f.state] || '';
  const maxMin = Math.max(60, ...f.weeks.map(w => w.min));
  const bars = f.weeks.map((w, i) => `
    <div class="cs-bar" title="${formatDateShort(w.start)} · ${w.n} séance${w.n > 1 ? 's' : ''} · ${formatDuration(w.min)}">
      <div class="cs-bar-fill${i === f.weeks.length - 1 ? ' now' : ''}" style="height:${Math.max(3, Math.round(w.min / maxMin * 100))}%"></div>
    </div>`).join('');
  return `
    <div class="coach-state">
      <div class="cs-left">
        <span class="cs-badge ${cls}">${f.label}</span>
        <div class="cs-note">${f.note}</div>
        <div class="cs-ref">Référence course : <b>${ceKm(ctx.run.ref)} km</b> · allure ${cePace(ctx.run.pace)}/km</div>
      </div>
      <div class="cs-metrics">
        <div class="cs-m"><span class="cs-m-val">${f.acute}</span><span class="cs-m-key">charge 7 j</span></div>
        <div class="cs-m"><span class="cs-m-val">${f.chronic}</span><span class="cs-m-key">moy./sem. sur 4 sem.</span></div>
        <div class="cs-m"><span class="cs-m-val">${f.ratio ?? '·'}</span><span class="cs-m-key">ratio aigu / chronique</span></div>
        <div class="cs-m"><span class="cs-m-val">${f.perWeek}</span><span class="cs-m-key">séances / sem.</span></div>
      </div>
      <div class="cs-chart">
        <div class="cs-bars">${bars}</div>
        <div class="cs-bars-lbl">Charge des 8 dernières semaines</div>
      </div>
    </div>`;
}

function renderCoachDays() {
  const el = document.getElementById('coach-days');
  if (!el || !coachPlan) return;
  const warn = coachWeatherErr
    ? `<div class="adaptive-hint"><b>Météo indisponible</b>${coachWeatherErr}. Modalités par défaut, bascule-les à la main.</div>`
    : '';
  const capped = coachPlan.capped
    ? `<div class="adaptive-hint"><b>Semaine dense</b>${coachPlan.proposed} min proposées, au-dessus du plafond de ${coachPlan.cap} min issu de tes 4 dernières semaines : coupe une séance si la fatigue est là.</div>`
    : '';
  el.innerHTML = warn + '<div class="coach-days">' + coachPlan.days.map(coachDayHtml).join('') + '</div>' + capped;
}

function coachDayHtml(d) {
  const s = d.session, w = d.weather;
  const slots = w ? w.slots.map(sl => `
    <div class="cw-slot${sl === w.best ? ' best' : ''}">
      <span class="cw-ico">${Weather.icon(sl.code, 22)}</span>
      <span class="cw-num">
        <span class="cw-t">${sl.temp} °C</span>
        <span class="cw-sub">${sl.label} · ${sl.prob} %${sl.wind >= 25 ? ' · ' + sl.wind : ''}</span>
      </span>
      ${sl.wind >= 25 ? '<span class="cw-wind">' + Weather.windIcon(13) + '</span>' : ''}
    </div>`).join('') : '<div class="cw-none">Pas de prévision pour ce jour</div>';

  const target = [
    s.distance ? `${ceKm(s.distance)} km` : null,
    s.pace ? `${cePace(s.pace)} /km` : null,
    s.rounds ? `${s.rounds} rounds` : null,
    `~${s.duration} min`,
  ].filter(Boolean).join(' · ');

  return `
    <article class="cday">
      <header class="cday-head">
        <div>
          <div class="cday-dow">${CE_DOW_FR[d.dow]}</div>
          <div class="cday-date">${formatDate(d.date)}</div>
        </div>
        <span class="cday-mode ${d.outdoor ? 'out' : 'in'}">${d.outdoor ? 'Extérieur' : 'En salle'}</span>
      </header>
      <div class="cday-weather">${slots}</div>
      <div class="cday-body">
        <div class="cday-focus">${s.focus}</div>
        <div class="cday-title"><span style="color:${typeColor(s.type)}">${typeIcon(s.type)}</span> ${s.title}</div>
        <div class="cday-target">${target}</div>
        <ol class="cday-blocks">
          ${s.blocks.map(b => `<li><span class="cb-t">${b.t}</span><span class="cb-d">${b.d}</span></li>`).join('')}
        </ol>
        <div class="cday-why">
          <div class="cw-lbl">Pourquoi cette séance</div>
          <ul>${d.why.map(x => `<li>${x}</li>`).join('')}</ul>
        </div>
      </div>
      <footer class="cday-actions">
        <button class="btn-gold btn-sm" onclick="coachLog('${d.date}')">Enregistrer cette séance</button>
        <button class="btn-ghost btn-sm" onclick="coachToggle('${d.date}')">${d.outdoor ? 'Basculer en salle' : 'Basculer dehors'}</button>
      </footer>
      <div class="cday-push" id="push-${d.date}"></div>
    </article>`;
}

function coachToggle(date) {
  const d = coachPlan.days.find(x => x.date === date);
  coachOverride[date] = d.outdoor ? 'in' : 'out';
  localStorage.setItem('coach_override', JSON.stringify(coachOverride));
  buildPlan();
  renderCoachDays();
}

function coachLog(date) {
  const d = coachPlan.days.find(x => x.date === date);
  openAddModal({ date, type: d.session.type, duration: d.session.duration, distance: d.session.distance });
}

async function coachSetPlace() {
  const name = prompt('Ville ou commune pour la météo :', DB.getSettings().place || 'Noyal-sur-Vilaine');
  if (!name) return;
  const geo = await Weather.geocode(name.trim());
  if (!geo) { toast('Lieu introuvable', 'err'); return; }
  DB.saveSettings({ ...DB.getSettings(), ...geo });
  localStorage.removeItem(Weather.CK);
  coachForecast = null;
  toast('Lieu mis à jour : ' + geo.place, 'ok');
  navigate('coach');
}

/** Widget dashboard — version compacte des deux propositions. */
async function renderDashCoach() {
  if (!document.getElementById('week-plan')) return;
  await ensureForecast();
  buildPlan();
  const el = document.getElementById('week-plan');
  if (!el) return;
  el.innerHTML = coachPlan.days.map(d => {
    const s = d.session;
    const bits = [s.distance ? ceKm(s.distance) + ' km' : null, s.pace ? cePace(s.pace) + ' /km' : null, `~${s.duration} min`].filter(Boolean).join(' · ');
    return `
      <a class="prog-item" href="#coach">
        <div class="prog-icon" style="color:${typeColor(s.type)}">${typeIcon(s.type)}</div>
        <div class="prog-body">
          <div class="prog-name">${CE_DOW_FR[d.dow]} ${formatDateShort(d.date)} · ${s.title}</div>
          <div class="prog-desc">${bits}</div>
          <div class="prog-weather">${d.outdoor ? 'Extérieur' : 'En salle'} · ${d.weather ? d.weather.why : 'météo indisponible'}</div>
        </div>
        <div class="prog-check">›</div>
      </a>`;
  }).join('');
}
