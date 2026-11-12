import { useState } from 'react';
import * as api from '../lib/api.js';
import { shortDate } from '../lib/format.js';

const KEEP_THEM = (
  <>
    <strong>We recommend keeping your questions the same.</strong> Asking the same questions every month is what
    lets you see real progress. If a question changes, its results start fresh and can't be compared with earlier
    months. Change a question only if it no longer fits your business, for example if you've stopped offering a service.
  </>
);

const FAIR = 'Write it the way a customer would ask an AI assistant when looking for a business like yours, not with your own selling points. That keeps the results fair.';

// Questions included in each plan, and the most extras a plan can have
// (migration_011). Extra questions are $10 a month each.
const INCLUDED = { track: 3, fix_track: 3, grow: 10 };
const MAX_EXTRA = { track: 3, fix_track: 30, grow: 30 };
const EXTRA_PRICE = 10;
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

const SOURCE_NAMES = { free_check: 'your free check', website: 'your website', standard: 'your type of business', client_request: 'your request', admin: 'Kestrel' };

// The customer questions the monthly check asks. Clients confirm them and
// can ask for a change (Dave approves); admins can edit them directly.
export default function QuestionsCard({ client, questions, requests = [], admin = false, onChanged }) {
  const [editing, setEditing] = useState(null);   // position being changed
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [adding, setAdding] = useState(false);

  // Migration not run yet, or the table couldn't load: show nothing rather than break the page.
  if (questions === null) return null;

  const status = client.questions_status || 'none';
  const awaiting = status === 'awaiting_client';
  const pending = requests.filter((r) => r.status === 'pending');
  const pendingAdds = pending.filter((r) => r.kind === 'add').sort((a, b) => a.position - b.position);
  const pendingFor = (pos) => pending.find((r) => r.position === pos && r.kind !== 'add');
  const recent = requests.filter((r) => ['approved', 'declined'].includes(r.status)).slice(0, 3);
  const included = INCLUDED[client.package] ?? 3;
  const extras = client.extra_questions || 0;
  const limit = included + extras;
  const freeSlots = Math.max(0, limit - questions.length - pendingAdds.length);
  const paidPending = pendingAdds.filter((r) => r.adds_extra).length;
  const canBuy = extras + paidPending < (MAX_EXTRA[client.package] ?? 3);
  const nextPos = Math.max(0, ...questions.map((q) => q.position)) + 1;
  const you = admin ? 'they' : 'you';

  const run = async (fn, okText) => {
    setBusy(true); setMsg(null);
    try {
      await fn();
      if (okText) setMsg({ ok: true, text: okText });
      setEditing(null);
      await onChanged();
      window.dispatchEvent(new Event('kestrel:client-changed'));
    } catch (e) {
      setMsg({ ok: false, text: e.message });
    } finally {
      setBusy(false);
    }
  };

  if (questions.length === 0) {
    if (!admin && client.subscription_status !== 'active') return null;
    return (
      <section className="card" id="questions">
        <h2>{admin ? 'Tracked questions' : 'Your questions'}</h2>
        <p className="muted empty-line">
          {admin
            ? 'None yet. Suggested questions are added automatically within 15 minutes of the client being marked Active.'
            : "We're preparing the customer questions we'll track for you each month. They'll appear here shortly for you to confirm."}
        </p>
      </section>
    );
  }

  return (
    <section className={`card questions-card${awaiting && !admin ? ' needs-action' : ''}`} id="questions" style={{ scrollMarginTop: '1rem' }}>
      <div className="questions-head">
        <div>
          {awaiting && !admin && <p className="eyebrow">Action needed</p>}
          <h2>{admin ? 'Tracked questions' : awaiting ? 'Confirm your questions' : 'Your questions'}</h2>
        </div>
        <span className={`pill ${status === 'confirmed' ? 'pill-good' : 'pill-pending'}`}>
          {status === 'confirmed' ? `Confirmed${client.questions_confirmed_at ? ' ' + shortDate(client.questions_confirmed_at) : ''}` : admin ? 'Waiting for the client to confirm' : 'Not confirmed yet'}
        </span>
      </div>

      <p className="questions-intro">
        {awaiting
          ? `Each month we ask AI assistants these questions, the way ${admin ? 'their' : 'your'} customers would, and count how often ${you}'re named. We suggested them based on ${SOURCE_NAMES[questions[0].source] || 'your business'}. ${admin ? 'They can' : 'You can'} confirm them as they are, or suggest a change to any of them before tracking starts.`
          : `Each month we ask AI assistants these questions, the way ${admin ? 'their' : 'your'} customers would, and count how often ${you}'re named.`}
      </p>

      <ol className="question-list">
        {questions.map((q) => {
          const req = pendingFor(q.position);
          return (
            <li key={q.id}>
              <div className="question-row">
                <span className="question-text">{q.question}</span>
                {editing !== q.position && (
                  <span className="row">
                    <button className="link small" onClick={() => { setEditing(q.position); setMsg(null); }} disabled={busy}>
                      {admin ? 'Edit' : req ? 'Change your suggestion' : awaiting ? 'Suggest a change' : 'Request a change'}
                    </button>
                    {admin && questions.length > 3 && (
                      <button className="link small" disabled={busy} onClick={() => {
                        if (!window.confirm(`Stop asking question ${q.position}? Its history is kept.${extras ? ' If it was a paid extra, lower their extra questions below too.' : ''}`)) return;
                        run(() => api.removeQuestion(client.id, q.position), 'Question removed. It is no longer asked from their next report.');
                      }}>Remove</button>
                    )}
                  </span>
                )}
              </div>
              {(admin || !awaiting) && <p className="hint">
                {admin && <>From {SOURCE_NAMES[q.source] || q.source}{awaiting ? '' : ' · '}</>}{awaiting ? '' : `Asked since ${shortDate(q.started_on)}`}
              </p>}
              {req && (
                <div className="request-box">
                  <p><span className="pill pill-pending">Change requested</span> {admin ? `${req.requested_by_name || 'The client'} asked for:` : 'You asked for:'} “{req.proposed_question}”</p>
                  {req.reason && <p className="muted small">Why: {req.reason}</p>}
                  {admin ? (
                    <div className="row">
                      <button className="btn small primary" disabled={busy} onClick={() => run(() => api.decideQuestionRequest(req.id, true), 'Approved. The new question is used from their next report.')}>Approve</button>
                      <button className="btn small" disabled={busy} onClick={() => {
                        const note = window.prompt('Keep the current question. Optional note for the client (included in their email):', '');
                        if (note === null) return;
                        run(() => api.decideQuestionRequest(req.id, false, note), 'Kept the current question.');
                      }}>Keep current</button>
                      <span className="hint">Deciding here doesn't email the client (deciding on Telegram does). For different wording, use Edit.</span>
                    </div>
                  ) : (
                    <p className="muted small">Waiting for Kestrel to review it. We'll email you once it's decided. <button className="link small" disabled={busy} onClick={() => run(() => api.withdrawQuestionRequest(req.id), 'Request withdrawn.')}>Withdraw</button></p>
                  )}
                </div>
              )}
              {editing === q.position && (
                <ChangeForm
                  admin={admin}
                  awaiting={awaiting}
                  current={q.question}
                  start={admin ? q.question : req ? req.proposed_question : ''}
                  busy={busy}
                  onCancel={() => setEditing(null)}
                  onSubmit={(text, reason) => admin
                    ? run(() => api.replaceQuestion(client.id, q.position, text), 'Question changed. It is used from their next report.')
                    : run(() => api.requestQuestionChange(q.position, text, reason), "Thanks. We'll review your change and email you once it's decided.")}
                />
              )}
            </li>
          );
        })}
      </ol>

      {pendingAdds.length > 0 && (
        <div className="request-list">
          {pendingAdds.map((r) => (
            <div key={r.id} className="request-box">
              <p><span className="pill pill-pending">{admin ? 'Asked to add' : 'Waiting to be added'}</span> “{r.proposed_question}”</p>
              {r.reason && <p className="muted small">Why: {r.reason}</p>}
              {r.adds_extra && <p className="muted small">{admin ? `A new extra question: adds $${EXTRA_PRICE} a month. Approving raises their paid extras by one; update their billing.` : `Adds $${EXTRA_PRICE} a month to your plan once it's approved.`}</p>}
              {admin ? (
                <div className="row">
                  <button className="btn small primary" disabled={busy} onClick={() => run(() => api.decideQuestionRequest(r.id, true), 'Added. It is asked from their next report.')}>Approve</button>
                  <button className="btn small" disabled={busy} onClick={() => {
                    const note = window.prompt('Don’t add it. Optional note for the client:', '');
                    if (note === null) return;
                    run(() => api.decideQuestionRequest(r.id, false, note), 'Not added.');
                  }}>Don’t add</button>
                  <span className="hint">Deciding here doesn't email the client (deciding on Telegram does).</span>
                </div>
              ) : (
                <p className="muted small">Waiting for Kestrel to review it. We'll email you once it's decided. <button className="link small" disabled={busy} onClick={() => run(() => api.withdrawQuestionRequest(r.id), 'Request withdrawn.')}>Withdraw</button></p>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="question-slots">
        <p className="hint">
          {admin ? 'Their plan' : 'Your plan'} covers {plural(limit, 'question', 'questions')}: {included} included{extras ? `, plus ${plural(extras, 'extra question', 'extra questions')} at $${EXTRA_PRICE} a month${extras > 1 ? ' each' : ''}` : ''}.
          {freeSlots > 0 && <> <strong>{plural(freeSlots, 'question is', 'questions are')} still to choose.</strong></>}
        </p>
        {!adding && editing === null && (admin ? freeSlots > 0 : (freeSlots > 0 || canBuy)) && (
          <button className="btn small" disabled={busy} onClick={() => { setAdding(true); setMsg(null); }}>
            {freeSlots > 0 ? 'Add a question' : `Track another question, $${EXTRA_PRICE} a month`}
          </button>
        )}
        {!admin && !adding && freeSlots === 0 && !canBuy && (
          <p className="hint">Track includes up to 6 questions. To track more, move to Fix &amp; Track or Grow: email <a href="mailto:info@askkestrel.ca">info@askkestrel.ca</a>.</p>
        )}
        {adding && (
          <AddForm
            admin={admin}
            paid={!admin && freeSlots === 0}
            homeOnly={client.package !== 'track'}
            busy={busy}
            onCancel={() => setAdding(false)}
            onSubmit={(text, reason, agreed) => admin
              ? run(async () => { await api.replaceQuestion(client.id, nextPos, text); setAdding(false); }, 'Question added. It is asked from their next report.')
              : run(async () => { await api.requestQuestionAdd(text, reason, agreed); setAdding(false); }, "Thanks. We'll review your question and email you once it's added.")}
          />
        )}
        {admin && <ExtrasControl key={client.extra_questions || 0} client={client} questions={questions} busy={busy} run={run} />}
      </div>

      {!awaiting && !admin && editing === null && !adding && <p className="keep-note">{KEEP_THEM}</p>}

      {awaiting && (
        <div className="confirm-row">
          <button className="btn primary" disabled={busy} onClick={() => run(() => api.confirmQuestions(admin ? client.id : null), admin ? 'Marked as confirmed.' : 'Thanks, your questions are confirmed. We use them from your next monthly report.')}>
            {admin ? 'Mark as confirmed for them' : 'Confirm these questions'}
          </button>
          {pending.length > 0 && !admin && <span className="hint">Your suggested change{pending.length === 1 ? '' : 's'} will be reviewed separately.</span>}
        </div>
      )}

      {msg && <p className={`add-login-msg ${msg.ok ? 'good' : 'bad'}`} role="status">{msg.text}</p>}

      {recent.length > 0 && (
        <div className="recent-requests">
          <span className="label">Recent changes</span>
          <ul className="plain">
            {recent.map((r) => (
              <li key={r.id}>
                <span className="muted">{shortDate(r.decided_at || r.created_at)} · {r.kind === 'add' ? (r.status === 'approved' ? `Question ${r.position}:` : 'New question:') : `Question ${r.position}:`}</span>{' '}
                {r.kind === 'add'
                  ? (r.status === 'approved' ? <>added “{r.final_question || r.proposed_question}”</> : <>“{r.proposed_question}” not added{r.decision_note ? ` (${r.decision_note})` : ''}</>)
                  : r.status === 'approved' ? <>changed to “{r.final_question || r.proposed_question}”</> : <>kept as it was{r.decision_note ? ` (${r.decision_note})` : ''}</>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function ChangeForm({ admin, awaiting, current, start, busy, onCancel, onSubmit }) {
  const [text, setText] = useState(start);
  const [reason, setReason] = useState('');
  const same = text.trim().toLowerCase() === current.trim().toLowerCase();
  return (
    <form className="note-form change-form" onSubmit={(e) => { e.preventDefault(); if (!same && text.trim()) onSubmit(text.trim(), reason.trim()); }}>
      {!awaiting && !admin && <p className="keep-note">{KEEP_THEM}</p>}
      {admin && <p className="hint">Changing a question starts its tracking fresh from the next report.</p>}
      <label>{admin ? 'Question' : 'The question you would like us to ask instead'}
        <textarea rows={2} value={text} onChange={(e) => setText(e.target.value)} maxLength={300} required placeholder="e.g. Who can fix a burst pipe on a weekend in Orangeville?" />
        <span className="hint">{FAIR}</span>
      </label>
      {!admin && (
        <label>Why? (optional)
          <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} placeholder="e.g. We no longer do renovations" />
        </label>
      )}
      <div className="row">
        <button className="btn small primary" disabled={busy || same || text.trim().length < 10}>{admin ? 'Save question' : 'Send request'}</button>
        <button type="button" className="btn small ghost" onClick={onCancel} disabled={busy}>Cancel</button>
      </div>
    </form>
  );
}

function AddForm({ admin, paid, homeOnly, busy, onCancel, onSubmit }) {
  const [text, setText] = useState('');
  const [reason, setReason] = useState('');
  const [agreed, setAgreed] = useState(false);
  const ok = text.trim().length >= 10 && (!paid || agreed);
  return (
    <form className="note-form change-form" onSubmit={(e) => { e.preventDefault(); if (ok) onSubmit(text.trim(), reason.trim(), agreed); }}>
      <label>{admin ? 'New question' : 'The question you would like us to ask'}
        <textarea rows={2} value={text} onChange={(e) => setText(e.target.value)} maxLength={300} required placeholder="e.g. Who can fix a burst pipe on a weekend in Orangeville?" />
        <span className="hint">{FAIR}{homeOnly ? ' Extra questions are asked about your home area.' : ''}</span>
      </label>
      {!admin && (
        <label>Why? (optional)
          <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} placeholder="e.g. We've started selling rural properties" />
        </label>
      )}
      {paid && (
        <label className="check-line">
          <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
          <span>I understand this adds ${EXTRA_PRICE} a month to my plan, starting once Kestrel approves the question.</span>
        </label>
      )}
      <div className="row">
        <button className="btn small primary" disabled={busy || !ok}>{admin ? 'Add question' : 'Send request'}</button>
        <button type="button" className="btn small ghost" onClick={onCancel} disabled={busy}>Cancel</button>
      </div>
    </form>
  );
}

// Admin: how many paid extra questions the client has ($10 a month each).
function ExtrasControl({ client, questions, busy, run }) {
  const [n, setN] = useState(String(client.extra_questions || 0));
  const max = MAX_EXTRA[client.package] ?? 3;
  const val = Number(n);
  const changed = Number.isInteger(val) && val >= 0 && val <= max && val !== (client.extra_questions || 0);
  return (
    <form className="row extras-control" onSubmit={(e) => { e.preventDefault(); if (changed) run(() => api.setExtraQuestions(client.id, val), `Paid extra questions set to ${val}. Update their billing to match.`); }}>
      <label className="inline">Paid extra questions
        <input type="number" min={0} max={max} value={n} onChange={(e) => setN(e.target.value)} style={{ width: '5rem' }} />
      </label>
      <button className="btn small" disabled={busy || !changed}>Save</button>
      <span className="hint">${EXTRA_PRICE} a month each{client.package === 'track' ? ', at most 3 on Track' : ''}. Tracking {questions.length} now.</span>
    </form>
  );
}
