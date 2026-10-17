import { Link } from 'react-router-dom';
import { useMe } from '../hubContext';
import { Chip, Empty, ObservedChip, StatusChip } from '../common';
import { formatDate, formatDateTime } from '../../domain/time';
import { notReadyReason, pauseLine, projectWorkStatus } from '../../domain/projectStatus';
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

  return (
    <div className="stack">
      <div>
        <h1>Hi {firstName} 👋</h1>
        <div className="row">
          <Chip tone={shift ? 'ok' : 'gray'} glyph={shift ? '●' : '○'}>{shift ? 'Your pay clock is running' : 'You are clocked out'}</Chip>
          {!shift && me.role === 'EMPLOYEE' && <Link to="/clock">Clock in</Link>}
          {(area === 'PRINT' || area === 'MIXED') && <Link to="/print/my-stats">See today’s printing numbers</Link>}
        </div>
      </div>

      <section aria-labelledby="needs">
        <h2 id="needs" className="group-title">Needs a response <span className="count">{cards.length}</span></h2>
        {cards.length === 0 ? <Empty>Nothing is waiting for you.</Empty> : (
          <div className="card pink stack">
            {requests.map((c) => {
              const req = c.updateRequestId ? hub.getRequest(uid, c.updateRequestId) : null;
              const paused = c.projectId ? hub.getProject(uid, c.projectId).pause?.isPaused : false;
              return (
                <div key={c.id} className="row between">
                  <span><strong>{hub.userName(req?.requestedByUid ?? null)} asked:</strong> {c.explanatoryText}{paused && <> <Chip tone="violet" glyph="⏸">Project is paused</Chip></>}</span>
                  <Link to={`/review?card=${c.id}`}><button className="primary">Answer</button></Link>
                </div>
              );
            })}
            {others > 0 && <div className="row between"><span>{others} item{others === 1 ? '' : 's'} to review. It takes 1 to 3 minutes and you get paid for it.</span><Link to="/review"><button>Review my work</button></Link></div>}
            <p className="small muted" style={{ margin: 0 }}>You can clock in or out any time, even if these are not done.</p>
          </div>
        )}
      </section>

      <section aria-labelledby="next">
        <h2 id="next" className="group-title">Next to work on <span className="count">{ready.length}</span></h2>
        {area === 'UNASSIGNED' && me.role === 'EMPLOYEE' && <div className="card flat">You have no jobs set up yet. Dalia will assign them.</div>}
        {ready.length === 0 && area !== 'UNASSIGNED' && <Empty>No steps are ready right now.</Empty>}
        <div className="stack">
          {ready.slice(0, 5).map(({ p, s }) => <StepRow key={s.id} p={p} s={s} primary />)}
          {ready.length > 5 && <details><summary className="small">Show {ready.length - 5} more</summary><div className="stack" style={{ marginTop: 8 }}>{ready.slice(5).map(({ p, s }) => <StepRow key={s.id} p={p} s={s} />)}</div></details>}
        </div>
      </section>

      {waiting.length > 0 && (
        <section aria-labelledby="wait">
          <h2 id="wait" className="group-title">Waiting or blocked <span className="count">{waiting.length}</span></h2>
          <div className="stack">{waiting.map(({ p, s, why }) => <StepRow key={s.id} p={p} s={s} why={why} />)}</div>
        </section>
      )}

      <section aria-labelledby="paused">
        <details>
          <summary id="paused" className="group-title" style={{ cursor: 'pointer' }}>Paused projects <span className="count">{pausedProjects.length}</span></summary>
          {pausedProjects.length === 0 ? <p className="muted small">No paused projects.</p> : (
            <div className="stack">{pausedProjects.map((p) => (
              <Link key={p.id} to={`/projects/${p.id}`} className="card pcard" style={{ color: 'inherit', textDecoration: 'none' }}>
                <span className="name">{p.key} — {p.title}</span><span className="meta">{pauseLine(p, false)}</span>
                <span className="small muted">Your work is saved. When it resumes, you pick up where you left off.</span>
              </Link>))}</div>
          )}
        </details>
      </section>

      <section aria-labelledby="done">
        <details>
          <summary id="done" className="group-title" style={{ cursor: 'pointer' }}>Recently finished <span className="count">{recent.length}</span></summary>
          {recent.length === 0 ? <p className="muted small">Nothing finished yet.</p> : recent.map(({ p, s }) => (
            <div key={s.id} className="small" style={{ marginBottom: 4 }}><Link to={`/projects/${p.id}/steps/${s.id}`}>{p.key} · Step {s.sortOrder}: {s.title}</Link> <StatusChip status={s.status} /> <span className="muted">{formatDateTime(s.lastConfirmedAt)}</span></div>
          ))}
        </details>
      </section>

      {saved.length > 0 && (
        <section><details><summary className="group-title" style={{ cursor: 'pointer' }}>Other work you saved <span className="count">{saved.length}</span></summary>
          <div className="stack">{saved.map((w) => (
            <div key={w.id} className="card flat"><strong>{w.title}</strong> <Chip tone={w.kind === 'EVERYDAY' ? 'gray' : 'violet'}>{w.kind === 'EVERYDAY' ? 'Everyday work' : 'Maybe a new project'}</Chip>
              <div className="small muted">Saved {formatDateTime(w.loggedAt)}. Not part of a project. Dalia can see it.</div></div>))}</div></details></section>
      )}
    </div>
  );
}

function StepRow({ p, s, why, primary }: { p: Project; s: Step; why?: string | null; primary?: boolean }) {
  const status = projectWorkStatus(p, []);
  void status;
  return (
    <div className="card pcard">
      <div className="top"><span className="name">{p.key} · Step {s.sortOrder}: {s.title}</span></div>
      <div className="meta"><span>{p.title.slice(0, 60)}</span>{s.dueAt && <span>Due {formatDate(s.dueAt)}</span>}</div>
      <div className="row"><StatusChip status={s.status} hold={!!s.onHold} />{s.observedLevel !== 'NO_EVIDENCE' && s.observedReview === 'PENDING_EMPLOYEE' && <ObservedChip level={s.observedLevel} review={s.observedReview} />}</div>
      {why && <div className="small" style={{ color: 'var(--warn)' }}>Not ready: {why}</div>}
      <div className="act"><Link to={`/projects/${p.id}/steps/${s.id}`}><button className={primary ? 'primary' : ''}>Open this step</button></Link></div>
    </div>
  );
}
