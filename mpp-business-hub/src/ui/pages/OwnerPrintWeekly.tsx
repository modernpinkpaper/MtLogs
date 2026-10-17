import { useMe } from '../hubContext';
import { Chip } from '../common';
import { formatDateTime, formatDuration, formatTime } from '../../domain/time';

export function OwnerPrintWeekly() {
  const { hub, uid } = useMe();
  const w = hub.weeklyPrintReport(uid);
  return (
    <div className="stack">
      <div><h1>Weekly print review <Chip tone="violet" glyph="◆">Demo data</Chip></h1><p className="muted">{w.weekStart} → {w.weekEnd} · data through {formatDateTime(w.dataThrough)} · owner only</p></div>
      <div className="card info"><strong>Read this first</strong><ul style={{ margin: '.3rem 0 0 1.1rem' }}>{w.caveats.map((c) => <li key={c}>{c}</li>)}</ul></div>

      <section className="card"><h2>Printers</h2>
        <div className="tablewrap"><table><thead><tr><th>Printer</th><th>Jobs</th><th>Completed</th><th>Failed</th><th>Retries</th><th>Sheets</th><th>Run time</th><th>Incidents</th></tr></thead><tbody>
          {w.printers.map((p) => <tr key={p.printer}><td>{p.printer}</td><td>{p.jobs}</td><td>{p.completed}</td><td>{p.failed}</td><td>{p.retries}</td><td>{p.sheets}</td><td>{formatDuration(p.runMinutes)}</td><td>{p.incidents.length} <span className="muted small">({p.rawProblemSnapshots} snapshots)</span></td></tr>)}</tbody></table></div>
      </section>

      <section className="card"><h2>Problem incidents (deduplicated)</h2>
        <p className="small muted">{w.rawSnapshots} raw “problem” snapshots collapse into {w.episodes.length} incidents. Snapshots are repeated status readings, not separate failures.</p>
        <div className="tablewrap"><table><thead><tr><th>Printer</th><th>Kind</th><th>Started</th><th>Ended</th><th>Duration</th><th>Snapshots</th></tr></thead><tbody>
          {w.episodes.map((e) => <tr key={e.id}><td>{e.printer}</td><td>{e.kind.toLowerCase()}</td><td>{formatDateTime(e.startedAt)}</td><td>{e.endedAt ? formatTime(e.endedAt) : 'open'}</td><td>{e.durationMin != null ? formatDuration(e.durationMin) : '—'}</td><td>{e.snapshotCount}</td></tr>)}</tbody></table></div>
        <p className="small muted">For notable incidents, the exact window is shown so a manager can review it with context. This is not an accusation.</p>
      </section>

      <section className="card"><h2>Machine and computer activity (observed states)</h2>
        <div className="legend" style={{ marginBottom: 8 }}>
          <span><i className="seg-both" />Both engaged</span><span><i className="seg-machine" />Machine only</span><span><i className="seg-person" />Person only</span><span><i className="seg-neither" />Neither observed</span><span><i className="seg-none" />No log coverage</span></div>
        <div className="stack">{w.stations.map((s) => {
          const f = s.fourState; const tot = Object.values(f).reduce((a, b) => a + b, 0) || 1;
          const seg = (k: keyof typeof f, cls: string) => <span className={cls} style={{ width: `${(f[k] / tot) * 100}%` }} title={`${k}: ${f[k]} min`} />;
          return (
            <div key={s.deviceId}>
              <div className="row between"><strong>{s.deviceId}</strong><span className="small muted">{s.defaultUser} · {s.jobType?.toLowerCase()} · {s.printers.join(', ')}</span></div>
              <div className="bar" role="img" aria-label={`${s.deviceId}: both ${f.BOTH_ENGAGED} min, machine only ${f.MACHINE_ONLY}, person only ${f.PERSON_ONLY}, neither ${f.NEITHER_OBSERVED}, no coverage ${f.NO_COVERAGE}`}>
                {seg('BOTH_ENGAGED', 'seg-both')}{seg('MACHINE_ONLY', 'seg-machine')}{seg('PERSON_ONLY', 'seg-person')}{seg('NEITHER_OBSERVED', 'seg-neither')}{seg('NO_COVERAGE', 'seg-none')}</div>
              <div className="small muted">Minutes — both: {f.BOTH_ENGAGED}, machine only: {f.MACHINE_ONLY}, person only: {f.PERSON_ONLY}, neither observed: {f.NEITHER_OBSERVED}, <strong>no coverage: {f.NO_COVERAGE}</strong></div>
              {s.coverageGaps.map((g, i) => <div key={i} className="small" style={{ color: 'var(--warn)' }}>⚠ Logger gap {formatDateTime(g.from)} → {formatTime(g.to)} ({g.minutes} min). Not counted as “neither observed”.</div>)}
            </div>);})}</div>
        <p className="small muted">“Machine only” can mean someone is feeding, packing or handling product. A person can be productive away from the keyboard.</p>
      </section>

      <section className="card"><h2>Comparisons</h2>
        {w.comparisons.map((c) => <div key={c.jobType} className="small"><strong>{c.jobType.toLowerCase()}</strong>: {c.comparable ? 'comparable stations present' : 'only one station does this work — no like-for-like comparison is possible, so none is shown.'}</div>)}
        <p className="small muted">Different job types, printers and training are never ranked against each other.</p>
      </section>

      <section className="card"><h2>Opportunities (hypotheses, not confirmed causes)</h2>
        {w.opportunities.map((o) => <p key={o.id} className="small"><strong>{o.title}</strong> — {o.rootCauseHypothesis} <a href="#/owner/insights">Review in Insights</a></p>)}
      </section>
    </div>
  );
}
