import type { ReactNode } from 'react';
import { REAL_MODE } from '../server/realLoader';
import { useMe } from './hubContext';
import { Chip } from './common';
import { addMinutes, chicagoDate, chicagoToUtc, formatDate, formatTime } from '../domain/time';
import type { OrderRow } from '../server/printStats';

export const money = (n: number | null | undefined) => (n == null ? '—' : `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
export const hours = (min: number | null | undefined) => (min == null || min <= 0 ? '—' : `${(min / 60).toFixed(1)}`);
const shift = (ymd: string, days: number) => chicagoDate(addMinutes(chicagoToUtc(ymd, '12:00'), days * 1440));
const longDay = (ymd: string) => formatDate(chicagoToUtc(ymd, '12:00'));

const ICON: Record<string, string> = {
  orders: 'M7 3h7l5 5v13H7zM14 3v5h5M10 13h6M10 17h6',
  money: 'M12 3v18M16 7.5c0-1.4-1.8-2.5-4-2.5s-4 1.1-4 2.5 1.8 2.5 4 2.5 4 1.1 4 2.5-1.8 2.5-4 2.5-4-1.1-4-2.5',
  chart: 'M5 20V10M12 20V4M19 20v-7',
  clock: 'M12 7v5l3 2M12 3a9 9 0 100 18 9 9 0 000-18z',
};
export function KpiIcon({ name }: { name: keyof typeof ICON }) {
  return <span className="kicon" aria-hidden="true"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={ICON[name]} /></svg></span>;
}

/** A strip of day tabs: Today, Yesterday, then the days before. One date is selected at a time. A calendar reaches older days. */
export function DayNavigator({ date, onChange }: { date: string; onChange: (ymd: string) => void }) {
  const { hub } = useMe();
  const today = chicagoDate(hub.now);
  const days = Array.from({ length: 7 }, (_, i) => shift(today, -i));
  const short = (ymd: string) => new Date(chicagoToUtc(ymd, '12:00')).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'America/Chicago' });
  return (
    <div className="daystrip" role="group" aria-label="Choose a day">
      <div className="dtabs">
        {days.map((d, i) => (
          <button key={d} className="dtab" aria-pressed={date === d} onClick={() => onChange(d)}>{i === 0 ? <><strong>Today</strong><span>{short(d)}</span></> : i === 1 ? <><strong>Yesterday</strong><span>{short(d)}</span></> : <strong>{short(d)}</strong>}</button>
        ))}
        {!days.includes(date) && <button className="dtab" aria-pressed="true"><strong>{short(date)}</strong></button>}
      </div>
      <label className="row" style={{ margin: 0, fontWeight: 500 }}><span className="sr-only">Choose a date</span><input type="date" aria-label="Choose a date" max={today} value={date} onChange={(e) => e.target.value && onChange(e.target.value)} style={{ width: 'auto' }} /></label>
    </div>
  );
}

/** The three numbers, and only these three. Same size, quiet colours. */
export function MetricSummary({ items }: { items: { label: string; value: string; help: string; tone: 'pink' | 'blue' | 'green'; hint?: string; icon?: keyof typeof ICON }[] }) {
  return (
    <div className="kpis" role="group" aria-label="Main numbers">
      {items.map((k) => (
        <div key={k.label} className={`kpi ${k.tone}`} title={k.hint}>
          {k.icon && <KpiIcon name={k.icon} />}
          <div className="kbody"><div className="kl">{k.label}</div><div className="kv">{k.value}</div><div className="kh">{k.help}</div></div>
        </div>
      ))}
    </div>
  );
}

/** Where the numbers come from and how fresh they are. Honest, and quiet. */
export function SourceFreshnessLabel({ connected, asOf, provisional }: { connected: boolean; asOf: string | null; provisional?: boolean }) {
  return (
    <span className="small muted row" style={{ gap: 6 }}>
      {!connected ? <Chip tone="gray">Not connected</Chip> : asOf ? <>Updated {formatTime(asOf)} · in progress</> : <>Final for this day</>}
      {connected && provisional && <Chip tone="warn">Provisional</Chip>}
      {!REAL_MODE && <Chip tone="violet">Demo data</Chip>}
    </span>
  );
}

export function OrdersList({ rows }: { rows: OrderRow[] }) {
  if (!rows.length) return <p className="small muted" style={{ margin: 0 }}>No orders on this day.</p>;
  return (
    <div className="tablewrap"><table className="ordtable"><thead><tr><th>Order #</th><th>Buyer</th><th>SKU</th><th className="num">Qty</th><th className="num">Subtotal</th><th>Claimed</th></tr></thead>
      <tbody>{rows.map((o) => <tr key={o.orderId}><td>{o.orderId}</td><td>{o.buyer}</td><td>{o.sku}</td><td className="num">{o.quantity}</td><td className="num">{money(o.subtotal)}</td><td>{formatTime(o.at)}</td></tr>)}</tbody></table></div>
  );
}

export function HowItWorks({ children }: { children?: ReactNode }) {
  return (
    <details className="soft small">
      <summary>How the numbers are worked out</summary>
      <ul style={{ margin: '.4rem 0 0 1.1rem' }}>
        <li><strong>Orders and revenue:</strong> claiming an order means “I am printing this”. It counts for whoever has it claimed now. If they give it back (unclaim) it counts for nobody. Each order counts once.</li>
        <li><strong>Productive hours:</strong> clocked time, minus project work that was confirmed. Overlapping project time counts once. Breaks are paid, so they stay in. People who do not clock in use the first to last printing record of the day.</li>
        <li><strong>Revenue per productive hour</strong> = revenue ÷ productive hours. It shows “—” when there are no hours.</li>
        {children}
      </ul>
    </details>
  );
}
