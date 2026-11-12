// All reads and writes the portal makes. Row-level security in Supabase
// decides what each signed-in person can see; this file never needs to
// filter for safety, only for the screen being shown.
import { supabase } from './supabase.js';

const check = ({ data, error }) => {
  if (error) throw new Error(error.message);
  return data;
};

// ---- auth -------------------------------------------------------------
export const auth = {
  async getSession() {
    return check(await supabase.auth.getSession()).session;
  },
  onChange(cb) {
    const { data } = supabase.auth.onAuthStateChange((event, session) => cb(event, session));
    return () => data.subscription.unsubscribe();
  },
  // Throws an Error whose `kind` is 'credentials', 'unconfirmed' or 'connection'.
  async signIn(email, password) {
    let res;
    try {
      res = await supabase.auth.signInWithPassword({ email, password });
    } catch (e) {
      throw Object.assign(new Error(e.message), { kind: 'connection' });
    }
    if (res.error) {
      const code = res.error.code || '';
      const status = res.error.status;
      const kind = code === 'invalid_credentials' ? 'credentials'
        : code === 'email_not_confirmed' ? 'unconfirmed'
        : status === 400 ? 'credentials'
        : 'connection';
      throw Object.assign(new Error(res.error.message), { kind });
    }
    await supabase.rpc('touch_last_login');
  },
  async signOut() {
    await supabase.auth.signOut();
  },
  async sendReset(email) {
    check(await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/update-password`,
    }));
  },
  async updatePassword(password) {
    check(await supabase.auth.updateUser({ password }));
  },
  async getProfile(userId) {
    return check(await supabase.from('profiles').select('*').eq('id', userId).single());
  },
};

// ---- clients ----------------------------------------------------------
export async function getClient(clientId) {
  return check(await supabase.from('clients').select('*').eq('id', clientId).single());
}

export async function listClients() {
  const clients = check(await supabase.from('clients').select('*').order('business_name'));
  const tasks = check(await supabase.from('tasks').select('client_id, owner, status'));
  const reports = check(await supabase.from('reports')
    .select('client_id, report_date, times_named, questions_asked')
    .is('area_id', null)
    .order('report_date', { ascending: false }));
  return clients.map((c) => {
    const mine = tasks.filter((t) => t.client_id === c.id && t.status !== 'done');
    return {
      ...c,
      openForKestrel: mine.filter((t) => t.owner === 'kestrel').length,
      openForClient: mine.filter((t) => t.owner === 'client').length,
      latest: reports.find((r) => r.client_id === c.id) || null,
    };
  });
}

export async function createClientRecord(values) {
  return check(await supabase.from('clients').insert(values).select().single());
}

export async function updateClient(clientId, values) {
  check(await supabase.from('clients').update(values).eq('id', clientId));
}

// ---- areas and spots (migration 007) ------------------------------------
export async function getClientAreas(clientId) {
  return check(await supabase.from('client_areas').select('*').eq('client_id', clientId)
    .order('is_home', { ascending: false }).order('area_name'));
}

export async function addClientArea(clientId, area) {
  check(await supabase.from('client_areas').insert({ client_id: clientId, ...area }));
}

export async function removeClientArea(id) {
  check(await supabase.from('client_areas').delete().eq('id', id));
}

export async function setHomeArea(clientId, areaId) {
  check(await supabase.rpc('set_home_area', { p_client: clientId, p_area: areaId }));
}

export async function getClientUsers(clientId) {
  return check(await supabase.from('profiles').select('*').eq('client_id', clientId));
}

export async function listUnlinkedUsers() {
  return check(await supabase.from('profiles').select('*').is('client_id', null).eq('role', 'client'));
}

export async function linkUser(userId, clientId) {
  check(await supabase.rpc('link_user_to_client', { p_user: userId, p_client: clientId }));
}

// Creates a login for someone at a client and emails them a set-password
// link. Runs in n8n (Kestrel – Add Client Login), which checks the caller is
// an admin using their sign-in token.
const ADD_LOGIN_URL = 'https://automation.rootedai.ca/webhook/kestrel-add-login';
export async function addLogin(clientId, email, name) {
  const session = check(await supabase.auth.getSession()).session;
  if (!session) throw new Error('Please sign in again.');
  let res;
  try {
    res = await fetch(ADD_LOGIN_URL, { method: 'POST', body: new URLSearchParams({ access_token: session.access_token, client_id: clientId, email, name }) });
  } catch (e) {
    throw new Error("Couldn't reach the server. Please try again.");
  }
  let j = {};
  try { j = await res.json(); } catch (e) { /* keep empty */ }
  if (!res.ok || !j.ok) throw new Error(j.error || 'Something went wrong. Please try again.');
  return j.message || 'Login added.';
}

// ---- sign-ups (admin) ---------------------------------------------------
export async function listSignups() {
  // Include the linked client's subscription status so the page can keep a sign-up
  // under "New" until that client is active.
  return check(await supabase.from('signups').select('*, clients(subscription_status)').order('received_at', { ascending: false }));
}

export async function createClientFromSignup(signupId) {
  return check(await supabase.rpc('create_client_from_signup', { p_signup: signupId }));
}

export async function declineSignup(signupId) {
  check(await supabase.rpc('decline_signup', { p_signup: signupId }));
}

// ---- free checks (admin) ---------------------------------------------
export async function listFreeChecks() {
  return check(await supabase.from('free_checks').select('*').order('received_at', { ascending: false }));
}

export async function requestFullReport(reportId) {
  check(await supabase.rpc('request_full_report', { p_report_id: reportId }));
}

// ---- reports ----------------------------------------------------------
// Home-area reports (the main trend). Extra areas' reports come from getAreaReports.
export async function getReports(clientId) {
  return check(await supabase.from('reports').select('*')
    .eq('client_id', clientId).is('area_id', null).order('report_date', { ascending: true }));
}

export async function getAreaReports(clientId) {
  return check(await supabase.from('reports').select('*')
    .eq('client_id', clientId).not('area_id', 'is', null).order('report_date', { ascending: true }));
}

export async function getReport(reportId) {
  const report = check(await supabase.from('reports').select('*').eq('id', reportId).single());
  const [answers, client, tasks, earlier] = await Promise.all([
    supabase.from('answers').select('*').eq('report_id', reportId).order('question').then(check),
    supabase.from('clients').select('id, business_name, other_names').eq('id', report.client_id).single().then(check),
    supabase.from('tasks').select('id, title, owner, status').eq('source_report_id', reportId).order('created_at').then(check),
    (report.area_id
      ? supabase.from('reports').select('report_date, times_named, questions_asked').eq('area_id', report.area_id)
      : supabase.from('reports').select('report_date, times_named, questions_asked').is('area_id', null))
      .eq('client_id', report.client_id).lt('report_date', report.report_date)
      .order('report_date', { ascending: false }).limit(1).then(check),
  ]);
  return { report, answers, client, tasks, previous: earlier[0] || null };
}

export async function publishReport(reportId) {
  check(await supabase.rpc('publish_report', { p_report: reportId }));
}

// ---- tasks ------------------------------------------------------------
export async function getTasks(clientId) {
  return check(await supabase.from('tasks')
    .select('*, task_types(name, guide_url)')
    .eq('client_id', clientId).order('created_at', { ascending: true }));
}

// Numbered steps for each to-do. Admins get every item's steps; a client login
// only gets steps for items assigned to the client (the database enforces this).
// Returns [] if the steps table isn't there yet, so the page still loads.
export async function getTaskSteps(clientId) {
  const { data, error } = await supabase.from('task_steps').select('task_id, steps').eq('client_id', clientId);
  return error ? [] : data;
}

export async function getTaskLog(clientId) {
  return check(await supabase.from('task_log').select('*')
    .eq('client_id', clientId).order('created_at', { ascending: false }));
}

export async function getKestrelQueue() {
  return check(await supabase.from('tasks')
    .select('*, clients(business_name, package), task_types(name, guide_url)')
    .eq('owner', 'kestrel').neq('status', 'done')
    .order('due_date', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: true }));
}

export async function setTaskStatus(taskId, status, note) {
  check(await supabase.rpc('set_task_status', { p_task: taskId, p_status: status, p_note: note || null }));
}

export async function addTaskNote(taskId, note) {
  check(await supabase.rpc('add_task_note', { p_task: taskId, p_note: note }));
}

export async function setTaskOwner(taskId, owner, note) {
  check(await supabase.rpc('set_task_owner', { p_task: taskId, p_owner: owner, p_note: note || null }));
}

export async function setTaskDueDate(taskId, dueDate) {
  check(await supabase.from('tasks').update({ due_date: dueDate || null }).eq('id', taskId));
}

// ---- tracked questions -------------------------------------------------
// The customer questions each monthly check asks. Changes go through
// functions in Supabase (migration_006) so the history is kept.
export async function getQuestions(clientId) {
  return check(await supabase.from('client_questions').select('*')
    .eq('client_id', clientId).eq('active', true).order('position'));
}

export async function getQuestionRequests(clientId) {
  return check(await supabase.from('question_requests').select('*')
    .eq('client_id', clientId).order('created_at', { ascending: false }).limit(20));
}

export async function confirmQuestions(clientId) {
  check(await supabase.rpc('confirm_questions', { p_client: clientId || null }));
}

export async function requestQuestionChange(position, question, reason, clientId) {
  return check(await supabase.rpc('request_question_change', {
    p_position: position, p_question: question, p_reason: reason || null, p_client: clientId || null,
  }));
}

// Ask to track one more question (migration_011). Fills a free slot if the
// plan has one; otherwise paid must be true (adds $10 a month).
export async function requestQuestionAdd(question, reason, paid, clientId) {
  return check(await supabase.rpc('request_question_add', {
    p_question: question, p_reason: reason || null, p_paid: !!paid, p_client: clientId || null,
  }));
}

export async function withdrawQuestionRequest(requestId) {
  check(await supabase.rpc('withdraw_question_request', { p_request: requestId }));
}

// Admin only
export async function replaceQuestion(clientId, position, question) {
  check(await supabase.rpc('replace_client_question', { p_client: clientId, p_position: position, p_question: question }));
}

export async function removeQuestion(clientId, position) {
  check(await supabase.rpc('remove_client_question', { p_client: clientId, p_position: position }));
}

export async function setExtraQuestions(clientId, count) {
  check(await supabase.rpc('set_extra_questions', { p_client: clientId, p_count: count }));
}

export async function decideQuestionRequest(requestId, approve, note) {
  return check(await supabase.rpc('decide_question_request', { p_request: requestId, p_approve: approve, p_note: note || null }));
}

// Who was named in each answer, for every report this person can see.
// Used for the overview chart (you vs the top competitor) and "Who AI names most".
export async function getAnswerSummaries(reportIds) {
  if (!reportIds.length) return [];
  return check(await supabase.from('answers').select('report_id, client_named, businesses_named').in('report_id', reportIds));
}
