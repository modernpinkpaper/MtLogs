import type { HubServer } from './hub';
import type { DayNote, PrintClaim, PrintLogRow, Shift, User } from '../domain/types';
import { HubError, PermissionDenied } from './errors';
import { addMinutes, chicagoDate, chicagoToUtc, minutesBetween } from '../domain/time';
import { errorCount } from './errorLog';

// How printing numbers are worked out (Dalia's rules, unchanged):
//  - An order counts for the person who has it claimed. Claiming means "I am printing this". If they unclaim it, it counts for nobody.
//    Each order counts once, and if it moves to someone else it counts only for the new person.
//  - Revenue per productive hour = revenue ÷ (clocked time − project time). Project time that overlaps is counted once, and only
//    the part inside clocked time is taken out. It never goes below zero. Breaks are paid, so they stay in.
//  - Dalia and Moe do not clock in. For them the working time runs from the first to the last printing record of the day, minus project time.

const rawClaims = (hub: HubServer): PrintClaim[] => hub.state.claims ?? [];
const logs = (hub: HubServer): PrintLogRow[] => hub.state.printLogs ?? [];

/** The claims that count right now: not unclaimed, and one per order (the latest claim wins). */
export function activeClaims(hub: HubServer): PrintClaim[] {
  const latest = new Map<string, PrintClaim>();
  for (const c of rawClaims(hub)) {
    if (c.unclaimedAt) { const cur = latest.get(c.orderId); if (!cur || cur.claimedAt <= c.claimedAt) latest.set(c.orderId, c); continue; }
    const cur = latest.get(c.orderId);
    if (!cur || cur.claimedAt <= c.claimedAt) latest.set(c.orderId, c);
  }
  return [...latest.values()].filter((c) => !c.unclaimedAt);
}

function authorize(hub: HubServer, uid: string, forUid: string) {
  if (forUid !== uid && hub.user(uid).role !== 'OWNER') throw new PermissionDenied();
  return hub.user(forUid);
}

// ---------------------------------------------------------------- working time
type Win = [number, number];
const ms = (iso: string) => Date.parse(iso);
const mergeWins = (w: Win[]): Win[] => { const s = [...w].sort((a, b) => a[0] - b[0]); const out: Win[] = []; for (const x of s) { const l = out[out.length - 1]; if (l && x[0] <= l[1]) l[1] = Math.max(l[1], x[1]); else out.push([x[0], x[1]]); } return out; };
const total = (w: Win[]) => w.reduce((t, x) => t + (x[1] - x[0]), 0);
const intersect = (a: Win[], b: Win[]): Win[] => { const out: Win[] = []; for (const x of a) for (const y of b) { const s = Math.max(x[0], y[0]); const e = Math.min(x[1], y[1]); if (e > s) out.push([s, e]); } return mergeWins(out); };

const shiftsOn = (hub: HubServer, uid: string, ymd: string): Shift[] => hub.state.shifts.filter((s) => s.uid === uid && chicagoDate(s.clockInAt) === ymd);

/** First and last printing record of the day on the person’s computer. Used only for people who do not clock in. */
function printingSpan(hub: HubServer, user: User, ymd: string): Win | null {
  const dev = user.primaryDeviceId; if (!dev) return null;
  const times: number[] = [];
  for (const r of logs(hub)) if (r.pc === dev && chicagoDate(r.at) === ymd) times.push(ms(r.at));
  if (!times.length) for (const j of hub.state.printJobs) if (j.deviceId === dev && chicagoDate(j.startedAt) === ymd) times.push(ms(j.startedAt));
  if (times.length < 2) return null;
  const a = Math.min(...times); const b = Math.max(...times);
  return b > a ? [a, b] : null;
}

