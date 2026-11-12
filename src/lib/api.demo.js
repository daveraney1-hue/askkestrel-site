// In-memory stand-in for api.js, used only by `npm run demo` to preview
// the portal without Supabase. Never included in the real build.
const ROLE = import.meta.env.VITE_DEMO_ROLE === 'admin' ? 'admin' : 'client';
const DEMO = '11111111-1111-4111-8111-111111111111';
const delay = (v) => new Promise((r) => setTimeout(() => r(structuredClone(v)), 120));
const now = () => new Date().toISOString();
let seq = 100;

const me = ROLE === 'admin'
  ? { id: 'u-admin', role: 'admin', full_name: 'Dave Raney', email: 'info@askkestrel.ca', client_id: null }
  : { id: 'u-client', role: 'client', full_name: 'Pat Morgan', email: 'pat@mapleridge.example', client_id: DEMO };

const db = {
  clients: [
    { id: DEMO, business_name: 'Maple Ridge Realty (demo)', package: 'fix_track', extra_questions: 1, town: 'Orangeville', subscription_status: 'active', started_on: '2026-05-14', other_names: 'Pat Morgan, Maple Ridge Team', contact_name: 'Pat Morgan', contact_email: 'pat@mapleridge.example' },
    { id: 'c2', business_name: 'Hillcrest Plumbing (demo)', package: 'track', town: 'Shelburne', subscription_status: 'active' },
    { id: 'c3', business_name: 'Mono Family Dental (demo)', package: 'grow', town: 'Mono', subscription_status: 'past_due' },
  ],
  profiles: [
    { id: 'u-client', role: 'client', full_name: 'Pat Morgan', email: 'pat@mapleridge.example', client_id: DEMO, last_login: '2026-10-20T14:12:00Z' },
    { id: 'u-new', role: 'client', full_name: null, email: 'office@hillcrest.example', client_id: null, last_login: null },
  ],
  types: {
    gbp_profile: { name: 'Google Business Profile fixes', guide_url: null, inc: ['fix_track', 'grow'] },
    website_details: { name: 'Business details on the website', guide_url: null, inc: ['fix_track', 'grow'] },
    website_content: { name: 'Website service or FAQ content', guide_url: null, inc: ['fix_track', 'grow'] },
    core_listings: { name: 'Core directory listings', guide_url: null, inc: ['fix_track', 'grow'] },
    industry_listings: { name: 'Extra industry listings', guide_url: '#guide', inc: ['grow'] },
    review_replies: { name: 'Reply to customer reviews', guide_url: '#guide', inc: [] },
    photos: { name: 'Add new photos', guide_url: '#guide', inc: [] },
  },
  reports: [
    ['2026-05-01', 2, 'Named in 2 of 36 answers. Profile categories and website details were missing.'],
    ['2026-06-01', 3, 'Named in 3 of 36 answers. Profile fixes went live mid-month.'],
    ['2026-07-01', 7, 'Named in 7 of 36 answers. First gains after the profile and website fixes.'],
    ['2026-08-01', 11, 'Named in 11 of 36 answers. New listings are being picked up.'],
    ['2026-09-01', 15, 'Named in 15 of 36 answers. Reviews now mentioned in answers.'],
    ['2026-10-01', 19, 'Named in 19 of 36 answers, up from 2 in May.'],
    ['2026-11-14', 22, 'Named in 22 of 36 answers, up from 19 last month. Yelp is now the site the AI cites most where you are missing.'],
  ].map(([d, n, s], i) => ({ id: `r${i + 1}`, client_id: DEMO, report_date: d, times_named: n, questions_asked: 36, summary: s, pdf_url: null, published_at: i < 6 ? d + 'T12:00:00Z' : null, sources: i === 5 ? { total: 14, answers: 36, list: [{ domain: 'realtor.ca', answers: 14, named_you: 5 }, { domain: 'rankmyagent.com', answers: 11, named_you: 1 }, { domain: 'mapleridgerealty.example', answers: 6, named_you: 6, own: true }, { domain: 'orangevillecitizen.ca', answers: 4, named_you: 2 }] } : null }))
    .concat([{ id: 'r-c2', client_id: 'c2', report_date: '2026-10-01', times_named: 4, questions_asked: 36, summary: '' }])
    // Extra area (migration 008): same questions, asked about Shelburne.
    .concat([
      ['2026-10-02', 3, 'Named in 3 of 9 answers about Shelburne. Not yet on the Shelburne directory pages the AI uses.', true],
      ['2026-11-15', 4, 'Named in 4 of 9 answers about Shelburne, up from 3 last month.', false],
    ].map(([d, n, s, pub], i) => ({ id: `ra${i + 1}`, client_id: DEMO, report_date: d, times_named: n, questions_asked: 9, summary: s, pdf_url: null,
      published_at: pub ? d + 'T12:00:00Z' : null, area_id: '3522021', area_name: 'Shelburne', sources: null }))),
  answers: [
    { id: 'a1', report_id: 'r6', question: 'Who is the best real estate agent in Orangeville?', ai_model: 'ChatGPT', client_named: true,
      answer_text: 'Several agents are well reviewed in Orangeville, including Maple Ridge Realty, known for first-time buyers, and Hilltop Homes Group.', businesses_named: ['Maple Ridge Realty', 'Hilltop Homes Group'] },
    { id: 'a2', report_id: 'r6', question: 'Who is the best real estate agent in Orangeville?', ai_model: 'Gemini', client_named: false,
      answer_text: 'Hilltop Homes Group and Credit Valley Realty are frequently recommended for Orangeville listings.', businesses_named: ['Hilltop Homes Group', 'Credit Valley Realty'] },
    { id: 'a3', report_id: 'r6', question: 'Which realtor should I use to sell a house in Orangeville?', ai_model: 'Perplexity', client_named: true,
      answer_text: 'Maple Ridge Realty has strong recent reviews for sellers and publishes local market updates.', businesses_named: ['Maple Ridge Realty'] },
  ],
  tasks: [
    ['t1', 'gbp_profile', 'Add service categories to Google Business Profile', 'Add "Real estate agent" and "Real estate consultant" as secondary categories.', 'done', '2026-05-14'],
    ['t2', 'website_details', 'Add business details markup to the website', 'Name, address, phone, service area and hours in a form AI tools can read.', 'done', '2026-05-22'],
    ['t3', 'core_listings', 'Claim Bing Places and Apple Business Connect', 'Copy the Google profile details exactly, including hours.', 'done', '2026-06-18'],
    ['t4', 'website_content', 'Publish a first-time buyer FAQ page', 'Answer the ten questions buyers ask most, in plain language.', 'in_progress', null, '2026-10-30'],
    ['t5', 'review_replies', 'Reply to your last 8 Google reviews', 'Short, personal replies that mention the neighbourhood or type of sale.', 'todo', null, '2026-11-07'],
    ['t6', 'photos', 'Add 5 recent photos to your Google profile', 'Team photo, office front, and three recent listings.', 'todo', null],
    ['t7', 'industry_listings', 'Complete your REALTOR.ca agent profile', 'Add specialties, service area and a link to your website.', 'todo', null],
  ].map(([id, type, title, details, status, completed, due]) => ({
    id, client_id: DEMO, task_type_id: type, title, details, status, due_date: due || null,
    completed_at: completed ? `${completed}T15:00:00Z` : null, owner_override: false, created_at: '2026-05-02T12:00:00Z',
  })),
  log: [],
};

