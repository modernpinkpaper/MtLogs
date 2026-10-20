import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAct, useMe } from '../hubContext';
import { LogTaskDialog } from '../dialogs';
import { Chip, Empty, Modal } from '../common';
import { PersonErrorCard } from '../errorUi';
import { Group } from './OwnerOverview';
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

  const h = hub.employeeHome(uid);
  const { requests, toConfirm, files, removals, errors, reminders, alerts } = h;
  const total = hub.homeCount(uid);
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

      <div>
        <p style={{ margin: 0 }} className="muted">{total === 0 ? 'Inbox zero. Nothing needs you right now.' : `${total} thing${total === 1 ? '' : 's'} to clear. Everything that needs you is here, and only here.`}</p>
      </div>
      {total === 0 && <Empty>You are all caught up.</Empty>}

      <Group id="e-req" title="Dalia asked you" hint="Answer when you can" count={requests.length}>
        {requests.map((c) => (
          <div key={c.id} className="notice">
            <span><strong>{reqBy(c.updateRequestId)} asked you for an update</strong>{c.projectId ? ` on ${hub.getProject(uid, c.projectId).key}` : ''}.{c.explanatoryText ? <span className="muted"> “{c.explanatoryText}”</span> : null}</span>
            <Link to={`/review?card=${c.id}`}><button className="primary">Answer</button></Link>
          </div>
        ))}
      </Group>

      <Group id="e-confirm" title="Confirm what the AI saw" hint="About 1 to 3 minutes. It is paid time." count={toConfirm.length}>
        <div className="card list" aria-label="Things to confirm">
          {toConfirm.map((c) => {
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
        </div>
      </Group>

      <Group id="e-files" title="Files" hint="Files the AI found, and files someone wants to take off a finished step" count={files.length + removals.length}>
        {removals.map(({ link, resource, project, step, byName }) => (
          <div key={link.id} className="card stack" aria-label="A file someone wants to remove">
            <div><strong>{byName} wants to take “{resource.label}” off {project.key}, step {stepLabels(hub.projectSteps(uid, project.id)).get(step.id)}.</strong>
              <div className="small muted">That step is done. The file itself is not deleted. You decide.</div></div>
            <div className="row">
              <button className="primary" onClick={() => act(() => hub.answerFileRemoval(uid, link.id, true), 'Taken off the step')}>Yes, take it off</button>
              <button onClick={() => act(() => hub.answerFileRemoval(uid, link.id, false), 'Kept on the step')}>Keep it</button>
            </div>
          </div>
        ))}
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
      </Group>

      <Group id="e-errors" title="Errors in your log" hint="Read, then acknowledge with a note. You can snooze until your next clock in." count={errors.length}>
        {errors.map((e) => <PersonErrorCard key={e.id} e={e} />)}
      </Group>

      <Group id="e-remind" title="Reminders" hint="Blocked steps you wanted to look at again" count={reminders.length}>
        <div className="card list">{reminders.map((r) => (
          <div key={r.step.id} className="lline static"><span className="t">{r.project.key} · Step {r.label}: {r.step.title}<span className="small muted"> · blocked: {r.step.blockerReason}</span></span>
            <Link to={`/projects/${r.project.id}/steps/${r.step.id}`}><button>Look at it</button></Link></div>))}</div>
      </Group>

      <Group id="e-alerts" title="Other alerts" count={alerts.length}>
        <div className="card list">{alerts.map((n) => (
          <div key={n.id} className="mrow"><div className="t">{n.title}</div><div className="small muted">{n.preview}</div>
            <div className="row" style={{ marginTop: 6 }}><button onClick={async () => { await act(() => hub.markRead(uid, n.id)); nav(n.deepLink); }}>Open</button><button onClick={() => act(() => hub.acknowledge(uid, n.id), 'Cleared. It stays in History.')}>Got it</button></div></div>))}</div>
      </Group>

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
