import { useMe } from '../hubContext';
import { useState } from 'react';
import { Chip } from '../common';
import { chicagoDate } from '../../domain/time';
import { formatDateTime, formatDuration, formatTime } from '../../domain/time';

export function OwnerPrintWeekly({ embedded }: { embedded?: boolean } = {}) {
  const { hub, uid } = useMe();
  const w = hub.weeklyPrintReport(uid);
  return (
    <div className="stack">
      {!embedded && (<div><h1>Weekly printing <Chip tone="violet" glyph="◆">Practice data</Chip></h1><p className="muted">{w.weekStart} to {w.weekEnd} · data up to {formatDateTime(w.dataThrough)} · only you can see this</p></div>)}
      <details className="soft readfirst">
        <summary>Before you read: these numbers are not pay records, and they do not rank people. <span className="muted" style={{ fontWeight: 400 }}>Show all notes</span></summary>
        <ul style={{ margin: '.5rem 0 0 1.1rem' }}>{w.caveats.map((c) => <li key={c}>{c}</li>)}</ul>
      </details>

      <PeopleNumbers />

      <section className="card"><h2>Printer activity <span className="small muted" style={{ fontWeight: 400 }}>(from MT Logs. This is machine activity, not orders or hours.)</span></h2>
        <div className="tablewrap"><table><thead><tr><th>Printer</th><th>Print jobs sent</th><th>Failed</th><th>Sent again</th><th>Incidents</th></tr></thead><tbody>
          {w.printers.map((p) => <tr key={p.printer}><td>{p.printer}</td><td>{p.jobs}</td><td>{p.failed}</td><td>{p.retries}</td><td>{p.incidents.length} <span className="muted small">({p.rawProblemSnapshots} messages)</span></td></tr>)}</tbody></table></div>
      </section>

      <section className="card"><h2>Printer problems (counted once each)</h2>
        <p className="small muted">The printers reported “problem” {w.rawSnapshots} times, but that was only {w.episodes.length} real problems. A printer repeats its message until it is fixed.</p>
        <div className="tablewrap"><table><thead><tr><th>Printer</th><th>Kind</th><th>Started</th><th>Ended</th><th>Duration</th><th>Repeat messages</th></tr></thead><tbody>
          {w.episodes.map((e) => <tr key={e.id}><td>{e.printer}</td><td>{e.kind.toLowerCase()}</td><td>{formatDateTime(e.startedAt)}</td><td>{e.endedAt ? formatTime(e.endedAt) : 'open'}</td><td>{e.durationMin != null ? formatDuration(e.durationMin) : '—'}</td><td>{e.snapshotCount}</td></tr>)}</tbody></table></div>
        <p className="small muted">We show the exact times so a manager can look at them with the full story. This is not blaming anyone.</p>
      </section>

      <section className="card"><h2>What the printer and computer were doing</h2>
        <div className="legend" style={{ marginBottom: 8 }}>
          <span><i className="seg-both" />Both busy</span><span><i className="seg-machine" />Printer only</span><span><i className="seg-person" />Computer only</span><span><i className="seg-neither" />Neither</span><span><i className="seg-none" />No data</span></div>
        <div className="stack">{w.stations.map((s) => {
          const f = s.fourState; const tot = Object.values(f).reduce((a, b) => a + b, 0) || 1;
          const seg = (k: keyof typeof f, cls: string) => <span className={cls} style={{ width: `${(f[k] / tot) * 100}%` }} title={`${k}: ${f[k]} min`} />;
          return (
            <div key={s.deviceId}>
              <div className="row between"><strong>{s.deviceId}</strong><span className="small muted">{s.defaultUser} · {s.jobType?.toLowerCase()} · {s.printers.join(', ')}</span></div>
              <div className="bar" role="img" aria-label={`${s.deviceId}: both ${f.BOTH_ENGAGED} min, machine only ${f.MACHINE_ONLY}, person only ${f.PERSON_ONLY}, neither ${f.NEITHER_OBSERVED}, no coverage ${f.NO_COVERAGE}`}>
                {seg('BOTH_ENGAGED', 'seg-both')}{seg('MACHINE_ONLY', 'seg-machine')}{seg('PERSON_ONLY', 'seg-person')}{seg('NEITHER_OBSERVED', 'seg-neither')}{seg('NO_COVERAGE', 'seg-none')}</div>
              <div className="small muted">Minutes — both busy: {f.BOTH_ENGAGED}, printer only: {f.MACHINE_ONLY}, computer only: {f.PERSON_ONLY}, neither: {f.NEITHER_OBSERVED}, <strong>no data: {f.NO_COVERAGE}</strong></div>
              {s.coverageGaps.map((g, i) => <div key={i} className="small" style={{ color: 'var(--warn)' }}>⚠ Data is missing from {formatDateTime(g.from)} → {formatTime(g.to)} ({g.minutes} min). We do not count this as “neither”.</div>)}
            </div>);})}</div>
        <p className="small muted">“Printer only” can mean someone is feeding paper or packing. A person can work hard without touching the keyboard.</p>
      </section>

      <section className="card"><h2>Comparisons</h2>
        {w.comparisons.map((c) => <div key={c.jobType} className="small"><strong>{c.jobType.toLowerCase()}</strong>: {c.comparable ? 'comparable stations present' : 'only one person does this work, so we cannot compare. We show nothing.'}</div>)}
        <p className="small muted">We never rank different jobs, printers or training against each other.</p>
      </section>

      <section className="card"><h2>Ideas (these are guesses, not proven)</h2>
        {w.opportunities.map((o) => <p key={o.id} className="small"><strong>{o.title}</strong> — {o.rootCauseHypothesis} <a href="#/owner/insights">See it in Ideas</a></p>)}
      </section>
    </div>
  );
}