const ownerFor = (t) => {
  const c = db.clients.find((x) => x.id === t.client_id);
  if (c.package === 'track') return 'client';
  return db.types[t.task_type_id]?.inc.includes(c.package) ? 'kestrel' : 'client';
};
db.tasks.forEach((t) => { t.owner = ownerFor(t); });
const label = { todo: 'To do', in_progress: 'In progress', done: 'Done' };
const addLog = (t, action, note, when = now(), who = me) => db.log.push({
  id: seq++, task_id: t.id, client_id: t.client_id, action, note: note || null, created_at: when,
  done_by_name: who.full_name, actor_role: who.role === 'admin' ? 'kestrel' : who.role === 'system' ? 'system' : 'client',
});
const SYSTEM = { full_name: 'Kestrel (automatic)', role: 'system' };
const DAVE = { full_name: 'Dave Raney', role: 'admin' };
db.tasks.forEach((t) => addLog(t, `Added, assigned to ${t.owner === 'kestrel' ? 'Kestrel' : 'the client'}`, null, t.created_at, SYSTEM));
addLog(db.tasks[0], 'Marked Done', 'Added two secondary categories and updated the description.', db.tasks[0].completed_at, DAVE);
addLog(db.tasks[1], 'Marked Done', 'Business details markup added to the home and contact pages.', db.tasks[1].completed_at, DAVE);
addLog(db.tasks[2], 'Marked Done', 'Both profiles verified and matched to Google.', db.tasks[2].completed_at, DAVE);
addLog(db.tasks[3], 'Marked In progress', 'Draft questions sent to Pat for review.', '2026-10-12T16:30:00Z', DAVE);
addLog(db.tasks[3], 'Note added', 'Looks good, can we add a question about closing costs?', '2026-10-14T13:05:00Z', { full_name: 'Pat Morgan', role: 'client' });
const withType = (t) => ({ ...t, task_types: { name: db.types[t.task_type_id]?.name, guide_url: db.types[t.task_type_id]?.guide_url } });