/** Project time the person confirmed for that day. Overlaps are merged first. */
function projectWins(hub: HubServer, user: User, ymd: string): Win[] {
  const st = hub.state; const dev = user.primaryDeviceId;
  const spans: Win[] = [];
  for (const f of st.findings) {
    if (!f.projectId || !['CONFIRMED', 'CORRECTED'].includes(f.status)) continue;
    if (!(f.actorUid === user.id || (f.actorUid === null && dev && f.deviceId === dev))) continue;
    const times = f.sourceEventIds.map((id) => st.events.find((e) => e.id === id)?.occurredAt).filter((x): x is string => !!x && chicagoDate(x) === ymd).sort();
    if (times.length >= 2) spans.push([ms(times[0]), ms(times[times.length - 1])]);
  }
  return mergeWins(spans);
}

export interface Basis { source: 'CLOCK' | 'PRINT_LOG_SPAN' | 'NONE'; workedMin: number; projectMin: number; productiveMin: number; note: string }
const fmt = (m: number) => `${Math.floor(m / 60)}h ${m % 60}m`;

export function basisFor(hub: HubServer, uid: string, ymd: string): Basis {
  const u = hub.user(uid);
  const noClock = u.role === 'OWNER' || !!u.noClock;
  let source: Basis['source'] = 'NONE'; let wins: Win[] = [];
  if (!noClock) {
    const sh = shiftsOn(hub, uid, ymd);
    if (sh.length) { source = 'CLOCK'; wins = mergeWins(sh.map((s): Win => [ms(s.clockInAt), ms(s.clockOutAt ?? hub.state.now)])); }
  } else {
    const sp = printingSpan(hub, u, ymd);
    if (sp) { source = 'PRINT_LOG_SPAN'; wins = [sp]; }
  }
  const workedMin = Math.round(total(wins) / 60000);
  const projectMin = Math.round(total(intersect(projectWins(hub, u, ymd), wins)) / 60000);
  const productiveMin = Math.max(0, workedMin - projectMin);
  const note = source === 'NONE'
    ? (noClock ? 'There are no printing records for this day, so working time cannot be worked out.' : 'No clock in was found for this day, so revenue per hour cannot be worked out.')
    : source === 'PRINT_LOG_SPAN'
      ? `${u.name} does not clock in. Working time runs from the first to the last printing record (${fmt(workedMin)})${projectMin ? `, minus ${fmt(projectMin)} of confirmed project work, leaves ${fmt(productiveMin)}` : ''}.`
      : projectMin > 0 ? `Clocked ${fmt(workedMin)}, minus ${fmt(projectMin)} of project work you confirmed, leaves ${fmt(productiveMin)}.` : `Clocked ${fmt(workedMin)}. No project work was confirmed, so all of it counts.`;
  return { source, workedMin, projectMin, productiveMin, note };
}
export const workedMinutes = (hub: HubServer, uid: string, ymd: string) => basisFor(hub, uid, ymd).workedMin;
export const projectMinutes = (hub: HubServer, uid: string, ymd: string) => basisFor(hub, uid, ymd).projectMin;

// ---------------------------------------------------------------- one person, one day
export interface OrderRow { orderId: string; at: string; buyer: string; sku: string; quantity: number; subtotal: number; prints: number }
export interface PrintDay {
  date: string; orders: number; revenue: number; prints: number; workedMin: number; projectMin: number; basisMin: number;
  revenuePerHour: number | null; basisNote: string; basisSource: Basis['source']; asOf: string | null; inProgress: boolean;
}

export function ordersOn(hub: HubServer, forUid: string, ymd: string): OrderRow[] {
  return activeClaims(hub).filter((c) => c.uid === forUid && chicagoDate(c.claimedAt) === ymd).sort((a, b) => b.claimedAt.localeCompare(a.claimedAt))
    .map((c) => ({ orderId: c.orderId, at: c.claimedAt, buyer: c.buyer, sku: c.items.map((i) => i.sku).join(', '), quantity: c.items.reduce((t, i) => t + i.quantity, 0), subtotal: c.subtotal, prints: c.prints }));
}

