import { describe, expect, it } from 'vitest';
import { newHub, key, U } from './helpers';
import { HubError } from '../server/errors';

// Acceptance matrix A — clock / pay protections
describe('A. clock and paid-time protections', () => {
  it('clock-in commits even with pending reviews, AI outage and log outage; reviews are only offered AFTER commit', async () => {
    const hub = await newHub();
    hub.clockOut(U.erika, key());
    hub.demoToggle('aiOutage', true);
    hub.demoToggle('logSyncOutage', true);
    const res = hub.clockIn(U.erika, key());
    expect(res.shift.clockOutAt).toBeNull();
    expect(hub.openShift(U.erika)).not.toBeNull();
    expect(res.outstanding.length).toBeGreaterThan(0); // returned only after the shift was committed
  });

  it('clock-out works immediately with pending cards, and leaves them untouched', async () => {
    const hub = await newHub();
    const before = hub.outstandingCards(U.erika).map((c) => [c.id, c.status]);
    expect(before.length).toBeGreaterThan(0);
    const out = hub.clockOut(U.erika, key());
    expect(out.shift?.clockOutAt).not.toBeNull();
    expect(hub.outstandingCards(U.erika).map((c) => [c.id, c.status])).toEqual(before);
  });

  it('clock-out is unaffected by AI outage, missing logs and missing print stats', async () => {
    const hub = await newHub();
    hub.demoToggle('aiOutage', true);
    hub.demoToggle('logSyncOutage', true);
    hub.setPrintPendingSync(U.printA, true);
    expect(hub.clockOut(U.printA, key()).shift?.clockOutAt).not.toBeNull();
    const r = hub.reviewReadiness(U.erika);
    expect(r.message).toMatch(/not a record of no work/i);
  });

  it('duplicate clock-in/out presses do not create duplicate or corrupted shifts', async () => {
    const hub = await newHub();
    const k = key('out');
    const a = hub.clockOut(U.erika, k);
    const b = hub.clockOut(U.erika, k);
    expect(b.alreadyClockedOut).toBe(true);
    expect(b.shift?.clockOutAt).toBe(a.shift?.clockOutAt);
    const kin = key('in');
    const i1 = hub.clockIn(U.erika, kin);
    const i2 = hub.clockIn(U.erika, kin);
    const i3 = hub.clockIn(U.erika, key('in'));
    expect(i2.shift.id).toBe(i1.shift.id);
    expect(i3.shift.id).toBe(i1.shift.id);
    expect(hub.state.shifts.filter((s) => s.uid === U.erika && !s.clockOutAt)).toHaveLength(1);
  });

  it('a review submitted at clock-out is recorded before the time-out, inside the paid shift', async () => {
    const hub = await newHub();
    const card = hub.outstandingCards(U.erika).find((c) => c.cardType === 'AI_UNMATCHED_WORK')!;
    hub.startReview(U.erika, card.id);
    hub.demoAdvance(2);
    const dec = hub.submitDecision(U.erika, card.id, { action: 'DISMISS', idempotencyKey: key() });
    expect(dec.duringPaidShift).toBe(true);
    hub.demoAdvance(1);
    const out = hub.clockOut(U.erika, key());
    const s = out.shift!;
    expect(s.reviewSessions[0].submittedAt! <= s.clockOutAt!).toBe(true);
    expect(s.clockInAt <= s.reviewSessions[0].startedAt).toBe(true);
  });

  it('unpaid review is refused: an employee off the clock cannot submit; next-shift review works', async () => {
    const hub = await newHub();
    const card = hub.outstandingCards(U.erika)[0];
    hub.clockOut(U.erika, key());
    expect(() => hub.submitDecision(U.erika, card.id, { action: 'DISMISS', idempotencyKey: key() })).toThrowError(HubError);
    hub.demoAdvanceToNextMorning();
    const { outstanding } = hub.clockIn(U.erika, key());
    expect(outstanding.find((c) => c.id === card.id)).toBeTruthy();
    expect(() => hub.submitDecision(U.erika, card.id, { action: 'DISMISS', idempotencyKey: key() })).not.toThrow();
  });
});
