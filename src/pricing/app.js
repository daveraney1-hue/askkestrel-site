/* askkestrel.ca/pricing: the price map, and signing up from it.
   Build: cd to a folder with d3-selection d3-transition d3-zoom d3-geo topojson-client esbuild installed, then
   npx esbuild --bundle --minify --format=iife --target=es2019 --sourcefile=app.js --outfile=<repo>/assets/pricing.js < <repo>/src/pricing/app.js
   Someone signing up picks their business type (from the list), their home area on the map, and optionally
   nearby or other extra areas. The sign-up then carries the exact spot (type + areas) to the portal. */
import { select } from 'd3-selection';
import 'd3-transition';
import { zoom, zoomIdentity } from 'd3-zoom';
import { geoPath, geoConicConformal, geoBounds, geoCentroid, geoArea } from 'd3-geo';
import { feature, neighbors } from 'topojson-client';

const MAP = '/assets/map/';
const SPOTS_URL = 'https://automation.rootedai.ca/webhook/kestrel-spots';
const SIGNUP_URL = 'https://automation.rootedai.ca/webhook/kestrel-signup';
const SPOTS = 3;
const TRACK_PRICE = 49;
const TIERS = {
  s: { name: 'Small town', fix: 249, add: 125, cls: 't-s' },
  m: { name: 'Mid-size city', fix: 249, add: 175, cls: 't-m' },
  b: { name: 'Big city', fix: 399, add: 250, cls: 't-b' },
};
const ABBR = { NL: 'N.L.', PE: 'P.E.I.', NS: 'N.S.', NB: 'N.B.', QC: 'Que.', ON: 'Ont.', MB: 'Man.', SK: 'Sask.', AB: 'Alta.', BC: 'B.C.', YT: 'Y.T.', NT: 'N.W.T.', NU: 'Nvt.' };
const PROV_OF_CODE = { 10: 'NL', 11: 'PE', 12: 'NS', 13: 'NB', 24: 'QC', 35: 'ON', 46: 'MB', 47: 'SK', 48: 'AB', 59: 'BC', 60: 'YT', 61: 'NT', 62: 'NU' };
const PLANS = { track: 'Track', fix_track: 'Fix & Track', grow: 'Grow' };
const MAX_EXTRAS = 10;

const root = document.querySelector('[data-pricing-map]');
if (root) init(root);

// d3 draws polygons clockwise; some census shapes come the other way round.
function fixWinding(fc) {
  fc.features.forEach((f) => {
    if (geoArea(f) < 1) return;
    const g = f.geometry;
    (g.type === 'Polygon' ? [g.coordinates] : g.coordinates).forEach((poly) => poly.forEach((ring) => ring.reverse()));
  });
  return fc;
}
const fmt = (n) => (n == null ? '' : n.toLocaleString('en-CA'));
const money = (n) => '$' + fmt(n);
const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
function el(tag, attrs, text) {
  const e = document.createElement(tag);
  for (const k in attrs || {}) e.setAttribute(k, attrs[k]);
  if (text != null) e.textContent = text;
  return e;
}
async function getJSON(file) {
  const r = await fetch(MAP + file);
  if (!r.ok) throw new Error(file + ' ' + r.status);
  return r.json();
}
const provOf = (id) => (/^TOR/.test(id) ? 'ON' : PROV_OF_CODE[String(id).slice(0, 2)]);
const isWide = (a) => a && a.r === 'w';
// "North York (Toronto)" reads better as "North York, Toronto" in a town field.
const townName = (a) => String(a.n).replace(/ \(([^)]+)\)$/, ', $1');

