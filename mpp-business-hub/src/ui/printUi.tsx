import { useState } from 'react';
import { useAct, useMe } from './hubContext';
import { Chip } from './common';
import { formatDateTime } from '../domain/time';

export const money = (n: number | null | undefined) => (n == null ? '—' : `$${n.toFixed(2)}`);

/** The day’s numbers and a general note for the day. Used on the Clock page and on My printing. */
export function PrintDayCard({ forUid, date, title }: { forUid: string; date: string; title?: string }) {
  const { hub, uid } = useMe();
  const act = useAct();
  const [note, setNote] = useState('');
  const s = hub.printSummary(uid, forUid, date);
  const d = s.day;
  const mine = forUid === uid;
  return (
    <div className="card stack">
      <div className="row between"><h2 style={{ margin: 0 }}>{title ?? 'Printing numbers for the day'}</h2>{!hub.state.claims && <Chip tone="gray">Not connected yet</Chip>}</div>
      {!hub.state.claims ? <p className="small muted" style={{ margin: 0 }}>{s.dataNote} Orders and revenue will come from the print log. Nothing is made up.</p> : (
        <>
          <div className="statrow">
            <div className="stat"><div className="v">{d.orders}</div><div className="l">Orders printed</div></div>
            <div className="stat"><div className="v">{money(d.revenue)}</div><div className="l">Revenue</div></div>
            <div className="stat"><div className="v">{money(d.revenuePerHour)}</div><div className="l">Revenue per hour</div></div>
          </div>
          <p className="small muted" style={{ margin: 0 }}>{d.basisNote} An order counts as what the customer asked for, not how many tries it took.</p>
        </>
      )}
      {s.notes.map((n) => <div key={n.id} className="small"><span className="muted">{formatDateTime(n.at)}:</span> {n.text}</div>)}
      {mine && (
        <form className="row" style={{ alignItems: 'flex-start' }} onSubmit={async (e) => { e.preventDefault(); const r = await act(() => hub.addDayNote(uid, date, note), 'Note saved for this day'); if (r) setNote(''); }}>
          <div style={{ flex: 1 }}><label htmlFor={`dn-${date}`}>Add a note for the day (if you want)</label><textarea id={`dn-${date}`} value={note} onChange={(e) => setNote(e.target.value)} placeholder="For example: the left side printer was giving me trouble." style={{ minHeight: 56 }} /></div>
          <button type="submit" disabled={!note.trim()} style={{ marginTop: 24 }}>Save note</button>
        </form>
      )}
    </div>
  );
}
