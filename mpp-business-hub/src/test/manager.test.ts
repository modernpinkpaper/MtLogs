import { describe, expect, it } from 'vitest';
import { newHub, key, U } from './helpers';
import { PermissionDenied } from '../server/errors';
import { OWNER_SECRET_MARKER } from '../server/ownerSeed';
import { SUBFOLDERS } from '../server/drive';

type H = Awaited<ReturnType<typeof newHub>>;
const plan = (hub: H) => hub.getFinding(U.dalia, 'af-1').plan!;
const approve = (hub: H, extra: Record<string, unknown> = {}) => {
  const p = plan(hub);
  return hub.approveFindingAsProject(U.dalia, 'af-1', { title: p.title, employeeObjective: p.employeeObjective, steps: p.steps, key: 'P-095', priority: 'NORMAL', idempotencyKey: key(), ...extra } as never);
};
const FINANCE = /\bROI\b|\bprofit|\bmargin|\brevenue|\bpayback|\bpayroll|\$\s?\d|\b333\b|OWNER-ONLY|\bcontribution|\bloaded\b/i;

/** Everything an employee-side session can pull from the data layer, as one string. */
function everythingFor(hub: H, uid: string): string {
  const parts: unknown[] = [];
  parts.push(hub.listProjects(uid));
  for (const p of hub.listProjects(uid)) {
    parts.push(hub.projectSteps(uid, p.id), hub.getJournal(uid, { projectId: p.id }), hub.projectResources(uid, p.id), hub.projectWorkspace(uid, p.id));
    for (const s of hub.projectSteps(uid, p.id)) parts.push(hub.stepResources(uid, s.id));
  }
  parts.push(hub.listNotifications(uid), hub.listReviewCards(uid, 'all'), hub.listResources(uid), hub.getJournal(uid), hub.listUsers(uid), hub.counts(uid), hub.listRequests(uid));
  for (const q of ['profit', 'margin', 'ROI', 'revenue', 'AF-001', 'shopify listing', 'Shopify', 'P-095', 'automation', 'owner', '333', 'seasonal']) { parts.push(hub.search(uid, q), hub.aiRetrievalFor(uid, q)); }
  return JSON.stringify(parts);
}

