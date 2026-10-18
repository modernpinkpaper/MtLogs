import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMe } from '../hubContext';
import { LogTaskDialog } from '../dialogs';
import { ProjectInfo } from '../projectRef';
import { shortProjectName } from '../../domain/reviewKinds';
import { Chip, Empty, StepState } from '../common';
import { formatDate, formatDateTime } from '../../domain/time';
import { notReadyReason, pauseLine } from '../../domain/projectStatus';
import { TERMINAL } from '../../server/hub';
import type { Project, Step } from '../../domain/types';

/**
 * My Work answers four questions: What should I do next? How? Where are the files? What do I need to confirm?
 * Groups: Needs a response · Next to work on · Waiting or blocked · Paused · Recently finished.
 */
export function MyWork() {
  const { hub, uid, me } = useMe();
  const projects = hub.listProjects(uid);
  const shift = hub.openShift(uid);
  const cards = hub.outstandingCards(uid);
  const requests = cards.filter((c) => c.cardType === 'OWNER_REQUEST');
  const others = cards.length - requests.length;
  const area = hub.areaOn(uid);
  const stepsOf = (p: Project) => hub.projectSteps(uid, p.id);

  type Row = { p: Project; s: Step; why: string | null };
  const mine: Row[] = [];
  for (const p of projects) {
    const steps = stepsOf(p);
    for (const s of steps.filter((x) => !x.parentStepId && x.assignedUids.includes(uid) && !TERMINAL.includes(x.status) && x.status !== 'REPORTED_COMPLETE')) {
      mine.push({ p, s, why: p.pause?.isPaused ? null : notReadyReason(s, steps, p) });
    }
  }
  const active = mine.filter((r) => !r.p.pause?.isPaused);
  const byDue = (a: Row, b: Row) => (a.s.dueAt ?? '9').localeCompare(b.s.dueAt ?? '9') || a.p.key.localeCompare(b.p.key);
  const ready = active.filter((r) => !r.why).sort(byDue);
  const waiting = active.filter((r) => r.why).sort(byDue);
  const pausedProjects = projects.filter((p) => p.pause?.isPaused && !p.closedAt);
  const recent = projects.flatMap((p) => stepsOf(p).filter((s) => s.assignedUids.includes(uid) && ['REPORTED_COMPLETE', 'VERIFIED_COMPLETE'].includes(s.status) && !s.parentStepId).map((s) => ({ p, s })))
    .sort((a, b) => (b.s.lastConfirmedAt ?? '').localeCompare(a.s.lastConfirmedAt ?? '')).slice(0, 5);
  const saved = hub.myWorkLog(uid);
  const firstName = me.name.split(' ')[0];
  const [logging, setLogging] = useState(false);

  // The one thing to do first: a request from Dalia beats a step. Otherwise the first ready step.
  const firstReq = requests[0];
  const hero = ready[0];
  const rest = ready.slice(hero ? 1 : 0);
  const groups = new Map<string, { p: Project; rows: Row[] }>();
  for (const r of rest) { const g = groups.get(r.p.id) ?? { p: r.p, rows: [] }; g.rows.push(r); groups.set(r.p.id, g); }

  return (
    <div className="stack">
      <div className="row between">
        <h1 style={{ margin: 0 }}>Hi {firstName} 👋</h1>
        <span className="row small">
          <Chip tone={shift ? 'ok' : 'gray'} glyph={shift ? '●' : '○'}>{shift ? 'Pay clock is running' : 'Clocked out'}</Chip>
          {!shift && me.role === 'EMPLOYEE' && <Link to="/clock">Clock in</Link>}
          {(area === 'PRINT' || area === 'MIXED') && <Link to="/print/my-stats">Today’s printing</Link>}
          <button className="quiet" onClick={() => setLogging(true)}>Log something I did</button>
        </span>
      </div>

      {cards.length > 0 && (
        <div className="notice">
          <span>
            {firstReq
              ? <><strong>{hub.userName(hub.getRequest(uid, firstReq.updateRequestId!)?.requestedByUid ?? null)} asked you for an update.</strong>{requests.length > 1 ? ` (${requests.length} requests)` : ''}</>
              : <><strong>{others} item{others === 1 ? '' : 's'} to check.</strong> About 1 to 3 minutes, and it is paid time.</>}
          </span>
          <Link to={firstReq ? `/review?card=${firstReq.id}` : '/review'}><button>{firstReq ? 'Answer' : 'Check my work'}</button></Link>
        </div>
      )}

      {area === 'UNASSIGNED' && me.role === 'EMPLOYEE' && <div className="card flat">You have no jobs set up yet. Dalia will assign them.</div>}
      {!hero && area !== 'UNASSIGNED' && <Empty>No steps are ready right now. Nice work.</Empty>}

      {hero && (
        <section aria-labelledby="first" className="hero">
          <div className="eyebrow" id="first">Do this next</div>
          <h2>{hero.s.title}</h2>
          <div className="muted small">{hero.p.key} · {shortProjectName(hero.p)}<ProjectInfo projectId={hero.p.id} label={hero.p.key} />{hero.s.dueAt ? ` · Due ${formatDate(hero.s.dueAt)}` : ''}</div>
          {hero.s.instructions && <p className="clamp">{hero.s.instructions}</p>}
          <div className="row">
            <Link to={`/projects/${hero.p.id}/steps/${hero.s.id}`}><button className="primary big">Open this step</button></Link>
            <StepState status={hero.s.status} hold={!!hero.s.onHold} />
            {hero.s.observedLevel !== 'NO_EVIDENCE' && hero.s.observedReview === 'PENDING_EMPLOYEE' && <span className="small muted">We saw computer activity. Please check it when you can.</span>}
          </div>
        </section>
      )}

      {groups.size > 0 && (
        <section aria-labelledby="then">
          <h2 id="then" className="group-title">After that <span className="count">{rest.length}</span></h2>
          <div className="card list">
            {[...groups.values()].map(({ p, rows }) => (
              <div key={p.id} className="lgroup">
                <div className="lhead"><Link to={`/projects/${p.id}`}>{p.key} · {shortProjectName(p)}</Link><ProjectInfo projectId={p.id} label={p.key} /></div>
                {rows.map(({ s }) => <StepLine key={s.id} p={p} s={s} />)}
              </div>
            ))}
          </div>
        </section>
      )}

      {waiting.length > 0 && (
        <details className="soft">
          <summary>Waiting on something else <span className="count">{waiting.length}</span></summary>
          <div className="card list" style={{ marginTop: 8 }}>
            {waiting.map(({ p, s, why }) => <StepLine key={s.id} p={p} s={s} why={why} withProject />)}
          </div>
        </details>
      )}

      {pausedProjects.length > 0 && (
        <details className="soft">
          <summary>Paused projects <span className="count">{pausedProjects.length}</span></summary>
          <div className="card list" style={{ marginTop: 8 }}>
            {pausedProjects.map((p) => (
              <Link key={p.id} to={`/projects/${p.id}`} className="lline">
                <span className="t">{p.key} — {p.title}<span className="small muted"> · {pauseLine(p, false)}</span></span>
                <span className="small muted">Your work is saved.</span>
              </Link>))}
          </div>
        </details>
      )}

      {recent.length > 0 && (
        <details className="soft">
          <summary>Recently finished <span className="count">{recent.length}</span></summary>
          <div className="card list" style={{ marginTop: 8 }}>
            {recent.map(({ p, s }) => <StepLine key={s.id} p={p} s={s} withProject extra={formatDateTime(s.lastConfirmedAt)} />)}
          </div>
        </details>
      )}

      {saved.length > 0 && (
        <details className="soft">
          <summary>Other work you saved <span className="count">{saved.length}</span></summary>
          <div className="card list" style={{ marginTop: 8 }}>
            {saved.map((w) => (
              <div key={w.id} className="lline static"><span className="t">{w.title}</span><span className="small muted">{w.kind === 'EVERYDAY' ? 'Everyday work' : w.kind === 'SMALL_TASK' ? 'Small task you logged' : 'Maybe a new project'} · {formatDateTime(w.loggedAt)}</span></div>))}
          </div>
        </details>
      )}
      {logging && <LogTaskDialog onClose={() => setLogging(false)} />}
    </div>
  );
}

/** One quiet row. The whole row is the link, so there is no repeated button. */
function StepLine({ p, s, why, withProject, extra }: { p: Project; s: Step; why?: string | null; withProject?: boolean; extra?: string }) {
  return (
    <Link to={`/projects/${p.id}/steps/${s.id}`} className="lline">
      <span className="t">Step {s.sortOrder}: {s.title}{withProject && <span className="small muted"> · {p.key}</span>}</span>
      <span className="small muted when">{why ? `Waiting: ${why}` : extra ?? (s.dueAt ? `Due ${formatDate(s.dueAt)}` : '')}</span>
      <StepState status={s.status} hold={!!s.onHold} />
    </Link>
  );
}