export const auth = {
  getSession: () => delay({ user: { id: me.id } }),
  onChange: () => () => {},
  signIn: () => delay(null),
  signOut: () => delay(null),
  sendReset: () => delay(null),
  updatePassword: () => delay(null),
  getProfile: () => delay(me),
};

export const getClient = (id) => delay(db.clients.find((c) => c.id === id));
export const listClients = () => delay(db.clients.map((c) => {
  const open = db.tasks.filter((t) => t.client_id === c.id && t.status !== 'done');
  const reps = db.reports.filter((r) => r.client_id === c.id && !r.area_id).sort((a, b) => b.report_date.localeCompare(a.report_date));
  return { ...c, openForKestrel: open.filter((t) => t.owner === 'kestrel').length, openForClient: open.filter((t) => t.owner === 'client').length, latest: reps[0] || null };
}));
export const createClientRecord = (v) => { const c = { id: `c${seq++}`, subscription_status: 'active', ...v }; db.clients.push(c); return delay(c); };
export const updateClient = (id, v) => {
  const c = db.clients.find((x) => x.id === id);
  const before = c.package;
  Object.assign(c, v);
  if (v.package && v.package !== before) {
    db.tasks.filter((t) => t.client_id === id && t.status !== 'done' && !t.owner_override).forEach((t) => {
      const o = ownerFor(t);
      if (o !== t.owner) { t.owner = o; addLog(t, `Reassigned to ${o === 'kestrel' ? 'Kestrel' : 'the client'}`, `Package changed from ${before} to ${v.package}`); }
    });
  }
  return delay(null);
};
const demoAreas = [];
export const getClientAreas = (id) => delay(demoAreas.filter((a) => a.client_id === id).sort((a, b) => (b.is_home - a.is_home) || a.area_name.localeCompare(b.area_name)));
export const addClientArea = (cid, a) => { demoAreas.push({ id: `a${seq++}`, client_id: cid, ...a }); return delay(null); };
export const removeClientArea = (id) => { const i = demoAreas.findIndex((a) => a.id === id); if (i >= 0) demoAreas.splice(i, 1); return delay(null); };
export const setHomeArea = (cid, areaId) => { demoAreas.filter((a) => a.client_id === cid).forEach((a) => { a.is_home = a.area_id === areaId; }); return delay(null); };
export const getClientUsers = (id) => delay(db.profiles.filter((p) => p.client_id === id));
export const listUnlinkedUsers = () => delay(db.profiles.filter((p) => !p.client_id));
export const addLogin = (cid, email, name) => {
  db.profiles.push({ id: 'u-' + Date.now(), role: 'client', full_name: name || null, email, client_id: cid, last_login: null });
  return delay('Login added. A welcome email with a set-password link went to ' + email + '.');
};
export const linkUser = (uid, cid) => { db.profiles.find((p) => p.id === uid).client_id = cid; return delay(null); };
const signups = [
  { id: 's1', received_at: '2026-10-22T23:41:00Z', plan: 'fix_track', name: 'Jordan Lee', business: 'Credit Valley Plumbing (demo)', email: 'jordan@cvplumbing.example', phone: '519-555-0142', town: 'Orangeville', business_type: 'Plumber', website: 'https://cvplumbing.example', notes: 'Best to call after 4pm. Main competitor is Hilltop Plumbing.', extra_questions: 2, newsletter_optin: true, status: 'new', client_id: null },
  { id: 's2', received_at: '2026-10-21T15:05:00Z', plan: 'track', name: 'Sam Patel', business: 'Mono Cafe (demo)', email: 'sam@monocafe.example', phone: '', town: 'Mono', business_type: 'Cafe', website: '', notes: '', newsletter_optin: false, status: 'client created', client_id: 'c2' },
];
export const listSignups = () => delay(signups.map((s) => {
  const c = s.client_id && db.clients.find((x) => x.id === s.client_id);
  return { ...s, clients: c ? { subscription_status: c.subscription_status } : null };
}));
export const createClientFromSignup = (id) => {
  const s = signups.find((x) => x.id === id);
  if (!s.client_id) {
    const c = { id: `c${seq++}`, business_name: s.business, package: s.plan, town: s.town, subscription_status: 'pending_payment', contact_name: s.name, contact_email: s.email, contact_phone: s.phone, website: s.website, extra_questions: s.extra_questions || 0 };
    db.clients.push(c); s.client_id = c.id; s.status = 'client created';
  }
  return delay(s.client_id);
};
export const declineSignup = (id) => { const s = signups.find((x) => x.id === id); if (!s.client_id) s.status = 'declined'; return delay(null); };

