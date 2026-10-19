import { describe, expect, it } from 'vitest';
import { newHub, key, U } from './helpers';
import { addMinutes } from '../domain/time';

describe('v1.10 one inbox', () => {
  it('answering a request clears the alert about it, and it stays in History', async () => {
    const hub = await newHub();
    const req = hub.createUpdateRequest(U.dalia, { projectId: 'prj-012', stepId: 's-012-3', question: 'Did it work?', idempotencyKey: key() });
    expect(hub.employeeHome(U.erika).requests).toHaveLength(1);
    const card = hub.listReviewCards(U.erika).find((c) => c.updateRequestId === req.id)!;
    hub.startReview(U.erika, card.id);
    hub.submitDecision(U.erika, card.id, { action: 'SEND_STATUS', statusAnswer: 'IN_PROGRESS', note: 'Working on it', idempotencyKey: key() });
    const e = hub.employeeHome(U.erika);
    expect(e.requests).toHaveLength(0); expect(e.alerts).toHaveLength(0);
    expect(hub.historyExtras(U.erika).some((x) => /asked for an update/.test(x.title))).toBe(true);
    expect(hub.ownerHome(U.dalia).team.some((n) => n.type === 'EMPLOYEE_RESPONSE')).toBe(true);
  });

  it('“I saw this” clears an item from Home but not from History', async () => {
    const hub = await newHub();
    const n = hub.ownerHome(U.dalia).team[0] ?? hub.ownerHome(U.dalia).otherAlerts[0];
    if (!n) return;
    const before = hub.homeCount(U.dalia);
    hub.acknowledge(U.dalia, n.id);
    expect(hub.homeCount(U.dalia)).toBe(before - 1);
    expect(hub.historyExtras(U.dalia).some((x) => x.id === `n-${n.id}`)).toBe(true);
  });

  it('errors show in History for the people who may see them', async () => {
    const hub = await newHub();
    const e = hub.logError(U.dalia, { uid: U.printA, occurredOn: '2026-10-15', links: [], description: 'Wrong size' });
    expect(hub.historyExtras(U.dalia).some((x) => x.kind === 'Error')).toBe(true);
    expect(hub.historyExtras(U.printA).some((x) => x.kind === 'Error')).toBe(false);
    hub.ownerAcknowledgeError(U.dalia, e.id);
    expect(hub.historyExtras(U.printA).some((x) => x.kind === 'Error')).toBe(true);
  });

  it('AI recommendations are grouped into growth, savers (computer or not) and other', async () => {
    const hub = await newHub();
    const a = hub.ownerHome(U.dalia).ai;
    expect(a.growth.length + a.saverPc.length + a.saverOther.length + a.other.length).toBeGreaterThan(0);
  });
});

describe('v1.10 steps belong to the person they are assigned to', () => {
  it('a person on a project cannot change a step assigned to someone else', async () => {
    const hub = await newHub();
    hub.reassignStep(U.dalia, 's-070-2', [U.carolina]);
    expect(() => hub.transitionStep(U.erika, 's-070-2', 'REPORTED_COMPLETE')).toThrow();
    expect(() => hub.updateInstructions(U.erika, 's-070-2', 'x')).toThrow();
    expect(() => hub.renameStep(U.erika, 's-070-2', 'x')).toThrow();
    expect(() => hub.addSteps(U.erika, 'prj-070', 1, 's-070-2')).toThrow();
    hub.transitionStep(U.carolina, 's-070-2', 'REPORTED_COMPLETE');
    expect(hub.getStep(U.erika, 's-070-2').status).toBe('REPORTED_COMPLETE');
  });
  it('someone given one step can see the whole project but change only their step', async () => {
    const hub = await newHub();
    hub.reassignStep(U.dalia, 's-012-4', [U.arantza]);
    expect(hub.getProject(U.arantza, 'prj-012').id).toBe('prj-012');
    hub.transitionStep(U.arantza, 's-012-4', 'IN_PROGRESS');
    expect(() => hub.transitionStep(U.arantza, 's-012-3', 'IN_PROGRESS')).toThrow();
    expect(hub.listNotifications(U.arantza).some((n) => /given step/.test(n.title))).toBe(true);
  });
  it('only Dalia can reassign', async () => {
    const hub = await newHub();
    expect(() => hub.reassignStep(U.erika, 's-070-2', [U.carolina])).toThrow();
    expect(() => hub.reassignProject(U.erika, 'prj-070', U.erika, [U.arantza])).toThrow();
  });
  it('moving a project keeps done steps done and moves the rest', async () => {
    const hub = await newHub();
    const r = hub.reassignProject(U.dalia, 'prj-070', U.erika, [U.arantza]);
    expect(r.alreadyDone).toBeGreaterThanOrEqual(1);
    const steps = hub.projectSteps(U.arantza, 'prj-070');
    expect(steps.find((s) => s.id === 's-070-1')!.status).toBe('REPORTED_COMPLETE');
    expect(steps.find((s) => s.id === 's-070-2')!.assignedUids).toEqual(expect.arrayContaining([U.arantza]));
    expect(steps.find((s) => s.id === 's-070-1')!.assignedUids).toContain(U.erika);
    expect(() => hub.transitionStep(U.erika, 's-070-2', 'IN_PROGRESS')).toThrow();
    expect(hub.getProject(U.dalia, 'prj-070').memberUids).not.toContain(U.erika);
  });
});

