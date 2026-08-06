/**
 * Génère le plan de la semaine hors navigateur et l'écrit en JSON sur stdout.
 *
 * Le moteur (coach-engine.js) est volontairement sans DOM ni dépendance : on
 * peut donc le faire tourner tel quel dans Node, plutôt que de réécrire en
 * Python une deuxième version de la logique — qui divergerait au premier
 * ajustement.
 *
 * Usage :
 *   node build_week.js [--date AAAA-MM-JJ] [--no-weather]
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = __dirname;
const args = process.argv.slice(2);
const argVal = (name, fallback = null) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};

function readJson(rel, fallback) {
  try {
    return JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
  } catch {
    return fallback;
  }
}

async function main() {
  const sessions = readJson('data/sessions.json', []);
  const settings = readJson('data/settings.json', {});
  const refDate = argVal('--date') || new Date().toISOString().slice(0, 10);

  // localStorage n'existe pas dans Node : le moteur ne s'en sert que pour
  // mettre la météo en cache, un stub suffit.
  const store = new Map();
  const sandbox = {
    console, Math, Date, JSON, fetch, URL, setTimeout, clearTimeout,
    localStorage: {
      getItem: k => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
    },
  };
  const ctx = vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'coach-engine.js'), 'utf8'), ctx);

  // Météo : sans elle le moteur choisit l'extérieur par défaut, ce qui reste
  // exploitable. On ne bloque donc jamais la génération là-dessus.
  let forecast = null;
  if (!args.includes('--no-weather') && settings.lat && settings.lon) {
    try {
      sandbox.__lat = settings.lat;
      sandbox.__lon = settings.lon;
      forecast = await vm.runInContext('Weather.get(__lat, __lon)', ctx);
    } catch (e) {
      process.stderr.write(`météo indisponible (${e.message}) — on continue sans\n`);
    }
  }

  sandbox.__sessions = sessions;
  sandbox.__settings = settings;
  sandbox.__forecast = forecast;
  sandbox.__ref = refDate;
  const week = vm.runInContext(
    'CoachEngine.week(__sessions, __forecast, __settings, __ref)', ctx);

  process.stdout.write(JSON.stringify({
    ref: week.ref,
    form: { state: week.ctx.form.state, label: week.ctx.form.label, note: week.ctx.form.note },
    days: week.days.map(d => ({
      date: d.date,
      outdoor: d.outdoor,
      session: {
        type: d.session.type,
        title: d.session.title,
        focus: d.session.focus,
        duration: d.session.duration,
        distance: d.session.distance,
        pace: d.session.pace,
        steps: d.session.steps,
        blocks: d.session.blocks,
      },
    })),
  }, null, 2));
}

main().catch(e => {
  process.stderr.write(`build_week a échoué : ${e.stack}\n`);
  process.exit(1);
});