const freeChecks = [
  { id: 'f1', report_id: 'kdemo1', received_at: '2026-10-23T16:11:00Z', name: 'Alex Rivers', business: 'Rivers Realty (demo)', email: 'alex@rivers.example', phone: '', town: 'Caledon', business_type: 'Real estate', website: 'https://rivers.example', times_named: 0, questions_asked: 36, issues_total: 5, full_requested_at: null, full_sent_at: null },
  { id: 'f2', report_id: 'kdemo2', received_at: '2026-10-21T13:20:00Z', name: 'Pat Moore', business: 'Hilltop Plumbing (demo)', email: 'pat@hilltop.example', phone: '519-555-0199', town: 'Orangeville', business_type: 'Plumber', website: '', times_named: 6, questions_asked: 36, issues_total: 4, full_requested_at: '2026-10-21T15:00:00Z', full_sent_at: '2026-10-21T15:04:00Z' },
];
export const listFreeChecks = () => delay(freeChecks);
export const requestFullReport = (rid) => { const f = freeChecks.find((x) => x.report_id === rid); f.full_requested_at ||= now(); return delay(null); };
export const getReports =(id) => delay(db.reports.filter((r) => r.client_id === id && !r.area_id && (me.role === 'admin' || r.published_at)).sort((a, b) => a.report_date.localeCompare(b.report_date)));
export const getAreaReports = (id) => delay(db.reports.filter((r) => r.client_id === id && r.area_id && (me.role === 'admin' || r.published_at)).sort((a, b) => a.report_date.localeCompare(b.report_date)));
const DEMO_Q = ['Who is the best real estate agent in Orangeville?', 'Can you recommend a realtor in Orangeville, Ontario?', 'Which real estate agent in Orangeville has the best reviews?'];
if (!db.answers.some((a) => a.id === 'g1')) {
  let n = 0;
  for (const q of DEMO_Q) for (const m of ['ChatGPT', 'Gemini', 'Perplexity', 'Claude']) for (let k = 0; k < 3; k++) {
    const hit = (n * 7) % 5 < 3 && m !== 'Gemini';
    db.answers.push({ id: 'g' + (++n), report_id: 'r7', question: q, ai_model: m, client_named: hit,
      answer_text: '## Top agents in Orangeville\n\nHere are a few well-reviewed options:\n\n1. **Credit Valley Realty Team** – known for strong local knowledge [1].\n2. **Hilltop Homes Group** – many 5-star Google reviews [2].\n' + (hit ? '3. **Maple Ridge Realty** – often recommended for first-time buyers [3].\n' : '') + '\nIt is worth interviewing two or three agents before you choose.',
      businesses_named: ['Credit Valley Realty Team', 'Hilltop Homes Group'].concat(hit ? ['Maple Ridge Realty (demo)'] : []) });
  }
}
export const getReport = (id) => {
  const report = db.reports.find((r) => r.id === id);
  const previous = db.reports.filter((r) => r.client_id === report.client_id && (r.area_id || null) === (report.area_id || null) && r.report_date < report.report_date).sort((a, b) => b.report_date.localeCompare(a.report_date))[0] || null;
  return delay({ report, answers: db.answers.filter((a) => a.report_id === id), client: db.clients.find((c) => c.id === report.client_id),
    tasks: db.tasks.filter((t) => t.source_report_id === id), previous });
};
export const publishReport = (id) => { db.reports.find((r) => r.id === id).published_at = now(); return delay(null); };
export const getTasks = (id) => delay(db.tasks.filter((t) => t.client_id === id).map(withType));
// Demo steps: every item has a few; a client login only receives its own items' steps.
const DEMO_STEPS = ['Open the listing or page named in this item.', 'Make the change described above, using the details from your report.', 'Check it shows correctly, then mark the item done with a short note.'];
export const getTaskSteps = (id) => delay(db.tasks
  .filter((t) => t.client_id === id && (me.role === 'admin' || t.owner === 'client'))
  .map((t) => ({ task_id: t.id, steps: DEMO_STEPS })));
