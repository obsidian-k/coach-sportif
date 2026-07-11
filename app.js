/* ═══════════════════════════════════════════════════════════
   COACH SPORTIF — App 100% statique, localStorage
   ═══════════════════════════════════════════════════════════ */

// ─── Theme ───────────────────────────────────────────────────────────────────
function initTheme() {
  const saved = localStorage.getItem('coach_theme') || 'dark';
  applyTheme(saved);
}
function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') || 'dark';
  applyTheme(current === 'dark' ? 'light' : 'dark');
}
function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('coach_theme', theme);
  const sun = document.getElementById('theme-icon-sun');
  const moon = document.getElementById('theme-icon-moon');
  const lbl = document.getElementById('theme-label');
  if (sun) sun.style.display = theme === 'dark' ? 'block' : 'none';
  if (moon) moon.style.display = theme === 'dark' ? 'none' : 'block';
  if (lbl) lbl.textContent = theme === 'dark' ? 'Light' : 'Dark';
}

// ─── Mobile nav ──────────────────────────────────────────────────────────────
function toggleMobileNav() {
  const nav = document.getElementById('nav');
  const overlay = document.getElementById('nav-overlay');
  const isOpen = nav.classList.toggle('open');
  overlay.classList.toggle('open', isOpen);
}
function closeMobileNav() {
  document.getElementById('nav').classList.remove('open');
  document.getElementById('nav-overlay').classList.remove('open');
}

document.addEventListener('DOMContentLoaded', initApp);

// ─── Programme 12 semaines ────────────────────────────────────────────────────
const PROGRAM = [
  { rameur: '15 min — cadence 22', corde: '3 rounds (30s on/off si galère)', sac: '4 rounds — jab-cross uniquement', renfo: 'R1: pompes | R2: planche | R3: squats', course: '5-6 km allure libre', cardio_mardi: '20 min vélo ou rameur — effort léger' },
  { rameur: '15 min — cadence 22', corde: '3 rounds', sac: '4 rounds — jab-cross', renfo: 'idem S1', course: '5-6 km structurée', cardio_mardi: '25 min' },
  { rameur: '18 min — cadence 24', corde: '4 rounds', sac: '5 rounds — jab-cross', renfo: 'idem + burpees sans pompes', course: '6 km', cardio_mardi: '25 min' },
  { rameur: '18 min — cadence 24', corde: '5 rounds', sac: '5 rounds — jab-cross', renfo: 'idem + pompes classiques', course: '6.5 km — CHRONO 5K', cardio_mardi: '30 min' },
  { rameur: '20 min — cadence 24', corde: '5 rounds 3 min continues', sac: '5 rounds — ajouter crochet (1-2-3)', renfo: 'idem + burpees complets', course: '7 km', cardio_mardi: '30 min — alterner vélo/rameur' },
  { rameur: '20 min — cadence 24-26', corde: '5 rounds', sac: '6 rounds — combos 1-2-3', renfo: 'idem S5', course: '7 km — negative split', cardio_mardi: '30 min' },
  { rameur: '22 min — cadence 26', corde: '6 rounds — varier pieds', sac: '6 rounds — combos 1-2-3-2', renfo: 'idem + squats x20', course: '7.5 km', cardio_mardi: '35 min' },
  { rameur: '22 min + TEST 5000m', corde: '6 rounds', sac: '6 rounds — combos variés', renfo: 'idem S7', course: '8 km — CHRONO', cardio_mardi: '35 min + test 5000m rameur' },
  { rameur: '20 min — 1 min fort / 2 min modéré', corde: '6 rounds — montées genoux', sac: '6 rounds — tête + corps', renfo: 'idem S8', course: 'Fractionné — 10 min échauff + 8×(3 min vite / 1 min marche) + 10 min retour', cardio_mardi: '35 min — alterné fort/modéré' },
  { rameur: '20 min — alterné', corde: '7 rounds', sac: '7 rounds — tête/corps', renfo: 'idem + kettlebell (si acheté)', course: '8 km long', cardio_mardi: '35 min' },
  { rameur: '25 min — alterné', corde: '7 rounds — croisés', sac: '7 rounds — 4-5 coups', renfo: 'idem S10', course: 'Fractionné — 10×(3 min / 1 min)', cardio_mardi: '40 min' },
  { rameur: '25 min + RETEST 5000m', corde: '7 rounds', sac: '7 rounds — tout', renfo: 'idem S11', course: '9 km — CHRONO FINAL', cardio_mardi: '40 min + retest 5000m' }
];

// ─── Config types ─────────────────────────────────────────────────────────────
const TYPES = {
  rameur:       { label: 'Rameur',          icon: '🚣', color: '#FC4C02' },
  velo:         { label: 'Vélo apprt.',     icon: '🚴', color: '#38bdf8' },
  course_ext:   { label: 'Course ext.',     icon: '🏃', color: '#ff8c42' },
  course_tapis: { label: 'Course tapis',    icon: '🏃', color: '#ff6a00' },
  sac:          { label: 'Sac de frappe',   icon: '🥊', color: '#ef4444' },
  corde:        { label: 'Corde à sauter',  icon: '⚡', color: '#a855f7' },
  boxe:         { label: 'Boxe (cours)',    icon: '🥊', color: '#dc2626' },
  renfo:        { label: 'Renforcement',    icon: '💪', color: '#4ade80' },
  cardio:       { label: 'Cardio',          icon: '❤️', color: '#22d3ee' },
  autre:        { label: 'Autre',           icon: '⚡', color: '#6b7280' },
};

function typeInfo(t) { return TYPES[t] || TYPES.autre; }
function typeColor(t) { return typeInfo(t).color; }
function typeLabel(t) { return typeInfo(t).label; }
function typeIcon(t)  { return typeInfo(t).icon; }

// Nettoie les titres Garmin verbeux ("Noyal-sur-Vilaine Course à pied" → label propre)
function cleanTitle(s) {
  if (!s.title || s.source !== 'garmin') return s.title || typeLabel(s.type);
  const t = s.title.trim();
  // Patterns Garmin à virer : "Ville Course à pied", "Ville Running", etc.
  const garminNoise = [
    /^[\w\-]+-sur-[\w\-]+\s+/i,   // "Noyal-sur-Vilaine "
    /^[\w\-]+-[\w\-]+-[\w\-]+\s+/i, // triple-composé
    /^[A-Z][a-zÀ-ÿ]+-[A-Z][a-zÀ-ÿ]+\s+/,  // "Saint-Grégoire "
  ];
  let clean = t;
  for (const re of garminNoise) clean = clean.replace(re, '');
  // Si après nettoyage c'est un titre Garmin générique → remplace par label
  const generic = ['Course à pied', 'Running', 'Cycling', 'Rowing', 'Indoor Rowing',
    'Jump Rope', 'Treadmill Running', 'Strength Training', 'Cardio'];
  if (generic.some(g => clean.toLowerCase() === g.toLowerCase())) return typeLabel(s.type);
  return clean || typeLabel(s.type);
}

// ─── Utilitaires ──────────────────────────────────────────────────────────────
function formatDuration(min) {
  if (!min) return '—';
  const h = Math.floor(min / 60), m = Math.round(min % 60);
  if (h > 0) return `${h}h${String(m).padStart(2,'0')}`;
  return `${m} min`;
}
function formatPace(secPerKm) {
  if (!secPerKm) return '—';
  const m = Math.floor(secPerKm / 60), s = Math.round(secPerKm % 60);
  return `${m}:${String(s).padStart(2,'0')} /km`;
}
function parsePaceInput(str) {
  if (!str) return null;
  const p = str.split(':');
  if (p.length !== 2) return null;
  return parseInt(p[0]) * 60 + parseInt(p[1]);
}
function formatDate(dateStr, opts = {}) {
  if (!dateStr) return '—';
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('fr-FR', { day:'2-digit', month:'short', year:'numeric', ...opts });
}
function formatDateShort(dateStr) {
  return formatDate(dateStr, { day:'2-digit', month:'short', year: undefined });
}
function formatWeekRange(startStr) {
  const s = new Date(startStr + 'T12:00:00');
  const e = new Date(s); e.setDate(e.getDate() + 6);
  return `${s.toLocaleDateString('fr-FR',{day:'2-digit',month:'short'})} – ${e.toLocaleDateString('fr-FR',{day:'2-digit',month:'short',year:'numeric'})}`;
}
function today() { return new Date().toISOString().split('T')[0]; }
function getMondayOf(dateStr) {
  const d = new Date(dateStr + 'T12:00:00');
  const day = d.getDay() === 0 ? 7 : d.getDay();
  d.setDate(d.getDate() - (day - 1));
  return d.toISOString().split('T')[0];
}
function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T12:00:00');
  d.setDate(d.getDate() + n);
  return d.toISOString().split('T')[0];
}

// ─── Helpers planning ─────────────────────────────────────────────────────────
function getCurrentWeek(startDate) {
  const start = new Date(startDate); start.setHours(0,0,0,0);
  const now = new Date(); now.setHours(0,0,0,0);
  return Math.max(1, Math.floor((now - start) / (1000*60*60*24*7)) + 1);
}
function getWeekBounds(startDate, weekNum) {
  const s = new Date(startDate); s.setHours(0,0,0,0);
  s.setDate(s.getDate() + (weekNum - 1) * 7);
  const e = new Date(s); e.setDate(e.getDate() + 6);
  return { start: s.toISOString().split('T')[0], end: e.toISOString().split('T')[0] };
}

