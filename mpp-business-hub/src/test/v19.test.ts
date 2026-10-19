import { describe, expect, it } from 'vitest';
import { newHub, U } from './helpers';

const mkOwner = (hub: Awaited<ReturnType<typeof newHub>>) => { hub.state.users.push({ id: 'u-moe', name: 'Moe', role: 'OWNER', area: 'PRINT', active: true, capabilities: [], primaryDeviceId: null, noClock: true }); return 'u-moe'; };
const input = (uid: string) => ({ uid, occurredOn: '2026-10-15', links: ['https://example.com/order/1'], description: '**Wrong** size sent' });

describe('v1.9 customer service errors', () => {
  it('only Dalia can give the permission, and only people with it can log errors', async () => {
    const hub = await newHub();
    expect(() => hub.logError(U.arantza, input(U.printA))).toThrow();
    expect(() => hub.setCustomerService(U.erika, U.arantza, true)).toThrow();
    hub.setCustomerService(U.dalia, U.arantza, true);
    expect(hub.logError(U.arantza, input(U.printA)).createdByUid).toBe(U.arantza);
  });

  it('validates the date, links and description', async () => {
    const hub = await newHub(); hub.setCustomerService(U.dalia, U.arantza, true);
    expect(() => hub.logError(U.arantza, { ...input(U.printA), occurredOn: '2027-01-01' })).toThrow();
    expect(() => hub.logError(U.arantza, { ...input(U.printA), links: ['not a link'] })).toThrow();
    expect(() => hub.logError(U.arantza, { ...input(U.printA), description: '  ' })).toThrow();
  });

  it('Dalia is alerted; the person cannot see it until an owner acknowledges', async () => {
    const hub = await newHub(); hub.setCustomerService(U.dalia, U.arantza, true);
    const e = hub.logError(U.arantza, input(U.printA));
    expect(hub.listNotifications(U.dalia).some((n) => n.type === 'ERROR_LOGGED' && n.sourceEntityId === e.id)).toBe(true);
    expect(hub.listErrors(U.printA)).toHaveLength(0);
    expect(hub.errorsForPerson(U.printA).toReview).toHaveLength(0);
    hub.ownerAcknowledgeError(U.dalia, e.id, 'Please double check sizes.');
    expect(hub.errorsForPerson(U.printA).toReview).toHaveLength(1);
    expect(hub.listNotifications(U.printA).some((n) => n.type === 'ERROR_FOR_YOU')).toBe(true);
  });

  it('other employees never see someone else’s error', async () => {
    const hub = await newHub(); const e = hub.logError(U.dalia, input(U.printA)); hub.ownerAcknowledgeError(U.dalia, e.id);
    expect(hub.listErrors(U.printB)).toHaveLength(0);
    expect(() => hub.personAcknowledgeError(U.printB, e.id, 'I understand this and will do better')).toThrow();
  });

  it('the person must write a real note; snooze comes back at the next clock in and can never dismiss', async () => {
    const hub = await newHub(); const e = hub.logError(U.dalia, input(U.printA)); hub.ownerAcknowledgeError(U.dalia, e.id);
    expect(() => hub.personAcknowledgeError(U.printA, e.id, 'ok')).toThrow();
    hub.snoozeError(U.printA, e.id);
    expect(hub.errorsForPerson(U.printA)).toMatchObject({ toReview: [], snoozed: [expect.anything()] });
    hub.clockOut(U.printA, 'o1'); hub.clockIn(U.printA, 'i1');
    expect(hub.errorsForPerson(U.printA).toReview).toHaveLength(1);
    hub.personAcknowledgeError(U.printA, e.id, 'Wrong size was sent. I will check the size twice before packing.');
    expect(hub.errorsForPerson(U.printA).toReview).toHaveLength(0);
    expect(hub.listNotifications(U.dalia).some((n) => n.type === 'ERROR_ACKNOWLEDGED')).toBe(true);
    expect((hub as unknown as Record<string, unknown>).dismissError).toBeUndefined();
  });

  it('Dalia can acknowledge for Moe and herself, but not for Annie', async () => {
    const hub = await newHub(); const moe = mkOwner(hub);
    const e = hub.logError(U.dalia, input(moe)); hub.ownerAcknowledgeError(U.dalia, e.id, 'noted');
    const after = hub.listErrors(U.dalia).find((x) => x.id === e.id)!;
    expect(after.state).toBe('DONE'); expect(after.ownerAck?.alsoForSubject).toBe(true);
    const e2 = hub.logError(U.dalia, input(U.printA)); hub.ownerAcknowledgeError(U.dalia, e2.id);
    expect(hub.listErrors(U.dalia).find((x) => x.id === e2.id)!.state).toBe('WAITING_FOR_PERSON');
  });

  it('a customer service person sees only what they logged; an entry cannot be changed after the person acknowledged', async () => {
    const hub = await newHub(); hub.setCustomerService(U.dalia, U.arantza, true);
    const e = hub.logError(U.arantza, input(U.printA)); hub.logError(U.dalia, input(U.printB));
    expect(hub.listErrors(U.arantza)).toHaveLength(1);
    hub.editError(U.arantza, e.id, { description: 'Updated' });
    hub.ownerAcknowledgeError(U.dalia, e.id); hub.personAcknowledgeError(U.printA, e.id, 'I understand and will prevent this one.');
    expect(() => hub.editError(U.arantza, e.id, { description: 'Again' })).toThrow();
  });
});

