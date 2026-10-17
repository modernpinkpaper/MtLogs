import { useState } from 'react';
import { useMe } from '../hubContext';
import { Chip, CoverageChip } from '../common';
import { formatDateTime, formatTime } from '../../domain/time';

export function OwnerDataIntake() {
  const { hub, uid } = useMe();
  const o = hub.intakeOverview(uid);
  const [trace, setTrace] = useState<string | null>(null);
  const t = trace ? hub.traceFinding(uid, trace) : null;
  return (
    <div className="stack">
      <div><h1>Data intake & AI activity <Chip tone="violet" glyph="◆">Synthetic values</Chip></h1>
        <p className="muted">What arrived, how often, what it means. A synced file is not a finished analysis; a finding is not a completed review.</p></div>
      {(o.settings.aiOutage || o.settings.logSyncOutage) && <div className="card warn" role="status">{o.settings.logSyncOutage ? 'Google Drive log sync is delayed (demo toggle). ' : ''}{o.settings.aiOutage ? 'The AI provider is unavailable (demo toggle). ' : ''}Clocking, requests and messages keep working. Missing data is not “no work”.</div>}
      <div className="grid cols-2">{o.devices.map((d) => (
        <section key={d.deviceId} className="card stack">
          <div className="row between"><h2>MT Log — {d.deviceId}</h2><CoverageChip state={d.coverage} /></div>
          <dl className="kv">
            <dt>Last event</dt><dd>{d.lastEvent ? formatTime(d.lastEvent) : '—'}</dd>
            <dt>Last run added</dt><dd>{d.lastRun?.added ?? 0} events · indexed {d.lastRun?.indexed ?? 0} · deduplicated {d.lastRun?.deduplicated ?? 0} · parse failures {d.lastRun?.parseFailures ?? 0}</dd>
            <dt>Actor</dt><dd>{d.actorNote}</dd>
            <dt>Work episodes</dt><dd>{d.episodes}</dd>
            <dt>Related projects</dt><dd>{d.relatedProjects.join(', ') || 'none suggested'}</dd>
            <dt>Checked at</dt><dd>{formatDateTime(hub.now)} <span className="muted">(poll time)</span></dd>
            <dt>Data through</dt><dd>{d.lastRun?.dataThrough ? formatTime(d.lastRun.dataThrough) : '—'} <span className="muted">(coverage watermark — shown separately)</span></dd>
          </dl>
          {d.archives.map((a) => (
            <div key={a.id} className="small card flat">
              <strong>{a.hourWindow}:00 file</strong> rev {a.revision} · {a.eventCount} events · <CoverageChip state={a.coverageState} />{a.partialTail && <> <Chip tone="warn" glyph="…">file still being written</Chip></>}
              <div className="muted">file <code>{a.fileId}</code> · hash {a.hash} · cursor line {a.lastProcessedLine} · duplicates skipped {a.duplicatesSkipped}</div>
              {a.sequenceGaps.map((g) => <div key={g} style={{ color: 'var(--bad)' }}>⚠ {g}</div>)}
            </div>))}
          <details><summary>Run history ({d.runs.length})</summary>
            {d.runs.slice().reverse().map((r) => (
              <div key={r.id} className="small" style={{ marginTop: 6 }}>
                <strong>{formatDateTime(r.startedAt)}</strong> — +{r.added} events
                <ol style={{ margin: '.2rem 0 0 1.1rem' }}>{r.stages.map((s, i) => <li key={i}>{s.name} <Chip tone={s.state === 'DONE' ? 'ok' : s.state === 'FAILED' ? 'bad' : s.state === 'PENDING' ? 'warn' : 'gray'}>{s.state.toLowerCase()}</Chip>{s.error && <span style={{ color: 'var(--bad)' }}> {s.error}</span>}</li>)}</ol>
              </div>))}</details>
        </section>))}</div>

      <section className="card"><h2>AI runs & cost</h2>
        <p>This month: <strong>${o.monthSpendUsd.toFixed(2)}</strong> of ${o.budget} budget. The prototype makes <strong>no paid API calls</strong>; findings come from a labeled replay adapter.</p>
        <div className="tablewrap"><table><thead><tr><th>Started</th><th>Cause</th><th>Adapter</th><th>Outcome</th><th>Cost</th><th>Notes</th></tr></thead><tbody>
          {o.aiRuns.map((r) => <tr key={r.id}><td>{formatDateTime(r.startedAt)}</td><td>{r.cause}</td><td className="small">{r.model}</td><td><Chip tone={r.outcome === 'OK' ? 'ok' : r.outcome === 'FAILED' ? 'bad' : 'warn'}>{r.outcome.toLowerCase()}</Chip></td><td>${r.costUsd.toFixed(2)}</td><td className="small">{r.errors.join(' ')}</td></tr>)}</tbody></table></div>
      </section>

      <section className="card"><h2>Findings & audit trace</h2>
        <p className="small muted">source file → normalized event → work episode → finding → review card → human decision → journal</p>
        <div className="tablewrap"><table><thead><tr><th>Finding</th><th>Status</th><th>Claim</th><th></th></tr></thead><tbody>
          {o.findings.slice(0, 15).map((f) => <tr key={f.id}><td className="small">{f.headline}</td><td><Chip tone={f.status === 'PROPOSED' ? 'violet' : 'info'}>{f.status.toLowerCase()}</Chip></td><td className="small">{f.claimType.replace(/_/g, ' ').toLowerCase()}</td><td><button onClick={() => setTrace(f.id)}>Trace</button></td></tr>)}</tbody></table></div>
        {t && (
          <div className="card flat stack" style={{ marginTop: 8 }}>
            <strong>Trace: {t.finding.id}</strong>
            <div className="small">1. Source files: {t.archives.map((a) => `${a.deviceId} ${a.hourWindow}:00 (rev ${a.revision})`).join(', ')}</div>
            <div className="small">2. Events: {t.events.map((e) => e.id).join(', ')}</div>
            <div className="small">3. Episodes: {t.episodes.map((e) => `${e.id} (${formatTime(e.startedAt)}–${formatTime(e.endedAt)})`).join(', ')}</div>
            <div className="small">4. Finding: {t.finding.id} · {t.finding.findingType} · model run {t.finding.modelRunId} · prompt {t.finding.promptVersion}</div>
            <div className="small">5. Review cards: {t.cards.map((c) => `${c.id} (${c.status})`).join(', ') || '—'}</div>
            <div className="small">6. Human decisions: {t.decisions.map((d) => `${d.id}: ${d.selectedAction} by ${hub.userName(d.actorUid)}`).join(', ') || 'none yet'}</div>
            <div className="small">7. Journal entries: {t.journal.map((j) => j.title).join('; ') || '—'}</div>
          </div>)}
      </section>
    </div>
  );
}