// ─── DB — localStorage ────────────────────────────────────────────────────────
const DB = {
  SK: 'coach_sessions',
  CK: 'coach_settings',
  IK: 'coach_init',

  // ── Sauvegarde en ligne via Cloudflare (/api/backup) ───────────────────────
  // Le navigateur ne détient AUCUN token. Il appelle /api/backup (même origine),
  // protégé par Cloudflare Access (login Google). Le secret GitHub vit
  // uniquement côté serveur, dans la Pages Function.
  async backup() {
    try {
      const r = await fetch('/api/backup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessions: this.getSessions(), settings: this.getSettings() }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d.ok) return { ok: false, reason: d.error || `HTTP ${r.status}` };
      localStorage.setItem('coach_last_backup', new Date().toISOString());
      return { ok: true };
    } catch (e) {
      return { ok: false, reason: e.message };
    }
  },

  lastBackup() { return localStorage.getItem('coach_last_backup'); },

  getSessions() {
    const data = JSON.parse(localStorage.getItem(this.SK) || '[]');
    return data.sort((a, b) => b.date.localeCompare(a.date) || String(b.id).localeCompare(String(a.id)));
  },
  saveSessions(arr) { localStorage.setItem(this.SK, JSON.stringify(arr)); },

  addSession(data) {
    const sessions = JSON.parse(localStorage.getItem(this.SK) || '[]');
    const s = { ...data, id: `m${Date.now()}`, source: 'manual' };
    sessions.push(s);
    this.saveSessions(sessions);
    return s;
  },
  updateSession(id, data) {
    const sessions = JSON.parse(localStorage.getItem(this.SK) || '[]');
    const i = sessions.findIndex(s => s.id === id);
    if (i === -1) return null;
    sessions[i] = { ...sessions[i], ...data, id };
    this.saveSessions(sessions);
    return sessions[i];
  },
  deleteSession(id) {
    this.saveSessions(JSON.parse(localStorage.getItem(this.SK) || '[]').filter(s => s.id !== id));
  },

  getSettings() {
    return JSON.parse(localStorage.getItem(this.CK) || JSON.stringify({
      program_start_date: '2026-04-06',
      user_name: 'Sébastien',
      training_days: ['vendredi', 'dimanche'],
      bonus_day: 'mardi',
    }));
  },
  saveSettings(data) { localStorage.setItem(this.CK, JSON.stringify(data)); },

  // ── Sommeil (lecture seule, source Garmin) ─────────────────────────────────
  SLK: 'coach_sleep',
  getSleep() { return JSON.parse(localStorage.getItem(this.SLK) || '[]'); },
  async syncSleep() {
    try {
      const r = await fetch('./data/sleep.json?t=' + Date.now());
      if (!r.ok) return;
      const data = await r.json();
      if (Array.isArray(data)) localStorage.setItem(this.SLK, JSON.stringify(data));
    } catch (e) {}
  },

  async syncFromServer() {
    try {
      // Fichier servi par Cloudflare Pages, tenu à jour par la sync Garmin (GitHub Actions).
      const r = await fetch('./data/sessions.json?t=' + Date.now());
      if (!r.ok) return 0;
      const incoming = await r.json();
      const existing = JSON.parse(localStorage.getItem(this.SK) || '[]');
      let added = 0;
      for (const s of incoming) {
        if (!existing.some(e => e.id === s.id)) { existing.push(s); added++; }
      }
      if (added > 0) this.saveSessions(existing);
      this.dedup();
      return added;
    } catch (e) { return -1; }
  },

  dedup() {
    const sessions = this.getSessions();
    const idPriority = id => {
      if (/^g_\d{10,}$/.test(id)) return 0;  // vrai ID Garmin
      if (/^g_\d{4}-/.test(id))   return 1;  // garmin date-based
      if (/^g\d{1,4}$/.test(id))  return 2;  // anciens courts
      if (id.startsWith('s_'))     return 3;  // strava
      return 4;                                // manual
    };
    // Regrouper par date+type, garder le meilleur ID
    const groups = new Map();
    for (const s of sessions) {
      const k = `${s.date}|${s.type}`;
      if (!groups.has(k)) { groups.set(k, []); }
      groups.get(k).push(s);
    }
    // Deux entrées = la MÊME activité (donc doublon) seulement si durées
    // proches (±3 min) ET distances cohérentes. Deux courses le même jour
    // de distances différentes sont ainsi conservées.
    const sameActivity = (a, b) => {
      const da = parseFloat(a.duration_min) || 0, db = parseFloat(b.duration_min) || 0;
      if (Math.abs(da - db) > 3) return false;
      const ka = a.distance_km, kb = b.distance_km;
      if (ka && kb) return Math.abs(ka - kb) <= 0.5; // distances connues → doublon si proches
      return true; // pas de distance des deux côtés → on se fie à la durée
    };
    const deduped = [];
    for (const group of groups.values()) {
      if (group.length === 1) { deduped.push(group[0]); continue; }
      // Garder le meilleur ID en premier (vrai Garmin > date-based > manuel)
      group.sort((a, b) => idPriority(a.id) - idPriority(b.id));
      const kept = [];
      for (const cand of group) {
        if (!kept.some(k => sameActivity(k, cand))) kept.push(cand);
      }
      deduped.push(...kept);
    }
    deduped.sort((a, b) => b.date.localeCompare(a.date));
    if (deduped.length < sessions.length) this.saveSessions(deduped);
    return sessions.length - deduped.length;
  },

  async init() {
    if (localStorage.getItem(this.IK)) {
      this.dedup();
      return;
    }
    try {
      const r = await fetch('./data/sessions.json');
      if (r.ok) { const d = await r.json(); this.saveSessions(d); }
    } catch(e) {}
    try {
      const r = await fetch('./data/settings.json');
      if (r.ok) { const d = await r.json(); this.saveSettings(d); }
    } catch(e) {}
    localStorage.setItem(this.IK, '1');
  },

};

// ─── Stats (côté client) ──────────────────────────────────────────────────────
function computeStats(sessions) {
  const byWeek = {}, byMonth = {}, byType = {};

  sessions.forEach(s => {
    // par semaine (clé = lundi)
    const wk = getMondayOf(s.date);
    if (!byWeek[wk]) byWeek[wk] = { sessions:0, minutes:0, calories:0, types:{} };
    byWeek[wk].sessions++;
    byWeek[wk].minutes += s.duration_min || 0;
    byWeek[wk].calories += s.calories || 0;
    byWeek[wk].types[s.type] = (byWeek[wk].types[s.type] || 0) + (s.duration_min || 0);
    // par mois
    const m = s.date.slice(0,7);
    if (!byMonth[m]) byMonth[m] = { sessions:0, minutes:0, calories:0, distance_km:0, types:{} };
    byMonth[m].sessions++;
    byMonth[m].minutes += s.duration_min || 0;
    byMonth[m].calories += s.calories || 0;
    byMonth[m].distance_km += s.distance_km || 0;
    byMonth[m].types[s.type] = (byMonth[m].types[s.type] || 0) + (s.duration_min || 0);
    // par type
    byType[s.type] = (byType[s.type] || 0) + 1;
  });

  const courseSessions = sessions
    .filter(s => ['course_ext','course_tapis'].includes(s.type) && s.distance_km)
    .sort((a,b) => a.date.localeCompare(b.date));
  const rameurSessions = sessions
    .filter(s => s.type === 'rameur')
    .sort((a,b) => a.date.localeCompare(b.date));

  const totals = {
    sessions: sessions.length,
    minutes: Math.round(sessions.reduce((a,s) => a+(s.duration_min||0), 0)),
    calories: sessions.reduce((a,s) => a+(s.calories||0), 0),
    distance_km: parseFloat(sessions.reduce((a,s) => a+(s.distance_km||0), 0).toFixed(2))
  };

  const firstDate = sessions.length
    ? sessions.reduce((a,s) => s.date < a ? s.date : a, sessions[0].date)
    : null;

  return { byWeek, byMonth, byType, courseSessions, rameurSessions, totals, firstDate };
}

// ─── Stats annuelles ──────────────────────────────────────────────────────────
function computeAnnualStats(sessions) {
  const byYear = {};
  sessions.forEach(s => {
    const yr = s.date.slice(0, 4);
    if (!byYear[yr]) byYear[yr] = { sessions: 0, minutes: 0, calories: 0, distance_km: 0, byType: {} };
    byYear[yr].sessions++;
    byYear[yr].minutes += s.duration_min || 0;
    byYear[yr].calories += s.calories || 0;
    byYear[yr].distance_km += s.distance_km || 0;
    byYear[yr].byType[s.type] = (byYear[yr].byType[s.type] || 0) + 1;
  });
  return byYear;
}

// ─── Adaptation du programme ──────────────────────────────────────────────────
function computeAdaptedPlan(sessions, currentWeek) {
  if (currentWeek < 2) return null;
  const settings = DB.getSettings();
  const { start: prevStart, end: prevEnd } = getWeekBounds(settings.program_start_date, currentWeek - 1);
  const prevSessions = sessions.filter(s => s.date >= prevStart && s.date <= prevEnd);
  const plan = PROGRAM[currentWeek - 1];
  if (!plan) return null;
  const suggestions = [];

  const coursePlan = plan.course?.match(/(\d+(?:\.\d+)?)\s*km/);
  const courseDone = prevSessions.filter(s => ['course_ext', 'course_tapis'].includes(s.type) && s.distance_km);
  if (coursePlan && courseDone.length > 0) {
    const planKm = parseFloat(coursePlan[1]);
    const doneKm = Math.max(...courseDone.map(s => s.distance_km));
    const diff = doneKm - planKm;
    if (diff > planKm * 0.15) {
      suggestions.push({ type: 'course', msg: `Tu as fait ${doneKm} km sem. passée (plan: ${planKm} km) — vise ${(planKm + 0.5).toFixed(1)} km` });
    } else if (diff < -planKm * 0.2) {
      suggestions.push({ type: 'course', msg: `Distance courte sem. passée — reste sur ${planKm} km, pas de pression` });
    }
  }

  const rameurPlan = plan.rameur?.match(/(\d+)\s*min/);
  const rameurDone = prevSessions.filter(s => s.type === 'rameur' && s.duration_min);
  if (rameurPlan && rameurDone.length > 0) {
    const planMin = parseInt(rameurPlan[1]);
    const doneMin = Math.max(...rameurDone.map(s => s.duration_min));
    if (doneMin >= planMin + 5) {
      suggestions.push({ type: 'rameur', msg: `Rameur: ${Math.round(doneMin)} min effectués — tu peux pousser à ${planMin + 3} min` });
    }
  }

  return suggestions.length > 0 ? suggestions : null;
}

// ─── Planning (côté client) ───────────────────────────────────────────────────
function computePlanning(sessions) {
  const settings = DB.getSettings();
  const currentWeek = getCurrentWeek(settings.program_start_date);
  const totalWeeks = PROGRAM.length;
  const isProgramDone = currentWeek > totalWeeks;
  const displayWeek = Math.min(currentWeek, totalWeeks);
  const weekPlan = PROGRAM[displayWeek - 1];
  const { start, end } = getWeekBounds(settings.program_start_date, displayWeek);
  const weekSessions = sessions.filter(s => s.date >= start && s.date <= end);

  const allWeeks = PROGRAM.map((plan, i) => {
    const w = i + 1;
    const b = getWeekBounds(settings.program_start_date, w);
    const wSessions = sessions.filter(s => s.date >= b.start && s.date <= b.end);
    return { week: w, start: b.start, end: b.end, plan, sessions: wSessions, sessionCount: wSessions.length };
  });

  return { currentWeek, isProgramDone, displayWeek, weekPlan, weekStart: start, weekEnd: end, weekSessions, allWeeks };
}

// ─── CSV Parsers ──────────────────────────────────────────────────────────────
function parseCSVLine(line) {
  const res = []; let inQ = false, cur = '';
  for (const ch of line) {
    if (ch === '"') { inQ = !inQ; }
    else if (ch === ',' && !inQ) { res.push(cur); cur = ''; }
    else { cur += ch; }
  }
  res.push(cur);
  return res;
}

function parseDurationGarmin(raw) {
  if (!raw || raw === '--') return null;
  const c = raw.replace(',', '.');
  const p = c.split(':');
  if (p.length === 3) return parseFloat(p[0])*60 + parseFloat(p[1]) + parseFloat(p[2])/60;
  if (p.length === 2) return parseFloat(p[0]) + parseFloat(p[1])/60;
  return null;
}

function parsePaceStr(raw) {
  if (!raw || raw === '--') return null;
  const p = raw.split(':');
  return p.length === 2 ? parseInt(p[0])*60 + parseInt(p[1]) : null;
}

function mapBoxeType(dur) { return (dur && dur >= 50) ? 'boxe' : 'sac'; }

function mapGarminType(gType, title, dur) {
  const t = (gType||'').toLowerCase(), ti = (title||'').toLowerCase();
  if (t === 'boxe') return mapBoxeType(dur);
  if (t === 'cardio' && (ti.includes('jump rope') || ti.includes('corde'))) return 'corde';
  if (t.includes('rameur')) return 'rameur';
  if (t === 'course à pied sur tapis roulant' || ti.includes('tapis')) return 'course_tapis';
  if (t === 'course à pied') return 'course_ext';
  if (t.includes('vélo') || t.includes('velo') || t.includes('cyclisme')) return 'velo';
  if (t === 'cardio') return 'cardio';
  return 'autre';
}

function parseGarminCSV(content) {
  const lines = content.split('\n').filter(l => l.trim());
  if (lines.length < 2) return [];
  const out = [];
  for (let i = 1; i < lines.length; i++) {
    const r = parseCSVLine(lines[i]);
    if (!r || r.length < 5) continue;
    const datetime = r[1]?.trim(); if (!datetime) continue;
    const date = datetime.split(' ')[0];
    const dur = parseDurationGarmin(r[6]?.trim());
    const dist = r[4]?.trim();
    out.push({
      id: `g_${date}_${i}`,
      date, source: 'garmin',
      type: mapGarminType(r[0]?.trim(), r[3]?.trim(), dur),
      title: r[3]?.trim() || r[0]?.trim(),
      duration_min: dur,
      calories: parseInt(r[5]) || null,
      hr_avg: r[7] && r[7] !== '--' ? parseInt(r[7]) : null,
      hr_max: r[8] && r[8] !== '--' ? parseInt(r[8]) : null,
      distance_km: dist && dist !== '--' ? parseFloat(dist.replace(',','.')) || null : null,
      pace_sec_km: parsePaceStr(r[13]?.trim()),
      elevation_m: r[14] && r[14] !== '--' ? parseInt(r[14]) || null : null,
      rounds: null, notes: ''
    });
  }
  return out;
}

function parseStravaDate(raw) {
  if (!raw) return null;
  const mo = { 'janv':1,'févr':2,'mars':3,'avr':4,'mai':5,'juin':6,'juil':7,'août':8,'sept':9,'oct':10,'nov':11,'déc':12 };
  const m = raw.match(/(\d+)\s+([^\s.]+)\.?\s+(\d{4})/);
  if (!m) return null;
  const month = mo[m[2].toLowerCase()];
  if (!month) return null;
  return `${m[3]}-${String(month).padStart(2,'0')}-${m[1].padStart(2,'0')}`;
}

function mapStravaType(t) {
  const map = { 'Course à pied':'course_ext','Vélo':'velo','Randonnée':'course_ext','Marche':'autre','Aviron':'rameur','Elliptique':'velo','Entraînement':'renfo','Crossfit':'renfo','Natation':'autre' };
  return map[t] || 'autre';
}

function parseStravaCSV(content) {
  const lines = content.split('\n').filter(l => l.trim());
  if (lines.length < 2) return [];
  const MAX = 8 * 3600;
  const out = [];
  for (let i = 1; i < lines.length; i++) {
    const r = parseCSVLine(lines[i]);
    if (!r || r.length < 6) continue;
    const date = parseStravaDate(r[1]?.trim()); if (!date) continue;
    let dur = parseFloat(r[5]?.replace(',','.')) || null;
    const dur15 = parseFloat(r[15]?.replace(',','.')) || null;
    const dur16 = parseFloat(r[16]?.replace(',','.')) || null;
    if (!dur || dur > MAX) dur = dur15 || dur16;
    const candidates = [parseFloat(r[5]),dur15,dur16].filter(v=>v&&v>0&&v<=MAX);
    if (candidates.length && (!dur||dur>MAX)) dur = Math.min(...candidates);
    const dist = parseFloat(r[6]?.replace(',','.')) || null;
    const dur_min = dur ? parseFloat((dur/60).toFixed(1)) : null;
    out.push({
      id: `s_${r[0]?.trim()}`,
      date, source: 'strava',
      type: mapStravaType(r[3]?.trim()),
      title: r[2]?.trim() || r[3]?.trim(),
      duration_min: dur_min,
      calories: parseInt(r[34]) || null,
      hr_avg: parseInt(r[31]) || null,
      hr_max: parseInt(r[7]) || null,
      distance_km: dist && dist > 0.1 ? parseFloat(dist.toFixed(2)) : null,
      pace_sec_km: (dur && dist && dist > 0.1) ? Math.round(dur/dist) : null,
      elevation_m: (parseFloat(r[20])||0) > 0 ? Math.round(parseFloat(r[20])) : null,
      rounds: null, notes: ''
    });
  }
  return out;
}

function isDuplicate(existing, imp) {
  if (existing.some(ex => ex.date===imp.date && ex.type===imp.type && Math.abs((ex.duration_min||0)-(imp.duration_min||0))<5)) return true;
  return existing.filter(ex => ex.date===imp.date).some(ex => Math.abs((ex.duration_min||0)-(imp.duration_min||0))<3);
}

// ─── État global ──────────────────────────────────────────────────────────────
let editingSessionId = null;
let activeFilter = 'all';
let activeYear = null;
let chartInstances = {};

// ─── Toast + sauvegarde GitHub auto ─────────────────────────────────────────────
function toast(msg, kind = '') {
  let t = document.getElementById('toast');
  if (!t) { t = document.createElement('div'); t.id = 'toast'; document.body.appendChild(t); }
  t.className = `toast show ${kind}`;
  t.textContent = msg;
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove('show'), 2600);
}

