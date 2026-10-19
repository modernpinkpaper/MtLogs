import { describe, expect, it } from 'vitest';
import { newHub, key, U } from './helpers';
import { PermissionDenied } from '../server/errors';
import { resourceActions, resourceApproval } from '../domain/resourceView';
import { outcomeEffect, plainToolName, reviewKind, reviewSpec } from '../domain/reviewKinds';

const cardFor = (hub: Awaited<ReturnType<typeof newHub>>, stepId: string) => hub.outstandingCards(U.erika).find((c) => c.stepId === stepId && c.cardType !== 'OWNER_REQUEST')!;

describe('1. Review cards ask about the real outcome, not only whether the AI saw it', () => {
  it('the Shopify test card asks a specific question and offers outcome answers', async () => {
    const hub = await newHub();
    const card = cardFor(hub, 's-012-3');
    const f = hub.cardFindings(U.erika, card.id)[0];
    const step = hub.getStep(U.erika, 's-012-3');
    const tool = hub.stepResources(U.erika, 's-012-3').find((x) => x.link.role === 'AUTOMATION_TOOL')?.resource.label;
    expect(reviewKind(f, step)).toBe('AUTOMATION_TEST');
    const spec = reviewSpec(f, step, tool);
    expect(spec.question).toBe('Did you test the Shopify Lister today?');
    expect(spec.evidence).toMatch(/couldn.t confirm whether it created a listing/);
    expect(spec.choices.map((c) => c.label)).toEqual([
      'Completed the test successfully', 'Tested it, but something went wrong', 'In progress', 'I didn’t work on this', 'The AI misunderstood what I was doing', 'I’m not sure / Answer later',
    ]);
    expect(plainToolName('MPP Shopify Lister (Tampermonkey)')).toBe('Shopify Lister');
  });

  it('Erika reports a passed test: it is recorded as her report, the step is in progress (not done), and nothing is verified', async () => {
    const hub = await newHub();
    const card = cardFor(hub, 's-012-3');
    hub.submitDecision(U.erika, card.id, { outcome: 'DONE', note: 'Draft showed up in Shopify.', idempotencyKey: key() });
    const step = hub.getStep(U.dalia, 's-012-3');
    expect(step.status).toBe('IN_PROGRESS'); // a test is not the whole step
    expect(['REPORTED_COMPLETE', 'VERIFIED_COMPLETE']).not.toContain(step.status);
    expect(step.verifications).toHaveLength(0);
    expect(step.verificationSource).not.toBe('INDEPENDENT');
    expect(step.humanReported?.outcome).toBe('DONE');
    expect(step.humanReported?.outcomeText).toMatch(/test worked/);
    const dec = hub.state.reviewDecisions.find((d) => d.cardId === card.id)!;
    expect(dec.outcome).toBe('DONE');
    const j = hub.getJournal(U.dalia, { stepId: 's-012-3', types: ['EMPLOYEE_REVIEW'] })[0];
    expect(j.summary).toMatch(/reported the test worked/);
    expect(j.summary).toMatch(/not been checked in the source system/);
    expect(hub.state.findings.find((f) => f.id === card.findingIds[0])!.status).toBe('CONFIRMED');
  });

  it('a problem tells Dalia, with Erika’s own words', async () => {
    const hub = await newHub();
    const card = cardFor(hub, 's-012-3');
    hub.submitDecision(U.erika, card.id, { outcome: 'PROBLEM', note: 'Price was empty.', idempotencyKey: key() });
    const n = hub.state.notifications.find((x) => x.recipientUid === U.dalia && x.type === 'BLOCKER' && /ran into a problem/.test(x.title))!;
    expect(n).toBeTruthy();
    expect(n.title).toMatch(/Shopify listings/);
    expect(n.preview).toBe('Price was empty.');
    expect(hub.getStep(U.dalia, 's-012-3').status).toBe('IN_PROGRESS');
  });
});

