import { useSearchParams } from 'react-router-dom';
import { useMe } from '../hubContext';
import { Avatar } from '../avatar';
import { DayNavigator, HowItWorks, MetricSummary, OrdersList, SourceFreshnessLabel, hours, money } from '../printTeamUi';
import { chicagoDate, formatTime } from '../../domain/time';

/** Owner: every print team member on one day, side by side. Click a person for their details. The date stays put. */
export function PrintTeam() {
  const { hub, uid } = useMe();
  const [sp, setSp] = useSearchParams();
  const today = chicagoDate(hub.now);
  const date = sp.get('date') && /^\d{4}-\d{2}-\d{2}$/.test(sp.get('date')!) ? sp.get('date')! : today;
  const person = sp.get('person');
  const set = (patch: Record<string, string | null>) => { const n = new URLSearchParams(sp); n.set('tab', 'printteam'); for (const [k, v] of Object.entries(patch)) v === null ? n.delete(k) : n.set(k, v); setSp(n); };
  const t = hub.printTeam(uid, date);
  const label = date === today ? 'Today' : date;
  return (
    <div className="stack">
      <div className="row between" style={{ alignItems: 'flex-end' }}>
        <div><h2 style={{ margin: 0 }}>Print Team</h2><p className="muted" style={{ margin: 0 }}>Daily revenue and order activity</p></div>
        <SourceFreshnessLabel connected={t.connected} asOf={t.asOf} provisional={t.isToday} />
      </div>
      <DayNavigator date={date} onChange={(d) => set({ date: d })} />
      <MetricSummary items={[
        { label: `Team revenue · ${label}`, value: t.connected ? money(t.team.revenue) : '—', help: 'From active claimed orders', tone: 'pink' },
        { label: 'Team revenue per productive hour', value: t.connected ? (t.team.revenuePerHour == null ? '— / hr' : `${money(t.team.revenuePerHour)} / hr`) : '—', help: t.team.productiveMin > 0 ? `Based on ${hours(t.team.productiveMin)} productive hours` : 'Needs working time', tone: 'blue', hint: 'Total revenue ÷ total productive hours. Not an average of personal rates.' },
        { label: 'Team orders printed', value: t.connected ? String(t.team.orders) : '—', help: 'Unique orders', tone: 'green' },
      ]} />
      {!t.connected && <div className="card info small" role="status"><strong>Claimed orders are not connected to this copy yet.</strong> There are no numbers to show, and nothing is made up. They will come from the Order Claimer.</div>}
      {t.warning && <div className="card warn small" role="status">{t.warning}</div>}
      <div className="card" style={{ padding: 0 }}>
        <div className="tablewrap"><table className="ptable" aria-label="Print team for the day">
          <thead><tr><th>Employee</th><th>Orders printed</th><th>Revenue</th><th>Productive hours</th><th>Revenue / hour</th><th aria-label="Open" /></tr></thead>
          <tbody>
            {t.rows.map((r) => (
              <tr key={r.uid} className={`row-link ${person === r.uid ? 'sel' : ''}`} onClick={() => set({ person: r.uid, orders: null })} tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter') set({ person: r.uid, orders: null }); }} aria-label={`${r.name}, open details`}>
                <td><span className="person"><Avatar uid={r.uid} size={34} /><strong>{r.name}</strong></span></td>
                <td>{t.connected ? (r.orders > 0 ? <button className="cell" onClick={(e) => { e.stopPropagation(); set({ person: r.uid, orders: '1' }); }} aria-label={`${r.orders} orders for ${r.name}, show them`}>{r.orders}</button> : (r.active ? 0 : <span className="muted small">No activity</span>)) : '—'}</td>
                <td>{t.connected ? money(r.revenue) : '—'}</td><td>{hours(r.productiveMin)}</td><td>{r.revenuePerHour == null ? '—' : money(r.revenuePerHour)}</td><td aria-hidden="true">›</td>
              </tr>))}
            {t.rows.length === 0 && <tr><td colSpan={6} className="muted" style={{ textAlign: 'center' }}>{t.connected ? 'No print team activity on this day.' : 'Not connected.'}</td></tr>}
          </tbody>
          {t.rows.length > 0 && <tfoot><tr><td>Team total</td><td>{t.connected ? t.team.orders : '—'}</td><td>{t.connected ? money(t.team.revenue) : '—'}</td><td>{hours(t.team.productiveMin)}</td><td>{t.team.revenuePerHour == null ? '—' : money(t.team.revenuePerHour)}</td><td /></tr></tfoot>}
        </table></div>
      </div>
      <HowItWorks><li><strong>Team revenue per hour</strong> = team revenue ÷ team productive hours. It is never the average of each person’s rate.</li></HowItWorks>
      {person && <PersonDrawer uid={person} date={date} showOrders={sp.get('orders') === '1'} onClose={() => set({ person: null, orders: null })} onDay={(d) => set({ date: d })} />}
    </div>
  );
}

