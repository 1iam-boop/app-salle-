const test = require('node:test');
const assert = require('node:assert/strict');
const S = require('../js/stats.js');

const EXERCISES = [
  { id: 'bench', name: 'Développé couché', type: 'weight' },
  { id: 'pullup', name: 'Tractions', type: 'bodyweight' },
  { id: 'plank', name: 'Gainage', type: 'time' },
];
const byId = Object.fromEntries(EXERCISES.map((e) => [e.id, e]));

function session(id, date, entries, createdAt = 0) {
  return { id, date, name: '', entries, createdAt };
}

test('num accepte la virgule décimale et les valeurs vides', () => {
  assert.equal(S.num('82,5'), 82.5);
  assert.equal(S.num(' 60 '), 60);
  assert.equal(S.num(''), 0);
  assert.equal(S.num('abc'), 0);
  assert.equal(S.num(undefined), 0);
});

test('parseDuration comprend secondes et mm:ss', () => {
  assert.equal(S.parseDuration('90'), 90);
  assert.equal(S.parseDuration('1:30'), 90);
  assert.equal(S.parseDuration("2'05"), 125);
  assert.equal(S.parseDuration(''), 0);
  assert.equal(S.parseDuration(45), 45);
});

test('epley : 1 rep = charge, 10 reps ≈ +33 %', () => {
  assert.equal(S.epley(100, 1), 100);
  assert.equal(Math.round(S.epley(100, 10) * 10) / 10, 133.3);
  assert.equal(S.epley(0, 10), 0);
  assert.equal(S.epley(100, 0), 0);
});

test('entryMetrics (charge) ignore les séries incomplètes', () => {
  const m = S.entryMetrics([
    { weight: 80, reps: 8 },
    { weight: 85, reps: 5 },
    { weight: 90, reps: '' }, // incomplète
  ], 'weight');
  assert.equal(m.sets, 2);
  assert.equal(m.maxWeight, 85);
  assert.equal(m.volume, 80 * 8 + 85 * 5);
  assert.equal(m.totalReps, 13);
  assert.equal(m.e1rm, Math.round(S.epley(80, 8) * 10) / 10); // 80×8 (101,3) > 85×5 (99,2)
  assert.deepEqual(m.bestSet, { weight: 80, reps: 8 });
});

test('entryMetrics (poids du corps et durée)', () => {
  const bw = S.entryMetrics([{ reps: 8 }, { reps: 10, weight: 5 }, { reps: 6 }], 'bodyweight');
  assert.equal(bw.maxReps, 10);
  assert.equal(bw.totalReps, 24);
  assert.equal(bw.maxWeight, 5);
  assert.deepEqual(bw.bestSet, { reps: 10, weight: 5 });

  const t = S.entryMetrics([{ time: 60 }, { time: '1:15' }, { time: '' }], 'time');
  assert.equal(t.sets, 2);
  assert.equal(t.maxTime, 75);
  assert.equal(t.totalTime, 135);
});

test('exerciseHistory est chronologique et fusionne un exercice répété dans une séance', () => {
  const sessions = [
    session('b', '2026-02-10', [{ exerciseId: 'bench', sets: [{ weight: 70, reps: 8 }] }]),
    session('a', '2026-02-03', [
      { exerciseId: 'bench', sets: [{ weight: 60, reps: 8 }] },
      { exerciseId: 'bench', sets: [{ weight: 65, reps: 6 }] },
    ]),
  ];
  const h = S.exerciseHistory(sessions, 'bench', 'weight');
  assert.deepEqual(h.map((x) => x.sessionId), ['a', 'b']);
  assert.equal(h[0].metrics.sets, 2);
  assert.equal(h[0].metrics.maxWeight, 65);
});

test('prEvents : pas de record à la première séance, puis détection des progrès', () => {
  const sessions = [
    session('s1', '2026-01-05', [{ exerciseId: 'bench', sets: [{ weight: 60, reps: 8 }] }]),
    session('s2', '2026-01-08', [{ exerciseId: 'bench', sets: [{ weight: 60, reps: 6 }] }]),
    session('s3', '2026-01-12', [{ exerciseId: 'bench', sets: [{ weight: 62.5, reps: 8 }] }]),
  ];
  const events = S.prEvents(sessions, EXERCISES);
  assert.equal(events.filter((e) => e.sessionId === 's1').length, 0);
  assert.equal(events.filter((e) => e.sessionId === 's2').length, 0);
  const s3 = events.filter((e) => e.sessionId === 's3').map((e) => e.metric).sort();
  assert.deepEqual(s3, ['e1rm', 'maxWeight', 'volume']);
  const mw = events.find((e) => e.sessionId === 's3' && e.metric === 'maxWeight');
  assert.equal(mw.previous, 60);
  assert.equal(mw.value, 62.5);
});

test('prEvents respecte l’ordre chronologique même si les séances sont mélangées', () => {
  const sessions = [
    session('late', '2026-03-10', [{ exerciseId: 'pullup', sets: [{ reps: 10 }] }]),
    session('early', '2026-03-01', [{ exerciseId: 'pullup', sets: [{ reps: 6 }] }]),
  ];
  const events = S.prEvents(sessions, EXERCISES);
  assert.ok(events.every((e) => e.sessionId === 'late'));
  assert.ok(events.some((e) => e.metric === 'maxReps' && e.value === 10 && e.previous === 6));
});

