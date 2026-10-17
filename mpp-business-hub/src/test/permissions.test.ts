import { describe, expect, it } from 'vitest';
import { newHub, key, U } from './helpers';
import { PermissionDenied } from '../server/errors';

const PRIV = 'prj-priv';
const employees = [U.erika, U.arantza, U.carolina, U.printA, U.printB, U.printC, U.extra];

// Acceptance matrix E — permissions
describe('E. permissions and owner privacy', () => {
  it('Dalia sees owner-private and all company projects', async () => {
    const hub = await newHub();
    const keys = hub.listProjects(U.dalia).map((p) => p.key);
    expect(keys).toContain('P-D01');
    expect(keys).toEqual(expect.arrayContaining(['P-012', 'P-070', 'P-081', 'P-044']));
    expect(hub.getProject(U.dalia, PRIV).title).toBe('Owner Private Planning');
  });

  it('no employee can discover the private project: list, search, counts, notifications, journal, resources, AI retrieval, direct id', async () => {
    const hub = await newHub();
    for (const uid of employees) {
      expect(hub.listProjects(uid).some((p) => p.visibility === 'OWNER_PRIVATE')).toBe(false);
      for (const q of ['Owner Private', 'private', 'planning', 'P-D01', 'financial']) {
        const r = hub.search(uid, q);
        expect(r.projects.map((p) => p.id)).not.toContain(PRIV);
        expect(r.steps.some((s) => s.projectId === PRIV)).toBe(false);
        expect(r.resources.some((x) => x.id === 'r-private-plan')).toBe(false);
        const ai = hub.aiRetrievalFor(uid, q);
        expect(JSON.stringify(ai)).not.toMatch(/Private planning|P-D01|financial/i);
      }
      expect(() => hub.getProject(uid, PRIV)).toThrow(PermissionDenied);
      expect(() => hub.projectSteps(uid, PRIV)).toThrow(PermissionDenied);
      expect(() => hub.getStep(uid, 's-priv-1')).toThrow(PermissionDenied);
      expect(() => hub.getJournal(uid, { projectId: PRIV })).toThrow(PermissionDenied);
      expect(() => hub.stepResources(uid, 's-priv-1')).toThrow(PermissionDenied);
      expect(hub.getJournal(uid).some((e) => e.projectId === PRIV)).toBe(false);
      expect(hub.listResources(uid).some((r) => r.resource.id === 'r-private-plan')).toBe(false);
      expect(hub.counts(uid).projects).toBe(hub.listProjects(uid).length);
    }
    // counts differ between owner and employee by exactly the projects they cannot see
    expect(hub.counts(U.dalia).projects).toBe(hub.state.projects.length);
  });

  it('a guessed id and a non-existent id produce the identical generic error (no data-bearing message)', async () => {
    const hub = await newHub();
    const msg = (fn: () => unknown) => { try { fn(); } catch (e) { return (e as Error).message; } return 'no error'; };
    const a = msg(() => hub.getProject(U.erika, PRIV));
    const b = msg(() => hub.getProject(U.erika, 'prj-does-not-exist'));
    expect(a).toBe('permission denied');
    expect(b).toBe(a);
    expect(a).not.toMatch(/private|owner|planning/i);
  });

  it('private activity creates no employee-visible notifications and owner-only things stay owner-only', async () => {
    const hub = await newHub();
    for (const uid of employees) {
      expect(JSON.stringify(hub.listNotifications(uid))).not.toMatch(/Private|P-D01/);
    }
    expect(() => hub.weeklyPrintReport(U.erika)).toThrow(PermissionDenied);
    expect(() => hub.ownerOverview(U.erika)).toThrow(PermissionDenied);
    expect(() => hub.getAudit(U.erika)).toThrow(PermissionDenied);
    expect(() => hub.teamOverview(U.arantza)).toThrow(PermissionDenied);
    expect(() => hub.intakeOverview(U.printA)).toThrow(PermissionDenied);
    expect(() => hub.decideOpportunity(U.erika, 'op-1', 'APPROVED', '')).toThrow(PermissionDenied);
    expect(() => hub.createProject(U.erika, { title: 'x', objective: '', memberUids: [], visibility: 'ASSIGNED_ONLY' })).toThrow(PermissionDenied);
    expect(() => hub.updateSettings(U.erika, { monthlyBudgetUsd: 1 })).toThrow(PermissionDenied);
  });

  it('Erika cannot read Arantza-only project (and vice versa) unless explicitly shared; revoke removes access immediately', async () => {
    const hub = await newHub();
    expect(() => hub.getProject(U.erika, 'prj-044')).toThrow(PermissionDenied);
    expect(() => hub.getProject(U.arantza, 'prj-012')).toThrow(PermissionDenied);
    hub.shareProject(U.dalia, 'prj-044', U.erika, true);
    expect(hub.getProject(U.erika, 'prj-044').key).toBe('P-044');
    expect(() => hub.transitionStep(U.erika, 's-044-1', 'BLOCKED', { reason: 'x' })).toThrow(PermissionDenied); // read-only share
    hub.shareProject(U.dalia, 'prj-044', U.erika, false);
    expect(() => hub.getProject(U.erika, 'prj-044')).toThrow(PermissionDenied); // stale deep link fails
    expect(() => hub.getStep(U.erika, 's-044-1')).toThrow(PermissionDenied);
  });

  it('a removed collaborator loses access, including journals, resources and notifications deep links', async () => {
    const hub = await newHub();
    expect(hub.getJournal(U.carolina, { projectId: 'prj-070' }).length).toBeGreaterThan(0);
    hub.setProjectMembers(U.dalia, 'prj-070', [U.erika]);
    expect(() => hub.getJournal(U.carolina, { projectId: 'prj-070' })).toThrow(PermissionDenied);
    expect(() => hub.projectResources(U.carolina, 'prj-070')).toThrow(PermissionDenied);
    expect(hub.listProjects(U.carolina).map((p) => p.key)).not.toContain('P-070');
  });

  it('employees cannot forge responses, self-authorize, or mark high-risk results externally verified', async () => {
    const hub = await newHub();
    expect(() => hub.recordVerification(U.erika, 's-081-2', { verifier: 'me', entity: 'x', result: 'CONFIRMED', detail: 'trust me' })).toThrow(PermissionDenied);
    expect(() => hub.shareProject(U.erika, 'prj-044', U.erika, true)).toThrow(PermissionDenied);
    expect(() => hub.setProjectMembers(U.erika, 'prj-044', [U.erika])).toThrow(PermissionDenied);
    expect(() => hub.sendProactiveUpdate(U.erika, { projectId: 'prj-044', choice: 'COMPLETED', idempotencyKey: key() })).toThrow(PermissionDenied);
    expect(() => hub.transitionStep(U.erika, 's-044-1', 'REPORTED_COMPLETE')).toThrow(PermissionDenied);
    expect(() => hub.toggleChecklist(U.arantza, 's-012-2', 'c1')).toThrow(PermissionDenied);
    expect(() => hub.updateInstructions(U.arantza, 's-012-3', 'hacked')).toThrow(PermissionDenied);
    // the additional employee has safe defaults: nothing
    expect(hub.listProjects(U.extra)).toHaveLength(0);
    expect(hub.listResources(U.extra).every((r) => r.resource.visibility === 'TEAM_SHARED')).toBe(true);
  });

  it('employees cannot read other employees’ cards, notifications, decisions, print stats or the roster', async () => {
    const hub = await newHub();
    const card = hub.outstandingCards(U.erika)[0];
    expect(() => hub.getCard(U.arantza, card.id)).toThrow(PermissionDenied);
    expect(() => hub.cardFindings(U.arantza, card.id)).toThrow(PermissionDenied);
    const n = hub.listNotifications(U.dalia)[0];
    expect(() => hub.markRead(U.erika, n.id)).toThrow(PermissionDenied);
    expect(() => hub.acknowledge(U.erika, n.id)).toThrow(PermissionDenied);
    expect(() => hub.myPrintStats(U.printA, U.printB)).toThrow(PermissionDenied);
    expect(hub.listUsers(U.erika).map((u) => u.name).sort()).toEqual(['Dalia', 'Erika']);
    expect(() => hub.findingEvidence(U.arantza, card.findingIds[0])).toThrow(PermissionDenied);
  });

  it('inactive users cannot act at all', async () => {
    const hub = await newHub();
    hub.setUserActive(U.dalia, U.erika, false);
    expect(() => hub.listProjects(U.erika)).toThrow(PermissionDenied);
    expect(() => hub.clockIn(U.erika, key())).toThrow(PermissionDenied);
  });
});
