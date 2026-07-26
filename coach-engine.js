/* ═══════════════════════════════════════════════════════════
   COACH ENGINE — météo (Open-Meteo) + moteur adaptatif
   Aucune dépendance, aucun DOM, aucune clé API.
   ═══════════════════════════════════════════════════════════ */

// ─── Dates ────────────────────────────────────────────────────────────────────
const CE_DAY = 864e5;
function ceISO(d) { return new Date(d.getTime() - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10); }
function ceDate(s) { return new Date(s + 'T12:00:00'); }
function ceAdd(s, n) { const d = ceDate(s); d.setDate(d.getDate() + n); return ceISO(d); }
function ceDiff(a, b) { return Math.round((ceDate(a) - ceDate(b)) / CE_DAY); }
function ceMonday(s) { const d = ceDate(s); const w = d.getDay() || 7; d.setDate(d.getDate() - (w - 1)); return ceISO(d); }
/** Prochaine occurrence du jour de semaine `dow` (1=lundi … 7=dimanche), aujourd'hui inclus. */
function ceNextDow(from, dow) {
  const cur = ceDate(from).getDay() || 7;
  return ceAdd(from, (dow - cur + 7) % 7);
}
const CE_DOW_FR = { 1: 'Lundi', 2: 'Mardi', 3: 'Mercredi', 4: 'Jeudi', 5: 'Vendredi', 6: 'Samedi', 7: 'Dimanche' };

// ─── Formatage ────────────────────────────────────────────────────────────────
const ceKm = v => (Math.round(v * 2) / 2).toFixed(1).replace('.0', '').replace('.', ',');
const cePace = s => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;

