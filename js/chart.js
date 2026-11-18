/*
 * Petits graphiques SVG sans dépendance (fonctionnent hors-ligne).
 *  - Chart.line(conteneur, points, options) : courbe de progression interactive
 *  - Chart.sparkline(valeurs) : mini-courbe statique (chaîne SVG)
 */
(function (root) {
  'use strict';

  const NS = 'http://www.w3.org/2000/svg';
  const DAY = 86400000;
  const active = new Set();

  function el(tag, attrs, parent) {
    const n = document.createElementNS(NS, tag);
    for (const k in attrs) n.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(n);
    return n;
  }

  function parseDate(key) {
    const [y, m, d] = key.split('-').map(Number);
    return new Date(y, m - 1, d);
  }

  /** Graduations « rondes » couvrant [min, max]. */
  function niceTicks(min, max, count) {
    if (min === max) {
      const pad = Math.abs(min) * 0.1 || 1;
      min -= pad;
      max += pad;
    }
    const raw = (max - min) / count;
    const mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const norm = raw / mag;
    const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10) * mag;
    const lo = Math.max(min >= 0 ? 0 : -Infinity, Math.floor(min / step) * step);
    const hi = Math.ceil(max / step) * step;
    const ticks = [];
    for (let v = lo; v <= hi + step / 2; v += step) ticks.push(Math.round(v * 1000) / 1000);
    return { lo, hi: Math.max(hi, lo + step), ticks };
  }

  const fmtDay = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' });
  const fmtMonth = new Intl.DateTimeFormat('fr-FR', { month: 'short', year: '2-digit' });
  const fmtLong = new Intl.DateTimeFormat('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });

  function line(container, points, opts) {
    const state = { container, points, opts: opts || {}, active: -1 };
    container._chart = state;
    active.add(state);
    draw(state);
    return state;
  }

  function draw(state) {
    const { container, points, opts } = state;
    container.textContent = '';
    container.classList.add('chart');
    const format = opts.format || ((v) => String(v));
    const W = Math.max(240, Math.round(container.clientWidth || 320));
    const H = opts.height || 220;
    const m = { t: 30, r: 14, b: 26, l: 44 };
    const innerW = W - m.l - m.r;
    const innerH = H - m.t - m.b;

    const xs = points.map((p) => parseDate(p.date).getTime());
    const ys = points.map((p) => p.value);
    let x0 = Math.min(...xs);
    let x1 = Math.max(...xs);
    if (x0 === x1) { x0 -= 3 * DAY; x1 += 3 * DAY; }
    const yMin = Math.min(...ys);
    const yMax = Math.max(...ys);
    const pad = (yMax - yMin) * 0.12 || yMax * 0.1 || 1;
    const { lo, hi, ticks } = niceTicks(Math.max(0, yMin - pad), yMax + pad, 4);

    const sx = (t) => m.l + ((t - x0) / (x1 - x0)) * innerW;
    const sy = (v) => m.t + (1 - (v - lo) / (hi - lo)) * innerH;
    const px = xs.map(sx);
    const py = ys.map(sy);

    const svg = el('svg', {
      viewBox: `0 0 ${W} ${H}`, width: W, height: H, class: 'chart-svg',
      role: 'img', tabindex: '0', 'aria-label': opts.label || 'Graphique de progression',
    });

    // Grille horizontale + graduations Y
    const grid = el('g', { class: 'chart-grid' }, svg);
    for (const t of ticks) {
      const y = sy(t);
      el('line', { x1: m.l, x2: W - m.r, y1: y, y2: y }, grid);
      const label = el('text', { x: m.l - 8, y: y + 4, 'text-anchor': 'end', class: 'chart-axis' }, grid);
      label.textContent = opts.tick ? opts.tick(t) : String(t);
    }

    // Graduations X : extrémités + jusqu'à 2 dates intermédiaires
    const spanDays = (x1 - x0) / DAY;
    const dateFmt = spanDays > 300 ? fmtMonth : fmtDay;
    const nX = Math.min(4, Math.max(2, Math.floor(innerW / 90)));
    const xTicks = [];
    if (points.length === 1) xTicks.push(xs[0]);
    else for (let i = 0; i < nX; i++) xTicks.push(x0 + ((x1 - x0) * i) / (nX - 1));
    xTicks.forEach((t, i) => {
      const anchor = points.length === 1 ? 'middle' : i === 0 ? 'start' : i === xTicks.length - 1 ? 'end' : 'middle';
      const label = el('text', { x: sx(t), y: H - 6, 'text-anchor': anchor, class: 'chart-axis' }, svg);
      label.textContent = dateFmt.format(new Date(t)).replace('.', '');
    });

    // Aire + courbe
    if (points.length > 1) {
      const d = px.map((x, i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${py[i].toFixed(1)}`).join('');
      const base = (m.t + innerH).toFixed(1);
      el('path', { d: `${d}L${px[px.length - 1].toFixed(1)},${base}L${px[0].toFixed(1)},${base}Z`, class: 'chart-area' }, svg);
      el('path', { d, class: 'chart-line' }, svg);
    }

    // Points (les petits jeux de données gardent tous leurs marqueurs)
    const showAll = points.length <= 24;
    points.forEach((p, i) => {
      if (!showAll && i !== points.length - 1) return;
      el('circle', { cx: px[i], cy: py[i], r: 4, class: 'chart-dot' }, svg);
    });

    // Étiquette de la dernière valeur
    const li = points.length - 1;
    const endLabel = el('text', {
      x: Math.min(px[li], W - m.r), y: py[li] - 12 < m.t - 8 ? py[li] + 22 : py[li] - 12,
      'text-anchor': points.length === 1 ? 'middle' : 'end', class: 'chart-end',
    }, svg);
    endLabel.textContent = format(ys[li]);

    // Calque d'interaction : réticule qui s'accroche au point le plus proche
    const cross = el('g', { class: 'chart-cross', visibility: 'hidden' }, svg);
    const vline = el('line', { y1: m.t - 6, y2: m.t + innerH }, cross);
    const ring = el('circle', { r: 6 }, cross);
    const hit = el('rect', { x: m.l - 10, y: 0, width: innerW + 20, height: H, fill: 'transparent', class: 'chart-hit' }, svg);

    const tip = document.createElement('div');
    tip.className = 'chart-tip';
    tip.hidden = true;
    const tipValue = document.createElement('strong');
    const tipDate = document.createElement('span');
    tip.append(tipValue, tipDate);

    function setActive(i) {
      state.active = i;
      if (i < 0) {
        cross.setAttribute('visibility', 'hidden');
        tip.hidden = true;
        endLabel.removeAttribute('visibility');
        return;
      }
      cross.setAttribute('visibility', 'visible');
      vline.setAttribute('x1', px[i]);
      vline.setAttribute('x2', px[i]);
      ring.setAttribute('cx', px[i]);
      ring.setAttribute('cy', py[i]);
      endLabel.setAttribute('visibility', 'hidden');
      tipValue.textContent = format(ys[i]);
      tipDate.textContent = fmtLong.format(new Date(xs[i]));
      tip.hidden = false;
      const scale = (container.clientWidth || W) / W;
      const half = tip.offsetWidth / 2;
      const left = Math.min(Math.max(px[i] * scale, half), (container.clientWidth || W) - half);
      tip.style.left = left + 'px';
    }

    function nearest(evt) {
      const rect = svg.getBoundingClientRect();
      const x = ((evt.clientX - rect.left) / rect.width) * W;
      let best = 0;
      for (let i = 1; i < px.length; i++) if (Math.abs(px[i] - x) < Math.abs(px[best] - x)) best = i;
      return best;
    }

    hit.addEventListener('pointermove', (e) => setActive(nearest(e)));
    hit.addEventListener('pointerdown', (e) => setActive(nearest(e)));
    hit.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') setActive(-1); });
    svg.addEventListener('focus', () => setActive(points.length - 1));
    svg.addEventListener('blur', () => setActive(-1));
    svg.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowLeft') { e.preventDefault(); setActive(Math.max(0, state.active - 1)); }
      if (e.key === 'ArrowRight') { e.preventDefault(); setActive(Math.min(points.length - 1, state.active + 1)); }
      if (e.key === 'Escape') setActive(-1);
    });

    container.append(svg, tip);
    if (state.active >= 0 && state.active < points.length) setActive(state.active);
  }

  let resizeTimer = null;
  root.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      for (const s of active) {
        if (!s.container.isConnected) active.delete(s);
        else draw(s);
      }
    }, 120);
  });

  function sparkline(values, w = 72, h = 28) {
    if (!values || values.length < 2) return `<svg class="spark" width="${w}" height="${h}" aria-hidden="true"></svg>`;
    const min = Math.min(...values);
    const max = Math.max(...values);
    const pad = 4;
    const x = (i) => pad + (i / (values.length - 1)) * (w - pad * 2);
    const y = (v) => (max === min ? h / 2 : pad + (1 - (v - min) / (max - min)) * (h - pad * 2));
    const pts = values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
    const li = values.length - 1;
    return `<svg class="spark" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" aria-hidden="true">` +
      `<polyline points="${pts}" class="spark-line"/>` +
      `<circle cx="${x(li).toFixed(1)}" cy="${y(values[li]).toFixed(1)}" r="3" class="spark-dot"/></svg>`;
  }

  root.Chart = { line, sparkline, niceTicks };
})(window);
