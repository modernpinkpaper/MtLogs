import { Link } from 'react-router-dom';
import { useAct, useMe } from '../hubContext';
import { Chip } from '../common';

const INTEGRATIONS = [
  ['Production Firebase clock-in app', 'Not connected — requires your explicit approval'],
  ['Google Sheets project trackers (team + private)', 'Not connected — a read-only import simulator is a later step'],
  ['Google Drive / MT Log hourly files', 'Not connected — synthetic files are used'],
  ['MT Log local API / Tampermonkey helper', 'Not connected'],
  ['Amazon / Etsy / Shopify (verification connectors)', 'Simulated only'],
  ['Claude / LLM provider', 'Disabled — replay adapter, $0'],
  ['Email / push / Teams', 'Not connected — in-app notifications only'],
];

export function Settings() {
  const { hub, uid, me } = useMe();
  const act = useAct();
  const s = hub.state.settings;
  const owner = me.role === 'OWNER';
  const spend = hub.monthSpendUsd();
  const audit = () => {
    const data = JSON.stringify(hub.getAudit(uid), null, 2);
    const url = URL.createObjectURL(new Blob([data], { type: 'application/json' }));
    const a = document.createElement('a'); a.href = url; a.download = 'audit-export-demo.json'; a.click(); URL.revokeObjectURL(url);
  };
  return (
    <div className="stack">
      <h1>Settings</h1>
      <section className="card"><h2>Integration status</h2>
        <div className="tablewrap"><table><tbody>{INTEGRATIONS.map(([k, v]) => <tr key={k}><td>{k}</td><td><Chip tone="gray" glyph="○">{v}</Chip></td></tr>)}</tbody></table></div>
        <p className="small muted">The app never claims an integration is connected unless it is. See <Link to="/status">Build status</Link> for the full checklist.</p></section>
      <section className="card"><h2>Notifications</h2>
        <p className="small">In-app notifications are always on. Email is for urgent events only and is <strong>simulated</strong> here (no email is ever sent).</p>
        <label style={{ fontWeight: 500 }}><input type="checkbox" disabled={!owner} checked={s.emailUrgentOptIn} onChange={(e) => act(() => hub.updateSettings(uid, { emailUrgentOptIn: e.target.checked }))} /> Email me for urgent events (simulated){!owner && ' — owner only'}</label></section>
      {owner ? (
        <>
          <section className="card"><h2>Review scheduling</h2>
            <p className="small">Target: review cards ready within <strong>{s.reviewReadyTargetMinutes} minutes</strong> of clock-out when sources are healthy (a goal, not a promise). Backup finalization of the prior workday by <strong>{s.backupReadyLocalTime} CT</strong>. Indexing about every 5 minutes; AI analysis every 30–60 minutes during assigned shifts. Friday: weekly report.</p>
            <div className="row"><label className="row" style={{ margin: 0 }}>Ready target (min) <input type="number" style={{ width: 90 }} value={s.reviewReadyTargetMinutes} onChange={(e) => act(() => hub.updateSettings(uid, { reviewReadyTargetMinutes: Number(e.target.value) || 20 }))} /></label></div></section>
          <section className="card"><h2>AI budget</h2>
            <p>Spent this month: <strong>${spend.toFixed(2)}</strong>. Prototype default: $0 (no API calls).</p>
            <div className="row">
              <label className="row" style={{ margin: 0 }}>Monthly budget ($) <input type="number" style={{ width: 110 }} value={s.monthlyBudgetUsd} onChange={(e) => act(() => hub.updateSettings(uid, { monthlyBudgetUsd: Number(e.target.value) || 100 }))} /></label>
              <label className="row" style={{ margin: 0 }}>Warn at (%) <input type="number" style={{ width: 90 }} value={s.budgetWarnPct} onChange={(e) => act(() => hub.updateSettings(uid, { budgetWarnPct: Number(e.target.value) || 80 }))} /></label>
              <label className="row" style={{ margin: 0 }}>Pause optional AI at (%) <input type="number" style={{ width: 90 }} value={s.budgetCircuitBreakerPct} onChange={(e) => act(() => hub.updateSettings(uid, { budgetCircuitBreakerPct: Number(e.target.value) || 100 }))} /></label>
            </div>
            <p className="small muted">Target about $100/month all-in (roughly $50–$125), not a guarantee. When the circuit-breaker trips, optional research pauses first; clocking, update requests and employee reviews keep working. Billing alerts alone are not a hard cap.</p></section>
          <section className="card"><h2>Privacy, retention & export</h2>
            <p className="small">Raw click-level logs: keep {s.retentionDays.raw} days (proposal). Business history & audit: {Math.round(s.retentionDays.business / 365)} years (proposal). Retention needs your and legal advice before going live.</p>
            <div className="row"><button onClick={audit}>Export audit log (JSON)</button><span className="small muted">Owner-only; contains no raw keystrokes or screenshots — none are collected.</span></div></section>
        </>
      ) : <section className="card flat muted">Budget, retention and export settings are owner-only (enforced in the data layer, not just hidden here).</section>}
      <section className="card"><h2>What the system does and doesn’t collect</h2>
        <ul className="small" style={{ margin: '0 0 0 1.1rem' }}><li>Operational events: app/file names, print jobs, script outcomes — not keystrokes, passwords or private messages.</li><li>Screenshots are never routine; a future SOP-recording mode would be opt-in and visible.</li><li>You can correct or reject anything the AI infers (“Not my work”). Corrections are kept next to the original.</li><li>Missing activity never means someone wasn’t working.</li></ul></section>
    </div>
  );
}
