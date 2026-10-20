import type { HubServer } from './hub';
import type { DayNote, PrintClaim, Shift, User } from '../domain/types';
import { HubError, PermissionDenied } from './errors';
import { addMinutes, chicagoDate, chicagoToUtc, minutesBetween } from '../domain/time';
import { errorCount } from './errorLog';

// Printing numbers come from CLAIMED ORDERS (who claimed it, the subtotal, and how many prints the order asked for).
// A claim counts what the order needed, not how many tries it took. Hours come from clock in to clock out.
// If a person worked on a project, those minutes come out of the hours before revenue per hour is worked out.

const claims = (hub: HubServer): PrintClaim[] => hub.state.claims ?? [];

function authorize(hub: HubServer, uid: string, forUid: string) {
  if (forUid !== uid && hub.user(uid).role !== 'OWNER') throw new PermissionDenied();
  return hub.user(forUid);
}

const shiftsOn = (hub: HubServer, uid: string, ymd: string): Shift[] => hub.state.shifts.filter((s) => s.uid === uid && chicagoDate(s.clockInAt) === ymd);
export function workedMinutes(hub: HubServer, uid: string, ymd: string): number {
  return Math.round(shiftsOn(hub, uid, ymd).reduce((t, s) => t + Math.max(0, minutesBetween(s.clockInAt, s.clockOutAt ?? hub.state.now)), 0));
}

/** Minutes the person spent on a project that day, taken only from activity they CONFIRMED belonged to a project. Overlaps count once. */
export function projectMinutes(hub: HubServer, uid: string, ymd: string): number {
  const st = hub.state; const dev = hub.user(uid).primaryDeviceId;
  const spans: [number, number][] = [];
  for (const f of st.findings) {
    if (!f.projectId || !['CONFIRMED', 'CORRECTED'].includes(f.status)) continue;
    if (!(f.actorUid === uid || (f.actorUid === null && dev && f.deviceId === dev))) continue;
    const times = f.sourceEventIds.map((id) => st.events.find((e) => e.id === id)?.occurredAt).filter((x): x is string => !!x && chicagoDate(x) === ymd).sort();
    if (times.length >= 2) spans.push([Date.parse(times[0]), Date.parse(times[times.length - 1])]);
  }
  spans.sort((a, b) => a[0] - b[0]);
  let total = 0; let cur: [number, number] | null = null;
  for (const s of spans) { if (cur && s[0] <= cur[1]) cur[1] = Math.max(cur[1], s[1]); else { if (cur) total += cur[1] - cur[0]; cur = [...s]; } }
  if (cur) total += cur[1] - cur[0];
  return Math.min(Math.round(total / 60000), workedMinutes(hub, uid, ymd));
}

export interface PrintDay { date: string; orders: number; revenue: number; prints: number; workedMin: number; projectMin: number; basisMin: number; revenuePerHour: number | null; basisNote: string }

export function printDay(hub: HubServer, uid: string, forUid: string, ymd: string): PrintDay {
  authorize(hub, uid, forUid);
  const mine = claims(hub).filter((c) => c.uid === forUid && chicagoDate(c.claimedAt) === ymd);
  const revenue = mine.reduce((t, c) => t + c.subtotal, 0);
  const workedMin = workedMinutes(hub, forUid, ymd); const projectMin = projectMinutes(hub, forUid, ymd);
  const basisMin = Math.max(0, workedMin - projectMin);
  return {
    date: ymd, orders: mine.length, revenue: Math.round(revenue * 100) / 100, prints: mine.reduce((t, c) => t + c.prints, 0), workedMin, projectMin, basisMin,
    revenuePerHour: basisMin > 0 ? Math.round((revenue / (basisMin / 60)) * 100) / 100 : null,
    basisNote: hub.user(forUid).role === 'OWNER' || hub.user(forUid).noClock ? 'Owners do not clock in, so there are no hours and no revenue per hour. Orders and revenue still count.'
      : workedMin === 0 ? 'No clock in was found for this day, so revenue per hour cannot be worked out.'
      : projectMin > 0 ? `Clocked ${fmt(workedMin)}, minus ${fmt(projectMin)} of project work you confirmed, leaves ${fmt(basisMin)}.` : `Clocked ${fmt(workedMin)}. No project work was confirmed, so all of it counts.`,
  };
}
const fmt = (m: number) => `${Math.floor(m / 60)}h ${m % 60}m`;