describe('v1.9 owner Home and feedback', () => {
  it('groups findings into sections and keeps employees out', async () => {
    const hub = await newHub();
    const h = hub.ownerHome(U.dalia);
    expect(h.aiProjects.length + h.opportunities.length + h.optimizations.length + h.other.length).toBeGreaterThan(0);
    expect(() => hub.ownerHome(U.erika)).toThrow();
  });

  it('“never again” stops that kind of finding until it is undone; “this time” does not', async () => {
    const hub = await newHub();
    const f = hub.state.ownerFindings.find((x) => x.status === 'NEW')!;
    const fbk = hub.dismissWithFeedback(U.dalia, f.id, { scope: 'NEVER_AGAIN', reason: 'Not useful to me', note: 'too noisy' });
    expect(hub.state.ownerFindings.find((x) => x.id === f.id)!.status).toBe('DISMISSED');
    expect(hub.feedbackList(U.dalia)).toHaveLength(1);
    hub.undoFeedback(U.dalia, fbk.id);
    expect(hub.feedbackList(U.dalia)[0].active).toBe(false);
    expect(() => hub.dismissWithFeedback(U.dalia, f.id, { scope: 'THIS_TIME', reason: '' })).toThrow();
  });
});

describe('v1.9 printing numbers', () => {
  it('revenue per hour uses clock hours; project time comes out first', async () => {
    const hub = await newHub();
    const s = hub.printSummary(U.printA, U.printA, '2026-10-15');
    expect(s.day.orders).toBeGreaterThan(0);
    expect(s.day.workedMin).toBe(510);
    expect(s.day.revenuePerHour).toBeCloseTo(s.day.revenue / 8.5, 1);
    expect(s.windows.map((w) => w.days)).toEqual([30, 90, 180]);
  });
  it('error rate is errors divided by orders, from the error log', async () => {
    const hub = await newHub(); const e = hub.logError(U.dalia, { uid: U.printA, occurredOn: '2026-10-14', links: [], description: 'x' }); expect(e).toBeTruthy();
    const w = hub.printSummary(U.printA, U.printA, '2026-10-16').windows[0];
    expect(w.errors).toBe(1); expect(w.errorRatePct).toBeCloseTo((1 / w.orders) * 100, 1);
  });
  it('people see only their own numbers; the day note is kept', async () => {
    const hub = await newHub();
    expect(() => hub.printSummary(U.printB, U.printA)).toThrow();
    hub.addDayNote(U.printA, '2026-10-16', 'Left printer jammed twice.');
    expect(hub.printSummary(U.printA, U.printA, '2026-10-16').notes).toHaveLength(1);
    expect(() => hub.addDayNote(U.printA, '2026-10-16', '  ')).toThrow();
  });
});