export const getTaskLog = (id) => delay(db.log.filter((l) => l.client_id === id).sort((a, b) => b.created_at.localeCompare(a.created_at)));
export const getKestrelQueue = () => delay(db.tasks.filter((t) => t.owner === 'kestrel' && t.status !== 'done')
  .map((t) => ({ ...withType(t), clients: db.clients.find((c) => c.id === t.client_id) })));
export const setTaskStatus = (id, status, note) => {
  const t = db.tasks.find((x) => x.id === id);
  if (me.role !== 'admin' && t.owner !== 'client') return Promise.reject(new Error('This item is assigned to Kestrel'));
  if (t.status !== status) {
    t.status = status;
    t.completed_at = status === 'done' ? now() : null;
    addLog(t, `Marked ${label[status]}`, note);
  }
  return delay(null);
};
export const addTaskNote = (id, note) => { addLog(db.tasks.find((x) => x.id === id), 'Note added', note); return delay(null); };
export const setTaskOwner = (id, owner, note) => {
  const t = db.tasks.find((x) => x.id === id);
  t.owner_override = !!owner;
  const o = owner || ownerFor(t);
  if (o !== t.owner) { t.owner = o; addLog(t, `Reassigned to ${o === 'kestrel' ? 'Kestrel' : 'the client'}`, note); }
  return delay(null);
};
export const setTaskDueDate = (id, d) => {
  const t = db.tasks.find((x) => x.id === id);
  t.due_date = d || null;
  addLog(t, `Due date set to ${d || 'none'}`);
  return delay(null);
};

