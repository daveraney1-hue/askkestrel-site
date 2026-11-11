/* Service area on the forms: one town, a region or province, or all of Canada.
   The town box changes its label to match, and is hidden for all of Canada. */
function kestrelArea(form) {
  var town = form.querySelector('[name="town"]');
  var radios = form.querySelectorAll('input[name="scope"]');
  if (!town || !radios.length) return function () { return 'local'; };
  var wrap = town.closest('label'), lab = wrap.querySelector('[data-area-label]');
  var TXT = { local: ['Town or city you serve', 'e.g. Orangeville', 'address-level2'], region: ['Region or province you serve', 'e.g. the GTA or Ontario', 'off'] };
  function scope() { var c = form.querySelector('input[name="scope"]:checked'); return c ? c.value : 'local'; }
  function sync() {
    var s = scope(), all = s === 'national';
    wrap.hidden = all; town.disabled = all;
    if (!all) { lab.textContent = TXT[s][0]; town.placeholder = TXT[s][1]; town.setAttribute('autocomplete', TXT[s][2]); }
  }
  radios.forEach(function (r) { r.addEventListener('change', sync); });
  form.addEventListener('reset', function () { setTimeout(sync, 0); });
  sync();
  return scope;
}
function kestrelAreaData(scope, data) {
  // All of Canada has no town box, so the area is sent as "Canada".
  data.set('scope', scope);
  if (scope === 'national') data.set('town', 'Canada');
}
var KESTREL_AREA_MSG = { local: 'Add the town or city you serve.', region: 'Add the region or province you serve.' };

/* Free check form: sends the request to Kestrel, where Dave approves it and the report is emailed. */
(function () {
  var ENDPOINT = 'https://automation.rootedai.ca/webhook/kestrel-check-request';
  var form = document.querySelector('form[data-check]');
  if (!form) return;
  var status = form.querySelector('.status');
  var btn = form.querySelector('button[type="submit"]');
  function say(msg, cls) { status.textContent = msg; status.className = 'status ' + (cls || ''); }
  var FAIL = 'That didn’t go through. Email info@askkestrel.ca and we’ll run your check from there.';
  var area = kestrelArea(form);
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var need = [['name', 'Add your name.'], ['business', 'Add your business name so we know who to check.'], ['town', KESTREL_AREA_MSG[area()] || ''], ['business_type', 'Add your type of business, like real estate agent or plumber.']];
    for (var i = 0; i < need.length; i++) {
      var f = form.querySelector('[name="' + need[i][0] + '"]');
      if (!f.disabled && !f.value.trim()) { say(need[i][1], 'err'); f.focus(); return; }
    }
    var email = form.querySelector('[name="email"]');
    if (!email.value.trim() || !email.checkValidity()) { say('Add an email address so we can send your report.', 'err'); email.focus(); return; }
    var data = new URLSearchParams();
    new FormData(form).forEach(function (v, k) { data.append(k, v); });
    if (!data.has('newsletter')) data.append('newsletter', 'no');
    kestrelAreaData(area(), data);
    btn.disabled = true; say('Sending...');
    fetch(ENDPOINT, { method: 'POST', body: data })
      .then(function (r) { return r.json().then(function (j) { return { okay: r.ok, j: j }; }); })
      .then(function (res) {
        if (res.okay && res.j && res.j.ok) { form.reset(); say('Request received. Your report will be in your inbox within a couple of hours, often sooner.', 'ok'); }
        else if (res.j && res.j.error) { say(res.j.error, 'err'); }
        else { say(FAIL, 'err'); }
      })
      .catch(function () { say(FAIL, 'err'); })
      .then(function () { btn.disabled = false; });
  });
})();