describe('2. Partial progress never completes the project', () => {
  it('“uploaded, haven’t seen the result” stays unverified and in progress, and the project cannot close', async () => {
    const hub = await newHub();
    await hub.demoReleaseFbaHour();
    const card = cardFor(hub, 's-081-2');
    const f = hub.cardFindings(U.erika, card.id)[0];
    expect(reviewKind(f, hub.getStep(U.erika, 's-081-2'))).toBe('AMAZON_UPLOAD');
    hub.submitDecision(U.erika, card.id, { outcome: 'DONE_PART', idempotencyKey: key() });
    expect(hub.getStep(U.dalia, 's-081-2').status).toBe('IN_PROGRESS');
    expect(hub.getStep(U.dalia, 's-081-3').status).toBe('NOT_STARTED');
    expect(() => hub.closeProject(U.dalia, 'prj-081')).toThrowError(/never closes by itself/);
  });

  it('6. “Amazon accepted it” is only her report: no verification exists until a real check is recorded', async () => {
    const hub = await newHub();
    await hub.demoReleaseFbaHour();
    const card = cardFor(hub, 's-081-2');
    hub.submitDecision(U.erika, card.id, { outcome: 'DONE', idempotencyKey: key() });
    const step = hub.getStep(U.dalia, 's-081-2');
    expect(step.status).toBe('REPORTED_COMPLETE'); // reported, never verified
    expect(step.verifications).toHaveLength(0);
    expect(step.verificationSource).not.toBe('INDEPENDENT');
    expect(step.humanReported?.outcomeText).toMatch(/not been checked in Seller Central/);
    expect(hub.getStep(U.dalia, 's-081-3').status).toBe('NOT_STARTED');
    expect(() => hub.closeProject(U.dalia, 'prj-081')).toThrowError(/never closes by itself/);
    // now a real check arrives
    hub.recordVerification(U.dalia, 's-081-3', { verifier: 'Amazon family lookup', entity: 'FBA_TY001 → PC107', result: 'CONFIRMED', detail: 'Child of PC107' });
    expect(hub.getStep(U.dalia, 's-081-3').verifications).toHaveLength(1);
  });

  it('the answer rules are plain functions: a passed test is progress, a finished file is reported, a paused-project answer changes nothing', () => {
    expect(outcomeEffect('AUTOMATION_TEST', 'DONE', null).status).toBe('IN_PROGRESS');
    expect(outcomeEffect('FILE_EDIT', 'DONE', { impact: 'ROUTINE' }).status).toBe('COMPLETED');
    expect(outcomeEffect('PAUSED', 'WORKED_PAUSED', null).status).toBeNull();
    expect(outcomeEffect('GENERAL', 'NOT_ME', null).text).toMatch(/does not mean no work happened/);
  });
});

describe('3. Fast corrections: wrong step, wrong person, “not my work”', () => {
  it('wrong step: the activity moves to the right step, and the first guess stays in the history', async () => {
    const hub = await newHub();
    const card = cardFor(hub, 's-012-3');
    hub.submitDecision(U.erika, card.id, { outcome: 'MISREAD', correction: { kind: 'WRONG_STEP', projectId: 'prj-070', stepId: 's-070-2' }, idempotencyKey: key() });
    const f = hub.state.findings.find((x) => x.id === card.findingIds[0])!;
    expect(f.status).toBe('CORRECTED');
    expect(f.stepId).toBe('s-070-2');
    expect(hub.getJournal(U.dalia, { stepId: 's-070-2' }).some((e) => /Activity moved to this step/.test(e.title))).toBe(true);
    expect(f.sourceEventIds.length).toBeGreaterThan(0); // evidence kept
    const dec = hub.state.reviewDecisions.find((d) => d.cardId === card.id)!;
    expect(dec.correction?.kind).toBe('WRONG_STEP');
  });

  it('wrong person: the activity is kept, attribution is disputed, and Dalia is told someone else used that computer', async () => {
    const hub = await newHub();
    const card = cardFor(hub, 's-012-3');
    hub.submitDecision(U.erika, card.id, { outcome: 'MISREAD', correction: { kind: 'WRONG_PERSON' }, idempotencyKey: key() });
    const f = hub.state.findings.find((x) => x.id === card.findingIds[0])!;
    expect(f.attributionDisputed).toBe(true);
    expect(f.status).toBe('NOT_MINE');
    expect(f.sourceEventIds.length).toBeGreaterThan(0);
    expect(hub.state.notifications.some((n) => n.recipientUid === U.dalia && /someone else used that computer/.test(n.title))).toBe(true);
  });

  it('“I didn’t work on this” is never turned into “no work happened”', async () => {
    const hub = await newHub();
    const card = cardFor(hub, 's-012-3');
    hub.submitDecision(U.erika, card.id, { outcome: 'NOT_ME', idempotencyKey: key() });
    const j = hub.getJournal(U.dalia, { stepId: 's-012-3', types: ['EMPLOYEE_REVIEW'] })[0];
    expect(j.summary).toMatch(/does not mean no work happened/);
    expect(hub.getStep(U.dalia, 's-012-3').status).toBe('NOT_STARTED'); // unchanged
    expect(hub.state.events.length).toBeGreaterThan(0);
  });

  it('a wrong-step fix cannot move work onto a project the person is not on', async () => {
    const hub = await newHub();
    const card = cardFor(hub, 's-012-3');
    expect(() => hub.submitDecision(U.erika, card.id, { outcome: 'MISREAD', correction: { kind: 'WRONG_STEP', projectId: 'prj-044', stepId: 's-044-1' }, idempotencyKey: key() })).toThrow(PermissionDenied);
  });
});

