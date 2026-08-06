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
    ${coachStateHtml(ctx)}
    <div id="coach-days"><div class="loader">Lecture de la météo…</div></div>
  `;
  await ensureForecast();
  buildPlan();
  renderCoachDays();
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
        <div class="cs-m"><span class="cs-m-val">${f.ratio || '—'}</span><span class="cs-m-key">ratio aigu / chronique</span></div>
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
    ? `<div class="adaptive-hint"><b>Météo indisponible</b>${coachWeatherErr} — modalités par défaut, bascule-les à la main.</div>`
    : '';
  const capped = coachPlan.capped
    ? `<div class="adaptive-hint"><b>Semaine dense</b>${coachPlan.proposed} min proposées, au-dessus du plafond de ${coachPlan.cap} min issu de tes 4 dernières semaines — coupe une des deux séances si la fatigue est là.</div>`
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
          <div class="prog-name">${CE_DOW_FR[d.dow]} ${formatDateShort(d.date)} — ${s.title}</div>
          <div class="prog-desc">${bits}</div>
          <div class="prog-weather">${d.outdoor ? 'Extérieur' : 'En salle'} — ${d.weather ? d.weather.why : 'météo indisponible'}</div>
        </div>
        <div class="prog-check">›</div>
      </a>`;
  }).join('');
}
