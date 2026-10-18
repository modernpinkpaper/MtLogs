import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAct, useMe } from '../hubContext';
import { Chip, Modal, useNarrow } from '../common';
import { shortProjectName } from '../../domain/reviewKinds';
import { RequestUpdateDialog } from '../dialogs';
import { ProjectInfo } from '../projectRef';
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
    ...(ai.approvedUnassigned ? ai.unassignedProjects.map((p) => ({ kind: 'Choose who works on it', label: `${p.key} “${p.title}” is approved but nobody is assigned`, title: `${shortProjectName(p)} — Choose who works on it`, why: 'You approved it, but nobody can see it yet.', cta: 'Choose who works on it', chip: 'Needs an assignee', link: `/projects/${p.id}?assign=1`, weight: 96, projectId: p.id, technical: [] as string[], group: 'DECISION' as const, action: undefined })) : []),
    ...(ai.urgent ? [{ kind: 'Urgent AI recommendation', label: `${ai.urgent} urgent recommendation${ai.urgent === 1 ? '' : 's'} need a look`, title: ai.urgent === 1 ? 'An urgent AI opportunity needs your decision' : `${ai.urgent} urgent AI opportunities need your decision`, why: 'The AI found something that may cost you if it waits.', cta: 'Review it', chip: 'Urgent', link: '/owner/ai', weight: 99, projectId: undefined, technical: [] as string[], group: 'AI' as const, action: undefined }] : []),
    ...(ai.needsDecision - ai.urgent > 0 ? [{ kind: 'AI Recommendations', label: `${ai.needsDecision - ai.urgent} recommendation${ai.needsDecision - ai.urgent === 1 ? '' : 's'} waiting for your decision`, title: ai.needsDecision - ai.urgent === 1 ? 'New AI opportunity needs your approval' : `${ai.needsDecision - ai.urgent} AI opportunities need your decision`, why: 'Nothing becomes a project until you approve it.', cta: 'Review opportunities', chip: 'Your decision', link: '/owner/ai', weight: 55, projectId: undefined, technical: [] as string[], group: 'AI' as const, action: undefined }] : []),
    ...o.queue,
  ].sort((a, b) => b.weight - a.weight);
  const narrow = useNarrow();
  const [details, setDetails] = useState(false);
  const [confirmItem, setConfirmItem] = useState<(typeof decisions)[number] | null>(null);
  if (narrow) {
    const SECTIONS: { id: 'DECISION' | 'URGENT' | 'REPLY' | 'PAUSED' | 'AI' | 'OTHER'; title: string }[] = [
      { id: 'DECISION', title: 'Needs your decision' }, { id: 'URGENT', title: 'Urgent problems' }, { id: 'REPLY', title: 'New replies from your team' },
      { id: 'PAUSED', title: 'Paused projects to review' }, { id: 'AI', title: 'New AI opportunities' }, { id: 'OTHER', title: 'Other' },
    ];
    const pcm = o.counts;
    return (
      <div className="stack">
        <div className="pagehead">
          <div>
            <h1>Home</h1>
            <p>{decisions.length === 0 ? 'Nothing needs you right now.' : `${decisions.length} thing${decisions.length === 1 ? ' needs' : 's need'} you.`} <Link to="/projects">{pcm.team} team active{pcm.private ? `, ${pcm.private} private` : ''}{pcm.paused ? `, ${pcm.paused} paused` : ''}</Link></p>
          </div>
        </div>
        {decisions.length === 0 && <div className="card focal"><div className="eyebrow">All clear</div><p className="focus-title">You are all caught up.</p></div>}
        {SECTIONS.map((sec) => {
          const items = decisions.filter((d) => (d.group ?? 'OTHER') === sec.id);
          if (!items.length) return null;
          return (
            <section key={sec.id} aria-label={sec.title}>
              <h2 className="group-title">{sec.title} <span className="count">{items.length}</span></h2>
              <div className="card list">
                {items.map((q, i) => (
                  <div key={i} className="mrow">
                    <div className="t">{q.title}{q.projectId && <ProjectInfo projectId={q.projectId} label={q.title} />}</div>
                    <div className="small muted">{q.why}</div>
                    <div className="row" style={{ marginTop: 6 }}>
                      {q.action?.type === 'APPROVE_VERSION' && <button className="primary" onClick={() => setConfirmItem(q)}>{q.action.label}</button>}
                      {q.action?.type === 'MARK_SEEN' && <button onClick={() => act(() => hub.acknowledge(uid, q.action!.type === 'MARK_SEEN' ? (q.action as { notificationId: string }).notificationId : ''), 'Marked as seen')}>{q.action.label}</button>}
                      <Link to={q.link}><button className={q.action ? 'quiet' : ''}>{q.cta}</button></Link>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          );
        })}
        <div className="row"><button onClick={() => setReq(true)}>Ask for an update</button></div>
        {confirmItem?.action?.type === 'APPROVE_VERSION' && (
          <Modal title="Please confirm" onClose={() => setConfirmItem(null)}>
            <div className="stack">
              <p style={{ margin: 0 }}>{confirmItem.action.confirm}</p>
              <div className="row">
                <button className="primary" onClick={async () => { const a = confirmItem.action as { resourceId: string; version: string }; const r = await act(() => hub.approveVersion(uid, a.resourceId, a.version), 'Approved. It is recorded in the history.'); if (r) setConfirmItem(null); }}>Yes, approve</button>
                <button className="quiet" onClick={() => setConfirmItem(null)}>Not now</button>
              </div>
            </div>
          </Modal>
        )}
        {req && <RequestUpdateDialog onClose={() => setReq(false)} />}
      </div>
    );
  }
  const first = decisions[0];
  const others = decisions.slice(1);
  const shown = all ? others : others.slice(0, 4);
  const pc = o.counts;

  return (
    <div className="stack">
      <div className="pagehead">
        <div>
          <h1>Home</h1>
          <p>
            {decisions.length === 0 ? 'Nothing needs you right now.' : `${decisions.length} thing${decisions.length === 1 ? ' needs' : 's need'} you.`}{' '}
            <Link to="/projects">{pc.team} team project{pc.team === 1 ? '' : 's'} active</Link>
            {pc.private > 0 && <>, <Link to="/projects?mine=1">{pc.private} private</Link></>}
            {pc.paused > 0 && <>, <Link to="/projects?status=PAUSED">{pc.paused} paused</Link></>}.
          </p>
        </div>
        <button onClick={() => setReq(true)}>Ask for an update</button>
      </div>

      <section id="decide" className="card focal" aria-labelledby="dec">
        {!first ? (
          <>
            <div className="eyebrow" id="dec">All clear</div>
            <p className="focus-title">You are all caught up.</p>
            <p className="muted" style={{ margin: '.4rem 0 0' }}>New things that need you will show up here.</p>
          </>
        ) : (
          <>
            <div className="eyebrow" id="dec">Start here</div>
            <p className="focus-title" style={{ margin: '.35rem 0 .2rem' }}>{first.title}{first.projectId && <ProjectInfo projectId={first.projectId} label={first.title} />}</p>
            <p className="lead" style={{ margin: 0 }}>{first.why}</p>
            <div className="row" style={{ marginTop: 'var(--sp-4)' }}>
              <Link to={first.link}><button className="primary big">{first.cta}</button></Link>
              {(first.technical?.length ?? 0) > 0 && <button className="link small" onClick={() => setDetails(!details)} aria-expanded={details}>{details ? 'Hide technical details' : 'View technical details'}</button>}
            </div>
            {details && first.technical && <ul className="small smallnote" style={{ margin: 'var(--sp-3) 0 0', paddingLeft: '1.2rem' }}>{first.technical.map((t) => <li key={t}>{t}</li>)}</ul>}
            {others.length > 0 && (
              <div style={{ marginTop: 'var(--sp-5)' }}>
                <h3 style={{ marginBottom: 0 }}>Other items needing attention <span className="count">({others.length})</span></h3>
                <div className="list">
                  {shown.map((q, i) => (
                    <Link key={i} to={q.link} className="lrow">
                      <span className="t" style={{ fontWeight: 550 }}>{q.title}</span>
                      <span className="m"><span>{q.chip}</span></span>
                    </Link>
                  ))}
                </div>
                {others.length > 4 && <button className="link small" onClick={() => setAll(!all)}>{all ? 'Show fewer' : `Show all ${others.length}`}</button>}
              </div>
            )}
          </>
        )}
      </section>

      <details className="soft">
        <summary>What changed since you last looked <span className="count">{o.changeCount} new</span></summary>
        <div className="stack" style={{ marginTop: 'var(--sp-3)' }}>
          <p className="small muted" style={{ margin: 0 }}>Since {formatDateTime(o.lastOwnerLookAt)}. If something is not listed, it does not mean nobody worked.</p>
          <p style={{ margin: 0 }}>{o.changeCount} new history note{o.changeCount === 1 ? '' : 's'}{unread ? ` · ${unread} unread notification${unread === 1 ? '' : 's'}` : ''}. <Link to="/notifications">Open notifications</Link></p>
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