describe('4. Two-way update requests, with “I need clarification”', () => {
  it('Dalia asks, Erika answers “I need clarification” with a note, Dalia is notified in the app and it is in the journal', async () => {
    const hub = await newHub();
    const req = hub.createUpdateRequest(U.dalia, { projectId: 'prj-012', stepId: 's-012-3', question: 'Did the first draft work?', idempotencyKey: key() });
    const card = hub.listReviewCards(U.erika).find((c) => c.updateRequestId === req.id)!;
    expect(card.explanatoryText).toMatch(/first draft/);
    hub.submitDecision(U.erika, card.id, { action: 'SEND_STATUS', statusAnswer: 'NEED_CLARIFICATION', note: 'Which SEO sheet should I use?', idempotencyKey: key() });
    const n = hub.state.notifications.find((x) => x.recipientUid === U.dalia && x.senderUid === U.erika)!;
    expect(n.title).toMatch(/needs clarification|I need clarification/i);
    expect(n.deepLink).toMatch(/\/projects\/prj-012\/steps\/s-012-3\?response=/);
    expect(hub.getJournal(U.dalia, { stepId: 's-012-3', types: ['UPDATE_RESPONSE'] })).toHaveLength(1);
    expect(hub.getStep(U.dalia, 's-012-3').status).toBe('NOT_STARTED'); // a question never changes progress
  });
});

describe('5. Bulk confirmation only says the activity is accurate', () => {
  it('it never completes or verifies anything, and it refuses big or conflicting steps', async () => {
    const hub = await newHub();
    await hub.demoReleaseFbaHour();
    const before = JSON.stringify(hub.state.steps.map((s) => [s.id, s.status, s.verifications.length]));
    const ids = hub.outstandingCards(U.erika).filter((c) => c.cardType !== 'OWNER_REQUEST').map((c) => c.id);
    const r = hub.bulkConfirm(U.erika, ids, key());
    expect(JSON.stringify(hub.state.steps.map((s) => [s.id, s.status, s.verifications.length]))).toBe(before);
    expect(r.confirmed.length + r.refused.length).toBe(ids.length);
    const amazon = hub.state.findings.find((f) => f.stepId === 's-081-2');
    expect(amazon?.status).not.toBe('CONFIRMED'); // Amazon upload card was refused
    expect(hub.state.reviewDecisions.every((d) => !d.outcome)).toBe(true); // no outcome was invented
  });
});

