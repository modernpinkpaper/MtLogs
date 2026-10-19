import { Fragment, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useAct, useMe } from './hubContext';
import { Chip } from './common';
import { formatDate, formatDateTime } from '../domain/time';
import type { ErrorRow } from '../server/errorLog';

/** Tiny formatter for the error description: hard returns, - bullets, 1. numbered lists and **bold**. No HTML is ever trusted. */
export function RichText({ text }: { text: string }) {
  const inline = (s: string): ReactNode[] => s.split(/(\*\*[^*]+\*\*)/g).map((p, i) => (p.startsWith('**') && p.endsWith('**') && p.length > 4 ? <strong key={i}>{p.slice(2, -2)}</strong> : <Fragment key={i}>{p}</Fragment>));
  const out: ReactNode[] = []; let list: { ordered: boolean; items: string[] } | null = null;
  const flush = () => { if (!list) return; const Tag = list.ordered ? 'ol' : 'ul'; out.push(<Tag key={out.length} style={{ margin: '.2rem 0 .2rem 1.2rem', padding: 0 }}>{list.items.map((it, i) => <li key={i}>{inline(it)}</li>)}</Tag>); list = null; };
  for (const line of text.split('\n')) {
    const b = /^\s*[-•]\s+(.*)$/.exec(line); const n = /^\s*\d+[.)]\s+(.*)$/.exec(line);
    if (b || n) { const ordered = !!n; if (list && list.ordered !== ordered) flush(); list ??= { ordered, items: [] }; list.items.push((b ?? n)![1]); }
    else { flush(); out.push(line.trim() ? <p key={out.length} style={{ margin: '.2rem 0' }}>{inline(line)}</p> : <div key={out.length} style={{ height: 6 }} />); }
  }
  flush();
  return <div className="rich">{out}</div>;
}

export function RichEditor({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const edit = (fn: (sel: string) => string) => {
    const el = ref.current; if (!el) return;
    const a = el.selectionStart; const b = el.selectionEnd;
    const next = value.slice(0, a) + fn(value.slice(a, b)) + value.slice(b);
    onChange(next);
  };
  const lines = (prefix: (i: number) => string) => edit((s) => (s || 'item').split('\n').map((l, i) => prefix(i) + l.replace(/^\s*([-•]|\d+[.)])\s+/, '')).join('\n'));
  return (
    <div className="stack" style={{ gap: 4 }}>
      <div className="row" role="toolbar" aria-label="Formatting" style={{ gap: 4 }}>
        <button type="button" className="pill-btn" onClick={() => edit((s) => `**${s || 'bold text'}**`)}><strong>B</strong> Bold</button>
        <button type="button" className="pill-btn" onClick={() => lines(() => '- ')}>• Bullets</button>
        <button type="button" className="pill-btn" onClick={() => lines((i) => `${i + 1}. `)}>1. Numbered</button>
      </div>
      <textarea ref={ref} aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} style={{ minHeight: 120 }} />
    </div>
  );
}

const SAMPLE = 'Example: The wrong size was packed because I did not check the order. Next time I will check the size on the order against the item before I seal the box.';

export function ErrorFacts({ e, showPerson }: { e: ErrorRow; showPerson?: boolean }) {
  const { hub } = useMe();
  return (
    <div className="stack" style={{ gap: 4 }}>
      <div className="small muted">{showPerson ? <><strong>{e.personName}</strong> · </> : null}Happened {formatDate(`${e.occurredOn}T12:00:00Z`)} · logged by {e.createdByName} {formatDateTime(e.createdAt)}</div>
      <RichText text={e.description} />
      {e.links.length > 0 && <div className="small">Orders: {e.links.map((l, i) => <a key={l} href={l} target="_blank" rel="noreferrer" style={{ marginRight: 8 }}>Order link {i + 1}</a>)}</div>}
      {e.ownerAck?.note && <div className="card info small"><strong>Note from {hub.userName(e.ownerAck.byUid)}: </strong>{e.ownerAck.note}</div>}
    </div>
  );
}

/** For the person who made the error: read it, then acknowledge with a note, or snooze until the next clock in. There is no dismiss. */
export function PersonErrorCard({ e, onDone }: { e: ErrorRow; onDone?: () => void }) {
  const { hub, uid } = useMe();
  const act = useAct();
  const [note, setNote] = useState('');
  const snoozed = e.state === 'SNOOZED';
  return (
    <div className="card pink stack" role="region" aria-label="An error in your log">
      <div className="row between"><strong>An error was added to your log</strong>{snoozed && <Chip tone="gray" glyph="⏾">Snoozed until your next clock in</Chip>}</div>
      <ErrorFacts e={e} />
      <div><label htmlFor={`ack-${e.id}`}>Your note (needed)</label>
        <textarea id={`ack-${e.id}`} value={note} onChange={(ev) => setNote(ev.target.value)} placeholder={SAMPLE} style={{ minHeight: 90 }} />
        <p className="small muted" style={{ margin: '.2rem 0 0' }}>Say what you understood the error to be and what you can do to prevent it.</p></div>
      <div className="row">
        <button className="primary" disabled={note.trim().length < 15} onClick={async () => { const r = await act(() => hub.personAcknowledgeError(uid, e.id, note), 'Acknowledged. Dalia was told.'); if (r) onDone?.(); }}>I read it. Acknowledge</button>
        {!snoozed && <button onClick={async () => { const r = await act(() => hub.snoozeError(uid, e.id), 'Snoozed. It comes back when you clock in next.'); if (r) onDone?.(); }}>Snooze until my next clock in</button>}
      </div>
    </div>
  );
}

/** For an owner: read it first. A note is optional. For Moe, one click covers both of them. */
export function OwnerErrorCard({ e }: { e: ErrorRow }) {
  const { hub, uid } = useMe();
  const act = useAct();
  const [note, setNote] = useState('');
  const subject = hub.state.users.find((u) => u.id === e.uid);
  const forOther = subject?.role === 'OWNER' && subject.id !== uid;
  return (
    <div className="card stack" role="region" aria-label="An error to acknowledge">
      <div className="row between"><strong>{e.personName} · error logged by {e.createdByName}</strong><Chip tone="warn" glyph="!">{subject?.role === 'OWNER' ? 'Needs your acknowledgement' : `${e.personName} cannot see it until you acknowledge`}</Chip></div>
      <ErrorFacts e={e} />
      <div><label htmlFor={`oa-${e.id}`}>{subject?.role === 'OWNER' ? 'Note (if you want)' : `Note for ${e.personName} (if you want)`}</label><textarea id={`oa-${e.id}`} value={note} onChange={(ev) => setNote(ev.target.value)} style={{ minHeight: 60 }} /></div>
      <div className="row"><button className="primary" onClick={() => act(() => hub.ownerAcknowledgeError(uid, e.id, note), forOther ? `Acknowledged for ${e.personName} and you` : subject?.role === 'OWNER' ? 'Acknowledged' : `Acknowledged. ${e.personName} can see it now.`)}>{forOther ? `Acknowledge for ${e.personName} and me` : 'Acknowledge'}</button></div>
    </div>
  );
}
