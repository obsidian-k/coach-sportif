/* ═══════════════════════════════════════════════════════════
   PERFORMANCE — progression par activité.

   Chaque discipline se juge sur une métrique différente : une course
   progresse quand l'allure baisse, une rando quand le dénivelé monte,
   une séance de renfo quand le nombre de répétitions augmente.
   D'où un registre de métriques par type plutôt qu'un graphe unique.
   ═══════════════════════════════════════════════════════════ */

// ─── Registre des métriques ───────────────────────────────────────────────────
// betterIsLow : une valeur plus basse est meilleure (l'allure, typiquement).
const METRICS = {
  pace: {
    label: 'Allure', unit: '/km', betterIsLow: true,
    get: s => sessionPace(s),      // toujours dérivée, jamais lue telle quelle
    fmt: v => formatPace(Math.round(v)),
  },
  distance: {
    label: 'Distance', unit: 'km', betterIsLow: false,
    get: s => s.distance_km || null,
    fmt: v => `${v.toFixed(1).replace('.0', '')} km`,
  },
  duration: {
    label: 'Durée', unit: 'min', betterIsLow: false,
    get: s => s.duration_min || null,
    fmt: v => formatDuration(v),
  },
  elevation: {
    label: 'Dénivelé', unit: 'm', betterIsLow: false,
    get: s => s.elevation_m || null,
    fmt: v => `${Math.round(v)} m`,
  },
  speed: {
    label: 'Vitesse moy.', unit: 'km/h', betterIsLow: false,
    get: s => (s.distance_km && s.duration_min ? s.distance_km / (s.duration_min / 60) : null),
    fmt: v => `${v.toFixed(1).replace('.', ',')} km/h`,
  },
  reps: {
    label: 'Répétitions', unit: '', betterIsLow: false,
    get: s => s.reps_total || null,
    fmt: v => `${Math.round(v)}`,
  },
  rounds: {
    label: 'Rounds', unit: '', betterIsLow: false,
    get: s => s.rounds || null,
    fmt: v => `${Math.round(v)}`,
  },
  calories: {
    label: 'Calories', unit: 'kcal', betterIsLow: false,
    get: s => s.calories || null,
    fmt: v => `${Math.round(v)} kcal`,
  },
};

// Métriques proposées par discipline, la première étant celle affichée par défaut.
const TYPE_METRICS = {
  course_ext:   ['pace', 'distance', 'duration'],
  course_tapis: ['pace', 'distance', 'duration'],
  rando:        ['distance', 'elevation', 'duration'],
  marche:       ['distance', 'duration'],
  vtt:          ['distance', 'speed', 'elevation'],
  velo:         ['duration', 'distance', 'calories'],
  rameur:       ['duration', 'calories'],
  sac:          ['duration', 'rounds', 'calories'],
  boxe:         ['duration', 'calories'],
  corde:        ['duration', 'rounds'],
  renfo:        ['reps', 'duration'],
  hiit:         ['duration', 'calories'],
  cardio:       ['duration', 'calories'],
};

const PERF_STATE = { type: null, metric: null };

// ─── Calculs ──────────────────────────────────────────────────────────────────