let backupTimer = null;
function scheduleBackup() {
  clearTimeout(backupTimer);
  backupTimer = setTimeout(async () => {
    toast('💾 Sauvegarde…');
    const res = await DB.backup();
    toast(res.ok ? '✅ Sauvegardé' : '❌ Sauvegarde échouée', res.ok ? 'ok' : 'err');
  }, 2500);
}

Chart.defaults.color = '#888888';
Chart.defaults.borderColor = '#222222';
Chart.defaults.font.family = "-apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif";

function destroyCharts() { Object.values(chartInstances).forEach(c=>c.destroy()); chartInstances={}; }

// ─── Router ───────────────────────────────────────────────────────────────────
function navigate(view) {
  closeMobileNav();
  document.querySelectorAll('.nav-link').forEach(l => l.classList.toggle('active', l.dataset.view===view));
  destroyCharts();
  const main = document.getElementById('main');
  main.innerHTML = '<div class="loader">Chargement…</div>';
  ({ dashboard, seances, planning, stats, recup: recupView, import: importView }[view] || dashboard)(main);
}
window.addEventListener('hashchange', () => navigate(location.hash.slice(1) || 'dashboard'));

// ─── VUE : DASHBOARD ─────────────────────────────────────────────────────────
function dashboard(main) {
  const sessions  = DB.getSessions();
  const plan      = computePlanning(sessions);
  const settings  = DB.getSettings();
  const todayStr  = today();
  const thisMonday = getMondayOf(todayStr);
  const lastMonday = addDays(thisMonday, -7);
  const thisSunday = addDays(thisMonday, 6);
  const lastSunday = addDays(lastMonday, 6);
  const thisWeekSess = sessions.filter(s => s.date >= thisMonday && s.date <= thisSunday);
  const lastWeekSess = sessions.filter(s => s.date >= lastMonday && s.date <= lastSunday);
  const monthStr = todayStr.slice(0,7);
  const monthSess = sessions.filter(s => s.date.startsWith(monthStr));
  const monthMin = monthSess.reduce((a,s)=>a+(s.duration_min||0),0);
  const monthKm  = parseFloat(monthSess.reduce((a,s)=>a+(s.distance_km||0),0).toFixed(1));
  const monthCal = monthSess.reduce((a,s)=>a+(s.calories||0),0);

  // ── Message d'accueil selon l'heure ──
  const hour = new Date().getHours();
  const greeting = hour >= 5 && hour < 12 ? 'Bonjour'
    : hour >= 12 && hour < 18 ? 'Bonne après-midi'
    : hour >= 18 ? 'Bonne soirée'
    : 'Bonne nuit 😴';
  const userName = settings.user_name || 'Sébastien';

  // ── Streak de jours consécutifs avec au moins 1 séance ──
  const sessionDates = new Set(sessions.map(s => s.date));
  let streak = 0;
  let checkDate = todayStr;
  // Si pas de séance aujourd'hui, commencer à vérifier depuis hier
  if (!sessionDates.has(checkDate)) checkDate = addDays(checkDate, -1);
  while (sessionDates.has(checkDate)) {
    streak++;
    checkDate = addDays(checkDate, -1);
  }
  const streakBadge = streak >= 3
    ? `<span class="streak-badge">🔥 ${streak} jours</span>`
    : '';

  // ── Message de motivation dynamique ──
  const sortedSessions = sessions.slice().sort((a, b) => b.date.localeCompare(a.date));
  const lastSessionDate = sortedSessions.length ? sortedSessions[0].date : null;
  const daysSinceLast = lastSessionDate
    ? Math.floor((new Date(todayStr + 'T12:00:00') - new Date(lastSessionDate + 'T12:00:00')) / (1000 * 60 * 60 * 24))
    : Infinity;
  const weekCount = thisWeekSess.length;
  const motiv = daysSinceLast > 7
    ? 'Ça fait un moment… Reprends dès aujourd\'hui.'
    : weekCount === 0 ? 'Semaine vierge — la première séance est la plus dure.'
    : weekCount === 1 ? 'C\'est parti ! Continue sur ta lancée.'
    : weekCount === 2 ? 'Belle semaine en cours 💪'
    : 'Semaine de feu 🔥 Excellent rythme.';

  main.innerHTML = `
    <div class="page-header">
      <div class="dash-greeting">
        <h2>${greeting}, ${userName} ${streakBadge}</h2>
        <div class="page-sub">${motiv}</div>
      </div>
    </div>

    <div class="kpi-row">
      <div class="kpi-card">
        <div class="kpi-lbl">Séances</div>
        <div class="kpi-num">${monthSess.length}</div>
        <div class="kpi-sub">ce mois · ${new Date().toLocaleDateString('fr-FR',{month:'long'})}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-lbl">Durée</div>
        <div class="kpi-num">${(monthMin/60).toFixed(1)}<span class="u"> h</span></div>
        <div class="kpi-sub">ce mois</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-lbl">Distance</div>
        <div class="kpi-num">${monthKm||'—'}<span class="u">${monthKm?' km':''}</span></div>
        <div class="kpi-sub">course ce mois</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-lbl">Calories</div>
        <div class="kpi-num">${monthCal>0?(monthCal/1000).toFixed(1)+'k':'—'}</div>
        <div class="kpi-sub">kcal brûlées</div>
      </div>
    </div>

    <div class="week-card">
      <div class="week-inner" id="week-compare"></div>
    </div>

    <div class="dash-grid">
      <div class="prog-card">
        <div class="card-head">
          <span class="card-head-lbl">Programme S${plan.currentWeek}/12</span>
          <span class="card-badge">${plan.currentWeek <= 12 ? `S${plan.currentWeek}/12` : 'Libre'}</span>
        </div>
        <div id="week-plan"></div>
      </div>
      <div class="recent-card">
        <div class="card-head">
          <span class="card-head-lbl">Dernières séances</span>
          <span class="card-badge">${sessions.length} total</span>
        </div>
        <div id="recent-sessions"></div>
      </div>
    </div>
  `;

  document.getElementById('week-compare').innerHTML = buildWeekCompare(thisWeekSess, lastWeekSess, thisMonday, thisSunday, lastMonday, lastSunday);
  renderWeekPlan(plan, sessions);
  const recentEl = document.getElementById('recent-sessions');
  sessions.slice(0,8).forEach(s => recentEl.appendChild(buildRecentRow(s)));
}

