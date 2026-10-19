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
  const unread = hub.listNotifications(uid).filter((n) => !n.readAt).length;
  const attention = o.queue.filter((q) => q.kind !== 'They answered you').sort((a, b) => b.weight - a.weight);
  const total = h.errorsToAcknowledge.length + h.errorAnswers.length + attention.length + h.aiProjects.length + h.unassigned.length + h.team.length + h.opportunities.length + h.optimizations.length + h.other.length;
  const pc = o.counts;

  const Section = ({ id, title, hint, count, children }: { id: string; title: string; hint?: string; count: number; children: ReactNode }) => count === 0 ? null : (
    <section aria-labelledby={id} className="stack">
      <div><h2 id={id} className="group-title" style={{ marginBottom: 0 }}>{title} <span className="count">{count}</span></h2>{hint && <p className="small muted" style={{ margin: 0 }}>{hint}</p>}</div>
      {children}
    </section>
  );
  const Finding = ({ f }: { f: HomeFindingItem }) => (
    <div className="card stack" style={{ gap: 6 }}>
      <div className="row" style={{ gap: 6 }}>
        {f.urgent && <Chip tone="bad" glyph="!">Urgent</Chip>}{f.isSample && <Chip tone="gray">Sample finding</Chip>}<span className="eyebrow">{f.code}</span>
      </div>
      <strong>{f.title}</strong>
      <p className="small" style={{ margin: 0, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{f.summary}</p>
      {f.impact && <p className="small muted" style={{ margin: 0 }}>{f.impact}</p>}
      <div className="row"><Link to={f.link}><button>Open</button></Link><button onClick={() => setDismissing(f)}>Dismiss…</button></div>
    </div>
  );

  return (
    <div className="stack">
      <div className="pagehead">
        <div>
          <h1>Home</h1>
          <p>
            {total === 0 ? 'Nothing needs you right now.' : `${total} thing${total === 1 ? ' needs' : 's need'} you.`}{' '}
            <Link to="/projects">{pc.team} team project{pc.team === 1 ? '' : 's'} active</Link>
            {pc.private > 0 && <>, <Link to="/projects?mine=1">{pc.private} private</Link></>}
            {pc.paused > 0 && <>, <Link to="/projects?status=PAUSED">{pc.paused} paused</Link></>}.
          </p>
        </div>
        <button onClick={() => setReq(true)}>Ask for an update</button>
      </div>

      {total === 0 && <div className="card focal"><div className="eyebrow">All clear</div><p className="focus-title">You are all caught up.</p><p className="muted" style={{ margin: '.4rem 0 0' }}>New things that need you will show up here.</p></div>}

      <Section id="h-errors" title="Errors to acknowledge" hint="A team member cannot see their error until you acknowledge it. You can add a note for them." count={h.errorsToAcknowledge.length}>
        {h.errorsToAcknowledge.map((e) => <OwnerErrorCard key={e.id} e={e} />)}
      </Section>
      <Section id="h-answers" title="Team members answered an error" count={h.errorAnswers.length}>
        <div className="card list">{h.errorAnswers.map((n) => (
          <div key={n.id} className="lline static"><span className="t">{n.title}<span className="small muted"> · {n.preview}</span></span><span className="small muted when">{formatDateTime(n.createdAt)}</span>
            <button onClick={() => act(() => hub.acknowledge(uid, n.id), 'Marked as seen')}>I saw this</button></div>))}</div>
      </Section>

      <Section id="h-attention" title="Needs your attention" count={attention.length}>
        <div className="card list">{attention.slice(0, 6).map((q, i) => (
          <div key={i} className="mrow">
            <div className="t">{q.title}{q.projectId && <ProjectInfo projectId={q.projectId} label={q.title} />}</div>
            <div className="small muted">{q.why}</div>
            <div className="row" style={{ marginTop: 6 }}>
              {q.action?.type === 'APPROVE_VERSION' && <button onClick={() => setConfirmItem(q)}>{q.action.label}</button>}
              {q.action?.type === 'MARK_SEEN' && <button onClick={() => act(() => hub.acknowledge(uid, (q.action as { notificationId: string }).notificationId), 'Marked as seen')}>{q.action.label}</button>}
              <Link to={q.link}><button className={q.action ? 'quiet' : ''}>{q.cta}</button></Link>
            </div>
          </div>))}
          {attention.length > 6 && <div className="lline static small muted">{attention.length - 6} more are on the Projects page.</div>}
        </div>
      </Section>

      <Section id="h-ai" title="AI recommended projects" hint="The AI is suggesting work. Nothing starts and nobody is assigned until you say so." count={h.aiProjects.length + h.unassigned.length}>
        {h.unassigned.map((p) => (
          <div key={p.id} className="notice"><span><strong>{p.key} “{p.title}”</strong> is approved, but nobody is assigned.</span><Link to={`/projects/${p.id}?assign=1`}><button>Choose who works on it</button></Link></div>))}
        {h.aiProjects.map((f) => <Finding key={f.id} f={f} />)}
      </Section>

      <Section id="h-team" title="Updates from your team" count={h.team.length}>
        <div className="card list">{h.team.slice(0, 8).map((n) => (
          <div key={n.id} className="mrow">
            <div className="t">{n.title}</div><div className="small muted">{n.preview}</div>
            <div className="row" style={{ marginTop: 6 }}>
              <button onClick={async () => { await act(() => hub.markRead(uid, n.id)); nav(n.deepLink); }}>Open</button>
              <button onClick={() => act(() => hub.acknowledge(uid, n.id), 'Marked as seen')}>I saw this</button>
            </div>
          </div>))}
          {h.team.length > 8 && <div className="lline static"><Link to="/notifications">See all {h.team.length}</Link></div>}
        </div>
      </Section>

      <Section id="h-opp" title="Opportunities" hint="Things that could bring in money." count={h.opportunities.length}>{h.opportunities.map((f) => <Finding key={f.id} f={f} />)}</Section>
      <Section id="h-opt" title="Optimizations" hint="Things that could save money or time." count={h.optimizations.length}>{h.optimizations.map((f) => <Finding key={f.id} f={f} />)}</Section>
      <Section id="h-other" title="Other things the AI noticed" count={h.other.length}>{h.other.map((f) => <Finding key={f.id} f={f} />)}</Section>

      {h.errorsWaiting.length > 0 && <p className="small muted">{h.errorsWaiting.length} acknowledged error{h.errorsWaiting.length === 1 ? ' is' : 's are'} waiting for the team member: {h.errorsWaiting.map((e) => e.personName).join(', ')}.</p>}

      <details className="soft">
        <summary>What changed since you last looked <span className="count">{o.changeCount} new</span></summary>
        <div className="stack" style={{ marginTop: 'var(--sp-3)' }}>
          <p className="small muted" style={{ margin: 0 }}>Since {formatDateTime(o.lastOwnerLookAt)}. If something is not listed, it does not mean nobody worked.</p>
          <p style={{ margin: 0 }}>{o.changeCount} new history note{o.changeCount === 1 ? '' : 's'}{unread ? ` · ${unread} unread notification${unread === 1 ? '' : 's'}` : ''}. <Link to="/notifications">Open all notifications</Link></p>
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
