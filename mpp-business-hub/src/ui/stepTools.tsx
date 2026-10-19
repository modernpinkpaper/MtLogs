import { useState } from 'react';
import { useAct, useMe } from './hubContext';
import { Modal } from './common';
import { chicagoDate } from '../domain/time';
import { SKU_COLUMNS, SKU_FAMILIES } from '../server/stepWork';
import type { Project, Step } from '../domain/types';

/** A name or text that can be changed in place. Shows a small "Edit" button when the person may change it. */
export function EditableText({ value, canEdit, onSave, label, multiline, placeholder, as = 'span' }: { value: string; canEdit: boolean; onSave: (v: string) => Promise<unknown> | unknown; label: string; multiline?: boolean; placeholder?: string; as?: 'span' | 'h2' | 'h1' }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(value);
  const Tag = as;
  if (!editing) {
    if (!value && canEdit && placeholder) return <button className="link small" style={{ fontWeight: 400 }} aria-label={`Edit ${label}`} onClick={() => { setText(value); setEditing(true); }}>{placeholder}</button>;
    return (
      <Tag style={as === 'span' ? undefined : { margin: 0 }}>
        {value || <span className="muted">{placeholder ?? 'Nothing yet'}</span>}
        {canEdit && <button className="link small" style={{ marginLeft: 8, fontWeight: 400, fontSize: '.8rem' }} aria-label={`Edit ${label}`} onClick={() => { setText(value); setEditing(true); }}>Edit</button>}
      </Tag>
    );
  }
  const save = async () => { const r = await onSave(text); if (r !== false) setEditing(false); };
  return (
    <form className="row" style={{ gap: 6, alignItems: 'flex-start' }} onSubmit={(e) => { e.preventDefault(); void save(); }}>
      {multiline ? <textarea aria-label={label} value={text} onChange={(e) => setText(e.target.value)} style={{ flex: 1, minHeight: 70 }} autoFocus /> : <input type="text" aria-label={label} value={text} onChange={(e) => setText(e.target.value)} style={{ flex: 1 }} autoFocus />}
      <button className="primary" type="submit">Save</button><button type="button" onClick={() => setEditing(false)}>Cancel</button>
    </form>
  );
}

/** Ask how many, then make that many blank rows that can be named. */
export function AddStepsDialog({ projectId, parentStepId, onClose }: { projectId: string; parentStepId?: string | null; onClose: () => void }) {
  const { hub, uid } = useMe();
  const act = useAct();
  const [n, setN] = useState(1);
  const sub = !!parentStepId;
  return (
    <Modal title={sub ? 'Add sub steps' : 'Add steps'} onClose={onClose}>
      <form className="stack" onSubmit={async (e) => { e.preventDefault(); const r = await act(() => hub.addSteps(uid, projectId, n, parentStepId ?? null), `${n} ${sub ? 'sub step' : 'step'}${n === 1 ? '' : 's'} added. Give them names.`); if (r) onClose(); }}>
        <p className="small muted">You get blank rows. You can name each one and write what to do right after. You can drag them to change the order.</p>
        <div><label htmlFor="as-n">How many {sub ? 'sub steps' : 'steps'}?</label><input id="as-n" type="number" min={1} max={40} value={n} onChange={(e) => setN(Number(e.target.value))} style={{ maxWidth: 120 }} /></div>
        <div className="row"><button className="primary" type="submit" disabled={!(n >= 1 && n <= 40)}>Add</button><button type="button" onClick={onClose}>Cancel</button></div>
      </form>
    </Modal>
  );
}