/** Per person, from claimed orders. Hours are clock in to clock out, minus confirmed project time. */
function PeopleNumbers() {
  const { hub, uid } = useMe();
  const [days, setDays] = useState<0 | 1 | 2>(0);
  const today = chicagoDate(hub.now);
  const people = hub.listUsers(uid).filter((u) => u.active && (hub.state.claims ?? []).some((c) => c.uid === u.id));
  const rows = people.map((u) => ({ u, s: hub.printSummary(uid, u.id, today) }));
  const money = (n: number | null) => (n == null ? '—' : `$${n.toFixed(2)}`);
  return (
    <section className="card stack">
      <div className="row between"><h2 style={{ margin: 0 }}>People: orders and revenue</h2>
        <div className="row" role="group" aria-label="Time span">{['Last 30 days', 'Last 90 days', 'Last 180 days'].map((l, i) => <button key={l} className="pill-btn" aria-pressed={days === i} onClick={() => setDays(i as 0 | 1 | 2)}>{l}</button>)}</div></div>
      {!hub.state.claims ? <div className="card info small">Claimed orders are not connected to this copy yet, so there are no person numbers here. They will come from the print log. Nothing is made up.</div> : (
        <div className="tablewrap"><table><thead><tr><th>Person</th><th>Orders</th><th>Revenue</th><th>Average per day worked</th><th>Revenue per hour</th><th>Errors</th><th>Error rate</th></tr></thead><tbody>
          {rows.map(({ u, s }) => { const w = s.windows[days]; return <tr key={u.id}><td><strong>{u.name}</strong></td><td>{w.orders}</td><td>{money(w.revenue)}</td><td>{money(w.avgDailyRevenue)}</td><td>{money(w.revenuePerHour)}</td><td>{w.errors}</td><td>{w.errorRatePct == null ? '—' : `${w.errorRatePct.toFixed(2)}%`}</td></tr>; })}</tbody></table></div>
      )}
      <p className="small muted">An order counts as what the customer asked for (30 cards ordered is 30), not how many tries it took. Revenue per hour = revenue ÷ clocked hours, after taking out project time the person confirmed. Error rate = errors ÷ orders. These are numbers, not a ranking.</p>
    </section>
  );
}
