import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAct, useMe } from '../hubContext';
import { LogTaskDialog } from '../dialogs';
import { Chip, Empty, Modal } from '../common';
import { PersonErrorCard } from '../errorUi';
import { shortProjectName } from '../../domain/reviewKinds';
import { formatDateTime } from '../../domain/time';
import { stepLabels } from '../../domain/stepLabels';
import type { Project } from '../../domain/types';

/**
 * Home is the first page. Notifications come first: requests from Dalia, work the AI found that needs a yes or no,
 * files the AI thinks belong to a step, and errors in their log. Projects live on the Projects page.
 */
export function EmployeeHome() {
  const { hub, uid, me } = useMe();
  const act = useAct();
  const nav = useNavigate();
  const [logging, setLogging] = useState(false);
  const [moving, setMoving] = useState<string | null>(null);
  const shift = hub.openShift(uid);
  const firstName = me.name.split(' ')[0];

  const cards = hub.outstandingCards(uid);
  const requests = cards.filter((c) => c.cardType === 'OWNER_REQUEST');
  const toConfirm = cards.filter((c) => c.cardType !== 'OWNER_REQUEST');
  const files = hub.pendingFileSuggestions(uid);
  const notes = hub.listNotifications(uid).filter((n) => !n.readAt && !n.acknowledgedAt && (!n.snoozedUntil || n.snoozedUntil <= hub.now) && !['OWNER_UPDATE_REQUEST', 'FOLLOW_UP', 'ERROR_FOR_YOU'].includes(n.type)).slice(0, 4);
  const errs = hub.errorsForPerson(uid);
  const total = requests.length + toConfirm.length + files.length + errs.toReview.length + errs.snoozed.length;

  const saved = hub.myWorkLog(uid);
  const reqBy = (id: string | null) => (id ? hub.userName(hub.getRequest(uid, id)?.requestedByUid ?? null) : 'Dalia');
  const moveLink = moving ? files.find((f) => f.link.id === moving) : null;

  return (
    <div className="stack">
      <div className="row between">
        <h1 style={{ margin: 0 }}>Hi {firstName} 👋</h1>
        <span className="row small">
          <Chip tone={shift ? 'ok' : 'gray'} glyph={shift ? '●' : '○'}>{shift ? 'Pay clock is running' : 'Clocked out'}</Chip>
          {!shift && me.role === 'EMPLOYEE' && <Link to="/clock">Clock in</Link>}
          <Link to="/print/my-stats">My printing</Link>
          <button className="quiet" onClick={() => setLogging(true)}>Log something I did</button>
        </span>
      </div>

      <section aria-labelledby="notif" className="stack">
        <h2 id="notif" className="group-title" style={{ marginBottom: 0 }}>Notifications <span className="count">{total + notes.length}</span></h2>
        {total + notes.length === 0 && <Empty>Nothing needs you right now.</Empty>}
        {[...errs.toReview, ...errs.snoozed].map((e) => <PersonErrorCard key={e.id} e={e} />)}
        {requests.map((c) => (
          <div key={c.id} className="notice">
            <span><strong>{reqBy(c.updateRequestId)} asked you for an update</strong>{c.projectId ? ` on ${hub.getProject(uid, c.projectId).key}` : ''}.</span>
            <Link to={`/review?card=${c.id}`}><button className="primary">Answer</button></Link>
          </div>
        ))}
        {toConfirm.length > 0 && (
          <div className="card list" aria-label="Things to confirm">
            <div className="lhead"><strong>The AI saw activity. Please confirm it.</strong> <span className="small muted">About 1 to 3 minutes. It is paid time.</span></div>
            {toConfirm.slice(0, 6).map((c) => {
              const p = c.projectId ? hub.getProject(uid, c.projectId) : null;
              const step = c.stepId ? hub.getStep(uid, c.stepId) : null;
              const lab = step ? stepLabels(hub.projectSteps(uid, step.projectId)).get(step.id) : null;
              return (
                <Link key={c.id} to={`/review?card=${c.id}`} className="lline">
                  <span className="t">{c.title}{p && <span className="small muted"> · {p.key}{lab ? ` · Step ${lab}` : ''}</span>}</span>
                  <span className="small muted when">{c.dueAt ? `Due ${formatDateTime(c.dueAt)}` : ''}</span>
                  <Chip tone="pink">Confirm</Chip>
                </Link>
              );
            })}
            {toConfirm.length > 6 && <div className="lline static"><Link to="/review">See all {toConfirm.length}</Link></div>}
          </div>
        )}
        {files.map(({ link, resource, project, step }) => {
          const lab = step ? stepLabels(hub.projectSteps(uid, project.id)).get(step.id) : null;
          return (
            <div key={link.id} className="card stack" aria-label="A file the AI found">
              <div><strong>It looks like “{resource.label}” belongs to {project.key}{lab ? `, step ${lab}` : ''}.</strong>
                <div className="small muted">{link.explanation} The AI can be wrong, so you decide.</div></div>
              <div className="row">
                <button className="primary" onClick={() => act(() => hub.answerFileSuggestion(uid, link.id, { action: 'CONFIRM' }), 'Added to the step')}>Yes, add it to this step</button>
                <button onClick={() => setMoving(link.id)}>It belongs somewhere else</button>
                <button className="quiet" onClick={() => act(() => hub.answerFileSuggestion(uid, link.id, { action: 'NOT_RELATED' }), 'Okay, not linked')}>Not related to a project</button>
              </div>
            </div>
          );
        })}
        {notes.length > 0 && (
          <div className="card list" aria-label="Other notifications">
            {notes.map((n) => (
              <button key={n.id} className="lline" onClick={async () => { await act(() => hub.markRead(uid, n.id)); nav(n.deepLink); }}>
                <span className="t">{n.title}<span className="small muted"> · {n.preview}</span></span><span className="small muted when">{formatDateTime(n.createdAt)}</span>
              </button>
            ))}
            <div className="lline static"><Link to="/notifications">See all notifications</Link></div>
          </div>
        )}
      </section>

      {saved.length > 0 && (
        <details className="soft">
          <summary>Other work you saved <span className="count">{saved.length}</span></summary>
          <div className="card list" style={{ marginTop: 8 }}>
            {saved.map((w) => <div key={w.id} className="lline static"><span className="t">{w.title}</span><span className="small muted">{w.kind === 'EVERYDAY' ? 'Everyday work' : w.kind === 'SMALL_TASK' ? 'Small task you logged' : 'Maybe a new project'} · {formatDateTime(w.doneAt ?? w.loggedAt)}</span></div>)}
          </div>
        </details>
      )}
      {logging && <LogTaskDialog onClose={() => setLogging(false)} />}
      {moveLink && <MoveFileDialog linkId={moveLink.link.id} label={moveLink.resource.label} onClose={() => setMoving(null)} />}
    </div>
  );
}

