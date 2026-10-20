import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAct, useMe } from '../hubContext';
import { Avatar } from '../avatar';
import { ErrorFacts } from '../errorUi';
import { DayNavigator, HowItWorks, MetricSummary, OrdersList, SourceFreshnessLabel, hours, money } from '../printTeamUi';
import { chicagoDate, formatDateTime, formatTime } from '../../domain/time';

/** A person’s own day: three numbers, and a short list of recent days. Nobody else’s numbers are here. */
export function PrintMyStats() {
  const { hub, uid, me } = useMe();
  const act = useAct();
  const [sp, setSp] = useSearchParams();
  const today = chicagoDate(hub.now);
  const date = sp.get('date') && /^\d{4}-\d{2}-\d{2}$/.test(sp.get('date')!) ? sp.get('date')! : today;
  const [open, setOpen] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const s = hub.printSummary(uid, uid, date);
  const d = s.day;
  const days = hub.printDays(uid, uid, date, 10);
  const view = hub.myPrintStats(uid, uid, date);
  const errors = hub.listErrors(uid).filter((e) => e.uid === uid && e.ownerAck).slice(0, 8);
  const pct = (n: number | null) => (n == null ? '—' : `${n.toFixed(2)}%`);
  const setDate = (x: string) => { const n = new URLSearchParams(sp); n.set('date', x); setSp(n); };
  return (
    <div className="stack">
      <div className="row between" style={{ alignItems: 'flex-end' }}>
        <div><h1 style={{ margin: 0 }}>My Print Stats</h1><p className="muted" style={{ margin: 0 }}>Your daily numbers, from your claimed orders.</p></div>
        <SourceFreshnessLabel connected={s.connected} asOf={d.asOf} provisional={d.inProgress} />
      </div>
      <div className="row"><span className="person"><Avatar uid={uid} size={44} /><span><strong style={{ fontSize: '1.1rem' }}>{me.name}</strong>{d.asOf ? <span className="small muted"> · updated {formatTime(d.asOf)}</span> : null}</span></span></div>
      <DayNavigator date={date} onChange={setDate} />
      <MetricSummary items={[
        { label: `Revenue · ${date === today ? 'Today' : date}`, value: s.connected ? money(d.revenue) : '—', help: 'From your claimed orders', tone: 'pink' },
        { label: 'Revenue per productive hour', value: d.revenuePerHour == null ? '— / hr' : `${money(d.revenuePerHour)} / hr`, help: d.basisMin > 0 ? `Based on ${hours(d.basisMin)} productive hours` : 'Needs working time', tone: 'blue', hint: 'Revenue ÷ productive hours' },
        { label: 'Orders printed', value: s.connected ? String(d.orders) : '—', help: 'Unique orders you have claimed', tone: 'green' },
      ]} />
      {!s.connected && <div className="card info small" role="status"><strong>Claimed orders are not connected yet.</strong> There are no numbers to show, and nothing is made up.</div>}
      {d.inProgress && s.connected && <p className="small muted" style={{ margin: 0 }}>Today is still in progress, so these numbers can change.</p>}

      <div className="card" style={{ padding: 0 }}>
        <div style={{ padding: '1rem 1.1rem 0' }}><h2 style={{ margin: 0 }}>Your recent days</h2></div>
        <div className="tablewrap"><table className="ptable" aria-label="Recent days">
          <thead><tr><th>Date</th><th>Revenue</th><th>Productive hours</th><th>Revenue / hour</th><th>Orders</th><th aria-label="Open" /></tr></thead>
          <tbody>{days.map((x) => (
            <tr key={x.date} className={`row-link ${x.date === date ? 'sel' : ''}`} onClick={() => setDate(x.date)}>
              <td><strong>{x.date === today ? 'Today' : x.date}</strong></td>
              <td>{s.connected ? money(x.revenue) : '—'}</td><td>{hours(x.basisMin)}</td><td>{x.revenuePerHour == null ? '—' : money(x.revenuePerHour)}</td>
              <td>{s.connected ? (x.orders > 0 ? <button className="cell" onClick={(e) => { e.stopPropagation(); setOpen(open === x.date ? null : x.date); }} aria-expanded={open === x.date} aria-label={`${x.orders} orders on ${x.date}, show them`}>{x.orders}</button> : 0) : '—'}</td>
              <td><button className="link" onClick={(e) => { e.stopPropagation(); setDate(x.date); }}>View day</button></td>
            </tr>))}</tbody></table></div>
        {open && <div style={{ padding: '0 1.1rem 1rem' }}><h3 style={{ margin: '.4rem 0' }}>Orders on {open}</h3><OrdersList rows={hub.printOrders(uid, uid, open)} /></div>}
      </div>

      <details className="soft small"><summary>How your hours are calculated</summary><p style={{ margin: '.4rem 0 0' }}>{d.basisNote}</p></details>
      <HowItWorks />
      <details className="soft"><summary>Longer view: 30, 90 and 180 days, and errors</summary>
        <div className="stack" style={{ marginTop: 8 }}>
          {!s.connected ? <p className="small muted" style={{ margin: 0 }}>{s.dataNote}</p> : (
            <div className="tablewrap"><table className="ptable"><thead><tr><th>Last</th><th>Orders</th><th>Errors</th><th>Error rate</th><th>Average revenue per day</th><th>Revenue per hour</th></tr></thead><tbody>
              {s.windows.map((w) => <tr key={w.days}><td>{w.days} days</td><td>{w.orders}</td><td>{w.errors}</td><td>{pct(w.errorRatePct)}</td><td>{money(w.avgDailyRevenue)}</td><td>{money(w.revenuePerHour)}</td></tr>)}</tbody></table></div>
          )}
          <p className="small muted" style={{ margin: 0 }}>Error rate = errors ÷ orders.</p>
          <h3 style={{ margin: 0 }}>Errors in your log</h3>
          {errors.length === 0 ? <span className="muted small">None.</span> : errors.map((e) => <div key={e.id} className="card flat"><ErrorFacts e={e} />{e.personAck && <div className="small"><strong>Note:</strong> {e.personAck.note}</div>}</div>)}
        </div>
      </details>
      <details className="soft"><summary>Note for the day and printer problems</summary>
        <div className="stack" style={{ marginTop: 8 }}>
          {s.notes.map((n) => <div key={n.id} className="small"><span className="muted">{formatDateTime(n.at)}:</span> {n.text}</div>)}
          <form className="row" style={{ alignItems: 'flex-start' }} onSubmit={async (e) => { e.preventDefault(); const r = await act(() => hub.addDayNote(uid, date, note), 'Note saved for this day'); if (r) setNote(''); }}>
            <div style={{ flex: 1 }}><label htmlFor="dn-my">Add a note for the day (if you want)</label><textarea id="dn-my" value={note} onChange={(e) => setNote(e.target.value)} placeholder="For example: the left side printer was giving me trouble." style={{ minHeight: 56 }} /></div>
            <button type="submit" disabled={!note.trim()} style={{ marginTop: 24 }}>Save note</button>
          </form>
          <h3 style={{ margin: 0 }}>Printer problems <span className="small muted" style={{ fontWeight: 400 }}>(from MT Logs)</span></h3>
          {view.problemEpisodes.length === 0 ? <span className="muted small">No problems recorded.</span> : view.problemEpisodes.map((e) => <div key={e.id} className="small">{e.printer}: {e.kind.toLowerCase()} from {formatTime(e.startedAt)}{e.endedAt ? ` to ${formatTime(e.endedAt)}` : ' (still open)'}</div>)}
        </div>
      </details>
    </div>
  );
}
