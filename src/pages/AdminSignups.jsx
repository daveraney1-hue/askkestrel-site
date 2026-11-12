import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import * as api from '../lib/api.js';
import { dateTime, PACKAGE_NAMES } from '../lib/format.js';

const STATUS = { new: 'New', 'client created': 'Client created', declined: 'Not now' };

// A sign-up stays "New" until its client is marked active: either no client yet,
// or a client was created but is still pending payment (or otherwise not active).
const clientStatus = (s) => s.clients?.subscription_status || null;
const isOpen = (s) => s.status === 'new' || (!!s.client_id && clientStatus(s) !== 'active');
const statusLabel = (s) => {
  if (s.client_id && clientStatus(s) === 'active') return 'Active';
  if (s.client_id) return clientStatus(s) === 'pending_payment' ? 'Client created · pending payment' : `Client created · ${clientStatus(s) || 'not active'}`;
  return STATUS[s.status] || s.status;
};
const statusPill = (s) => (s.client_id && clientStatus(s) === 'active') ? 'pill-good' : s.status === 'declined' ? 'pill-miss' : 'pill-new';

// Plan sign-ups from askkestrel.ca. "Create client" does the same as the
// Telegram button; using both never creates a duplicate. "New" lists every
// sign-up whose client isn't active yet.
export default function AdminSignups() {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(null);
  const [show, setShow] = useState('open');

  const load = () => api.listSignups().then(setRows).catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);

  const act = async (id, fn) => {
    setBusy(id); setError('');
    try { await fn(); await load(); } catch (e) { setError(e.message); } finally { setBusy(null); }
  };

  if (!rows) return error ? <p className="error">{error}</p> : <div className="spinner" aria-label="Loading" />;
  const shown = show === 'open' ? rows.filter(isOpen) : rows;
  const openCount = rows.filter(isOpen).length;

  return (
    <>
      <div className="page-head">
        <div>
          <p className="eyebrow">Admin</p>
          <h1>Sign-ups</h1>
        </div>
        <div className="row">
          <button className={`btn small ${show === 'open' ? 'primary' : ''}`} onClick={() => setShow('open')}>New ({openCount})</button>
          <button className={`btn small ${show === 'all' ? 'primary' : ''}`} onClick={() => setShow('all')}>All ({rows.length})</button>
        </div>
      </div>
      {error && <p className="error">{error}</p>}
      {shown.length === 0 && <section className="card empty"><p className="muted">{show === 'open' ? 'No new sign-ups.' : 'No sign-ups yet.'}</p></section>}
      <div className="signup-list">
        {shown.map((s) => (
          <section key={s.id} className="card signup-card">
            <div className="signup-top">
              <div>
                <h3>{s.business}</h3>
                <p className="muted small">{[s.business_type, s.town].filter(Boolean).join(', ')} · signed up {dateTime(s.received_at)}</p>
              </div>
              <div className="signup-badges">
                <span className="pill pill-plan">{PACKAGE_NAMES[s.plan]}</span>
                <span className={`pill ${statusPill(s)}`}>{statusLabel(s)}</span>
              </div>
            </div>
            <dl className="signup-details">
              <dt>Contact</dt><dd>{s.name}</dd>
              <dt>Email</dt><dd><a href={`mailto:${s.email}`}>{s.email}</a></dd>
              {s.phone && <><dt>Phone</dt><dd><a href={`tel:${s.phone}`}>{s.phone}</a></dd></>}
              {s.website && <><dt>Website</dt><dd><a href={s.website} target="_blank" rel="noreferrer">{s.website}</a></dd></>}
              {s.extra_questions > 0 && <><dt>Extra questions</dt><dd>{s.extra_questions} (+${s.extra_questions * 10} a month)</dd></>}
              {s.notes && <><dt>Notes</dt><dd className="pre">{s.notes}</dd></>}
              <dt>Newsletter</dt><dd>{s.newsletter_optin ? 'Yes' : 'No'}</dd>
            </dl>
            <div className="row">
              {s.client_id ? (
                <Link className="btn small" to={`/admin/clients/${s.client_id}`}>Open client</Link>
              ) : (
                <>
                  <button className="btn small primary" disabled={busy === s.id}
                    onClick={() => act(s.id, () => api.createClientFromSignup(s.id))}>Create client</button>
                  {s.status === 'new' && (
                    <button className="btn small ghost" disabled={busy === s.id}
                      onClick={() => act(s.id, () => api.declineSignup(s.id))}>Not now</button>
                  )}
                </>
              )}
            </div>
          </section>
        ))}
      </div>
    </>
  );
}