function buildWeekCompare(thisSess, lastSess, thisStart, thisEnd, lastStart, lastEnd) {
  function wStats(s) {
    return { count:s.length, min:s.reduce((a,x)=>a+(x.duration_min||0),0), km:parseFloat(s.reduce((a,x)=>a+(x.distance_km||0),0).toFixed(1)), types:[...new Set(s.map(x=>x.type))] };
  }
  function badge(a, b, unit) {
    if (!b) return '';
    const d = a - b;
    if (d === 0) return `<span class="wc-badge" style="color:var(--t2);border-color:var(--b1)">= S-1</span>`;
    const sign = d>0?'+':'', color = d>0?'var(--ok)':'var(--bad)';
    return `<span class="wc-badge" style="color:${color};border-color:${color}">${sign}${Number.isInteger(d)?d:d.toFixed(1)}${unit}</span>`;
  }
  const tw=wStats(thisSess), lw=wStats(lastSess);
  const noSess = `<span class="wc-no">Aucune séance</span>`;
  const d1=badge(tw.count,lw.count,' séance'+(Math.abs(tw.count-lw.count)>1?'s':''));
  const d2=badge(parseFloat((tw.min/60).toFixed(1)),parseFloat((lw.min/60).toFixed(1)),'h');
  const d3=(tw.km>0||lw.km>0)?badge(tw.km,lw.km,' km'):'';
  return `
    <div class="wc-col">
      <div class="wc-head">Cette semaine</div>
      <div class="wc-dates">${formatDateShort(thisStart)} – ${formatDateShort(thisEnd)}</div>
      <div class="wc-metrics">
        <div class="wc-metric"><span class="wc-val">${tw.count}</span><span class="wc-key">séances</span>${d1}</div>
        <div class="wc-metric"><span class="wc-val">${formatDuration(tw.min)}</span><span class="wc-key">total</span>${d2}</div>
        ${tw.km>0?`<div class="wc-metric"><span class="wc-val">${tw.km} km</span><span class="wc-key">course</span>${d3}</div>`:''}
      </div>
      <div class="wc-types">${tw.types.map(t=>`<span title="${typeLabel(t)}">${typeIcon(t)}</span>`).join(' ')||noSess}</div>
    </div>
    <div class="wc-col">
      <div class="wc-head dim">Semaine passée</div>
      <div class="wc-dates">${formatDateShort(lastStart)} – ${formatDateShort(lastEnd)}</div>
      <div class="wc-metrics">
        <div class="wc-metric"><span class="wc-val">${lw.count}</span><span class="wc-key">séances</span></div>
        <div class="wc-metric"><span class="wc-val">${formatDuration(lw.min)}</span><span class="wc-key">total</span></div>
        ${lw.km>0?`<div class="wc-metric"><span class="wc-val">${lw.km} km</span><span class="wc-key">course</span></div>`:''}
      </div>
      <div class="wc-types">${lw.types.map(t=>`<span title="${typeLabel(t)}">${typeIcon(t)}</span>`).join(' ')||noSess}</div>
    </div>`;
}

function renderWeekPlan(planning, sessions) {
  const el = document.getElementById('week-plan'); if (!el) return;
  const plan = planning.weekPlan;
  if (!plan) { el.innerHTML='<div class="empty-state"><p>Programme non configuré</p></div>'; return; }

  const suggestions = computeAdaptedPlan(sessions, planning.currentWeek);
  if (suggestions && suggestions.length > 0) {
    const hint = document.createElement('div');
    hint.className = 'adaptive-hint';
    hint.innerHTML = `<b>Suggestions form</b>${suggestions.map(s=>`${typeIcon(s.type)} ${s.msg}`).join(' · ')}`;
    el.appendChild(hint);
  }

  const acts = [
    { name:'Rameur', type:'rameur', desc:plan.rameur },
    { name:'Corde', type:'corde', desc:plan.corde },
    { name:'Sac', type:'sac', desc:plan.sac },
    { name:'Renfo', type:'renfo', desc:plan.renfo },
    { name:'Course', type:'course', desc:plan.course },
    { name:'Cardio (bonus)', type:'cardio_mardi', desc:plan.cardio_mardi },
  ];
  acts.forEach(act => {
    const done = findMatchingSession(planning.weekSessions, act.type);
    const item = document.createElement('div');
    item.className = 'prog-item';
    let doneHtml = '';
    if (done) {
      let d = formatDuration(done.duration_min);
      if (done.distance_km) d += ` · ${done.distance_km} km`;
      if (done.rounds) d += ` · ${done.rounds} rounds`;
      doneHtml = `<div class="prog-done">✓ ${d}</div>`;
      const diff = computeDiff(act.desc, done);
      if (diff) doneHtml += `<div class="prog-diff">${diff}</div>`;
    }
    item.innerHTML = `<div class="prog-icon" style="color:${typeColor(act.type)}">${typeIcon(act.type)}</div><div class="prog-body"><div class="prog-name">${act.name}</div><div class="prog-desc">${act.desc}</div>${doneHtml}</div><div class="prog-check">${done?'✓':'○'}</div>`;
    el.appendChild(item);
  });
}

function findMatchingSession(sessions, actType) {
  const map = { rameur:['rameur'], corde:['corde'], sac:['sac','boxe'], renfo:['renfo'], course:['course_ext','course_tapis'], cardio_mardi:['velo','rameur','cardio','course_ext','course_tapis'] };
  const types = map[actType] || [actType];
  return sessions.find(s => types.includes(s.type)) || null;
}