/** New Google Sheet or Doc for a step, named the standard way. Practice only in this copy. */
export function NewFileDialog({ project, step, kind, onClose }: { project: Project; step: Step; kind: 'SHEET' | 'DOC'; onClose: () => void }) {
  const { hub, uid } = useMe();
  const act = useAct();
  const [mode, setMode] = useState<'BLANK' | 'SKU' | 'COPY'>('BLANK');
  const [families, setFamilies] = useState<string[]>([]);
  const [columns, setColumns] = useState<string[]>(SKU_COLUMNS.slice(0, 3));
  const [copyId, setCopyId] = useState('');
  const [made, setMade] = useState<string | null>(null);
  const sheets = hub.projectResources(uid, project.id).filter((x) => x.resource.type === 'GOOGLE_SHEET').map((x) => x.resource).filter((r, i, a) => a.findIndex((q) => q.id === r.id) === i);
  const colNames: string[] = SKU_COLUMNS;
  const toggle = (arr: string[], v: string, on: boolean) => (on ? [...arr, v] : arr.filter((x) => x !== v));
  if (made) {
    return (
      <Modal title="File made" onClose={onClose}>
        <div className="stack"><div className="card ok" role="status"><strong>{made}</strong></div>
          <p className="small muted">In the real app this opens in a new tab. This practice copy does not make anything in Google Drive.</p>
          <button className="primary" onClick={onClose}>Done</button></div>
      </Modal>
    );
  }
  return (
    <Modal title={kind === 'SHEET' ? 'New Google Sheet' : 'New Google Doc'} onClose={onClose}>
      <form className="stack" onSubmit={async (e) => { e.preventDefault(); const r = await act(() => hub.createStepFile(uid, step.id, kind === 'DOC' ? { kind } : { kind, mode, families, columns, copyFromResourceId: copyId || undefined })); if (r) setMade(r.label); }}>
        <p className="small muted">The name is made for you: project, step, your name and a file number. It follows the step if the step is renamed or moved.</p>
        {kind === 'SHEET' && (
          <fieldset style={{ border: 'none', padding: 0 }}><legend style={{ fontWeight: 600 }}>How should it start?</legend>
            <label style={{ fontWeight: 500 }}><input type="radio" name="nf-mode" checked={mode === 'BLANK'} onChange={() => setMode('BLANK')} /> A blank sheet</label>
            <label style={{ fontWeight: 500 }}><input type="radio" name="nf-mode" checked={mode === 'SKU'} onChange={() => setMode('SKU')} /> A SKU list (pick SKU families and columns)</label>
            <label style={{ fontWeight: 500 }}><input type="radio" name="nf-mode" checked={mode === 'COPY'} onChange={() => setMode('COPY')} /> A copy of a sheet already in this project</label>
          </fieldset>
        )}
        {kind === 'SHEET' && mode === 'SKU' && (
          <>
            <fieldset style={{ border: 'none', padding: 0 }}><legend style={{ fontWeight: 600 }}>SKU families</legend>
              <div className="row" style={{ gap: '.4rem 1rem' }}>{SKU_FAMILIES.map((f) => <label key={f} style={{ fontWeight: 500 }}><input type="checkbox" checked={families.includes(f)} onChange={(e) => setFamilies(toggle(families, f, e.target.checked))} /> {f}</label>)}</div></fieldset>
            <fieldset style={{ border: 'none', padding: 0 }}><legend style={{ fontWeight: 600 }}>Columns</legend>
              <div className="row" style={{ gap: '.4rem 1rem' }}>{colNames.map((c) => <label key={c} style={{ fontWeight: 500 }}><input type="checkbox" checked={columns.includes(c)} onChange={(e) => setColumns(toggle(columns, c, e.target.checked))} /> {c}</label>)}</div></fieldset>
          </>
        )}
        {kind === 'SHEET' && mode === 'COPY' && (
          <div><label htmlFor="nf-copy">Sheet to copy</label><select id="nf-copy" value={copyId} onChange={(e) => setCopyId(e.target.value)}><option value="">Choose one</option>{sheets.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}</select></div>
        )}
        <div className="row"><button className="primary" type="submit" disabled={kind === 'SHEET' && ((mode === 'SKU' && families.length === 0) || (mode === 'COPY' && !copyId))}>Make it</button><button type="button" onClick={onClose}>Cancel</button></div>
      </form>
    </Modal>
  );
}

export function LinkFileDialog({ step, onClose }: { step: Step; onClose: () => void }) {
  const { hub, uid } = useMe();
  const act = useAct();
  const [url, setUrl] = useState('');
  const [name, setName] = useState('');
  return (
    <Modal title="Link a file I already have" onClose={onClose}>
      <form className="stack" onSubmit={async (e) => { e.preventDefault(); const r = await act(() => hub.linkExistingFile(uid, step.id, { url, name }), 'File linked'); if (r) onClose(); }}>
        <p className="small muted">The file keeps its own name. Paste its link and say what it is.</p>
        <div><label htmlFor="lf-u">Link</label><input id="lf-u" type="text" placeholder="https://docs.google.com/…" value={url} onChange={(e) => setUrl(e.target.value)} /></div>
        <div><label htmlFor="lf-n">Name</label><input id="lf-n" type="text" value={name} onChange={(e) => setName(e.target.value)} /></div>
        <div className="row"><button className="primary" type="submit" disabled={!url.trim() || !name.trim()}>Link file</button><button type="button" onClick={onClose}>Cancel</button></div>
      </form>
    </Modal>
  );
}

