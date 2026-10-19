import { useState } from 'react';
import { useAct, useMe } from './hubContext';
import { Modal } from './common';
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

const STATUS_OPTIONS: { to: 'IN_PROGRESS' | 'WAITING' | 'BLOCKED' | 'REPORTED_COMPLETE' | 'NOT_APPLICABLE'; label: string }[] = [
  { to: 'IN_PROGRESS', label: 'In progress' }, { to: 'WAITING', label: 'Waiting on something' }, { to: 'BLOCKED', label: 'Blocked' }, { to: 'REPORTED_COMPLETE', label: 'Completed' }, { to: 'NOT_APPLICABLE', label: 'Not needed' },
];

/** One "Update status" button. It opens every choice. The one that matches today's status is greyed out and cannot be clicked again. */
export function StatusMenu({ step, compact }: { step: Step; compact?: boolean }) {
  const { hub, uid } = useMe();
  const act = useAct();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [asking, setAsking] = useState<null | 'BLOCKED' | 'WAITING'>(null);
  const done = step.status === 'REPORTED_COMPLETE' || step.status === 'VERIFIED_COMPLETE';
  const isCurrent = (to: string) => step.status === to || (to === 'REPORTED_COMPLETE' && done);
  const go = async (to: (typeof STATUS_OPTIONS)[number]['to'], why = '') => {
    const r = await act(() => hub.transitionStep(uid, step.id, to, { reason: why }), `Saved: ${STATUS_OPTIONS.find((o) => o.to === to)!.label}`);
    if (r) { setOpen(false); setAsking(null); setReason(''); }
  };
  return (
    <div className="stack" style={{ gap: 6 }}>
      <div><button className={compact ? 'pill-btn' : 'primary'} aria-expanded={open} onClick={() => { setOpen(!open); setAsking(null); }}>Update status</button></div>
      {open && (
        <div className="stack" style={{ gap: 6 }} role="group" aria-label="Choose a status">
          <div className="row" style={{ gap: 6 }}>
            {STATUS_OPTIONS.map((o) => (
              <button key={o.to} className={compact ? 'pill-btn' : ''} disabled={isCurrent(o.to)} aria-pressed={isCurrent(o.to)} title={isCurrent(o.to) ? 'This is the status now. Pick another one to change it.' : undefined}
                onClick={() => (o.to === 'BLOCKED' || o.to === 'WAITING' ? setAsking(o.to) : void go(o.to))}>{o.label}</button>))}
          </div>
          {asking && (
            <form className="row" onSubmit={(e) => { e.preventDefault(); void go(asking, reason); }}>
              <input type="text" aria-label="Reason" placeholder={asking === 'BLOCKED' ? 'What is in the way? (needed)' : 'What are you waiting on?'} value={reason} onChange={(e) => setReason(e.target.value)} style={{ flex: 1 }} autoFocus />
              <button className="primary" type="submit" disabled={asking === 'BLOCKED' && !reason.trim()}>Save</button>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