function computeDiff(planDesc, done) {
  const dm = planDesc.match(/(\d+)\s*min/i);
  if (dm && done.duration_min) {
    const diff = Math.round(done.duration_min) - parseInt(dm[1]);
    if (Math.abs(diff)>=3) return diff>0?`+${diff} min vs plan`:`${diff} min vs plan`;
  }
  const rm = planDesc.match(/(\d+)\s*round/i);
  if (rm && done.rounds) {
    const diff = done.rounds - parseInt(rm[1]);
    if (Math.abs(diff)>=1) return diff>0?`+${diff} round vs plan`:`${diff} round vs plan`;
  }
  return null;
}

function buildRecentRow(s) {
  const div = document.createElement('div');
  div.className = 'recent-row';
  div.onclick = () => openEditModal(s);
  let meta = `<span>${formatDuration(s.duration_min)}</span>`;
  if (s.distance_km) meta += `<span class="r-hi">${s.distance_km} km</span>`;
  if (s.calories) meta += `<span>${s.calories} kcal</span>`;
  div.innerHTML = `<div class="r-dot" style="background:${typeColor(s.type)}"></div><div class="r-date">${formatDateShort(s.date)}</div><div class="r-title">${typeIcon(s.type)} ${cleanTitle(s)}</div><div class="r-meta">${meta}</div>`;
  return div;
}

function buildSessionRow(s) {
  const div = document.createElement('div');
  div.className = 'sess-row';
  div.onclick = () => openEditModal(s);
  let statsHtml = '';
  if (s.distance_km) statsHtml += `<div class="ss"><span class="ss-val ss-hi">${s.distance_km} km</span><span class="ss-key">distance</span></div>`;
  if (s.calories) statsHtml += `<div class="ss"><span class="ss-val">${s.calories}</span><span class="ss-key">kcal</span></div>`;
  if (s.hr_avg) statsHtml += `<div class="ss"><span class="ss-val">${s.hr_avg}</span><span class="ss-key">bpm</span></div>`;
  const src = s.source==='garmin'?'Garmin':s.source==='strava'?'Strava':'Manuel';
  div.innerHTML = `<div class="sess-bar" style="background:${typeColor(s.type)}"></div><div class="sess-date">${formatDateShort(s.date)}</div><div class="sess-main"><div class="sess-title">${typeIcon(s.type)} ${cleanTitle(s)}</div><div class="sess-sub">${typeLabel(s.type)}</div></div><div class="sess-stats">${statsHtml}</div><div class="sess-src"><span class="src-badge">${src} · ${formatDuration(s.duration_min)}</span></div>`;
  return div;
}

// ─── VUE : SÉANCES ───────────────────────────────────────────────────────────
function seances(main) {
  const sessions = DB.getSessions();
  main.innerHTML = `
    <div class="page-header">
      <h2>Séances</h2>
      <div class="page-sub">${sessions.length} enregistrées</div>
    </div>
    <div class="filters" id="filters"></div>
    <div class="year-tabs-wrap" id="year-tabs-wrap"></div>
    <div id="sessions-list"></div>
  `;

  // Filtres type
  const filterDefs = [
    {key:'all',label:'Tout'},{key:'course_ext',label:'🏃 Course ext.'},{key:'course_tapis',label:'🏃 Tapis'},
    {key:'rameur',label:'🚣 Rameur'},{key:'velo',label:'🚴 Vélo'},{key:'sac',label:'🥊 Sac'},
    {key:'corde',label:'⚡ Corde'},{key:'boxe',label:'🥊 Boxe'},{key:'renfo',label:'💪 Renfo'},
  ];
  const filtersEl = document.getElementById('filters');
  filterDefs.forEach(f => {
    const btn = document.createElement('button');
    btn.className = `filter-btn ${activeFilter===f.key?'active':''}`;
    btn.textContent = f.label;
    btn.onclick = () => {
      activeFilter = f.key;
      document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderSessionsList(sessions);
    };
    filtersEl.appendChild(btn);
  });

  // Calculer les années disponibles
  const years = [...new Set(sessions.map(s => s.date.slice(0, 4)))].sort((a, b) => b.localeCompare(a));
  if (!years.length) { renderSessionsList(sessions); return; }

  // Année sélectionnée par défaut : la plus récente
  if (!activeYear || !years.includes(activeYear)) activeYear = years[0];

  // Tabs année
  const tabsWrap = document.getElementById('year-tabs-wrap');
  const tabsEl = document.createElement('div');
  tabsEl.className = 'year-tabs';
  years.forEach(yr => {
    const tab = document.createElement('button');
    tab.className = `year-tab ${activeYear === yr ? 'active' : ''}`;
    tab.textContent = yr;
    tab.onclick = () => {
      activeYear = yr;
      document.querySelectorAll('.year-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      renderSessionsList(sessions);
    };
    tabsEl.appendChild(tab);
  });
  tabsWrap.appendChild(tabsEl);

  renderSessionsList(sessions);
}

function renderSessionsList(sessions) {
  const listEl = document.getElementById('sessions-list'); if (!listEl) return;

  // Filtrer par type
  let filtered = activeFilter === 'all' ? sessions : sessions.filter(s => s.type === activeFilter);

  // Filtrer par année sélectionnée
  if (activeYear) filtered = filtered.filter(s => s.date.slice(0, 4) === activeYear);

  if (!filtered.length) {
    listEl.innerHTML = '<div class="empty-state"><div class="es-icon">🏋️</div><p>Aucune séance pour ce filtre</p></div>';
    return;
  }

  // Grouper par mois (YYYY-MM)
  const byMonth = new Map();
  filtered.forEach(s => {
    const mk = s.date.slice(0, 7);
    if (!byMonth.has(mk)) byMonth.set(mk, []);
    byMonth.get(mk).push(s);
  });

  // Trier les mois du plus récent au plus ancien
  const sortedMonths = [...byMonth.keys()].sort((a, b) => b.localeCompare(a));
  const mostRecentMonth = sortedMonths[0];

  listEl.innerHTML = '';

  const MONTHS_FR = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];

  sortedMonths.forEach(mk => {
    const monthSessions = byMonth.get(mk);
    const [, mm] = mk.split('-');
    const monthName = MONTHS_FR[parseInt(mm, 10) - 1];
    const totalMin = monthSessions.reduce((a, s) => a + (s.duration_min || 0), 0);
    const isOpen = mk === mostRecentMonth;

    const section = document.createElement('div');
    section.className = 'month-section';

    const header = document.createElement('div');
    header.className = `month-header ${isOpen ? 'open' : ''}`;
    header.innerHTML = `
      <div class="month-header-left">
        <span class="month-chevron">${isOpen ? '▾' : '▸'}</span>
        <span class="month-name">${monthName}</span>
      </div>
      <div class="month-header-right">
        <span class="month-count">${monthSessions.length} séance${monthSessions.length > 1 ? 's' : ''}</span>
        <span class="month-duration">${formatDuration(totalMin)}</span>
      </div>
    `;

    const body = document.createElement('div');
    body.className = `month-body ${isOpen ? 'open' : ''}`;
    const table = document.createElement('div');
    table.className = 'sessions-table';
    monthSessions.forEach(s => table.appendChild(buildSessionRow(s)));
    body.appendChild(table);

    header.addEventListener('click', () => {
      const nowOpen = body.classList.toggle('open');
      header.classList.toggle('open', nowOpen);
      header.querySelector('.month-chevron').textContent = nowOpen ? '▾' : '▸';
    });

    section.appendChild(header);
    section.appendChild(body);
    listEl.appendChild(section);
  });
}

// ─── VUE : PLANNING ───────────────────────────────────────────────────────────
function planning(main) {
  const sessions = DB.getSessions();
  const data = computePlanning(sessions);

  main.innerHTML = `
    <div class="page-header">
      <h2>Planning 12 semaines</h2>
      <div class="page-sub">Début : ${formatDate(data.allWeeks[0]?.start)} · Semaine courante : ${data.currentWeek<=12?`S${data.currentWeek}`:'Terminé'}</div>
    </div>
    ${data.isProgramDone?'<div class="adaptive-hint" style="margin-bottom:16px"><b>Programme terminé</b>🏆 Félicitations — 12 semaines bouclées !</div>':''}
    <div class="planning-grid" id="planning-grid"></div>
  `;

  const grid = document.getElementById('planning-grid');

  function buildPlanningRow(week, isCurrent, startOpen) {
    const row = document.createElement('div');
    row.className = `pw-row${isCurrent ? ' current' : ''}`;
    const dots = [0,1,2].map(i => `<div class="pw-dot${i < week.sessionCount ? ' done' : ''}"></div>`).join('');
    const title = isCurrent
      ? `Semaine ${week.week}/12 · du ${formatWeekRange(week.start)}`
      : `S${week.week} · ${formatWeekRange(week.start)}`;
    row.innerHTML = `
      <div class="pw-header">
        <span class="pw-num${isCurrent ? ' pw-num-current' : ''}">S${week.week}</span>
        <span class="pw-dates">${isCurrent ? `du ${formatWeekRange(week.start)}` : formatWeekRange(week.start)}</span>
        <div class="pw-dots">${dots}</div>
        <div class="pw-icons">${week.sessions.slice(0,4).map(s=>`<span>${typeIcon(s.type)}</span>`).join('')}</div>
        <span class="pw-chevron${startOpen ? ' open' : ''}">›</span>
      </div>
      <div class="pw-body${startOpen ? ' open' : ''}">${buildWeekBody(week)}</div>
    `;
    row.querySelector('.pw-header').addEventListener('click', () => {
      const body = row.querySelector('.pw-body');
      const chev = row.querySelector('.pw-chevron');
      const isOpen = body.classList.toggle('open');
      chev.classList.toggle('open', isOpen);
    });
    return row;
  }

  const cw = data.currentWeek;
  const allWeeks = data.allWeeks;

  // 1 — Semaine courante (toujours ouverte)
  const currentWeek = allWeeks.find(w => w.week === cw);
  if (currentWeek) {
    const currentRow = buildPlanningRow(currentWeek, true, true);
    // Ajouter un titre de section
    const secCurrent = document.createElement('div');
    secCurrent.className = 'planning-section-lbl';
    secCurrent.textContent = `Semaine ${cw}/12`;
    grid.appendChild(secCurrent);
    grid.appendChild(currentRow);
  }

  // 2 — Semaines futures (S+1 → fin), repliées
  const futureWeeks = allWeeks.filter(w => w.week > cw);
  if (futureWeeks.length) {
    const secFuture = document.createElement('div');
    secFuture.className = 'planning-section-lbl';
    secFuture.textContent = 'À venir';
    grid.appendChild(secFuture);
    futureWeeks.forEach(week => grid.appendChild(buildPlanningRow(week, false, false)));
  }

  // 3 — Semaines passées (S-1 → S1), repliées, de la plus récente à la plus ancienne
  const pastWeeks = allWeeks.filter(w => w.week < cw).sort((a, b) => b.week - a.week);
  if (pastWeeks.length) {
    const secPast = document.createElement('div');
    secPast.className = 'planning-section-lbl';
    secPast.textContent = 'Historique';
    grid.appendChild(secPast);
    pastWeeks.forEach(week => grid.appendChild(buildPlanningRow(week, false, false)));
  }
}

