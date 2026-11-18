/*
 * Progression — suivi des performances en salle de sport.
 * Interface : navigation par hash (#/accueil…), rendu par vues, délégation d'événements.
 */
(function () {
  'use strict';

  const { Stats, Store, Chart, Demo } = window;
  const num = Stats.num;

  /* =====================================================================
   * Utilitaires
   * ===================================================================== */

  const $ = (sel, root = document) => root.querySelector(sel);
  const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ESC[c]);
  const plural = (n, one, many) => (Math.abs(n) >= 2 ? many : one);
  const normalizeText = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();

  const ICONS = {
    home: '<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z"/>',
    dumbbell: '<path d="M6.5 6.5v11M3.5 9v6M17.5 6.5v11M20.5 9v6M6.5 12h11"/>',
    chart: '<path d="M3 3v18h18"/><path d="m7 15 4-4 3 3 6-7"/>',
    history: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    settings: '<path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1"/><circle cx="15" cy="6" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="18" r="2"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    trash: '<path d="M4 7h16M10 11v6M14 11v6M9 7V4h6v3M6 7l1 13h10l1-13"/>',
    x: '<path d="M6 6l12 12M18 6 6 18"/>',
    check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
    chevron: '<path d="m9 6 6 6-6 6"/>',
    back: '<path d="m15 6-6 6 6 6"/>',
    trophy: '<path d="M8 4h8v5a4 4 0 0 1-8 0z"/><path d="M8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M8 21h8M9.5 17h5"/>',
    timer: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2M10 2h4"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
    pencil: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>',
    repeat: '<path d="m17 2 3 3-3 3"/><path d="M4 11V9a4 4 0 0 1 4-4h12"/><path d="m7 22-3-3 3-3"/><path d="M20 13v2a4 4 0 0 1-4 4H4"/>',
    download: '<path d="M12 4v11M7 10l5 5 5-5M4 20h16"/>',
    upload: '<path d="M12 20V9M7 14l5-5 5 5M4 4h16"/>',
    flame: '<path d="M12 3c.8 3.6 5 5.4 5 10a5 5 0 0 1-10 0c0-2.2 1.1-3.6 2.3-4.6.1 1.9 1 3 2.1 3.2C11 8.8 10.6 6 12 3z"/>',
    calendar: '<rect x="3.5" y="5" width="17" height="15.5" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
    up: '<path d="M7 17 17 7M9 7h8v8"/>',
    down: '<path d="M7 7l10 10M17 9v8H9"/>',
    sparkles: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6"/>',
  };

  function icon(name, size = 20) {
    return `<svg class="icon" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ''}</svg>`;
  }

  /* ---------- Formatage (fr-FR) ---------- */

  const nf1 = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 });
  const nf0 = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });
  const fmt = (n, d = 1) => (d === 0 ? nf0 : nf1).format(n);

  function fmtClock(sec) {
    sec = Math.max(0, Math.round(num(sec)));
    return Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0');
  }

  function fmtDuration(sec) {
    sec = Math.round(num(sec));
    if (sec < 60) return sec + ' s';
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return s ? `${m} min ${String(s).padStart(2, '0')}` : `${m} min`;
  }

  function fmtMetric(key, v) {
    if (key === 'maxTime' || key === 'totalTime') return fmtDuration(v);
    if (key === 'maxReps' || key === 'totalReps') return fmt(v, 0) + ' reps';
    return fmt(v) + ' kg';
  }

  function fmtDelta(key, v) {
    if (key === 'maxTime' || key === 'totalTime') return '+' + fmtDuration(v);
    if (key === 'maxReps' || key === 'totalReps') return '+' + fmt(v, 0);
    return '+' + fmt(v) + ' kg';
  }

  /** Série compacte : « 80 × 8 », « +10 × 8 », « 1:30 » (compact : « 8 » au lieu de « 8 reps »). */
  function fmtSetShort(set, type, compact) {
    if (type === 'time') return fmtClock(Stats.parseDuration(set.time)) + (num(set.weight) ? ` +${fmt(num(set.weight))}` : '');
    const reps = fmt(num(set.reps), 0);
    if (type === 'bodyweight') return num(set.weight) ? `+${fmt(num(set.weight))} × ${reps}` : compact ? reps : `${reps} reps`;
    return `${fmt(num(set.weight))} × ${reps}`;
  }

  function fmtSetLong(set, type) {
    if (type === 'time') return fmtDuration(Stats.parseDuration(set.time)) + (num(set.weight) ? ` · +${fmt(num(set.weight))} kg` : '');
    const reps = `${fmt(num(set.reps), 0)} ${plural(num(set.reps), 'rep', 'reps')}`;
    if (type === 'bodyweight') return num(set.weight) ? `${reps} · lest ${fmt(num(set.weight))} kg` : reps;
    return `${fmt(num(set.weight))} kg × ${reps}`;
  }

  const dfShort = new Intl.DateTimeFormat('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
  const dfShortY = new Intl.DateTimeFormat('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
  const dfLong = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const dfDayMonth = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' });
  const dfMonth = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' });
  const dfMonthShort = new Intl.DateTimeFormat('fr-FR', { month: 'short' });

  const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  /** Minuscule initiale en milieu de phrase, sans toucher aux sigles (« 1RM »). */
  const lcFirst = (s) => (/^(\d|[A-Z]{2})/.test(s) ? s : s.charAt(0).toLowerCase() + s.slice(1));
  const todayKey = () => Stats.dateKey(new Date());

  function fmtDate(key) {
    const d = Stats.parseDate(key);
    return capitalize((d.getFullYear() === new Date().getFullYear() ? dfShort : dfShortY).format(d));
  }

  function relDays(key) {
    const n = Stats.daysBetween(key, todayKey());
    if (n === 0) return 'Aujourd’hui';
    if (n === 1) return 'Hier';
    if (n < 0) return fmtDate(key);
    if (n < 7) return `Il y a ${n} jours`;
    if (n < 31) return `Il y a ${Math.round(n / 7)} sem.`;
    return fmtDate(key);
  }

  const metricLabel = (type, key) => (Stats.METRICS[type].find((m) => m.key === key) || { label: key }).label;

  /* =====================================================================
   * État
   * ===================================================================== */

  let data = Store.load();
  let draft = Store.loadDraft();
  const ui = { progressSearch: '', progressMuscle: 'Tous', metric: {}, range: '3M' };
  let exIndex = {};
  let cleanups = [];
  let pendingConfirm = null;

  function reindex() {
    exIndex = {};
    for (const e of data.exercises) exIndex[e.id] = e;
  }
  reindex();

  const exById = (id) => exIndex[id];
  const exName = (id) => (exIndex[id] ? exIndex[id].name : 'Exercice supprimé');
  const exType = (id) => (exIndex[id] ? exIndex[id].type : 'weight');

  function save() {
    reindex();
    if (!Store.save(data)) toast('Impossible d’enregistrer sur cet appareil (stockage plein ou désactivé).');
  }

  function saveDraft() {
    Store.saveDraft(draft);
  }

  /** Indicateurs de performance « pure » (le volume et les totaux sont des records secondaires). */
  const PRIMARY_METRICS = new Set(['e1rm', 'maxWeight', 'maxReps', 'maxTime']);

  /** Records groupés : un par (séance, exercice), avec l'indicateur le plus parlant en tête. */
  function groupedPRs() {
    const events = Stats.prEvents(data.sessions, data.exercises);
    const map = new Map();
    for (const e of events) {
      const k = e.sessionId + '|' + e.exerciseId;
      if (!map.has(k)) map.set(k, { ...e, all: [e] });
      else map.get(k).all.push(e);
    }
    const grouped = [...map.values()].map((g) => {
      const head = g.all.find((e) => PRIMARY_METRICS.has(e.metric));
      return head ? { ...head, all: g.all, primary: true } : { ...g, primary: false };
    });
    return { events, grouped };
  }

  /* =====================================================================
   * Routage
   * ===================================================================== */

  /** Navigation immédiate (pushState ne déclenche pas hashchange : pas de double rendu). */
  function go(path) {
    const target = '#/' + path;
    if (location.hash !== target) history.pushState(null, '', target);
    closeModal();
    render();
  }

  function parseRoute() {
    const parts = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
    return { page: parts[0] || 'home', param: parts[1] ? decodeURIComponent(parts[1]) : null };
  }

  const ROUTES = {
    home: viewHome,
    session: viewSession,
    progress: viewProgress,
    exercise: viewExercise,
    history: (p) => (p ? viewSessionDetail(p) : viewHistory()),
    settings: viewSettings,
    exercises: viewExercises,
  };

  function render(keepScroll) {
    cleanups.forEach((fn) => fn());
    cleanups = [];
    const { page, param } = parseRoute();
    const view = (ROUTES[page] || viewHome)(param);
    const scrollY = window.scrollY;

    document.title = view.title + ' · Progression';
    $('#title').textContent = view.title;
    const back = $('#back');
    back.hidden = !view.back;
    if (view.back) back.setAttribute('href', view.back);
    $('#topbar-actions').innerHTML = view.actions || '';
    $('#view').innerHTML = view.html;

    const tab = view.tab || page;
    document.querySelectorAll('.tab').forEach((t) => {
      if (t.dataset.tab === tab) t.setAttribute('aria-current', 'page');
      else t.removeAttribute('aria-current');
    });
    $('.tab[data-tab="session"]').classList.toggle('has-draft', !!draft);

    if (view.mount) view.mount();
    window.scrollTo(0, keepScroll ? scrollY : 0);
  }

  /* =====================================================================
   * Composants communs
   * ===================================================================== */

  function tile(label, value, unit, iconName) {
    return `<div class="tile">
      <div class="tile-label">${iconName ? icon(iconName, 16) : ''}${esc(label)}</div>
      <div class="tile-value">${value}<span class="tile-unit">${esc(unit || '')}</span></div>
    </div>`;
  }

  function emptyState(iconName, title, text, buttons) {
    return `<section class="empty">
      <div class="empty-icon">${icon(iconName, 30)}</div>
      <h2>${title}</h2>
      <p>${text}</p>
      ${buttons || ''}
    </section>`;
  }

  function sessionRow(s, prCount) {
    const t = Stats.sessionTotals(s, exIndex);
    const d = Stats.parseDate(s.date);
    return `<a class="row" href="#/history/${encodeURIComponent(s.id)}">
      <div class="date-badge"><span>${d.getDate()}</span><small>${esc(dfMonthShort.format(d).replace('.', ''))}</small></div>
      <div class="row-main">
        <div class="row-title">${esc(s.name || 'Séance')}${prCount ? `<span class="pr-pill">${icon('trophy', 13)}${prCount}</span>` : ''}</div>
        <div class="row-sub">${t.exercises} ${plural(t.exercises, 'exercice', 'exercices')} · ${t.sets} ${plural(t.sets, 'série', 'séries')}${t.volume ? ' · ' + fmt(t.volume, 0) + ' kg' : ''}</div>
      </div>
      <span class="row-chevron">${icon('chevron', 18)}</span>
    </a>`;
  }

  function prCountsBySession(grouped) {
    const counts = {};
    for (const g of grouped) counts[g.sessionId] = (counts[g.sessionId] || 0) + 1;
    return counts;
  }

  function trendBadge(pct, suffix) {
    if (pct == null) return '';
    const up = pct > 0;
    const flat = Math.abs(pct) < 0.5;
    const cls = flat ? 'flat' : up ? 'up' : 'down';
    const txt = flat ? 'stable' : (up ? '+' : '') + fmt(pct) + ' %';
    return `<span class="trend ${cls}">${flat ? '' : icon(up ? 'up' : 'down', 13)}${txt}${suffix ? ' ' + suffix : ''}</span>`;
  }

  /* =====================================================================
   * Vue : Accueil
   * ===================================================================== */

  function viewHome() {
    const sessions = data.sessions;
    if (!sessions.length) {
      return {
        title: 'Accueil',
        html: emptyState('dumbbell', 'Suis ta progression, séance après séance',
          'Note tes séries, bats tes records et visualise ton évolution sur chaque exercice. Tout reste sur ton téléphone.',
          `<button class="btn btn-primary btn-block btn-lg" data-action="go-session">${icon('plus')} ${draft ? 'Reprendre la séance en cours' : 'Démarrer ma première séance'}</button>
           <button class="btn btn-ghost btn-block" data-action="load-demo">${icon('sparkles', 18)} Explorer avec des données de démo</button>`),
      };
    }

    const sum = Stats.summary(sessions, exIndex);
    const weeks = Stats.weeklyCounts(sessions, exIndex, new Date(), 8);
    const { grouped } = groupedPRs();
    const prCounts = prCountsBySession(grouped);
    const recentPRs = grouped.filter((g) => g.primary).slice(-5).reverse();
    const recent = Stats.sortSessions(sessions, -1).slice(0, 3);
    const last = recent[0];

    const cta = draft
      ? `<button class="cta cta-live" data-action="go-session">
          <span class="cta-pulse"></span>
          <span class="cta-text"><strong>Séance en cours</strong><small>${draft.entries.length} ${plural(draft.entries.length, 'exercice', 'exercices')}${draft.startedAt ? ' · démarrée il y a ' + elapsedText() : ''}</small></span>
          <span class="cta-go">Reprendre ${icon('chevron', 18)}</span>
        </button>`
      : `<button class="cta" data-action="go-session">
          <span class="cta-icon">${icon('plus', 22)}</span>
          <span class="cta-text"><strong>Démarrer une séance</strong><small>Dernière séance : ${esc(relDays(last.date).toLowerCase())}</small></span>
          ${icon('chevron', 18)}
        </button>`;

    const max = Math.max(1, ...weeks.map((w) => w.count));
    const bars = weeks.map((w, i) => {
      const current = i === weeks.length - 1;
      const wd = Stats.parseDate(w.week);
      const label = wd.getDate() + '/' + String(wd.getMonth() + 1).padStart(2, '0');
      return `<div class="bar-col${current ? ' current' : ''}" title="Semaine du ${esc(dfDayMonth.format(Stats.parseDate(w.week)))} : ${w.count} ${plural(w.count, 'séance', 'séances')}">
        <div class="bar-track"><span class="bar-val">${w.count || ''}</span><div class="bar" style="height:${(w.count / max) * 100}%"></div></div>
        <span class="bar-label">${esc(label)}</span>
      </div>`;
    }).join('');

    const prRows = recentPRs.map((e) => {
      const type = exType(e.exerciseId);
      return `<a class="row" href="#/exercise/${encodeURIComponent(e.exerciseId)}">
        <span class="row-icon gold">${icon('trophy', 18)}</span>
        <div class="row-main">
          <div class="row-title">${esc(exName(e.exerciseId))}</div>
          <div class="row-sub">${esc(metricLabel(type, e.metric))} · ${esc(relDays(e.date))}</div>
        </div>
        <div class="row-value">${fmtMetric(e.metric, e.value)}<small>${fmtDelta(e.metric, e.value - e.previous)}</small></div>
      </a>`;
    }).join('');

    return {
      title: 'Accueil',
      html: `
        ${cta}
        <div class="tiles">
          ${tile('Cette semaine', sum.weekCount, plural(sum.weekCount, 'séance', 'séances'))}
          ${tile('Ce mois-ci', sum.monthCount, plural(sum.monthCount, 'séance', 'séances'))}
          ${tile('Volume semaine', fmt(sum.weekVolume, 0), 'kg')}
          ${tile('Régularité', sum.streak, plural(sum.streak, 'sem. d’affilée', 'sem. d’affilée'), 'flame')}
        </div>
        <section class="card pad">
          <div class="card-head"><h3>Activité</h3><span class="muted small">Séances par semaine</span></div>
          <div class="bars" role="img" aria-label="Nombre de séances sur les 8 dernières semaines : ${weeks.map((w) => w.count).join(', ')}">${bars}</div>
        </section>
        <section>
          <div class="section-head"><h3>Records récents</h3></div>
          ${recentPRs.length ? `<div class="card list">${prRows}</div>` : `<p class="card pad muted">Tes records apparaîtront ici dès que tu battras une de tes performances.</p>`}
        </section>
        <section>
          <div class="section-head"><h3>Dernières séances</h3><a class="link" href="#/history">Tout voir</a></div>
          <div class="card list">${recent.map((s) => sessionRow(s, prCounts[s.id])).join('')}</div>
        </section>`,
    };
  }

  /* =====================================================================
   * Vue : Séance (saisie)
   * ===================================================================== */

  function blankSet() {
    return { weight: '', reps: '', time: '' };
  }

  function toDraftSet(s) {
    return {
      weight: num(s.weight) ? String(s.weight) : '',
      reps: num(s.reps) ? String(s.reps) : '',
      time: num(s.time) ? String(s.time) : '',
    };
  }

  function newDraft(extra) {
    return { date: todayKey(), name: '', notes: '', entries: [], startedAt: Date.now(), editingId: null, ...(extra || {}) };
  }

  function elapsedText() {
    if (!draft || !draft.startedAt) return '';
    const min = Math.max(0, Math.floor((Date.now() - draft.startedAt) / 60000));
    return min < 60 ? `${min} min` : `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')}`;
  }

  async function replaceDraftIfNeeded() {
    if (!draft) return true;
    return confirmDialog({
      title: 'Une séance est déjà en cours',
      message: 'La remplacer ? Les séries non enregistrées seront perdues.',
      confirm: 'Remplacer',
      danger: true,
    });
  }

  function viewSessionStart() {
    const seen = new Set();
    const templates = [];
    for (const s of Stats.sortSessions(data.sessions, -1)) {
      const sig = (s.name || '') + '|' + s.entries.map((e) => e.exerciseId).join(',');
      if (seen.has(sig)) continue;
      seen.add(sig);
      templates.push(s);
      if (templates.length >= 5) break;
    }
    return {
      title: 'Séance',
      html: `
        <section class="card pad start-card">
          <div class="start-icon">${icon('dumbbell', 28)}</div>
          <h2>Prêt à t’entraîner ?</h2>
          <p class="muted">Crée ta séance et note tes séries au fur et à mesure. Tes performances précédentes s’affichent pour chaque exercice.</p>
          <button class="btn btn-primary btn-block btn-lg" data-action="start-empty">${icon('plus')} Nouvelle séance</button>
        </section>
        ${templates.length ? `
        <section>
          <div class="section-head"><h3>Refaire une séance</h3></div>
          <div class="card list">${templates.map((s) => `
            <button class="row" data-action="repeat-session" data-id="${esc(s.id)}">
              <span class="row-icon">${icon('repeat', 18)}</span>
              <div class="row-main">
                <div class="row-title">${esc(s.name || 'Séance')}</div>
                <div class="row-sub ellipsis">${esc(s.entries.map((e) => exName(e.exerciseId)).join(' · '))}</div>
              </div>
              <span class="muted small nowrap">${esc(relDays(s.date))}</span>
            </button>`).join('')}
          </div>
        </section>` : ''}`,
    };
  }

  function setInput(field, value, placeholder, mode, label) {
    return `<input class="input set-input" data-input="set" data-field="${field}" inputmode="${mode}" value="${esc(value || '')}" placeholder="${esc(placeholder)}" autocomplete="off" enterkeyhint="next" aria-label="${esc(label)}">`;
  }

  function entryCard(entry, index) {
    const ex = exById(entry.exerciseId);
    const type = exType(entry.exerciseId);
    const prev = Stats.lastPerformance(data.sessions, entry.exerciseId, type, draft.editingId, draft.date);
    const hist = Stats.exerciseHistory(data.sessions.filter((s) => s.id !== draft.editingId), entry.exerciseId, type);
    const recs = Stats.personalRecords(hist, type);
    const mainKey = Stats.MAIN_METRIC[type];
    const rec = recs[mainKey];

    const heads = type === 'time'
      ? '<span>#</span><span>Précédent</span><span>Durée</span><span></span>'
      : `<span>#</span><span>Précédent</span><span>${type === 'bodyweight' ? 'Lest' : 'kg'}</span><span>Reps</span><span></span>`;

    const rows = entry.sets.map((s, i) => {
      const p = prev ? prev.sets[i] : null;
      const inputs = type === 'time'
        ? setInput('time', s.time, p ? String(Stats.parseDuration(p.time)) : 'sec', 'numeric', `Durée de la série ${i + 1} en secondes`)
        : setInput('weight', s.weight, p && num(p.weight) ? String(p.weight) : type === 'bodyweight' ? '0' : 'kg', 'decimal', `Charge de la série ${i + 1} en kg`) +
          setInput('reps', s.reps, p ? String(p.reps) : 'reps', 'numeric', `Répétitions de la série ${i + 1}`);
      return `<div class="set-row ${type === 'time' ? 'one' : 'two'}" data-uid="${esc(entry.uid)}" data-i="${i}">
        <span class="set-num">${i + 1}</span>
        <button class="set-prev" data-action="fill-prev" ${p ? '' : 'disabled'} title="Reprendre cette performance">${p ? esc(fmtSetShort(p, type, true)) : '—'}</button>
        ${inputs}
        <button class="icon-btn sm" data-action="remove-set" aria-label="Supprimer la série ${i + 1}">${icon('x', 16)}</button>
      </div>`;
    }).join('');

    return `<article class="card entry" id="entry-${esc(entry.uid)}">
      <header class="entry-head">
        <div class="entry-titles">
          <h3>${esc(ex ? ex.name : 'Exercice supprimé')}</h3>
          <p class="muted small">${esc(ex ? ex.muscle : '')}${prev ? ' · Dernière fois ' + esc(relDays(prev.date).toLowerCase()) : ' · Première fois'}${rec ? ` · Record ${esc(lcFirst(metricLabel(type, mainKey)))} : ${fmtMetric(mainKey, rec.value)}` : ''}</p>
        </div>
        <button class="icon-btn" data-action="remove-entry" data-uid="${esc(entry.uid)}" aria-label="Retirer ${esc(ex ? ex.name : 'l’exercice')}">${icon('trash', 18)}</button>
      </header>
      <div class="sets ${type === 'time' ? 'one' : 'two'}">
        <div class="set-row set-head ${type === 'time' ? 'one' : 'two'}">${heads}</div>
        ${rows}
      </div>
      <footer class="entry-foot">
        <button class="btn btn-soft btn-sm" data-action="add-set" data-uid="${esc(entry.uid)}">${icon('plus', 16)} Série</button>
        <button class="btn btn-ghost btn-sm" data-action="timer-start">${icon('timer', 16)} Repos ${fmtClock(data.settings.restSeconds)}</button>
      </footer>
    </article>`;
  }

  function viewSession() {
    if (!draft) return viewSessionStart();
    const editing = draft.editingId ? data.sessions.find((s) => s.id === draft.editingId) : null;
    return {
      title: editing ? 'Modifier la séance' : 'Séance en cours',
      tab: 'session',
      actions: `<button class="icon-btn" data-action="timer-start" aria-label="Lancer le minuteur de repos">${icon('timer')}</button>`,
      html: `
        <section class="card pad session-meta">
          <input class="input input-title" data-input="draft-name" value="${esc(draft.name)}" placeholder="Nom de la séance (ex. Push, Jambes…)" maxlength="60" aria-label="Nom de la séance">
          <div class="meta-row">
            <label class="date-field">${icon('calendar', 18)}<input type="date" class="input-date" data-input="draft-date" value="${esc(draft.date)}" max="${todayKey()}" aria-label="Date de la séance"></label>
            ${editing ? '<span class="chip">Modification</span>' : `<span class="chip">${icon('timer', 15)}<span data-elapsed>${elapsedText()}</span></span>`}
          </div>
        </section>
        <div class="entries">
          ${draft.entries.length ? draft.entries.map(entryCard).join('') : `<p class="card pad muted hint">Ajoute ton premier exercice pour commencer à noter tes séries. Tape sur une performance « Précédent » pour la recopier.</p>`}
        </div>
        <button class="btn btn-dashed btn-block btn-lg" data-action="open-picker">${icon('plus')} Ajouter un exercice</button>
        <section class="card pad">
          <label class="label" for="notes">Notes</label>
          <textarea id="notes" class="input" rows="2" data-input="draft-notes" placeholder="Sensations, énergie, douleurs…">${esc(draft.notes)}</textarea>
        </section>
        <div class="stack">
          <button class="btn btn-primary btn-block btn-lg" data-action="finish">${icon('check')} ${editing ? 'Enregistrer les modifications' : 'Terminer la séance'}</button>
          <button class="btn btn-ghost-danger btn-block" data-action="discard">${editing ? 'Annuler les modifications' : 'Abandonner la séance'}</button>
        </div>`,
      mount() {
        if (editing) return;
        const iv = setInterval(() => {
          const el = $('[data-elapsed]');
          if (el) el.textContent = elapsedText();
        }, 20000);
        cleanups.push(() => clearInterval(iv));
      },
    };
  }

  function findEntry(uid) {
    return draft ? draft.entries.find((e) => e.uid === uid) : null;
  }

  function addExerciseToDraft(id) {
    if (!draft) draft = newDraft();
    const entry = { uid: Store.uid(), exerciseId: id, sets: [blankSet()] };
    draft.entries.push(entry);
    saveDraft();
    closeModal();
    if (parseRoute().page !== 'session') go('session');
    else render(true);
    const card = document.getElementById('entry-' + entry.uid);
    if (card) card.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function cleanSet(s, type) {
    const w = Math.max(0, Stats.round(num(s.weight), 2));
    if (type === 'time') {
      const time = Math.round(Stats.parseDuration(s.time));
      if (!(time > 0)) return null;
      return w > 0 ? { time, weight: w } : { time };
    }
    const reps = Math.round(num(s.reps));
    if (!(reps > 0)) return null;
    if (type === 'bodyweight' && !w) return { reps };
    return { reps, weight: w };
  }

  function finishSession() {
    const entries = draft.entries
      .map((e) => ({ exerciseId: e.exerciseId, sets: e.sets.map((s) => cleanSet(s, exType(e.exerciseId))).filter(Boolean) }))
      .filter((e) => e.sets.length && exById(e.exerciseId));
    if (!entries.length) {
      toast('Remplis au moins une série (répétitions ou durée) avant de terminer.');
      return;
    }
    const now = Date.now();
    const date = /^\d{4}-\d{2}-\d{2}$/.test(draft.date) ? draft.date : todayKey();
    let session;
    if (draft.editingId) {
      session = data.sessions.find((s) => s.id === draft.editingId);
    }
    if (session) {
      Object.assign(session, { date, name: draft.name.trim(), notes: draft.notes.trim(), entries, updatedAt: now });
    } else {
      session = { id: Store.uid(), date, name: draft.name.trim(), notes: draft.notes.trim(), entries, createdAt: now, updatedAt: now };
      const minutes = draft.startedAt ? Math.round((now - draft.startedAt) / 60000) : 0;
      if (date === todayKey() && minutes >= 1 && minutes <= 360) session.duration = minutes;
      data.sessions.push(session);
    }
    const wasEditing = !!draft.editingId;
    save();
    draft = null;
    saveDraft();
    stopTimer();
    requestPersistentStorage();

    // Records de la séance ; un record secondaire (volume, total) est masqué si l'exercice a déjà un record « phare ».
    const all = Stats.prEvents(data.sessions, data.exercises).filter((e) => e.sessionId === session.id);
    const withPrimary = new Set(all.filter((e) => PRIMARY_METRICS.has(e.metric)).map((e) => e.exerciseId));
    const prs = all.filter((e) => PRIMARY_METRICS.has(e.metric) || !withPrimary.has(e.exerciseId));
    if (wasEditing) {
      go('history/' + encodeURIComponent(session.id));
      toast('Séance mise à jour.');
    } else {
      go('home');
      showSummary(session, prs);
    }
  }

  function showSummary(session, prs) {
    const t = Stats.sessionTotals(session, exIndex);
    openModal(`
      <div class="summary">
        <div class="summary-icon">${icon('check', 30)}</div>
        <h2>Séance enregistrée !</h2>
        <div class="kpis">
          <div><strong>${t.exercises}</strong><span>${plural(t.exercises, 'exercice', 'exercices')}</span></div>
          <div><strong>${t.sets}</strong><span>${plural(t.sets, 'série', 'séries')}</span></div>
          <div><strong>${fmt(t.volume, 0)}</strong><span>kg soulevés</span></div>
          ${session.duration ? `<div><strong>${session.duration}</strong><span>minutes</span></div>` : ''}
        </div>
        ${prs.length ? `
          <div class="pr-box">
            <h3>${icon('trophy', 18)} ${prs.length} ${plural(prs.length, 'nouveau record', 'nouveaux records')}</h3>
            ${prs.map((e) => `<div class="pr-item"><span>${esc(exName(e.exerciseId))}<small>${esc(metricLabel(exType(e.exerciseId), e.metric))}</small></span><strong>${fmtMetric(e.metric, e.value)}<small>${fmtDelta(e.metric, e.value - e.previous)}</small></strong></div>`).join('')}
          </div>` : '<p class="muted">Pas de nouveau record cette fois-ci. La régularité finit toujours par payer : continue !</p>'}
        <button class="btn btn-primary btn-block btn-lg" data-action="close-modal">Super !</button>
      </div>`);
  }

  /* ---------- Sélecteur d'exercice ---------- */

  function openPicker() {
    openModal(`
      <div class="sheet-head"><h2>Ajouter un exercice</h2><button class="icon-btn" data-action="close-modal" aria-label="Fermer">${icon('x')}</button></div>
      <label class="search">${icon('search', 18)}<input class="input" id="picker-search" type="search" placeholder="Rechercher ou créer un exercice…" autocomplete="off" aria-label="Rechercher un exercice"></label>
      <div id="picker-list" class="picker-list"></div>`, (root) => {
      const input = $('#picker-search', root);
      renderPickerList('');
      if (window.matchMedia('(pointer: fine)').matches) input.focus();
      input.addEventListener('input', () => renderPickerList(input.value));
      input.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter') return;
        e.preventDefault();
        const first = $('#picker-list [data-action]', root);
        if (first) first.click();
      });
    });
  }

  function renderPickerList(query) {
    const q = normalizeText(query);
    const inSession = new Set(draft ? draft.entries.map((e) => e.exerciseId) : []);
    const lastDone = {};
    for (const s of data.sessions) for (const e of s.entries) if (!lastDone[e.exerciseId] || s.date > lastDone[e.exerciseId]) lastDone[e.exerciseId] = s.date;

    const matches = data.exercises.filter((e) => !q || normalizeText(e.name).includes(q) || normalizeText(e.muscle).includes(q));
    const row = (e) => `<button class="row" data-action="pick-exercise" data-id="${esc(e.id)}">
        <div class="row-main"><div class="row-title">${esc(e.name)}</div>
        <div class="row-sub">${esc(e.muscle)} · ${lastDone[e.id] ? esc(relDays(lastDone[e.id])) : 'Jamais fait'}</div></div>
        ${inSession.has(e.id) ? '<span class="tag">Déjà ajouté</span>' : icon('plus', 18)}
      </button>`;

    let html = '';
    const exact = data.exercises.some((e) => normalizeText(e.name) === q);
    if (q && !exact) {
      html += `<button class="row row-create" data-action="create-exercise" data-name="${esc(query.trim())}">
        <span class="row-icon">${icon('plus', 18)}</span><div class="row-main"><div class="row-title">Créer « ${esc(query.trim())} »</div><div class="row-sub">Nouvel exercice personnalisé</div></div></button>`;
    }
    if (!q) {
      const recent = data.exercises.filter((e) => lastDone[e.id]).sort((a, b) => (lastDone[a.id] < lastDone[b.id] ? 1 : -1)).slice(0, 5);
      if (recent.length) html += `<h4 class="group-title">Récents</h4><div class="list">${recent.map(row).join('')}</div>`;
    }
    for (const muscle of Store.MUSCLES) {
      const group = matches.filter((e) => e.muscle === muscle).sort((a, b) => a.name.localeCompare(b.name, 'fr'));
      if (group.length) html += `<h4 class="group-title">${esc(muscle)}</h4><div class="list">${group.map(row).join('')}</div>`;
    }
    if (!matches.length && !q) html += '<p class="muted pad">Aucun exercice.</p>';
    if (!q) html += `<button class="btn btn-dashed btn-block" data-action="create-exercise" data-name="">${icon('plus', 18)} Créer un exercice</button>`;
    $('#picker-list').innerHTML = html;
  }

  /* ---------- Formulaire exercice ---------- */

  function openExerciseForm(existing, presetName, onSaved) {
    const usedIn = existing ? data.sessions.filter((s) => s.entries.some((e) => e.exerciseId === existing.id)).length : 0;
    const cur = existing || { name: presetName || '', muscle: 'Pectoraux', type: 'weight' };
    openModal(`
      <div class="sheet-head"><h2>${existing ? 'Modifier l’exercice' : 'Nouvel exercice'}</h2><button class="icon-btn" data-action="close-modal" aria-label="Fermer">${icon('x')}</button></div>
      <form id="ex-form" class="form" novalidate>
        <label class="label">Nom
          <input class="input" name="name" required maxlength="50" value="${esc(cur.name)}" placeholder="ex. Développé décliné" autocomplete="off">
        </label>
        <label class="label">Groupe musculaire
          <select class="input" name="muscle">${Store.MUSCLES.map((m) => `<option ${m === cur.muscle ? 'selected' : ''}>${esc(m)}</option>`).join('')}</select>
        </label>
        <fieldset class="type-choice">
          <legend class="label">Ce que tu mesures</legend>
          ${Object.entries(Store.TYPES).map(([k, t]) => `
            <label class="radio-card${usedIn && k !== cur.type ? ' disabled' : ''}">
              <input type="radio" name="type" value="${k}" ${k === cur.type ? 'checked' : ''} ${usedIn && k !== cur.type ? 'disabled' : ''}>
              <span><strong>${esc(t.label)}</strong><small>${esc(t.hint)}</small></span>
            </label>`).join('')}
          ${usedIn ? '<p class="muted small">Le type ne peut plus changer : cet exercice a déjà un historique.</p>' : ''}
        </fieldset>
        <p class="form-error" id="ex-error" role="alert"></p>
        <div class="btn-row">
          ${existing ? `<button type="button" class="btn btn-ghost-danger" data-action="delete-exercise" data-id="${esc(existing.id)}">${icon('trash', 18)} Supprimer</button>` : ''}
          <button type="submit" class="btn btn-primary grow">${existing ? 'Enregistrer' : 'Créer'}</button>
        </div>
      </form>`, (root) => {
      const form = $('#ex-form', root);
      if (!existing) form.name.focus();
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const name = form.name.value.trim().replace(/\s+/g, ' ');
        const err = $('#ex-error', root);
        if (!name) { err.textContent = 'Donne un nom à l’exercice.'; return; }
        const dup = data.exercises.find((x) => normalizeText(x.name) === normalizeText(name) && (!existing || x.id !== existing.id));
        if (dup) { err.textContent = 'Un exercice porte déjà ce nom.'; return; }
        const muscle = form.muscle.value;
        const type = (form.querySelector('input[name="type"]:checked') || {}).value || 'weight';
        let ex;
        if (existing) {
          ex = Object.assign(existing, { name, muscle, type: usedIn ? existing.type : type });
        } else {
          ex = { id: Store.uid(), name, muscle, type };
          data.exercises.push(ex);
        }
        save();
        closeModal();
        if (onSaved) onSaved(ex);
        else render(true);
        toast(existing ? 'Exercice modifié.' : 'Exercice créé.');
      });
    });
  }

  async function deleteExercise(id) {
    const ex = exById(id);
    if (!ex) return;
    const usedIn = data.sessions.filter((s) => s.entries.some((e) => e.exerciseId === id)).length;
    const ok = await confirmDialog({
      title: `Supprimer « ${ex.name} » ?`,
      message: usedIn
        ? `Cet exercice apparaît dans ${usedIn} ${plural(usedIn, 'séance', 'séances')}. Ses séries seront aussi effacées. Cette action est irréversible.`
        : 'Cette action est irréversible.',
      confirm: 'Supprimer',
      danger: true,
    });
    if (!ok) return;
    data.exercises = data.exercises.filter((e) => e.id !== id);
    for (const s of data.sessions) s.entries = s.entries.filter((e) => e.exerciseId !== id);
    data.sessions = data.sessions.filter((s) => s.entries.length);
    if (draft) {
      draft.entries = draft.entries.filter((e) => e.exerciseId !== id);
      saveDraft();
    }
    save();
    toast('Exercice supprimé.');
    if (parseRoute().page === 'exercise') go('progress');
    else render(true);
  }

  /* =====================================================================
   * Vue : Progrès
   * ===================================================================== */

  function exerciseSummaries() {
    const out = [];
    for (const ex of data.exercises) {
      const hist = Stats.exerciseHistory(data.sessions, ex.id, ex.type);
      if (!hist.length) continue;
      const key = Stats.MAIN_METRIC[ex.type];
      const pts = Stats.series(hist, key);
      const last = hist[hist.length - 1];
      out.push({
        ex, key, last,
        value: last.metrics[key],
        trend: Stats.trend(Stats.filterRange(pts, '3M')),
        spark: pts.slice(-12).map((p) => p.value),
      });
    }
    return out.sort((a, b) => (a.last.date < b.last.date ? 1 : a.last.date > b.last.date ? -1 : a.ex.name.localeCompare(b.ex.name, 'fr')));
  }

  function progressList() {
    const q = normalizeText(ui.progressSearch);
    const items = exerciseSummaries().filter((s) =>
      (ui.progressMuscle === 'Tous' || s.ex.muscle === ui.progressMuscle) && (!q || normalizeText(s.ex.name).includes(q)));
    if (!items.length) return '<p class="card pad muted">Aucun exercice ne correspond.</p>';
    return `<div class="card list">${items.map((s) => `
      <a class="row" href="#/exercise/${encodeURIComponent(s.ex.id)}">
        <div class="row-main">
          <div class="row-title">${esc(s.ex.name)}</div>
          <div class="row-sub">${esc(s.ex.muscle)} · ${esc(relDays(s.last.date))}</div>
        </div>
        ${Chart.sparkline(s.spark)}
        <div class="row-value">${fmtMetric(s.key, s.value)}<small>${trendBadge(s.trend, '')}${s.trend == null ? esc(metricLabel(s.ex.type, s.key)) : ''}</small></div>
      </a>`).join('')}</div>`;
  }

  function viewProgress() {
    const all = exerciseSummaries();
    if (!all.length) {
      return {
        title: 'Progrès',
        html: emptyState('chart', 'Pas encore de données',
          'Enregistre ta première séance : chaque exercice aura ensuite sa courbe de progression, ses records et son historique.',
          `<button class="btn btn-primary btn-block btn-lg" data-action="go-session">${icon('plus')} Démarrer une séance</button>`),
      };
    }
    const muscles = ['Tous', ...Store.MUSCLES.filter((m) => all.some((s) => s.ex.muscle === m))];
    if (!muscles.includes(ui.progressMuscle)) ui.progressMuscle = 'Tous';
    return {
      title: 'Progrès',
      html: `
        <label class="search">${icon('search', 18)}<input class="input" type="search" data-input="progress-search" value="${esc(ui.progressSearch)}" placeholder="Rechercher un exercice…" aria-label="Rechercher un exercice"></label>
        <div class="chips" role="group" aria-label="Filtrer par groupe musculaire">
          ${muscles.map((m) => `<button class="chip-btn" data-action="progress-muscle" data-m="${esc(m)}" aria-pressed="${m === ui.progressMuscle}">${esc(m)}</button>`).join('')}
        </div>
        <p class="muted small">Indicateur principal de la dernière séance · tendance sur 3 mois</p>
        <div id="progress-list">${progressList()}</div>`,
    };
  }

  /* =====================================================================
   * Vue : Détail d'un exercice
   * ===================================================================== */

  function recordTiles(recs, type, hist) {
    const v = (key) => (recs[key] ? fmtMetric(key, recs[key].value) : '—');
    const d = (key) => (recs[key] ? fmtDate(recs[key].date) : '');
    const t = (label, value, date) => `<div class="tile"><div class="tile-label">${esc(label)}</div><div class="tile-value sm">${value}</div><div class="tile-foot">${esc(date || '')}</div></div>`;
    const best = recs.bestSet ? t('Meilleure série', esc(fmtSetLong(recs.bestSet.set, type)), fmtDate(recs.bestSet.date)) : '';
    const count = t('Séances', hist.length, hist.length ? 'depuis le ' + fmtDate(hist[0].date).replace(/^\S+\s/, '') : '');
    if (type === 'weight') {
      return t('1RM estimé', v('e1rm'), d('e1rm')) + t('Charge max', v('maxWeight'), d('maxWeight')) + best + t('Volume max (séance)', v('volume'), d('volume'));
    }
    if (type === 'bodyweight') {
      return t('Reps max (série)', v('maxReps'), d('maxReps')) + t('Reps max (séance)', v('totalReps'), d('totalReps')) +
        (recs.maxWeight ? t('Lest max', v('maxWeight'), d('maxWeight')) : '') + count;
    }
    return t('Durée max', v('maxTime'), d('maxTime')) + t('Durée totale max', v('totalTime'), d('totalTime')) + count;
  }

  function viewExercise(id) {
    const ex = exById(id);
    if (!ex) {
      return { title: 'Exercice', back: '#/progress', tab: 'progress', html: emptyState('search', 'Exercice introuvable', 'Il a peut-être été supprimé.', '') };
    }
    const type = ex.type;
    const hist = Stats.exerciseHistory(data.sessions, id, type);
    let metrics = Stats.METRICS[type];
    if (type === 'bodyweight' && !hist.some((h) => h.metrics.maxWeight > 0)) metrics = metrics.filter((m) => m.key !== 'maxWeight');
    const key = metrics.some((m) => m.key === ui.metric[id]) ? ui.metric[id] : metrics[0].key;
    const label = metricLabel(type, key);
    const allPts = Stats.series(hist, key);
    const pts = Stats.filterRange(allPts, ui.range);
    const tr = Stats.trend(pts);
    const recs = Stats.personalRecords(hist, type);
    const prSessions = new Set(Stats.prEvents(data.sessions, data.exercises).filter((e) => e.exerciseId === id).map((e) => e.sessionId));
    const mainKey = Stats.MAIN_METRIC[type];
    const rangeLabels = { '1M': 'sur 1 mois', '3M': 'sur 3 mois', '6M': 'sur 6 mois', '1A': 'sur 1 an', Tout: 'depuis le début' };

    const head = `<div class="ex-head">
        <span class="tag">${esc(ex.muscle)}</span><span class="tag">${esc(Store.TYPES[type].label)}</span>
        <button class="link push" data-action="edit-exercise" data-id="${esc(id)}">${icon('pencil', 15)} Modifier</button>
      </div>`;

    if (!hist.length) {
      return {
        title: ex.name, back: '#/progress', tab: 'progress',
        html: head + emptyState('chart', 'Aucune séance pour cet exercice', 'Ajoute-le à ta prochaine séance pour commencer à suivre ta progression.',
          `<button class="btn btn-primary btn-block" data-action="pick-exercise" data-id="${esc(id)}">${icon('plus')} L’ajouter à une séance</button>`),
      };
    }

    let caption;
    if (!pts.length) caption = 'Aucune séance sur cette période.';
    else if (pts.length === 1) caption = 'Une seule séance sur cette période : la courbe apparaîtra dès la prochaine.';
    else caption = `${trendBadge(tr)} <span>${rangeLabels[ui.range]} (${pts.length} séances)</span>`;

    const historyRows = [...hist].reverse().map((h) => `
      <a class="row" href="#/history/${encodeURIComponent(h.sessionId)}">
        <div class="row-main">
          <div class="row-title">${esc(fmtDate(h.date))}${prSessions.has(h.sessionId) ? `<span class="pr-pill">${icon('trophy', 13)}Record</span>` : ''}</div>
          <div class="set-chips">${h.sets.map((s) => `<span class="set-chip">${esc(fmtSetShort(s, type))}</span>`).join('')}</div>
        </div>
        <div class="row-value">${fmtMetric(mainKey, h.metrics[mainKey])}<small>${esc(metricLabel(type, mainKey))}</small></div>
      </a>`).join('');

    return {
      title: ex.name, back: '#/progress', tab: 'progress',
      html: `
        ${head}
        <div class="tiles">${recordTiles(recs, type, hist)}</div>
        <section class="card pad">
          <div class="seg" role="group" aria-label="Indicateur">
            ${metrics.map((m) => `<button class="seg-btn" data-action="set-metric" data-id="${esc(id)}" data-key="${m.key}" aria-pressed="${m.key === key}">${esc(m.label)}</button>`).join('')}
          </div>
          <div class="ranges" role="group" aria-label="Période">
            ${Object.keys(rangeLabels).map((r) => `<button class="chip-btn sm" data-action="set-range" data-r="${r}" aria-pressed="${r === ui.range}">${r}</button>`).join('')}
          </div>
          <div class="chart-wrap" id="ex-chart">${pts.length ? '' : `<div class="chart-empty">${icon('chart', 22)}<span>Pas de données sur cette période</span></div>`}</div>
          <p class="chart-caption">${caption}</p>
          ${type === 'weight' && key === 'e1rm' ? '<p class="muted small">1RM estimé : charge théorique maximale sur 1 répétition (formule d’Epley), calculée à partir de ta meilleure série.</p>' : ''}
        </section>
        <section>
          <div class="section-head"><h3>Historique</h3><span class="muted small">${hist.length} ${plural(hist.length, 'séance', 'séances')}</span></div>
          <div class="card list">${historyRows}</div>
        </section>`,
      mount() {
        const box = $('#ex-chart');
        if (box && pts.length) {
          Chart.line(box, pts, {
            label: `${label} — ${ex.name}`,
            format: (val) => fmtMetric(key, val),
            tick: (val) => (key === 'maxTime' || key === 'totalTime' ? fmtClock(val) : val >= 10000 ? fmt(val / 1000) + 'k' : fmt(val)),
          });
        }
      },
    };
  }

  /* =====================================================================
   * Vue : Historique
   * ===================================================================== */

  function viewHistory() {
    if (!data.sessions.length) {
      return {
        title: 'Historique',
        html: emptyState('history', 'Aucune séance enregistrée', 'Tes séances terminées apparaîtront ici, classées par mois.',
          `<button class="btn btn-primary btn-block btn-lg" data-action="go-session">${icon('plus')} Démarrer une séance</button>`),
      };
    }
    const prCounts = prCountsBySession(groupedPRs().grouped);
    const groups = new Map();
    for (const s of Stats.sortSessions(data.sessions, -1)) {
      const k = s.date.slice(0, 7);
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(s);
    }
    let html = '';
    for (const [k, list] of groups) {
      const label = capitalize(dfMonth.format(Stats.parseDate(k + '-01')));
      html += `<section>
        <div class="section-head"><h3>${esc(label)}</h3><span class="muted small">${list.length} ${plural(list.length, 'séance', 'séances')}</span></div>
        <div class="card list">${list.map((s) => sessionRow(s, prCounts[s.id])).join('')}</div>
      </section>`;
    }
    return { title: 'Historique', html };
  }

  function viewSessionDetail(id) {
    const s = data.sessions.find((x) => x.id === id);
    if (!s) return { title: 'Séance', back: '#/history', tab: 'history', html: emptyState('history', 'Séance introuvable', 'Elle a peut-être été supprimée.', '') };
    const t = Stats.sessionTotals(s, exIndex);
    const prs = Stats.prEvents(data.sessions, data.exercises).filter((e) => e.sessionId === id);
    const prByEx = {};
    for (const e of prs) (prByEx[e.exerciseId] = prByEx[e.exerciseId] || []).push(e);

    const entries = s.entries.map((e) => {
      const type = exType(e.exerciseId);
      const m = Stats.entryMetrics(e.sets, type);
      const exPrs = prByEx[e.exerciseId] || [];
      return `<article class="card entry">
        <header class="entry-head">
          <div class="entry-titles">
            <h3><a href="#/exercise/${encodeURIComponent(e.exerciseId)}">${esc(exName(e.exerciseId))}</a></h3>
            <p class="muted small">${esc(exById(e.exerciseId) ? exById(e.exerciseId).muscle : '')}${type === 'weight' && m.e1rm ? ' · 1RM estimé ' + fmt(m.e1rm) + ' kg' : ''}${m.volume ? ' · Volume ' + fmt(m.volume, 0) + ' kg' : ''}</p>
          </div>
        </header>
        <ol class="set-list">${e.sets.map((x, i) => `<li><span class="set-num">${i + 1}</span><span>${esc(fmtSetLong(x, type))}</span></li>`).join('')}</ol>
        ${exPrs.length ? `<div class="pr-inline">${icon('trophy', 15)} ${exPrs.map((p) => `${esc(metricLabel(type, p.metric))} : <strong>${fmtMetric(p.metric, p.value)}</strong>`).join(' · ')}</div>` : ''}
      </article>`;
    }).join('');

    return {
      title: s.name || 'Séance', back: '#/history', tab: 'history',
      html: `
        <section class="card pad">
          <p class="muted">${esc(capitalize(dfLong.format(Stats.parseDate(s.date))))}</p>
          <div class="kpis">
            <div><strong>${t.exercises}</strong><span>${plural(t.exercises, 'exercice', 'exercices')}</span></div>
            <div><strong>${t.sets}</strong><span>${plural(t.sets, 'série', 'séries')}</span></div>
            <div><strong>${fmt(t.volume, 0)}</strong><span>kg</span></div>
            ${s.duration ? `<div><strong>${s.duration}</strong><span>min</span></div>` : ''}
          </div>
          ${s.notes ? `<p class="notes">${esc(s.notes)}</p>` : ''}
        </section>
        ${prs.length ? `<p class="pr-banner">${icon('trophy', 18)} ${prs.length} ${plural(prs.length, 'record battu', 'records battus')} pendant cette séance</p>` : ''}
        ${entries}
        <div class="btn-row">
          <button class="btn btn-soft grow" data-action="edit-session" data-id="${esc(id)}">${icon('pencil', 18)} Modifier</button>
          <button class="btn btn-soft grow" data-action="repeat-session" data-id="${esc(id)}">${icon('repeat', 18)} Refaire</button>
        </div>
        <button class="btn btn-ghost-danger btn-block" data-action="delete-session" data-id="${esc(id)}">${icon('trash', 18)} Supprimer la séance</button>`,
    };
  }

  /* =====================================================================
   * Vue : Réglages et gestion des exercices
   * ===================================================================== */

  function viewSettings() {
    const rest = data.settings.restSeconds;
    return {
      title: 'Réglages',
      html: `
        <section class="card pad">
          <h3>Minuteur de repos</h3>
          <p class="muted small">Durée lancée par le bouton « Repos » pendant une séance.</p>
          <div class="seg">${[60, 90, 120, 180].map((v) => `<button class="seg-btn" data-action="set-rest" data-v="${v}" aria-pressed="${v === rest}">${fmtClock(v)}</button>`).join('')}</div>
        </section>
        <section class="card list">
          <a class="row" href="#/exercises">
            <span class="row-icon">${icon('dumbbell', 18)}</span>
            <div class="row-main"><div class="row-title">Mes exercices</div><div class="row-sub">${data.exercises.length} exercices · ajouter, renommer, supprimer</div></div>
            <span class="row-chevron">${icon('chevron', 18)}</span>
          </a>
        </section>
        <section class="card pad">
          <h3>Sauvegarde</h3>
          <p class="muted small">Tes données sont enregistrées uniquement sur cet appareil. Exporte-les régulièrement pour ne rien perdre ou pour les transférer sur un autre téléphone.</p>
          <div class="btn-row">
            <button class="btn btn-soft grow" data-action="export">${icon('download', 18)} Exporter</button>
            <label class="btn btn-soft grow">${icon('upload', 18)} Importer<input type="file" accept="application/json,.json" data-input="import" hidden></label>
          </div>
          ${Store.available ? '' : '<p class="form-error">Le stockage local est indisponible (navigation privée ?) : tes données seront perdues à la fermeture.</p>'}
        </section>
        ${data.sessions.length ? '' : `<section class="card pad"><h3>Découvrir l’application</h3><p class="muted small">Charge 12 semaines de séances fictives pour voir les courbes et les records.</p><button class="btn btn-soft btn-block" data-action="load-demo">${icon('sparkles', 18)} Charger les données de démo</button></section>`}
        <section class="card pad">
          <h3>Zone sensible</h3>
          <p class="muted small">Efface toutes les séances, les exercices personnalisés et les réglages.</p>
          <button class="btn btn-ghost-danger btn-block" data-action="reset-all">${icon('trash', 18)} Effacer toutes les données</button>
        </section>
        <p class="muted small center">Progression · ${data.sessions.length} ${plural(data.sessions.length, 'séance enregistrée', 'séances enregistrées')}</p>`,
    };
  }

  function viewExercises() {
    const counts = {};
    for (const s of data.sessions) for (const id of new Set(s.entries.map((e) => e.exerciseId))) counts[id] = (counts[id] || 0) + 1;
    let html = `<button class="btn btn-primary btn-block" data-action="new-exercise">${icon('plus')} Nouvel exercice</button>`;
    for (const muscle of Store.MUSCLES) {
      const group = data.exercises.filter((e) => e.muscle === muscle).sort((a, b) => a.name.localeCompare(b.name, 'fr'));
      if (!group.length) continue;
      html += `<section><div class="section-head"><h3>${esc(muscle)}</h3></div><div class="card list">${group.map((e) => `
        <button class="row" data-action="edit-exercise" data-id="${esc(e.id)}">
          <div class="row-main"><div class="row-title">${esc(e.name)}</div><div class="row-sub">${esc(Store.TYPES[e.type].label)}${counts[e.id] ? ` · ${counts[e.id]} ${plural(counts[e.id], 'séance', 'séances')}` : ''}</div></div>
          ${icon('pencil', 16)}
        </button>`).join('')}</div></section>`;
    }
    return { title: 'Mes exercices', back: '#/settings', tab: 'settings', html };
  }

  async function exportData() {
    const json = JSON.stringify({ app: 'progression', exportedAt: new Date().toISOString(), ...data }, null, 2);
    const filename = `progression-${todayKey()}.json`;
    try {
      const file = new File([json], filename, { type: 'application/json' });
      if (navigator.canShare && navigator.canShare({ files: [file] }) && /iPhone|iPad|Android/i.test(navigator.userAgent)) {
        await navigator.share({ files: [file], title: 'Sauvegarde Progression' });
        return;
      }
    } catch (e) {
      if (e && e.name === 'AbortError') return;
    }
    const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    toast('Sauvegarde exportée.');
  }

  async function importData(file) {
    if (!file) return;
    let parsed;
    try {
      parsed = Store.normalize(JSON.parse(await file.text()));
    } catch (e) {
      toast('Fichier invalide : ' + (e.message || 'lecture impossible.'));
      return;
    }
    const ok = await confirmDialog({
      title: 'Importer cette sauvegarde ?',
      message: `Elle contient ${parsed.sessions.length} ${plural(parsed.sessions.length, 'séance', 'séances')} et ${parsed.exercises.length} exercices. Tes données actuelles seront remplacées.`,
      confirm: 'Importer',
    });
    if (!ok) return;
    data = parsed;
    save();
    toast('Sauvegarde importée.');
    go('home');
  }

  function requestPersistentStorage() {
    try {
      if (navigator.storage && navigator.storage.persist) navigator.storage.persist();
    } catch (e) { /* facultatif */ }
  }

  /* =====================================================================
   * Minuteur de repos
   * ===================================================================== */

  const timer = { endAt: 0, total: 0, iv: null };
  let audioCtx = null;

  function startTimer(seconds) {
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtx.state === 'suspended') audioCtx.resume();
    } catch (e) { audioCtx = null; }
    timer.total = seconds;
    timer.endAt = Date.now() + seconds * 1000;
    clearInterval(timer.iv);
    timer.iv = setInterval(tickTimer, 250);
    tickTimer();
  }

  function stopTimer() {
    clearInterval(timer.iv);
    timer.iv = null;
    timer.endAt = 0;
    const box = $('#timer');
    box.hidden = true;
    box.innerHTML = '';
  }

  function beep() {
    if (!audioCtx) return;
    try {
      [0, 0.25, 0.5].forEach((delay) => {
        const o = audioCtx.createOscillator();
        const g = audioCtx.createGain();
        o.frequency.value = 880;
        g.gain.setValueAtTime(0.0001, audioCtx.currentTime + delay);
        g.gain.exponentialRampToValueAtTime(0.25, audioCtx.currentTime + delay + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + delay + 0.18);
        o.connect(g).connect(audioCtx.destination);
        o.start(audioCtx.currentTime + delay);
        o.stop(audioCtx.currentTime + delay + 0.2);
      });
    } catch (e) { /* son facultatif */ }
  }

  function tickTimer() {
    const left = Math.max(0, Math.ceil((timer.endAt - Date.now()) / 1000));
    const box = $('#timer');
    if (left <= 0) {
      stopTimer();
      beep();
      if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
      toast('Repos terminé — série suivante !');
      return;
    }
    const pct = Math.min(100, (left / timer.total) * 100);
    if (box.hidden || !box.firstChild) {
      box.hidden = false;
      box.innerHTML = `<div class="timer-pill" role="timer" aria-live="off">
        <span class="timer-icon">${icon('timer', 18)}</span>
        <span class="timer-text"><small>Repos</small><strong data-left></strong></span>
        <button class="timer-btn" data-action="timer-add" data-v="-15" aria-label="Retirer 15 secondes">−15</button>
        <button class="timer-btn" data-action="timer-add" data-v="15" aria-label="Ajouter 15 secondes">+15</button>
        <button class="timer-btn" data-action="timer-stop" aria-label="Arrêter le minuteur">${icon('x', 16)}</button>
        <span class="timer-bar"><span data-bar></span></span>
      </div>`;
    }
    $('[data-left]', box).textContent = fmtClock(left);
    $('[data-bar]', box).style.width = pct + '%';
  }

  /* =====================================================================
   * Fenêtres modales, confirmations, notifications
   * ===================================================================== */

  let lastFocus = null;

  function openModal(html, mount) {
    const root = $('#modal-root');
    if (pendingConfirm && root.hidden === false) { const r = pendingConfirm; pendingConfirm = null; r(false); }
    lastFocus = document.activeElement;
    root.innerHTML = `<div class="backdrop" data-action="close-modal"></div><div class="sheet" role="dialog" aria-modal="true">${html}</div>`;
    root.hidden = false;
    document.body.classList.add('modal-open');
    if (mount) mount(root);
    const focusTarget = $('.sheet', root).querySelector('input:not([type=hidden]):not([type=radio]), button');
    if (focusTarget && !mount) focusTarget.focus({ preventScroll: true });
  }

  function closeModal() {
    const root = $('#modal-root');
    if (root.hidden) return;
    root.hidden = true;
    root.innerHTML = '';
    document.body.classList.remove('modal-open');
    if (pendingConfirm) { const r = pendingConfirm; pendingConfirm = null; r(false); }
    if (lastFocus && lastFocus.isConnected) lastFocus.focus({ preventScroll: true });
  }

  function confirmDialog({ title, message, confirm = 'Confirmer', danger = false }) {
    return new Promise((resolve) => {
      openModal(`<div class="confirm">
        <h2>${esc(title)}</h2>
        <p class="muted">${esc(message)}</p>
        <div class="btn-row">
          <button class="btn btn-soft grow" data-action="close-modal">Annuler</button>
          <button class="btn ${danger ? 'btn-danger' : 'btn-primary'} grow" data-action="confirm-yes">${esc(confirm)}</button>
        </div></div>`);
      pendingConfirm = resolve;
    });
  }

  let toastTimer = null;
  function toast(msg) {
    const el = $('#toast');
    el.textContent = msg;
    el.hidden = false;
    el.classList.remove('show');
    void el.offsetWidth;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.classList.remove('show'); setTimeout(() => { el.hidden = true; }, 250); }, 2800);
  }

  /* =====================================================================
   * Actions
   * ===================================================================== */

  const actions = {
    'go-session'() {
      go('session');
    },
    'start-empty'() {
      if (!draft) { draft = newDraft(); saveDraft(); }
      render();
      openPicker();
    },
    async 'repeat-session'(el) {
      const src = data.sessions.find((s) => s.id === el.dataset.id);
      if (!src || !(await replaceDraftIfNeeded())) return;
      draft = newDraft({
        name: src.name || '',
        entries: src.entries.filter((e) => exById(e.exerciseId)).map((e) => ({ uid: Store.uid(), exerciseId: e.exerciseId, sets: e.sets.map(blankSet) })),
      });
      saveDraft();
      go('session');
      toast('Séance prête : les performances précédentes s’affichent en gris.');
    },
    async 'edit-session'(el) {
      const src = data.sessions.find((s) => s.id === el.dataset.id);
      if (!src || !(await replaceDraftIfNeeded())) return;
      draft = {
        editingId: src.id, date: src.date, name: src.name || '', notes: src.notes || '', startedAt: null,
        entries: src.entries.map((e) => ({ uid: Store.uid(), exerciseId: e.exerciseId, sets: e.sets.map(toDraftSet) })),
      };
      saveDraft();
      go('session');
    },
    async 'delete-session'(el) {
      const ok = await confirmDialog({ title: 'Supprimer cette séance ?', message: 'Ses séries seront effacées de ton historique et de tes courbes. Cette action est irréversible.', confirm: 'Supprimer', danger: true });
      if (!ok) return;
      data.sessions = data.sessions.filter((s) => s.id !== el.dataset.id);
      save();
      go('history');
      toast('Séance supprimée.');
    },
    'open-picker'() { openPicker(); },
    'pick-exercise'(el) { addExerciseToDraft(el.dataset.id); },
    'create-exercise'(el) { openExerciseForm(null, el.dataset.name, (ex) => addExerciseToDraft(ex.id)); },
    'new-exercise'() { openExerciseForm(null, ''); },
    'edit-exercise'(el) { const ex = exById(el.dataset.id); if (ex) openExerciseForm(ex); },
    'delete-exercise'(el) { deleteExercise(el.dataset.id); },
    'add-set'(el) {
      const entry = findEntry(el.dataset.uid);
      if (!entry) return;
      const last = entry.sets[entry.sets.length - 1];
      entry.sets.push(last ? { ...last } : blankSet());
      saveDraft();
      render(true);
    },
    'remove-set'(el) {
      const row = el.closest('.set-row');
      const entry = findEntry(row.dataset.uid);
      if (!entry) return;
      entry.sets.splice(Number(row.dataset.i), 1);
      if (!entry.sets.length) entry.sets.push(blankSet());
      saveDraft();
      render(true);
    },
    'fill-prev'(el) {
      const row = el.closest('.set-row');
      const entry = findEntry(row.dataset.uid);
      if (!entry) return;
      const type = exType(entry.exerciseId);
      const prev = Stats.lastPerformance(data.sessions, entry.exerciseId, type, draft.editingId, draft.date);
      const p = prev && prev.sets[Number(row.dataset.i)];
      if (!p) return;
      entry.sets[Number(row.dataset.i)] = toDraftSet(p);
      saveDraft();
      render(true);
    },
    async 'remove-entry'(el) {
      const entry = findEntry(el.dataset.uid);
      if (!entry) return;
      const filled = entry.sets.some((s) => s.reps || s.time || s.weight);
      if (filled && !(await confirmDialog({ title: `Retirer « ${exName(entry.exerciseId)} » ?`, message: 'Les séries saisies pour cet exercice seront perdues.', confirm: 'Retirer', danger: true }))) return;
      draft.entries = draft.entries.filter((e) => e !== entry);
      saveDraft();
      render(true);
    },
    'finish'() { finishSession(); },
    async 'discard'() {
      const editing = !!draft.editingId;
      const filled = draft.entries.some((e) => e.sets.some((s) => s.reps || s.time));
      if ((filled || editing) && !(await confirmDialog({
        title: editing ? 'Annuler les modifications ?' : 'Abandonner la séance ?',
        message: editing ? 'La séance enregistrée restera inchangée.' : 'Les séries saisies ne seront pas enregistrées.',
        confirm: editing ? 'Oui, annuler' : 'Abandonner',
        danger: true,
      }))) return;
      const editedId = draft.editingId;
      draft = null;
      saveDraft();
      stopTimer();
      if (editedId) go('history/' + encodeURIComponent(editedId));
      else render();
    },
    'set-metric'(el) { ui.metric[el.dataset.id] = el.dataset.key; render(true); },
    'set-range'(el) { ui.range = el.dataset.r; render(true); },
    'progress-muscle'(el) { ui.progressMuscle = el.dataset.m; render(true); },
    'set-rest'(el) { data.settings.restSeconds = Number(el.dataset.v); save(); render(true); },
    'export'() { exportData(); },
    async 'reset-all'() {
      const ok = await confirmDialog({ title: 'Tout effacer ?', message: 'Toutes tes séances, tes exercices personnalisés et tes réglages seront supprimés définitivement. Pense à exporter une sauvegarde avant.', confirm: 'Tout effacer', danger: true });
      if (!ok) return;
      data = Store.defaultData();
      draft = null;
      saveDraft();
      save();
      go('home');
      toast('Données effacées.');
    },
    'load-demo'() {
      data.sessions = Demo.generate(new Date());
      save();
      go('home');
      toast('Données de démo chargées. Tu pourras les effacer dans Réglages.');
    },
    'timer-start'() { startTimer(data.settings.restSeconds); },
    'timer-add'(el) {
      timer.endAt += Number(el.dataset.v) * 1000;
      timer.total = Math.max(timer.total, Math.ceil((timer.endAt - Date.now()) / 1000));
      tickTimer();
    },
    'timer-stop'() { stopTimer(); },
    'close-modal'() { closeModal(); },
    'confirm-yes'() {
      const r = pendingConfirm;
      pendingConfirm = null;
      closeModal();
      if (r) r(true);
    },
  };

  /* =====================================================================
   * Écouteurs globaux
   * ===================================================================== */

  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-action]');
    if (!el || el.disabled) return;
    const fn = actions[el.dataset.action];
    if (!fn) return;
    e.preventDefault();
    fn(el, e);
  });

  document.addEventListener('input', (e) => {
    const el = e.target;
    const kind = el.dataset && el.dataset.input;
    if (!kind) return;
    if (kind === 'progress-search') {
      ui.progressSearch = el.value;
      const list = $('#progress-list');
      if (list) list.innerHTML = progressList();
      return;
    }
    if (!draft) return;
    if (kind === 'draft-name') draft.name = el.value;
    else if (kind === 'draft-notes') draft.notes = el.value;
    else if (kind === 'draft-date') draft.date = el.value || todayKey();
    else if (kind === 'set') {
      const row = el.closest('.set-row');
      const entry = findEntry(row.dataset.uid);
      const set = entry && entry.sets[Number(row.dataset.i)];
      if (set) set[el.dataset.field] = el.value;
    }
    saveDraft();
  });

  document.addEventListener('change', (e) => {
    const el = e.target;
    if (el.dataset && el.dataset.input === 'import') {
      importData(el.files && el.files[0]);
      el.value = '';
    } else if (el.dataset && el.dataset.input === 'draft-date') {
      render(true); // les « performances précédentes » dépendent de la date
    }
  });

  // Entrée = champ suivant pendant la saisie des séries
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !$('#modal-root').hidden) { closeModal(); return; }
    if (e.key !== 'Enter' || !e.target.classList.contains('set-input')) return;
    e.preventDefault();
    const inputs = [...document.querySelectorAll('.set-input')];
    const next = inputs[inputs.indexOf(e.target) + 1];
    if (next) next.focus();
    else e.target.blur();
  });

  // Synchronisation si l'app est ouverte dans deux onglets
  window.addEventListener('storage', (e) => {
    if (!e.key || !e.key.startsWith('progression.')) return;
    data = Store.load();
    draft = Store.loadDraft();
    reindex();
    if (!document.activeElement || !document.activeElement.matches('input, textarea')) render(true);
  });

  const onNavigate = () => { closeModal(); render(); };
  window.addEventListener('hashchange', onNavigate);
  window.addEventListener('popstate', onNavigate);

  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
  }

  render();
})();