// ═══════════════════════════════════════════════════════════
//  1 — MÉTÉO  (Open-Meteo, gratuit, sans clé, CORS ouvert)
// ═══════════════════════════════════════════════════════════
const Weather = {
  CK: 'coach_weather_cache',
  TTL: 60 * 60 * 1000, // 1 h

  async get(lat, lon) {
    const cached = JSON.parse(localStorage.getItem(this.CK) || 'null');
    if (cached && Date.now() - cached.t < this.TTL &&
        Math.abs(cached.lat - lat) < 1e-3 && Math.abs(cached.lon - lon) < 1e-3) return cached.d;
    const url = 'https://api.open-meteo.com/v1/forecast'
      + `?latitude=${lat}&longitude=${lon}`
      + '&hourly=temperature_2m,apparent_temperature,precipitation,precipitation_probability,wind_speed_10m,weather_code'
      + '&timezone=Europe%2FParis&forecast_days=14';
    const r = await fetch(url);
    if (!r.ok) throw new Error('météo indisponible (HTTP ' + r.status + ')');
    const d = await r.json();
    localStorage.setItem(this.CK, JSON.stringify({ t: Date.now(), lat, lon, d }));
    return d;
  },

  async geocode(name) {
    const r = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(name)}&count=1&language=fr&format=json`);
    if (!r.ok) return null;
    const d = await r.json();
    const p = d.results && d.results[0];
    return p ? { lat: +p.latitude.toFixed(4), lon: +p.longitude.toFixed(4), place: p.name } : null;
  },

  /** Créneaux évalués : matin / midi / soirée. */
  SLOTS: [{ h: 7, label: '07 h' }, { h: 12, label: '12 h' }, { h: 18, label: '18 h' }],

  /** Score 0-100 de confort pour courir dehors. */
  scoreSlot(s) {
    let sc = 100;
    sc -= Math.min(60, (s.precip || 0) * 30);
    if (s.prob >= 70) sc -= 25; else if (s.prob >= 45) sc -= 12;
    if (s.wind > 28) sc -= (s.wind - 28) * 1.6;
    if (s.feels > 26) sc -= (s.feels - 26) * 4;
    if (s.feels < 2) sc -= (2 - s.feels) * 4;
    if ([71, 73, 75, 77, 85, 86, 95, 96, 99].includes(s.code)) sc -= 40;
    return Math.max(0, Math.round(sc));
  },

  /** Conditions d'une journée : 3 créneaux, le meilleur, verdict extérieur. */
  forDate(fc, date) {
    if (!fc || !fc.hourly) return null;
    const H = fc.hourly;
    const slots = this.SLOTS.map(({ h, label }) => {
      const i = H.time.indexOf(`${date}T${String(h).padStart(2, '0')}:00`);
      if (i === -1) return null;
      const s = {
        h, label,
        temp: Math.round(H.temperature_2m[i]),
        feels: Math.round(H.apparent_temperature[i]),
        precip: H.precipitation[i] ?? 0,
        prob: H.precipitation_probability[i] ?? 0,
        wind: Math.round(H.wind_speed_10m[i]),
        code: H.weather_code[i],
      };
      s.score = this.scoreSlot(s);
      return s;
    }).filter(Boolean);
    if (!slots.length) return null;
    const best = slots.reduce((a, b) => (b.score > a.score ? b : a));
    return { date, slots, best, outdoor: best.score >= 62, why: this.verdict(best) };
  },

  verdict(s) {
    if (s.precip >= 0.4 || s.prob >= 70) return `pluie annoncée (${s.prob} %) à ${s.label}`;
    if (s.wind > 38) return `vent ${s.wind} km/h à ${s.label}`;
    if (s.feels > 28) return `ressenti ${s.feels} °C à ${s.label}`;
    if (s.feels < 1) return `ressenti ${s.feels} °C à ${s.label}`;
    return `${this.label(s.code)}, ${s.temp} °C, vent ${s.wind} km/h à ${s.label}`;
  },

  label(c) {
    if (c === 0) return 'ciel dégagé';
    if (c <= 2) return 'peu nuageux';
    if (c === 3) return 'couvert';
    if (c <= 48) return 'brouillard';
    if (c <= 57) return 'bruine';
    if (c <= 67) return 'pluie';
    if (c <= 77) return 'neige';
    if (c <= 82) return 'averses';
    if (c <= 86) return 'neige';
    return 'orage';
  },

  /** Icône météo — tracés Lucide, stroke 1.5, currentColor. Aucun emoji. */
  icon(c, size = 20) {
    const o = `width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"`;
    const CLOUD = '<path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/>';
    const CLOUD_HI = '<path d="M4 14.9A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.24"/>';
    const g = {
      sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>',
      cloudSun: '<path d="M12 2v2M4.93 4.93l1.41 1.41M20 12h2M19.07 4.93l-1.41 1.41"/><path d="M15.95 12.65a4 4 0 0 0-5.93-4.13"/><path d="M13 22H7a5 5 0 1 1 4.9-6H13a3 3 0 0 1 0 6Z"/>',
      cloud: CLOUD,
      fog: CLOUD + '<path d="M16 20H7M17 23.5H9"/>',
      drizzle: CLOUD + '<path d="M8 20v1M12 21.5v1M16 20v1"/>',
      rain: CLOUD_HI + '<path d="M8 14v6M12 16v6M16 14v6"/>',
      showers: CLOUD_HI + '<path d="M9 14.5 7 21M15 14.5 13 21"/>',
      snow: CLOUD_HI + '<path d="M8 15h.01M8 19h.01M12 17h.01M12 21h.01M16 15h.01M16 19h.01"/>',
      storm: CLOUD_HI + '<path d="m13 12-3 5h4l-3 5"/>',
    };
    let k = 'cloud';
    if (c === 0) k = 'sun';
    else if (c <= 2) k = 'cloudSun';
    else if (c === 3) k = 'cloud';
    else if (c <= 48) k = 'fog';
    else if (c <= 57) k = 'drizzle';
    else if (c <= 67) k = 'rain';
    else if (c <= 77) k = 'snow';
    else if (c <= 82) k = 'showers';
    else if (c <= 86) k = 'snow';
    else k = 'storm';
    return `<svg ${o}>${g[k]}</svg>`;
  },

  /** Icône vent — affichée quand ça souffle vraiment. */
  windIcon(size = 14) {
    return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12.8 19.6A2 2 0 1 0 14 16H2"/><path d="M17.5 8a2.5 2.5 0 1 1 2 4H2"/><path d="M9.8 4.4A2 2 0 1 1 11 8H2"/></svg>`;
  },
};

