// All stored instants are UTC ISO strings. Display is always America/Chicago (DST-aware).
export const TZ = 'America/Chicago';

const fmtCache = new Map<string, Intl.DateTimeFormat>();
function fmt(opts: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = JSON.stringify(opts);
  let f = fmtCache.get(key);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', { timeZone: TZ, ...opts });
    fmtCache.set(key, f);
  }
  return f;
}

export function formatTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  return fmt({ hour: 'numeric', minute: '2-digit' }).format(new Date(iso)) + ' CT';
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  return (
    fmt({ weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(
      new Date(iso),
    ) + ' CT'
  );
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  return fmt({ weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(iso));
}

/** Local calendar date (YYYY-MM-DD) in Chicago for a UTC instant. */
export function chicagoDate(iso: string): string {
  const parts = fmt({ year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(iso));
  const g = (t: string) => parts.find((p) => p.type === t)!.value;
  return `${g('year')}-${g('month')}-${g('day')}`;
}

/** Local hour (0-23) in Chicago. */
export function chicagoHour(iso: string): number {
  const parts = fmt({ hour: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(iso));
  return Number(parts.find((p) => p.type === 'hour')!.value);
}

export function chicagoWeekday(iso: string): number {
  const name = fmt({ weekday: 'short' }).format(new Date(iso));
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(name);
}

/** Offset in minutes (negative for Chicago: -300 CDT, -360 CST) at a given instant. */
export function tzOffsetMinutes(at: Date): number {
  const parts = fmt({
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(at);
  const g = (t: string) => Number(parts.find((p) => p.type === t)!.value);
  const asUtc = Date.UTC(g('year'), g('month') - 1, g('day'), g('hour'), g('minute'), g('second'));
  return Math.round((asUtc - Math.floor(at.getTime() / 1000) * 1000) / 60000);
}

/** Convert a Chicago wall-clock time (YYYY-MM-DD + HH:MM) to a UTC ISO string. DST-safe. */
export function chicagoToUtc(date: string, hhmm: string): string {
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = hhmm.split(':').map(Number);
  const naive = Date.UTC(y, m - 1, d, hh, mm);
  let guess = naive - tzOffsetMinutes(new Date(naive)) * 60000;
  guess = naive - tzOffsetMinutes(new Date(guess)) * 60000;
  return new Date(guess).toISOString();
}

export function addMinutes(iso: string, minutes: number): string {
  return new Date(new Date(iso).getTime() + minutes * 60000).toISOString();
}

export function minutesBetween(a: string, b: string): number {
  return (new Date(b).getTime() - new Date(a).getTime()) / 60000;
}

export function formatDuration(minutes: number): string {
  if (minutes < 1) return '<1 min';
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return h ? `${h}h ${m}m` : `${m}m`;
}

export function relativeAgo(iso: string, nowIso: string): string {
  const mins = Math.round(minutesBetween(iso, nowIso));
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  if (mins < 60 * 24) return `${Math.round(mins / 60)} h ago`;
  return `${Math.round(mins / 1440)} d ago`;
}

/** Next weekday morning (Mon–Fri) at the given Chicago HH:MM, after `iso`. */
export function nextBusinessMorning(iso: string, hhmm = '08:00'): string {
  let t = new Date(iso);
  for (let i = 0; i < 8; i++) {
    t = new Date(t.getTime() + 86400000);
    const wd = chicagoWeekday(t.toISOString());
    if (wd >= 1 && wd <= 5) return chicagoToUtc(chicagoDate(t.toISOString()), hhmm);
  }
  return iso;
}