test('lastPerformance exclut la séance en cours de modification et les dates futures', () => {
  const sessions = [
    session('a', '2026-04-01', [{ exerciseId: 'bench', sets: [{ weight: 60, reps: 8 }] }]),
    session('b', '2026-04-05', [{ exerciseId: 'bench', sets: [{ weight: 65, reps: 8 }] }]),
    session('c', '2026-04-09', [{ exerciseId: 'bench', sets: [{ weight: 70, reps: 8 }] }]),
  ];
  assert.equal(S.lastPerformance(sessions, 'bench', 'weight').sessionId, 'c');
  assert.equal(S.lastPerformance(sessions, 'bench', 'weight', 'c').sessionId, 'b');
  assert.equal(S.lastPerformance(sessions, 'bench', 'weight', null, '2026-04-04').sessionId, 'a');
  assert.equal(S.lastPerformance(sessions, 'plank', 'time'), null);
});

test('personalRecords renvoie le meilleur de chaque indicateur et la meilleure série', () => {
  const sessions = [
    session('a', '2026-05-01', [{ exerciseId: 'bench', sets: [{ weight: 100, reps: 1 }] }]),
    session('b', '2026-05-04', [{ exerciseId: 'bench', sets: [{ weight: 85, reps: 8 }, { weight: 85, reps: 8 }] }]),
  ];
  const r = S.personalRecords(S.exerciseHistory(sessions, 'bench', 'weight'), 'weight');
  assert.equal(r.maxWeight.value, 100);
  assert.equal(r.maxWeight.sessionId, 'a');
  assert.equal(r.e1rm.sessionId, 'b'); // 85×8 ≈ 107,7 > 100
  assert.equal(r.volume.value, 1360);
  assert.deepEqual(r.bestSet.set, { weight: 85, reps: 8 });
});

test('series garde une valeur par jour et filterRange découpe la période', () => {
  const history = [
    { date: '2026-01-01', metrics: { e1rm: 80 } },
    { date: '2026-06-01', metrics: { e1rm: 90 } },
    { date: '2026-06-01', metrics: { e1rm: 95 } },
    { date: '2026-06-10', metrics: { e1rm: 0 } },
  ];
  const pts = S.series(history, 'e1rm');
  assert.deepEqual(pts, [{ date: '2026-01-01', value: 80 }, { date: '2026-06-01', value: 95 }]);
  assert.equal(S.filterRange(pts, '1M', new Date(2026, 5, 15)).length, 1);
  assert.equal(S.filterRange(pts, 'Tout', new Date(2026, 5, 15)).length, 2);
  assert.equal(S.trend(pts), 18.8);
  assert.equal(S.trend(pts.slice(0, 1)), null);
});

test('streakWeeks compte les semaines consécutives (la semaine en cours peut être vide)', () => {
  const today = new Date(2026, 10, 18); // mercredi 18 novembre 2026
  const sessions = [
    session('1', '2026-11-16', []), // semaine en cours
    session('2', '2026-11-12', []), // semaine -1
    session('3', '2026-11-03', []), // semaine -2
    session('4', '2026-10-20', []), // trou à la semaine -3
  ];
  assert.equal(S.streakWeeks(sessions, today), 3);
  assert.equal(S.streakWeeks(sessions.slice(1), today), 2);
  assert.equal(S.streakWeeks([], today), 0);
});

test('summary et weeklyCounts', () => {
  const today = new Date(2026, 10, 18);
  const sessions = [
    session('1', '2026-11-16', [{ exerciseId: 'bench', sets: [{ weight: 100, reps: 5 }] }]),
    session('2', '2026-11-18', [{ exerciseId: 'pullup', sets: [{ reps: 10 }] }]),
    session('3', '2026-11-02', [{ exerciseId: 'bench', sets: [{ weight: 50, reps: 10 }] }]),
    session('4', '2026-10-30', [{ exerciseId: 'plank', sets: [{ time: 60 }] }]),
  ];
  const s = S.summary(sessions, byId, today);
  assert.equal(s.weekCount, 2);
  assert.equal(s.monthCount, 3);
  assert.equal(s.weekVolume, 500);
  const weeks = S.weeklyCounts(sessions, byId, today, 4);
  assert.deepEqual(weeks.map((w) => w.week), ['2026-10-26', '2026-11-02', '2026-11-09', '2026-11-16']);
  assert.deepEqual(weeks.map((w) => w.count), [1, 1, 0, 2]);
});

test('sessionTotals', () => {
  const t = S.sessionTotals(session('x', '2026-01-01', [
    { exerciseId: 'bench', sets: [{ weight: 50, reps: 10 }, { weight: 50, reps: '' }] },
    { exerciseId: 'plank', sets: [{ time: 45 }] },
  ]), byId);
  assert.deepEqual(t, { exercises: 2, sets: 2, volume: 500, reps: 10 });
});
