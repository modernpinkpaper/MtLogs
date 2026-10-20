import { describe, expect, it } from 'vitest';
import { newHub, key, U } from './helpers';
import { classifyBin, fourStateMinutes, groupProblemEpisodes } from '../server/print';
import { PermissionDenied } from '../server/errors';
import { formatTime, chicagoToUtc, tzOffsetMinutes, chicagoDate, nextBusinessMorning } from '../domain/time';

// Acceptance matrix F — print analytics + time handling
describe('F. print analytics', () => {
  it('printer problem snapshots collapse to state episodes (hundreds of snapshots ≠ hundreds of incidents)', async () => {
    const hub = await newHub();
    const raw = hub.state.printerProblems.filter((p) => p.state === 'problem').length;
    const eps = groupProblemEpisodes(hub.state.printerProblems);
    expect(raw).toBeGreaterThan(300);
    expect(eps).toHaveLength(5);
    expect(eps.every((e) => e.durationMin !== null && e.snapshotCount > 1)).toBe(true);
    const wk = hub.weeklyPrintReport(U.dalia);
    expect(wk.episodes).toHaveLength(5);
    expect(wk.rawSnapshots).toBe(raw);
  });

  it('print staff see their own daily stats; stats never block clock-out; missing data is flagged not zeroed', async () => {
    const hub = await newHub();
    const mine = hub.myPrintStats(U.printA);
    expect(mine.stats.completed).toBeGreaterThan(0);
    expect(mine.stats.retryRateNote).toMatch(/of \d+ jobs were retries/);
    const gap = hub.myPrintStats(U.printC, U.printC, '2026-10-14');
    expect(gap.stats.coverage).toBe('PARTIAL');
    expect(gap.stats.coverageNote).toMatch(/missing/);
    const none = hub.myPrintStats(U.printC, U.printC, '2026-10-17');
    expect(none.stats.coverage).toBe('NONE');
    expect(none.stats.coverageNote).toMatch(/does NOT mean zero work/);
    hub.setPrintPendingSync(U.printB, true);
    expect(hub.myPrintStats(U.printB).stats.pendingSync).toBe(true);
    expect(hub.clockOut(U.printB, key()).shift?.clockOutAt).toBeTruthy();
    expect(hub.outstandingCards(U.printA)).toHaveLength(0); // no mandatory daily AI review for print
  });

  it('weekly report is owner-only and states coverage, caveats, and no cross-person ranking', async () => {
    const hub = await newHub();
    expect(() => hub.weeklyPrintReport(U.printA)).toThrow(PermissionDenied);
    const wk = hub.weeklyPrintReport(U.dalia);
    const joined = wk.caveats.join(' ');
    expect(joined).toMatch(/does not mean a person was doing nothing/);
    expect(joined).toMatch(/not pay records/);
    expect(wk.comparisons.every((c) => c.comparable === false)).toBe(true); // no like-for-like peer → no comparison
    const s3 = wk.stations.find((s) => s.deviceId === 'PRINT-3')!;
    expect(s3.coverageGaps).toHaveLength(1);
    expect(s3.coverageGaps[0].minutes).toBe(120);
    expect(s3.fourState.NO_COVERAGE).toBe(120);
  });

  it('four-state classification treats missing coverage separately from NEITHER_OBSERVED', () => {
    const mk = (printerRunning: boolean, pcInputObserved: boolean, covered = true) => ({ deviceId: 'd', start: '2026-10-16T14:00:00Z', printerRunning, pcInputObserved, covered });
    expect(classifyBin(mk(true, true))).toBe('BOTH_ENGAGED');
    expect(classifyBin(mk(true, false))).toBe('MACHINE_ONLY');
    expect(classifyBin(mk(false, true))).toBe('PERSON_ONLY');
    expect(classifyBin(mk(false, false))).toBe('NEITHER_OBSERVED');
    expect(classifyBin(mk(false, false, false))).toBe('NO_COVERAGE');
    expect(fourStateMinutes([mk(true, false), mk(false, false, false)])).toMatchObject({ MACHINE_ONLY: 5, NO_COVERAGE: 5, NEITHER_OBSERVED: 0 });
  });

  it('Carolina’s output follows her actual assignment for the day without losing authorized access', async () => {
    const hub = await newHub();
    expect(hub.areaOn(U.carolina, '2026-10-15T18:00:00Z')).toBe('PRINT');
    expect(hub.areaOn(U.carolina, hub.now)).toBe('PROJECT');
    expect(hub.getProject(U.carolina, 'prj-070').key).toBe('P-070');
    // print-only day (Thursday): findings for her device create no project review cards
    expect(hub.myPrintStats(U.carolina, U.carolina, '2026-10-15').stats.completed).toBeGreaterThan(0);
    // owner flips today to PRINT: access to her project stays; stats stay visible
    hub.setAssignmentForToday(U.dalia, U.carolina, 'PRINT');
    expect(hub.areaOn(U.carolina)).toBe('PRINT');
    expect(hub.getProject(U.carolina, 'prj-070').key).toBe('P-070');
    expect(hub.myPrintStats(U.carolina, U.carolina, '2026-10-15').stats.completed).toBeGreaterThan(0);
  });

  it('print-only users receive no daily AI review card even when their device has activity', async () => {
    const hub = await newHub();
    hub.setAssignmentForToday(U.dalia, U.erika, 'PRINT');
    await hub.demoReleaseFbaHour();
    const cards = hub.state.reviewCards.filter((c) => c.recipientUid === U.erika && c.groupKey === 'step:s-081-2');
    expect(cards).toHaveLength(0); // finding recorded, but no mandatory review card on a print-assigned day
    expect(hub.state.findings.some((f) => f.stepId === 's-081-2')).toBe(true);
  });

  it('opportunities distinguish expected capacity from realized value and approval creates a measured project', async () => {
    const hub = await newHub();
    const op = hub.state.opportunities[0];
    expect((op.estMinutesSavedPerUnit * op.unitsPerMonth) / 60).toBeCloseTo(23.33, 1);
    expect(op.realizedValue).toBe('Not yet measured');
    const done = hub.decideOpportunity(U.dalia, op.id, 'APPROVED', 'go');
    expect(done.createdProjectId).toBeTruthy();
    const p = hub.getProject(U.dalia, done.createdProjectId!);
    expect(p.impactPlan?.observed).toBeNull();
    expect(hub.projectSteps(U.dalia, p.id)).toHaveLength(op.steps.length);
  });
});

describe('time handling (America/Chicago, DST-aware)', () => {
  it('converts local wall time to UTC across DST and displays in CT', () => {
    expect(chicagoToUtc('2026-10-16', '14:52')).toBe('2026-10-16T19:52:00.000Z'); // CDT = UTC-5
    expect(chicagoToUtc('2026-11-02', '14:52')).toBe('2026-11-02T20:52:00.000Z'); // CST = UTC-6 after Nov 1
    expect(tzOffsetMinutes(new Date('2026-10-16T19:00:00Z'))).toBe(-300);
    expect(tzOffsetMinutes(new Date('2026-11-02T19:00:00Z'))).toBe(-360);
    expect(formatTime('2026-10-16T19:52:00.000Z')).toBe('2:52 PM CT');
    expect(chicagoDate('2026-10-17T04:30:00Z')).toBe('2026-10-16'); // late evening local is still the 16th
    expect(nextBusinessMorning('2026-10-16T21:00:00Z', '07:30')).toBe('2026-10-19T12:30:00.000Z'); // Friday → Monday
  });
});