function MoveFileDialog({ linkId, label, onClose }: { linkId: string; label: string; onClose: () => void }) {
  const { hub, uid } = useMe();
  const act = useAct();
  const mine: Project[] = hub.listProjects(uid).filter((p) => !p.closedAt && !p.canceledAt && hub.canWorkOnProject(hub.user(uid), p) && p.visibility !== 'OWNER_PRIVATE');
  const [pid, setPid] = useState(mine[0]?.id ?? '');
  const steps = pid ? hub.projectSteps(uid, pid) : [];
  const labels = pid ? hub.stepLabelsFor(uid, pid) : new Map<string, string>();
  const [sid, setSid] = useState('');
  return (
    <Modal title="Where does this file belong?" onClose={onClose}>
      <div className="stack">
        <p className="small muted">“{label}”. It will be renamed to match the step you pick (practice rename in this copy).</p>
        <div><label htmlFor="mv-p">Project</label><select id="mv-p" value={pid} onChange={(e) => { setPid(e.target.value); setSid(''); }}>{mine.map((p) => <option key={p.id} value={p.id}>{p.key} — {shortProjectName(p)}</option>)}</select></div>
        <div><label htmlFor="mv-s">Step</label><select id="mv-s" value={sid} onChange={(e) => setSid(e.target.value)}><option value="">Choose a step…</option>{steps.map((s) => <option key={s.id} value={s.id}>Step {labels.get(s.id)}: {s.title}</option>)}</select></div>
        <div className="row"><button className="primary" disabled={!sid} onClick={async () => { const r = await act(() => hub.answerFileSuggestion(uid, linkId, { action: 'MOVE', projectId: pid, stepId: sid }), 'Moved and renamed'); if (r) onClose(); }}>Move it here</button><button onClick={onClose}>Cancel</button></div>
      </div>
    </Modal>
  );
}