function init(root) {
  const svgEl = root.querySelector('svg.map');
  const svg = select(svgEl);
  const W = 960, H = 640;
  svg.attr('viewBox', `0 0 ${W} ${H}`);
  const g = svg.append('g');
  const card = root.querySelector('.area-card');
  const crumb = root.querySelector('.map-crumb');
  const back = root.querySelector('[data-back]');
  const hint = root.querySelector('.map-hint');
  const btInput = root.querySelector('#bt-input');
  const btList = root.querySelector('#bt-list');
  const placeInput = root.querySelector('#place-input');
  const placeList = root.querySelector('#place-list');
  const tip = root.querySelector('.map-tip');
  const orderBox = document.querySelector('[data-order]');

  let provinces = null;          // FeatureCollection of provinces
  const provName = {};           // 'ON' -> 'Ontario'
  let places = null;             // search index
  let types = [];
  const typeById = {};
  let taken = null;              // null = loading, false = failed, else { area: { type: count } }
  let curProv = null;            // province shown on the map
  let sel = null;                // properties of the area shown in the card
  let btype = null;              // chosen business type id
  const provData = {};           // 'ON' -> { fc, byId, nb: { id: [neighbour props] } }
  let path = null;               // current geoPath

  const order = { plan: startPlan(), home: null, extras: [] };

  const zoomer = zoom().scaleExtent([1, 60]).on('zoom', (e) => g.attr('transform', e.transform));
  svg.call(zoomer).on('dblclick.zoom', null);

  const ready = Promise.all([getJSON('provinces.json'), getJSON('business-types.json')]).then(([topo, bt]) => {
    provinces = fixWinding(feature(topo, topo.objects[Object.keys(topo.objects)[0]]));
    provinces.features.forEach((f) => { provName[f.properties.id] = f.properties.n; });
    types = bt;
    types.forEach((t) => { typeById[t.id] = t; });
  });

  fetch(SPOTS_URL, { mode: 'cors' })
    .then((r) => { if (!r.ok) throw new Error('spots ' + r.status); return r.json(); })
    .then((j) => { if (!j || typeof j.taken !== 'object') throw new Error('spots format'); taken = j.taken; refresh(); })
    .catch(() => { taken = false; refresh(); });

  async function loadProv(code) {
    if (!provData[code]) {
      const topo = await getJSON(`m_${code}.json`);
      const obj = topo.objects[Object.keys(topo.objects)[0]];
      const fc = fixWinding(feature(topo, obj));
      const byId = {};
      fc.features.forEach((f) => { byId[f.properties.id] = f.properties; });
      const nbIdx = neighbors(obj.geometries);
      const nb = {};
      obj.geometries.forEach((geo, i) => {
        nb[geo.properties.id] = nbIdx[i].map((j) => obj.geometries[j].properties);
      });
      provData[code] = { fc, byId, nb };
    }
    return provData[code];
  }

  function projection(fc, prov) {
    if (!prov) {
      return geoConicConformal().parallels([49, 77]).rotate([96, 0]).fitExtent([[12, 12], [W - 12, H - 12]], fc);
    }
    const b = geoBounds(fc), c = geoCentroid(fc);
    const lo = Math.max(b[0][1], 42), hi = Math.min(b[1][1], 80);
    return geoConicConformal().parallels([lo + (hi - lo) / 6, hi - (hi - lo) / 6]).rotate([-c[0], 0]).fitExtent([[12, 12], [W - 12, H - 12]], fc);
  }

  function showCanada() {
    curProv = null; sel = null;
    svg.transition().duration(0).call(zoomer.transform, zoomIdentity);
    g.selectAll('*').remove();
    const p = geoPath(projection(provinces));
    g.append('g').attr('class', 'provs').selectAll('path').data(provinces.features).join('path')
      .attr('class', 'prov').attr('d', p).attr('role', 'button').attr('tabindex', 0)
      .attr('aria-label', (d) => `${d.properties.n}: show prices by area`)
      .on('click', (e, d) => showProv(d.properties.id))
      .on('keydown', (e, d) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); showProv(d.properties.id); } })
      .on('pointermove', (e, d) => showTip(e, d.properties.n))
      .on('pointerleave', hideTip);
    crumb.textContent = 'Canada';
    back.hidden = true;
    hint.textContent = 'Choose a province or territory, or search for your town.';
    renderCard();
  }

  async function showProv(code, areaId) {
    hideTip();
    hint.textContent = 'Loading…';
    const pd = await loadProv(code);
    curProv = code;
    svg.call(zoomer.transform, zoomIdentity);
    g.selectAll('*').remove();
    path = geoPath(projection(pd.fc, code));
    g.append('g').attr('class', 'areas').selectAll('path').data(pd.fc.features, (d) => d.properties.id).join('path')
      .attr('class', (d) => 'area ' + TIERS[d.properties.r].cls)
      .attr('d', path)
      .on('pointermove', (e, d) => showTip(e, `${d.properties.n} · ${TIERS[d.properties.r].name}`))
      .on('pointerleave', hideTip)
      .on('click', (e, d) => pick(d, false));
    crumb.textContent = provName[code];
    back.hidden = false;
    hint.textContent = window.matchMedia('(hover: hover)').matches
      ? 'Hover over an area to see its tier, click it for prices. Scroll or pinch to zoom.'
      : 'Tap an area for its prices. Pinch to zoom.';
    paint();
    if (areaId) {
      const f = pd.fc.features.find((x) => x.properties.id === areaId);
      if (f) pick(f, true);
    } else { sel = null; renderCard(); }
    history.replaceState(null, '', location.search + '#' + code + (areaId ? '/' + areaId : ''));
  }

  function pick(f, zoomTo) {
    sel = f.properties;
    paint();
    g.selectAll('path.area.on').raise();
    if (zoomTo) {
      const [[x0, y0], [x1, y1]] = path.bounds(f);
      const k = Math.max(1, Math.min(40, 0.18 / Math.max((x1 - x0) / W, (y1 - y0) / H)));
      const t = zoomIdentity.translate(W / 2, H / 2).scale(k).translate(-(x0 + x1) / 2, -(y0 + y1) / 2);
      svg.transition().duration(650).call(zoomer.transform, t);
    }
    history.replaceState(null, '', location.search + '#' + curProv + '/' + sel.id);
    renderCard();
  }

  // How many spot holders of the chosen type already cover this area (the area itself,
  // its whole province, or all of Canada).
  function used(id) {
    if (!taken || !btype) return 0;
    const t = taken[id];
    return (t && t[btype] ? t[btype] : 0) + ((taken.CANADA || {})[btype] || 0) + ((taken['PROV' + provOf(id)] || {})[btype] || 0);
  }
  const spotsLeft = (id) => Math.max(0, SPOTS - used(id));
  const holdsSpots = () => order.plan !== 'track';
  const isFull = (a) => !isWide(a) && taken && btype && spotsLeft(a.id) === 0;

  function paint() {
    const homeId = order.home && order.home.id;
    const extraIds = new Set(order.extras.map((x) => x.id));
    g.selectAll('path.area')
      .classed('full', (d) => isFull(d.properties))
      .classed('on', (d) => sel && d.properties.id === sel.id)
      .classed('home', (d) => d.properties.id === homeId)
      .classed('extra', (d) => extraIds.has(d.properties.id));
    g.selectAll('path.area.extra, path.area.home, path.area.on').raise();
  }

  function refresh() { paint(); renderCard(); renderOrder(); }

  function spotsLine(a, box) {
    if (!btype) { box.append(el('p', {}, 'Choose your business type above to see how many spots are open here.')); return; }
    if (taken === false) { box.append(el('p', {}, 'We couldn’t load open spots just now. Email us and we’ll check for you.')); return; }
    if (taken === null) { box.append(el('p', {}, 'Checking open spots…')); return; }
    const left = spotsLeft(a.id);
    const name = typeById[btype] ? typeById[btype].name : 'your business type';
    const dots = el('span', { class: 'dots', 'aria-hidden': 'true' });
    for (let i = 0; i < SPOTS; i++) dots.append(el('i', { class: i < left ? 'open' : '' }));
    const p = el('p');
    p.append(dots, document.createTextNode(' '), el('b', {}, left === 0 ? 'Full' : `${left} of ${SPOTS} spots open`),
      document.createTextNode(` for ${name.toLowerCase()} on Fix & Track and Grow.`));
    box.append(p);
    if (left === 0) box.append(el('p', { class: 'small' }, 'You can still start with Track, and we’ll let you know if a spot opens.'));
  }

  function renderCard() {
    card.innerHTML = '';
    if (!sel) {
      card.append(el('p', { class: 'ac-empty' }, curProv
        ? 'Choose an area on the map, or search for your town, to see its prices.'
        : 'Pick a province or territory on the map, or search for your town above.'));
      return;
    }
    const a = sel, t = TIERS[a.r];
    const head = el('div', { class: 'ac-head' });
    head.append(el('h3', {}, a.n), el('p', { class: 'ac-where' }, provName[curProv] || ''));
    card.append(head, el('p', { class: 'ac-tier ' + t.cls }, t.name),
      el('p', { class: 'ac-pop' }, a.a ? `Part of the City of ${a.a}, priced as a big city` : a.p != null ? `Population ${fmt(a.p)} (2021 census)` : ''));
    const dl = el('dl', { class: 'ac-prices' });
    const row = (dt, big, small) => {
      const d = el('div'); d.append(el('dt', {}, dt));
      const dd = el('dd'); dd.append(el('b', {}, big)); if (small) dd.append(el('span', {}, small));
      d.append(dd); dl.append(d);
    };
    row('Fix & Track', `$${t.fix} a month`, 'plus a one-time setup fee, quoted after we assess what you need');
    row('Grow', 'Custom quote', 'Built around your business.');
    row('As an extra area', `+$${t.add} a month`, `Add ${a.n} to a Fix & Track or Grow plan whose home area is somewhere else. It’s added on top of your plan price.`);
    row('Track', `$${TRACK_PRICE} a month`, 'No limit on Track clients in any area.');
    card.append(dl);
    const spots = el('div', { class: 'ac-spots' });
    spotsLine(a, spots);
    card.append(spots);

    // Signing up from the map: make this the home area, or add it as an extra area.
    const btns = el('div', { class: 'ac-btns' });
    const isHome = order.home && order.home.id === a.id;
    const isExtra = order.extras.some((x) => x.id === a.id);
    const button = (cls, text, fn, disabled) => {
      const b = el('button', { type: 'button', class: 'btn ' + cls }, text);
      if (disabled) b.disabled = true; else b.addEventListener('click', fn);
      btns.append(b);
    };
    if (isHome) {
      btns.append(el('p', { class: 'ac-mine' }, '✓ Your home area'));
    } else if (!order.home || isWide(order.home)) {
      button('go', `Choose ${a.n} as my home area`, () => setHome(a));
    } else if (!holdsSpots()) {
      button('go', `Make ${a.n} my home area instead`, () => setHome(a));
    } else if (isExtra) {
      btns.append(el('p', { class: 'ac-mine' }, '✓ Added as an extra area'));
      button('line', 'Remove it', () => toggleExtra(a, false));
    } else {
      if (isFull(a)) button('go', 'No spots left here', null, true);
      else button('go', `Add as an extra area (+$${t.add} a month)`, () => toggleExtra(a, true));
      button('line', 'Make it my home area instead', () => setHome(a));
    }
    card.append(btns);
    if (order.home) {
      const go = el('a', { class: 'ac-next', href: '#sign-up' }, 'Review your plan and sign up ↓');
      card.append(go);
    }
  }

  function areaOf(p) { return { id: p.id, n: p.n, pt: p.pt || provOf(p.id), r: p.r, a: p.a || null, p: p.p }; }

  async function setHome(p) {
    order.home = areaOf(p);
    order.extras = order.extras.filter((x) => x.id !== order.home.id);
    if (!isWide(order.home)) await loadProv(order.home.pt);
    refresh();
  }
  function toggleExtra(p, on) {
    order.extras = order.extras.filter((x) => x.id !== p.id);
    if (on) {
      if (order.extras.length >= MAX_EXTRAS) { alertOrder(`You can add up to ${MAX_EXTRAS} extra areas here. Tell us about more in the notes.`); return; }
      order.extras.push(areaOf(p));
    }
    refresh();
  }

  /* ---------- The sign-up panel under the map ---------- */
  function startPlan() {
    const q = new URLSearchParams(location.search).get('plan');
    return PLANS[q] ? q : 'fix_track';
  }
  function alertOrder(msg, ok) {
    const s = orderBox && orderBox.querySelector('.status');
    if (s) { s.textContent = msg || ''; s.className = 'status ' + (msg ? (ok ? 'ok' : 'err') : ''); }
  }

  function homePrice() {
    if (!order.home) return null;
    if (order.plan === 'track') return TRACK_PRICE;
    if (order.plan === 'grow' || isWide(order.home)) return null;
    return TIERS[order.home.r].fix;
  }
  const extrasCounted = () => (holdsSpots() && order.home && !isWide(order.home) ? order.extras : []);

  function renderOrder() {
    if (!orderBox) return;
    orderBox.querySelectorAll('input[name="order-plan"]').forEach((r) => { r.checked = r.value === order.plan; });
    const body = orderBox.querySelector('[data-order-body]');
    body.innerHTML = '';

    // 1. Business type
    const s1 = el('div', { class: 'ord-step' });
    s1.append(el('h4', {}, '1. Your type of business'));
    if (btype && typeById[btype]) s1.append(el('p', { class: 'ord-val' }, typeById[btype].name));
    else s1.append(el('p', { class: 'ord-need' }, 'Choose it in the “Your type of business” box above the map.'));
    body.append(s1);

    // 2. Home area
    const s2 = el('div', { class: 'ord-step' });
    s2.append(el('h4', {}, '2. Your home area'));
    if (order.home) {
      const h = order.home;
      const line = el('p', { class: 'ord-val' });
      line.append(document.createTextNode(isWide(h) ? h.n : `${h.n}, ${ABBR[h.pt] || h.pt}`));
      if (!isWide(h)) line.append(el('span', { class: 'ord-tier ' + TIERS[h.r].cls }, TIERS[h.r].name));
      s2.append(line);
      if (isWide(h)) s2.append(el('p', { class: 'ord-note' }, 'Province-wide and Canada-wide plans are quoted for your business, because you hold a spot in every area they cover.'));
      else if (holdsSpots() && isFull(h)) s2.append(el('p', { class: 'ord-warn' }, `${h.n} is full for your business type on Fix & Track and Grow. Choose Track, or another home area.`));
      const change = el('button', { type: 'button', class: 'linkish' }, 'Change');
      change.addEventListener('click', () => { order.home = null; order.extras = []; refresh(); placeInput.focus(); });
      s2.append(change);
    } else {
      s2.append(el('p', { class: 'ord-need' }, 'Find your town above, or click it on the map, then choose “Choose … as my home area”.'));
    }
    const wide = el('p', { class: 'ord-wide' });
    wide.append(document.createTextNode('Customers across a whole province or all of Canada? '));
    const sel2 = el('select', { 'aria-label': 'Cover a whole province or all of Canada' });
    sel2.append(el('option', { value: '' }, 'Choose…'), el('option', { value: 'CANADA' }, 'All of Canada'));
    Object.keys(provName).sort((x, y) => provName[x].localeCompare(provName[y])).forEach((c) => sel2.append(el('option', { value: c }, provName[c])));
    sel2.addEventListener('change', () => {
      const v = sel2.value; if (!v) return;
      order.home = v === 'CANADA' ? { id: 'CANADA', n: 'Canada-wide', pt: 'CA', r: 'w' } : { id: 'PROV' + v, n: provName[v] + '-wide', pt: v, r: 'w' };
      order.extras = [];
      refresh();
    });
    wide.append(sel2);
    s2.append(wide);
    body.append(s2);

    // 3. Extra areas (Fix & Track and Grow)
    if (order.home && !isWide(order.home)) {
      const s3 = el('div', { class: 'ord-step' });
      s3.append(el('h4', {}, '3. Extra areas (optional)'));
      if (!holdsSpots()) {
        s3.append(el('p', { class: 'ord-note' }, 'Track covers your home area. To track and work on more areas, choose Fix & Track or Grow.'));
      } else {
        s3.append(el('p', { class: 'ord-note' }, 'Want us to work on the towns around you too? Tick the areas next to yours, or click any other area on the map and choose “Add as an extra area”. Each one gets its own three questions every month.'));
        const pd = provData[order.home.pt];
        const near = pd && pd.nb[order.home.id] ? pd.nb[order.home.id].slice().sort((x, y) => (y.p || 0) - (x.p || 0)) : [];
        const chosen = new Set(order.extras.map((x) => x.id));
        const list = el('ul', { class: 'ord-near' });
        const shown = new Set();
        const addRow = (p, isNear) => {
          shown.add(p.id);
          const full = isFull(p);
          const li = el('li', { class: full ? 'is-full' : '' });
          const lab = el('label');
          const cb = el('input', { type: 'checkbox' });
          cb.checked = chosen.has(p.id);
          cb.disabled = full && !cb.checked;
          cb.addEventListener('change', () => toggleExtra(p, cb.checked));
          const t = TIERS[p.r];
          const txt = el('span', { class: 'ord-nm' }, p.n);
          const meta = el('small', {}, full ? 'Full' : `${t.name} · +$${t.add} a month` + (btype && taken ? ` · ${spotsLeft(p.id)} of ${SPOTS} open` : ''));
          lab.append(cb, txt, meta);
          if (!isNear) lab.append(el('em', {}, 'chosen on the map'));
          li.append(lab);
          list.append(li);
        };
        near.forEach((p) => addRow(p, true));
        order.extras.filter((x) => !shown.has(x.id)).forEach((x) => addRow(x, false));
        if (list.children.length) s3.append(list);
        else s3.append(el('p', { class: 'ord-note' }, 'No neighbouring areas found. Click any area on the map to add it.'));
      }
      body.append(s3);
    }

    // 4. Total
    const s4 = el('div', { class: 'ord-step ord-total' });
    s4.append(el('h4', {}, order.home && !isWide(order.home) ? '4. Your monthly price' : 'Your monthly price'));
    const lines = el('dl');
    const add = (k, v) => { const d = el('div'); d.append(el('dt', {}, k), el('dd', {}, v)); lines.append(d); };
    if (!order.home) {
      s4.append(el('p', { class: 'ord-note' }, 'Choose your home area to see your price.'));
    } else if (order.plan === 'track') {
      add('Track', `$${TRACK_PRICE} a month`);
      s4.append(lines);
    } else {
      const hp = homePrice();
      add(`${PLANS[order.plan]}, ${order.home.n}`, hp == null ? 'Custom quote' : `$${hp} a month`);
      let extra = 0;
      extrasCounted().forEach((x) => { extra += TIERS[x.r].add; add(`+ ${x.n}`, `$${TIERS[x.r].add} a month`); });
      if (hp != null) add('Total', `${money(hp + extra)} a month`);
      else if (extra) add('Extra areas', `+${money(extra)} a month on top of your quote`);
      s4.append(lines);
      if (order.plan === 'fix_track') s4.append(el('p', { class: 'ord-note' }, 'Plus a one-time setup fee, quoted once we’ve looked at what you need. Prices before tax.'));
      else s4.append(el('p', { class: 'ord-note' }, 'We’ll quote Grow after a short call about your business. Prices before tax.'));
    }
    body.append(s4);
  }

  function orderProblem() {
    if (!btype) return 'Choose your type of business in the box above the map.';
    if (!order.home) return 'Choose your home area on the map, or search for your town.';
    if (holdsSpots() && isFull(order.home)) return `${order.home.n} is full for your business type on ${PLANS[order.plan]}. Choose Track, or another home area.`;
    const fullExtra = extrasCounted().find((x) => isFull(x));
    if (fullExtra) return `${fullExtra.n} is full for your business type. Untick it to continue.`;
    return '';
  }

  function orderSummary() {
    const h = order.home;
    const where = isWide(h) ? h.n : `${h.n}, ${ABBR[h.pt] || h.pt}`;
    const ex = extrasCounted();
    let s = `${PLANS[order.plan]} for ${typeById[btype].name.toLowerCase()} in ${where}`;
    if (ex.length) s += `, plus ${ex.map((x) => x.n).join(', ')}`;
    const hp = homePrice();
    const total = hp == null ? null : hp + ex.reduce((n, x) => n + TIERS[x.r].add, 0);
    return s + (total == null ? ' (custom quote).' : `: ${money(total)} a month${order.plan === 'fix_track' ? ' plus setup' : ''}.`);
  }

  if (orderBox) {
    orderBox.querySelectorAll('input[name="order-plan"]').forEach((r) => r.addEventListener('change', () => { order.plan = r.value; alertOrder(''); refresh(); }));
    orderBox.querySelector('[data-order-next]').addEventListener('click', () => {
      const problem = orderProblem();
      if (problem) { alertOrder(problem); return; }
      alertOrder('');
      openDialog();
    });
  }

  /* ---------- The sign-up dialog: contact details only ---------- */
  const dlg = document.getElementById('signup');
  const form = dlg && dlg.querySelector('form[data-signup]');
  function openDialog() {
    if (!dlg) return;
    form.hidden = false;
    dlg.querySelector('.signup-done').hidden = true;
    dlg.querySelector('[data-order-sum]').textContent = orderSummary();
    say('');
    if (typeof dlg.showModal === 'function') dlg.showModal(); else dlg.setAttribute('open', '');
    form.querySelector('[name="name"]').focus();
  }
  function say(msg, cls) { const s = form.querySelector('.status'); s.textContent = msg; s.className = 'status ' + (cls || ''); }
  if (dlg) {
    dlg.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => dlg.close()));
    dlg.addEventListener('click', (e) => {
      if (e.target !== dlg) return;
      const r = dlg.getBoundingClientRect();
      if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) dlg.close();
    });
    const FAIL = 'That didn’t go through. Please try again, or email info@askkestrel.ca and we’ll sign you up from there.';
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const problem = orderProblem();
      if (problem) { say(problem, 'err'); return; }
      for (const [n, msg] of [['name', 'Add your name.'], ['business', 'Add your business name.']]) {
        const f = form.querySelector(`[name="${n}"]`);
        if (!f.value.trim()) { say(msg, 'err'); f.focus(); return; }
      }
      const email = form.querySelector('[name="email"]');
      if (!email.value.trim() || !email.checkValidity()) { say('Add an email address so we can reach you.', 'err'); email.focus(); return; }
      const data = new URLSearchParams();
      new FormData(form).forEach((v, k) => data.append(k, v));
      if (!data.has('newsletter')) data.append('newsletter', 'no');
      const h = order.home;
      const typeName = typeById[btype].name;
      data.set('plan', order.plan);
      data.set('spot_type', btype);
      if (!(data.get('business_type') || '').trim()) data.set('business_type', typeName);
      data.set('spot_name', typeName);
      data.set('scope', h.id === 'CANADA' ? 'national' : isWide(h) ? 'region' : 'local');
      data.set('town', h.id === 'CANADA' ? 'Canada' : isWide(h) ? provName[h.pt] : townName(h));
      data.set('area_id', h.id); data.set('area_name', h.n); data.set('area_province', h.pt); data.set('area_tier', h.r);
      data.set('extra_areas', JSON.stringify(extrasCounted().map((x) => ({ id: x.id, name: x.n, province: x.pt, tier: x.r }))));
      data.set('summary', orderSummary());
      const btn = form.querySelector('button[type="submit"]');
      btn.disabled = true; say('Sending...');
      fetch(SIGNUP_URL, { method: 'POST', body: data })
        .then((r) => r.json().then((j) => ({ okay: r.ok, j })))
        .then((res) => {
          if (res.okay && res.j && res.j.ok) {
            dlg.querySelector('[data-done-email]').textContent = email.value.trim();
            if (typeof gtag === 'function') gtag('event', 'sign_up', { method: order.plan });
            form.reset(); form.hidden = true; dlg.querySelector('.signup-done').hidden = false;
            dlg.querySelector('.signup-done [data-close]').focus();
          } else if (res.j && res.j.error) say(res.j.error, 'err');
          else say(FAIL, 'err');
        })
        .catch(() => say(FAIL, 'err'))
        .then(() => { btn.disabled = false; });
    });
  }

  /* ---------- Tooltip, combo boxes, start-up ---------- */
  function showTip(e, text) {
    if (e.pointerType === 'touch') return;
    const r = root.querySelector('.map-frame').getBoundingClientRect();
    tip.textContent = text; tip.hidden = false;
    let x = e.clientX - r.left + 14;
    const y = e.clientY - r.top + 14;
    if (x + tip.offsetWidth > r.width - 8) x = e.clientX - r.left - tip.offsetWidth - 14;
    tip.style.transform = `translate(${x}px, ${y}px)`;
  }
  function hideTip() { tip.hidden = true; }

  function combo(input, list, search, choose) {
    let items = [], active = -1;
    const close = () => { list.hidden = true; input.setAttribute('aria-expanded', 'false'); active = -1; input.removeAttribute('aria-activedescendant'); };
    const open = () => {
      items = search(input.value);
      list.innerHTML = '';
      let grp = null;
      items.forEach((it, i) => {
        if (it.group && it.group !== grp) { list.append(el('li', { class: 'grp', role: 'presentation' }, it.group)); grp = it.group; }
        const li = el('li', { role: 'option', id: input.id + '-o' + i, 'aria-selected': 'false' });
        li.append(el('span', {}, it.label));
        if (it.meta) li.append(el('small', {}, it.meta));
        li.addEventListener('pointerdown', (e) => { e.preventDefault(); pickItem(i); });
        list.append(li);
      });
      if (!items.length) list.append(el('li', { class: 'none', role: 'presentation' }, input.dataset.none || 'No matches'));
      list.hidden = false; input.setAttribute('aria-expanded', 'true');
    };
    const move = (d) => {
      if (!items.length) return;
      active = (active + d + items.length) % items.length;
      list.querySelectorAll('[role=option]').forEach((o, i) => o.setAttribute('aria-selected', i === active ? 'true' : 'false'));
      const o = list.querySelector('#' + input.id + '-o' + active);
      if (o) { o.scrollIntoView({ block: 'nearest' }); input.setAttribute('aria-activedescendant', o.id); }
    };
    const pickItem = (i) => { const it = items[i]; if (!it || it.loading) return; close(); choose(it); };
    input.addEventListener('input', open);
    input.addEventListener('focus', open);
    input.addEventListener('blur', () => setTimeout(close, 120));
    input.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') { e.preventDefault(); if (list.hidden) open(); move(1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); move(-1); }
      else if (e.key === 'Enter') { if (!list.hidden) { e.preventDefault(); pickItem(active >= 0 ? active : 0); } }
      else if (e.key === 'Escape') close();
    });
  }

  combo(btInput, btList, (q) => {
    const words = norm(q) ? norm(q).split(' ') : [];
    const same = btype && typeById[btype] && btInput.value === typeById[btype].name;
    let found = types;
    if (words.length && !same) {
      const byName = types.filter((t) => words.every((w) => norm(t.name).includes(w)));
      found = byName.length ? byName : types.filter((t) => words.every((w) => norm(t.name + ' ' + t.group).includes(w)));
    }
    return found.slice(0, 400).map((t) => ({ label: t.name, group: t.group, id: t.id }));
  }, (it) => {
    btype = it.id; btInput.value = it.label;
    refresh();
    try { localStorage.setItem('kestrel-bt', it.id); } catch (e) { /* private mode */ }
  });
  // Typing a type and leaving the box without choosing one clears the choice, so the
  // sign-up never carries a type the person didn't pick from the list.
  btInput.addEventListener('change', () => {
    if (btype && typeById[btype] && btInput.value !== typeById[btype].name) { btype = null; refresh(); }
  });

  async function loadPlaces() {
    if (!places) {
      places = (await getJSON('index.json')).places.map(([id, n, pt, r, p]) => ({ id, n, pt, r, p, k: norm(n) }));
    }
  }
  const warm = () => loadPlaces().then(() => {
    if (placeInput.value && document.activeElement === placeInput) placeInput.dispatchEvent(new Event('input'));
  }).catch(() => {});
  placeInput.addEventListener('focus', warm, { once: true });
  placeInput.addEventListener('pointerenter', warm, { once: true });
  combo(placeInput, placeList, (q) => {
    if (!places) return [{ label: 'Loading towns…', loading: true }];
    const n = norm(q);
    if (n.length < 2) return [];
    const starts = [], has = [];
    for (const p of places) { if (p.k.startsWith(n)) starts.push(p); else if (p.k.includes(n)) has.push(p); }
    const byPop = (a, b) => (b.p || 0) - (a.p || 0) || (b.r > a.r ? 1 : -1);
    return starts.sort(byPop).concat(has.sort(byPop)).slice(0, 10)
      .map((p) => ({ label: p.n, meta: `${ABBR[p.pt]} · ${TIERS[p.r].name}`, pl: p }));
  }, (it) => {
    placeInput.value = it.pl.n;
    showProv(it.pl.pt, it.pl.id).then(() => {
      if (window.matchMedia('(max-width: 960px)').matches) card.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });

  back.addEventListener('click', () => { history.replaceState(null, '', location.pathname + location.search); showCanada(); });

  ready.then(() => {
    try {
      const saved = localStorage.getItem('kestrel-bt');
      if (saved && typeById[saved]) { btype = saved; btInput.value = typeById[saved].name; }
    } catch (e) { /* private mode */ }
    renderOrder();
    const m = location.hash.match(/^#([A-Z]{2})(?:\/([A-Z0-9]+))?$/);
    if (m && provName[m[1]]) showProv(m[1], m[2]); else showCanada();
  }).catch(() => {
    hint.textContent = 'The map didn’t load. The prices are in the table above, or email info@askkestrel.ca.';
  });
}
