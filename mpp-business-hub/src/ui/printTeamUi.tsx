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

/** Today, Yesterday, one day back or forward, and a calendar. One date is selected at a time. */
export function DayNavigator({ date, onChange }: { date: string; onChange: (ymd: string) => void }) {
  const { hub } = useMe();
  const today = chicagoDate(hub.now); const yesterday = shift(today, -1);
  return (
    <div className="daynav" role="group" aria-label="Choose a day">
      <button className="pill-btn" aria-pressed={date === today} onClick={() => onChange(today)}>Today</button>
      <button className="pill-btn" aria-pressed={date === yesterday} onClick={() => onChange(yesterday)}>Yesterday</button>
      <button aria-label="One day earlier" onClick={() => onChange(shift(date, -1))}>◀</button>
      <strong className="daylabel" aria-live="polite">{date === today ? 'Today · ' : ''}{longDay(date)}</strong>
      <button aria-label="One day later" disabled={date >= today} onClick={() => onChange(shift(date, 1))}>▶</button>
      <label className="row" style={{ margin: 0, fontWeight: 500 }}><span className="sr-only">Choose a date</span><input type="date" aria-label="Choose a date" max={today} value={date} onChange={(e) => e.target.value && onChange(e.target.value)} style={{ width: 'auto' }} /></label>
    </div>
  );
}

/** The three numbers, and only these three. Same size, quiet colours. */
export function MetricSummary({ items }: { items: { label: string; value: string; help: string; tone: 'pink' | 'blue' | 'green'; hint?: string }[] }) {
  return (
    <div className="kpis" role="group" aria-label="Main numbers">
      {items.map((k) => (
        <div key={k.label} className={`kpi ${k.tone}`} title={k.hint}>
          <div className="kl">{k.label}</div>
          <div className="kv">{k.value}</div>
          <div className="kh">{k.help}</div>
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
