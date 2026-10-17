import { Chip, type Tone } from '../common';

type S = 'Implemented' | 'Simulated' | 'Deferred' | 'Blocked' | 'Requires owner approval';
const TONE: Record<S, Tone> = { Implemented: 'ok', Simulated: 'violet', Deferred: 'gray', Blocked: 'bad', 'Requires owner approval': 'warn' };

const ROWS: [string, S, string][] = [
  ['Owner command center, action queue, “what changed”', 'Implemented', 'Computed from stored demo data'],
  ['Projects, steps, substeps, checklists, edit instructions', 'Implemented', 'Local demo data'],
  ['Step state machine + audit (before/after, actor, reason)', 'Implemented', 'src/server/hub.ts, tests'],
  ['Official vs AI-observed vs verified status separation', 'Implemented', 'Parallel fields + labels'],
  ['Owner “Request Update” → card → in-app notification → journal', 'Implemented', 'Idempotent; tested'],
  ['Employee reply → real notification to Dalia, ack, follow-up, close', 'Implemented', 'Notifications live in the demo store; not delivered to any outside client'],
  ['Employee proactive “Send Update to Dalia”', 'Implemented', ''],
  ['Clock in/out never blocked; reviews after clock-in; paid-time review', 'Implemented', 'Demo clock, not the production clock'],
  ['Daily review cards (confirm/correct/not mine/dismiss, bulk for low risk)', 'Implemented', ''],
  ['AI findings from MT Log events', 'Simulated', 'Deterministic replay adapter; no LLM; $0'],
  ['MT Log v1 JSONL ingestion (dedupe, partial tails, gaps, revisions)', 'Implemented', 'Synthetic files; no Drive'],
  ['FBA_TY001 regression, late evidence, prompt-injection safeguard', 'Implemented', 'Tests'],
  ['Resource library, roles, versions, discovery, suggested links', 'Implemented', 'Demo providers; links are simulated'],
  ['Journal (one log, project/step views) + technical audit', 'Implemented', ''],
  ['Print daily figures + weekly owner report, episode grouping, 4-state', 'Implemented', 'Synthetic print week'],
  ['AI opportunities with expected vs realized value', 'Simulated', 'Synthetic proposals; approval creates a demo project'],
  ['Role-based privacy (owner-private invisible to employees)', 'Implemented', 'Enforced in the data layer, tested'],
  ['Firebase Emulator / Firestore rules / Cloud Functions', 'Deferred', 'Prototype uses an in-browser store behind the same server-style interface'],
  ['Live Claude/LLM adapter', 'Deferred', 'Interface + disabled adapter only'],
  ['Google Sheets / Drive / Docs read-only connectors', 'Deferred', 'Requires owner approval'],
  ['Import of the real team & private trackers', 'Requires owner approval', 'See INTEGRATION_PLAN.md'],
  ['Production Firebase clock-in integration', 'Requires owner approval', 'Never attempted'],
  ['MT Log script-outcome events / identity attribution upgrades', 'Deferred', 'Recommendations only'],
  ['Teams / email / push delivery', 'Deferred', 'In-app only'],
  ['Real employee roster for unnamed staff', 'Blocked', 'Needs your confirmation'],
  ['Real print-log source and printer data', 'Blocked', 'Needs data access approval'],
];

export function StatusPage() {
  return (
    <div className="stack">
      <div><h1>Build status & assumptions</h1><p className="muted">Honest checklist of what works, what is simulated, and what needs your approval. Full details: IMPLEMENTATION_STATUS.md.</p></div>
      <div className="card tablewrap"><table><thead><tr><th>Requirement</th><th>Status</th><th>Note</th></tr></thead><tbody>
        {ROWS.map(([r, s, n]) => <tr key={r}><td>{r}</td><td><Chip tone={TONE[s]}>{s}</Chip></td><td className="small muted">{n}</td></tr>)}</tbody></table></div>
    </div>
  );
}