/** Points {date, value} triés chronologiquement pour un type et une métrique. */
function perfSeries(sessions, type, metricKey) {
  const m = METRICS[metricKey];
  if (!m) return [];
  return sessions
    .filter(s => s.type === type)
    .map(s => ({ date: s.date, value: m.get(s), session: s }))
    .filter(p => p.value != null && isFinite(p.value))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** Moyenne glissante — lisse le bruit séance à séance pour révéler la tendance. */
function rollingMean(points, window = 5) {
  return points.map((_, i) => {
    const from = Math.max(0, i - window + 1);
    const slice = points.slice(from, i + 1);
    return slice.reduce((a, p) => a + p.value, 0) / slice.length;
  });
}

/**
 * Tendance : compare la moyenne des séances récentes à celle d'avant.
 * On compare des effectifs égaux plutôt que des fenêtres de dates, pour
 * rester lisible quand la pratique est irrégulière.
 */
function perfTrend(points, metricKey) {
  if (points.length < 6) return null;
  const n = Math.max(3, Math.floor(points.length / 3));
  const recent = points.slice(-n);
  const before = points.slice(-2 * n, -n);
  if (!before.length) return null;

  const avg = arr => arr.reduce((a, p) => a + p.value, 0) / arr.length;
  const a = avg(before), b = avg(recent);
  if (!a) return null;

  const pct = ((b - a) / a) * 100;
  const betterIsLow = METRICS[metricKey].betterIsLow;
  const improving = betterIsLow ? pct < 0 : pct > 0;
  return {
    pct: Math.abs(pct), improving,
    flat: Math.abs(pct) < 2,
    from: a, to: b, n,
  };
}

/** Record personnel sur la métrique. */
function perfRecord(points, metricKey) {
  if (!points.length) return null;
  const betterIsLow = METRICS[metricKey].betterIsLow;
  return points.reduce((best, p) =>
    (betterIsLow ? p.value < best.value : p.value > best.value) ? p : best, points[0]);
}

// ─── Vue ──────────────────────────────────────────────────────────────────────

function performance(main) {
  const sessions = DB.getSessions();

  // Disciplines réellement pratiquées, les plus fréquentes d'abord : pas de
  // sélecteur encombré d'activités faites deux fois en 2019.
  const counts = {};
  sessions.forEach(s => { if (TYPE_METRICS[s.type]) counts[s.type] = (counts[s.type] || 0) + 1; });
  const types = Object.keys(counts).filter(t => counts[t] >= 3).sort((a, b) => counts[b] - counts[a]);

  if (!types.length) {
    main.innerHTML = `
      <div class="page-header"><h2>Performance</h2></div>
      <div class="empty-state"><p>Pas encore assez de séances pour tracer une progression.</p></div>`;
    return;
  }

  if (!types.includes(PERF_STATE.type)) PERF_STATE.type = types[0];
  const avail = TYPE_METRICS[PERF_STATE.type];
  if (!avail.includes(PERF_STATE.metric)) PERF_STATE.metric = avail[0];

  main.innerHTML = `
    <div class="page-header">
      <h2>Performance</h2>
      <div class="page-sub">Ta progression, discipline par discipline</div>
    </div>
    <div class="perf-types" id="perf-types"></div>
    <div id="perf-body"></div>`;

  const typesEl = document.getElementById('perf-types');
  types.forEach(t => {
    const btn = document.createElement('button');
    btn.className = `perf-type${t === PERF_STATE.type ? ' active' : ''}`;
    btn.style.setProperty('--pt-color', typeColor(t));
    btn.innerHTML = `<span class="pt-icon">${typeIcon(t)}</span>
      <span class="pt-lbl">${typeLabel(t)}</span><span class="pt-n">${counts[t]}</span>`;
    btn.onclick = () => {
      PERF_STATE.type = t;
      PERF_STATE.metric = TYPE_METRICS[t][0];
      destroyCharts();
      performance(main);
    };
    typesEl.appendChild(btn);
  });

  renderPerfBody(sessions, document.getElementById('perf-body'));
}

function renderPerfBody(sessions, el) {
  const type = PERF_STATE.type;
  const metricKey = PERF_STATE.metric;
  const m = METRICS[metricKey];
  const color = typeColor(type);
  const points = perfSeries(sessions, type, metricKey);

  if (points.length < 2) {
    el.innerHTML = `<div class="empty-state"><p>Pas assez de données en ${typeLabel(type)}
      pour cette métrique.</p></div>`;
    return;
  }

  const record = perfRecord(points, metricKey);
  const trend = perfTrend(points, metricKey);
  const last = points[points.length - 1];
  const total = points.reduce((a, p) => a + p.value, 0);

  // Bandeau de tendance : le message principal, formulé en clair.
  let trendHtml = '';
  if (trend) {
    const cls = trend.flat ? 'flat' : trend.improving ? 'up' : 'down';
    const arrow = trend.flat ? '→' : trend.improving ? '↗' : '↘';
    const verb = trend.flat
      ? 'Tu te maintiens'
      : trend.improving ? 'Tu progresses' : 'Tu es en retrait';
    trendHtml = `
      <div class="perf-trend ${cls}">
        <span class="pf-arrow">${arrow}</span>
        <div>
          <div class="pf-verb">${verb} — ${m.label.toLowerCase()}</div>
          <div class="pf-detail">
            ${m.fmt(trend.from)} → ${m.fmt(trend.to)}
            ${trend.flat ? '' : `· ${trend.pct.toFixed(0)} % sur tes ${trend.n} dernières séances`}
          </div>
        </div>
      </div>`;
  }

  const metricBtns = TYPE_METRICS[type].map(k =>
    `<button class="perf-metric${k === metricKey ? ' active' : ''}" data-metric="${k}">
       ${METRICS[k].label}</button>`).join('');

  el.innerHTML = `
    ${trendHtml}
    <div class="perf-metrics">${metricBtns}</div>

    <div class="kpi-row">
      <div class="kpi-card perf-record">
        <div class="kpi-lbl">Record — ${m.label.toLowerCase()}</div>
        <div class="kpi-num" style="font-size:1.9rem;color:${color}">${m.fmt(record.value)}</div>
        <div class="kpi-sub">${formatDate(record.date)}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-lbl">Dernière séance</div>
        <div class="kpi-num" style="font-size:1.9rem">${m.fmt(last.value)}</div>
        <div class="kpi-sub">${formatDate(last.date)}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-lbl">Séances</div>
        <div class="kpi-num">${points.length}</div>
        <div class="kpi-sub">avec cette donnée</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-lbl">${m.betterIsLow ? 'Moyenne' : 'Cumul'}</div>
        <div class="kpi-num" style="font-size:1.9rem">
          ${m.betterIsLow ? m.fmt(total / points.length) : m.fmt(total)}</div>
        <div class="kpi-sub">sur l'historique</div>
      </div>
    </div>

    <div class="chart-wrap">
      <div class="chart-lbl">${m.label} — ${typeLabel(type)}
        <span class="chart-hint">points : séances · ligne : moyenne sur 5 séances</span></div>
      <div class="chart-container" style="height:300px"><canvas id="chart-perf"></canvas></div>
    </div>`;

  el.querySelectorAll('.perf-metric').forEach(b => {
    b.onclick = () => {
      PERF_STATE.metric = b.dataset.metric;
      destroyCharts();
      renderPerfBody(sessions, el);
    };
  });

  drawPerfChart(points, metricKey, color, record);
}

function drawPerfChart(points, metricKey, color, record) {
  const m = METRICS[metricKey];
  const canvas = document.getElementById('chart-perf');
  if (!canvas) return;
  const mean = rollingMean(points, 5);

  if (chartInstances.perf) chartInstances.perf.destroy();
  chartInstances.perf = new Chart(canvas, {
    data: {
      labels: points.map(p => p.date),
      datasets: [
        {
          type: 'line', label: 'Tendance (5 séances)', data: mean,
          borderColor: color, borderWidth: 2.5, tension: .35,
          pointRadius: 0, fill: false, order: 1,
        },
        {
          type: 'scatter', label: 'Séances',
          data: points.map(p => p.value),
          // Le record ressort visuellement : c'est ce qu'on vient chercher.
          pointBackgroundColor: points.map(p => p === record ? '#FA4B00' : color + '66'),
          pointBorderColor: points.map(p => p === record ? '#FA4B00' : 'transparent'),
          pointRadius: points.map(p => p === record ? 6 : 3),
          order: 2,
        },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: 'nearest', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            title: items => formatDate(points[items[0].dataIndex].date),
            label: item => {
              const v = item.parsed.y;
              const isRec = points[item.dataIndex] === record;
              return `${m.fmt(v)}${isRec ? '  ·  record' : ''}`;
            },
          },
        },
      },
      scales: {
        x: {
          type: 'category',
          ticks: {
            maxTicksLimit: 8, autoSkip: true,
            callback(i) {
              const d = this.getLabelForValue(i);
              return d ? new Date(d + 'T12:00:00')
                .toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' }) : '';
            },
          },
          grid: { display: false },
        },
        y: {
          // L'allure se lit à l'envers : plus bas = plus rapide, donc on
          // inverse l'axe pour que « progresser » aille visuellement vers le haut.
          reverse: !!m.betterIsLow,
          ticks: { callback: v => m.fmt(v) },
        },
      },
    },
  });
}