export interface PrintWindow { days: number; orders: number; revenue: number; daysWorked: number; basisMin: number; revenuePerHour: number | null; avgDailyRevenue: number | null; errors: number; errorRatePct: number | null }

export function printWindow(hub: HubServer, uid: string, forUid: string, ymd: string, days: number): PrintWindow {
  authorize(hub, uid, forUid);
  const from = chicagoDate(addMinutes(chicagoToUtc(ymd, '12:00'), -(days - 1) * 1440));
  const inWin = claims(hub).filter((c) => c.uid === forUid && chicagoDate(c.claimedAt) >= from && chicagoDate(c.claimedAt) <= ymd);
  const revenue = inWin.reduce((t, c) => t + c.subtotal, 0);
  const dates = new Set<string>(); for (let i = 0; i < days; i++) dates.add(chicagoDate(addMinutes(chicagoToUtc(ymd, '12:00'), -i * 1440)));
  let basisMin = 0; let daysWorked = 0;
  for (const d of dates) { const w = workedMinutes(hub, forUid, d); if (w > 0) { daysWorked++; basisMin += Math.max(0, w - projectMinutes(hub, forUid, d)); } }
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
  const all = claims(hub).filter((c) => c.uid === forUid);
  const last = all.map((c) => c.claimedAt).sort().pop() ?? null;
  return {
    user, day: printDay(hub, uid, forUid, ymd), windows: [30, 90, 180].map((d) => printWindow(hub, uid, forUid, ymd, d)),
    notes: (hub.state.dayNotes ?? []).filter((n) => n.uid === forUid && n.date === ymd).sort((a, b) => a.at.localeCompare(b.at)),
    hasClaims: all.length > 0, lastClaimAt: last, hasRecentPrinting: !!last && minutesBetween(last, hub.state.now) <= 30 * 1440,
    dataNote: hub.state.claims ? 'Numbers come from claimed orders.' : 'Claimed orders are not connected yet, so there are no numbers.',
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
/** Made-up claims and past shifts so the printing screens can be tried. Never used in the private real-data copy. */
export function seedPracticeClaims(users: User[], shifts: Shift[], nowIso: string): { claims: PrintClaim[]; shifts: Shift[] } {
  let seed = 7; const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  const out: PrintClaim[] = []; const newShifts: Shift[] = [];
  const today = chicagoDate(nowIso);
  for (const u of users.filter((x) => x.role === 'EMPLOYEE' && (x.area === 'PRINT' || x.area === 'MIXED'))) {
    for (let back = 0; back < 190; back++) {
      const ymd = chicagoDate(addMinutes(chicagoToUtc(today, '12:00'), -back * 1440));
      const dow = new Date(`${ymd}T12:00:00Z`).getUTCDay(); if (dow === 0 || dow === 6) continue;
      if (u.area === 'MIXED' && rnd() < 0.5) continue;
      if (!shifts.some((s) => s.uid === u.id && chicagoDate(s.clockInAt) === ymd)) {
        newShifts.push({ id: `sh-p-${u.id}-${ymd}`, uid: u.id, clockInAt: chicagoToUtc(ymd, '08:00'), clockOutAt: back === 0 ? null : chicagoToUtc(ymd, '16:30'), reviewSessions: [], clockInKey: `pin-${u.id}-${ymd}`, clockOutKey: back === 0 ? null : `pout-${u.id}-${ymd}` });
      }
      const n = 8 + Math.floor(rnd() * 20);
      for (let i = 0; i < n; i++) {
        const q = 1 + Math.floor(rnd() * 3); const sub = Math.round((6 + rnd() * 40) * 100) / 100; const pr = 10 + Math.floor(rnd() * 50);
        out.push({ id: `cl-${u.id}-${ymd}-${i}`, orderId: `${3000 + out.length}`, uid: u.id, claimedAt: chicagoToUtc(ymd, `${String(8 + Math.floor((i / n) * 8)).padStart(2, '0')}:${String(Math.floor(rnd() * 59)).padStart(2, '0')}`), buyer: 'Practice buyer', items: [{ sku: 'CPI-001', quantity: q, subtotal: sub, prints: pr }], subtotal: sub, prints: pr });
      }
    }
  }
  return { claims: out, shifts: newShifts };
}