function buildWeekBody(week) {
  const p = week.plan;
  const settings = DB.getSettings();
  const day1 = settings.training_days?.[0] || 'vendredi';
  const day2 = settings.training_days?.[1] || 'dimanche';
  const bonusDay = settings.bonus_day || 'mardi';
  const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
  const cols = [
    { day: cap(day1), acts:[{name:'Rameur',type:'rameur',desc:p.rameur},{name:'Corde',type:'corde',desc:p.corde},{name:'Sac',type:'sac',desc:p.sac},{name:'Renfo',type:'renfo',desc:p.renfo}] },
    { day: cap(day2), acts:[{name:'Course',type:'course',desc:p.course}] },
    { day: `${cap(bonusDay)} (bonus)`, acts:[{name:'Cardio / Rameur',type:'cardio_mardi',desc:p.cardio_mardi}] },
  ];
  return cols.map(col => `
    <div class="pw-act-col">
      <div class="pw-act-day">${col.day}</div>
      ${col.acts.map(act => {
        const done = findMatchingSession(week.sessions, act.type);
        let doneHtml = '';
        if (done) {
          let d = `${typeIcon(done.type)} ${formatDuration(done.duration_min)}`;
          if (done.distance_km) d += ` · ${done.distance_km} km`;
          if (done.pace_sec_km) d += ` · ${formatPace(done.pace_sec_km)}`;
          doneHtml = `<div class="pw-act-done">${d}</div>`;
          const diff = computeDiff(act.desc, done);
          if (diff) doneHtml += `<div class="pw-act-diff">${diff}</div>`;
        }
        return `<div style="margin-bottom:10px"><div class="pw-act-name" style="color:${typeColor(act.type)}">${act.name} ${done?'✓':''}</div><div class="pw-act-desc">${act.desc}</div>${doneHtml}</div>`;
      }).join('')}
    </div>`).join('');
}