// ═══════════════════════════════════════════════════════════
//  2 — MOTEUR ADAPTATIF
// ═══════════════════════════════════════════════════════════
const CoachEngine = {
  // Pondération d'intensité : 1 min de course ≠ 1 min de vélo tranquille.
  W: { course_ext: 1.1, course_tapis: 1, boxe: 1.1, sac: 1, corde: 1.15, rameur: 1, velo: .8, renfo: .8, cardio: .9, autre: .8 },
  RUN: ['course_ext', 'course_tapis'],

  points(s) { return (s.duration_min || 30) * (this.W[s.type] || 1); },

  /** État de forme : charge aiguë 7 j vs charge chronique 28 j. */
  form(sessions, ref) {
    const inRange = (s, a, b) => s.date > ceAdd(ref, -a) && s.date <= (b ? ceAdd(ref, -b) : ref);
    const sum = arr => Math.round(arr.reduce((t, s) => t + this.points(s), 0));
    const acute = sum(sessions.filter(s => inRange(s, 7)));
    const chronic = Math.round(sum(sessions.filter(s => inRange(s, 28))) / 4);
    const last = sessions.filter(s => s.date <= ref).map(s => s.date).sort().pop() || null;
    const daysSince = last ? ceDiff(ref, last) : 999;
    const perWeek = +(sessions.filter(s => inRange(s, 28)).length / 4).toFixed(1);
    const minPerWeek = Math.round(sessions.filter(s => inRange(s, 28)).reduce((t, s) => t + (s.duration_min || 0), 0) / 4);
    const ratio = chronic > 0 ? +(acute / chronic).toFixed(2) : (acute > 0 ? 1.5 : 0);

    // 8 dernières semaines, pour la barre de charge
    const weeks = [];
    for (let i = 7; i >= 0; i--) {
      const start = ceAdd(ceMonday(ref), -7 * i);
      const end = ceAdd(start, 6);
      const w = sessions.filter(s => s.date >= start && s.date <= end);
      weeks.push({ start, n: w.length, min: Math.round(w.reduce((t, s) => t + (s.duration_min || 0), 0)) });
    }

    let state, label, note, factor;
    if (daysSince >= 21)      { state = 'coupure';  label = 'Reprise après coupure'; factor = .7;  note = `${daysSince} jours sans séance`; }
    else if (daysSince >= 10) { state = 'reprise';  label = 'Reprise';               factor = .85; note = `${daysSince} jours sans séance`; }
    else if (ratio > 1.6 && chronic > 0) { state = 'surcharge'; label = 'Charge élevée'; factor = .75; note = `charge 7 j à ${Math.round(ratio * 100)} % de ta moyenne`; }
    else if (perWeek >= 2 && ratio >= .8 && ratio <= 1.4) { state = 'progression'; label = 'Progression'; factor = 1.06; note = `${perWeek} séances/sem. sur 4 semaines`; }
    else                      { state = 'regulier'; label = 'Rythme régulier';       factor = 1;   note = `${perWeek} séances/sem. sur 4 semaines`; }

    return { state, label, note, factor, acute, chronic, ratio, daysSince, lastDate: last, perWeek, minPerWeek, weeks };
  },

  /** Référence course : ce que tu tiens VRAIMENT en ce moment, pas ce que dit un plan. */
  runRef(sessions, ref) {
    const runs = sessions
      .filter(s => this.RUN.includes(s.type) && s.distance_km > 0.5 && s.date <= ref)
      .sort((a, b) => b.date.localeCompare(a.date));
    if (!runs.length) return { ref: 4, pace: 420, n: 0, daysSince: 999, decay: 1 };
    let pool = runs.filter(s => ceDiff(ref, s.date) <= 60);
    if (pool.length < 2) pool = runs.filter(s => ceDiff(ref, s.date) <= 180);
    if (pool.length < 1) pool = runs.slice(0, 3);
    // Référence = moyenne des 2 meilleures distances récentes (évite l'exploit isolé)
    const top = pool.map(s => s.distance_km).sort((a, b) => b - a).slice(0, 2);
    const base = top.reduce((a, b) => a + b, 0) / top.length;
    const daysSince = ceDiff(ref, runs[0].date);
    const idleWeeks = Math.floor(daysSince / 7);
    const decay = idleWeeks <= 1 ? 1 : Math.max(.6, 1 - .07 * (idleWeeks - 1));
    const paces = pool.map(s => s.pace_sec_km).filter(Boolean).slice(0, 5).sort((a, b) => a - b);
    const pace = paces.length ? paces[Math.floor(paces.length / 2)] : 420;
    return { ref: base, pace, n: pool.length, daysSince, decay, last: runs[0] };
  },

  /** Affinités réelles : ce qu'il fait, pas ce qu'on imagine qu'il aime. */
  affinity(sessions, ref) {
    const a = {};
    sessions.filter(s => ceDiff(ref, s.date) <= 180 && s.date <= ref)
      .forEach(s => { a[s.type] = (a[s.type] || 0) + 1; });
    return a;
  },

  /** Contexte complet. */
  context(sessions, ref) {
    const form = this.form(sessions, ref);
    const run = this.runRef(sessions, ref);
    const aff = this.affinity(sessions, ref);
    // Volume course visé : référence × le plus prudent des deux signaux
    const k = Math.min(run.decay, form.factor);
    let target = run.ref * k;
    if (form.state === 'progression') target = Math.min(run.ref * 1.12, run.ref * form.factor);
    target = Math.max(3, Math.round(target * 2) / 2);
    // Allure visée : plus prudente en reprise
    const paceAdj = form.state === 'coupure' ? 20 : form.state === 'reprise' ? 10 : form.state === 'progression' ? -5 : 0;
    const p = run.pace;
    // Zones calées sur TON allure médiane récente, pas sur une table théorique.
    const zones = { ef: p + 35, endurance: p + paceAdj, seuil: p - 30, vma: p - 55 };
    return { form, run, aff, target, paceTarget: zones.endurance, zones, ref };
  },

  /** Alternative intérieure préférée pour la course. */
  indoorRun(aff) { return (aff.course_tapis || 0) >= 1 ? 'course_tapis' : 'rameur'; },

  surf(outdoor, type) { return outdoor ? 'sur route' : (type === 'course_tapis' ? 'sur tapis, pente 1 %' : ''); },

  // ── Séances ────────────────────────────────────────────────────────────────
  // Règle : on court pour s'échauffer et pour récupérer. Pas de marche.
  warmRun(z, min = 10) {
    return { t: 'Échauffement', d: `${min} min de footing à ${cePace(z.ef)}/km, respiration facile, puis 3 lignes droites de 20 s` };
  },
  coolRun(min = 6) {
    return { t: 'Retour au calme', d: `${min} min de footing très lent, puis étirements mollets, ischios, psoas` };
  },

  endurance(ctx, outdoor) {
    const km = ctx.target, z = ctx.zones;
    const type = outdoor ? 'course_ext' : this.indoorRun(ctx.aff);
    if (type === 'rameur') return this.rameurEndurance(ctx, km);
    const min = Math.round(km * z.endurance / 60) + 16;
    const neg = ctx.form.state === 'regulier' || ctx.form.state === 'progression';
    return {
      type, outdoor, role: 'endurance',
      title: outdoor ? 'Sortie longue' : 'Sortie longue sur tapis', focus: 'Endurance',
      duration: min, distance: km, pace: z.endurance,
      blocks: [
        this.warmRun(z, 10),
        { t: 'Bloc principal', d: `${ceKm(km)} km en continu à ${cePace(z.endurance)}/km ${this.surf(outdoor, type)}${neg ? ` — les 2 derniers km à ${cePace(z.endurance - 15)}/km` : ''}` },
        this.coolRun(6),
      ],
    };
  },

  footing(ctx, outdoor) {
    const km = Math.max(3, Math.round(ctx.target * 0.7 * 2) / 2), z = ctx.zones;
    const type = outdoor ? 'course_ext' : this.indoorRun(ctx.aff);
    if (type === 'rameur') return this.rameurEndurance(ctx, km);
    return {
      type, outdoor, role: 'footing',
      title: outdoor ? 'Footing souple' : 'Footing sur tapis', focus: 'Aérobie',
      duration: Math.round(km * z.ef / 60) + 10, distance: km, pace: z.ef,
      blocks: [
        { t: 'Bloc principal', d: `${ceKm(km)} km à ${cePace(z.ef)}/km — tu dois pouvoir parler en courant` },
        { t: 'Lignes droites', d: "5 × 20 s d'accélération progressive, 40 s de footing entre chaque" },
        { t: 'Gainage', d: '2 × (planche 45 s + gainage latéral 30 s par côté)' },
      ],
    };
  },

  intensite(ctx, outdoor) {
    const z = ctx.zones;
    const type = outdoor ? 'course_ext' : this.indoorRun(ctx.aff);
    if (type === 'rameur') return this.rameurIntervalles(ctx);
    const prog = ctx.form.state === 'progression';
    // Alternance seuil / VMA d'une semaine sur l'autre : deux stimulus différents.
    const seuil = Math.floor(ceDiff(ctx.ref, '2026-01-05') / 7) % 2 === 0;
    const core = seuil
      ? { title: 'Séance au seuil', d: `${prog ? 3 : 2} × 8 min à ${cePace(z.seuil)}/km, récupération 3 min de footing à ${cePace(z.ef)}/km`, min: prog ? 55 : 47 }
      : { title: 'Fractionné court', d: `2 séries de ${prog ? 8 : 6} × (45 s à ${cePace(z.vma)}/km — 45 s de footing lent), 3 min de footing entre les séries`, min: prog ? 52 : 45 };
    return {
      type, outdoor, role: 'intensite',
      title: core.title + (outdoor ? '' : ' sur tapis'), focus: 'Intensité',
      duration: core.min, distance: null, pace: null,
      blocks: [this.warmRun(z, 12), { t: 'Bloc principal', d: core.d }, this.coolRun(8)],
    };
  },

  rameurEndurance(ctx, km) {
    const min = Math.round(km * ctx.zones.ef / 60);
    return {
      type: 'rameur', outdoor: false, role: 'endurance', title: 'Endurance rameur', focus: 'Endurance',
      duration: min + 12, distance: null, pace: null,
      blocks: [
        { t: 'Échauffement', d: '8 min cadence 20, appuis longs' },
        { t: 'Bloc principal', d: `${min} min en continu, cadence 22-24, split régulier` },
        { t: 'Retour au calme', d: '4 min cadence 18 + étirements dorsaux' },
      ],
    };
  },

  rameurIntervalles(ctx) {
    const n = ctx.form.state === 'progression' ? 6 : 4;
    return {
      type: 'rameur', outdoor: false, role: 'intensite', title: 'Rameur — intervalles', focus: 'Intensité',
      duration: 12 + n * 4, distance: null, pace: null,
      blocks: [
        { t: 'Échauffement', d: '8 min cadence 20' },
        { t: 'Bloc principal', d: `${n} × (500 m à fond, 2 min cadence 18 entre chaque) — note ton split moyen` },
        { t: 'Retour au calme', d: '4 min cadence 18' },
      ],
    };
  },

  boxe(ctx, forceRounds) {
    const lvl = ctx.form.state === 'coupure' ? 0 : ctx.form.state === 'reprise' ? 1 : ctx.form.state === 'progression' ? 3 : 2;
    const rounds = forceRounds || 4 + lvl, corde = 3 + Math.floor(lvl / 2);
    return {
      type: 'sac', outdoor: false, role: 'mixte', title: 'Boxe — sac & corde', focus: lvl <= 1 ? 'Technique' : 'Intensité', lvl,
      duration: 18 + rounds * 4, distance: null, pace: null, rounds,
      blocks: [
        { t: 'Échauffement', d: `${corde} rounds de corde (2 min / 45 s) puis 1 round de shadow boxing` },
        { t: 'Bloc principal', d: `${rounds} rounds de sac (3 min / 1 min) — ${lvl >= 2 ? 'combos 1-2-3-2, alternance tête et corps, 15 s à fond en fin de round' : 'jab-cross, garde haute, déplacements latéraux'}` },
        { t: 'Gainage', d: `${2 + lvl} × (planche 45 s + gainage latéral 30 s par côté + 20 relevés de bassin)` },
      ],
    };
  },

  mixte(ctx, forceMin) {
    if ((ctx.aff.sac || 0) + (ctx.aff.boxe || 0) >= (ctx.aff.rameur || 0)) return this.boxe(ctx);
    const min = forceMin || (ctx.form.state === 'coupure' ? 16 : ctx.form.state === 'progression' ? 26 : 20);
    return {
      type: 'rameur', outdoor: false, role: 'mixte', title: 'Rameur & renforcement', focus: 'Mixte',
      duration: min + 20, distance: null, pace: null,
      blocks: [
        { t: 'Cardio', d: `${min} min de rameur, cadence 22-24, en aisance respiratoire` },
        { t: 'Renforcement', d: '3 tours : 12 pompes · 20 squats · 10 fentes par jambe · planche 45 s' },
        { t: 'Mobilité', d: '5 min hanches et chevilles' },
      ],
    };
  },

  recup(ctx, forceMin) {
    const run = Math.max(12, forceMin || 25);
    return {
      type: 'course_ext', outdoor: true, role: 'recup', title: 'Décrassage', focus: 'Récupération',
      duration: run + 10, distance: null, pace: null,
      blocks: [
        { t: 'Bloc principal', d: `${run} min de footing à ${cePace(ctx.zones.ef + 20)}/km — volontairement lent, c'est le but` },
        { t: 'Mobilité', d: '10 min : mollets, ischios, psoas, épaules, tenus 40 s chacun' },
      ],
    };
  },

  /** Réduit vraiment une séance d'appoint (blocs régénérés), au lieu de mentir sur la durée. */
  shrink(s, targetMin, ctx) {
    if (s.role === 'recup') return this.recup(ctx, Math.max(12, targetMin - 10));
    if (s.type === 'sac') {
      const r = Math.max(3, Math.floor((targetMin - 18) / 4));
      return r < s.rounds ? this.boxe(ctx, r) : null;
    }
    if (s.role === 'mixte') return this.mixte(ctx, Math.max(10, targetMin - 20));
    if (s.role === 'footing') {
      const km = Math.max(3, Math.round((targetMin - 10) * 60 / ctx.zones.ef * 2) / 2);
      if (km >= s.distance) return null;
      const n = this.footing(ctx, s.outdoor);
      n.distance = km; n.duration = Math.round(km * ctx.zones.ef / 60) + 10;
      n.blocks[0].d = `${ceKm(km)} km à ${cePace(ctx.zones.ef)}/km — tu dois pouvoir parler en courant`;
      return n;
    }
    return null;
  },

  // ── Répartition des rôles sur les jours choisis ────────────────────────────
  ROLES: {
    1: ['endurance'],
    2: ['endurance', 'intensite'],
    3: ['endurance', 'intensite', 'mixte'],
    4: ['endurance', 'intensite', 'mixte', 'footing'],
    5: ['endurance', 'intensite', 'mixte', 'footing', 'recup'],
    6: ['endurance', 'intensite', 'mixte', 'footing', 'recup', 'recup'],
    7: ['endurance', 'intensite', 'mixte', 'footing', 'recup', 'recup', 'recup'],
  },

  roleList(n, state) {
    let r = (this.ROLES[Math.min(n, 7)] || ['endurance']).slice(0, n);
    if (state === 'surcharge') r = r.map((x, i) => (i === 0 ? 'footing' : 'recup'));
    else if (state === 'coupure') r = r.map((x, i) => (i === 0 ? 'endurance' : i === 1 ? 'mixte' : 'recup'));
    else if (state === 'reprise') r = r.map((x, i) => (x === 'intensite' ? 'mixte' : i >= 3 ? 'recup' : x));
    return r;
  },

  build(role, ctx, outdoor) {
    if (role === 'endurance') return this.endurance(ctx, outdoor);
    if (role === 'intensite') return this.intensite(ctx, outdoor);
    if (role === 'footing')   return this.footing(ctx, outdoor);
    if (role === 'recup')     return this.recup(ctx);
    return this.mixte(ctx);
  },

  /**
   * Les séances de la semaine, sur les jours que TU as cochés.
   * override = { [date]: 'out' | 'in' } pour forcer la modalité à la main.
   */
  week(sessions, forecast, settings, refDate, override = {}) {
    const ref = refDate || ceISO(new Date());
    const ctx = this.context(sessions, ref);
    ctx.ref = ref;
    const dows = (settings.coach_days && settings.coach_days.length ? settings.coach_days : [1, 5]);
    const dates = [...new Set(dows.map(d => ceNextDow(ref, d)))].sort();
    if (!dates.length) return { ref, ctx, days: [], proposed: 0, cap: 0, capped: false };

    const days = dates.map(date => {
      const w = forecast ? Weather.forDate(forecast, date) : null;
      const forced = override[date];
      const outdoorOK = forced ? forced === 'out' : (w ? w.outdoor : true);
      return {
        date, dow: ceDate(date).getDay() || 7, weather: w, weatherOutdoor: outdoorOK, forced: !!forced,
        score: (w ? w.best.score : 50) + (outdoorOK ? 15 : 0),
      };
    });

    // 1 — les séances dures partent sur les jours les plus cléments
    const roles = this.roleList(days.length, ctx.form.state);
    const isHard = r => r === 'endurance' || r === 'intensite';
    const byScore = days.map((d, i) => i).sort((a, b) => days[b].score - days[a].score);
    const assign = new Array(days.length).fill(null);
    roles.filter(isHard).forEach((r, k) => { assign[byScore[k]] = r; });
    const rest = roles.filter(r => !isHard(r));
    days.forEach((d, i) => { if (!assign[i]) assign[i] = rest.shift() || 'recup'; });

    // 2 — jamais deux séances dures collées
    for (let i = 1; i < days.length; i++) {
      if (isHard(assign[i]) && isHard(assign[i - 1]) && ceDiff(days[i].date, days[i - 1].date) === 1) {
        assign[i] = ctx.form.state === 'progression' ? 'footing' : 'recup';
      }
    }

    days.forEach((d, i) => {
      const s = this.build(assign[i], ctx, d.weatherOutdoor);
      d.role = assign[i];
      d.outdoor = s.outdoor;
      d.session = s;
    });

    // 3 — plafond de volume, en minutes réelles, réellement appliqué
    const floor = ['coupure', 'reprise'].includes(ctx.form.state) ? 100 : 80;
    const cap = Math.max(floor, Math.round((ctx.form.minPerWeek || 0) * 1.3 + 20));
    let proposed = days.reduce((t, d) => t + d.session.duration, 0);
    // On ne rabote jamais la séance clé : seules les séances d'appoint absorbent le surplus,
    // et on RÉGÉNÈRE la séance pour que les blocs collent à la durée annoncée.
    ctx.cap = cap;
    for (const role of ['recup', 'footing', 'mixte']) {
      if (proposed <= cap) break;
      for (let i = days.length - 1; i >= 0 && proposed > cap; i--) {
        const d = days[i];
        if (d.role !== role) continue;
        const target = Math.max(20, d.session.duration - (proposed - cap));
        const smaller = this.shrink(d.session, target, ctx);
        if (!smaller || smaller.duration >= d.session.duration) continue;
        proposed -= d.session.duration - smaller.duration;
        smaller.trimmed = true;
        d.session = smaller;
        d.outdoor = smaller.outdoor;
      }
    }
    days.forEach(d => { d.why = this.why(ctx, d, d.session, d.role); });

    return { ref, ctx, days, proposed, cap, capped: proposed > cap + 10 };
  },

  why(ctx, day, s, role) {
    const out = [], f = ctx.form;
    if (f.state === 'coupure') out.push(`${f.daysSince} jours sans séance — volume à ${Math.round(Math.min(ctx.run.decay, f.factor) * 100)} % de ta référence, pas de fractionné cette semaine.`);
    else if (f.state === 'reprise') out.push(`${f.daysSince} jours sans séance — on redémarre sous ta référence, le fractionné revient la semaine prochaine.`);
    else if (f.state === 'surcharge') out.push(`Charge des 7 derniers jours à ${Math.round(f.ratio * 100)} % de ta moyenne — semaine allégée, c'est volontaire.`);
    else if (f.state === 'progression') out.push(`${f.perWeek} séances/semaine tenues sur 4 semaines — on monte de 6 à 10 %.`);
    else out.push(`Charge stable (${f.acute} pts sur 7 j vs ${f.chronic} pts/sem.) — on maintient.`);

    if (s.distance) out.push(`Référence course : ${ceKm(ctx.run.ref)} km (2 meilleures sorties des 60 derniers jours) → cible ${ceKm(s.distance)} km à ${cePace(s.pace)}/km.`);
    if (role === 'intensite') out.push(`Allures calées sur ta médiane récente (${cePace(ctx.run.pace)}/km) : seuil ${cePace(ctx.zones.seuil)}, vite ${cePace(ctx.zones.vma)}.`);
    if (s.trimmed) out.push(`Séance réduite pour tenir le plafond hebdomadaire de ${ctx.cap} min.`);
    if (s.optional) out.push("Séance optionnelle : à faire seulement si la semaine s'est bien passée.");

    if (!day.weather) out.push('Météo indisponible — modalité par défaut, à ajuster.');
    else if (day.forced) out.push(`Modalité forcée à la main (${day.outdoor ? 'extérieur' : 'salle'}) — ${day.weather.why}.`);
    else if (day.outdoor) out.push(`Extérieur : ${day.weather.why}.`);
    else if (day.weatherOutdoor) out.push(`Séance d'intérieur par nature — ${day.weather.why}, la sortie est placée un autre jour.`);
    else out.push(`Repli en salle : ${day.weather.why}.`);
    return out;
  },
};