/**
 * The one status button. It opens four choices:
 * In progress (to start, or to restart), Completed (once started), Archive (not needed any more, still shown in the list),
 * and Blocked (needs a reason, and can have a day to look at it again). The choice that matches today is greyed out.
 */
export function StatusMenu({ step, compact }: { step: Step; compact?: boolean }) {
  const { hub, uid } = useMe();
  const act = useAct();
  const [open, setOpen] = useState(false);
  const [asking, setAsking] = useState(false);
  const [reason, setReason] = useState('');
  const [remind, setRemind] = useState('');
  const done = step.status === 'REPORTED_COMPLETE' || step.status === 'VERIFIED_COMPLETE';
  const archived = step.status === 'NOT_APPLICABLE';
  const started = step.status !== 'NOT_STARTED';
  const go = async (to: 'IN_PROGRESS' | 'REPORTED_COMPLETE' | 'NOT_APPLICABLE' | 'BLOCKED', msg: string, extra: { reason?: string; remindOn?: string | null } = {}) => {
    const r = await act(() => hub.transitionStep(uid, step.id, to, extra), msg);
    if (r) { setOpen(false); setAsking(false); setReason(''); setRemind(''); }
  };
  const btn = compact ? 'pill-btn' : '';
  return (
    <div className="stack" style={{ gap: 6 }}>
      <div><button className={compact ? 'pill-btn' : 'primary'} aria-expanded={open} onClick={() => { setOpen(!open); setAsking(false); }}>Update status</button></div>
      {open && (
        <div className="stack" style={{ gap: 6 }} role="group" aria-label="Choose a status">
          <div className="row" style={{ gap: 6 }}>
            <button className={btn} disabled={step.status === 'IN_PROGRESS'} aria-pressed={step.status === 'IN_PROGRESS'} onClick={() => void go('IN_PROGRESS', 'Saved: In progress')}>In progress</button>
            <button className={btn} disabled={!started || done || archived} aria-pressed={done} title={!started ? 'Start the step first.' : undefined} onClick={() => void go('REPORTED_COMPLETE', 'Saved: Completed')}>Completed</button>
            <button className={btn} disabled={archived} aria-pressed={archived} title="Not needed any more. It stays in the list." onClick={() => { if (confirm('Archive this step? It stays in the list, marked as archived.')) void go('NOT_APPLICABLE', 'Archived'); }}>Archive</button>
            <button className={btn} disabled={step.status === 'BLOCKED'} aria-pressed={step.status === 'BLOCKED'} onClick={() => setAsking(true)}>Blocked</button>
          </div>
          {asking && (
            <form className="stack" style={{ gap: 6 }} onSubmit={(e) => { e.preventDefault(); void go('BLOCKED', 'Saved: Blocked', { reason, remindOn: remind || null }); }}>
              <input type="text" aria-label="Reason" placeholder="What is in the way? (needed)" value={reason} onChange={(e) => setReason(e.target.value)} autoFocus />
              <label className="row" style={{ margin: 0, fontWeight: 500, gap: 8 }}>Look at it again on (if you want) <input type="date" aria-label="Look at it again on" value={remind} min={chicagoDate(hub.now)} onChange={(e) => setRemind(e.target.value)} style={{ width: 'auto' }} /></label>
              {remind && <span className="small muted">On that day it shows up on your Home so you remember to come back.</span>}
              <div><button className="primary" type="submit" disabled={!reason.trim()}>Save</button></div>
            </form>
          )}
        </div>
      )}
    </div>
  );
}

