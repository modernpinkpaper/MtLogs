import type { ActivityBin, PrintJob, PrinterProblemEvent, PrintStation } from '../domain/types';
import { chicagoDate, minutesBetween } from '../domain/time';

export interface ProblemEpisode {
  id: string;
  printer: string;
  kind: PrinterProblemEvent['kind'];
  startedAt: string;
  endedAt: string | null; // null = never cleared in available data
  durationMin: number | null;
  snapshotCount: number;
}

/**
 * Collapse repeated `problem` snapshots (and their `cleared` marker) into state episodes.
 * 800 snapshots of one jam are ONE incident, not 800.
 */
export function groupProblemEpisodes(events: PrinterProblemEvent[], maxGapMin = 20): ProblemEpisode[] {
  const sorted = [...events].sort((a, b) => a.at.localeCompare(b.at));
  const open = new Map<string, ProblemEpisode>(); // key printer|kind
  const out: ProblemEpisode[] = [];
  let n = 0;
  for (const ev of sorted) {
    const key = `${ev.printer}|${ev.kind}`;
    const cur = open.get(key);
    if (ev.state === 'problem') {
      if (cur && minutesBetween(cur.endedAt ?? cur.startedAt, ev.at) <= maxGapMin) {
        cur.snapshotCount++;
        cur.endedAt = ev.at; // provisional end = last snapshot
      } else {
        if (cur) out.push(cur);
        open.set(key, { id: `ep-${++n}`, printer: ev.printer, kind: ev.kind, startedAt: ev.at, endedAt: ev.at, durationMin: 0, snapshotCount: 1 });
      }
    } else if (cur) {
      cur.endedAt = ev.at;
      cur.durationMin = minutesBetween(cur.startedAt, ev.at);
      out.push(cur);
      open.delete(key);
    }
  }
  for (const cur of open.values()) {
    cur.durationMin = cur.endedAt ? minutesBetween(cur.startedAt, cur.endedAt) : null;
    out.push(cur);
  }
  for (const ep of out) if (ep.durationMin == null && ep.endedAt) ep.durationMin = minutesBetween(ep.startedAt, ep.endedAt);
  return out.sort((a, b) => a.startedAt.localeCompare(b.startedAt));
}

export type FourState = 'BOTH_ENGAGED' | 'MACHINE_ONLY' | 'PERSON_ONLY' | 'NEITHER_OBSERVED' | 'NO_COVERAGE';

export function classifyBin(b: ActivityBin): FourState {
  if (!b.covered) return 'NO_COVERAGE'; // missing logs are NOT "neither observed"
  if (b.printerRunning && b.pcInputObserved) return 'BOTH_ENGAGED';
  if (b.printerRunning) return 'MACHINE_ONLY';
  if (b.pcInputObserved) return 'PERSON_ONLY';
  return 'NEITHER_OBSERVED';
}

export function fourStateMinutes(bins: ActivityBin[], binMinutes = 5): Record<FourState, number> {
  const out: Record<FourState, number> = { BOTH_ENGAGED: 0, MACHINE_ONLY: 0, PERSON_ONLY: 0, NEITHER_OBSERVED: 0, NO_COVERAGE: 0 };
  for (const b of bins) out[classifyBin(b)] += binMinutes;
  return out;
}

export interface ShiftStats {
  uid: string | null;
  date: string;
  completed: number;
  attempted: number;
  failed: number;
  retries: number;
  cancelled: number;
  awaitingResult: number;
  sheets: number;
  printMinutes: number;
  /** Denominator for the retry rate is stated explicitly. */
  retryRateNote: string;
  coverage: 'COMPLETE' | 'PARTIAL' | 'NONE';
  coverageNote: string;
  pendingSync: boolean;
}

export function computeShiftStats(
  jobs: PrintJob[], bins: ActivityBin[], stations: PrintStation[], uid: string, date: string, pendingSync: boolean,
): ShiftStats {
  const myStations = stations.filter((s) => s.defaultUid === uid).map((s) => s.deviceId);
  const mine = jobs.filter((j) => (j.uid === uid || (j.uid === null && myStations.includes(j.deviceId))) && chicagoDate(j.startedAt) === date);
  const myBins = bins.filter((b) => myStations.includes(b.deviceId) && chicagoDate(b.start) === date);
  const completed = mine.filter((j) => j.status === 'COMPLETED').length;
  const failed = mine.filter((j) => j.status === 'FAILED').length;
  const retries = mine.filter((j) => j.retryOf !== null).length;
  const printMinutes = mine.reduce((s, j) => s + (j.endedAt ? minutesBetween(j.startedAt, j.endedAt) : 0), 0);
  const uncovered = myBins.filter((b) => !b.covered).length;
  const coverage: ShiftStats['coverage'] = !myBins.length && !mine.length ? 'NONE' : uncovered > 0 ? 'PARTIAL' : 'COMPLETE';
  return {
    uid, date, completed, attempted: mine.length, failed, retries,
    cancelled: mine.filter((j) => j.status === 'CANCELLED').length,
    awaitingResult: mine.filter((j) => j.status === 'IN_PROGRESS').length,
    sheets: mine.filter((j) => j.status === 'COMPLETED').reduce((s, j) => s + j.sheets, 0),
    printMinutes: Math.round(printMinutes),
    retryRateNote: `Retries = jobs resubmitted after a failure (${retries} of ${mine.length} attempted jobs).`,
    coverage,
    coverageNote:
      coverage === 'NONE' ? 'No data received for this day yet. This is NOT zero work.'
      : coverage === 'PARTIAL' ? `${uncovered * 5} minutes of logger coverage missing — figures may be lower than actual.`
      : 'Logger coverage complete for the observed window.',
    pendingSync,
  };
}

export interface PrinterWeek {
  printer: string;
  jobs: number;
  completed: number;
  failed: number;
  retries: number;
  sheets: number;
  runMinutes: number;
  incidents: ProblemEpisode[];
  rawProblemSnapshots: number;
}

export function weeklyPrinterSummary(jobs: PrintJob[], problems: PrinterProblemEvent[]): PrinterWeek[] {
  const printers = [...new Set([...jobs.map((j) => j.printer), ...problems.map((p) => p.printer)])].sort();
  const eps = groupProblemEpisodes(problems);
  return printers.map((p) => {
    const js = jobs.filter((j) => j.printer === p);
    return {
      printer: p,
      jobs: js.length,
      completed: js.filter((j) => j.status === 'COMPLETED').length,
      failed: js.filter((j) => j.status === 'FAILED').length,
      retries: js.filter((j) => j.retryOf).length,
      sheets: js.filter((j) => j.status === 'COMPLETED').reduce((s, j) => s + j.sheets, 0),
      runMinutes: Math.round(js.reduce((s, j) => s + (j.endedAt ? minutesBetween(j.startedAt, j.endedAt) : 0), 0)),
      incidents: eps.filter((e) => e.printer === p),
      rawProblemSnapshots: problems.filter((e) => e.printer === p && e.state === 'problem').length,
    };
  });
}