describe('7–9. Step files are directly usable, with clear approval', () => {
  it('Step 3 shows copies of the SEO Master with no approved version, and “FINAL” in a name does not make one', async () => {
    const hub = await newHub();
    const rs = hub.stepResources(U.erika, 's-012-3').map((x) => x.resource);
    const a = rs.find((r) => r.id === 'r-seo-a')!; const b = rs.find((r) => r.id === 'r-seo-b')!;
    expect(resourceApproval(a, hub.approverUids(a))?.label).toBe('Draft — Still being edited');
    expect(resourceApproval(b, hub.approverUids(b))?.label).toBe('No version chosen yet');
    expect(b.label).toMatch(/FINAL/);
    expect(b.approvedVersion).toBeNull();
  });

  it('a person on the project chooses one copy and it opens directly; someone outside the project cannot; the other copy stays unchosen', async () => {
    const hub = await newHub();
    expect(() => hub.approveVersion(U.arantza, 'r-seo-b', 'rev 12')).toThrow(PermissionDenied);
    hub.approveVersion(U.erika, 'r-seo-b', 'rev 12');
    const rs = hub.stepResources(U.erika, 's-012-3').map((x) => x.resource);
    const b = rs.find((r) => r.id === 'r-seo-b')!; const a = rs.find((r) => r.id === 'r-seo-a')!;
    expect(resourceApproval(b, hub.approverUids(b))?.label).toBe('Chosen version — Use this one');
    expect(resourceActions(b).open).toBe(true);
    expect(resourceApproval(a, hub.approverUids(a))?.label).toBe('Draft — Still being edited');
    expect(hub.getJournal(U.dalia, { projectId: 'prj-012', types: ['RESOURCE'] }).some((e) => /chosen for the project/i.test(e.title))).toBe(true);
  });
  it('8. each kind of resource gets the right control: link, copy path, installation details, or “not confirmed”', async () => {
    const hub = await newHub();
    const get = (id: string) => hub.state.resources.find((r) => r.id === id)!;
    expect(resourceActions(get('r-sop-shopify'))).toMatchObject({ open: true, copyPath: false, unknown: false });
    expect(resourceActions(get('r-images'))).toMatchObject({ open: false, copyPath: true, unknown: false }); // network path: copy, not a link
    expect(resourceActions(get('r-amazon-flat'))).toMatchObject({ open: false, copyPath: true });
    const lister = resourceActions(get('r-lister'));
    expect(lister.installInfo).toBe(true); // installed tool: details, never moved
    expect(lister.open).toBe(false);
    expect(get('r-lister').installPath).toMatch(/Do not move it/);
    const unknown = { ...get('r-lister'), type: 'GOOGLE_DOC' as const, installPath: null, canonicalUrl: null, normalizedPath: null };
    expect(resourceActions(unknown).unknown).toBe(true);
  });

  it('adding a location never invents a link: a path is saved as a path, a link stays “not checked yet”', async () => {
    const hub = await newHub();
    hub.setResourceLocation(U.erika, 'r-lister', 'https://example.test/lister');
    const r = hub.state.resources.find((x) => x.id === 'r-lister')!;
    expect(r.canonicalUrl).toBeNull();
    expect(r.notes).toMatch(/not checked yet/);
    hub.setResourceLocation(U.erika, 'r-lister', 'C:\\Tools\\lister.user.js');
    expect(hub.state.resources.find((x) => x.id === 'r-lister')!.normalizedPath).toBe('C:\\Tools\\lister.user.js');
    expect(() => hub.setResourceLocation(U.arantza, 'r-seo-a', 'C:\\x')).toThrow(PermissionDenied);
  });
});

describe('11. One definition of “active projects”', () => {
  it('Home and Projects use the same counts, and private projects are named separately', async () => {
    const hub = await newHub();
    const c = hub.projectCounts(U.dalia);
    expect(c).toMatchObject({ team: 4, private: 1, active: 5, paused: 0 });
    const ov = hub.ownerOverview(U.dalia).counts;
    expect(ov.team).toBe(c.team); expect(ov.private).toBe(c.private); expect(ov.active).toBe(c.active);
    hub.pauseProject(U.dalia, 'prj-070', { idempotencyKey: key() });
    const c2 = hub.projectCounts(U.dalia);
    expect(c2).toMatchObject({ team: 3, private: 1, paused: 1 });
    expect(hub.ownerOverview(U.dalia).counts.paused).toBe(1);
  });

  it('employees never see a private count, only their own team projects', async () => {
    const hub = await newHub();
    expect(hub.projectCounts(U.erika)).toMatchObject({ team: 3, private: 0 });
    expect(hub.projectCounts(U.arantza)).toMatchObject({ team: 1, private: 0 });
  });
});

