import { useState } from 'react';
import { Link } from 'react-router-dom';
import { formatDateTime } from '../../domain/time';
import { useMe } from '../hubContext';
import { JournalList } from '../parts';
import type { JournalType } from '../../domain/types';

const TYPES: { id: JournalType; label: string }[] = [
  { id: 'STATUS_CHANGE', label: 'Status changes' }, { id: 'UPDATE_REQUESTED', label: 'Requests' }, { id: 'UPDATE_RESPONSE', label: 'Answers' }, { id: 'PROACTIVE_UPDATE', label: 'Updates from people' },
  { id: 'AI_OBSERVATION', label: 'AI guesses' }, { id: 'EMPLOYEE_REVIEW', label: 'People checked' }, { id: 'VERIFICATION', label: 'System checks' }, { id: 'RESOURCE', label: 'Files' }, { id: 'LATE_EVIDENCE', label: 'Late facts' }, { id: 'PLAN_CHANGE', label: 'Plan changes' },
];

export function JournalFilters({ projectId, stepId, grouped }: { projectId?: string; stepId?: string; grouped?: boolean }) {
  const { hub, uid } = useMe();
  const [q, setQ] = useState('');
  const [types, setTypes] = useState<JournalType[]>([]);
  const [verified, setVerified] = useState(false);
  const [order, setOrder] = useState<'newest' | 'oldest'>('newest');
  const [day, setDay] = useState('');
  const events = hub.getJournal(uid, { projectId, stepId, q, types, verifiedOnly: verified, order, day: day || undefined });
  return (
    <div className="stack">
      <div className="row">
        <input type="search" aria-label="Search journal" placeholder="Search words, SKU, file name or number…" value={q} onChange={(e) => setQ(e.target.value)} style={{ maxWidth: 320 }} />
        <input type="date" aria-label="Day" value={day} onChange={(e) => setDay(e.target.value)} style={{ width: 'auto' }} />
        <select aria-label="Order" style={{ width: 'auto' }} value={order} onChange={(e) => setOrder(e.target.value as 'newest' | 'oldest')}><option value="newest">Newest first</option><option value="oldest">Oldest first</option></select>
        <label className="row" style={{ fontWeight: 500, margin: 0 }}><input type="checkbox" checked={verified} onChange={(e) => setVerified(e.target.checked)} /> Double-checked only</label>
      </div>
      <div className="row">{TYPES.map((t) => (
        <button key={t.id} aria-pressed={types.includes(t.id)} className={types.includes(t.id) ? 'primary' : ''} style={{ minHeight: 32, padding: '.2rem .6rem' }} onClick={() => setTypes(types.includes(t.id) ? types.filter((x) => x !== t.id) : [...types, t.id])}>{t.label}</button>))}</div>
      <JournalList events={events} showProject={!projectId} grouped={grouped ?? true} />
    </div>
  );
}

type Kind = 'ALL' | 'Project' | 'Alert' | 'Error' | 'AI recommendation';

/** Everything that ever came to Home, plus the project notes. Clearing something on Home never removes it from here. */
export function Journal() {
  const { hub, uid, me } = useMe();
  const [kind, setKind] = useState<Kind>('ALL');
  const [q, setQ] = useState('');
  const extras = hub.historyExtras(uid);
  const kinds: { id: Kind; label: string }[] = [{ id: 'ALL', label: 'Everything' }, { id: 'Project', label: 'Projects' }, { id: 'Alert', label: 'Alerts' }, { id: 'Error', label: 'Errors' }, ...(me.role === 'OWNER' ? [{ id: 'AI recommendation' as Kind, label: 'AI recommendations' }] : [])];
  const needle = q.trim().toLowerCase();
  const rows = [
    ...(kind === 'ALL' || kind === 'Project' ? hub.getJournal(uid, {}).map((e) => ({ id: e.id, at: e.occurredAt, kind: 'Project' as const, title: e.title, summary: e.summary, link: `/projects/${e.projectId}${e.stepIds[0] ? `/steps/${e.stepIds[0]}` : ''}`, tag: e.projectKey })) : []),
    ...extras.filter((x) => kind === 'ALL' || x.kind === kind).map((x) => ({ ...x, tag: x.kind as string })),
  ].filter((r) => !needle || `${r.title} ${r.summary}`.toLowerCase().includes(needle)).sort((a, b) => b.at.localeCompare(a.at)).slice(0, 300);
  return (
    <div className="stack">
      <div><h1>History</h1><p className="muted" style={{ margin: 0 }}>Everything that happened, including what you already cleared from Home. Nothing here is ever deleted.</p></div>
      <div className="row">
        <input type="search" aria-label="Search history" placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} style={{ maxWidth: 320 }} />
        {kinds.map((k) => <button key={k.id} className="pill-btn" aria-pressed={kind === k.id} onClick={() => setKind(k.id)}>{k.label}</button>)}
      </div>
      {kind === 'Project' && !needle && <JournalFilters />}
      {!(kind === 'Project' && !needle) && (rows.length === 0 ? <div className="muted">Nothing matches.</div> : (
        <div>{rows.map((r) => (
          <div key={`${r.kind}-${r.id}`} className="journal-item human">
            <div><strong>{r.title}</strong></div>
            {r.summary && <div className="small" style={{ color: 'var(--text-2)' }}>{r.summary}</div>}
            <div className="row small muted" style={{ gap: '.2rem .75rem', marginTop: 2 }}><span>{formatDateTime(r.at)}</span><span>{r.tag}</span>{r.link && <Link to={r.link}>Open</Link>}</div>
          </div>))}</div>
      ))}
    </div>
  );
}
