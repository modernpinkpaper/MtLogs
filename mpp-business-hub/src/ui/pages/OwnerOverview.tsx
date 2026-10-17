import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAct, useMe } from '../hubContext';
import { Chip, Modal } from '../common';
import { RequestUpdateDialog } from '../dialogs';
import { formatDateTime, formatTime, relativeAgo } from '../../domain/time';

export function OwnerOverview() {
  const { hub, uid } = useMe();
  const act = useAct();
  const [req, setReq] = useState(false);
  const [digest, setDigest] = useState(false);
  const o = hub.ownerOverview(uid);
  const unread = hub.listNotifications(uid).filter((n) => !n.readAt);
  return (
    <div className="stack">
      <div className="row between">
        <div><h1>Command center <Chip tone="violet" glyph="◆">Demo</Chip></h1>
          <p className="muted">{formatDateTime(o.today)} · last data received {o.lastSync ? `${formatTime(o.lastSync)} (${relativeAgo(o.lastSync, o.today)})` : 'never'}{o.dataThrough ? ` · latest run data through ${formatTime(o.dataThrough)}` : ''}</p></div>
        <div className="row">
          <Link to="/projects"><button>All Projects</button></Link>
          <button onClick={() => setReq(true)}>Request Update</button>
          <Link to="/owner/team"><button>View Team</button></Link>
          <button onClick={() => setDigest(true)}>Daily Digest</button>
          <Link to="/owner/print-weekly"><button>Weekly Print Review</button></Link>
          <Link to="/projects"><button>Private Projects ({o.privateProjects})</button></Link>
        </div>
      </div>

      <section className="card pink">
        <div className="row between"><h2>What changed since I last looked? <span className="badge">{o.changeCount}</span></h2>
          <button onClick={() => act(() => hub.markOwnerLooked(uid), 'Marked as seen')}>Mark as seen</button></div>
        <p className="small muted">Since {formatDateTime(o.lastOwnerLookAt)}. Unmentioned work does not mean someone did nothing.</p>
        <ul style={{ margin: '0 0 0 1.1rem' }}>{o.narrative.map((n) => <li key={n}>{n}</li>)}</ul>
        {unread.length > 0 && <p><Link to="/notifications"><strong>{unread.length} unread notification(s)</strong></Link></p>}
      </section>

      <section className="card"><h2>Action queue</h2>
        {o.queue.length === 0 ? <span className="muted">Nothing needs you right now.</span> : (
          <div className="stack">{o.queue.map((q, i) => (
            <div key={i} className="row between"><span><Chip tone={q.kind.startsWith('Requested') ? 'pink' : q.kind === 'Blocker' ? 'bad' : q.kind === 'Data issue' ? 'warn' : 'info'}>{q.kind}</Chip> {q.label}</span><Link to={q.link}>Open</Link></div>))}</div>
        )}
      </section>

      <section><h2>People on project work today</h2>
        <div className="grid cols-3">{o.workerCards.map((w) => (
          <div key={w.user.id} className="card">
            <div className="row between"><strong>{w.user.name}</strong><Chip tone={w.clockedIn ? 'ok' : 'gray'} glyph={w.clockedIn ? '●' : '○'}>{w.clockedIn ? 'Clocked in' : 'Clocked out'}</Chip></div>
            <div className="small muted">{w.area.toLowerCase()} · {w.projectKeys.join(', ') || 'no projects'}</div>
            <div className="small" style={{ marginTop: 6 }}>Last confirmed change: {w.lastConfirmed ? `${w.lastConfirmed.title} (${formatDateTime(w.lastConfirmed.occurredAt)})` : 'none'}</div>
            <div className="small">{w.pendingCards} review card(s) pending · {w.openRequests} open request(s)</div>
            <p className="small muted">Pending items mean “not yet reviewed”, not “not working”.</p>
          </div>))}</div>
      </section>

      <section className="card"><h2>Print outcomes this week (operational, not a ranking)</h2>
        <div className="tablewrap"><table><thead><tr><th>Printer</th><th>Completed</th><th>Failed</th><th>Problem incidents</th></tr></thead><tbody>
          {o.print.map((p) => <tr key={p.printer}><td>{p.printer}</td><td>{p.completed}</td><td>{p.failed}</td><td>{p.incidents}</td></tr>)}</tbody></table></div>
        <Link to="/owner/print-weekly">Open the weekly print review →</Link>
      </section>

      {req && <RequestUpdateDialog onClose={() => setReq(false)} />}
      {digest && (
        <Modal title="Daily digest (generated from stored data, no AI call)" onClose={() => setDigest(false)}>
          <ul>{o.narrative.map((n) => <li key={n}>{n}</li>)}</ul>
          <p className="small muted">A real digest would use one small summarization call. This demo builds it from counts so it costs nothing.</p>
        </Modal>
      )}
    </div>
  );
}
