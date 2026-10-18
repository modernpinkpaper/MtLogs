import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAct, useMe } from '../hubContext';
import { Chip, Modal } from '../common';
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
    ...(ai.approvedUnassigned ? ai.unassignedProjects.map((p) => ({ kind: 'Choose who works on it', label: `${p.key} “${p.title}” is approved but nobody is assigned`, title: `${shortProjectName(p)} — Choose who works on it`, why: 'You approved it, but nobody can see it yet.', cta: 'Choose who works on it', chip: 'Needs an assignee', link: `/projects/${p.id}?assign=1`, weight: 96, projectId: p.id, technical: [] as string[] })) : []),
    ...(ai.urgent ? [{ kind: 'Urgent AI recommendation', label: `${ai.urgent} urgent recommendation${ai.urgent === 1 ? '' : 's'} need a look`, title: ai.urgent === 1 ? 'An urgent AI opportunity needs your decision' : `${ai.urgent} urgent AI opportunities need your decision`, why: 'The AI found something that may cost you if it waits.', cta: 'Review it', chip: 'Urgent', link: '/owner/ai', weight: 99, projectId: undefined, technical: [] as string[] }] : []),
    ...(ai.needsDecision - ai.urgent > 0 ? [{ kind: 'AI Recommendations', label: `${ai.needsDecision - ai.urgent} recommendation${ai.needsDecision - ai.urgent === 1 ? '' : 's'} waiting for your decision`, title: ai.needsDecision - ai.urgent === 1 ? 'New AI opportunity needs your approval' : `${ai.needsDecision - ai.urgent} AI opportunities need your decision`, why: 'Nothing becomes a project until you approve it.', cta: 'Review opportunities', chip: 'Your decision', link: '/owner/ai', weight: 55, projectId: undefined, technical: [] as string[] }] : []),
    ...o.queue,
  ].sort((a, b) => b.weight - a.weight);
  const first = decisions[0];
  const others = decisions.slice(1);
  const shown = all ? others : others.slice(0, 4);
  const [details, setDetails] = useState(false);
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
