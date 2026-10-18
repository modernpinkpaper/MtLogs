import { describe, expect, it } from 'vitest';
import { HubServer } from '../server/hub';
import { newHub, key, U } from './helpers';
import { PermissionDenied } from '../server/errors';
import { resourceActions, resourceApproval } from '../domain/resourceView';
import { progressCounts } from '../domain/projectStatus';

type H = Awaited<ReturnType<typeof newHub>>;
const counts = (hub: H, pid: string) => progressCounts(hub.state.steps.filter((s) => s.projectId === pid));
const dalia = (hub: H, r: string) => resourceApproval(hub.state.resources.find((x) => x.id === r)!, hub.ownerUids())!;
/** Rebuilds the app from its saved state, like closing and reopening the page. */
const reload = (hub: H): H => new (HubServer as unknown as new (s: unknown, p: boolean) => H)(JSON.parse(JSON.stringify(hub.state)), false);
const skus = Array.from({ length: 20 }, (_, i) => `MA${String(41 + i).padStart(3, '0')}`);

// ===================================================================== 1
describe('1. File versions: choosing, submitting and approving are three different things', () => {
  it('Erika can choose a working draft and ask for approval, but cannot approve; Dalia can; an audit record is created', async () => {
    const hub = await newHub();
    const before = JSON.stringify(hub.state.resources.find((r) => r.id === 'r-seo-a'));
    hub.selectWorkingVersion(U.erika, 'r-seo-a', 'rev 41');
    expect(hub.workingVersionFor(U.erika, 'r-seo-a')).toBe('rev 41');
    expect(JSON.stringify(hub.state.resources.find((r) => r.id === 'r-seo-a'))).toBe(before); // choosing changes nothing official
    expect(dalia(hub, 'r-seo-a').state).toBe('DRAFT');
    expect(hub.workingVersionFor(U.arantza, 'r-seo-a')).toBeNull(); // personal choice

    // every way Erika might try to approve is refused inside the server layer
    expect(() => hub.approveVersion(U.erika, 'r-seo-a', 'rev 41')).toThrow(PermissionDenied);
    expect(() => hub.setApprovedVersion(U.erika, 'r-seo-a', 'rev 41')).toThrow(PermissionDenied);
    expect(() => hub.declineApproval(U.erika, 'r-seo-a')).toThrow(PermissionDenied);
    expect(() => hub.keepApprovedDismissSuggestion(U.erika, 'r-amazon-flat')).toThrow(PermissionDenied);
    expect(() => hub.pendingApprovals(U.erika)).toThrow(PermissionDenied);
    expect(hub.state.resources.find((r) => r.id === 'r-seo-a')!.approvedVersion).toBeNull();

    // she can submit for approval: pending, Dalia is told once, nothing is approved
    hub.submitForApproval(U.erika, 'r-seo-a', { version: 'rev 41', note: 'All 154 rows checked.', idempotencyKey: key() });
    hub.submitForApproval(U.erika, 'r-seo-a', { version: 'rev 41', note: 'All 154 rows checked.', idempotencyKey: key() }); // second click
    expect(dalia(hub, 'r-seo-a').state).toBe('PENDING');
    expect(hub.state.resources.find((r) => r.id === 'r-seo-a')!.approvedVersion).toBeNull();
    expect(hub.listNotifications(U.dalia).filter((n) => n.type === 'APPROVAL_REQUEST')).toHaveLength(1);

    // Dalia approves: recorded with approver, time, old and new version, in the journal and the audit trail
    hub.approveVersion(U.dalia, 'r-seo-a', 'rev 41');
    expect(dalia(hub, 'r-seo-a')).toMatchObject({ state: 'APPROVED', label: 'Approved — Use this version' });
    const r = hub.state.resources.find((x) => x.id === 'r-seo-a')!;
    expect(r.approval).toMatchObject({ version: 'rev 41', byUid: U.dalia });
    expect(r.pendingApproval).toBeNull();
    const aud = hub.getAudit(U.dalia).filter((a) => a.entityId === 'r-seo-a' && a.action === 'APPROVE_RESOURCE_VERSION');
    expect(aud).toHaveLength(1);
    expect(aud[0]).toMatchObject({ actorUid: U.dalia });
    expect(aud[0].before).toMatchObject({ approvedVersion: null });
    expect(aud[0].after).toMatchObject({ approvedVersion: 'rev 41', approvedBy: U.dalia });
    const j = hub.getJournal(U.dalia, { projectId: 'prj-012', types: ['RESOURCE'] }).find((e) => /approved for team use/i.test(e.title))!;
    expect(j.verificationState).toBe('OWNER_APPROVED');
    expect(j.summary).toMatch(/no approved version → rev 41, approved by Dalia/);
    // Erika is told it was approved
    expect(hub.listNotifications(U.erika).some((n) => /approved SEO Master/.test(n.title))).toBe(true);
    // the journal is append-only: a second approval of the same version adds nothing
    hub.approveVersion(U.dalia, 'r-seo-a', 'rev 41');
    expect(hub.getAudit(U.dalia).filter((a) => a.entityId === 'r-seo-a' && a.action === 'APPROVE_RESOURCE_VERSION')).toHaveLength(1);
  });

  it('a new approval supersedes the old one and keeps both in the history; “FINAL” in a name never approves anything', async () => {
    const hub = await newHub();
    hub.approveVersion(U.dalia, 'r-seo-a', 'rev 41');
    hub.approveVersion(U.dalia, 'r-seo-b', 'rev 12', { supersedesResourceId: 'r-seo-a' });
    expect(dalia(hub, 'r-seo-b').state).toBe('APPROVED');
    expect(dalia(hub, 'r-seo-a').state).toBe('SUPERSEDED');
    const fresh = await newHub();
    expect(fresh.state.resources.find((r) => r.id === 'r-seo-b')!.label).toMatch(/FINAL/);
    expect(dalia(fresh, 'r-seo-b').state).toBe('NONE');
  });

  it('Erika cannot approve through bulk actions, other entry points, or other people’s files', async () => {
    const hub = await newHub();
    await hub.demoReleaseFbaHour();
    const ids = hub.outstandingCards(U.erika).filter((c) => c.cardType !== 'OWNER_REQUEST').map((c) => c.id);
    const snapshot = JSON.stringify(hub.state.resources.map((r) => [r.id, r.approvedVersion ?? null, r.approval ?? null]));
    hub.bulkConfirm(U.erika, ids, key());                                  // bulk review
    hub.demoDiscoverSheet(U.dalia);
    hub.reviewResourceLink(U.erika, 'l-sug-1', 'CONFIRM');                  // confirming a link is not approving a file
    expect(JSON.stringify(hub.state.resources.filter((r) => JSON.parse(snapshot).some((x: string[]) => x[0] === r.id)).map((r) => [r.id, r.approvedVersion ?? null, r.approval ?? null]))).toBe(snapshot);
    expect(() => hub.approveVersion(U.arantza, 'r-seo-a', 'rev 41')).toThrow(PermissionDenied); // not her project
    expect(() => hub.submitForApproval(U.arantza, 'r-seo-a', { idempotencyKey: key() })).toThrow(PermissionDenied);
  });

  it('SIMULATED TEST ONLY: if someone edits the stored data directly, an approval with no record is not trusted', async () => {
    const hub = await newHub();
    hub.state.resources.find((r) => r.id === 'r-seo-a')!.approvedVersion = 'rev 41'; // tampering, as a browser console could
    expect(dalia(hub, 'r-seo-a')).toMatchObject({ state: 'UNRECORDED', label: 'Approval not recorded — Do not rely on it' });
    expect(hub.approvalIsRecorded(hub.state.resources.find((r) => r.id === 'r-seo-a')!)).toBe(false);
    hub.state.resources.find((r) => r.id === 'r-seo-a')!.approval = { version: 'rev 41', byUid: U.erika, at: hub.now }; // forged by a non-owner
    expect(dalia(hub, 'r-seo-a').state).toBe('UNRECORDED');
    // NOTE: a real backend must enforce this on the server. The browser demo can only detect it.
  });
});