export function printDay(hub: HubServer, uid: string, forUid: string, ymd: string): PrintDay {
  authorize(hub, uid, forUid);
  const mine = activeClaims(hub).filter((c) => c.uid === forUid && chicagoDate(c.claimedAt) === ymd);
  const revenue = mine.reduce((t, c) => t + c.subtotal, 0);
  const b = basisFor(hub, forUid, ymd);
  const isToday = ymd === chicagoDate(hub.state.now);
  return {
    date: ymd, orders: mine.length, revenue: Math.round(revenue * 100) / 100, prints: mine.reduce((t, c) => t + c.prints, 0), workedMin: b.workedMin, projectMin: b.projectMin, basisMin: b.productiveMin,
    revenuePerHour: b.productiveMin > 0 ? Math.round((revenue / (b.productiveMin / 60)) * 100) / 100 : null,
    basisNote: b.note, basisSource: b.source, asOf: isToday ? hub.state.now : null, inProgress: isToday,
  };
}

/** The last n days for the history table, newest first. */
export function printDays(hub: HubServer, uid: string, forUid: string, endYmd: string, n = 10): PrintDay[] {
  authorize(hub, uid, forUid);
  return Array.from({ length: n }, (_, i) => printDay(hub, uid, forUid, chicagoDate(addMinutes(chicagoToUtc(endYmd, '12:00'), -i * 1440))));
}

export interface PrintWindow { days: number; orders: number; revenue: number; daysWorked: number; basisMin: number; revenuePerHour: number | null; avgDailyRevenue: number | null; errors: number; errorRatePct: number | null }

export function printWindow(hub: HubServer, uid: string, forUid: string, ymd: string, days: number): PrintWindow {
  authorize(hub, uid, forUid);
  const from = chicagoDate(addMinutes(chicagoToUtc(ymd, '12:00'), -(days - 1) * 1440));
  const inWin = activeClaims(hub).filter((c) => c.uid === forUid && chicagoDate(c.claimedAt) >= from && chicagoDate(c.claimedAt) <= ymd);
  const revenue = inWin.reduce((t, c) => t + c.subtotal, 0);
  let basisMin = 0; let daysWorked = 0;
  for (let i = 0; i < days; i++) { const b = basisFor(hub, forUid, chicagoDate(addMinutes(chicagoToUtc(ymd, '12:00'), -i * 1440))); if (b.workedMin > 0) { daysWorked++; basisMin += b.productiveMin; } }
  const errors = errorCount(hub, forUid, from);
  return {
    days, orders: inWin.length, revenue: Math.round(revenue * 100) / 100, daysWorked, basisMin,
    revenuePerHour: basisMin > 0 ? Math.round((revenue / (basisMin / 60)) * 100) / 100 : null,
    avgDailyRevenue: daysWorked > 0 ? Math.round((revenue / daysWorked) * 100) / 100 : null,
    errors, errorRatePct: inWin.length ? Math.round((errors / inWin.length) * 10000) / 100 : null,
  };
}

export function printSummary(hub: HubServer, uid: string, forUid: string = uid, ymd: string = chicagoDate(hub.state.now)) {
  const user = authorize(hub, uid, forUid);
  const all = activeClaims(hub).filter((c) => c.uid === forUid);
  const last = all.map((c) => c.claimedAt).sort().pop() ?? null;
  return {
    user, day: printDay(hub, uid, forUid, ymd), windows: [30, 90, 180].map((d) => printWindow(hub, uid, forUid, ymd, d)),
    notes: (hub.state.dayNotes ?? []).filter((n) => n.uid === forUid && n.date === ymd).sort((a, b) => a.at.localeCompare(b.at)),
    hasClaims: all.length > 0, lastClaimAt: last, hasRecentPrinting: !!last && minutesBetween(last, hub.state.now) <= 30 * 1440,
    connected: hub.state.claims !== undefined,
    dataNote: hub.state.claims ? 'Numbers come from active claimed orders.' : 'Claimed orders are not connected yet, so there are no numbers.',
  };
}