describe('v1.10 status', () => {
  it('blocked needs a reason; a reminder day brings it back on that day', async () => {
    const hub = await newHub();
    expect(() => hub.transitionStep(U.erika, 's-070-2', 'BLOCKED', { reason: '' })).toThrow();
    expect(() => hub.transitionStep(U.erika, 's-070-2', 'BLOCKED', { reason: 'Need access', remindOn: '2020-01-01' })).toThrow();
    hub.transitionStep(U.erika, 's-070-2', 'BLOCKED', { reason: 'Need access', remindOn: '2026-10-20' });
    expect(hub.remindersDue(U.erika)).toHaveLength(0);
    hub.state.now = addMinutes(hub.state.now, 5 * 1440);
    expect(hub.remindersDue(U.erika)).toHaveLength(1);
    expect(hub.employeeHome(U.erika).reminders).toHaveLength(1);
    hub.transitionStep(U.erika, 's-070-2', 'IN_PROGRESS');
    expect(hub.remindersDue(U.erika)).toHaveLength(0);
  });
  it('archive keeps the step in the list', async () => {
    const hub = await newHub();
    hub.transitionStep(U.erika, 's-070-3', 'NOT_APPLICABLE');
    expect(hub.projectSteps(U.erika, 'prj-070').find((s) => s.id === 's-070-3')!.status).toBe('NOT_APPLICABLE');
    hub.transitionStep(U.erika, 's-070-3', 'IN_PROGRESS');
  });
});

describe('v1.10 files', () => {
  it('taking a file off a step keeps the original; a finished step asks the person who did it', async () => {
    const hub = await newHub();
    const f = hub.createStepFile(U.erika, 's-070-2', { kind: 'DOC' });
    const link = hub.state.resourceLinks.find((l) => l.resourceId === f.id)!;
    hub.transitionStep(U.erika, 's-070-2', 'REPORTED_COMPLETE');
    const r = hub.removeFile(U.dalia, link.id);
    expect(r.removed).toBe(false);
    expect(hub.pendingFileRemovals(U.erika)).toHaveLength(1);
    expect(hub.employeeHome(U.erika).removals).toHaveLength(1);
    hub.answerFileRemoval(U.erika, link.id, false);
    expect(hub.stepResources(U.erika, 's-070-2').some((x) => x.resource.id === f.id)).toBe(true);
    hub.removeFile(U.dalia, link.id);
    hub.answerFileRemoval(U.erika, link.id, true);
    expect(hub.stepResources(U.erika, 's-070-2').some((x) => x.resource.id === f.id)).toBe(false);
    expect(hub.state.resources.some((x) => x.id === f.id)).toBe(true);
  });
  it('the person on a not-finished step removes immediately', async () => {
    const hub = await newHub();
    const f = hub.createStepFile(U.erika, 's-070-2', { kind: 'DOC' });
    const link = hub.state.resourceLinks.find((l) => l.resourceId === f.id)!;
    expect(hub.removeFile(U.erika, link.id).removed).toBe(true);
  });
});

describe('v1.10 AI ideas', () => {
  it('a note from Dalia sits on the project; sending an idea shares no data', async () => {
    const hub = await newHub();
    hub.setProjectNote(U.dalia, 'prj-070', 'Hey! Do this by next week.');
    expect(hub.getProject(U.erika, 'prj-070').ownerNote?.text).toMatch(/next week/);
    expect(() => hub.setProjectNote(U.erika, 'prj-070', 'x')).toThrow();
    const f = hub.state.ownerFindings.find((x) => x.plan)!;
    hub.shareFindingWithTeam(U.dalia, f.id, [U.erika], 'Take a look');
    const n = hub.listNotifications(U.erika).find((x) => x.sourceEntityId === f.id)!;
    expect(n.preview).toContain('Take a look');
    expect(n.preview).not.toMatch(/\$|revenue|profit/i);
    expect(() => hub.shareFindingWithTeam(U.dalia, f.id, [], '')).toThrow();
  });
});
