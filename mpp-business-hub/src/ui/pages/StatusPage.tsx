import { Chip, type Tone } from '../common';

type S = 'Implemented' | 'Simulated' | 'Deferred' | 'Blocked' | 'Requires owner approval';
const TONE: Record<S, Tone> = { Implemented: 'ok', Simulated: 'violet', Deferred: 'gray', Blocked: 'bad', 'Requires owner approval': 'warn' };

const LABEL: Record<S, string> = { Implemented: 'Works', Simulated: 'Pretend', Deferred: 'Later', Blocked: 'Stuck', 'Requires owner approval': 'Needs your OK' };

const ROWS: [string, S, string][] = [
  ['Owner home page, “needs you” list, “what is new”', 'Implemented', 'Computed from stored demo data'],
  ['Projects, steps, substeps, checklists, edit instructions', 'Implemented', 'Practice data'],
  ['Step statuses with a full change log', 'Implemented', 'Tested'],
  ['Tracker status, AI guess and “Checked in the source system” kept apart', 'Implemented', 'Kept in separate fields'],
  ['Owner asks for an update, employee gets a card and notification', 'Implemented', 'Safe to click twice. Tested'],
  ['Employee answers, Dalia gets a notification, can follow up or close', 'Implemented', 'Notifications are saved in this practice copy only. They do not reach any other device'],
  ['Employee proactive “Send Dalia an update”', 'Implemented', ''],
  ['Clock in/out is never blocked. Reviews come after clock-in and are paid', 'Implemented', 'A practice clock, not your real one'],
  ['Review cards: yes, not quite, not me, skip. “Select multiple items” and “Confirm selected items are accurate”', 'Implemented', ''],
  ['AI guesses from computer activity', 'Simulated', 'A free replay, not a real AI'],
  ['Reading MT Log files (repeats, half-saved files, gaps)', 'Implemented', 'Made-up files'],
  ['“FBA_TY001” safety test, late facts, tricky file names', 'Implemented', 'Tested'],
  ['File library: roles, versions, finding new files', 'Implemented', 'Pretend links'],
  ['History (one list, project and step views) and a change log', 'Implemented', ''],
  ['Daily printing numbers and a weekly owner report', 'Implemented', 'Made-up print week'],
  ['AI ideas: what we expect vs what really happened', 'Simulated', 'Made-up ideas. Saying yes makes a practice project'],
  ['Privacy: private projects are invisible to employees', 'Implemented', 'Enforced in the code and tested'],
  ['Pause a project: no end date, resume on a date, or remind me to decide', 'Implemented', 'All progress is kept. Tested, including daylight saving'],
  ['Resume reminders and automatic resume at 6:00 AM Chicago time', 'Implemented', 'Runs once, safe to repeat. Never runs scripts or moves deadlines'],
  ['Limited tests (for example 20 listings) that need Dalia to approve the next batch', 'Implemented', 'Only rows checked in the source system count'],
  ['One simple project page: next step first, details in open-and-close sections', 'Implemented', ''],
  ['Explained search across projects, steps, files and people', 'Implemented', 'Employees never see owner-only results'],
  ['AI Recommendations: findings, numbers, plan, approve, brief for the employee', 'Simulated', 'Made-up data. Only Dalia can approve. AI never makes a project alone'],
  ['Drive folders for approved projects', 'Simulated', 'Pretend folders. Nothing is created in real Google Drive'],
  ['Business goals, pretend data sources, and “did it work” tracker', 'Simulated', 'Owner only'],
  ['Review cards ask the real outcome (test passed, problem, partly done) and keep it apart from "did the AI see it right"', 'Implemented', 'Her answer is a report, never proof'],
  ['Fix a wrong project, step or person on a review card', 'Implemented', 'The first guess and the evidence are kept'],
  ['Step files: open, copy path, installation details, approval labels', 'Simulated', 'Links are pretend. Nothing opens in real Google Drive'],
  ['Project description card and "Log something I did"', 'Implemented', 'Practice data'],
  ['Firebase practice tools and rules', 'Deferred', 'This copy keeps data in your browser'],
  ['Real AI connection', 'Deferred', 'Only an off switch is built'],
  ['Look-only links to Google Sheets, Drive and Docs', 'Deferred', 'Requires owner approval'],
  ['Bringing in your real trackers', 'Requires owner approval', 'See “INTEGRATION_PLAN.md”'],
  ['Connecting to your real clock-in app', 'Requires owner approval', 'We never tried'],
  ['MT Log upgrades', 'Deferred', 'Ideas only'],
  ['Teams, email, phone alerts', 'Deferred', 'In-app only'],
  ['Real names and jobs for the other staff', 'Blocked', 'We need you to tell us'],
  ['Real printer data', 'Blocked', 'We need your OK to read it'],
];

export function StatusPage() {
  return (
    <div className="stack">
      <div><h1>What works</h1><p className="muted">An honest list of what is real, what is pretend, and what needs your OK. More detail is in the file “IMPLEMENTATION_STATUS.md”.</p></div>
      <div className="card tablewrap"><table><thead><tr><th>What</th><th>Status</th><th>Note</th></tr></thead><tbody>
        {ROWS.map(([r, s, n]) => <tr key={r}><td>{r}</td><td><Chip tone={TONE[s]}>{LABEL[s]}</Chip></td><td className="small muted">{n}</td></tr>)}</tbody></table></div>
    </div>
  );
}