// ---------------------------------------------------------------- the whole print team, one day (owner only)
export interface TeamRow { uid: string; name: string; orders: number; revenue: number; productiveMin: number; revenuePerHour: number | null; active: boolean; source: Basis['source'] }
export function printTeam(hub: HubServer, uid: string, ymd: string) {
  hub.requireOwner(uid);
  const claims = activeClaims(hub).filter((c) => chicagoDate(c.claimedAt) === ymd);
  const people = hub.state.users.filter((u) => u.active && (u.area === 'PRINT' || u.area === 'MIXED' || claims.some((c) => c.uid === u.id)));
  const rows: TeamRow[] = people.map((u) => {
    const d = printDay(hub, uid, u.id, ymd);
    return { uid: u.id, name: u.name, orders: d.orders, revenue: d.revenue, productiveMin: d.basisMin, revenuePerHour: d.revenuePerHour, active: d.orders > 0 || d.workedMin > 0, source: d.basisSource };
  }).filter((r) => r.active || hub.user(r.uid).area === 'PRINT').sort((a, b) => b.revenue - a.revenue || a.name.localeCompare(b.name));
  const teamRevenue = Math.round(rows.reduce((t, r) => t + r.revenue, 0) * 100) / 100;
  // Team rate = revenue ÷ hours of the same people. Never an average of personal rates.
  const cohort = rows.filter((r) => r.revenue > 0 && r.productiveMin > 0);
  const excluded = rows.filter((r) => r.revenue > 0 && r.productiveMin === 0);
  const cRev = cohort.reduce((t, r) => t + r.revenue, 0); const cMin = cohort.reduce((t, r) => t + r.productiveMin, 0);
  return {
    date: ymd, rows, connected: hub.state.claims !== undefined, isToday: ymd === chicagoDate(hub.state.now), asOf: ymd === chicagoDate(hub.state.now) ? hub.state.now : null,
    team: { orders: rows.reduce((t, r) => t + r.orders, 0), revenue: teamRevenue, productiveMin: cohort.reduce((t, r) => t + r.productiveMin, 0), revenuePerHour: cMin > 0 ? Math.round((cRev / (cMin / 60)) * 100) / 100 : null },
    warning: excluded.length ? `${excluded.map((r) => r.name).join(', ')} had revenue but no working time, so ${excluded.length === 1 ? 'they are' : 'they are'} left out of the team rate.` : null,
  };
}

/** A general note for the day, like “my left printer was giving me trouble”. It stays in the log for that day. */
export function addDayNote(hub: HubServer, uid: string, ymd: string, text: string): DayNote {
  const t = text.trim();
  if (!t) throw new HubError('VALIDATION', 'Write a note first.');
  if (t.length > 1000) throw new HubError('VALIDATION', 'Please keep the note under 1000 letters.');
  if (ymd > chicagoDate(hub.state.now)) throw new HubError('INVALID_DATE', 'That day has not happened yet.');
  return hub.commit(() => { const n: DayNote = { id: hub.nid('dn'), uid, date: ymd, text: t, at: hub.state.now }; (hub.state.dayNotes ??= []).push(n); return n; });
}

// ---------------------------------------------------------------- practice data
const FIRST = ['Taylor', 'Jordan', 'Morgan', 'Casey', 'Riley', 'Avery', 'Quinn', 'Harper', 'Rowan', 'Skyler', 'Parker', 'Reese', 'Emerson', 'Finley', 'Sage', 'Blake'];
const LAST = ['Ames', 'Bishop', 'Calder', 'Dunn', 'Ellis', 'Foster', 'Grant', 'Hale', 'Irwin', 'Jensen', 'Keane', 'Lowe', 'Marsh', 'Nolan', 'Ortiz', 'Pratt'];
const STYLES = ['FLAT', 'FLAT', 'FLAT', 'FOLDED'];
const PRINTERS = ['<---LEFT SIDE PRINTER', 'RIGHT SIDE PRINTER--->', '<<XTRA LEFT'];

