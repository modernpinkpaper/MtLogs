import { useState } from 'react';
import { useMe } from '../hubContext';
import { JournalList } from '../parts';
import type { JournalType } from '../../domain/types';

const TYPES: { id: JournalType; label: string }[] = [
  { id: 'STATUS_CHANGE', label: 'Status changes' }, { id: 'UPDATE_REQUESTED', label: 'Requests' }, { id: 'UPDATE_RESPONSE', label: 'Responses' }, { id: 'PROACTIVE_UPDATE', label: 'Employee updates' },
  { id: 'AI_OBSERVATION', label: 'AI suggestions' }, { id: 'EMPLOYEE_REVIEW', label: 'Employee confirmations' }, { id: 'VERIFICATION', label: 'Verifications' }, { id: 'RESOURCE', label: 'Resources' }, { id: 'LATE_EVIDENCE', label: 'Late evidence' }, { id: 'PLAN_CHANGE', label: 'Plan changes' },
];

export function JournalFilters({ projectId, stepId }: { projectId?: string; stepId?: string }) {
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
        <input type="search" aria-label="Search journal" placeholder="Search text, SKU, file name, reference…" value={q} onChange={(e) => setQ(e.target.value)} style={{ maxWidth: 320 }} />
        <input type="date" aria-label="Day" value={day} onChange={(e) => setDay(e.target.value)} style={{ width: 'auto' }} />
        <select aria-label="Order" style={{ width: 'auto' }} value={order} onChange={(e) => setOrder(e.target.value as 'newest' | 'oldest')}><option value="newest">Newest first</option><option value="oldest">Chronological</option></select>
        <label className="row" style={{ fontWeight: 500, margin: 0 }}><input type="checkbox" checked={verified} onChange={(e) => setVerified(e.target.checked)} /> Verified only</label>
      </div>
      <div className="row">{TYPES.map((t) => (
        <button key={t.id} aria-pressed={types.includes(t.id)} className={types.includes(t.id) ? 'primary' : ''} style={{ minHeight: 32, padding: '.2rem .6rem' }} onClick={() => setTypes(types.includes(t.id) ? types.filter((x) => x !== t.id) : [...types, t.id])}>{t.label}</button>))}</div>
      <JournalList events={events} showProject={!projectId} />
    </div>
  );
}

export function Journal() {
  return <div className="stack"><div><h1>Journal</h1><p className="muted">One shared record of meaningful events across the projects you can see. Project and step views are filters of the same entries.</p></div><JournalFilters /></div>;
}