// ─── VUE : STATS ─────────────────────────────────────────────────────────────
function stats(main) {
  const sessions = DB.getSessions();
  const data = computeStats(sessions);
  const totalH = Math.round(data.totals.minutes / 60);
  const firstYear = data.firstDate ? data.firstDate.slice(0, 4) : '—';
  const bestPace = data.courseSessions.filter(s => s.pace_sec_km).length
    ? Math.min(...data.courseSessions.filter(s => s.pace_sec_km).map(s => s.pace_sec_km)) : null;
  const avgPerWeek = data.totals.sessions > 0
    ? (data.totals.sessions / Math.max(1, Object.keys(data.byWeek).length)).toFixed(1) : '—';

  main.innerHTML = `
    <div class="page-header">
      <h2>Statistiques</h2>
      <div class="page-sub">Depuis ${firstYear} · vue long terme</div>
    </div>

    <div class="kpi-row">
      <div class="kpi-card">
        <div class="kpi-lbl">Séances totales</div>
        <div class="kpi-num">${data.totals.sessions}</div>
        <div class="kpi-sub">depuis ${firstYear}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-lbl">Heures de sport</div>
        <div class="kpi-num">${totalH}<span class="u"> h</span></div>
        <div class="kpi-sub">cumulées</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-lbl">Km courus</div>
        <div class="kpi-num">${Math.round(data.totals.distance_km)}</div>
        <div class="kpi-sub">kilomètres au total</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-lbl">Meilleure allure</div>
        <div class="kpi-num" style="font-size:2rem">${bestPace ? formatPace(bestPace) : '—'}</div>
        <div class="kpi-sub">course tous temps</div>
      </div>
    </div>

    <div class="charts-row">
      <div class="chart-wrap" style="flex:2">
        <div class="chart-lbl">Séances par mois — 12 derniers mois</div>
        <div class="chart-container" style="height:220px"><canvas id="chart-monthly"></canvas></div>
      </div>
      <div class="chart-wrap" style="flex:1">
        <div class="chart-lbl">Répartition par activité</div>
        <div class="chart-container" style="height:220px"><canvas id="chart-types"></canvas></div>
      </div>
    </div>

    <div class="annual-card">
      <div class="annual-header">Performance par année</div>
      <div class="year-grid" id="year-grid" style="padding:16px 20px 20px"></div>
    </div>
  `;

  // Chart 1 — séances par mois (12 derniers mois, simple)
  const allMonths = Object.keys(data.byMonth).sort();
  const last12 = allMonths.slice(-12);
  const mlabels = last12.map(m => new Date(m + '-01T12:00:00').toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' }));

  if (chartInstances.monthly) { chartInstances.monthly.destroy(); chartInstances.monthly = null; }
  chartInstances.monthly = new Chart(document.getElementById('chart-monthly'), {
    type: 'bar',
    data: {
      labels: mlabels,
      datasets: [{
        label: 'Séances',
        data: last12.map(m => data.byMonth[m].sessions),
        backgroundColor: 'rgba(255,69,0,.7)',
        borderColor: '#FF4500',
        borderWidth: 1,
        borderRadius: 4,
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { display: false }, ticks: { color: '#b0b0b0', font: { size: 11 } } },
        y: { grid: { color: 'rgba(255,255,255,.06)' }, ticks: { color: '#b0b0b0', font: { size: 11 }, stepSize: 1 } }
      }
    }
  });

  // Chart 2 — répartition par type (donut)
  const typeData = Object.entries(
    sessions.reduce((acc, s) => { acc[s.type] = (acc[s.type] || 0) + (s.duration_min || 0); return acc; }, {})
  ).sort((a, b) => b[1] - a[1]).slice(0, 7);

  if (chartInstances.types) { chartInstances.types.destroy(); chartInstances.types = null; }
  chartInstances.types = new Chart(document.getElementById('chart-types'), {
    type: 'doughnut',
    data: {
      labels: typeData.map(([t]) => typeLabel(t)),
      datasets: [{ data: typeData.map(([, m]) => Math.round(m / 60 * 10) / 10), backgroundColor: typeData.map(([t]) => typeColor(t) + 'cc'), borderColor: typeData.map(([t]) => typeColor(t)), borderWidth: 2 }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { position: 'right', labels: { color: '#b0b0b0', font: { size: 12 }, padding: 14, boxWidth: 12 } },
        tooltip: { callbacks: { label: ctx => ` ${ctx.label}: ${ctx.raw}h` } }
      }
    }
  });

  renderAnnualStats(sessions);
}

// ─── VUE : RÉCUP (sommeil & forme) ───────────────────────────────────────────
const fmtSleepH = h => h == null ? '—' : `${Math.floor(h)}h${String(Math.round((h % 1) * 60)).padStart(2, '0')}`;
const fmtSleepN = n => n == null ? '—' : Math.round(n);

// Moyenne + tendance (1ère moitié vs 2ᵉ moitié de la période) d'une métrique.
// lowerIsBetter : true pour la FC de repos (plus bas = mieux).
function sleepMetric(arr, key, lowerIsBetter = false) {
  const vals = arr.map(x => x[key]).filter(x => x != null);
  if (!vals.length) return { avg: null, delta: null, better: null };
  const mean = a => a.reduce((x, y) => x + y, 0) / a.length;
  const avg = mean(vals);
  let delta = null, better = null;
  if (vals.length >= 4) {
    const mid = Math.floor(vals.length / 2);
    const d = mean(vals.slice(mid)) - mean(vals.slice(0, mid));
    delta = d;
    if (Math.abs(d) > 1e-9) better = lowerIsBetter ? d < 0 : d > 0;
  }
  return { avg, delta, better };
}

function trendChip(m, fmt) {
  if (m.delta == null || m.better == null) return '';
  const arrow = m.delta > 0 ? '▲' : '▼';
  const cls = m.better ? 'up' : 'down';
  return `<span class="kpi-trend ${cls}">${arrow} ${fmt(Math.abs(m.delta))}</span>`;
}

// Cartes KPI calculées sur la période visible (tableau trié chronologiquement).
function kpiCardsHtml(arr) {
  const dur = sleepMetric(arr, 'duration_h');
  const score = sleepMetric(arr, 'score');
  const rhr = sleepMetric(arr, 'resting_hr', true);
  const hrv = sleepMetric(arr, 'hrv');
  const n = arr.length;
  const sub = n ? `${n} nuit${n > 1 ? 's' : ''}` : '—';
  return `
    <div class="kpi-card"><div class="kpi-lbl">Sommeil moy.</div><div class="kpi-num" style="font-size:2rem">${fmtSleepH(dur.avg)}</div><div class="kpi-sub">${trendChip(dur, v => fmtSleepH(v))}${sub}</div></div>
    <div class="kpi-card"><div class="kpi-lbl">Score moy.</div><div class="kpi-num">${fmtSleepN(score.avg)}</div><div class="kpi-sub">${trendChip(score, v => Math.round(v) + ' pts')}sur 100 · ${sub}</div></div>
    <div class="kpi-card"><div class="kpi-lbl">FC repos</div><div class="kpi-num">${fmtSleepN(rhr.avg)}<span class="u">${rhr.avg ? ' bpm' : ''}</span></div><div class="kpi-sub">${trendChip(rhr, v => Math.round(v) + ' bpm')}${sub}</div></div>
    <div class="kpi-card"><div class="kpi-lbl">HRV moy.</div><div class="kpi-num">${fmtSleepN(hrv.avg)}<span class="u">${hrv.avg ? ' ms' : ''}</span></div><div class="kpi-sub">${trendChip(hrv, v => Math.round(v) + ' ms')}${sub}</div></div>`;
}

let recupYear = null;
let recupYearData = [];   // nuits de l'année sélectionnée, triées chronologiquement

// Recalcule les KPIs depuis la fenêtre visible du graphe (zoom molette / déplacement).
function refreshRecupKpis() {
  const ch = chartInstances.sleep;
  const row = document.getElementById('recup-kpis');
  if (!row || !recupYearData.length) return;
  let win = recupYearData;
  if (ch && ch.scales.x) {
    const lo = Math.max(0, Math.round(ch.scales.x.min));
    const hi = Math.min(recupYearData.length - 1, Math.round(ch.scales.x.max));
    if (hi >= lo) win = recupYearData.slice(lo, hi + 1);
  }
  row.innerHTML = kpiCardsHtml(win);
}

function recupView(main) {
  const sleep = DB.getSleep();

  if (!sleep.length) {
    main.innerHTML = `
      <div class="page-header"><h2>Récupération</h2><div class="page-sub">Sommeil & forme</div></div>
      <div class="empty-state"><div class="es-icon">🌙</div><p>Pas encore de données de sommeil.<br>Elles arrivent automatiquement via la synchro Garmin (chaque matin).</p></div>`;
    return;
  }

  const years = [...new Set(sleep.map(s => s.date.slice(0, 4)))].sort((a, b) => b.localeCompare(a));
  if (!recupYear || !years.includes(recupYear)) recupYear = years[0];

  main.innerHTML = `
    <div class="page-header">
      <h2>Récupération</h2>
      <div class="page-sub">Sommeil & forme — ${sleep.length} nuits enregistrées</div>
    </div>

    <div class="kpi-row" id="recup-kpis"></div>

    <div class="chart-wrap">
      <div class="chart-head">
        <div class="chart-lbl">Sommeil & score</div>
        <button class="btn-ghost btn-sm" id="sleep-reset" title="Réinitialiser le zoom">⟲ Année entière</button>
      </div>
      <div class="year-tabs" id="sleep-years"></div>
      <div class="chart-container" style="height:300px"><canvas id="chart-sleep"></canvas></div>
      <div class="chart-hint">Molette : zoomer sur une période · glisser : se déplacer · les KPIs ci-dessus s'adaptent à la zone affichée</div>
    </div>
  `;

  const tabsEl = document.getElementById('sleep-years');
  years.forEach(yr => {
    const tab = document.createElement('button');
    tab.className = `year-tab ${recupYear === yr ? 'active' : ''}`;
    tab.textContent = yr;
    tab.onclick = () => {
      recupYear = yr;
      document.querySelectorAll('#sleep-years .year-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      renderSleepChart(sleep);
    };
    tabsEl.appendChild(tab);
  });

  document.getElementById('sleep-reset').onclick = () => {
    if (chartInstances.sleep && chartInstances.sleep.resetZoom) chartInstances.sleep.resetZoom();
    refreshRecupKpis();
  };

  renderSleepChart(sleep);
}

function renderSleepChart(allSleep) {
  const sleep = allSleep
    .filter(s => s.date.slice(0, 4) === recupYear)
    .sort((a, b) => a.date.localeCompare(b.date));
  recupYearData = sleep;

  if (chartInstances.sleep) { chartInstances.sleep.destroy(); }
  chartInstances.sleep = new Chart(document.getElementById('chart-sleep'), {
    type: 'bar',
    data: {
      labels: sleep.map(s => formatDateShort(s.date)),
      datasets: [
        { label: 'Profond', data: sleep.map(s => s.deep_h), backgroundColor: '#4338ca', stack: 's', order: 2 },
        { label: 'Léger', data: sleep.map(s => s.light_h), backgroundColor: '#6366f1', stack: 's', order: 2 },
        { label: 'REM', data: sleep.map(s => s.rem_h), backgroundColor: '#a855f7', stack: 's', order: 2 },
        { label: 'Score', data: sleep.map(s => s.score), type: 'line', yAxisID: 'y2', borderColor: '#FA4B00', backgroundColor: '#FA4B00', tension: 0.3, pointRadius: 0, borderWidth: 2, order: 1 },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { position: 'top', labels: { color: '#b0b0b0', font: { size: 11 }, boxWidth: 12, padding: 10 } },
        tooltip: { callbacks: { label: c => c.dataset.label === 'Score' ? ` Score : ${c.raw ?? '—'}` : ` ${c.dataset.label} : ${(c.raw ?? 0).toFixed(1)} h` } },
        zoom: {
          zoom: { wheel: { enabled: true }, pinch: { enabled: true }, mode: 'x', onZoomComplete: refreshRecupKpis },
          pan: { enabled: true, mode: 'x', onPanComplete: refreshRecupKpis },
          limits: { x: { minRange: 3 } },
        },
      },
      scales: {
        x: { stacked: true, grid: { display: false }, ticks: { color: '#888', font: { size: 10 }, maxRotation: 0, autoSkip: true, maxTicksLimit: 12 } },
        y: { stacked: true, position: 'left', beginAtZero: true, grid: { color: 'rgba(128,128,128,.12)' }, ticks: { color: '#888', font: { size: 10 } }, title: { display: true, text: 'heures', color: '#888' } },
        y2: { position: 'right', min: 0, max: 100, grid: { display: false }, ticks: { color: '#FA4B00', font: { size: 10 } }, title: { display: true, text: 'score', color: '#FA4B00' } },
      },
    },
  });

  refreshRecupKpis();
}

// ─── VUE : IMPORT / EXPORT ───────────────────────────────────────────────────
function importView(main) {
  main.innerHTML = `
    <div class="import-page">
      <div class="page-header" style="text-align:center">
        <h2>Sauvegarde, Import &amp; Export</h2>
        <div class="page-sub">Coffre-fort GitHub en ligne, import CSV Garmin/Strava, restauration JSON, ou export complet.</div>
      </div>

      <div id="backup-card" class="backup-card"></div>

      <div class="import-actions">
        <button class="btn-gold" onclick="exportJSON()">⬇ Exporter JSON</button>
        <button class="btn-ghost" onclick="exportCSV()">⬇ Exporter CSV</button>
        <button class="btn-ghost" onclick="document.getElementById('json-input').click()">⬆ Restaurer JSON</button>
        <button class="btn-ghost" id="btn-sync-server" onclick="handleServerSync()">🔄 Sync GitHub</button>
        <input type="file" id="json-input" accept=".json" style="display:none" onchange="handleJSONImport(this.files[0])">
      </div>

      <div class="drop-zone" id="drop-zone">
        <div class="dz-icon">📂</div>
        <div class="dz-title">Déposer un CSV Garmin ou Strava ici</div>
        <div class="dz-sub">ou cliquer pour sélectionner · format détecté automatiquement</div>
        <input type="file" id="file-input" accept=".csv" style="display:none">
      </div>
      <div id="import-result"></div>
    </div>
  `;

  renderBackupCard();

  const dz = document.getElementById('drop-zone');
  const fi = document.getElementById('file-input');
  dz.addEventListener('click', () => fi.click());
  fi.addEventListener('change', e => handleCSVImport(e.target.files[0]));
  dz.addEventListener('dragover', e => { e.preventDefault(); dz.classList.add('dragover'); });
  dz.addEventListener('dragleave', () => dz.classList.remove('dragover'));
  dz.addEventListener('drop', e => { e.preventDefault(); dz.classList.remove('dragover'); handleCSVImport(e.dataTransfer.files[0]); });
}

// ─── Coffre-fort GitHub : UI ────────────────────────────────────────────────────
function renderBackupCard() {
  const el = document.getElementById('backup-card');
  if (!el) return;
  const last = DB.lastBackup();
  const lastTxt = last
    ? `Dernière sauvegarde : ${new Date(last).toLocaleString('fr-FR', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' })}`
    : 'Aucune sauvegarde encore — clique sur « Sauvegarder maintenant ».';
  el.innerHTML = `
    <div class="bk-status bk-on">
      <span class="bk-dot"></span>
      <div>
        <div class="bk-title">Sauvegarde automatique active</div>
        <div class="bk-sub">${lastTxt}</div>
      </div>
    </div>
    <div class="bk-actions">
      <button class="btn-gold" onclick="handleManualBackup()">💾 Sauvegarder maintenant</button>
    </div>
    <div class="bk-help">
      🔐 Sauvegarde sécurisée via Cloudflare — accès réservé à ton compte Google.
      Aucun mot de passe ni token n'est stocké dans ce navigateur.
    </div>`;
}

async function handleManualBackup() {
  toast('💾 Sauvegarde…');
  const res = await DB.backup();
  renderBackupCard();
  toast(res.ok ? '✅ Sauvegardé' : `❌ Échec : ${res.reason || 'erreur'}`, res.ok ? 'ok' : 'err');
}

function handleCSVImport(file) {
  if (!file) return;
  const resultEl = document.getElementById('import-result');
  resultEl.innerHTML = '<div class="import-result">Import en cours…</div>';
  const reader = new FileReader();
  reader.onload = e => {
    const content = e.target.result;
    const isStrava = content.trimStart().startsWith('ID de l');
    const parsed = isStrava ? parseStravaCSV(content) : parseGarminCSV(content);
    const existing = JSON.parse(localStorage.getItem(DB.SK) || '[]');
    let added=0, skipped=0;
    for (const imp of parsed) {
      if (isDuplicate(existing,imp)) skipped++;
      else { existing.push(imp); added++; }
    }
    DB.saveSessions(existing);
    if (added > 0) scheduleBackup();
    resultEl.innerHTML = `<div class="import-result success">✅ Import <strong>${isStrava?'Strava':'Garmin'}</strong> terminé — <strong>${added} nouvelles séances</strong> ajoutées (${parsed.length} trouvées, ${skipped} doublons ignorés)</div>`;
  };
  reader.onerror = () => { document.getElementById('import-result').innerHTML='<div class="import-result error">❌ Impossible de lire le fichier.</div>'; };
  reader.readAsText(file, 'utf-8');
}

function handleJSONImport(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const incoming = JSON.parse(e.target.result);
      if (!Array.isArray(incoming)) throw new Error('Format invalide');
      const existing = JSON.parse(localStorage.getItem(DB.SK) || '[]');
      let added=0, skipped=0;
      for (const imp of incoming) {
        if (isDuplicate(existing,imp)) skipped++;
        else { existing.push(imp); added++; }
      }
      DB.saveSessions(existing);
      if (added > 0) scheduleBackup();
      alert(`✅ Restauration terminée — ${added} séances ajoutées, ${skipped} déjà présentes.`);
    } catch(err) {
      alert('❌ Fichier JSON invalide : ' + err.message);
    }
  };
  reader.readAsText(file, 'utf-8');
}

