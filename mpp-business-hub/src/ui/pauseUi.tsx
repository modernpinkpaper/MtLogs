import { useRef, useState } from 'react';
import { Chip, Modal } from './common';
import { newKey, useAct, useMe } from './hubContext';
import { PAUSE_REASONS, reasonText, scheduleSentence } from '../server/pause';
import { PILOT_STATE_LABEL, pilotSummaryLine, verifiedCount } from '../server/pilot';
import { addMinutes, chicagoDate, formatDateTime, formatLocalDate } from '../domain/time';
import { deadlineInfo } from '../domain/projectStatus';
import type { PilotRowState, Project, ResumeMode } from '../domain/types';

const MODES: { id: ResumeMode; label: string; help: string }[] = [
  { id: 'MANUAL', label: 'Pause until I resume', help: 'It stays paused until you click “Resume project”. No date is set.' },
  { id: 'AUTOMATIC_ON_DATE', label: 'Resume automatically on a date', help: 'On that morning the project becomes active again by itself. It does not start any scripts or uploads.' },
  { id: 'REMIND_ON_DATE', label: 'Remind me to decide on a date', help: 'On that morning you get a reminder. The project stays paused until you decide. Best for test results.' },
];
function tomorrow(nowIso: string) { return chicagoDate(addMinutes(nowIso, 24 * 60 + 60)); }

function ModePicker({ mode, setMode, date, setDate, nowIso, name }: { mode: ResumeMode; setMode: (m: ResumeMode) => void; date: string; setDate: (d: string) => void; nowIso: string; name: string }) {
  return (
    <fieldset style={{ border: 'none', padding: 0, margin: 0 }}>
      <legend style={{ fontWeight: 600, marginBottom: 6 }}>When should it resume?</legend>
      {MODES.map((m) => (
        <div key={m.id} className={`choice ${mode === m.id ? 'sel' : ''}`} onClick={() => setMode(m.id)}>
          <input type="radio" id={`${name}-${m.id}`} name={name} checked={mode === m.id} onChange={() => setMode(m.id)} />
          <label htmlFor={`${name}-${m.id}`}>{m.label}<span className="small muted" style={{ display: 'block', fontWeight: 400 }}>{m.help}</span></label>
        </div>
      ))}
      {mode !== 'MANUAL' && (
        <div style={{ marginTop: 6 }}><label htmlFor={`${name}-date`}>{mode === 'AUTOMATIC_ON_DATE' ? 'Resume on' : 'Remind me on'}</label>
          <input id={`${name}-date`} type="date" min={tomorrow(nowIso)} value={date} onChange={(e) => setDate(e.target.value)} style={{ maxWidth: 220 }} />
          <p className="small muted">Dates use Chicago time. The check runs at the start of that day.</p></div>
      )}
    </fieldset>
  );
}