/** Give a whole project, or one step, to someone else. Dalia only. */
export function ReassignDialog({ project, step, onClose }: { project: Project; step?: Step; onClose: () => void }) {
  const { hub, uid } = useMe();
  const act = useAct();
  const team = hub.listUsers(uid).filter((u) => u.role === 'EMPLOYEE' && u.active);
  const [from, setFrom] = useState<string>(project.memberUids[0] ?? '');
  const [to, setTo] = useState<string[]>([]);
  const steps = hub.projectSteps(uid, project.id);
  const doneCount = steps.filter((s) => ['REPORTED_COMPLETE', 'VERIFIED_COMPLETE', 'NOT_APPLICABLE'].includes(s.status)).length;
  return (
    <Modal title={step ? 'Give this step to someone else' : 'Give this project to someone else'} onClose={onClose}>
      <form className="stack" onSubmit={async (e) => { e.preventDefault(); const r = await act(() => (step ? hub.reassignStep(uid, step.id, to) : hub.reassignProject(uid, project.id, from || null, to)), 'Done. They have a notification.'); if (r) onClose(); }}>
        {step ? <p className="small muted" style={{ margin: 0 }}>They can see the whole project, but they can change only their own steps. Nobody else can change this step after you give it. Now it is {step.assignedUids.map((a) => hub.userName(a)).join(', ') || 'not assigned'}.</p>
          : <>
            <p className="small muted" style={{ margin: 0 }}>Steps that are not done move to the new person. {doneCount} step{doneCount === 1 ? ' is' : 's are'} already done. They stay done and keep the name of who did them. The new person sees them as done.</p>
            <div><label htmlFor="rp-from">Take it from</label><select id="rp-from" value={from} onChange={(e) => setFrom(e.target.value)}><option value="">Nobody (just add)</option>{project.memberUids.map((m) => <option key={m} value={m}>{hub.userName(m)}</option>)}</select></div></>}
        <fieldset style={{ border: 'none', padding: 0 }}><legend style={{ fontWeight: 600 }}>Give it to</legend>
          {team.filter((u) => u.id !== from).map((u) => <label key={u.id} style={{ fontWeight: 500 }}><input type="checkbox" checked={to.includes(u.id)} onChange={(e) => setTo(e.target.checked ? [...to, u.id] : to.filter((x) => x !== u.id))} /> {u.name}</label>)}</fieldset>
        <div className="row"><button className="primary" type="submit" disabled={!to.length}>Give it</button><button type="button" onClick={onClose}>Cancel</button></div>
      </form>
    </Modal>
  );
}

/** Dalia’s note at the top of a project. */
export function ProjectNoteDialog({ project, onClose }: { project: Project; onClose: () => void }) {
  const { hub, uid } = useMe();
  const act = useAct();
  const [text, setText] = useState(project.ownerNote?.text ?? '');
  return (
    <Modal title="Note to the team" onClose={onClose}>
      <form className="stack" onSubmit={async (e) => { e.preventDefault(); const r = await act(() => hub.setProjectNote(uid, project.id, text), 'Saved'); if (r) onClose(); }}>
        <p className="small muted" style={{ margin: 0 }}>It shows at the top of the project to everyone on it. Leave it empty to take it away.</p>
        <textarea aria-label="Note to the team" value={text} onChange={(e) => setText(e.target.value)} placeholder="For example: Hey Erika! I need this by next week. Update the steps when you get a moment." style={{ minHeight: 100 }} />
        <div className="row"><button className="primary" type="submit">Save</button><button type="button" onClick={onClose}>Cancel</button></div>
      </form>
    </Modal>
  );
}

/** Take a file off a step. The original file is never deleted. If the step is done and it is not the person’s own step, that person decides. */
export function RemoveFileButton({ linkId, label, stepDone }: { linkId: string; label: string; stepDone: boolean }) {
  const { hub, uid } = useMe();
  const act = useAct();
  const [open, setOpen] = useState(false);
  const link = hub.state.resourceLinks.find((l) => l.id === linkId);
  const waiting = !!link?.removalRequest;
  return (
    <>
      {waiting ? <span className="small muted">Waiting for the person who did this step to say yes</span> : <button className="link small" aria-label={`Remove ${label} from this step`} onClick={() => setOpen(true)}>Remove from step</button>}
      {open && (
        <Modal title="Take this file off the step?" onClose={() => setOpen(false)}>
          <div className="stack">
            <p style={{ margin: 0 }}>“{label}” will be taken off this step. <strong>The file itself is not deleted.</strong> This is saved in the history.</p>
            {stepDone && <p className="card warn small" style={{ margin: 0 }}>This step is already done. If it is not your step, the person who did it will be asked to confirm first.</p>}
            <div className="row"><button className="primary" onClick={async () => { const r = await act(() => hub.removeFile(uid, linkId), 'Done'); if (r) setOpen(false); }}>Yes, take it off</button><button onClick={() => setOpen(false)}>Keep it</button></div>
          </div>
        </Modal>
      )}
    </>
  );
}