/** One person, owner only. The team’s date and the table stay as they were. */
function PersonDrawer({ uid: who, date, showOrders, onClose, onDay }: { uid: string; date: string; showOrders: boolean; onClose: () => void; onDay: (d: string) => void }) {
  const { hub, uid } = useMe();
  const d = hub.printSummary(uid, who, date).day;
  const days = hub.printDays(uid, who, date, 10);
  const orders = hub.printOrders(uid, who, date);
  const connected = hub.state.claims !== undefined;
  return (
    <aside className="drawer" role="dialog" aria-label={`${hub.userName(who)}, ${date}`}>
      <div className="row between"><span className="person"><Avatar uid={who} size={48} /><span><strong style={{ fontSize: '1.2rem' }}>{hub.userName(who)}</strong><br /><span className="small muted">{date === chicagoDate(hub.now) ? 'Today' : date}{d.asOf ? ` · as of ${formatTime(d.asOf)}` : ''}</span></span></span><button className="ghost" onClick={onClose} aria-label="Close details">✕</button></div>
      <div style={{ marginTop: 12 }}><MetricSummary items={[
        { label: 'Revenue', value: connected ? money(d.revenue) : '—', help: 'Active claimed orders', tone: 'pink' },
        { label: 'Orders printed', value: connected ? String(d.orders) : '—', help: 'Unique orders', tone: 'green' },
        { label: 'Productive hours', value: hours(d.basisMin), help: d.basisSource === 'PRINT_LOG_SPAN' ? 'From printing records' : 'Clock in, minus project time', tone: 'blue' },
        { label: 'Revenue / hour', value: d.revenuePerHour == null ? '—' : money(d.revenuePerHour), help: 'Revenue ÷ productive hours', tone: 'blue' },
      ]} /></div>
      <p className="small muted">{d.basisNote}</p>
      <details className="soft" open={showOrders}><summary>Orders ({connected ? orders.length : '—'})</summary><div style={{ marginTop: 8 }}>{connected ? <OrdersList rows={orders} /> : <p className="small muted">Not connected.</p>}</div></details>
      <h3 style={{ marginTop: 16 }}>Recent days</h3>
      <div className="tablewrap"><table className="ptable"><thead><tr><th>Date</th><th>Revenue</th><th>Hrs</th><th>Rev/hr</th><th>Orders</th></tr></thead>
        <tbody>{days.map((x) => <tr key={x.date} className={`row-link ${x.date === date ? 'sel' : ''}`} onClick={() => onDay(x.date)}><td>{x.date}</td><td>{connected ? money(x.revenue) : '—'}</td><td>{hours(x.basisMin)}</td><td>{x.revenuePerHour == null ? '—' : money(x.revenuePerHour)}</td><td>{connected ? x.orders : '—'}</td></tr>)}</tbody></table></div>
    </aside>
  );
}
