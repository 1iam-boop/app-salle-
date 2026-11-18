/*
 * Génère ~12 semaines de séances fictives (Push / Pull / Jambes) avec une
 * progression réaliste, pour découvrir l'application avant d'avoir ses propres données.
 */
(function (root) {
  'use strict';

  function mulberry32(seed) {
    let a = seed;
    return function () {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // [exercice, type, séries, reps cible | durée de départ, charge départ, charge fin, pas]
  const PLANS = {
    Push: [
      ['developpe-couche', 'w', 4, 8, 60, 77.5, 2.5],
      ['developpe-militaire', 'w', 3, 8, 32.5, 42.5, 2.5],
      ['elevations-laterales', 'w', 3, 12, 8, 11, 1],
      ['dips', 'bw', 3, 8, 13],
    ],
    Pull: [
      ['tractions', 'bw', 4, 5, 9],
      ['rowing-barre', 'w', 4, 10, 50, 65, 2.5],
      ['curl-halteres', 'w', 3, 10, 12, 16, 1],
      ['face-pull', 'w', 3, 15, 20, 27.5, 2.5],
    ],
    Jambes: [
      ['squat', 'w', 4, 6, 80, 105, 2.5],
      ['souleve-roumain', 'w', 3, 8, 70, 90, 2.5],
      ['presse-cuisses', 'w', 3, 10, 140, 190, 5],
      ['gainage', 't', 3, 45, 95],
    ],
  };

  function generate(today) {
    const S = root.Stats;
    const rnd = mulberry32(20261118);
    const now = today || new Date();
    const weeks = 12;
    const first = S.startOfWeek(new Date(now.getFullYear(), now.getMonth(), now.getDate() - weeks * 7));
    const span = now - first;
    const names = ['Push', 'Pull', 'Jambes'];
    const sessions = [];
    let k = 0;

    for (let w = 0; w <= weeks; w++) {
      for (const offset of [0, 2, 4]) {
        const date = new Date(first);
        date.setDate(first.getDate() + w * 7 + offset);
        if (date > now) continue;
        if (rnd() < 0.08) continue; // séance manquée
        const name = names[k++ % 3];
        const p = Math.min(1, (date - first) / span);
        const entries = PLANS[name].map(([exerciseId, type, nSets, a, b, c, step]) => {
          const sets = [];
          for (let i = 0; i < nSets; i++) {
            const fatigue = i === nSets - 1 && rnd() < 0.6 ? 1 + Math.floor(rnd() * 2) : 0;
            if (type === 'w') {
              const raw = b + (c - b) * p + (rnd() - 0.6) * step;
              const weight = Math.max(step, Math.round(raw / step) * step);
              sets.push({ weight, reps: Math.max(1, a - fatigue) });
            } else if (type === 'bw') {
              const reps = Math.round(a + (b - a) * p + (rnd() - 0.5)) - fatigue - (i > 1 ? 1 : 0);
              sets.push({ reps: Math.max(1, reps) });
            } else {
              const time = Math.round((a + (b - a) * p + (rnd() - 0.5) * 10) / 5) * 5 - fatigue * 5;
              sets.push({ time: Math.max(10, time) });
            }
          }
          return { exerciseId, sets };
        });
        const createdAt = date.getTime() + 18 * 3600000;
        sessions.push({
          id: 'demo-' + S.dateKey(date),
          date: S.dateKey(date),
          name,
          notes: '',
          entries,
          createdAt,
          updatedAt: createdAt,
          duration: 45 + Math.round(rnd() * 30),
        });
      }
    }
    return sessions;
  }

  root.Demo = { generate };
})(window);
