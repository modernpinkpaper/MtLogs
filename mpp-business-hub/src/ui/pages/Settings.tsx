import { Link } from 'react-router-dom';
import { useAct, useMe } from '../hubContext';
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
      <div>
        <h1>Settings</h1>
        <p>Change how the app works for you. What is connected and how data is kept are further down.</p>
      </div>

      {owner && (
        <section aria-labelledby="ai-set">
          <h2 id="ai-set">AI</h2>
          <div className="card list setrows">
            <div className="setrow"><div><strong>Priorities and sources</strong><p className="small muted">What the AI looks into, and which data it may read. Also what you told it when you dismissed things.</p></div><Link to="/owner/ai?tab=priorities"><button>Open</button></Link></div>
            <div className="setrow"><div><strong>Computer activity &amp; AI cost</strong><p className="small muted">What computer activity has arrived, and what the AI costs.</p></div><Link to="/owner/data-intake"><button>Open</button></Link></div>
            <div className="setrow"><div><strong>Results tracker</strong><p className="small muted">Whether approved ideas actually helped.</p></div><Link to="/owner/ai?tab=results"><button>Open</button></Link></div>
          </div>
        </section>
      )}

      <section aria-labelledby="mine">
        <h2 id="mine">Things you can change</h2>
        <div className="card list setrows">
          <div className="setrow">
            <div><strong>Urgent email</strong><p className="small muted">In-app notifications are always on. Email would only be for urgent things. Here it is <strong>pretend</strong>. No email is ever sent.</p></div>
            <label className="row" style={{ margin: 0, fontWeight: 500 }}><input type="checkbox" disabled={!owner} checked={s.emailUrgentOptIn} onChange={(e) => act(() => hub.updateSettings(uid, { emailUrgentOptIn: e.target.checked }))} /> Email me{!owner && ' (owner only)'}</label>
          </div>
          {owner ? (
            <>
              <div className="setrow">
                <div><strong>When reviews are ready</strong><p className="small muted">A goal, not a promise: cards are ready within {s.reviewReadyTargetMinutes} minutes after someone clocks out. Yesterday’s work is finished by {s.backupReadyLocalTime} CT. New data is read about every 5 minutes. A weekly report comes on Fridays.</p></div>
                <label className="row" style={{ margin: 0 }}>Minutes <input type="number" style={{ width: 90 }} value={s.reviewReadyTargetMinutes} onChange={(e) => act(() => hub.updateSettings(uid, { reviewReadyTargetMinutes: Number(e.target.value) || 20 }))} /></label>
              </div>
              <div className="setrow">
                <div><strong>AI money limit</strong><p className="small muted">Spent this month: ${spend.toFixed(2)} (this practice copy spends $0). If the limit is reached, extra research stops first. Clocking in, update requests and reviews keep working.</p></div>
                <div className="row">
                  <label style={{ margin: 0 }}>Limit per month ($)<input type="number" style={{ width: 110 }} value={s.monthlyBudgetUsd} onChange={(e) => act(() => hub.updateSettings(uid, { monthlyBudgetUsd: Number(e.target.value) || 100 }))} /></label>
                  <label style={{ margin: 0 }}>Warn me at (%)<input type="number" style={{ width: 90 }} value={s.budgetWarnPct} onChange={(e) => act(() => hub.updateSettings(uid, { budgetWarnPct: Number(e.target.value) || 80 }))} /></label>
                  <label style={{ margin: 0 }}>Stop extra AI at (%)<input type="number" style={{ width: 90 }} value={s.budgetCircuitBreakerPct} onChange={(e) => act(() => hub.updateSettings(uid, { budgetCircuitBreakerPct: Number(e.target.value) || 100 }))} /></label>
                </div>
              </div>
            </>
          ) : <div className="setrow"><p className="small muted" style={{ margin: 0 }}>Money, saving and download settings are only for the owner. They are blocked for everyone else, not just hidden.</p></div>}
        </div>
      </section>

      <section aria-labelledby="conn">
        <h2 id="conn">What is connected</h2>
        <div className="card list"><div className="tablewrap"><table><tbody>{INTEGRATIONS.map(([k, v]) => <tr key={k}><td>{k}</td><td className="small muted">{v}</td></tr>)}</tbody></table></div></div>
        <p className="small muted" style={{ marginTop: 'var(--sp-2)' }}>This app will never say something is connected when it is not. See <Link to="/status">What works</Link> for the full list.</p>
      </section>

      <div className="stack">
        {owner && (
          <details className="soft"><summary>Privacy and saving data</summary>
            <div className="stack" style={{ marginTop: 'var(--sp-3)' }}>
              <p className="small" style={{ margin: 0 }}>Detailed computer logs: keep {s.retentionDays.raw} days (idea). Project history: {Math.round(s.retentionDays.business / 365)} years (idea). Check with a lawyer before using the real app.</p>
              <div className="row"><button onClick={audit}>Copy the change log</button><span className="small muted">Only you can do this. It has no typing or screenshots. We never save those.</span></div>
            </div></details>
        )}
        <details className="soft"><summary>What we do and do not collect</summary>
          <ul className="small" style={{ margin: 'var(--sp-3) 0 0 1.1rem' }}><li>We save work events like app names, file names and print jobs. We do not save typing, passwords or private messages.</li><li>We do not take screenshots. A future recording mode would only run if you choose it, and you would see it.</li><li>You can fix or reject any AI guess (“That was not me”). We keep your fix next to the guess.</li><li>No activity never means someone was not working.</li></ul></details>
        <details className="soft"><summary>The words we use</summary>
          <p className="small muted" style={{ marginTop: 'var(--sp-3)' }}>One set of words is used on every screen. This list shows what we say now instead of the old technical term.</p>
          <div className="tablewrap"><table><thead><tr><th>Old technical term</th><th>What we say</th><th>Note</th></tr></thead><tbody>{GLOSSARY.map((g) => <tr key={g.old}><td>{g.old}</td><td>{g.now}</td><td className="small muted">{g.note}</td></tr>)}</tbody></table></div></details>
      </div>
    </div>
  );
}
