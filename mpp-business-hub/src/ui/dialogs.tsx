import { useRef, useState } from 'react';
import { Modal } from './common';
import { newKey, useAct, useMe } from './hubContext';
import { CHOICE_LABEL } from '../server/hub';
import type { ResponseChoice } from '../domain/types';
import { chicagoDate, chicagoToUtc } from '../domain/time';

const CHOICES: ResponseChoice[] = ['COMPLETED', 'IN_PROGRESS', 'BLOCKED', 'NOT_STARTED', 'NEED_CLARIFICATION'];
const MORE_CHOICES: ResponseChoice[] = ['WAITING', 'NOT_APPLICABLE'];

export function ChoiceGroup({ value, onChange, name }: { value: ResponseChoice | null; onChange: (c: ResponseChoice) => void; name: string }) {
  return (
    <fieldset style={{ border: 'none', padding: 0, margin: 0 }}>
      <legend className="small" style={{ fontWeight: 600, marginBottom: 6 }}>How is it going?</legend>
      {CHOICES.map((c) => (
        <div key={c} className={`choice ${value === c ? 'sel' : ''}`} onClick={() => onChange(c)}>
          <input type="radio" id={`${name}-${c}`} name={name} checked={value === c} onChange={() => onChange(c)} />
          <label htmlFor={`${name}-${c}`}>{CHOICE_LABEL[c]}</label>
        </div>
      ))}
      <details className="soft" open={!!value && MORE_CHOICES.includes(value)}>
        <summary className="small">Other answers</summary>
        {MORE_CHOICES.map((c) => (
          <div key={c} className={`choice ${value === c ? 'sel' : ''}`} onClick={() => onChange(c)}>
            <input type="radio" id={`${name}-${c}`} name={name} checked={value === c} onChange={() => onChange(c)} />
            <label htmlFor={`${name}-${c}`}>{CHOICE_LABEL[c]}</label>
          </div>
        ))}
      </details>
    </fieldset>
  );
}

