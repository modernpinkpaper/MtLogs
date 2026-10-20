import { useState } from 'react';
import type { ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAct, useMe } from '../hubContext';
import { Chip, Modal } from '../common';
import { OwnerErrorCard } from '../errorUi';
import { RequestUpdateDialog } from '../dialogs';
import { ProjectInfo } from '../projectRef';
import { formatDateTime } from '../../domain/time';
import { FEEDBACK_REASONS } from '../../server/ownerHome';
import type { HomeFindingItem } from '../../server/ownerHome';

/**
 * Owner Home. Everything that needs Dalia is here, grouped by kind:
 * errors to acknowledge, things that need attention, AI recommended projects, team updates, opportunities (make money),
 * optimizations (save money or time), and other things the AI noticed. Anything the AI sent can be dismissed with a reason,
 * and the reason teaches it what to send next time.
 */
export function OwnerOverview() {
  const { hub, uid } = useMe();
  const act = useAct();
  const nav = useNavigate();
  const [req, setReq] = useState(false);
  const [digest, setDigest] = useState(false);
  const [dismissing, setDismissing] = useState<HomeFindingItem | null>(null);
  const [confirmItem, setConfirmItem] = useState<ReturnType<typeof hub.ownerOverview>['queue'][number] | null>(null);
  const o = hub.ownerOverview(uid);
  const h = hub.ownerHome(uid);
  const [sending, setSending] = useState<HomeFindingItem | null>(null);
  const unread = hub.listNotifications(uid).filter((n) => !n.readAt).length;
  const attention = o.queue.filter((q) => q.kind !== 'They answered you').sort((a, b) => b.weight - a.weight);
  const aiCount = h.ai.growth.length + h.ai.saverPc.length + h.ai.saverOther.length + h.ai.other.length + h.unassigned.length;
  const errCount = h.errorsToAcknowledge.length + h.errorAnswers.length;
  const total = hub.homeCount(uid);
  const pc = o.counts;

  const Fnd = ({ f }: { f: HomeFindingItem }) => <Finding f={f} onSend={setSending} onDismiss={setDismissing} />;

  return (
    <div className="stack">
      <div className="pagehead">
        <div>
          <h1>Home</h1>
          <p>
            {total === 0 ? 'Inbox zero. Nothing needs you right now.' : `${total} thing${total === 1 ? '' : 's'} to clear.`}{' '}
            <Link to="/projects">{pc.team} team project{pc.team === 1 ? '' : 's'} active</Link>
            {pc.private > 0 && <>, <Link to="/projects?mine=1">{pc.private} private</Link></>}
            {pc.paused > 0 && <>, <Link to="/projects?status=PAUSED">{pc.paused} paused</Link></>}.
          </p>
        </div>
        <button onClick={() => setReq(true)}>Ask for an update</button>
      </div>

      {total === 0 && <div className="card focal"><div className="eyebrow">Inbox zero</div><p className="focus-title">You are all caught up.</p><p className="muted" style={{ margin: '.4rem 0 0' }}>Everything that needs you lands here, and nowhere else. Cleared items stay in History.</p></div>}

      <Group id="g-team" title="Team members" hint="Answers, updates and questions from your team" count={h.team.length}>
        <div className="card list">{h.team.map((n) => (
          <div key={n.id} className="mrow">
            <div className="t">{n.title}</div><div className="small muted">{n.preview}</div>
            <div className="row" style={{ marginTop: 6 }}>
              <button onClick={async () => { await act(() => hub.markRead(uid, n.id)); nav(n.deepLink); }}>Open</button>
              <button onClick={() => act(() => hub.acknowledge(uid, n.id), 'Cleared. It stays in History.')}>I saw this</button>
            </div>
          </div>))}
        </div>
      </Group>

      <Group id="g-errors" title="Errors logged by customer service" hint="Acknowledge so the team member can see it" count={errCount}>
        {h.errorsToAcknowledge.map((e) => <OwnerErrorCard key={e.id} e={e} />)}
        {h.errorAnswers.length > 0 && <div className="card list">{h.errorAnswers.map((n) => (
          <div key={n.id} className="lline static"><span className="t">{n.title}<span className="small muted"> · {n.preview}</span></span><span className="small muted when">{formatDateTime(n.createdAt)}</span>
            <button onClick={() => act(() => hub.acknowledge(uid, n.id), 'Cleared')}>I saw this</button></div>))}</div>}
      </Group>

      <Group id="g-ai" title="AI project recommendations" hint="Nothing starts and nobody is assigned until you say so" count={aiCount}>
        {h.unassigned.map((p) => (
          <div key={p.id} className="notice"><span><strong>{p.key} “{p.title}”</strong> is approved, but nobody is assigned.</span><Link to={`/projects/${p.id}?assign=1`}><button>Choose who works on it</button></Link></div>))}
        <Group id="g-growth" sub title="Growth opportunities" hint="Things that could bring in money" count={h.ai.growth.length}>{h.ai.growth.map((f) => <Fnd key={f.id} f={f} />)}</Group>
        <Group id="g-pc" sub title="Cost and time savers: computer work" hint="Repeated computer tasks a script or tool could do" count={h.ai.saverPc.length}>{h.ai.saverPc.map((f) => <Fnd key={f.id} f={f} />)}</Group>
        <Group id="g-nonpc" sub title="Cost and time savers: not computer work" hint="Printers, supplies, cleaning, things the computer cannot see" count={h.ai.saverOther.length}>{h.ai.saverOther.map((f) => <Fnd key={f.id} f={f} />)}</Group>
        <Group id="g-other" sub title="Other recommendations" count={h.ai.other.length}>{h.ai.other.map((f) => <Fnd key={f.id} f={f} />)}</Group>
      </Group>

      <Group id="g-attention" title="Needs your attention" hint="Late, blocked, or waiting on you" count={attention.length}>
        <div className="card list">{attention.map((q, i) => (
          <div key={i} className="mrow">
            <div className="t">{q.title}{q.projectId && <ProjectInfo projectId={q.projectId} label={q.title} />}</div>
            <div className="small muted">{q.why}</div>
            <div className="row" style={{ marginTop: 6 }}>
              {q.action?.type === 'APPROVE_VERSION' && <button onClick={() => setConfirmItem(q)}>{q.action.label}</button>}
              {q.action?.type === 'MARK_SEEN' && <button onClick={() => act(() => hub.acknowledge(uid, (q.action as { notificationId: string }).notificationId), 'Cleared')}>{q.action.label}</button>}
              <Link to={q.link}><button className={q.action ? 'quiet' : ''}>{q.cta}</button></Link>
            </div>
          </div>))}
        </div>
      </Group>

      <Group id="g-remind" title="Reminders" hint="Blocked steps you wanted to look at again" count={h.reminders.length}>
        <div className="card list">{h.reminders.map((r) => (
          <div key={r.step.id} className="lline static"><span className="t">{r.project.key} · Step {r.label}: {r.step.title}<span className="small muted"> · blocked: {r.step.blockerReason}</span></span>
            <Link to={`/projects/${r.project.id}/steps/${r.step.id}`}><button>Look at it</button></Link></div>))}</div>
      </Group>

      <Group id="g-alerts" title="Other alerts" count={h.otherAlerts.length}>
        <div className="card list">{h.otherAlerts.map((n) => (
          <div key={n.id} className="mrow"><div className="t">{n.title}</div><div className="small muted">{n.preview}</div>
            <div className="row" style={{ marginTop: 6 }}><button onClick={async () => { await act(() => hub.markRead(uid, n.id)); nav(n.deepLink); }}>Open</button><button onClick={() => act(() => hub.acknowledge(uid, n.id), 'Cleared. It stays in History.')}>Got it</button></div></div>))}</div>
      </Group>

      {h.errorsWaiting.length > 0 && <p className="small muted">{h.errorsWaiting.length} acknowledged error{h.errorsWaiting.length === 1 ? ' is' : 's are'} waiting for the team member: {h.errorsWaiting.map((e) => e.personName).join(', ')}.</p>}

      <details className="soft">
        <summary>What changed since you last looked <span className="count">{o.changeCount} new</span></summary>
        <div className="stack" style={{ marginTop: 'var(--sp-3)' }}>
          <p className="small muted" style={{ margin: 0 }}>Since {formatDateTime(o.lastOwnerLookAt)}. If something is not listed, it does not mean nobody worked.</p>
          <p style={{ margin: 0 }}>{o.changeCount} new history note{o.changeCount === 1 ? '' : 's'}{unread ? ` · ${unread} unread notification${unread === 1 ? '' : 's'}` : ''}. <Link to="/journal">Open History</Link></p>
          <ul style={{ margin: 0, paddingLeft: '1.1rem' }}>{o.narrative.map((n) => <li key={n}>{n}</li>)}</ul>
          <div><button onClick={() => act(() => hub.markOwnerLooked(uid), 'Marked as seen')}>Mark as seen</button></div>
        </div>
      </details>

      <details className="soft">
        <summary>Who is doing project work today</summary>
        <div className="card list" style={{ marginTop: 'var(--sp-3)' }}>
          {o.workerCards.map((w) => (
            <div key={w.user.id} className="lline static">
              <span className="t">{w.user.name}<span className="muted small"> · {w.projectKeys.join(', ') || 'no projects'} · {w.pendingCards} to review · {w.openRequests} waiting for an answer</span></span>
              <span /><Chip tone={w.clockedIn ? 'ok' : 'gray'} glyph={w.clockedIn ? '●' : '○'}>{w.clockedIn ? 'Clocked in' : 'Clocked out'}</Chip>
            </div>
          ))}
          <div style={{ padding: '.6rem 1rem' }}><p className="small muted" style={{ margin: '0 0 .4rem' }}>“To review” means not checked yet. It does not mean not working.</p><Link to="/owner/team">Open Team &amp; Print</Link></div>
        </div>
      </details>

      <div className="row small">
        <button className="link" onClick={() => setDigest(true)}>Daily summary</button>
        <Link to="/owner/ai">All AI recommendations</Link>
        <Link to="/owner/ai?tab=priorities">Priorities and sources{h.muted ? ` (${h.muted} “never again” rule${h.muted === 1 ? '' : 's'})` : ''}</Link>
        <Link to="/projects?mine=1">Private projects ({o.privateProjects})</Link>
      </div>

      {req && <RequestUpdateDialog onClose={() => setReq(false)} />}
      {dismissing && <DismissDialog f={dismissing} onClose={() => setDismissing(null)} />}
      {sending && <SendToTeamDialog f={sending} onClose={() => setSending(null)} />}
      {digest && (
        <Modal title="Daily summary" onClose={() => setDigest(false)}>
          <ul>{o.narrative.map((n) => <li key={n}>{n}</li>)}</ul>
          <p className="small muted">Made from saved data, with no AI call, so it costs nothing.</p>
        </Modal>
      )}
      {confirmItem?.action?.type === 'APPROVE_VERSION' && (
        <Modal title="Please confirm" onClose={() => setConfirmItem(null)}>
          <div className="stack">
            <p style={{ margin: 0 }}>{confirmItem.action.confirm}</p>
            <div className="row">
              <button className="primary" onClick={async () => { const a = confirmItem.action as { resourceId: string; version: string }; const r = await act(() => hub.approveVersion(uid, a.resourceId, a.version), 'Approved. It is recorded.'); if (r) setConfirmItem(null); }}>Yes, approve it</button>
              <button className="quiet" onClick={() => setConfirmItem(null)}>Not now</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

/** Dismiss with a reason. The reason goes to the AI: once, or as a rule it keeps. */
function DismissDialog({ f, onClose }: { f: HomeFindingItem; onClose: () => void }) {
  const { hub, uid } = useMe();
  const act = useAct();
  const [reason, setReason] = useState<string>(FEEDBACK_REASONS[0]);
  const [scope, setScope] = useState<'THIS_TIME' | 'NEVER_AGAIN'>('THIS_TIME');
  const [note, setNote] = useState('');
  return (
    <Modal title="Dismiss this recommendation" onClose={onClose}>
      <form className="stack" onSubmit={async (e) => { e.preventDefault(); const r = await act(() => hub.dismissWithFeedback(uid, f.id, { scope, reason, note }), scope === 'NEVER_AGAIN' ? 'Dismissed. The AI will stop sending this kind.' : 'Dismissed. The AI learned why.'); if (r) onClose(); }}>
        <p className="small muted" style={{ margin: 0 }}>“{f.title}”. Nothing is deleted. Your answer helps the AI decide what to send you next.</p>
        <div><label htmlFor="dm-r">Why?</label><select id="dm-r" value={reason} onChange={(e) => setReason(e.target.value)}>{FEEDBACK_REASONS.map((r) => <option key={r}>{r}</option>)}</select></div>
        <fieldset style={{ border: 'none', padding: 0 }}><legend style={{ fontWeight: 600 }}>How long?</legend>
          <label style={{ fontWeight: 500 }}><input type="radio" name="dm-s" checked={scope === 'THIS_TIME'} onChange={() => setScope('THIS_TIME')} /> Just this one. It only comes back if something new shows up.</label>
          <label style={{ fontWeight: 500 }}><input type="radio" name="dm-s" checked={scope === 'NEVER_AGAIN'} onChange={() => setScope('NEVER_AGAIN')} /> Don’t send me this kind again. I can undo this under Priorities and sources.</label>
        </fieldset>
        <div><label htmlFor="dm-n">Anything to add? (if you want)</label><textarea id="dm-n" value={note} onChange={(e) => setNote(e.target.value)} style={{ minHeight: 60 }} /></div>
        <div className="row"><button className="primary" type="submit">Dismiss</button><button type="button" onClick={onClose}>Cancel</button></div>
      </form>
    </Modal>
  );
}

/** Send an idea to people Dalia picks, with a note. They get the idea and the steps. They never get the reasons or the data. */
function SendToTeamDialog({ f, onClose }: { f: HomeFindingItem; onClose: () => void }) {
  const { hub, uid } = useMe();
  const act = useAct();
  const team = hub.listUsers(uid).filter((u) => u.role === 'EMPLOYEE' && u.active);
  const [to, setTo] = useState<string[]>([]);
  const [note, setNote] = useState('');
  return (
    <Modal title="Send this idea to your team" onClose={onClose}>
      <form className="stack" onSubmit={async (e) => { e.preventDefault(); const r = await act(() => hub.shareFindingWithTeam(uid, f.id, to, note), 'Sent. They have it on their Home.'); if (r) onClose(); }}>
        <p className="small muted" style={{ margin: 0 }}>“{f.title}”. They get the idea and the steps. They do not get the reasons, numbers or data behind it.</p>
        <fieldset style={{ border: 'none', padding: 0 }}><legend style={{ fontWeight: 600 }}>Send to</legend>
          {team.map((u) => <label key={u.id} style={{ fontWeight: 500 }}><input type="checkbox" checked={to.includes(u.id)} onChange={(e) => setTo(e.target.checked ? [...to, u.id] : to.filter((x) => x !== u.id))} /> {u.name}</label>)}</fieldset>
        <div><label htmlFor="st-n">Your note</label><textarea id="st-n" value={note} onChange={(e) => setNote(e.target.value)} placeholder="For example: Could you look into this when you have a moment?" style={{ minHeight: 70 }} /></div>
        <div className="row"><button className="primary" type="submit" disabled={!to.length}>Send</button><button type="button" onClick={onClose}>Cancel</button></div>
      </form>
    </Modal>
  );
}

/** One group on Home. Closed until you open it, with the number waiting on the line. Defined outside the page so it stays open when the page redraws. */
export function Group({ id, title, hint, count, children, sub }: { id: string; title: string; hint?: string; count: number; children: ReactNode; sub?: boolean }) {
  if (count === 0) return null;
  return (
    <details className={sub ? 'hgroup sub' : 'hgroup'}>
      <summary><span id={id} className="ttl">{title}</span><span className="count">{count}</span>{hint && <span className="small muted hint">{hint}</span>}</summary>
      <div className="stack hbody">{children}</div>
    </details>
  );
}
function Finding({ f, onSend, onDismiss }: { f: HomeFindingItem; onSend: (f: HomeFindingItem) => void; onDismiss: (f: HomeFindingItem) => void }) {
  return (
    <div className="card stack" style={{ gap: 6 }}>
      <div className="row" style={{ gap: 6 }}>
        {f.urgent && <Chip tone="bad" glyph="!">Urgent</Chip>}{f.isSample && <Chip tone="gray">Sample finding</Chip>}<span className="eyebrow">{f.code}</span>
      </div>
      <strong>{f.title}</strong>
      <p className="small" style={{ margin: 0, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{f.summary}</p>
      {f.impact && <p className="small muted" style={{ margin: 0 }}>{f.impact}</p>}
      <div className="row"><Link to={f.link}><button>Open</button></Link><button onClick={() => onSend(f)}>Send to team…</button><button onClick={() => onDismiss(f)}>Dismiss…</button></div>
    </div>
  );
}