describe('2 (Home). Alerts are short, explain why, and keep technical detail behind “technical”', () => {
  it('every alert has a title, a reason and one button; raw diagnostics are not in the title', async () => {
    const hub = await newHub();
    const q = hub.ownerOverview(U.dalia).queue;
    expect(q.length).toBeGreaterThan(0);
    for (const item of q) { expect(item.title.length).toBeGreaterThan(5); expect(item.why.length).toBeGreaterThan(5); expect(item.cta.length).toBeGreaterThan(3); }
    const mismatch = q.find((x) => x.kind === 'Tracker and activity do not match')!;
    expect(mismatch.title).toBe('Shopify listings — Progress needs confirmation');
    expect(mismatch.why).toBe('Erika tested the Shopify Lister, but the project hasn’t been updated.');
    expect(mismatch.cta).toBe('Review progress');
    expect(mismatch.technical?.join(' ')).toMatch(/P-012/);
    const data = q.find((x) => x.kind === 'Data problem')!;
    expect(data.title).toBe('Some computer activity may be missing');
    expect(data.title + data.why).not.toMatch(/sequence|w-pc04/);
    expect(data.technical?.join(' ')).toMatch(/sequence/i); // kept, behind technical details
    for (const item of q) expect(item.title + item.why).not.toMatch(/sequence \d|w-pc\d\d-/);
  });

  it('two or more employee answers become one “updates are ready” alert', async () => {
    const hub = await newHub();
    for (const stepId of ['s-012-3', 's-070-2']) {
      const projectId = hub.getStep(U.dalia, stepId).projectId;
      const req = hub.createUpdateRequest(U.dalia, { projectId, stepId, idempotencyKey: key() });
      const card = hub.listReviewCards(U.erika).find((c) => c.updateRequestId === req.id)!;
      hub.submitDecision(U.erika, card.id, { action: 'SEND_STATUS', statusAnswer: 'IN_PROGRESS', note: 'working', idempotencyKey: key() });
    }
    const q = hub.ownerOverview(U.dalia).queue;
    expect(q.filter((x) => x.kind === 'They answered you')).toHaveLength(1);
    expect(q.find((x) => x.kind === 'They answered you')!.title).toBe('Two employee updates are ready');
  });
});

describe('12–13. Pause, timekeeping and private data survive the new cards', () => {
  it('an answer about a paused project never resumes it', async () => {
    const hub = await newHub();
    hub.pauseProject(U.dalia, 'prj-081', { reasonCode: 'WAITING', idempotencyKey: key() });
    await hub.demoReleaseFbaHour();
    const card = cardFor(hub, 's-081-2');
    const f = hub.cardFindings(U.erika, card.id)[0];
    expect(reviewKind(f, hub.getStep(U.erika, 's-081-2'))).toBe('PAUSED');
    hub.submitDecision(U.erika, card.id, { outcome: 'WORKED_PAUSED', note: 'Dalia asked me to fix one thing.', idempotencyKey: key() });
    expect(hub.getProject(U.dalia, 'prj-081').pause!.isPaused).toBe(true);
    expect(hub.getStep(U.dalia, 's-081-2').status).toBe('IN_PROGRESS');
  });

  it('clock in and out are never blocked by reviews, even when the AI is down', async () => {
    const hub = await newHub();
    hub.demoToggle('aiOutage', true);
    expect(hub.outstandingCards(U.erika).length).toBeGreaterThan(0);
    hub.clockOut(U.erika, key());
    const res = hub.clockIn(U.erika, key());
    expect(res.shift.clockOutAt).toBeNull();
    hub.clockOut(U.erika, key());
    // answering while clocked out is refused (paid work), but deferring is always fine
    const card = hub.outstandingCards(U.erika).find((c) => c.cardType !== 'OWNER_REQUEST')!;
    expect(() => hub.submitDecision(U.erika, card.id, { outcome: 'DONE', idempotencyKey: key() })).toThrowError(/paid work/);
    expect(() => hub.submitDecision(U.erika, card.id, { outcome: 'NOT_SURE', idempotencyKey: key() })).not.toThrow();
  });

  it('employees cannot read the private project card or owner-only financial text in any new alert', async () => {
    const hub = await newHub();
    expect(() => hub.projectCard(U.erika, 'prj-priv')).toThrow(PermissionDenied);
    expect(() => hub.setProjectDescription(U.erika, 'prj-priv', 'x')).toThrow(PermissionDenied);
    expect(() => hub.ownerOverview(U.erika)).toThrow(PermissionDenied);
  });
});