/** Owner → employee request. Creates request + targeted review card + in-app notification + journal entry. */
export function RequestUpdateDialog({ projectId, stepId, onClose }: { projectId?: string; stepId?: string | null; onClose: () => void }) {
  const { hub, uid } = useMe();
  const act = useAct();
  const key = useRef(newKey('req'));
  const projects = hub.listProjects(uid).filter((p) => p.visibility !== 'OWNER_PRIVATE');
  const [pid, setPid] = useState(projectId ?? projects[0]?.id ?? '');
  const [sid, setSid] = useState<string>(stepId ?? '');
  const steps = pid ? hub.projectSteps(uid, pid) : [];
  const project = projects.find((p) => p.id === pid);
  const eligible = (project ? [...new Set([...project.memberUids, ...project.sharedWithUids])] : []).map((id) => hub.state.users.find((u) => u.id === id)!).filter((u) => u && u.active && u.role === 'EMPLOYEE');
  const defaultRecipients = sid ? hub.state.steps.find((s) => s.id === sid)?.assignedUids ?? [] : project?.memberUids ?? [];
  const [picked, setPicked] = useState<string[] | null>(null);
  const recipients = picked ?? defaultRecipients.filter((r) => eligible.some((e) => e.id === r));
  const [question, setQuestion] = useState('');
  const [purpose, setPurpose] = useState('Check progress');
  const [importance, setImportance] = useState<'NORMAL' | 'IMPORTANT'>('NORMAL');
  const [notifyVerified, setNotifyVerified] = useState(false);
  const [reminder, setReminder] = useState(false);
  const [sent, setSent] = useState<string | null>(null);

  const send = async () => {
    const r = await act(() => hub.createUpdateRequest(uid, {
      projectId: pid, stepId: sid || null, recipientUids: recipients, question, purpose, importance,
      options: { notifyWhenVerified: notifyVerified, sendNextResponse: false, reminderIfUnanswered: reminder }, idempotencyKey: key.current,
    }));
    if (r) setSent(`Sent to ${recipients.map((x) => hub.userName(x)).join(', ')}. They now have a notification and a card to answer. It is saved in the history.`);
  };

  return (
    <Modal title="Ask for an update" onClose={onClose}>
      {sent ? (
        <div className="stack"><div className="card ok" role="status">{sent}</div><button className="primary" onClick={onClose}>Done</button></div>
      ) : (
        <form className="stack" onSubmit={(e) => { e.preventDefault(); void send(); }}>
          <div className="grid cols-2">
            <div><label htmlFor="rq-project">Project</label>
              <select id="rq-project" value={pid} onChange={(e) => { setPid(e.target.value); setSid(''); setPicked(null); }}>{projects.map((p) => <option key={p.id} value={p.id}>{p.key} — {p.title.slice(0, 50)}</option>)}</select></div>
            <div><label htmlFor="rq-step">Step (if you want)</label>
              <select id="rq-step" value={sid} onChange={(e) => { setSid(e.target.value); setPicked(null); }}><option value="">The whole project</option>{steps.map((s) => <option key={s.id} value={s.id}>{s.sortOrder}. {s.title.slice(0, 60)}</option>)}</select></div>
          </div>
          <fieldset style={{ border: 'none', padding: 0 }}><legend className="small" style={{ fontWeight: 600 }}>Who should answer?</legend>
            {eligible.length === 0 && <span className="muted small">No employee works on this project.</span>}
            {eligible.map((u) => (
              <label key={u.id} style={{ fontWeight: 500 }}><input type="checkbox" checked={recipients.includes(u.id)} onChange={(e) => setPicked(e.target.checked ? [...recipients, u.id] : recipients.filter((x) => x !== u.id))} /> {u.name}</label>
            ))}
          </fieldset>
          <div><label htmlFor="rq-q">Your question (if you want)</label>
            <textarea id="rq-q" value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="e.g. Did the test product get created?" /></div>
          <div className="grid cols-2">
            <div><label htmlFor="rq-p">Reason</label><select id="rq-p" value={purpose} onChange={(e) => setPurpose(e.target.value)}>{['Check progress', 'Asked to notify me when completed', 'Need help', 'Specific due date'].map((x) => <option key={x}>{x}</option>)}</select></div>
            <div><label htmlFor="rq-i">Importance</label><select id="rq-i" value={importance} onChange={(e) => setImportance(e.target.value as 'NORMAL' | 'IMPORTANT')}><option value="NORMAL">Normal</option><option value="IMPORTANT">Important</option></select></div>
          </div>
          <p className="small muted">Answers are due by the end of their next shift. There is no strict deadline. An answer is “employee confirmed” until it is checked in the source system.</p>
          <label style={{ fontWeight: 500 }}><input type="checkbox" checked={notifyVerified} onChange={(e) => setNotifyVerified(e.target.checked)} /> Tell me when it is checked in the source system</label>
          <label style={{ fontWeight: 500 }}><input type="checkbox" checked={reminder} onChange={(e) => setReminder(e.target.checked)} /> Remind them nicely if there is no answer</label>
          <div className="row"><button className="primary" type="submit" disabled={!recipients.length || !pid}>Send request</button><button type="button" onClick={onClose}>Cancel</button></div>
        </form>
      )}
    </Modal>
  );
}

/** Employee → Dalia proactive update (always available to permitted project workers). */
export function SendUpdateDialog({ projectId, stepId, onClose }: { projectId: string; stepId?: string | null; onClose: () => void }) {
  const { hub, uid } = useMe();
  const act = useAct();
  const key = useRef(newKey('upd'));
  const [choice, setChoice] = useState<ResponseChoice | null>(null);
  const [note, setNote] = useState('');
  const [help, setHelp] = useState(false);
  const [done, setDone] = useState(false);
  const step = stepId ? hub.getStep(uid, stepId) : null;
  const send = async () => {
    if (!choice) return;
    const r = await act(() => hub.sendProactiveUpdate(uid, { projectId, stepId: stepId ?? null, choice, note, needsOwnerHelp: help, idempotencyKey: key.current }));
    if (r) setDone(true);
  };
  return (
    <Modal title={`Send Dalia an update${step ? ` on Step ${step.sortOrder}` : ''}`} onClose={onClose}>
      {done ? (
        <div className="stack"><div className="card ok" role="status">Sent. Dalia has a new notification. Your update is saved in the history as “employee confirmed.”</div><button className="primary" onClick={onClose}>Done</button></div>
      ) : (
        <form className="stack" onSubmit={(e) => { e.preventDefault(); void send(); }}>
          <ChoiceGroup value={choice} onChange={setChoice} name="proactive" />
          <div><label htmlFor="pu-note">Add a note (if you want)</label><textarea id="pu-note" value={note} onChange={(e) => setNote(e.target.value)} /></div>
          <label style={{ fontWeight: 500 }}><input type="checkbox" checked={help} onChange={(e) => setHelp(e.target.checked)} /> I need Dalia’s help (this shows it as a problem. Leave it off for a normal note.)</label>
          <div className="row"><button className="primary" type="submit" disabled={!choice}>Send Update</button><button type="button" onClick={onClose}>Cancel</button></div>
          {!hub.openShift(uid) && <p className="small" style={{ color: 'var(--warn)' }}>You are not clocked in. Updates are paid work, so please clock in first.</p>}
        </form>
      )}
    </Modal>
  );
}