describe('AI Recommendations: owner decides, employees get a clean copy', () => {
  it('a scan only writes owner-private suggestions: no project, no assignment, no employee notification', async () => {
    const hub = await newHub();
    const projects = hub.state.projects.length;
    const memberships = JSON.stringify(hub.state.projects.map((p) => p.memberUids));
    hub.runAiScan(U.dalia);
    expect(hub.state.projects.length).toBe(projects);
    expect(JSON.stringify(hub.state.projects.map((p) => p.memberUids))).toBe(memberships);
    for (const uid of [U.erika, U.arantza, U.carolina, U.printA]) expect(hub.listNotifications(uid).some((n) => n.type === 'AI_FINDING' || /AF-0/.test(n.title))).toBe(false);
  });

  it('Scenario: approve without assigning → project exists, nobody can see it, folder is created; then Dalia assigns Erika', async () => {
    const hub = await newHub();
    const p = approve(hub);
    expect(p.key).toBe('P-095');
    expect(p.origin).toBe('AI_RECOMMENDATION');
    expect(p.memberUids).toEqual([]);
    expect(hub.getFinding(U.dalia, 'af-1').status).toBe('APPROVED');
    expect(hub.inboxSummary(U.dalia).approvedUnassigned).toBe(1);
    for (const uid of [U.erika, U.arantza, U.carolina, U.printA, U.printB, U.extra]) {
      expect(hub.listProjects(uid).map((x) => x.id)).not.toContain(p.id);
      expect(() => hub.getProject(uid, p.id)).toThrow(PermissionDenied);
      expect(hub.search(uid, 'P-095').projects).toHaveLength(0);
      expect(hub.listNotifications(uid).some((n) => n.projectId === p.id)).toBe(false);
    }
    const ws = hub.projectWorkspace(U.dalia, p.id)!;
    expect(ws.state).toBe('READY');
    expect(ws.subfolders.map((s) => s.name)).toEqual(SUBFOLDERS);
    // assignment is a separate, deliberate step
    hub.assignProject(U.dalia, p.id, [U.erika], key());
    expect(hub.getProject(U.erika, p.id).key).toBe('P-095');
    const n = hub.listNotifications(U.erika).filter((x) => x.type === 'PROJECT_ASSIGNED');
    expect(n).toHaveLength(1);
    expect(n[0].title).toContain('P-095');
    expect(hub.projectSteps(U.erika, p.id).every((s) => s.assignedUids.includes(U.erika))).toBe(true);
    expect(hub.inboxSummary(U.dalia).approvedUnassigned).toBe(0);
    expect(hub.listProjects(U.arantza).map((x) => x.id)).not.toContain(p.id); // unrelated people still see nothing
  });

  it('assigning in the same step as approving works, and retrying approval does not create a second project', async () => {
    const hub = await newHub();
    const k = key();
    const a = approve(hub, { assignUids: [U.erika], idempotencyKey: k });
    const b = approve(hub, { assignUids: [U.erika], idempotencyKey: k });
    expect(b.id).toBe(a.id);
    expect(hub.state.projects.filter((p) => p.key === 'P-095')).toHaveLength(1);
    expect(hub.listNotifications(U.erika).filter((x) => x.type === 'PROJECT_ASSIGNED')).toHaveLength(1);
    expect(() => approve(hub)).toThrow(/already approved/);
  });

  it('an employee can edit and add steps and sheets on the new project without touching owner-only records', async () => {
    const hub = await newHub();
    const p = approve(hub, { assignUids: [U.erika] });
    const ownerBefore = JSON.stringify([hub.state.ownerModels, hub.state.ownerFindings]);
    const first = hub.projectSteps(U.erika, p.id)[0];
    hub.updateInstructions(U.erika, first.id, 'Walked through one listing and wrote down 12 steps.');
    const sub = hub.addStep(U.erika, p.id, { title: 'Test with 5 SKUs', parentStepId: first.id });
    expect(sub.parentStepId).toBe(first.id);
    const sheet = hub.createChecklistSheet(U.erika, p.id, first.id, 'P-095 test checklist', 5);
    expect(sheet.type).toBe('GOOGLE_SHEET');
    expect(hub.stepResources(U.erika, first.id).some((x) => x.resource.id === sheet.id)).toBe(true);
    expect(JSON.stringify([hub.state.ownerModels, hub.state.ownerFindings])).toBe(ownerBefore);
  });

  it('Scenario B: Erika cannot reach ANY money, ROI, margin or strategy through any call: lists, steps, journal, files, notifications, search, AI retrieval', async () => {
    const hub = await newHub();
    const p = approve(hub, { assignUids: [U.erika] });
    hub.runAiScan(U.dalia);
    hub.createUpdateRequest(U.dalia, { projectId: p.id, stepId: hub.projectSteps(U.dalia, p.id)[3].id, question: 'Tell me whether the test finished and any errors.', idempotencyKey: key() });
    hub.updateModelVar(U.dalia, 'om-1', 'loadedHourlyCost', { base: 27 });
    const all = everythingFor(hub, U.erika);
    expect(all).toContain('P-095'); // she can see her own project…
    expect(all).not.toMatch(FINANCE); // …and none of the owner-only material
    expect(all).not.toContain(OWNER_SECRET_MARKER);
    expect(all).not.toContain('af-1');
    expect(all).not.toMatch(/AF-0\d\d/);
    for (const uid of [U.arantza, U.carolina, U.printA, U.extra]) {
      const other = everythingFor(hub, uid);
      expect(other).not.toMatch(FINANCE);
      expect(other).not.toContain('P-095');
    }
  });

  it('every owner method refuses employees, and a spoofed user id gets nothing', async () => {
    const hub = await newHub();
    const calls: [string, () => unknown][] = [
      ['listFindings', () => hub.listFindings(U.erika)], ['inboxSummary', () => hub.inboxSummary(U.erika)], ['getFinding', () => hub.getFinding(U.erika, 'af-1')],
      ['findingModel', () => hub.findingModel(U.erika, 'af-1')], ['updateModelVar', () => hub.updateModelVar(U.erika, 'om-1', 'tasksPerMonth', { base: 1 })], ['runAiScan', () => hub.runAiScan(U.erika)],
      ['approve', () => hub.approveFindingAsProject(U.erika, 'af-1', { title: 'x', employeeObjective: 'x', steps: plan(hub).steps, idempotencyKey: key() })],
      ['assign', () => hub.assignProject(U.erika, 'prj-012', [U.erika], key())], ['dismiss', () => hub.dismissFinding(U.erika, 'af-1')], ['snooze', () => hub.snoozeFinding(U.erika, 'af-1', '2026-11-01')],
      ['goals', () => hub.listGoals(U.erika)], ['sources', () => hub.listSources(U.erika)], ['toggleSource', () => hub.toggleSource(U.erika, 'src-2', true)], ['outcomes', () => hub.outcomeTracker(U.erika)],
      ['provision', () => hub.provisionWorkspace(U.erika, 'prj-012', key())], ['preview', () => hub.employeeBriefPreview(U.erika, { title: 'x', employeeObjective: 'x', steps: [] })],
      ['spoof', () => hub.listFindings('u-dalia-fake')],
    ];
    for (const [name, fn] of calls) expect(fn, name).toThrow(PermissionDenied);
    expect(() => hub.listFindings('')).toThrow(PermissionDenied);
  });

  it('owner-only text cannot be put into the worker plan', async () => {
    const hub = await newHub();
    const steps = plan(hub).steps.map((s) => ({ ...s }));
    steps[0].whyForGoal = 'This could save $333 a month';
    expect(() => approve(hub, { steps })).toThrow(/Keep money details out of the worker plan/);
    expect(() => approve(hub, { employeeObjective: 'Raise profit margin on the fall range' })).toThrow(/profit/);
    expect(() => approve(hub, { title: '' })).toThrow(/name/);
    expect(hub.state.projects.some((p) => p.key === 'P-095')).toBe(false); // nothing was created by the failed attempts
    expect(() => approve(hub, { key: 'P-012' })).toThrow(/already used/);
    expect(() => approve(hub, { assignUids: [U.dalia] })).toThrow(/people who work here/);
  });

  it('the worker preview is built only from the sanitized fields', async () => {
    const hub = await newHub();
    const p = plan(hub);
    const prev = hub.employeeBriefPreview(U.dalia, { title: p.title, employeeObjective: p.employeeObjective, steps: p.steps });
    expect(JSON.stringify(prev)).not.toMatch(FINANCE);
    expect(prev.steps).toHaveLength(9);
    expect(prev.steps[3].title).toBe('Run the helper on the 5 test products');
  });

  it('simulated Drive: folder, 5 subfolders, a shortcut (original untouched), a script pointer (script not moved), and a retry creates no duplicates', async () => {
    const hub = await newHub();
    const sopBefore = JSON.stringify(hub.state.resources.find((r) => r.id === 'r-sop-shopify'));
    const lister = JSON.stringify(hub.state.resources.find((r) => r.id === 'r-lister'));
    const p = approve(hub, { assignUids: [U.erika] });
    const foldersAfter = hub.state.drive.folders.length;
    expect(foldersAfter).toBe(6);
    hub.provisionWorkspace(U.dalia, p.id, key()); hub.provisionWorkspace(U.dalia, p.id, key());
    expect(hub.state.drive.folders.length).toBe(6);
    expect(hub.state.drive.shortcuts).toHaveLength(1);
    expect(hub.state.drive.shortcuts[0].targetResourceId).toBe('r-sop-shopify');
    expect(JSON.stringify(hub.state.resources.find((r) => r.id === 'r-sop-shopify'))).toBe(sopBefore); // original unchanged
    expect(JSON.stringify(hub.state.resources.find((r) => r.id === 'r-lister'))).toBe(lister); // script not moved
    const ws = hub.projectWorkspace(U.erika, p.id)!;
    expect(ws.pointers[0].path).toMatch(/Tampermonkey/);
    expect(ws.ownerOnly).toBeNull(); // log and error text are owner-only
    expect(hub.projectWorkspace(U.dalia, p.id)!.ownerOnly!.log.every((l) => /simulated/.test(l.detail))).toBe(true);
    expect(hub.state.workspaces[p.id].log.some((l) => /not moved|stays/.test(l.detail))).toBe(true);
  });

  it('a Drive error half way is recorded honestly, approval still works, and the retry finishes without duplicates', async () => {
    const hub = await newHub();
    hub.demoDriveFailAfter(2);
    const p = approve(hub);
    const ws1 = hub.state.workspaces[p.id];
    expect(ws1.state).toBe('PARTIALLY_CREATED');
    expect(ws1.lastError).toMatch(/too many requests/);
    expect(hub.getFinding(U.dalia, 'af-1').status).toBe('APPROVED'); // the project exists even though the folder is not finished
    expect(hub.state.drive.folders.length).toBe(2);
    hub.provisionWorkspace(U.dalia, p.id, key());
    const ws2 = hub.state.workspaces[p.id];
    expect(ws2.state).toBe('READY');
    expect(ws2.attempts).toBe(2);
    expect(hub.state.drive.folders.length).toBe(6); // exactly 1 + 5, no duplicates
    expect(new Set(hub.state.drive.folders.map((f) => f.name + f.parentId)).size).toBe(6);
    // failure on the very first call
    const h2 = await newHub(); h2.demoDriveFailAfter(0);
    const p2 = approve(h2);
    expect(h2.state.workspaces[p2.id].state).toBe('ERROR');
    h2.provisionWorkspace(U.dalia, p2.id, key());
    expect(h2.state.workspaces[p2.id].state).toBe('READY');
  });

  it('a shortcut does not give access to the original: someone without access sees “Request access”', async () => {
    const hub = await newHub();
    const p = approve(hub, { assignUids: [U.arantza] }); // Arantza is not on P-012, which owns the SOP link
    const view = hub.projectWorkspace(U.arantza, p.id)!;
    expect(view.shortcuts[0].canOpen).toBe(false);
    expect(view.shortcuts[0].note).toMatch(/Request access/);
    expect(hub.projectWorkspace(U.dalia, p.id)!.shortcuts[0].canOpen).toBe(true);
  });

  it('private projects use the separate private root, which employees can never reach', async () => {
    const hub = await newHub();
    const ws = hub.provisionWorkspace(U.dalia, 'prj-priv', key());
    expect(ws.rootId).toBe('demo-root-owner-private');
    expect(hub.state.drive.folders.find((f) => f.id === ws.folderId)!.parentId).toBe('demo-root-owner-private');
    expect(() => hub.projectWorkspace(U.erika, 'prj-priv')).toThrow(PermissionDenied);
    expect(JSON.stringify(hub.listResources(U.erika))).not.toMatch(/Project folder — P-D01/);
  });

  it('checklist sheets need a ready folder and a person on the project', async () => {
    const hub = await newHub();
    const p = approve(hub, { assignUids: [U.erika], createWorkspace: false });
    expect(() => hub.createChecklistSheet(U.erika, p.id, null, 'Sheet', 5)).toThrow(/folder is not ready/);
    hub.provisionWorkspace(U.dalia, p.id, key());
    expect(() => hub.createChecklistSheet(U.arantza, p.id, null, 'Sheet', 5)).toThrow(PermissionDenied);
    expect(hub.createChecklistSheet(U.erika, p.id, null, 'Sheet', 5).checklistSummary).toMatchObject({ total: 5, yes: 0, blank: 5 });
  });

  it('a scan twice makes no duplicates; repeats add a dated note; only urgent items alert right away; normal items go in one digest', async () => {
    const hub = await newHub();
    const before = hub.state.ownerFindings.length;
    const r1 = hub.runAiScan(U.dalia);
    expect(r1.created.length).toBe(3);
    expect(r1.updated).toContain('AF-001'); // same idea seen again → same record
    const mid = hub.state.ownerFindings.length;
    expect(mid).toBe(before + 3);
    const occ = hub.state.ownerFindings.find((f) => f.code === 'AF-001')!.occurrences.length;
    hub.runAiScan(U.dalia); hub.runAiScan(U.dalia);
    expect(hub.state.ownerFindings.length).toBe(mid);
    expect(hub.state.ownerFindings.find((f) => f.code === 'AF-001')!.occurrences.length).toBe(occ);
    const urgent = hub.listNotifications(U.dalia).filter((n) => n.type === 'AI_FINDING');
    expect(urgent).toHaveLength(1);
    expect(urgent[0].title).toMatch(/^Urgent:/);
    expect(hub.listNotifications(U.dalia).filter((n) => n.title.startsWith('AI summary'))).toHaveLength(1);
    expect(hub.listFindings(U.dalia)[0].urgency).toBe('URGENT'); // urgent first
  });

  it('old public pages are shown as old, not as new rules; dated sources keep all their dates', async () => {
    const hub = await newHub();
    hub.runAiScan(U.dalia);
    const old = hub.state.ownerFindings.find((f) => f.dedupeKey === 'old-policy-page')!;
    expect(old.summary).toMatch(/probably not a new change/);
    expect(old.factLabel).toBe('UNKNOWN');
    const policy = hub.getFinding(U.dalia, 'af-4').evidence[0];
    expect(policy).toMatchObject({ sourceType: 'WEB' });
    expect(policy.url).toMatch(/example\.com/);
    expect(policy.publishedAt && policy.effectiveDate && policy.retrievedAt).toBeTruthy();
    expect(hub.getFinding(U.dalia, 'af-4').uncertainties.join(' ')).toMatch(/not matched/);
  });

  it('dismiss, snooze, archive, link and informational keep the evidence; a snooze comes back once on its date', async () => {
    const hub = await newHub();
    hub.dismissFinding(U.dalia, 'af-3', 'Not a priority');
    expect(hub.getFinding(U.dalia, 'af-3').evidence).toHaveLength(1);
    expect(hub.getFinding(U.dalia, 'af-3').decisions[0]).toMatchObject({ decision: 'DISMISSED', rationale: 'Not a priority' });
    expect(hub.listFindings(U.dalia, { view: 'decision' }).map((f) => f.code)).not.toContain('AF-003');
    expect(hub.listFindings(U.dalia, { view: 'done' }).map((f) => f.code)).toContain('AF-003');
    hub.snoozeFinding(U.dalia, 'af-4', '2026-10-30');
    expect(() => hub.snoozeFinding(U.dalia, 'af-5', '2026-10-10')).toThrow(/after today/);
    hub.demoAdvanceToDate('2026-10-29'); expect(hub.getFinding(U.dalia, 'af-4').status).toBe('SNOOZED');
    hub.demoAdvanceToDate('2026-10-30'); hub.processSchedules(); hub.processSchedules();
    expect(hub.getFinding(U.dalia, 'af-4').status).toBe('NEW');
    expect(hub.listNotifications(U.dalia).filter((n) => n.title.startsWith('Back in your list'))).toHaveLength(1);
    hub.linkFinding(U.dalia, 'af-2', 'prj-081');
    expect(hub.getFinding(U.dalia, 'af-2')).toMatchObject({ status: 'LINKED', linkedProjectId: 'prj-081' });
    hub.markInformational(U.dalia, 'af-6'); hub.archiveFinding(U.dalia, 'af-5');
    expect(hub.getAudit(U.dalia).filter((a) => a.entityType === 'finding').length).toBeGreaterThanOrEqual(5);
    hub.investigateMore(U.dalia, 'af-4');
    expect(hub.getFinding(U.dalia, 'af-4').status).toBe('INVESTIGATING');
    expect(hub.state.aiRuns.every((r) => r.costUsd === 0)).toBe(true);
  });

  it('filters and search over the inbox work and count only what exists', async () => {
    const hub = await newHub();
    expect(hub.listFindings(U.dalia, { q: 'toner' }).map((f) => f.code)).toEqual(['AF-003']);
    expect(hub.listFindings(U.dalia, { area: 'Amazon' }).map((f) => f.code).sort()).toEqual(['AF-002', 'AF-004']);
    expect(hub.listFindings(U.dalia, { kind: 'Documentation gap' })).toHaveLength(1);
    expect(hub.listFindings(U.dalia, { q: '99104020742' }).map((f) => f.code)).toEqual(['AF-002']); // searches evidence text
    const s = hub.inboxSummary(U.dalia);
    expect(s.needsDecision).toBe(6);
    expect(s.newSinceLastLook).toBe(6);
    hub.markFindingsSeen(U.dalia);
    expect(hub.inboxSummary(U.dalia).newSinceLastLook).toBe(0);
  });

  it('Scenario: results tracker compares plan with what was measured and says it is not proof of cause', async () => {
    const hub = await newHub();
    const p = approve(hub, { assignUids: [U.erika] });
    expect(hub.outcomeTracker(U.dalia)[0].comparison).toBe('Nothing measured yet.');
    hub.recordOutcome(U.dalia, 'af-1', { period: 'Nov 2026', actualHours: 9, actualOrders: null, limitations: 'Busy holiday month.' });
    const row = hub.outcomeTracker(U.dalia)[0];
    expect(row.comparison).toMatch(/Planned 16\.7 hours per month. Measured 9 hours/);
    expect(row.comparison).toMatch(/not proof/);
    expect(() => hub.recordOutcome(U.dalia, 'af-2', { period: 'x', actualHours: 1, actualOrders: null, limitations: '' })).toThrow(/approved projects/);
    void p;
  });

  it('goals and sources are owner-editable; the source switch is pretend only', async () => {
    const hub = await newHub();
    const g = hub.addGoal(U.dalia, 'Look for revenue leaks from Amazon listings', 'Check listings that get views but no orders.', 'HIGH');
    expect(hub.listGoals(U.dalia).find((x) => x.id === g.id)!.enabled).toBe(true);
    hub.updateGoal(U.dalia, g.id, { enabled: false });
    expect(hub.listGoals(U.dalia).find((x) => x.id === g.id)!.enabled).toBe(false);
    expect(() => hub.addGoal(U.dalia, ' ', '', 'LOW')).toThrow(/few words/);
    hub.toggleSource(U.dalia, 'src-2', true);
    expect(hub.listSources(U.dalia).find((s) => s.id === 'src-2')!.demoEnabled).toBe(true);
    expect(hub.getAudit(U.dalia).some((a) => a.action === 'PRETEND_CONNECTOR_ON')).toBe(true);
    // nothing in the data layer can make a live call
    expect(hub.listSources(U.dalia).every((s) => s.note.length > 0)).toBe(true);
  });
});
