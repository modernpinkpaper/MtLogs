import { describe, expect, it } from 'vitest';
import { newHub, key, U } from './helpers';
import { PermissionDenied } from '../server/errors';

const unmatched = (hub: Awaited<ReturnType<typeof newHub>>) => hub.outstandingCards(U.erika).find((c) => c.cardType === 'AI_UNMATCHED_WORK')!;

describe('unmatched work: skip, everyday work, or add to a project', () => {
  it('skipping logs nothing, keeps the item, and the owner can still see it with the reason', async () => {
    const hub = await newHub();
    const card = unmatched(hub);
    const before = hub.state.workLog.length;
    hub.submitDecision(U.erika, card.id, { action: 'DISMISS', note: 'just a quick look', idempotencyKey: key() });
    expect(hub.state.workLog.length).toBe(before); // not logged anywhere
    expect(hub.myWorkLog(U.erika)).toHaveLength(0);
    const skipped = hub.otherWork(U.dalia).skipped;
    expect(skipped).toHaveLength(1);
    expect(skipped[0].decision?.note).toBe('just a quick look');
    expect(skipped[0].byName).toBe('Erika');
    expect(skipped[0].events.join(' ')).toMatch(/MS066/);
    expect(hub.state.findings.find((f) => f.id === card.findingIds[0])!.status).toBe('DISMISSED'); // kept, not deleted
  });

  it('“everyday work” is saved to the person’s own list and shown to the owner, without touching any project', async () => {
    const hub = await newHub();
    const card = unmatched(hub);
    const steps = JSON.stringify(hub.state.steps.map((s) => [s.id, s.status]));
    const projects = hub.state.projects.length;
    hub.submitDecision(U.erika, card.id, { action: 'CONFIRM', classification: { kind: 'ROUTINE', newStepTitle: 'Fixed front artwork for “MS066”' }, idempotencyKey: key() });
    const mine = hub.myWorkLog(U.erika);
    expect(mine).toHaveLength(1);
    expect(mine[0].title).toBe('Fixed front artwork for “MS066”');
    expect(mine[0].kind).toBe('EVERYDAY');
    expect(JSON.stringify(hub.state.steps.map((s) => [s.id, s.status]))).toBe(steps);
    expect(hub.state.projects.length).toBe(projects);
    expect(hub.otherWork(U.dalia).everyday).toHaveLength(1);
    expect(hub.myWorkLog(U.arantza)).toHaveLength(0); // others do not see it
  });

  it('“maybe a new project” tells the owner; “add to a step” links it to the project', async () => {
    const hub = await newHub();
    const card = unmatched(hub);
    hub.submitDecision(U.erika, card.id, { action: 'CONFIRM', classification: { kind: 'POTENTIAL_PROJECT', newStepTitle: 'Artwork refresh for MS family' }, idempotencyKey: key() });
    expect(hub.listNotifications(U.dalia).some((n) => n.title.includes('may be a new project'))).toBe(true);
    expect(hub.otherWork(U.dalia).maybeProject).toHaveLength(1);
    const hub2 = await newHub();
    hub2.submitDecision(U.erika, unmatched(hub2).id, { action: 'CONFIRM', classification: { kind: 'LINK_EXISTING', projectId: 'prj-070', stepId: 's-070-6' }, idempotencyKey: key() });
    expect(hub2.otherWork(U.dalia).attached[0].linkedTo).toBe('P-070 · Step 6');
    expect(hub2.state.workLog).toHaveLength(0);
  });

  it('the owner can send a skipped item back; the earlier decision stays in history; only the owner can see this page', async () => {
    const hub = await newHub();
    const card = unmatched(hub);
    hub.submitDecision(U.erika, card.id, { action: 'DISMISS', idempotencyKey: key() });
    const f = hub.otherWork(U.dalia).skipped[0].finding;
    hub.restoreFinding(U.dalia, f.id);
    expect(hub.outstandingCards(U.erika).some((c) => c.id === card.id)).toBe(true);
    expect(hub.state.reviewDecisions.some((d) => d.cardId === card.id && d.selectedAction === 'DISMISS')).toBe(true);
    expect(hub.otherWork(U.dalia).skipped).toHaveLength(0);
    expect(hub.listNotifications(U.erika).some((n) => n.title.includes('look at this again'))).toBe(true);
    expect(() => hub.otherWork(U.erika)).toThrow(PermissionDenied);
    expect(() => hub.restoreFinding(U.erika, f.id)).toThrow(PermissionDenied);
  });

  it('“not me” also stays visible to the owner', async () => {
    const hub = await newHub();
    hub.submitDecision(U.erika, unmatched(hub).id, { action: 'NOT_MY_WORK', idempotencyKey: key() });
    expect(hub.otherWork(U.dalia).notMine).toHaveLength(1);
  });
});
