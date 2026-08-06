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

/** Durée lisible : « 45 s », « 8 min », « 1 min 30 ». */
function ceDur(sec) {
  if (sec < 60) return `${sec} s`;
  const m = Math.floor(sec / 60), s = sec % 60;
  return s ? `${m} min ${s}` : `${m} min`;
}

// ─── Étapes → texte ───────────────────────────────────────────────────────────
// L'affichage est *dérivé* des étapes structurées : une seule source de vérité
// pour l'écran et pour la montre, qui ne peuvent donc plus diverger.

const CE_STEP_NAMES = {
  warmup: 'Échauffement', work: 'Bloc principal', recovery: 'Récupération',
  cooldown: 'Retour au calme', rest: 'Repos', interval: 'Série',
};

/** Quantité d'une étape : distance, durée ou répétitions. */
function ceStepAmount(st) {
  if (st.distanceKm) return `${ceKm(st.distanceKm)} km`;
  if (st.reps) return `${st.reps}`;
  if (st.seconds) return ceDur(st.seconds);
  return '';
}

// Libellé par défaut quand l'étape n'en porte pas : « 45 s » tout seul ne dit
// pas s'il faut souffler ou trottiner.
const CE_DEFAULT_LABELS = { rest: 'de repos', recovery: 'de récupération' };

/** Une étape élémentaire en toutes lettres. */
function ceStepText(st) {
  const label = st.label || CE_DEFAULT_LABELS[st.kind] || '';
  let out = [ceStepAmount(st), label].filter(Boolean).join(' ');
  if (st.paceTarget) {
    // Du plus rapide au plus lent : l'allure se lit en minutes par km, donc
    // la borne basse est la plus rapide.
    const [fast, slow] = st.paceTarget;
    out += ` à ${cePace(fast)}–${cePace(slow)}/km`;
  }
  return out;
}