// ===================================================================== 2 & 3
describe('2. Reported complete is not verified complete', () => {
  it('Erika reports P-012 Step 3 finished: verified count stays 2, reported count becomes 1, until a real check passes', async () => {
    const hub = await newHub();
    expect(counts(hub, 'prj-012')).toMatchObject({ verified: 2, reported: 0, total: 4, label: '2 of 4 verified complete' });
    hub.sendProactiveUpdate(U.erika, { projectId: 'prj-012', stepId: 's-012-3', choice: 'COMPLETED', note: 'All listed.', idempotencyKey: key() });
    expect(hub.getStep(U.dalia, 's-012-3').status).toBe('REPORTED_COMPLETE');
    expect(counts(hub, 'prj-012')).toMatchObject({ verified: 2, reported: 1, label: '2 of 4 verified complete · 1 reported complete (awaiting check)' });
    expect(() => hub.transitionStep(U.erika, 's-012-3', 'VERIFIED_COMPLETE')).toThrowError(/source system/);
    expect(() => hub.transitionStep(U.dalia, 's-012-3', 'VERIFIED_COMPLETE')).toThrowError(/choose to approve it yourself/);
    expect(counts(hub, 'prj-012').verified).toBe(2);
    // Dalia hears about it, with the right words
    expect(hub.ownerOverview(U.dalia).queue.some((q) => q.kind === 'Needs a check in the source system' && /Verify result/.test(q.title))).toBe(true);
    // a (simulated) check passes: now it counts, and Erika's report is still on the record
    hub.recordVerification(U.dalia, 's-012-3', { verifier: 'Shopify product lookup (practice)', entity: '154 SKUs', result: 'CONFIRMED', detail: 'Practice check, not a real Shopify call' });
    hub.transitionStep(U.dalia, 's-012-3', 'VERIFIED_COMPLETE');
    const st = hub.getStep(U.dalia, 's-012-3');
    expect(st.verificationSource).toBe('INDEPENDENT');
    expect(st.humanReported).toMatchObject({ choice: 'COMPLETED', note: 'All listed.', byUid: U.erika }); // the report is not erased
    expect(counts(hub, 'prj-012')).toMatchObject({ verified: 3, reported: 0, label: '3 of 4 verified complete' });
  });

  it('a routine step: the person reports, Dalia signs off (or allows the person to), and the counters say which', async () => {
    const hub = await newHub();
    hub.transitionStep(U.erika, 's-070-4', 'IN_PROGRESS');
    hub.transitionStep(U.erika, 's-070-4', 'REPORTED_COMPLETE');
    expect(counts(hub, 'prj-070').reported).toBe(1);
    expect(() => hub.transitionStep(U.erika, 's-070-4', 'VERIFIED_COMPLETE')).toThrowError(/Only Dalia/);
    expect(() => hub.setStepSignOff(U.erika, 's-070-4', true)).toThrow(PermissionDenied);
    hub.setStepSignOff(U.dalia, 's-070-4', true); // Dalia designates a human sign-off for this routine step
    const s = hub.transitionStep(U.erika, 's-070-4', 'VERIFIED_COMPLETE');
    expect(s.verificationSource).toBe('EMPLOYEE_CONFIRMED');
    expect(() => hub.setStepSignOff(U.dalia, 's-081-2', true)).toThrowError(/real check/); // big steps can never be self-signed
    expect(hub.getJournal(U.dalia, { stepId: 's-070-4', types: ['PLAN_CHANGE'] }).some((e) => /may sign this step off/.test(e.title))).toBe(true);
  });

  it('checked boxes, AI observations and uploads cannot move the verified count', async () => {
    const hub = await newHub();
    const v0 = counts(hub, 'prj-012').verified;
    hub.toggleChecklist(U.erika, 's-012-3', 'c1'); hub.toggleChecklist(U.erika, 's-012-3', 'c2'); hub.toggleChecklist(U.erika, 's-012-3', 'c3');
    expect(counts(hub, 'prj-012').verified).toBe(v0);
    expect(hub.getStep(U.dalia, 's-012-3').status).toBe('NOT_STARTED');
  });
});

