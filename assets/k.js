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

/* Where a visitor came from: the utm_ tags on the link they arrived by (e.g. the postcard QR code,
   utm_source=postcard&utm_campaign=stat). Kept for 30 days in this browser, first visit wins,
   and sent with the free check request so Dave sees it in the Telegram approval. */
var kestrelSource = (function () {
  var KEY = 'kestrel_src', DAYS = 30;
  function read() {
    try {
      var s = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (s && Date.now() - s.t < DAYS * 864e5) return s;
    } catch (e) {}
    return null;
  }
  try {
    var p = new URLSearchParams(location.search), got = {};
    ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content'].forEach(function (k) {
      var v = p.get(k); if (v) got[k] = v.slice(0, 80);
    });
    if (got.utm_source && !read()) { got.t = Date.now(); localStorage.setItem(KEY, JSON.stringify(got)); }
  } catch (e) {}
  return function (data) {
    var s = read();
    if (!s) return;
    ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content'].forEach(function (k) { if (s[k]) data.set(k, s[k]); });
  };
})();

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
    kestrelSource(data);
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

/* Respect reduced-motion settings: show the still frame instead of the kestrel video. */
(function () {
  var v = document.querySelector('video.kvid');
  if (!v || !window.matchMedia) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { v.removeAttribute('autoplay'); v.pause(); }
})();
