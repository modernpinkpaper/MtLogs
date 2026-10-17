import { Link } from 'react-router-dom';
import { useMe } from '../hubContext';
import { Chip, ObservedChip, StatusChip, Empty } from '../common';
import { formatDateTime } from '../../domain/time';
import { TERMINAL } from '../../server/hub';

export function MyWork() {
  const { hub, uid, me } = useMe();
  const projects = hub.listProjects(uid);
  const shift = hub.openShift(uid);
  const cards = hub.outstandingCards(uid);
  const requests = cards.filter((c) => c.cardType === 'OWNER_REQUEST');
  const area = hub.areaOn(uid);
  const mySteps = projects.flatMap((p) => hub.projectSteps(uid, p.id).filter((s) => s.assignedUids.includes(uid) && !TERMINAL.includes(s.status)).map((s) => ({ p, s })));
  const next = mySteps.filter(({ s }) => s.status !== 'BLOCKED');
  const blocked = mySteps.filter(({ s }) => s.status === 'BLOCKED');

  return (
    <div className="stack">
      <div><h1>Hi {me.name.split(' ')[0]} 👋</h1>
        <div className="row"><Chip tone={shift ? 'ok' : 'gray'} glyph={shift ? '●' : '○'}>{shift ? 'Paid time running' : 'Clocked out'}</Chip><Chip tone="gray">Today: {area.toLowerCase()}</Chip>
          {!shift && me.role === 'EMPLOYEE' && <Link to="/clock">Clock in →</Link>}</div></div>
      {requests.length > 0 && (
        <div className="card pink"><strong>{requests.length} update request(s) waiting</strong>
          {requests.map((c) => <div key={c.id}><Link to={`/review?card=${c.id}`}>{c.explanatoryText}</Link></div>)}</div>
      )}
      {cards.length > 0 && <div className="card info"><Link to="/review">{cards.length} review card(s) ready</Link> — about 1–3 minutes, paid.</div>}
      {area === 'UNASSIGNED' && <div className="card"><strong>No duties assigned yet.</strong> Your role is being confirmed; nothing is assumed.</div>}
      {(area === 'PRINT' || area === 'MIXED') && <div className="card flat"><Link to="/print/my-stats">See today’s print figures →</Link></div>}
      <section>
        <h2>Your next steps</h2>
        {next.length === 0 && <Empty>No open steps assigned to you.</Empty>}
        <div className="stack">{next.map(({ p, s }) => (
          <Link key={s.id} to={`/projects/${p.id}/steps/${s.id}`} className="card" style={{ display: 'block', color: 'inherit', textDecoration: 'none' }}>
            <div className="row between"><strong>{p.key} · Step {s.sortOrder}: {s.title}</strong><span className="small muted">{s.dueAt ? `Due ${formatDateTime(s.dueAt)}` : ''}</span></div>
            <div className="row" style={{ marginTop: 6 }}><StatusChip status={s.status} />{s.observedLevel !== 'NO_EVIDENCE' && <ObservedChip level={s.observedLevel} review={s.observedReview} />}</div>
            {s.observedLevel !== 'NO_EVIDENCE' && s.status !== 'IN_PROGRESS' && <div className="small muted" style={{ marginTop: 4 }}>AI noticed activity on Step {s.sortOrder}, but the official status is different — confirm or correct it in your review.</div>}
          </Link>))}</div>
      </section>
      {blocked.length > 0 && <section><h2>Blocked</h2>{blocked.map(({ p, s }) => <div key={s.id} className="card bad"><Link to={`/projects/${p.id}/steps/${s.id}`}>{p.key} · {s.title}</Link><div className="small">{s.blockerReason}</div></div>)}</section>}
    </div>
  );
}