describe('Project description card', () => {
  it('people on the project can write what it is; people who are not on it cannot', async () => {
    const hub = await newHub();
    expect(hub.projectCard(U.erika, 'prj-012').description).toMatch(/fall and Halloween/);
    hub.setProjectDescription(U.erika, 'prj-012', 'New text from Erika.');
    expect(hub.projectCard(U.dalia, 'prj-012').description).toBe('New text from Erika.');
    expect(hub.getJournal(U.dalia, { projectId: 'prj-012', types: ['PLAN_CHANGE'] }).some((e) => /description updated/i.test(e.title))).toBe(true);
    expect(() => hub.setProjectDescription(U.erika, 'prj-044', 'nope')).toThrow(PermissionDenied);
    expect(() => hub.projectCard(U.erika, 'prj-044')).toThrow(PermissionDenied);
    expect(() => hub.setProjectDescription(U.erika, 'prj-012', 'x'.repeat(601))).toThrow(/600/);
  });
});

describe('Log something I did (small tasks the computer did not see)', () => {
  it('a small task is saved, shown to Dalia with who asked, and changes no status', async () => {
    const hub = await newHub();
    const before = JSON.stringify(hub.state.steps.map((s) => [s.id, s.status]));
    const e = hub.logSmallTask(U.erika, { title: 'Updated the listing for MS066', requestedByUid: U.dalia, note: 'Price was wrong', idempotencyKey: key() });
    expect(e.kind).toBe('SMALL_TASK');
    expect(JSON.stringify(hub.state.steps.map((s) => [s.id, s.status]))).toBe(before);
    expect(hub.myWorkLog(U.erika)).toHaveLength(1);
    const row = hub.otherWork(U.dalia).byHand[0];
    expect(row.entry.title).toBe('Updated the listing for MS066');
    expect(row.askedBy).toBe('Dalia');
    expect(row.byName).toBe('Erika');
    expect(hub.myWorkLog(U.arantza)).toHaveLength(0);
  });

  it('attached to a step it appears in that step’s history; double-send makes one entry', async () => {
    const hub = await newHub();
    const input = { title: 'Fixed the SEO text for 3 SKUs', stepId: 's-012-3', idempotencyKey: 'dup-small' };
    hub.logSmallTask(U.erika, input); hub.logSmallTask(U.erika, input);
    expect(hub.myWorkLog(U.erika)).toHaveLength(1);
    const j = hub.getJournal(U.dalia, { stepId: 's-012-3', types: ['EMPLOYEE_REVIEW'] })[0];
    expect(j.summary).toMatch(/Written by the person, not seen by the computer/);
    expect(hub.getStep(U.dalia, 's-012-3').status).toBe('NOT_STARTED');
    expect(hub.otherWork(U.dalia).byHand[0].linkedTo).toMatch(/P-012 · Step 3/);
  });

  it('it is paid work (clock in first), needs a name, and cannot be attached to someone else’s project', async () => {
    const hub = await newHub();
    expect(() => hub.logSmallTask(U.erika, { title: '  ', idempotencyKey: key() })).toThrow(/short name/);
    expect(() => hub.logSmallTask(U.erika, { title: 'x', stepId: 's-044-1', idempotencyKey: key() })).toThrow(PermissionDenied);
    hub.clockOut(U.erika, key());
    expect(() => hub.logSmallTask(U.erika, { title: 'x', idempotencyKey: key() })).toThrow(/paid work/);
  });
});

describe('14. Print-team daily numbers and weekly owner analysis are still separate', () => {
  it('weekly analysis is owner-only; the daily stats are the person’s own', async () => {
    const hub = await newHub();
    expect(() => hub.weeklyPrintReport(U.erika)).toThrow(PermissionDenied);
    expect(hub.weeklyPrintReport(U.dalia).printers.length).toBeGreaterThan(0);
  });
});