/**
 * "Log something I did". For small jobs the computer may never see: Dalia remembers something, tells Erika, Erika updates a listing.
 * It is the person's own report. It never changes a step's status.
 */
export function LogTaskDialog({ onClose }: { onClose: () => void }) {
  const { hub, uid } = useMe();
  const act = useAct();
  const key = useRef(newKey('small'));
  const [title, setTitle] = useState('');
  const [when, setWhen] = useState('');
  const [askedBy, setAskedBy] = useState('');
  const [target, setTarget] = useState('');
  const [note, setNote] = useState('');
  const myProjects = hub.listProjects(uid).filter((p) => p.memberUids.includes(uid));
  const people = hub.state.users.filter((u) => u.active && u.id !== uid);
  const clockedIn = !!hub.openShift(uid) || hub.isOwner(uid);

  const save = async () => {
    const [projectId, stepId] = target.split('|');
    const doneAt = when ? chicagoToUtc(chicagoDate(hub.now), when) : undefined;
    const r = await act(() => hub.logSmallTask(uid, { title, doneAt, requestedByUid: askedBy || null, note, projectId: projectId || null, stepId: stepId || null, idempotencyKey: key.current }), 'Saved. Dalia can see it under “Other work”.');
    if (r) onClose();
  };
  return (
    <Modal title="Log something I did" onClose={onClose}>
      <form className="stack" onSubmit={(e) => { e.preventDefault(); void save(); }}>
        <p className="small muted" style={{ margin: 0 }}>Use this for small jobs the computer may not have seen, like a quick fix someone asked you to make. It is your own note. It does not change any step’s status.</p>
        <div><label htmlFor="lt-title">What did you do?</label><input id="lt-title" type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Example: Updated the listing for “MS066”" autoFocus /></div>
        <div className="row" style={{ alignItems: 'flex-end' }}>
          <div style={{ flex: '1 1 200px' }}><label htmlFor="lt-who">Who asked you to? (optional)</label>
            <select id="lt-who" value={askedBy} onChange={(e) => setAskedBy(e.target.value)}><option value="">Nobody. I did it on my own</option>{people.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select></div>
          <div style={{ flex: '0 1 150px' }}><label htmlFor="lt-when">About when? (optional)</label><input id="lt-when" type="time" value={when} onChange={(e) => setWhen(e.target.value)} /></div>
        </div>
        <div><label htmlFor="lt-for">What was it for?</label>
          <select id="lt-for" value={target} onChange={(e) => setTarget(e.target.value)}>
            <option value="">A small task. Not part of a project</option>
            {myProjects.map((p) => (
              <optgroup key={p.id} label={`${p.key} — ${p.shortName ?? p.title.slice(0, 40)}`}>
                <option value={`${p.id}|`}>Part of this project (no particular step)</option>
                {hub.projectSteps(uid, p.id).filter((s) => !s.parentStepId).map((s) => <option key={s.id} value={`${p.id}|${s.id}`}>Step {s.sortOrder}: {s.title.slice(0, 60)}</option>)}
              </optgroup>))}
          </select></div>
        <div><label htmlFor="lt-note">Anything else? (optional)</label><textarea id="lt-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Example: Dalia noticed the price was wrong. I fixed it." /></div>
        {!clockedIn && <p className="small" style={{ color: 'var(--warn)', margin: 0 }}>You are not clocked in. This is paid work, so please clock in first.</p>}
        <div className="row"><button className="primary" type="submit" disabled={!title.trim()}>Save</button><button type="button" className="quiet" onClick={onClose}>Cancel</button></div>
      </form>
    </Modal>
  );
}
