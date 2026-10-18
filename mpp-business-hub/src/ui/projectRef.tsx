import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAct, useMe } from './hubContext';
import { formatDate } from '../domain/time';

/**
 * A small "i" beside a project name or number. Tap or click it (or hover on a computer) to read what the project is,
 * who is on it, and what is next. People on the project can edit the description. A hidden project shows nothing at all.
 */
export function ProjectInfo({ projectId, label }: { projectId: string; label?: string }) {
  const { hub, uid } = useMe();
  const act = useAct();
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState(false);
  const [text, setText] = useState('');
  const box = useRef<HTMLSpanElement>(null);
  const hoverTimer = useRef<number | undefined>(undefined);

  let card: ReturnType<typeof hub.projectCard> | null = null;
  try { card = hub.projectCard(uid, projectId); } catch { card = null; }

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) { setOpen(false); setEdit(false); } };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') { setOpen(false); setEdit(false); } };
    document.addEventListener('mousedown', away); document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', away); document.removeEventListener('keydown', esc); };
  }, [open]);

  if (!card) return null;
  const name = label ?? card.key;
  return (
    <span className="pinfo" ref={box}
      onMouseEnter={() => { window.clearTimeout(hoverTimer.current); hoverTimer.current = window.setTimeout(() => setOpen(true), 350); }}
      onMouseLeave={() => { window.clearTimeout(hoverTimer.current); if (!edit) hoverTimer.current = window.setTimeout(() => setOpen(false), 250); }}>
      <button type="button" className="pinfo-btn" aria-label={`About ${name}`} aria-expanded={open} onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen(!open); }}>i</button>
      {open && (
        <span className="pinfo-card" role="dialog" aria-label={`About ${card.key}`}>
          <span className="eyebrow">{card.key}{card.paused ? ' · Paused' : ''}</span>
          <strong className="pinfo-title">{card.shortName}</strong>
          {edit ? (
            <span className="stack" style={{ display: 'block' }}>
              <label htmlFor={`pd-${projectId}`}>What is this project? (a few plain sentences)</label>
              <textarea id={`pd-${projectId}`} value={text} onChange={(e) => setText(e.target.value)} placeholder="Example: Put the new fall products on Shopify, then check each one." style={{ minHeight: 90 }} />
              <span className="row" style={{ marginTop: 6 }}>
                <button type="button" className="primary" onClick={async () => { const r = await act(() => hub.setProjectDescription(uid, projectId, text), 'Description saved'); if (r) setEdit(false); }}>Save</button>
                <button type="button" className="quiet" onClick={() => setEdit(false)}>Cancel</button>
              </span>
            </span>
          ) : (
            <>
              <span className="pinfo-desc">{card.description ?? card.objective}</span>
              {!card.description && <span className="small muted" style={{ display: 'block' }}>No description yet. This is the project goal.</span>}
              <dl className="kv pinfo-kv">
                <dt>Who</dt><dd>{card.people.join(', ') || 'Nobody assigned yet'}</dd>
                {card.deadlineAt && <><dt>Due</dt><dd>{formatDate(card.deadlineAt)}</dd></>}
                {card.nextStepTitle && <><dt>{card.paused ? 'Next when resumed' : 'Next'}</dt><dd>{card.nextStepTitle}</dd></>}
              </dl>
              <span className="row" style={{ marginTop: 6 }}>
                <Link to={`/projects/${projectId}`} onClick={() => setOpen(false)}><button type="button">Open project</button></Link>
                {card.canEdit && <button type="button" className="quiet" onClick={() => { setText(card!.description ?? ''); setEdit(true); }}>{card.description ? 'Edit description' : 'Add a description'}</button>}
              </span>
            </>
          )}
        </span>
      )}
    </span>
  );
}

/** A project key that links to the project, with the "i" beside it. */
export function ProjectLabel({ projectId, text, to }: { projectId: string; text: string; to?: string }) {
  return <span className="plabel"><Link to={to ?? `/projects/${projectId}`}>{text}</Link><ProjectInfo projectId={projectId} label={text} /></span>;
}