describe('3. An Amazon upload stays unverified until it is genuinely confirmed (and the demo never contacts Amazon)', () => {
  it('upload attempts and “Amazon accepted it” are reports only; the project cannot close; only a recorded check verifies', async () => {
    const hub = await newHub();
    await hub.demoReleaseFbaHour();
    const card = hub.outstandingCards(U.erika).find((c) => c.stepId === 's-081-2' && c.cardType !== 'OWNER_REQUEST')!;
    hub.submitDecision(U.erika, card.id, { outcome: 'DONE', idempotencyKey: key() });
    const st = hub.getStep(U.dalia, 's-081-2');
    expect(st.status).toBe('REPORTED_COMPLETE');
    expect(st.verifications).toHaveLength(0);
    expect(counts(hub, 'prj-081').label).toBe('1 of 3 verified complete · 1 reported complete (awaiting check)');
    expect(() => hub.closeProject(U.dalia, 'prj-081')).toThrowError(/never closes by itself/);
    expect(() => hub.transitionStep(U.dalia, 's-081-2', 'VERIFIED_COMPLETE')).toThrowError(/choose to approve it yourself/);
    // a mismatching check does not verify it either
    hub.recordVerification(U.dalia, 's-081-3', { verifier: 'Amazon family lookup (practice)', entity: 'FBA_TY001', result: 'MISMATCH', detail: 'Still under PC078' });
    expect(hub.getStep(U.dalia, 's-081-3').verifications.every((v) => v.result !== 'CONFIRMED')).toBe(true);
    expect(counts(hub, 'prj-081').verified).toBe(1);
  });

  it('the app contains no code that calls Amazon or any outside service', () => {
    const files = import.meta.glob(['../**/*.ts', '../**/*.tsx', '!../test/**'], { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
    expect(Object.keys(files).length).toBeGreaterThan(30);
    const bad = Object.entries(files).filter(([, text]) => /\b(fetch\(|XMLHttpRequest|WebSocket\(|navigator\.sendBeacon)/.test(text)).map(([f]) => f);
    expect(bad).toEqual([]);
  });
});

// ===================================================================== 4 & 11
describe('4. A stale “Not started” tracker plus detected activity becomes a clear confirmation task', () => {
  it('My Work asks Erika to confirm where it stands, and explains why; it does not tell her to start over', async () => {
    const hub = await newHub();
    const na = hub.myNextActions(U.erika);
    const first = na.ready[0];
    expect(first.step.id).toBe('s-012-3');
    expect(first.kind).toBe('CONFIRM_PROGRESS');
    expect(first.why).toMatch(/tracker still says “Not started”/);
    expect(first.why).toMatch(/before you start over/);
    expect(first.cardId).toBeTruthy(); // the review card that lets her confirm
    // after she confirms the outcome, it becomes ordinary work, not a confirmation task
    hub.submitDecision(U.erika, first.cardId!, { outcome: 'WORKING', idempotencyKey: key() });
    const after = hub.myNextActions(U.erika).ready.find((r) => r.step.id === 's-012-3')!;
    expect(after.kind).toBe('WORK');
  });
});

describe('11. Paused, blocked, awaiting-check, dependency-locked and limited-test-gated steps are never “Do this next”', () => {
  const readyIds = (hub: H, uid = U.erika) => hub.myNextActions(uid).ready.map((r) => r.step.id);
  const heldFor = (hub: H, stepId: string) => hub.myNextActions(U.erika).held.find((h) => h.step.id === stepId);

  it('each kind of held-back step is excluded, and the reason is given', async () => {
    const hub = await newHub();
    expect(readyIds(hub)).toContain('s-070-2');
    // dependency-locked
    expect(readyIds(hub)).not.toContain('s-012-4');
    expect(heldFor(hub, 's-012-4')?.code).toBe('DEPENDENCY');
    // blocked
    hub.transitionStep(U.erika, 's-070-2', 'BLOCKED', { reason: 'Waiting for the new Amazon template' });
    expect(readyIds(hub)).not.toContain('s-070-2');
    expect(heldFor(hub, 's-070-2')).toMatchObject({ code: 'BLOCKED' });
    expect(heldFor(hub, 's-070-2')!.reason).toMatch(/Waiting for Dalia/);
    // reported complete, awaiting a check
    hub.transitionStep(U.erika, 's-081-2', 'REPORTED_COMPLETE');
    expect(readyIds(hub)).not.toContain('s-081-2');
    expect(heldFor(hub, 's-081-2')?.code).toBe('AWAITING_CHECK');
    // paused
    hub.pauseProject(U.dalia, 'prj-012', { idempotencyKey: key() });
    expect(readyIds(hub)).not.toContain('s-012-3');
    expect(heldFor(hub, 's-012-3')?.code).toBe('PAUSED');
  });

  it('a limited test that reached its limit holds back its step until Dalia approves more', async () => {
    const hub = await newHub();
    hub.configurePilot(U.dalia, 'prj-012', { stepId: 's-012-3', metricType: 'VERIFIED_LISTINGS', metricLabel: 'verified listings', targetCount: 20, scopeLabel: 'SEO Master copy A, rows MA041–MA060.', skus, idempotencyKey: key() } as never);
    expect(readyIds(hub)).toContain('s-012-3');
    hub.verifyPilotRows(U.dalia, 'prj-012', skus, 'Practice check');
    expect(hub.getProject(U.dalia, 'prj-012').pilot!.status).toBe('TARGET_REACHED');
    expect(readyIds(hub)).not.toContain('s-012-3');
    expect(heldFor(hub, 's-012-3')?.code).toBe('PILOT_GATED');
    hub.approveNextBatch(U.dalia, 'prj-012', { targetCount: 40, skus: [...skus, 'MA061'], idempotencyKey: key() });
    expect(readyIds(hub)).toContain('s-012-3');
  });

  it('ordering: Dalia’s requests first, then confirmation tasks, then due dates, then priority', async () => {
    const hub = await newHub();
    const order = hub.myNextActions(U.erika).ready.map((r) => r.step.id);
    expect(order[0]).toBe('s-012-3');       // confirm stale progress first
    const dues = hub.myNextActions(U.erika).ready.slice(1).map((r) => r.step.dueAt ?? '9');
    expect([...dues].sort()).toEqual(dues);  // then earliest due date
    const req = hub.createUpdateRequest(U.dalia, { projectId: 'prj-070', stepId: 's-070-2', question: 'Status?', idempotencyKey: key() });
    expect(hub.outstandingCards(U.erika).some((c) => c.updateRequestId === req.id)).toBe(true); // requests live in the cards list shown above the next step
  });
});

// ===================================================================== 5
describe('5. Pausing, scheduled resuming, reminders, date changes and capped pilots behave distinctly and keep everything', () => {
  it('indefinite, automatic, reminder-only, edited and cancelled schedules; completed work, files, journal and notes survive', async () => {
    const hub = await newHub();
    const keep = () => JSON.stringify({ steps: hub.state.steps.map((s) => [s.id, s.status, s.humanReported?.note, s.checklist.map((c) => c.done)]), res: hub.state.resourceLinks.length, journal: hub.state.projectEvents.length });
    hub.sendProactiveUpdate(U.erika, { projectId: 'prj-070', stepId: 's-070-2', choice: 'IN_PROGRESS', note: 'Half way there.', idempotencyKey: key() });
    const base = JSON.parse(keep());

    // a) indefinite: nothing happens by itself, however much time passes
    hub.pauseProject(U.dalia, 'prj-070', { reasonCode: 'WAITING', idempotencyKey: key() });
    hub.demoAdvanceToDate('2026-12-31');
    expect(hub.getProject(U.dalia, 'prj-070').pause!.isPaused).toBe(true);

    // b) automatic: resumes once on its date; retries add nothing
    hub.changePauseSchedule(U.dalia, 'prj-070', { mode: 'AUTOMATIC_ON_DATE', resumeDateLocal: '2027-01-05', idempotencyKey: key() });
    hub.demoAdvanceToDate('2027-01-04');
    expect(hub.getProject(U.dalia, 'prj-070').pause!.isPaused).toBe(true);
    hub.demoAdvanceToDate('2027-01-05'); hub.processSchedules(); hub.processSchedules();
    expect(hub.getProject(U.dalia, 'prj-070').pause!.isPaused).toBe(false);
    expect(hub.listNotifications(U.erika).filter((n) => n.type === 'PROJECT_RESUMED' && n.projectId === 'prj-070')).toHaveLength(1);
    expect(hub.getJournal(U.dalia, { projectId: 'prj-070', types: ['PROJECT_RESUMED'] })).toHaveLength(1);

    // c) reminder-only: asks Dalia once, never activates
    hub.pauseProject(U.dalia, 'prj-012', { mode: 'REMIND_ON_DATE', resumeDateLocal: '2027-01-10', idempotencyKey: key() });
    hub.demoAdvanceToDate('2027-01-10'); hub.processSchedules();
    expect(hub.getProject(U.dalia, 'prj-012').pause!.isPaused).toBe(true);
    expect(hub.listNotifications(U.dalia).filter((n) => n.type === 'RESUME_REMINDER' && n.projectId === 'prj-012')).toHaveLength(1);

    // d) edit, then cancel the date: the old date no longer does anything
    const v = hub.getProject(U.dalia, 'prj-012').pause!.scheduleVersion;
    hub.changePauseSchedule(U.dalia, 'prj-012', { mode: 'AUTOMATIC_ON_DATE', resumeDateLocal: '2027-02-01', expectedScheduleVersion: v, idempotencyKey: key() });
    expect(hub.getProject(U.dalia, 'prj-012').pause!.scheduleVersion).toBe(v + 1);
    hub.changePauseSchedule(U.dalia, 'prj-012', { mode: 'MANUAL', idempotencyKey: key() });
    hub.demoAdvanceToDate('2027-02-02');
    expect(hub.getProject(U.dalia, 'prj-012').pause!.isPaused).toBe(true);

    // nothing was lost
    const now = JSON.parse(keep());
    expect(now.steps).toEqual(base.steps);
    expect(now.res).toBe(base.res);
    expect(now.journal).toBeGreaterThan(base.journal); // only added to
    expect(hub.getStep(U.dalia, 's-070-2').humanReported?.note).toBe('Half way there.');
  });

  it('a capped pilot is not widened by a date or an AI guess: expanding needs Dalia', async () => {
    const hub = await newHub();
    hub.configurePilot(U.dalia, 'prj-012', { stepId: 's-012-3', metricType: 'VERIFIED_LISTINGS', metricLabel: 'verified listings', targetCount: 20, scopeLabel: 'rows MA041–MA060', skus, idempotencyKey: key() } as never);
    expect(() => hub.recordPilotRow(U.erika, 'prj-012', 'MA061', 'TRIED', null, null)).toThrowError(/Ask Dalia to approve more first/);
    expect(() => hub.recordPilotRow(U.erika, 'prj-012', skus[0], 'VERIFIED', null, null)).toThrowError(/Only a check in the source system, or Dalia/);
    hub.verifyPilotRows(U.dalia, 'prj-012', skus, 'Practice check');
    hub.pauseProject(U.dalia, 'prj-012', { mode: 'AUTOMATIC_ON_DATE', resumeDateLocal: '2027-03-01', idempotencyKey: key() });
    hub.demoAdvanceToDate('2027-03-01');
    expect(hub.getProject(U.dalia, 'prj-012').pause!.isPaused).toBe(false);                    // the project resumed on its date...
    expect(hub.getProject(U.dalia, 'prj-012').pilot!.status).toBe('TARGET_REACHED');           // ...but the test was not widened
    expect(() => hub.recordPilotRow(U.erika, 'prj-012', 'MA061', 'TRIED', null, null)).toThrowError(/Ask Dalia/);
    expect(() => hub.approveNextBatch(U.erika, 'prj-012', { targetCount: 40, skus, idempotencyKey: key() })).toThrow(PermissionDenied);
    hub.approveNextBatch(U.dalia, 'prj-012', { targetCount: 40, skus: [...skus, 'MA061'], idempotencyKey: key() });
    expect(hub.getProject(U.dalia, 'prj-012').pilot!.status).toBe('NEXT_BATCH_APPROVED');
  });

  it('employees are told what a pause means: that it is paused, why, what is still allowed, and what happens next', async () => {
    const hub = await newHub();
    hub.pauseProject(U.dalia, 'prj-070', { reasonCode: 'HIGHER_PRIORITY', mode: 'AUTOMATIC_ON_DATE', resumeDateLocal: '2027-01-05', allowedWork: 'Only fix errors in listings that are already live.', idempotencyKey: key() });
    const p = hub.getProject(U.erika, 'prj-070');
    expect(p.pause).toMatchObject({ isPaused: true, reasonCode: 'HIGHER_PRIORITY', allowedWork: 'Only fix errors in listings that are already live.', resumeDateLocal: '2027-01-05' });
    expect(hub.listNotifications(U.erika).some((n) => n.type === 'PROJECT_PAUSED' && /start again by itself/.test(n.preview))).toBe(true);
  });
});

// ===================================================================== 6 & 12
describe('6. An owner request reaches Erika, survives navigation, and Dalia gets one reply with the right link', () => {
  it('Requested → Seen → Responded, overdue when late, no duplicates, and it survives a reload', async () => {
    let hub = await newHub();
    const req = hub.createUpdateRequest(U.dalia, { projectId: 'prj-012', stepId: 's-012-3', question: 'Did the first draft work?', dueAt: '2026-10-16T22:00:00.000Z', idempotencyKey: key() });
    expect(hub.requestStage(req)).toBe('REQUESTED');
    const card = hub.outstandingCards(U.erika).find((c) => c.updateRequestId === req.id)!;
    expect(card.title).toMatch(/Update requested by Dalia/);
    // she navigates away and back, and the page is reloaded: it is still there
    hub.startReview(U.erika, card.id);
    expect(hub.requestStage(req)).toBe('SEEN');
    hub = reload(hub);
    expect(hub.outstandingCards(U.erika).some((c) => c.updateRequestId === req.id)).toBe(true);
    const req2 = hub.state.updateRequests.find((r) => r.id === req.id)!;
    expect(hub.requestStage(req2)).toBe('SEEN');
    // late with no answer: overdue, and Dalia is shown it
    hub.demoAdvanceToDate('2026-10-17');
    expect(hub.requestStage(req2)).toBe('OVERDUE');
    expect(hub.ownerOverview(U.dalia).queue.some((q) => q.kind === 'Overdue answer')).toBe(true);
    // she answers; Dalia gets exactly one reply, linked to the exact step and response
    const input = { action: 'SEND_STATUS' as const, statusAnswer: 'NEED_CLARIFICATION' as const, note: 'Which SEO sheet?', idempotencyKey: 'reply-1' };
    hub.submitDecision(U.erika, card.id, input); hub.submitDecision(U.erika, card.id, input); hub.submitDecision(U.erika, card.id, input);
    expect(hub.requestStage(req2)).toBe('RESPONDED');
    const notes = hub.listNotifications(U.dalia).filter((n) => n.senderUid === U.erika && n.projectId === 'prj-012');
    expect(notes).toHaveLength(1);
    expect(notes[0].deepLink).toMatch(/^\/projects\/prj-012\/steps\/s-012-3\?response=resp-/);
    expect(hub.getJournal(U.dalia, { stepId: 's-012-3', types: ['UPDATE_RESPONSE'] })).toHaveLength(1);
    expect(hub.ownerOverview(U.dalia).queue.some((q) => q.kind === 'Overdue answer')).toBe(false);
  });

  it('asking the same thing twice does not create a second card or notification; a reply and an unsolicited update are told apart', async () => {
    const hub = await newHub();
    const a = hub.createUpdateRequest(U.dalia, { projectId: 'prj-070', stepId: 's-070-2', question: 'Status?', idempotencyKey: key() });
    const b = hub.createUpdateRequest(U.dalia, { projectId: 'prj-070', stepId: 's-070-2', question: 'Status?', idempotencyKey: key() });
    expect(b.id).toBe(a.id);
    expect(hub.outstandingCards(U.erika).filter((c) => c.updateRequestId === a.id)).toHaveLength(1);
    expect(hub.listNotifications(U.erika).filter((n) => n.type === 'OWNER_UPDATE_REQUEST' && n.projectId === 'prj-070')).toHaveLength(1);
    // reply
    const card = hub.outstandingCards(U.erika).find((c) => c.updateRequestId === a.id)!;
    hub.submitDecision(U.erika, card.id, { action: 'SEND_STATUS', statusAnswer: 'IN_PROGRESS', note: 'working', idempotencyKey: key() });
    // unsolicited
    hub.sendProactiveUpdate(U.erika, { projectId: 'prj-070', stepId: 's-070-5', choice: 'NOT_STARTED', note: 'FYI', idempotencyKey: key() });
    const types = hub.listNotifications(U.dalia).map((n) => n.type);
    expect(types).toContain('EMPLOYEE_RESPONSE');
    expect(types).toContain('EMPLOYEE_UPDATE');
    expect(hub.getJournal(U.dalia, { projectId: 'prj-070', types: ['UPDATE_RESPONSE'] })).toHaveLength(1);
    expect(hub.getJournal(U.dalia, { projectId: 'prj-070', types: ['PROACTIVE_UPDATE'] })).toHaveLength(1);
  });
});

describe('12. Repeated clicks and reloads never duplicate requests, approvals, resumes or journal events', () => {
  it('each of them is safe to repeat, even across a reload', async () => {
    let hub = await newHub();
    const inputs = { req: key('r'), appr: key('a'), pause: key('p') };
    const doAll = () => {
      hub.createUpdateRequest(U.dalia, { projectId: 'prj-070', stepId: 's-070-2', question: 'Status?', idempotencyKey: inputs.req });
      hub.submitForApproval(U.erika, 'r-seo-a', { version: 'rev 41', idempotencyKey: inputs.appr });
      hub.approveVersion(U.dalia, 'r-seo-a', 'rev 41');
      if (!hub.getProject(U.dalia, 'prj-044').pause?.isPaused) hub.pauseProject(U.dalia, 'prj-044', { mode: 'AUTOMATIC_ON_DATE', resumeDateLocal: '2026-10-20', idempotencyKey: inputs.pause });
      hub.demoAdvanceToDate('2026-10-20'); hub.processSchedules();
    };
    doAll(); doAll();
    hub = reload(hub);
    doAll();
    expect(hub.state.updateRequests.filter((r) => r.projectId === 'prj-070')).toHaveLength(1);
    expect(hub.outstandingCards(U.erika).filter((c) => c.cardType === 'OWNER_REQUEST' && c.projectId === 'prj-070')).toHaveLength(1);
    expect(hub.getAudit(U.dalia).filter((a) => a.action === 'APPROVE_RESOURCE_VERSION' && a.entityId === 'r-seo-a')).toHaveLength(1);
    expect(hub.getJournal(U.dalia, { projectId: 'prj-012', types: ['RESOURCE'] }).filter((e) => /approved for team use/i.test(e.title))).toHaveLength(1);
    expect(hub.getJournal(U.dalia, { projectId: 'prj-044', types: ['PROJECT_RESUMED'] })).toHaveLength(1);
    expect(hub.listNotifications(U.arantza).filter((n) => n.type === 'PROJECT_RESUMED' && n.projectId === 'prj-044')).toHaveLength(1);
  });
});

// ===================================================================== 7
describe('7. SIMULATED TEST ONLY: the AI and review flow never blocks a clock action (no live clock-in is touched)', () => {
  it('with the AI, the log feed, and a full review queue all down, clocking out and in still works and is recorded', async () => {
    const hub = await newHub();
    hub.demoToggle('aiOutage', true); hub.demoToggle('logSyncOutage', true);
    expect(hub.outstandingCards(U.erika).length).toBeGreaterThan(0);
    const out = hub.clockOut(U.erika, key());
    expect(out.shift?.clockOutAt).not.toBeNull();
    const back = hub.clockIn(U.erika, key());
    expect(back.shift.clockOutAt).toBeNull();
    // the unfinished cards simply wait; answering while clocked out is a paid-work rule, not a clock block
    hub.clockOut(U.erika, key());
    expect(hub.outstandingCards(U.erika).length).toBeGreaterThan(0);
    expect(() => hub.clockIn(U.erika, key())).not.toThrow();
  });
});

// ===================================================================== 8
describe('8. Resource actions are honest about what kind of location each file has', () => {
  it('only a verified link can be opened; paths are copied; scripts show where they live; unknowns say so', async () => {
    const hub = await newHub();
    for (const r of hub.state.resources) {
      const a = resourceActions(r);
      expect(a.open, r.label).toBe(!!r.canonicalUrl && r.linkState === 'VERIFIED');
      if (a.open) expect(r.canonicalUrl, r.label).toBeTruthy();                 // never a fake link
      if (a.copyPath) expect(r.normalizedPath, r.label).toBeTruthy();
      if (a.unknown) expect(!r.canonicalUrl || r.linkState !== 'VERIFIED').toBe(true);
      if (r.type === 'SCRIPT') expect(r.installPath ?? r.canonicalUrl, r.label).toBeDefined();
    }
    const get = (id: string) => hub.state.resources.find((r) => r.id === id)!;
    expect(resourceActions(get('r-sop-shopify')).open).toBe(true);
    expect(resourceActions(get('r-images'))).toMatchObject({ open: false, copyPath: true });
    expect(resourceActions(get('r-lister'))).toMatchObject({ open: false, installInfo: true });
    expect(get('r-lister').installPath).toMatch(/Do not move it/);
    hub.setResourceLocation(U.erika, 'r-lister', 'https://example.test/x');
    expect(get('r-lister').canonicalUrl).toBeFalsy(); // we never turn typed text into a link
    expect(resourceActions(get('r-lister')).open).toBe(false);
  });
});

// ===================================================================== 9
describe('9. Private projects and financials stay out of reach for employees by every ordinary route', () => {
  it('lists, search, filters, direct record access, journals, files, alerts and the new next-step and card methods', async () => {
    const hub = await newHub();
    expect(hub.listProjects(U.erika).some((p) => p.id === 'prj-priv')).toBe(false);
    for (const q of ['private', 'planning', 'P-D01', 'financial', 'scenarios', 'next-quarter']) {
      const hits = JSON.stringify(hub.searchAll(U.erika, q));
      expect(hits, q).not.toMatch(/prj-priv|s-priv|r-private|Private planning notes|financial scenarios|P-D01/);
    }
    expect(() => hub.getProject(U.erika, 'prj-priv')).toThrow(PermissionDenied);
    expect(() => hub.projectCard(U.erika, 'prj-priv')).toThrow(PermissionDenied);
    expect(() => hub.getStep(U.erika, 's-priv-2')).toThrow(PermissionDenied);
    expect(() => hub.getJournal(U.erika, { projectId: 'prj-priv' })).toThrow(PermissionDenied);
    expect(() => hub.projectSteps(U.erika, 'prj-priv')).toThrow(PermissionDenied);
    expect(() => hub.createUpdateRequest(U.erika, { projectId: 'prj-priv', idempotencyKey: key() })).toThrow(PermissionDenied);
    expect(() => hub.approveVersion(U.erika, 'r-private-plan', 'x')).toThrow(PermissionDenied);
    expect(() => hub.selectWorkingVersion(U.erika, 'r-private-plan')).toThrow(PermissionDenied);
    expect(hub.listResources(U.erika).some((r) => r.resource.id === 'r-private-plan')).toBe(false);
    expect(hub.myNextActions(U.erika).ready.concat(hub.myNextActions(U.erika) as never).every((r) => !JSON.stringify(r).includes('s-priv'))).toBe(true);
    expect(hub.projectCounts(U.erika).private).toBe(0);
    for (const fn of [() => hub.inboxSummary(U.erika), () => hub.ownerOverview(U.erika), () => hub.pendingApprovals(U.erika), () => hub.otherWork(U.erika)]) expect(fn).toThrow(PermissionDenied);
    const blob = JSON.stringify([hub.listNotifications(U.erika), hub.getJournal(U.erika, {}), hub.listProjects(U.erika), hub.outstandingCards(U.erika)]);
    expect(blob).not.toMatch(/prj-priv|P-D01|financial scenarios|ROI|margin|profit/i);
  });
});

// ===================================================================== role / action matrix
describe('Role/action matrix (also documented in docs/role-action-matrix.md)', () => {
  type Who = 'owner' | 'member' | 'outsider';
  const ids: Record<Who, string> = { owner: U.dalia, member: U.erika, outsider: U.arantza };
  const allowed = (fn: () => unknown) => { try { fn(); return true; } catch { return false; } };
  const cases: [string, (hub: H, uid: string) => unknown, Record<Who, boolean>][] = [
    ['select a working version', (h, u) => h.selectWorkingVersion(u, 'r-seo-a', 'rev 41'), { owner: true, member: true, outsider: false }],
    ['submit a version for approval', (h, u) => h.submitForApproval(u, 'r-seo-a', { version: 'rev 41', idempotencyKey: key() }), { owner: true, member: true, outsider: false }],
    ['approve a version for team use', (h, u) => h.approveVersion(u, 'r-seo-a', 'rev 41'), { owner: true, member: false, outsider: false }],
    ['pause a project', (h, u) => h.pauseProject(u, 'prj-012', { idempotencyKey: key() }), { owner: true, member: false, outsider: false }],
    ['ask for an update', (h, u) => h.createUpdateRequest(u, { projectId: 'prj-012', idempotencyKey: key() }), { owner: true, member: false, outsider: false }],
    ['report a step finished', (h, u) => h.transitionStep(u, 's-012-3', 'REPORTED_COMPLETE'), { owner: true, member: true, outsider: false }],
    ['mark a step verified complete', (h, u) => { h.transitionStep(U.erika, 's-070-4', 'IN_PROGRESS'); h.transitionStep(U.erika, 's-070-4', 'REPORTED_COMPLETE'); return h.transitionStep(u, 's-070-4', 'VERIFIED_COMPLETE'); }, { owner: true, member: false, outsider: false }],
    ['record a check in the source system', (h, u) => h.recordVerification(u, 's-012-3', { verifier: 'x', entity: 'y', result: 'CONFIRMED', detail: 'z' }), { owner: true, member: false, outsider: false }],
    ['approve the next batch of a limited test', (h, u) => { h.configurePilot(U.dalia, 'prj-012', { stepId: 's-012-3', metricType: 'VERIFIED_LISTINGS', metricLabel: 'x', targetCount: 20, scopeLabel: 'x', skus, idempotencyKey: key() } as never); h.verifyPilotRows(U.dalia, 'prj-012', skus, 'x'); return h.approveNextBatch(u, 'prj-012', { targetCount: 40, skus, idempotencyKey: key() }); }, { owner: true, member: false, outsider: false }],
    ['edit a project description', (h, u) => h.setProjectDescription(u, 'prj-012', 'x'), { owner: true, member: true, outsider: false }],
    ['allow self sign-off on a routine step', (h, u) => h.setStepSignOff(u, 's-070-4', true), { owner: true, member: false, outsider: false }],
    ['open the owner dashboard', (h, u) => h.ownerOverview(u), { owner: true, member: false, outsider: false }],
    ['read the private project', (h, u) => h.getProject(u, 'prj-priv'), { owner: true, member: false, outsider: false }],
  ];
  for (const [name, fn, want] of cases) {
    it(`${name}: owner ${want.owner ? 'yes' : 'no'}, person on the project ${want.member ? 'yes' : 'no'}, person not on it ${want.outsider ? 'yes' : 'no'}`, async () => {
      for (const who of ['owner', 'member', 'outsider'] as Who[]) {
        const hub = await newHub();
        expect(allowed(() => fn(hub, ids[who])), `${name} as ${who}`).toBe(want[who]);
      }
    });
  }
});

// ===================================================================== 13
describe('13. Existing features still work', () => {
  it('daily reviews, print statistics, AI recommendations, checklists, notifications and history all respond', async () => {
    const hub = await newHub();
    expect(hub.outstandingCards(U.erika).length).toBeGreaterThan(0);                          // daily reviews
    expect(hub.weeklyPrintReport(U.dalia).printers.length).toBeGreaterThan(0);                // print team, weekly owner analysis
    expect(() => hub.weeklyPrintReport(U.erika)).toThrow(PermissionDenied);
    expect(hub.inboxSummary(U.dalia).needsDecision).toBeGreaterThan(0);                       // AI recommendations
    const before = hub.getStep(U.erika, 's-012-3').checklist[0].done;
    hub.toggleChecklist(U.erika, 's-012-3', 'c1');                                            // checklists
    expect(hub.getStep(U.erika, 's-012-3').checklist[0].done).toBe(!before);
    expect(hub.listNotifications(U.dalia).length).toBeGreaterThan(0);                         // notifications
    expect(hub.getJournal(U.dalia, { projectId: 'prj-012' }).length).toBeGreaterThanOrEqual(3);      // history
    expect(hub.searchAll(U.dalia, 'FBA').length).toBeGreaterThan(0);                          // search
  });
});