/** Un bloc { t, d } par étape de premier niveau — le format attendu par la vue. */
function ceBlocks(steps) {
  return (steps || []).map(st => {
    if (st.kind === 'interval') {
      const inner = st.steps.map(ceStepText).join(' · ');
      return {
        t: st.name || `${st.repeat} × série`,
        d: `${st.repeat} × (${inner})`,
      };
    }
    return { t: st.name || CE_STEP_NAMES[st.kind] || 'Bloc', d: ceStepText(st) };
  });
}

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
  W: {
    course_ext: 1.1, course_tapis: 1, boxe: 1.1, sac: 1, corde: 1.15,
    rameur: 1, velo: .8, renfo: .8, cardio: .9, hiit: 1.15,
    // Endurance longue et peu intense : beaucoup de minutes pour une charge
    // modérée. Sans ces poids bas, une rando de 4 h ferait croire au moteur
    // à une semaine énorme et il couperait la séance suivante.
    rando: .5, vtt: .7, marche: .35,
    autre: .8,
  },
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
    const paceAdj = form.state === 'coupure' ? 25 : form.state === 'reprise' ? 15 : form.state === 'progression' ? -5 : 0;
    return { form, run, aff, target, paceTarget: run.pace + paceAdj, ref };
  },

  /** Alternative intérieure préférée pour la course. */
  indoorRun(aff) { return (aff.course_tapis || 0) >= 1 ? 'course_tapis' : 'rameur'; },

  // ── Construction d'une séance ──────────────────────────────────────────────
  //
  // Chaque séance est décrite par des ÉTAPES structurées, et la phrase
  // française en est déduite — jamais l'inverse. C'est ce qui permet
  // d'envoyer la même séance sur la montre : une chaîne de caractères comme
  // « 5 × (2 min à 4:20/km — 1 min 30 de récup) » n'est interprétable par
  // aucun appareil, et oblige à tout mémoriser en courant.
  //
  // Étape : { kind, seconds?, distanceKm?, paceTarget?[lo,hi], label?,
  //           repeat?, steps?[] }
  // kind ∈ warmup | work | recovery | cooldown | rest | interval

  endurance(ctx, outdoor) {
    const km = ctx.target, p = ctx.paceTarget;
    const type = outdoor ? 'course_ext' : this.indoorRun(ctx.aff);
    const min = Math.round(km * p / 60) + 13;
    const isRow = type === 'rameur';

    const core = isRow
      ? { kind: 'work', seconds: Math.round(km * p), label: 'rameur en continu, cadence 22-24, respiration régulière' }
      : {
          kind: 'work', distanceKm: km, paceTarget: [p - 15, p + 15],
          label: outdoor ? 'en continu' : 'en continu, tapis pente 1 %',
        };

    return {
      type, outdoor,
      title: outdoor ? 'Endurance extérieure' : (isRow ? 'Endurance rameur' : 'Endurance tapis'),
      focus: 'Endurance', duration: min,
      distance: isRow ? null : km, pace: isRow ? null : p,
      steps: [
        { kind: 'warmup', seconds: 480, label: 'marche rapide puis footing très souple' },
        core,
        { kind: 'cooldown', seconds: 300, label: 'marche + étirements mollets / ischios' },
      ],
    };
  },

  fractionne(ctx, outdoor) {
    const p = ctx.paceTarget, reps = ctx.form.state === 'progression' ? 6 : 5;
    const fast = p - 45;
    const type = outdoor ? 'course_ext' : this.indoorRun(ctx.aff);
    return {
      type, outdoor, title: outdoor ? 'Fractionné extérieur' : 'Fractionné tapis',
      focus: 'Intensité', duration: 20 + reps * 4, distance: null, pace: null,
      steps: [
        { kind: 'warmup', seconds: 720, label: 'footing souple + 4 lignes droites' },
        {
          kind: 'interval', repeat: reps, steps: [
            { kind: 'work', seconds: 120, paceTarget: [fast - 10, fast + 10] },
            { kind: 'recovery', seconds: 90, label: 'marche' },
          ],
        },
        { kind: 'cooldown', seconds: 480, label: 'footing très lent' },
      ],
    };
  },

  boxe(ctx) {
    const lvl = ctx.form.state === 'coupure' ? 0 : ctx.form.state === 'reprise' ? 1 : ctx.form.state === 'progression' ? 3 : 2;
    const rounds = 4 + lvl, corde = 3 + Math.floor(lvl / 2);
    const style = lvl >= 2 ? 'combos 1-2-3-2, travail tête et corps' : 'jab-cross, garde haute, pieds mobiles';
    return {
      type: 'sac', outdoor: false, title: 'Boxe : sac & corde', focus: 'Intensité',
      duration: 20 + rounds * 4, distance: null, pace: null, rounds,
      steps: [
        {
          kind: 'interval', repeat: corde, name: 'Échauffement corde', steps: [
            { kind: 'work', seconds: 120, label: 'corde à sauter' },
            { kind: 'rest', seconds: 45 },
          ],
        },
        {
          kind: 'interval', repeat: rounds, name: 'Rounds de sac', steps: [
            { kind: 'work', seconds: 180, label: `sac, ${style}` },
            { kind: 'rest', seconds: 60 },
          ],
        },
        {
          kind: 'interval', repeat: 2 + lvl, name: 'Gainage', steps: [
            { kind: 'work', seconds: 45, label: 'planche' },
            { kind: 'work', seconds: 60, label: 'gainage latéral, 30 s par côté' },
          ],
        },
      ],
    };
  },

  mixte(ctx) {
    const useRameur = (ctx.aff.rameur || 0) >= (ctx.aff.velo || 0);
    const min = ctx.form.state === 'coupure' ? 16 : ctx.form.state === 'progression' ? 25 : 20;
    return {
      type: useRameur ? 'rameur' : 'velo', outdoor: false,
      title: useRameur ? 'Rameur & renforcement' : 'Vélo & renforcement',
      focus: 'Mixte', duration: min + 20, distance: null, pace: null,
      steps: [
        {
          kind: 'work', seconds: min * 60, name: 'Cardio',
          label: `${useRameur ? 'rameur, cadence 22-24' : 'vélo, résistance modérée'} en aisance respiratoire`,
        },
        {
          kind: 'interval', repeat: 3, name: 'Renforcement', steps: [
            { kind: 'work', reps: 12, label: 'pompes' },
            { kind: 'work', reps: 20, label: 'squats' },
            { kind: 'work', seconds: 45, label: 'planche' },
            { kind: 'work', reps: 10, label: 'fentes par jambe' },
          ],
        },
        { kind: 'cooldown', seconds: 300, label: 'mobilité hanches et épaules' },
      ],
    };
  },

  recup(ctx) {
    return {
      type: 'velo', outdoor: false, title: 'Récupération active', focus: 'Récup',
      duration: 35, distance: null, pace: null,
      steps: [
        {
          kind: 'work', seconds: 1500, name: 'Cardio léger',
          label: 'vélo ou marche rapide, tu dois pouvoir tenir une conversation',
        },
        {
          kind: 'cooldown', seconds: 600,
          label: 'étirements longs : mollets, ischios, psoas, épaules',
        },
      ],
    };
  },

  /**
   * Les deux séances de la semaine de télétravail.
   * `override` = { [date]: 'out' | 'in' } pour forcer manuellement la modalité.
   */
  week(sessions, forecast, settings, refDate, override = {}) {
    const ref = refDate || ceISO(new Date());
    const ctx = this.context(sessions, ref);
    const dows = (settings.coach_days && settings.coach_days.length ? settings.coach_days : [1, 5]);
    const dates = dows.map(d => ceNextDow(ref, d)).sort();

    const days = dates.map(date => {
      const w = forecast ? Weather.forDate(forecast, date) : null;
      const forced = override[date];
      const outdoor = forced ? forced === 'out' : (w ? w.outdoor : true);
      return { date, dow: ceDate(date).getDay() || 7, weather: w, outdoor, forced: !!forced };
    });

    // Le jour le plus clément prend la sortie course. Fonctionne quel que soit
    // le nombre de jours choisis : on classe et on prend le meilleur.
    const scored = days.map((d, i) => ({
      i, score: (d.weather ? d.weather.best.score : 50) + (d.outdoor ? 15 : 0),
    }));
    const runIdx = scored.slice().sort((a, b) => b.score - a.score)[0].i;

    // Les autres jours alternent intensité et mixte, pour ne pas enchaîner
    // deux séances de même nature dans la semaine.
    const prefersBoxe = (ctx.aff.sac || 0) + (ctx.aff.boxe || 0) >= (ctx.aff.rameur || 0);
    let otherRank = 0;

    days.forEach((d, i) => {
      const isRun = i === runIdx;
      let s;
      if (ctx.form.state === 'surcharge' && !isRun) s = this.recup(ctx);
      else if (isRun) {
        s = (ctx.form.state === 'progression' && d.outdoor) ? this.fractionne(ctx, d.outdoor) : this.endurance(ctx, d.outdoor);
      } else {
        // Alternance : la 1re séance secondaire suit ton affinité,
        // la 2e prend l'autre nature, la 3e revient à la première.
        const wantBoxe = otherRank % 2 === 0 ? prefersBoxe : !prefersBoxe;
        s = wantBoxe ? this.boxe(ctx) : this.mixte(ctx);
        otherRank++;
      }
      // La prose affichée est dérivée des étapes, à un seul endroit.
      s.blocks = ceBlocks(s.steps);
      d.weatherOutdoor = d.outdoor;
      d.outdoor = s.outdoor;          // le badge suit la séance, pas juste le ciel
      d.session = s;
      d.why = this.why(ctx, d, s, isRun);
    });

    // Garde-fou volume — minutes réelles vs minutes réelles.
    // En coupure/reprise le volume est déjà bridé en amont (factor + decay) :
    // on garde un plancher confortable pour ne pas alerter sur deux séances courtes.
    const floor = ['coupure', 'reprise'].includes(ctx.form.state) ? 100 : 80;
    const cap = Math.max(floor, Math.round((ctx.form.minPerWeek || 0) * 1.3 + 20));
    let proposed = days.reduce((t, d) => t + d.session.duration, 0);
    let capped = false;

    if (proposed > cap) {
      // On raccourcit les séances secondaires (jamais la sortie course), en
      // partant de la plus longue et sans descendre sous 20 min : avec trois
      // ou quatre jours, rogner une seule séance ne suffirait pas.
      const others = days
        .filter((d, i) => i !== runIdx)
        .sort((a, b) => b.session.duration - a.session.duration);

      for (const d of others) {
        const excess = proposed - cap;
        if (excess <= 0) break;
        const room = Math.max(20, d.session.duration - excess);
        if (room < d.session.duration) {
          proposed -= d.session.duration - Math.round(room);
          d.session.duration = Math.round(room);
          d.session.trimmed = true;
          d.why.push(`Volume hebdomadaire ramené à ${cap} min (1,3 × tes ${ctx.form.minPerWeek} min/semaine des 4 dernières semaines) : cette séance est raccourcie, garde les rounds les plus propres.`);
        }
      }
      proposed = days.reduce((t, d) => t + d.session.duration, 0);
      capped = proposed > cap;
    }

    return { ref, ctx, days, proposed, cap, capped };
  },

  why(ctx, day, s, isRun) {
    const out = [];
    const f = ctx.form;
    if (f.state === 'coupure') out.push(`${f.daysSince} jours sans séance : volume ramené à ${Math.round(Math.min(ctx.run.decay, f.factor) * 100)} % de ta référence.`);
    else if (f.state === 'reprise') out.push(`${f.daysSince} jours sans séance : on redémarre sous ta référence, pas dessus.`);
    else if (f.state === 'surcharge') out.push(`Charge des 7 derniers jours à ${Math.round(f.ratio * 100)} % de ta moyenne, on allège.`);
    else if (f.state === 'progression') out.push(`${f.perWeek} séances/semaine tenues sur 4 semaines : on peut monter de 6 à 10 %.`);
    else out.push(`Charge stable (${f.acute} pts sur 7 j vs ${f.chronic} pts/sem. en moyenne) : on maintient.`);

    if (isRun && s.distance) out.push(`Référence course : ${ceKm(ctx.run.ref)} km (2 meilleures sorties des 60 derniers jours) → cible ${ceKm(s.distance)} km.`);
    if (!day.weather) out.push('Météo indisponible — modalité par défaut, à ajuster.');
    else if (day.forced) out.push(`Modalité forcée à la main (${day.outdoor ? 'extérieur' : 'salle'}) : ${day.weather.why}.`);
    else if (day.outdoor) out.push(`Extérieur : ${day.weather.why}.`);
    else if (day.weatherOutdoor) out.push(`Séance d'intérieur par nature : ${day.weather.why}, garde la sortie pour l'autre jour.`);
    else out.push(`Repli en salle : ${day.weather.why}.`);
    return out;
  },
};