function exportJSON() {
  const sessions = DB.getSessions();
  const blob = new Blob([JSON.stringify(sessions, null, 2)], {type:'application/json'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `coach-sportif-${today()}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}

// ─── MODAL ────────────────────────────────────────────────────────────────────
function openAddModal(defaults={}) {
  editingSessionId = null;
  document.getElementById('modal-title').textContent = 'Nouvelle séance';
  document.getElementById('btn-delete-session').classList.add('hidden');
  document.getElementById('session-form').reset();
  document.getElementById('f-date').value = defaults.date || today();
  if (defaults.type) document.getElementById('f-type').value = defaults.type;
  toggleFormFields();
  document.getElementById('modal-overlay').classList.remove('hidden');
}

function openEditModal(session) {
  editingSessionId = session.id;
  document.getElementById('modal-title').textContent = 'Modifier la séance';
  document.getElementById('btn-delete-session').classList.remove('hidden');
  document.getElementById('f-date').value = session.date;
  document.getElementById('f-type').value = session.type;
  document.getElementById('f-duration').value = session.duration_min ? Math.round(session.duration_min) : '';
  document.getElementById('f-calories').value = session.calories || '';
  document.getElementById('f-distance').value = session.distance_km || '';
  document.getElementById('f-pace').value = session.pace_sec_km ? `${Math.floor(session.pace_sec_km/60)}:${String(Math.round(session.pace_sec_km%60)).padStart(2,'0')}` : '';
  document.getElementById('f-rounds').value = session.rounds || '';
  document.getElementById('f-hr-avg').value = session.hr_avg || '';
  document.getElementById('f-hr-max').value = session.hr_max || '';
  document.getElementById('f-notes').value = session.notes || '';
  toggleFormFields();
  document.getElementById('modal-overlay').classList.remove('hidden');
}

function closeModal() { document.getElementById('modal-overlay').classList.add('hidden'); editingSessionId=null; }

function toggleFormFields() {
  const type = document.getElementById('f-type').value;
  const isCardio = ['course_ext','course_tapis'].includes(type);
  const isCombat = ['sac','corde','boxe','renfo'].includes(type);
  document.getElementById('fg-distance').style.display = isCardio?'':'none';
  document.getElementById('fg-pace').style.display = isCardio?'':'none';
  document.getElementById('fg-rounds').style.display = isCombat?'':'none';
}

document.getElementById('f-type').addEventListener('change', toggleFormFields);
document.getElementById('btn-add-session').addEventListener('click', () => openAddModal());
document.getElementById('modal-close').addEventListener('click', closeModal);
document.getElementById('btn-cancel').addEventListener('click', closeModal);
document.getElementById('modal-overlay').addEventListener('click', e => { if (e.target===document.getElementById('modal-overlay')) closeModal(); });

document.getElementById('btn-delete-session').addEventListener('click', () => {
  if (!editingSessionId || !confirm('Supprimer cette séance ?')) return;
  DB.deleteSession(editingSessionId);
  scheduleBackup();
  closeModal();
  navigate(location.hash.slice(1) || 'dashboard');
});

document.getElementById('session-form').addEventListener('submit', e => {
  e.preventDefault();
  const type = document.getElementById('f-type').value;
  if (!type) { document.getElementById('f-type').focus(); return; }
  const submitBtn = e.target.querySelector('[type="submit"]');
  submitBtn.textContent = 'Enregistrement…'; submitBtn.disabled = true;
  const data = {
    date: document.getElementById('f-date').value, type,
    title: typeLabel(type),
    duration_min: parseFloat(document.getElementById('f-duration').value) || null,
    calories: parseInt(document.getElementById('f-calories').value) || null,
    distance_km: parseFloat(document.getElementById('f-distance').value) || null,
    pace_sec_km: parsePaceInput(document.getElementById('f-pace').value),
    rounds: parseInt(document.getElementById('f-rounds').value) || null,
    hr_avg: parseInt(document.getElementById('f-hr-avg').value) || null,
    hr_max: parseInt(document.getElementById('f-hr-max').value) || null,
    notes: document.getElementById('f-notes').value.trim(),
  };
  try {
    if (editingSessionId) DB.updateSession(editingSessionId, data);
    else DB.addSession(data);
    scheduleBackup();
    closeModal();
    navigate(location.hash.slice(1) || 'dashboard');
  } catch(err) {
    submitBtn.textContent = 'Enregistrer'; submitBtn.disabled = false;
    alert('Erreur lors de la sauvegarde : ' + err.message);
  }
});

// ─── KPIs annuels ─────────────────────────────────────────────────────────────
function renderAnnualStats(sessions) {
  const el = document.getElementById('year-grid');
  if (!el) return;
  const annualData = computeAnnualStats(sessions);
  const years = Object.keys(annualData).sort();
  if (!years.length) return;
  const currentYear = String(new Date().getFullYear());

  el.innerHTML = years.reverse().map((yr, i) => {
    const d = annualData[yr];
    const prev = annualData[years[i + 1]];
    const pct = prev && prev.sessions > 0 ? Math.round((d.sessions - prev.sessions) / prev.sessions * 100) : null;
    const badgeClass = pct === null ? 'same' : pct >= 0 ? 'up' : 'down';
    const badgeText = pct === null ? 'première année' : `${pct >= 0 ? '+' : ''}${pct}% vs ${parseInt(yr)-1}`;
    const domType = Object.entries(d.byType).sort((a,b) => b[1]-a[1])[0]?.[0] || 'autre';
    return `
      <div class="year-card${yr === currentYear ? ' current' : ''}">
        <div class="year-num">${yr}</div>
        <div class="year-row"><span class="year-key">Séances</span><span class="year-val">${d.sessions}</span></div>
        <div class="year-row"><span class="year-key">Durée</span><span class="year-val">${Math.round(d.minutes/60)}h</span></div>
        <div class="year-row"><span class="year-key">Distance</span><span class="year-val">${Math.round(d.distance_km)} km</span></div>
        <div class="year-row"><span class="year-key">Activité</span><span class="year-val year-activity">${typeIcon(domType)} ${typeLabel(domType)}</span></div>
        <span class="year-badge ${badgeClass}">${badgeText}</span>
      </div>`;
  }).join('');
}

// ─── Export CSV ───────────────────────────────────────────────────────────────
function exportCSV() {
  const sessions = DB.getSessions();
  const headers = ['Date', 'Type', 'Titre', 'Durée (min)', 'Calories', 'Distance (km)', 'Allure (sec/km)', 'FC moy', 'FC max', 'Rounds', 'Notes', 'Source'];
  const rows = sessions.map(s => [
    s.date, typeLabel(s.type), s.title || '', s.duration_min || '', s.calories || '',
    s.distance_km || '', s.pace_sec_km || '', s.hr_avg || '', s.hr_max || '',
    s.rounds || '', (s.notes || '').replace(/"/g, '""'), s.source || ''
  ]);
  const csv = [headers, ...rows].map(r => r.map(v => `"${v}"`).join(',')).join('\n');
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `coach-sportif-${today()}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

async function handleServerSync() {
  const btn = document.getElementById('btn-sync-server');
  const resultEl = document.getElementById('import-result');
  if (btn) { btn.textContent = '🔄 Sync en cours…'; btn.disabled = true; }
  const added = await DB.syncFromServer();
  if (added > 0) {
    if (resultEl) resultEl.innerHTML = `<div class="import-result success">✅ Sync réussie — ${added} nouvelles séances intégrées depuis le serveur</div>`;
  } else if (added === 0) {
    if (resultEl) resultEl.innerHTML = `<div class="import-result">✅ Données à jour — aucune nouvelle séance sur le serveur</div>`;
  } else {
    if (resultEl) resultEl.innerHTML = `<div class="import-result error">❌ Serveur inaccessible (normal si app ouverte en local)</div>`;
  }
  if (btn) { btn.textContent = '🔄 Sync depuis GitHub'; btn.disabled = false; }
}

// ─── Init ─────────────────────────────────────────────────────────────────────
function initApp() {
  initTheme();
  DB.init()
    .then(() => DB.syncFromServer())
    .then(() => DB.syncSleep())
    .then(() => navigate(location.hash.slice(1) || 'dashboard'));
}