/* Plan sign-up pop-up: the "Start with..." buttons open it with that plan chosen. */
(function () {
  var ENDPOINT = 'https://automation.rootedai.ca/webhook/kestrel-signup';
  var dlg = document.getElementById('signup');
  // Without pop-up support the buttons fall back to their email links.
  if (!dlg || typeof dlg.showModal !== 'function') return;
  var form = dlg.querySelector('form[data-signup]');
  var done = dlg.querySelector('.signup-done');
  var status = form.querySelector('.status');
  var btn = form.querySelector('button[type="submit"]');
  function say(msg, cls) { status.textContent = msg; status.className = 'status ' + (cls || ''); }
  var FAIL = 'That didn’t go through. Please try again, or email info@askkestrel.ca and we’ll sign you up from there.';
  var area = kestrelArea(form);

  /* The same business types and towns as the pricing page, so a sign-up can
     hold its spot (business type + home area) as soon as the client is created. */
  var lists = null;
  function norm(v) { return String(v || '').toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, ' ').trim(); }
  function stem(v) { return norm(v).split(' ').map(function (w) { return w.replace(/(ies)$/, 'y').replace(/(ses|xes|ches|shes)$/, function (m) { return m.slice(0, -2); }).replace(/s$/, ''); }).join(' '); }
  function fill(id, values) {
    var dl = document.getElementById(id); if (!dl) return;
    var html = ''; values.forEach(function (v) { html += '<option value="' + v.replace(/"/g, '&quot;') + '">'; });
    dl.innerHTML = html;
  }
  function placeLabel(p) { return p[1] + ', ' + p[2]; }
  function syncPlaces() {
    if (!lists) return;
    if (area() === 'region') fill('k-places', Object.keys(lists.pt).map(function (k) { return lists.pt[k]; }).sort());
    else fill('k-places', lists.byPop.map(placeLabel));
  }
  function loadLists() {
    if (lists) return;
    lists = 'loading';
    Promise.all([
      fetch('/assets/map/business-types.json').then(function (r) { return r.json(); }),
      fetch('/assets/map/index.json').then(function (r) { return r.json(); })
    ]).then(function (res) {
      lists = { types: res[0], pt: res[1].pt, places: res[1].places };
      lists.byPop = lists.places.slice().sort(function (a, b) { return (b[4] || 0) - (a[4] || 0); });
      fill('k-types', lists.types.map(function (t) { return t.name; }));
      syncPlaces();
    }).catch(function () { lists = null; });
  }
  form.querySelectorAll('input[name="scope"]').forEach(function (r) { r.addEventListener('change', syncPlaces); });
  function matchType(v) {
    if (!lists || !lists.types) return null;
    var n = norm(v), s = stem(v); if (!n) return null;
    var hit = lists.types.find(function (t) { return norm(t.name) === n; }) ||
              lists.types.find(function (t) { return stem(t.name) === s; });
    if (hit) return hit;
    var starts = lists.types.filter(function (t) { return stem(t.name).indexOf(s + ' ') === 0; });
    return starts.length === 1 ? starts[0] : null;
  }
  function matchArea(scope, v) {
    if (!lists || !lists.places) return null;
    if (scope === 'national') return { id: 'CANADA', name: 'Canada-wide', pt: 'CA', tier: 'w' };
    var n = norm(v); if (!n) return null;
    if (scope === 'region') {
      var code = Object.keys(lists.pt).find(function (k) { return norm(lists.pt[k]) === n || norm(k) === n; });
      return code ? { id: 'PROV' + code, name: lists.pt[code] + '-wide', pt: code, tier: 'w' } : null;
    }
    var p = lists.byPop.find(function (x) { return norm(placeLabel(x)) === n; });
    if (!p) {
      // A bare town name only counts when it's unique (Richmond is in BC and Quebec).
      var same = lists.byPop.filter(function (x) { return norm(x[1]).replace(/ toronto$/, '') === n || norm(x[1]) === n; });
      if (same.length === 1) p = same[0];
    }
    return p ? { id: p[0], name: p[1], pt: p[2], tier: p[3] } : null;
  }

  function open(plan) {
    loadLists();
    form.hidden = false; done.hidden = true; say('');
    var radio = form.querySelector('input[name="plan"][value="' + plan + '"]');
    if (radio) radio.checked = true;
    dlg.showModal();
    form.querySelector('[name="name"]').focus();
  }
  document.querySelectorAll('[data-plan]').forEach(function (a) {
    a.addEventListener('click', function (e) { e.preventDefault(); open(a.getAttribute('data-plan')); });
  });
  dlg.querySelectorAll('[data-close]').forEach(function (b) { b.addEventListener('click', function () { dlg.close(); }); });
  // Click on the dark area around the pop-up closes it.
  dlg.addEventListener('click', function (e) {
    if (e.target !== dlg) return;
    var r = dlg.getBoundingClientRect();
    if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) dlg.close();
  });

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    if (!form.querySelector('input[name="plan"]:checked')) { say('Choose a plan.', 'err'); return; }
    var need = [['name', 'Add your name.'], ['business', 'Add your business name.'], ['town', KESTREL_AREA_MSG[area()] || '']];
    for (var i = 0; i < need.length; i++) {
      var f = form.querySelector('[name="' + need[i][0] + '"]');
      if (!f.disabled && !f.value.trim()) { say(need[i][1], 'err'); f.focus(); return; }
    }
    var email = form.querySelector('[name="email"]');
    if (!email.value.trim() || !email.checkValidity()) { say('Add an email address so we can reach you.', 'err'); email.focus(); return; }
    var data = new URLSearchParams();
    new FormData(form).forEach(function (v, k) { data.append(k, v); });
    if (!data.has('newsletter')) data.append('newsletter', 'no');
    var t = matchType(data.get('business_type'));
    if (t) data.set('spot_type', t.id);
    var a = matchArea(area(), data.get('town'));
    if (a) { data.set('area_id', a.id); data.set('area_name', a.name); data.set('area_province', a.pt); data.set('area_tier', a.tier); }
    kestrelAreaData(area(), data);
    btn.disabled = true; say('Sending...');
    fetch(ENDPOINT, { method: 'POST', body: data })
      .then(function (r) { return r.json().then(function (j) { return { okay: r.ok, j: j }; }); })
      .then(function (res) {
        if (res.okay && res.j && res.j.ok) {
          dlg.querySelector('[data-done-email]').textContent = email.value.trim();
          if (typeof gtag === 'function') gtag('event', 'sign_up', { method: data.get('plan') });
          form.reset(); form.hidden = true; done.hidden = false;
          done.querySelector('[data-close]').focus();
        } else if (res.j && res.j.error) { say(res.j.error, 'err'); }
        else { say(FAIL, 'err'); }
      })
      .catch(function () { say(FAIL, 'err'); })
      .then(function () { btn.disabled = false; });
  });
})();

/* Respect reduced-motion settings: show the still frame instead of the kestrel video. */
(function () {
  var v = document.querySelector('video.kvid');
  if (!v || !window.matchMedia) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { v.removeAttribute('autoplay'); v.pause(); }
})();
