import { useState } from 'react';
import { useMe } from '../hubContext';
import { Chip } from '../common';
import { PrintDayCard, money } from '../printUi';
import { ErrorFacts } from '../errorUi';
import { addMinutes, chicagoDate, chicagoToUtc, formatTime } from '../../domain/time';

/** Everyone has this page. It matters most for the people who print, and it is just as easy for the people who print twice a year. */
export function PrintMyStats() {
  const { hub, uid, me } = useMe();
  const today = chicagoDate(hub.now);
  const days = Array.from({ length: 10 }, (_, i) => chicagoDate(addMinutes(chicagoToUtc(today, '12:00'), -i * 1440)));
  const [date, setDate] = useState(today);
  const [who, setWho] = useState(uid);
  const s = hub.printSummary(uid, who, date);
  const view = hub.myPrintStats(uid, who, date);
  const people = hub.listUsers(uid).filter((u) => u.active && (u.role === 'EMPLOYEE' || u.noClock || u.id === uid));
  const errors = hub.listErrors(uid).filter((e) => e.uid === who && e.ownerAck).slice(0, 8);
  const pct = (n: number | null) => (n == null ? '—' : `${n.toFixed(2)}%`);
  return (
    <div className="stack">
      <div><h1>{who === uid ? 'My printing' : `${hub.userName(who)}’s printing`}</h1><p className="muted" style={{ margin: 0 }}>Your day, and how the last 30, 90 and 180 days look. These are numbers. They are not a grade.</p></div>
      <div className="row">
        <label className="row" style={{ margin: 0 }}>Day <select style={{ width: 'auto' }} value={date} onChange={(e) => setDate(e.target.value)}>{days.map((d) => <option key={d}>{d}</option>)}</select></label>
        {me.role === 'OWNER' && <label className="row" style={{ margin: 0 }}>Person <select style={{ width: 'auto' }} value={who} onChange={(e) => setWho(e.target.value)}>{people.map((u) => <option key={u.id} value={u.id}>{u.id === uid ? `${u.name} (me)` : u.name}</option>)}</select></label>}
        {!s.hasRecentPrinting && s.hasClaims && <Chip tone="gray">No printing in the last 30 days</Chip>}
      </div>

      <PrintDayCard forUid={who} date={date} title={date === today ? 'Today' : date} />

      <div className="card stack">
        <h2 style={{ margin: 0 }}>Over time</h2>
        {!hub.state.claims ? <p className="small muted" style={{ margin: 0 }}>{s.dataNote}</p> : (
          <div className="tablewrap"><table><thead><tr><th>Last</th><th>Orders</th><th>Errors</th><th>Error rate</th><th>Average revenue per day</th><th>Revenue per hour</th></tr></thead><tbody>
            {s.windows.map((w) => <tr key={w.days}><td>{w.days} days</td><td>{w.orders}</td><td>{w.errors}</td><td>{pct(w.errorRatePct)}</td><td>{money(w.avgDailyRevenue)}</td><td>{money(w.revenuePerHour)}</td></tr>)}</tbody></table></div>
        )}
        <p className="small muted" style={{ margin: 0 }}>Error rate = errors ÷ orders. Revenue per hour = revenue ÷ clocked hours, after taking out project time you confirmed.</p>
      </div>

      <div className="card stack"><h2 style={{ margin: 0 }}>Errors in the log</h2>
        {errors.length === 0 ? <span className="muted">None.</span> : errors.map((e) => <div key={e.id} className="card flat"><ErrorFacts e={e} />{e.personAck && <div className="small"><strong>Note:</strong> {e.personAck.note}</div>}</div>)}
      </div>

      <div className="card"><h2>Printer problems <span className="small muted" style={{ fontWeight: 400 }}>(from MT Logs)</span></h2>
        {view.problemEpisodes.length === 0 ? <span className="muted">No problems recorded.</span> : view.problemEpisodes.map((e) => (
          <div key={e.id} className="small">{e.printer}: {e.kind.toLowerCase()} from {formatTime(e.startedAt)}{e.endedAt ? ` to ${formatTime(e.endedAt)}` : ' (still open)'} — <strong>1 problem</strong> (the printer said so {e.snapshotCount} times)</div>))}
      </div>
    </div>
  );
}
