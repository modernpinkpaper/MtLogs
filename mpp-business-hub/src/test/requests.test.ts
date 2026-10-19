import { describe, expect, it } from 'vitest';
import { newHub, key, U } from './helpers';
import { PermissionDenied } from '../server/errors';

// Acceptance matrix B — owner updates / in-app notifications
describe('B. owner update request round trip', () => {
  it('Dalia → Erika → Dalia, with real notification, journal entry, response record and state changes', async () => {
    const hub = await newHub();
    const req = hub.createUpdateRequest(U.dalia, { projectId: 'prj-012', stepId: 's-012-3', question: 'Did the test product get created?', idempotencyKey: key() });
    expect(req.recipientUids).toEqual([U.erika]);
    // recipient receives notification + persistent card immediately
    const n = hub.listNotifications(U.erika).find((x) => x.sourceEntityId === req.id)!;
    expect(n.title).toMatch(/asked for an update/);
    expect(n.state).toBe('DELIVERED');
    const card = hub.listReviewCards(U.erika).find((c) => c.updateRequestId === req.id)!;
    expect(card.explanatoryText).toBe('Did the test product get created?');
    expect(hub.getJournal(U.dalia, { stepId: 's-012-3', types: ['UPDATE_REQUESTED'] })).toHaveLength(1);

    const before = hub.unreadCount(U.dalia);
    hub.startReview(U.erika, card.id);
    hub.submitDecision(U.erika, card.id, { action: 'SEND_STATUS', statusAnswer: 'IN_PROGRESS', note: 'Test attempted; investigating permissions', idempotencyKey: 'send-1' });

    expect(hub.unreadCount(U.dalia)).toBe(before + 1);
    const note = hub.listNotifications(U.dalia).find((x) => x.type === 'EMPLOYEE_RESPONSE')!;
    expect(note.title).toContain('In progress');
    expect(note.preview).toContain('investigating permissions');
    expect(note.deepLink).toContain('/projects/prj-012/steps/s-012-3');
    expect(note.deepLink).toContain('response=');
    expect(hub.getRequest(U.dalia, req.id).state).toBe('RESPONDED');
    const resp = hub.listResponses(U.dalia, req.id)[0];
    expect(resp.humanReportedOnly).toBe(true);
    expect(note.deepLink).toContain(resp.id);
    const j = hub.getJournal(U.dalia, { stepId: 's-012-3', types: ['UPDATE_RESPONSE'] });
    expect(j).toHaveLength(1);
    expect(j[0].verificationState).toBe('EMPLOYEE_CONFIRMED');
    expect(hub.listReviewCards(U.erika).find((c) => c.id === card.id)).toBeUndefined(); // card closed
  });

  it('double-send / network retry creates exactly one response and one notification', async () => {
    const hub = await newHub();
    const req = hub.createUpdateRequest(U.dalia, { projectId: 'prj-012', stepId: 's-012-3', idempotencyKey: key() });
    const card = hub.listReviewCards(U.erika).find((c) => c.updateRequestId === req.id)!;
    const input = { action: 'SEND_STATUS' as const, statusAnswer: 'WAITING' as const, note: 'waiting on permissions', idempotencyKey: 'dup-key' };
    hub.submitDecision(U.erika, card.id, input);
    hub.submitDecision(U.erika, card.id, input);
    hub.submitDecision(U.erika, card.id, input);
    expect(hub.state.updateResponses.filter((r) => r.requestId === req.id)).toHaveLength(1);
    expect(hub.state.notifications.filter((n) => n.type === 'EMPLOYEE_RESPONSE' && n.senderUid === U.erika)).toHaveLength(1);
    expect(hub.getJournal(U.dalia, { types: ['UPDATE_RESPONSE'] })).toHaveLength(1);
    // creating the request twice with one key is also a single request
    const a = hub.createUpdateRequest(U.dalia, { projectId: 'prj-012', idempotencyKey: 'same' });
    const b = hub.createUpdateRequest(U.dalia, { projectId: 'prj-012', idempotencyKey: 'same' });
    expect(b.id).toBe(a.id);
  });

  it('"Completed" is employee-reported only: never becomes VERIFIED, and the notification says so', async () => {
    const hub = await newHub();
    const req = hub.createUpdateRequest(U.dalia, { projectId: 'prj-081', stepId: 's-081-2', idempotencyKey: key() });
    const card = hub.listReviewCards(U.erika).find((c) => c.updateRequestId === req.id)!;
    hub.submitDecision(U.erika, card.id, { action: 'SEND_STATUS', statusAnswer: 'COMPLETED', note: 'uploaded', idempotencyKey: key() });
    const step = hub.getStep(U.dalia, 's-081-2');
    expect(step.status).toBe('REPORTED_COMPLETE');
    expect(step.verificationSource).toBe('NONE');
    expect(step.humanReported?.choice).toBe('COMPLETED');
    const n = hub.listNotifications(U.dalia).find((x) => x.type === 'EMPLOYEE_RESPONSE')!;
    expect(n.preview).toMatch(/Employee confirmed\. Not checked in the source system/);
    expect(hub.getProject(U.dalia, 'prj-081').closedAt).toBeNull();
  });

  it('Dalia can acknowledge and follow up without changing the employee’s historical answer', async () => {
    const hub = await newHub();
    const req = hub.createUpdateRequest(U.dalia, { projectId: 'prj-012', stepId: 's-012-3', idempotencyKey: key() });
    const card = hub.listReviewCards(U.erika).find((c) => c.updateRequestId === req.id)!;
    hub.submitDecision(U.erika, card.id, { action: 'SEND_STATUS', statusAnswer: 'IN_PROGRESS', note: 'first answer', idempotencyKey: key() });
    const snapshot = JSON.stringify(hub.listResponses(U.dalia, req.id));
    const note = hub.listNotifications(U.dalia).find((x) => x.type === 'EMPLOYEE_RESPONSE')!;
    hub.acknowledge(U.dalia, note.id);
    hub.acknowledge(U.dalia, note.id); // idempotent
    expect(hub.getRequest(U.dalia, req.id).state).toBe('ACKNOWLEDGED');
    const fu = hub.followUp(U.dalia, req.id, 'Any update on permissions?', key());
    expect(fu.parentRequestId).toBe(req.id);
    expect(JSON.stringify(hub.listResponses(U.dalia, req.id))).toBe(snapshot);
    expect(hub.listNotifications(U.erika).some((n) => n.type === 'FOLLOW_UP')).toBe(true);
  });

  it('an employee can proactively send an update to Dalia without any request', async () => {
    const hub = await newHub();
    hub.sendProactiveUpdate(U.erika, { projectId: 'prj-012', stepId: 's-012-2', choice: 'COMPLETED', note: 'please take a look', idempotencyKey: key() });
    const n = hub.listNotifications(U.dalia).find((x) => x.title.includes('sent you an update'))!;
    expect(n.preview).toContain('please take a look');
    expect(hub.getJournal(U.dalia, { types: ['PROACTIVE_UPDATE'] })).toHaveLength(1);
  });

  it('other employees cannot read, intercept or answer a request not addressed to them', async () => {
    const hub = await newHub();
    const req = hub.createUpdateRequest(U.dalia, { projectId: 'prj-012', stepId: 's-012-3', idempotencyKey: key() });
    const card = hub.listReviewCards(U.erika).find((c) => c.updateRequestId === req.id)!;
    hub.clockIn(U.arantza, key());
    expect(() => hub.getRequest(U.arantza, req.id)).toThrow(PermissionDenied);
    expect(() => hub.getCard(U.arantza, card.id)).toThrow(PermissionDenied);
    expect(() => hub.submitDecision(U.arantza, card.id, { action: 'SEND_STATUS', statusAnswer: 'COMPLETED', idempotencyKey: key() })).toThrow(PermissionDenied);
    expect(() => hub.submitUpdateResponse(U.arantza, { requestId: req.id, choice: 'COMPLETED', idempotencyKey: key() })).toThrow(PermissionDenied);
    expect(hub.listNotifications(U.arantza).some((n) => n.sourceEntityId === req.id)).toBe(false);
    // and employees cannot create requests or forge answers as someone else
    expect(() => hub.createUpdateRequest(U.erika, { projectId: 'prj-012', idempotencyKey: key() })).toThrow(PermissionDenied);
  });

  it('recipients must be authorized for the project', async () => {
    const hub = await newHub();
    expect(() => hub.createUpdateRequest(U.dalia, { projectId: 'prj-044', recipientUids: [U.erika], idempotencyKey: key() })).toThrow(/works on this project/);
  });

  it('a request can be answered at clock-out or after next clock-in, and the card survives skipping', async () => {
    const hub = await newHub();
    const req = hub.createUpdateRequest(U.dalia, { projectId: 'prj-012', stepId: 's-012-3', idempotencyKey: key() });
    hub.clockOut(U.erika, key());
    expect(hub.outstandingCards(U.erika).some((c) => c.updateRequestId === req.id)).toBe(true);
    hub.demoAdvanceToNextMorning();
    const { outstanding } = hub.clockIn(U.erika, key());
    expect(outstanding.some((c) => c.updateRequestId === req.id)).toBe(true);
  });
});
