import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAct, useMe } from '../hubContext';
import { Chip, Modal } from '../common';
import { RequestUpdateDialog } from '../dialogs';
import { formatDateTime, formatTime, relativeAgo } from '../../domain/time';

/** Owner Home: what needs your decision, what changed, who needs help. Details are one click away. */
export function OwnerOverview() {
  const { hub, uid } = useMe();
  const act = useAct();
  const nav = useNavigate();
  const [req, setReq] = useState(false);
  const [digest, setDigest] = useState(false);
  const [all, setAll] = useState(false);
  const o = hub.ownerOverview(uid);
  const ai = hub.inboxSummary(uid);
  const unread = hub.listNotifications(uid).filter((n) => !n.readAt).length;
  const decisions = [
    ...(ai.approvedUnassigned ? ai.unassignedProjects.map((p) => ({ kind: 'Choose who works on it', label: `${p.key} “${p.title}” is approved but nobody is assigned`, link: `/projects/${p.id}?assign=1`, weight: 96 })) : []),
    ...(ai.urgent ? [{ kind: 'Urgent AI recommendation', label: `${ai.urgent} urgent recommendation${ai.urgent === 1 ? '' : 's'} need a look`, link: '/owner/ai', weight: 99 }] : []),
    ...(ai.needsDecision - ai.urgent > 0 ? [{ kind: 'AI Recommendations', label: `${ai.needsDecision - ai.urgent} recommendation${ai.needsDecision - ai.urgent === 1 ? '' : 's'} waiting for your decision`, link: '/owner/ai', weight: 55 }] : []),
    ...o.queue,
  ].sort((a, b) => b.weight - a.weight);
  const shown = all ? decisions : decisions.slice(0, 5);

  return (
    <div className="stack">
      <div className="row between">
        <div>
          <h1>Home</h1>
          <p className="muted small" style={{ margin: 0 }}>{formatDateTime(o.today)} · {o.lastSync ? `Last activity processed ${formatTime(o.lastSync)} (${relativeAgo(o.lastSync, o.today)})` : 'No activity received yet'}</p>
        </div>
        <div className="row">
          <button className="primary" onClick={() => setReq(true)}>Ask for an update</button>
          <Link to="/projects"><button>All projects</button></Link>
        </div>
      </div>

      <div className="tiles" aria-label="Project counts">
        <Link className="tile" to="/projects" style={{ color: 'inherit', textDecoration: 'none' }}><div className="n">{o.counts.active}</div><div className="t">Active projects</div></Link>
        <Link className="tile" to="/projects?status=PAUSED" style={{ color: 'inherit', textDecoration: 'none' }}><div className="n">{o.counts.paused}</div><div className="t">Paused projects</div></Link>
        <a className="tile" href="#decide" style={{ color: 'inherit', textDecoration: 'none' }}><div className="n">{decisions.length}</div><div className="t">Waiting for you</div></a>
      </div>

      <section id="decide" className="card pink" aria-labelledby="dec">
        <h2 id="dec">Needs your decision</h2>
        {decisions.length === 0 ? <p className="muted">Nothing needs you right now.</p> : (
          <div className="stack">
            {shown.map((q, i) => (
              <div key={i} className="row between">
                <span><Chip tone={q.kind.startsWith('They answered') || q.kind.startsWith('Urgent') || q.kind.startsWith('Needs your') ? 'pink' : q.kind === 'Blocked' ? 'bad' : q.kind === 'Data problem' ? 'warn' : 'info'}>{q.kind}</Chip> {q.label}</span>
                <button onClick={() => nav(q.link)}>Open</button>
              </div>
            ))}
            {decisions.length > 5 && <button className="link" onClick={() => setAll(!all)}>{all ? 'Show fewer' : `Show all ${decisions.length}`}</button>}
          </div>
        )}
      </section>

      <section className="card" aria-labelledby="chg">
        <div className="row between">
          <h2 id="chg">What changed since you last looked</h2>
          <button onClick={() => act(() => hub.markOwnerLooked(uid), 'Marked as seen')}>Mark as seen</button>
        </div>
        <p className="small muted" style={{ margin: '0 0 .3rem' }}>Since {formatDateTime(o.lastOwnerLookAt)}. If something is not listed, it does not mean nobody worked.</p>
        <p style={{ margin: 0 }}>{o.changeCount} new history note{o.changeCount === 1 ? '' : 's'}{unread ? ` · ${unread} unread notification${unread === 1 ? '' : 's'}` : ''}. <button className="link" onClick={() => nav('/notifications')}>Open notifications</button></p>
        <details style={{ marginTop: 6 }}><summary className="small">Show details</summary><ul style={{ margin: '.3rem 0 0 1.1rem' }}>{o.narrative.map((n) => <li key={n}>{n}</li>)}</ul></details>
      </section>

      <section className="card" aria-labelledby="team">
        <details>
          <summary id="team" style={{ cursor: 'pointer', fontWeight: 650, fontSize: '1.15rem' }}>Who is doing project work today</summary>
          <div className="stack" style={{ marginTop: 8 }}>
            {o.workerCards.map((w) => (
              <div key={w.user.id} className="row between">
                <span><strong>{w.user.name}</strong> <span className="muted small">{w.projectKeys.join(', ') || 'no projects'} · {w.pendingCards} to review · {w.openRequests} waiting for an answer</span></span>
                <Chip tone={w.clockedIn ? 'ok' : 'gray'} glyph={w.clockedIn ? '●' : '○'}>{w.clockedIn ? 'Clocked in' : 'Clocked out'}</Chip>
              </div>
            ))}
            <p className="small muted" style={{ margin: 0 }}>“To review” means not checked yet. It does not mean not working.</p>
            <Link to="/owner/team">Open Team &amp; Print</Link>
          </div>
        </details>
      </section>

      <div className="row small muted">
        <button className="link" onClick={() => setDigest(true)}>Daily summary</button>
        <Link to="/owner/team?tab=print">This week’s printing</Link>
        <Link to="/projects?mine=1">Private projects ({o.privateProjects})</Link>
      </div>

      {req && <RequestUpdateDialog onClose={() => setReq(false)} />}
      {digest && (
        <Modal title="Daily summary" onClose={() => setDigest(false)}>
          <ul>{o.narrative.map((n) => <li key={n}>{n}</li>)}</ul>
          <p className="small muted">Made from saved data, with no AI call, so it costs nothing.</p>
        </Modal>
      )}
    </div>
  );
}