/** Made-up claims, shifts and print log rows so the printing screens can be tried. Never used in the private real-data copy. */
export function seedPracticeClaims(users: User[], shifts: Shift[], nowIso: string): { claims: PrintClaim[]; shifts: Shift[]; logs: PrintLogRow[] } {
  let seed = 7; const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  const out: PrintClaim[] = []; const newShifts: Shift[] = []; const rows: PrintLogRow[] = [];
  const today = chicagoDate(nowIso);
  const printers = users.filter((x) => x.active && (x.role === 'EMPLOYEE' || x.noClock) && (x.area === 'PRINT' || x.area === 'MIXED'));
  for (const u of printers) {
    for (let back = 0; back < 190; back++) {
      const ymd = chicagoDate(addMinutes(chicagoToUtc(today, '12:00'), -back * 1440));
      const dow = new Date(`${ymd}T12:00:00Z`).getUTCDay(); if (dow === 0 || dow === 6) continue;
      if (u.area === 'MIXED' && rnd() < 0.5) continue;
      if (!u.noClock && !shifts.some((s) => s.uid === u.id && chicagoDate(s.clockInAt) === ymd)) {
        newShifts.push({ id: `sh-p-${u.id}-${ymd}`, uid: u.id, clockInAt: chicagoToUtc(ymd, '08:00'), clockOutAt: back === 0 ? null : chicagoToUtc(ymd, '16:30'), reviewSessions: [], clockInKey: `pin-${u.id}-${ymd}`, clockOutKey: back === 0 ? null : `pout-${u.id}-${ymd}` });
      }
      const n = 8 + Math.floor(rnd() * 20);
      for (let i = 0; i < n; i++) {
        const q = [20, 20, 30, 30, 40][Math.floor(rnd() * 5)]; const sub = Math.round((22 + rnd() * 70) * 100) / 100;
        const hh = 8 + Math.floor((i / n) * 8); const mm = Math.floor(rnd() * 59);
        const at = chicagoToUtc(ymd, `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`);
        const buyer = `${FIRST[Math.floor(rnd() * FIRST.length)]} ${LAST[Math.floor(rnd() * LAST.length)]}`;
        const orderId = `${3000 + out.length}`;
        out.push({ id: `cl-${u.id}-${ymd}-${i}`, orderId, uid: u.id, claimedAt: at, buyer, items: [{ sku: 'CPI-001', quantity: q, subtotal: sub, prints: q }], subtotal: sub, prints: q });
        // Print log rows for recent days only: the file is named for the buyer, with the quantity, like the real logs.
        if (back < 12 && u.primaryDeviceId) {
          const skip = rnd() < 0.06; // some orders have no log row at all
          if (!skip) {
            const file = `${buyer} - ${q} - ${STYLES[Math.floor(rnd() * STYLES.length)]}.indd`;
            const parts = [1, 1, q - 2]; let k = 0;
            for (const c of parts) { const t = addMinutes(at, 3 + k * 2); rows.push({ id: `pl-${rows.length}`, at: t, file, copies: c, pc: u.primaryDeviceId, printer: PRINTERS[Math.floor(rnd() * 3)], path: `G:\\My Drive\\Printed_Jobs\\${ymd}\\${file.replace('.indd', '')}_${u.primaryDeviceId}_${c}copies${k ? `_00${k}` : ''}.jpg` }); k++; }
          }
        }
      }
    }
  }
  // Two buyers share one name on one day, to practise the "several possible matches" case.
  const dup = out.find((c) => chicagoDate(c.claimedAt) === today);
  if (dup) {
    const twin: PrintClaim = { ...dup, id: `${dup.id}-twin`, orderId: `${dup.orderId}9`, claimedAt: addMinutes(dup.claimedAt, 40) };
    out.push(twin);
    const u = printers.find((x) => x.id === dup.uid);
    if (u?.primaryDeviceId) { const file = `${dup.buyer} - ${dup.items[0].quantity} - FLAT.indd`; rows.push({ id: `pl-twin-${rows.length}`, at: addMinutes(twin.claimedAt, 4), file, copies: dup.items[0].quantity, pc: u.primaryDeviceId, printer: PRINTERS[0], path: `G:\\My Drive\\Printed_Jobs\\${today}\\${file.replace('.indd', '')}_${u.primaryDeviceId}_${dup.items[0].quantity}copies_002.jpg` }); }
  }
  return { claims: out, shifts: newShifts, logs: rows };
}
