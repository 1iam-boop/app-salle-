/*
 * Persistance locale (localStorage) + validation des données importées.
 * Les données ne quittent jamais l'appareil.
 */
(function (root) {
  'use strict';

  const DATA_KEY = 'progression.data.v1';
  const DRAFT_KEY = 'progression.draft.v1';
  const VERSION = 1;

  const MUSCLES = ['Pectoraux', 'Dos', 'Épaules', 'Bras', 'Jambes', 'Abdos', 'Cardio', 'Autre'];

  const TYPES = {
    weight: { label: 'Charge', hint: 'kg × répétitions' },
    bodyweight: { label: 'Poids du corps', hint: 'répétitions, lest optionnel' },
    time: { label: 'Durée', hint: 'secondes (gainage, cardio…)' },
  };

  const DEFAULT_EXERCISES = [
    ['developpe-couche', 'Développé couché', 'Pectoraux', 'weight'],
    ['developpe-incline-halteres', 'Développé incliné haltères', 'Pectoraux', 'weight'],
    ['ecarte-poulie', 'Écarté à la poulie', 'Pectoraux', 'weight'],
    ['pompes', 'Pompes', 'Pectoraux', 'bodyweight'],
    ['dips', 'Dips', 'Pectoraux', 'bodyweight'],
    ['tractions', 'Tractions', 'Dos', 'bodyweight'],
    ['rowing-barre', 'Rowing barre', 'Dos', 'weight'],
    ['tirage-vertical', 'Tirage vertical', 'Dos', 'weight'],
    ['tirage-horizontal', 'Tirage horizontal', 'Dos', 'weight'],
    ['souleve-de-terre', 'Soulevé de terre', 'Dos', 'weight'],
    ['developpe-militaire', 'Développé militaire', 'Épaules', 'weight'],
    ['elevations-laterales', 'Élévations latérales', 'Épaules', 'weight'],
    ['face-pull', 'Face pull', 'Épaules', 'weight'],
    ['curl-barre', 'Curl barre', 'Bras', 'weight'],
    ['curl-halteres', 'Curl haltères', 'Bras', 'weight'],
    ['extension-triceps-poulie', 'Extension triceps à la poulie', 'Bras', 'weight'],
    ['barre-au-front', 'Barre au front', 'Bras', 'weight'],
    ['squat', 'Squat', 'Jambes', 'weight'],
    ['presse-cuisses', 'Presse à cuisses', 'Jambes', 'weight'],
    ['fentes', 'Fentes', 'Jambes', 'weight'],
    ['souleve-roumain', 'Soulevé de terre roumain', 'Jambes', 'weight'],
    ['leg-curl', 'Leg curl', 'Jambes', 'weight'],
    ['leg-extension', 'Leg extension', 'Jambes', 'weight'],
    ['hip-thrust', 'Hip thrust', 'Jambes', 'weight'],
    ['mollets-debout', 'Mollets debout', 'Jambes', 'weight'],
    ['gainage', 'Gainage (planche)', 'Abdos', 'time'],
    ['crunch', 'Crunch', 'Abdos', 'bodyweight'],
    ['releve-de-jambes', 'Relevé de jambes', 'Abdos', 'bodyweight'],
    ['corde-a-sauter', 'Corde à sauter', 'Cardio', 'time'],
  ].map(([id, name, muscle, type]) => ({ id, name, muscle, type }));

  const DEFAULT_SETTINGS = { restSeconds: 90 };

  let memoryFallback = {};
  let storageAvailable = true;

  function read(key) {
    let raw;
    try {
      raw = root.localStorage.getItem(key);
    } catch (e) {
      storageAvailable = false;
      return memoryFallback[key] || null;
    }
    try {
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null; // données corrompues : on repart d'un état propre
    }
  }

  function write(key, value) {
    try {
      if (value == null) root.localStorage.removeItem(key);
      else root.localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) {
      storageAvailable = false;
      memoryFallback[key] = value;
      return false;
    }
  }

  function uid() {
    try {
      if (root.crypto && typeof root.crypto.randomUUID === 'function') return root.crypto.randomUUID();
    } catch (e) { /* contexte non sécurisé */ }
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  }

  function defaultData() {
    return {
      version: VERSION,
      exercises: DEFAULT_EXERCISES.map((e) => ({ ...e })),
      sessions: [],
      settings: { ...DEFAULT_SETTINGS },
    };
  }

  const isStr = (v) => typeof v === 'string' && v.trim() !== '';
  const posNum = (v) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0);

  /** Nettoie des données arbitraires (stockage ou import) ; lève une erreur si la structure est inutilisable. */
  function normalize(raw) {
    if (!raw || typeof raw !== 'object' || !Array.isArray(raw.exercises) || !Array.isArray(raw.sessions)) {
      throw new Error('Format de fichier non reconnu.');
    }
    const exercises = [];
    const seen = new Set();
    for (const e of raw.exercises) {
      if (!e || !isStr(e.id) || !isStr(e.name) || seen.has(e.id)) continue;
      seen.add(e.id);
      exercises.push({
        id: e.id,
        name: e.name.trim().slice(0, 60),
        muscle: MUSCLES.includes(e.muscle) ? e.muscle : 'Autre',
        type: TYPES[e.type] ? e.type : 'weight',
      });
    }
    const sessions = [];
    const seenSessions = new Set();
    for (const s of raw.sessions) {
      if (!s || !isStr(s.id) || seenSessions.has(s.id) || !/^\d{4}-\d{2}-\d{2}$/.test(s.date) || !Array.isArray(s.entries)) continue;
      const entries = [];
      for (const en of s.entries) {
        if (!en || !seen.has(en.exerciseId) || !Array.isArray(en.sets)) continue;
        const sets = [];
        for (const set of en.sets) {
          if (!set || typeof set !== 'object') continue;
          const clean = {};
          if (posNum(set.reps)) clean.reps = Math.round(set.reps);
          if (posNum(set.weight)) clean.weight = set.weight;
          if (posNum(set.time)) clean.time = Math.round(set.time);
          if (clean.reps || clean.time) sets.push(clean);
        }
        if (sets.length) entries.push({ exerciseId: en.exerciseId, sets });
      }
      if (!entries.length) continue;
      seenSessions.add(s.id);
      sessions.push({
        id: s.id,
        date: s.date,
        name: typeof s.name === 'string' ? s.name.slice(0, 60) : '',
        notes: typeof s.notes === 'string' ? s.notes.slice(0, 2000) : '',
        entries,
        createdAt: posNum(s.createdAt) || Date.now(),
        updatedAt: posNum(s.updatedAt) || posNum(s.createdAt) || Date.now(),
        ...(posNum(s.duration) ? { duration: Math.round(s.duration) } : {}),
      });
    }
    const rest = raw.settings && posNum(raw.settings.restSeconds);
    return {
      version: VERSION,
      exercises,
      sessions,
      settings: { ...DEFAULT_SETTINGS, ...(rest ? { restSeconds: Math.min(600, Math.round(rest)) } : {}) },
    };
  }

  function load() {
    const raw = read(DATA_KEY);
    if (!raw) return defaultData();
    try {
      return normalize(raw);
    } catch (e) {
      return defaultData();
    }
  }

  function save(data) {
    return write(DATA_KEY, data);
  }

  function loadDraft() {
    const d = read(DRAFT_KEY);
    if (!d || typeof d !== 'object' || !Array.isArray(d.entries)) return null;
    return d;
  }

  function saveDraft(draft) {
    return write(DRAFT_KEY, draft || null);
  }

  root.Store = {
    MUSCLES, TYPES, DEFAULT_EXERCISES,
    uid, defaultData, normalize, load, save, loadDraft, saveDraft,
    get available() { return storageAvailable; },
  };
})(typeof window !== 'undefined' ? window : globalThis);