// ---- tracked questions (demo) ----
// ?q=confirmed in the URL shows the confirmed state with a pending request.
const Q_STATE = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('q') === 'confirmed' ? 'confirmed' : 'awaiting_client';
db.clients[0].questions_status = Q_STATE;
db.clients[0].questions_confirmed_at = Q_STATE === 'confirmed' ? '2026-05-16T14:00:00Z' : null;
db.questions = DEMO_Q.map((q, i) => ({ id: 'q' + (i + 1), client_id: DEMO, position: i + 1, question: q, active: true, source: 'free_check', started_on: '2026-05-14' }));
db.qreq = Q_STATE === 'confirmed' ? [
  { id: 'qr1', client_id: DEMO, position: 2, current_question: DEMO_Q[1], proposed_question: 'Recommend a real estate agent to help me sell my house in Orangeville.', reason: 'Most of our business is now listings', status: 'pending', requested_by_name: 'Pat Morgan', created_at: '2026-10-26T15:00:00Z' },
  { id: 'qr0', client_id: DEMO, position: 3, current_question: DEMO_Q[2], proposed_question: 'Which agent in Orangeville is best for first-time buyers?', status: 'declined', decision_note: 'Too narrow to compare month to month', created_at: '2026-08-02T15:00:00Z', decided_at: '2026-08-03T12:00:00Z', requested_by_name: 'Pat Morgan' },
] : [];
export const getQuestions = (id) => delay(db.questions.filter((q) => q.client_id === id && q.active).sort((a, b) => a.position - b.position));
export const getQuestionRequests = (id) => delay(db.qreq.filter((r) => r.client_id === id).sort((a, b) => b.created_at.localeCompare(a.created_at)));
export const confirmQuestions = (id) => { const c = db.clients.find((x) => x.id === (id || me.client_id)); c.questions_status = 'confirmed'; c.questions_confirmed_at = now(); return delay(null); };
export const requestQuestionChange = (pos, text, reason, id) => {
  const cid = id || me.client_id;
  db.qreq.filter((r) => r.client_id === cid && r.position === pos && r.status === 'pending').forEach((r) => { r.status = 'withdrawn'; });
  const cur = db.questions.find((q) => q.client_id === cid && q.position === pos && q.active);
  db.qreq.push({ id: 'qr' + seq++, client_id: cid, position: pos, current_question: cur.question, proposed_question: text, reason, status: 'pending', requested_by_name: me.full_name, created_at: now() });
  return delay(null);
};
export const withdrawQuestionRequest = (rid) => { db.qreq.find((r) => r.id === rid).status = 'withdrawn'; return delay(null); };
const swapQ = (cid, pos, text, source) => {
  db.questions.filter((q) => q.client_id === cid && q.position === pos && q.active).forEach((q) => { q.active = false; });
  db.questions.push({ id: 'q' + seq++, client_id: cid, position: pos, question: text, active: true, source, started_on: now().slice(0, 10) });
};
export const replaceQuestion = (cid, pos, text) => { const c = db.clients.find((x) => x.id === cid); if (!activeQs(cid).some((q) => q.position === pos) && activeQs(cid).length >= INCLUDED(c.package) + (c.extra_questions || 0)) return Promise.reject(new Error('Their plan covers ' + (INCLUDED(c.package) + (c.extra_questions || 0)) + ' questions. Add a paid extra question first.')); swapQ(cid, pos, text, 'admin'); db.qreq.filter((r) => r.client_id === cid && r.position === pos && r.status === 'pending').forEach((r) => { r.status = 'replaced'; }); return delay(null); };
// Extra questions (demo): same rules as migration_011.
const INCLUDED = (pkg) => (pkg === 'grow' ? 10 : 3);
const MAX_EXTRA = (pkg) => (pkg === 'track' ? 3 : 30);
const activeQs = (cid) => db.questions.filter((q) => q.client_id === cid && q.active);
const nextPos = (cid) => Math.max(0, ...activeQs(cid).map((q) => q.position)) + 1;
export const requestQuestionAdd = (text, reason, paid, id) => {
  const cid = id || me.client_id;
  const c = db.clients.find((x) => x.id === cid);
  const adds = db.qreq.filter((r) => r.client_id === cid && r.kind === 'add' && r.status === 'pending');
  const extraNeeded = activeQs(cid).length + adds.length >= INCLUDED(c.package) + (c.extra_questions || 0);
  if (extraNeeded && (c.extra_questions || 0) + adds.filter((r) => r.adds_extra).length + 1 > MAX_EXTRA(c.package)) return Promise.reject(new Error('Track includes up to 6 questions. To track more, move to Fix & Track or Grow.'));
  if (extraNeeded && !paid) return Promise.reject(new Error('Adding this question adds $10 a month to your plan. Please tick the box to agree.'));
  db.qreq.push({ id: 'qr' + seq++, client_id: cid, kind: 'add', adds_extra: extraNeeded, position: Math.max(nextPos(cid), ...adds.map((r) => r.position + 1)), current_question: null, proposed_question: text, reason, status: 'pending', requested_by_name: me.full_name, created_at: now() });
  return delay(null);
};
export const removeQuestion = (cid, pos) => {
  if (activeQs(cid).length <= 3) return Promise.reject(new Error('Every client keeps at least three questions. Change this one instead.'));
  db.questions.filter((q) => q.client_id === cid && q.position === pos && q.active).forEach((q) => { q.active = false; });
  return delay(null);
};
export const setExtraQuestions = (cid, n) => {
  const c = db.clients.find((x) => x.id === cid);
  if (n > MAX_EXTRA(c.package)) return Promise.reject(new Error('Track includes up to 6 questions (3 extra).'));
  if (activeQs(cid).length > INCLUDED(c.package) + n) return Promise.reject(new Error(`They are tracking ${activeQs(cid).length} questions. Remove questions first, then lower the extras.`));
  c.extra_questions = n;
  return delay(null);
};
export const decideQuestionRequest = (rid, approve, note) => {
  const r = db.qreq.find((x) => x.id === rid);
  if (approve && r.kind === 'add') {
    const c = db.clients.find((x) => x.id === r.client_id);
    if (r.adds_extra) c.extra_questions = (c.extra_questions || 0) + 1;
    r.position = nextPos(r.client_id);
    swapQ(r.client_id, r.position, r.proposed_question, 'client_request'); r.final_question = r.proposed_question;
  } else if (approve) { swapQ(r.client_id, r.position, r.proposed_question, 'client_request'); r.final_question = r.proposed_question; }
  r.status = approve ? 'approved' : 'declined'; r.decision_note = note || null; r.decided_at = now();
  return delay({ status: r.status });
};
export const getAnswerSummaries = (ids) => {
  // Demo: invent a steady top competitor for months without stored answers.
  const out = db.answers.filter((a) => ids.includes(a.report_id)).map(({ report_id, client_named, businesses_named }) => ({ report_id, client_named, businesses_named }));
  for (const id of ids) {
    if (out.some((a) => a.report_id === id)) continue;
    const r = db.reports.find((x) => x.id === id);
    for (let i = 0; i < r.questions_asked; i++) {
      const names = [];
      if (i < r.times_named) names.push('Maple Ridge Realty (demo)');
      if (i % 36 < 20) names.push('Hilltop Homes Group');
      if (i % 3 === 0) names.push('Credit Valley Realty');
      out.push({ report_id: id, client_named: i < r.times_named, businesses_named: names });
    }
  }
  return delay(out);
};
