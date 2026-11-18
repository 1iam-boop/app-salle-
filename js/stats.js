/*
 * Calculs de performances et de progression.
 * Module pur (aucun accès au DOM) : utilisable dans le navigateur (window.Stats)
 * et sous Node pour les tests (module.exports).
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Stats = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const DAY = 86400000;

  /** Indicateurs suivis pour chaque type d'exercice (ordre = priorité d'affichage). */
  const METRICS = {
    weight: [
      { key: 'e1rm', label: '1RM estimé' },
      { key: 'maxWeight', label: 'Charge max' },
      { key: 'volume', label: 'Volume' },
    ],
    bodyweight: [
      { key: 'maxReps', label: 'Reps max' },
      { key: 'totalReps', label: 'Reps totales' },
      { key: 'maxWeight', label: 'Lest max' },
    ],
    time: [
      { key: 'maxTime', label: 'Durée max' },
      { key: 'totalTime', label: 'Durée totale' },
    ],
  };

  const MAIN_METRIC = { weight: 'e1rm', bodyweight: 'maxReps', time: 'maxTime' };

  const RANGES = { '1M': 31, '3M': 92, '6M': 183, '1A': 366 };

  /* ---------- Nombres ---------- */

  function num(v) {
    if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
    const n = parseFloat(String(v == null ? '' : v).trim().replace(',', '.'));
    return Number.isFinite(n) ? n : 0;
  }

  function round(n, decimals = 1) {
    const f = Math.pow(10, decimals);
    return Math.round(n * f) / f;
  }

  /** Accepte « 90 », « 90 s », « 1:30 » ou « 1'30 » et renvoie des secondes. */
  function parseDuration(v) {
    if (typeof v === 'number') return Number.isFinite(v) && v > 0 ? v : 0;
    const s = String(v == null ? '' : v).trim();
    if (!s) return 0;
    const m = s.match(/^(\d+)\s*[:'’]\s*(\d{1,2})$/);
    if (m) return Number(m[1]) * 60 + Number(m[2]);
    return Math.max(0, num(s));
  }

  /** Formule d'Epley : estimation de la charge maximale sur une répétition. */
  function epley(weight, reps) {
    const w = num(weight);
    const r = num(reps);
    if (w <= 0 || r <= 0) return 0;
    if (r === 1) return w;
    return w * (1 + r / 30);
  }

  /* ---------- Dates (clés locales AAAA-MM-JJ) ---------- */

  function parseDate(key) {
    const [y, m, d] = String(key).split('-').map(Number);
    return new Date(y, (m || 1) - 1, d || 1);
  }

  function dateKey(date) {
    const d = date instanceof Date ? date : new Date(date);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  /** Lundi de la semaine de `date`, à minuit (heure locale). */
  function startOfWeek(date) {
    const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    return d;
  }

  function daysBetween(fromKey, toKey) {
    return Math.round((parseDate(toKey) - parseDate(fromKey)) / DAY);
  }

  /* ---------- Séries et séances ---------- */

  function isValidSet(set, type) {
    if (!set) return false;
    return type === 'time' ? parseDuration(set.time) > 0 : num(set.reps) > 0;
  }

  /** Score servant à désigner la « meilleure série ». */
  function setScore(set, type) {
    if (type === 'time') return parseDuration(set.time);
    if (type === 'bodyweight') return num(set.reps) * 1000 + num(set.weight);
    const e = epley(set.weight, set.reps);
    return e > 0 ? e : num(set.reps) / 1000;
  }

  function entryMetrics(sets, type) {
    const m = { sets: 0, maxWeight: 0, e1rm: 0, volume: 0, maxReps: 0, totalReps: 0, maxTime: 0, totalTime: 0, bestSet: null };
    let bestScore = -1;
    for (const s of sets || []) {
      if (!isValidSet(s, type)) continue;
      m.sets++;
      const w = num(s.weight);
      if (w > m.maxWeight) m.maxWeight = w;
      if (type === 'time') {
        const t = parseDuration(s.time);
        m.totalTime += t;
        if (t > m.maxTime) m.maxTime = t;
      } else {
        const r = num(s.reps);
        m.totalReps += r;
        if (r > m.maxReps) m.maxReps = r;
        m.volume += w * r;
        if (type === 'weight') m.e1rm = Math.max(m.e1rm, epley(w, r));
      }
      const score = setScore(s, type);
      if (score > bestScore) { bestScore = score; m.bestSet = s; }
    }
    m.e1rm = round(m.e1rm, 1);
    m.volume = round(m.volume, 1);
    return m;
  }

  /** Tri chronologique (dir = 1) ou antéchronologique (dir = -1). */
  function sortSessions(sessions, dir = 1) {
    return [...(sessions || [])].sort((a, b) => {
      const c = a.date < b.date ? -1 : a.date > b.date ? 1 : (a.createdAt || 0) - (b.createdAt || 0);
      return c * dir;
    });
  }

  /** Regroupe les séries d'une séance par exercice (un exercice peut apparaître deux fois). */
  function setsByExercise(session) {
    const map = new Map();
    for (const e of session.entries || []) {
      if (!map.has(e.exerciseId)) map.set(e.exerciseId, []);
      map.get(e.exerciseId).push(...(e.sets || []));
    }
    return map;
  }

  function sessionTotals(session, exercisesById) {
    let sets = 0;
    let volume = 0;
    let reps = 0;
    const ids = new Set();
    for (const [id, list] of setsByExercise(session)) {
      const type = (exercisesById[id] && exercisesById[id].type) || 'weight';
      const m = entryMetrics(list, type);
      if (!m.sets) continue;
      ids.add(id);
      sets += m.sets;
      volume += m.volume;
      reps += m.totalReps;
    }
    return { exercises: ids.size, sets, volume: round(volume, 0), reps };
  }

  /* ---------- Historique d'un exercice ---------- */

  function exerciseHistory(sessions, exerciseId, type) {
    const out = [];
    for (const s of sortSessions(sessions)) {
      const sets = setsByExercise(s).get(exerciseId);
      if (!sets) continue;
      const valid = sets.filter((x) => isValidSet(x, type));
      if (!valid.length) continue;
      out.push({ sessionId: s.id, date: s.date, name: s.name || '', sets: valid, metrics: entryMetrics(valid, type) });
    }
    return out;
  }

  /** Dernière performance enregistrée avant (ou le jour de) `onOrBefore`, hors séance `excludeId`. */
  function lastPerformance(sessions, exerciseId, type, excludeId, onOrBefore) {
    for (const s of sortSessions(sessions, -1)) {
      if (s.id === excludeId) continue;
      if (onOrBefore && s.date > onOrBefore) continue;
      const sets = setsByExercise(s).get(exerciseId);
      const valid = sets ? sets.filter((x) => isValidSet(x, type)) : [];
      if (valid.length) return { sessionId: s.id, date: s.date, sets: valid };
    }
    return null;
  }

  function personalRecords(history, type) {
    const recs = {};
    for (const def of METRICS[type] || []) {
      let best = null;
      for (const h of history) {
        const v = h.metrics[def.key];
        if (v > 0 && (!best || v > best.value)) best = { value: v, date: h.date, sessionId: h.sessionId };
      }
      recs[def.key] = best;
    }
    let bestSet = null;
    let bestScore = -1;
    for (const h of history) {
      const s = h.metrics.bestSet;
      if (!s) continue;
      const score = setScore(s, type);
      if (score > bestScore) { bestScore = score; bestSet = { set: s, date: h.date, sessionId: h.sessionId }; }
    }
    recs.bestSet = bestSet;
    return recs;
  }

  /**
   * Parcourt toutes les séances dans l'ordre et liste chaque record battu.
   * La première séance d'un exercice ne compte pas comme un record.
   */
  function prEvents(sessions, exercises) {
    const types = {};
    for (const e of exercises || []) types[e.id] = e.type;
    const best = {};
    const events = [];
    for (const s of sortSessions(sessions)) {
      for (const [id, list] of setsByExercise(s)) {
        const type = types[id] || 'weight';
        const m = entryMetrics(list, type);
        if (!m.sets) continue;
        const prev = best[id];
        if (prev) {
          for (const def of METRICS[type]) {
            const v = m[def.key];
            if (v > 0 && v > (prev[def.key] || 0) + 1e-9) {
              events.push({ sessionId: s.id, date: s.date, exerciseId: id, metric: def.key, value: v, previous: prev[def.key] || 0 });
            }
          }
        }
        const next = prev || (best[id] = {});
        for (const def of METRICS[type]) next[def.key] = Math.max(next[def.key] || 0, m[def.key]);
      }
    }
    return events;
  }

  /* ---------- Séries temporelles ---------- */

  /** Une valeur par date (le maximum si plusieurs séances le même jour). */
  function series(history, key) {
    const byDate = new Map();
    for (const h of history) {
      const v = h.metrics[key];
      if (!(v > 0)) continue;
      byDate.set(h.date, Math.max(byDate.get(h.date) || 0, v));
    }
    return [...byDate].map(([date, value]) => ({ date, value })).sort((a, b) => (a.date < b.date ? -1 : 1));
  }

  function filterRange(points, range, today = new Date()) {
    const days = RANGES[range];
    if (!days) return points;
    const from = dateKey(new Date(today.getFullYear(), today.getMonth(), today.getDate() - days));
    return points.filter((p) => p.date >= from);
  }

  /** Évolution en % entre le premier et le dernier point. */
  function trend(points) {
    if (!points || points.length < 2) return null;
    const a = points[0].value;
    const b = points[points.length - 1].value;
    if (!a) return null;
    return round(((b - a) / a) * 100, 1);
  }

  /* ---------- Tableau de bord ---------- */

  function streakWeeks(sessions, today = new Date()) {
    const weeks = new Set((sessions || []).map((s) => dateKey(startOfWeek(parseDate(s.date)))));
    const cursor = startOfWeek(today);
    if (!weeks.has(dateKey(cursor))) cursor.setDate(cursor.getDate() - 7);
    let n = 0;
    while (weeks.has(dateKey(cursor))) {
      n++;
      cursor.setDate(cursor.getDate() - 7);
    }
    return n;
  }

  function summary(sessions, exercisesById, today = new Date()) {
    const weekStart = dateKey(startOfWeek(today));
    const monthStart = dateKey(new Date(today.getFullYear(), today.getMonth(), 1));
    let weekCount = 0;
    let monthCount = 0;
    let weekVolume = 0;
    for (const s of sessions || []) {
      if (s.date >= weekStart) {
        weekCount++;
        weekVolume += sessionTotals(s, exercisesById).volume;
      }
      if (s.date >= monthStart) monthCount++;
    }
    return { total: (sessions || []).length, weekCount, monthCount, weekVolume: round(weekVolume, 0), streak: streakWeeks(sessions, today) };
  }

  function weeklyCounts(sessions, exercisesById, today = new Date(), n = 8) {
    const start = startOfWeek(today);
    const out = [];
    for (let i = n - 1; i >= 0; i--) {
      const d = new Date(start);
      d.setDate(d.getDate() - 7 * i);
      out.push({ week: dateKey(d), count: 0, volume: 0 });
    }
    const index = new Map(out.map((w, i) => [w.week, i]));
    for (const s of sessions || []) {
      const k = dateKey(startOfWeek(parseDate(s.date)));
      if (!index.has(k)) continue;
      const w = out[index.get(k)];
      w.count++;
      w.volume += sessionTotals(s, exercisesById).volume;
    }
    return out;
  }

  return {
    DAY, METRICS, MAIN_METRIC, RANGES,
    num, round, parseDuration, epley,
    parseDate, dateKey, startOfWeek, daysBetween,
    isValidSet, entryMetrics, sortSessions, setsByExercise, sessionTotals,
    exerciseHistory, lastPerformance, personalRecords, prEvents,
    series, filterRange, trend,
    streakWeeks, summary, weeklyCounts,
  };
});