export function PauseDialog({ project, onClose }: { project: Project; onClose: () => void }) {
  const { hub, uid } = useMe();
  const act = useAct();
  const key = useRef(newKey('pause'));
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [mode, setMode] = useState<ResumeMode>('MANUAL');
  const [date, setDate] = useState('');
  const [msg, setMsg] = useState('');
  const [allowed, setAllowed] = useState('');
  const team = project.memberUids.map((m) => hub.userName(m));
  const go = async () => {
    const r = await act(() => hub.pauseProject(uid, project.id, { reasonCode: reason || undefined, reasonNote: note, mode, resumeDateLocal: date || undefined, messageToTeam: msg, allowedWork: allowed, idempotencyKey: key.current }), `${project.key} is paused`);
    if (r) onClose();
  };
  return (
    <Modal title={`Pause ${project.key}`} onClose={onClose}>
      <form className="stack" onSubmit={(e) => { e.preventDefault(); void go(); }}>
        <p className="small muted">Pausing keeps everything: steps, files, checklists and history. Finished steps stay finished. It does not stop a script that is already running outside this app.</p>
        <div><label htmlFor="pz-reason">Why? (if you want)</label>
          <select id="pz-reason" value={reason} onChange={(e) => setReason(e.target.value)}><option value="">Choose a reason…</option>{Object.entries(PAUSE_REASONS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
        <div><label htmlFor="pz-note">Add a note (if you want)</label><input id="pz-note" type="text" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Example: Testing 20 listings before expanding" /></div>
        <ModePicker mode={mode} setMode={setMode} date={date} setDate={setDate} nowIso={hub.now} name="pz-mode" />
        <div><label htmlFor="pz-allowed">What can people still do while it is paused? (if anything)</label><input id="pz-allowed" type="text" value={allowed} onChange={(e) => setAllowed(e.target.value)} placeholder="Example: Nothing. Or: only fix errors in listings that are already live." /></div>
        <div><label htmlFor="pz-msg">Message to the team (if you want)</label><textarea id="pz-msg" value={msg} onChange={(e) => setMsg(e.target.value)} />
          <p className="small muted">{team.length ? `${team.join(', ')} will get a notification.` : 'No one is assigned, so no one is notified.'}</p></div>
        <div className="row"><button className="primary" type="submit" disabled={mode !== 'MANUAL' && !date}>Pause project</button><button type="button" onClick={onClose}>Cancel</button></div>
      </form>
    </Modal>
  );
}

export function ChangeScheduleDialog({ project, onClose }: { project: Project; onClose: () => void }) {
  const { hub, uid } = useMe();
  const act = useAct();
  const key = useRef(newKey('sched'));
  const ps = project.pause!;
  const [mode, setMode] = useState<ResumeMode>(ps.resumeMode);
  const [date, setDate] = useState(ps.resumeDateLocal ?? '');
  const go = async () => {
    const r = await act(() => hub.changePauseSchedule(uid, project.id, { mode, resumeDateLocal: date || undefined, expectedScheduleVersion: ps.scheduleVersion, idempotencyKey: key.current }), 'Saved');
    if (r) onClose();
  };
  return (
    <Modal title="Change when it resumes" onClose={onClose}>
      <form className="stack" onSubmit={(e) => { e.preventDefault(); void go(); }}>
        <ModePicker mode={mode} setMode={setMode} date={date} setDate={setDate} nowIso={hub.now} name="cs-mode" />
        <div className="row"><button className="primary" type="submit" disabled={mode !== 'MANUAL' && !date}>Save</button><button type="button" onClick={onClose}>Cancel</button></div>
      </form>
    </Modal>
  );
}

export function ResumeDialog({ project, onClose }: { project: Project; onClose: () => void }) {
  const { hub, uid } = useMe();
  const act = useAct();
  const key = useRef(newKey('resume'));
  const [note, setNote] = useState('');
  const go = async () => {
    const r = await act(() => hub.resumeProject(uid, project.id, { note, expectedScheduleVersion: project.pause!.scheduleVersion, idempotencyKey: key.current }), `${project.key} is active again`);
    if (r) onClose();
  };
  return (
    <Modal title={`Resume ${project.key}`} onClose={onClose}>
      <form className="stack" onSubmit={(e) => { e.preventDefault(); void go(); }}>
        <p className="small muted">Nothing is reset. Finished steps stay finished and the team is told it is active again. Resuming does not start any scripts or uploads.</p>
        <div><label htmlFor="rs-note">Add a note (if you want)</label><input id="rs-note" type="text" value={note} onChange={(e) => setNote(e.target.value)} /></div>
        <div className="row"><button className="primary" type="submit">Resume project</button><button type="button" onClick={onClose}>Cancel</button></div>
      </form>
    </Modal>
  );
}

/** The grey/purple banner at the top of a paused project. Different wording for the owner and for the team. */
export function PauseBanner({ project, onResume, onChange, onSuggestResume }: { project: Project; onResume: () => void; onChange: () => void; onSuggestResume: () => void }) {
  const { hub, uid, me } = useMe();
  const act = useAct();
  const ps = project.pause!;
  const canControl = hub.canControlProject(uid, project.id);
  const di = deadlineInfo(project, hub.now);
  const reminderDue = ps.resumeMode === 'REMIND_ON_DATE' && ps.reminderSentForVersion === ps.scheduleVersion;
  const [deadline, setDeadline] = useState('');
  return (
    <div className="banner paused" role="status">
      <strong>Paused by {hub.userName(ps.pausedByUserId ?? null)} on {formatLocalDate(chicagoDate(ps.pausedAt!))} — {reasonText(ps)}</strong>
      <p style={{ margin: '.3rem 0' }}>{scheduleSentence(ps, me.role === 'OWNER')}{me.role !== 'OWNER' && ' Your work is saved. You can still answer requests from Dalia.'}</p>
      {ps.messageToTeam && <p className="small" style={{ margin: '.2rem 0' }}>Message: “{ps.messageToTeam}”</p>}
      <p className="small" style={{ margin: '.2rem 0' }}><strong>What you can still do:</strong> {ps.allowedWork ?? 'No project work is scheduled. You can still answer Dalia’s requests. Your work, files and notes are all saved.'}</p>
      <p className="small" style={{ margin: '.2rem 0' }}><strong>What happens next:</strong> {scheduleSentence(ps, false)}</p>
      {reminderDue && canControl && <p style={{ margin: '.3rem 0' }}><strong>It is time to decide.</strong> Resume it, set another reminder, or keep it paused.</p>}
      {di?.elapsedWhilePaused && <p className="small" style={{ margin: '.2rem 0' }}>{di.text}. {canControl ? 'Pick a new deadline when you are ready.' : 'Dalia may set a new date.'}</p>}
      {di?.pastDueBeforePause && <p className="small" style={{ margin: '.2rem 0' }}>{di.text}.</p>}
      <div className="row" style={{ marginTop: 6 }}>
        {canControl ? (
          <>
            <button className="primary" onClick={onResume}>Resume project</button>
            <button onClick={onChange}>{reminderDue ? 'Set another reminder' : 'Change when it resumes'}</button>
            {reminderDue && <button onClick={() => act(() => hub.changePauseSchedule(uid, project.id, { mode: 'MANUAL', expectedScheduleVersion: ps.scheduleVersion, idempotencyKey: newKey('keep') }), 'It stays paused until you resume it')}>Keep paused</button>}
            {(di?.elapsedWhilePaused || di?.pastDueBeforePause) && (
              <span className="row"><input type="date" aria-label="New deadline" value={deadline} onChange={(e) => setDeadline(e.target.value)} style={{ width: 'auto' }} />
                <button disabled={!deadline} onClick={() => act(() => hub.setProjectDeadline(uid, project.id, deadline), 'Deadline changed')}>Set new deadline</button></span>
            )}
          </>
        ) : me.role === 'EMPLOYEE' && hub.canWorkOnProject(me, project) ? (
          <button onClick={onSuggestResume}>Suggest resuming</button>
        ) : null}
      </div>
    </div>
  );
}

export function SuggestDialog({ project, mode, onClose }: { project: Project; mode: 'pause' | 'resume'; onClose: () => void }) {
  const { hub, uid } = useMe();
  const act = useAct();
  const key = useRef(newKey('sugg'));
  const [note, setNote] = useState('');
  const go = async () => {
    const r = await act(() => (mode === 'pause' ? hub.suggestPause(uid, project.id, note, key.current) : hub.suggestResume(uid, project.id, note, key.current)), 'Sent to Dalia. Nothing changes until she decides.');
    if (r !== undefined || true) onClose();
  };
  return (
    <Modal title={mode === 'pause' ? `Suggest pausing ${project.key}` : `Suggest resuming ${project.key}`} onClose={onClose}>
      <form className="stack" onSubmit={(e) => { e.preventDefault(); void go(); }}>
        <p className="small muted">Dalia decides. The project does not change when you send this.</p>
        <div><label htmlFor="sg-note">Why? (if you want)</label><textarea id="sg-note" value={note} onChange={(e) => setNote(e.target.value)} /></div>
        <div className="row"><button className="primary" type="submit">Send suggestion to Dalia</button><button type="button" onClick={onClose}>Cancel</button></div>
      </form>
    </Modal>
  );
}

// ------------------------------------------------------------------ limited tests
export function PilotSetupDialog({ project, onClose }: { project: Project; onClose: () => void }) {
  const { hub, uid } = useMe();
  const act = useAct();
  const key = useRef(newKey('pilot'));
  const steps = hub.projectSteps(uid, project.id).filter((s) => !s.parentStepId);
  const [stepId, setStepId] = useState(steps.find((s) => s.status !== 'VERIFIED_COMPLETE')?.id ?? '');
  const [label, setLabel] = useState('verified listings');
  const [count, setCount] = useState(20);
  const [scope, setScope] = useState('');
  const [items, setItems] = useState('');
  const [when, setWhen] = useState<'PROPOSE_PAUSE' | 'AUTO_PAUSE_APPROVED'>('PROPOSE_PAUSE');
  const [enf, setEnf] = useState<'TRACKING_ONLY' | 'TECHNICAL_LIMIT'>('TRACKING_ONLY');
  const lines = items.split('\n').map((x) => x.trim()).filter(Boolean);
  const go = async () => {
    const r = await act(() => hub.configurePilot(uid, project.id, { stepId: stepId || null, metricType: 'VERIFIED_LISTINGS', metricLabel: label, targetCount: count, scopeLabel: scope || 'Only the items listed here.', skus: lines, enforcement: enf, whenReached: when, idempotencyKey: key.current }), 'Limited test set up');
    if (r) onClose();
  };
  return (
    <Modal title={`Set up a limited test for ${project.key}`} onClose={onClose}>
      <form className="stack" onSubmit={(e) => { e.preventDefault(); void go(); }}>
        <p className="small muted">Try the process on a small number first. After that, work stops and waits for your OK. Employees cannot go past the list.</p>
        <div className="grid cols-2">
          <div><label htmlFor="pt-step">Which step?</label><select id="pt-step" value={stepId} onChange={(e) => setStepId(e.target.value)}><option value="">The whole project</option>{steps.map((s) => <option key={s.id} value={s.id}>Step {hub.stepLabelsFor(uid, s.projectId).get(s.id)}: {s.title.slice(0, 50)}</option>)}</select></div>
          <div><label htmlFor="pt-count">How many?</label><input id="pt-count" type="number" min={1} value={count} onChange={(e) => setCount(Number(e.target.value))} /></div>
        </div>
        <div><label htmlFor="pt-label">What are you counting?</label><input id="pt-label" type="text" value={label} onChange={(e) => setLabel(e.target.value)} /></div>
        <div><label htmlFor="pt-scope">Where do the items come from?</label><input id="pt-scope" type="text" value={scope} onChange={(e) => setScope(e.target.value)} placeholder="Example: SEO Master copy A, rows MA041 to MA060" /></div>
        <div><label htmlFor="pt-items">The exact items (one per line, if you want)</label><textarea id="pt-items" value={items} onChange={(e) => setItems(e.target.value)} placeholder={'MA041\nMA042\n…'} />
          <p className="small muted">{lines.length ? `${lines.length} listed. ${lines.length === count ? 'Matches the number.' : 'This must match “How many?”.'}` : 'If you leave this empty, items are numbered 1 to the count.'}</p></div>
        <fieldset style={{ border: 'none', padding: 0 }}><legend style={{ fontWeight: 600 }}>When the target is reached</legend>
          <div className={`choice ${when === 'PROPOSE_PAUSE' ? 'sel' : ''}`} onClick={() => setWhen('PROPOSE_PAUSE')}><input type="radio" id="pt-w1" name="pt-w" checked={when === 'PROPOSE_PAUSE'} onChange={() => setWhen('PROPOSE_PAUSE')} /><label htmlFor="pt-w1">Ask me what to do (recommended)<span className="small muted" style={{ display: 'block', fontWeight: 400 }}>You get a notification and a short results summary.</span></label></div>
          <div className={`choice ${when === 'AUTO_PAUSE_APPROVED' ? 'sel' : ''}`} onClick={() => setWhen('AUTO_PAUSE_APPROVED')}><input type="radio" id="pt-w2" name="pt-w" checked={when === 'AUTO_PAUSE_APPROVED'} onChange={() => setWhen('AUTO_PAUSE_APPROVED')} /><label htmlFor="pt-w2">Pause the project automatically<span className="small muted" style={{ display: 'block', fontWeight: 400 }}>It never publishes more or continues by itself.</span></label></div>
        </fieldset>
        <div><label htmlFor="pt-enf">Can the app stop the script?</label><select id="pt-enf" value={enf} onChange={(e) => setEnf(e.target.value as typeof enf)}>
          <option value="TRACKING_ONLY">No. We only track the limit.</option><option value="TECHNICAL_LIMIT">Yes. The script has its own limit.</option></select>
          {enf === 'TRACKING_ONLY' && <p className="small muted">Tracking limit only: the app cannot stop a script that runs outside it. Employees must check the results.</p>}</div>
        <div className="row"><button className="primary" type="submit" disabled={count < 1 || (lines.length > 0 && lines.length !== count)}>Set up the test</button><button type="button" onClick={onClose}>Cancel</button></div>
      </form>
    </Modal>
  );
}

export function PilotPanel({ project }: { project: Project }) {
  const { hub, uid, me } = useMe();
  const act = useAct();
  const pc = project.pilot!;
  const owner = me.role === 'OWNER';
  const canWork = hub.canWorkOnProject(me, project);
  const [open, setOpen] = useState(false);
  const [showHand, setShowHand] = useState(pc.status === 'TARGET_REACHED' && owner);
  const [next, setNext] = useState(50);
  const v = verifiedCount(pc);
  const tone = pc.status === 'TARGET_REACHED' ? 'banner warn' : 'card flat';
  const states: PilotRowState[] = ['NOT_DONE', 'TRIED', 'CHECKED_OFF', 'UPLOADED', 'FAILED'];
  return (
    <section className={tone} aria-label="Limited test">
      <div className="row between">
        <div><strong>Limited test: {v} of {pc.targetCount} {pc.metricLabel} checked</strong>
          <div className="small muted">{pc.scopeLabel}</div></div>
        <Chip tone={pc.status === 'TARGET_REACHED' ? 'warn' : pc.status === 'NEXT_BATCH_APPROVED' ? 'ok' : 'info'}>{pc.status === 'TARGET_REACHED' ? 'Waiting for your review' : pc.status === 'NEXT_BATCH_APPROVED' ? 'Next batch approved' : 'In progress'}</Chip>
      </div>
      <div className="progressbar" aria-hidden="true" style={{ margin: '.5rem 0' }}><span style={{ width: `${(v / pc.targetCount) * 100}%`, background: 'var(--ok)' }} /></div>
      <p className="small muted" style={{ margin: 0 }}>Only items checked in the source system count. A ticked box, an upload or “tried” does not. {pc.enforcement === 'TRACKING_ONLY' ? 'Tracking limit only: the app cannot stop a script that runs outside it.' : 'The script itself stops at this list.'}</p>
      {pc.status === 'TARGET_REACHED' && owner && (
        <div className="row" style={{ marginTop: 8 }}>
          <button className="primary" onClick={() => setShowHand(!showHand)}>Review the results</button>
          <label className="row" style={{ margin: 0 }}>Next batch size <input type="number" min={1} value={next} onChange={(e) => setNext(Number(e.target.value))} style={{ width: 90 }} /></label>
          <button onClick={() => act(() => hub.approveNextBatch(uid, project.id, { targetCount: next, skus: [], idempotencyKey: newKey('next') }), 'Next batch approved')}>Approve next batch</button>
        </div>
      )}
      {showHand && <pre className="card flat small" style={{ whiteSpace: 'pre-wrap', margin: '.6rem 0 0' }}>{hub.pilotHandoff(uid, project.id)}</pre>}
      <button className="link" style={{ marginTop: 6 }} onClick={() => setOpen(!open)}>{open ? 'Hide the list' : 'Show the list of items'}</button>
      {open && (
        <div className="tablewrap"><table><thead><tr><th>Item</th><th>Where it is</th><th>{canWork ? 'Update' : ''}</th></tr></thead><tbody>
          {pc.rows.map((r) => (
            <tr key={r.sku}><td>{r.sku}</td><td>{PILOT_STATE_LABEL[r.state]}{r.note ? ` — ${r.note}` : ''}</td>
              <td>{canWork && r.state !== 'VERIFIED' && <select aria-label={`Status of ${r.sku}`} value={r.state} onChange={(e) => act(() => hub.recordPilotRow(uid, project.id, r.sku, e.target.value as PilotRowState))} style={{ width: 'auto', minHeight: 32 }}>{states.map((s) => <option key={s} value={s}>{PILOT_STATE_LABEL[s]}</option>)}</select>}</td></tr>))}
        </tbody></table></div>
      )}
      {owner && pc.status === 'RUNNING' && (
        <p className="small" style={{ marginTop: 6 }}><button className="link" onClick={() => act(() => hub.verifyPilotRows(uid, project.id, pc.rows.filter((r) => r.state !== 'VERIFIED' && r.state !== 'FAILED').map((r) => r.sku), 'Found in the source system (practice check)'), 'Marked as checked')}>Practice check: mark all open items as checked in the source system</button></p>
      )}
      <details className="small" style={{ marginTop: 6 }}><summary>Test history</summary>{pc.history.map((h, i) => <div key={i}>{formatDateTime(h.at)} — {h.text}</div>)}</details>
    </section>
  );
}
export { pilotSummaryLine };
export const _addMinutes = addMinutes;
