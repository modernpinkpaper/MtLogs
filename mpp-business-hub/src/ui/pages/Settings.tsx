import { Link } from 'react-router-dom';
import { useAct, useMe } from '../hubContext';
import { Chip } from '../common';
import { GLOSSARY } from '../lang';

const INTEGRATIONS = [
  ['Your real clock-in app', 'Not connected. We need your OK first.'],
  ['Your Google Sheets trackers', 'Not connected. A look-only practice import comes later.'],
  ['Google Drive and MT Log files', 'Not connected. Made-up files are used.'],
  ['MT Log local API / Tampermonkey helper', 'Not connected'],
  ['Amazon, Etsy and Shopify checks', 'Pretend only'],
  ['Claude or other AI', 'Off. A free replay is used.'],
  ['Email, phone alerts, Teams', 'Not connected. Only in-app notifications.'],
];

export function Settings() {
  const { hub, uid, me, toast } = useMe();
  const act = useAct();
  const s = hub.state.settings;
  const owner = me.role === 'OWNER';
  const spend = hub.monthSpendUsd();
  const audit = async () => {
    const data = JSON.stringify(hub.getAudit(uid), null, 2);
    try { await navigator.clipboard.writeText(data); toast('Copied the change log. Paste it into any file.'); } catch { toast('Your browser would not let us copy. Try again after clicking the page.', 'error'); }
  };
  return (
    <div className="stack">
      <h1>Settings</h1>
      <section className="card"><h2>What is connected</h2>
        <div className="tablewrap"><table><tbody>{INTEGRATIONS.map(([k, v]) => <tr key={k}><td>{k}</td><td><Chip tone="gray" glyph="○">{v}</Chip></td></tr>)}</tbody></table></div>
        <p className="small muted">This app will never say something is connected when it is not. See <Link to="/status">What works</Link> for the full list.</p></section>
      <section className="card"><h2>Notifications</h2>
        <p className="small">In-app notifications are always on. Email would only be for urgent things. Here it is <strong>pretend</strong>. No email is ever sent.</p>
        <label style={{ fontWeight: 500 }}><input type="checkbox" disabled={!owner} checked={s.emailUrgentOptIn} onChange={(e) => act(() => hub.updateSettings(uid, { emailUrgentOptIn: e.target.checked }))} /> Email me for urgent events (pretend){!owner && ' — owner only'}</label></section>
      {owner ? (
        <>
          <section className="card"><h2>When reviews are ready</h2>
            <p className="small">Goal: cards are ready within <strong>{s.reviewReadyTargetMinutes} minutes</strong> after someone clocks out (a goal, not a promise). Yesterday’s work is finished by <strong>{s.backupReadyLocalTime} CT</strong>. New data is read about every 5 minutes. The AI looks every 30 to 60 minutes during shifts. A weekly report comes on Fridays.</p>
            <div className="row"><label className="row" style={{ margin: 0 }}>Ready within (minutes) <input type="number" style={{ width: 90 }} value={s.reviewReadyTargetMinutes} onChange={(e) => act(() => hub.updateSettings(uid, { reviewReadyTargetMinutes: Number(e.target.value) || 20 }))} /></label></div></section>
          <section className="card"><h2>AI money limit</h2>
            <p>Spent this month: <strong>${spend.toFixed(2)}</strong>. This practice copy spends $0.</p>
            <div className="row">
              <label className="row" style={{ margin: 0 }}>Money limit per month ($) <input type="number" style={{ width: 110 }} value={s.monthlyBudgetUsd} onChange={(e) => act(() => hub.updateSettings(uid, { monthlyBudgetUsd: Number(e.target.value) || 100 }))} /></label>
              <label className="row" style={{ margin: 0 }}>Warn me at (%) <input type="number" style={{ width: 90 }} value={s.budgetWarnPct} onChange={(e) => act(() => hub.updateSettings(uid, { budgetWarnPct: Number(e.target.value) || 80 }))} /></label>
              <label className="row" style={{ margin: 0 }}>Stop extra AI at (%) <input type="number" style={{ width: 90 }} value={s.budgetCircuitBreakerPct} onChange={(e) => act(() => hub.updateSettings(uid, { budgetCircuitBreakerPct: Number(e.target.value) || 100 }))} /></label>
            </div>
            <p className="small muted">The goal is about $100 a month in all (maybe $50 to $125). It is not a promise. If the limit is reached, extra research stops first. Clocking in, update requests and reviews keep working.</p></section>
          <section className="card"><h2>Privacy and saving data</h2>
            <p className="small">Detailed computer logs: keep {s.retentionDays.raw} days (idea). Project history: {Math.round(s.retentionDays.business / 365)} years (idea). Check with a lawyer before using the real app.</p>
            <div className="row"><button onClick={audit}>Copy the change log</button><span className="small muted">Only you can do this. It has no typing or screenshots. We never save those.</span></div></section>
        </>
      ) : <section className="card flat muted">Money, saving and download settings are only for the owner. They are blocked for everyone else, not just hidden.</section>}
      <section className="card"><details><summary style={{ cursor: 'pointer', fontWeight: 650, fontSize: '1.15rem' }}>The words we use</summary>
        <p className="small muted">One set of words is used on every screen. This list shows what we say now instead of the old technical term.</p>
        <div className="tablewrap"><table><thead><tr><th>Old technical term</th><th>What we say</th><th>Note</th></tr></thead><tbody>{GLOSSARY.map((g) => <tr key={g.old}><td>{g.old}</td><td>{g.now}</td><td className="small muted">{g.note}</td></tr>)}</tbody></table></div></details></section>
      <section className="card"><h2>What we do and do not collect</h2>
        <ul className="small" style={{ margin: '0 0 0 1.1rem' }}><li>We save work events like app names, file names and print jobs. We do not save typing, passwords or private messages.</li><li>We do not take screenshots. A future recording mode would only run if you choose it, and you would see it.</li><li>You can fix or reject any AI guess (“That was not me”). We keep your fix next to the guess.</li><li>No activity never means someone was not working.</li></ul></section>
    </div>
  );
}
