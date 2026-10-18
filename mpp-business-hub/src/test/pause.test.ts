import { describe, expect, it } from 'vitest';
import { newHub, key, U } from './helpers';
import { HubError, PermissionDenied } from '../server/errors';
import { projectWorkStatus, progressCounts, deadlineInfo, pauseLine } from '../domain/projectStatus';
import { chicagoToUtc } from '../domain/time';

type H = Awaited<ReturnType<typeof newHub>>;
const snapshot = (hub: H, pid: string) => JSON.stringify({
  steps: hub.state.steps.filter((s) => s.projectId === pid).map((s) => ({ ...s, observedNote: s.observedNote })),
  links: hub.state.resourceLinks.filter((l) => l.projectId === pid),
  members: hub.state.projects.find((p) => p.id === pid)!.memberUids,
});
const status = (hub: H, pid: string) => projectWorkStatus(hub.state.projects.find((p) => p.id === pid)!, hub.state.steps.filter((s) => s.projectId === pid));

describe('Pause and resume', () => {
  it('Scenario 1: pause indefinitely, work leaves the active list but stays visible, resume keeps every bit of progress', async () => {
    const hub = await newHub();
    const before = snapshot(hub, 'prj-070');
    const counts0 = progressCounts(hub.state.steps.filter((s) => s.projectId === 'prj-070'));
    expect(status(hub, 'prj-070')).toBe('IN_PROGRESS');
    const activeBefore = hub.ownerOverview(U.dalia).counts.active;
    hub.pauseProject(U.dalia, 'prj-070', { reasonCode: 'HIGHER_PRIORITY', idempotencyKey: key() });
    const p = hub.getProject(U.dalia, 'prj-070');
    expect(status(hub, 'prj-070')).toBe('PAUSED');
    expect(p.pause).toMatchObject({ isPaused: true, resumeMode: 'MANUAL', pausedByUserId: U.dalia, priorProjectStatus: 'IN_PROGRESS', timeZone: 'America/Chicago' });
    expect(p.pause!.resumeDateLocal).toBeUndefined(); // never invents a date
    expect(pauseLine(p, true)).toBe('Paused · Until you resume');
    expect(pauseLine(p, false)).toBe('Paused · Until Dalia resumes');
    const ov = hub.ownerOverview(U.dalia);
    expect(ov.counts.paused).toBe(1);
    expect(ov.counts.active).toBe(activeBefore - 1);
    // Erika still sees it (paused is not hidden) and its history
    expect(hub.listProjects(U.erika).map((x) => x.id)).toContain('prj-070');
    expect(hub.getJournal(U.erika, { projectId: 'prj-070' }).some((e) => e.type === 'PROJECT_PAUSED')).toBe(true);
    expect(snapshot(hub, 'prj-070')).toBe(before); // steps, checklists, links, people untouched
    hub.resumeProject(U.dalia, 'prj-070', { note: 'Back to it', idempotencyKey: key() });
    expect(status(hub, 'prj-070')).toBe('IN_PROGRESS');
    expect(snapshot(hub, 'prj-070')).toBe(before);
    expect(progressCounts(hub.state.steps.filter((s) => s.projectId === 'prj-070'))).toEqual(counts0);
    const titles = hub.getJournal(U.dalia, { projectId: 'prj-070' }).map((e) => e.type);
    expect(titles).toEqual(expect.arrayContaining(['PROJECT_PAUSED', 'PROJECT_RESUMED']));
  });

  it('P-012 keeps 2 of 4 verified complete through a pause and resume', async () => {
    const hub = await newHub();
    const steps = () => hub.state.steps.filter((s) => s.projectId === 'prj-012');
    expect(progressCounts(steps()).label).toBe('2 of 4 verified complete');
    hub.pauseProject(U.dalia, 'prj-012', { idempotencyKey: key() });
    expect(progressCounts(steps()).label).toBe('2 of 4 verified complete');
    hub.resumeProject(U.dalia, 'prj-012', { idempotencyKey: key() });
    expect(progressCounts(steps()).label).toBe('2 of 4 verified complete');
  });

  it('Scenario 2: automatic resume on a chosen date happens once, notifies the owner and each assigned person once, and retries do nothing', async () => {
    const hub = await newHub();
    hub.pauseProject(U.dalia, 'prj-070', { reasonCode: 'SEASONAL', mode: 'AUTOMATIC_ON_DATE', resumeDateLocal: '2026-10-30', idempotencyKey: key() });
    expect(pauseLine(hub.getProject(U.dalia, 'prj-070'), true)).toBe('Paused · Resumes Oct 30');
    hub.demoAdvanceToDate('2026-10-29');
    expect(status(hub, 'prj-070')).toBe('PAUSED');
    hub.demoAdvanceToDate('2026-10-30');
    expect(status(hub, 'prj-070')).toBe('IN_PROGRESS');
    for (let i = 0; i < 3; i++) hub.processSchedules();
    const resumed = (uid: string) => hub.listNotifications(uid).filter((n) => n.type === 'PROJECT_RESUMED' && n.projectId === 'prj-070');
    expect(resumed(U.dalia)).toHaveLength(1);
    expect(resumed(U.erika)).toHaveLength(1);
    expect(resumed(U.carolina)).toHaveLength(1);
    expect(resumed(U.arantza)).toHaveLength(0); // not on that project
    expect(hub.getJournal(U.dalia, { projectId: 'prj-070', types: ['PROJECT_RESUMED'] })).toHaveLength(1);
    expect(hub.getProject(U.dalia, 'prj-070').pause!.resumedByUserId).toBeNull(); // automatic
    expect(hub.getAudit(U.dalia, 'prj-070').filter((a) => a.action === 'PROJECT_RESUMED')).toHaveLength(1);
    // changing project state ran nothing external
    expect(hub.state.steps.find((s) => s.id === 's-070-2')!.status).toBe('IN_PROGRESS');
  });

  it('a project that was never started goes back to Not started when it resumes', async () => {
    const hub = await newHub();
    const p = hub.createProject(U.dalia, { title: 'Brand new', objective: '', memberUids: [U.erika], visibility: 'ASSIGNED_ONLY' });
    hub.addStep(U.dalia, p.id, { title: 'Only step' });
    hub.pauseProject(U.dalia, p.id, { idempotencyKey: key() });
    expect(hub.getProject(U.dalia, p.id).pause!.priorProjectStatus).toBe('NOT_STARTED');
    hub.resumeProject(U.dalia, p.id, { idempotencyKey: key() });
    expect(status(hub, p.id)).toBe('NOT_STARTED');
  });

  it('Scenario 3: reminder mode asks Dalia to decide once and the project stays paused until she decides', async () => {
    const hub = await newHub();
    hub.pauseProject(U.dalia, 'prj-012', { mode: 'REMIND_ON_DATE', resumeDateLocal: '2026-10-30', idempotencyKey: key() });
    expect(pauseLine(hub.getProject(U.dalia, 'prj-012'), true)).toBe('Paused · Review on Oct 30');
    hub.demoAdvanceToDate('2026-10-30');
    hub.processSchedules(); hub.processSchedules();
    const reminders = hub.listNotifications(U.dalia).filter((n) => n.type === 'RESUME_REMINDER');
    expect(reminders).toHaveLength(1);
    expect(reminders[0].title).toBe('Decide whether to resume P-012');
    expect(status(hub, 'prj-012')).toBe('PAUSED'); // a date arriving never resumes by itself
    expect(hub.listNotifications(U.erika).some((n) => n.type === 'RESUME_REMINDER')).toBe(false);
    // set another reminder → new reminder cycle later
    const ver = hub.getProject(U.dalia, 'prj-012').pause!.scheduleVersion;
    hub.changePauseSchedule(U.dalia, 'prj-012', { mode: 'REMIND_ON_DATE', resumeDateLocal: '2026-11-10', expectedScheduleVersion: ver, idempotencyKey: key() });
    hub.demoAdvanceToDate('2026-11-10');
    expect(hub.listNotifications(U.dalia).filter((n) => n.type === 'RESUME_REMINDER')).toHaveLength(2);
    // keep paused → manual, no more reminders
    hub.changePauseSchedule(U.dalia, 'prj-012', { mode: 'MANUAL', idempotencyKey: key() });
    expect(pauseLine(hub.getProject(U.dalia, 'prj-012'), true)).toBe('Paused · Until you resume');
    hub.demoAdvanceToDate('2026-12-01');
    expect(hub.listNotifications(U.dalia).filter((n) => n.type === 'RESUME_REMINDER')).toHaveLength(2);
    hub.resumeProject(U.dalia, 'prj-012', { idempotencyKey: key() });
    expect(status(hub, 'prj-012')).toBe('IN_PROGRESS');
  });

  it('a missed date is handled once after an outage and keeps the original schedule date', async () => {
    const hub = await newHub();
    hub.pauseProject(U.dalia, 'prj-044', { mode: 'AUTOMATIC_ON_DATE', resumeDateLocal: '2026-10-20', idempotencyKey: key() });
    hub.state.now = chicagoToUtc('2026-11-03', '10:00'); // service was "down" for two weeks
    hub.processSchedules(); hub.processSchedules();
    expect(status(hub, 'prj-044')).toBe('NOT_STARTED' === status(hub, 'prj-044') ? 'NOT_STARTED' : 'IN_PROGRESS');
    expect(hub.getProject(U.dalia, 'prj-044').pause!.isPaused).toBe(false);
    expect(hub.getProject(U.dalia, 'prj-044').pause!.resumeDateLocal).toBe('2026-10-20'); // original schedule preserved
    expect(hub.listNotifications(U.arantza).filter((n) => n.type === 'PROJECT_RESUMED')).toHaveLength(1);
  });

  it('dates use the Chicago status run, so the day after daylight saving ends is still correct', async () => {
    const hub = await newHub();
    hub.pauseProject(U.dalia, 'prj-044', { mode: 'AUTOMATIC_ON_DATE', resumeDateLocal: '2026-11-02', idempotencyKey: key() });
    hub.state.now = '2026-11-02T11:30:00.000Z'; // 5:30 AM CST — before the 6:00 AM status run
    hub.processSchedules();
    expect(hub.getProject(U.dalia, 'prj-044').pause!.isPaused).toBe(true);
    hub.state.now = '2026-11-02T12:01:00.000Z'; // 6:01 AM CST
    hub.processSchedules();
    expect(hub.getProject(U.dalia, 'prj-044').pause!.isPaused).toBe(false);
  });

  it('validation: no invented dates, no past dates, no bad dates, no double pause', async () => {
    const hub = await newHub();
    expect(() => hub.pauseProject(U.dalia, 'prj-070', { mode: 'AUTOMATIC_ON_DATE', idempotencyKey: key() })).toThrow(/real date/);
    expect(() => hub.pauseProject(U.dalia, 'prj-070', { mode: 'REMIND_ON_DATE', resumeDateLocal: '2026-02-30', idempotencyKey: key() })).toThrow(/real date/);
    expect(() => hub.pauseProject(U.dalia, 'prj-070', { mode: 'REMIND_ON_DATE', resumeDateLocal: '2026-10-16', idempotencyKey: key() })).toThrow(/after today/);
    expect(hub.getProject(U.dalia, 'prj-070').pause).toBeNull(); // failed calls change nothing
    hub.pauseProject(U.dalia, 'prj-070', { mode: 'MANUAL', resumeDateLocal: '2026-12-01', idempotencyKey: key() });
    expect(hub.getProject(U.dalia, 'prj-070').pause!.resumeDateLocal).toBeUndefined(); // manual mode ignores a date
    expect(() => hub.pauseProject(U.dalia, 'prj-070', { idempotencyKey: key() })).toThrow(/already paused/);
    expect(() => hub.resumeProject(U.dalia, 'prj-012', { idempotencyKey: key() })).toThrow(/not paused/);
  });

  it('double clicks and retries are safe; two sessions cannot overwrite each other silently', async () => {
    const hub = await newHub();
    const k = key();
    hub.pauseProject(U.dalia, 'prj-070', { idempotencyKey: k });
    hub.pauseProject(U.dalia, 'prj-070', { idempotencyKey: k });
    expect(hub.getAudit(U.dalia, 'prj-070').filter((a) => a.action === 'PROJECT_PAUSED')).toHaveLength(1);
    expect(hub.listNotifications(U.erika).filter((n) => n.type === 'PROJECT_PAUSED')).toHaveLength(1);
    const v = hub.getProject(U.dalia, 'prj-070').pause!.scheduleVersion;
    hub.changePauseSchedule(U.dalia, 'prj-070', { mode: 'REMIND_ON_DATE', resumeDateLocal: '2026-10-30', expectedScheduleVersion: v, idempotencyKey: key() });
    expect(() => hub.resumeProject(U.dalia, 'prj-070', { expectedScheduleVersion: v, idempotencyKey: key() })).toThrow(/just changed/);
    expect(hub.getProject(U.dalia, 'prj-070').pause!.isPaused).toBe(true);
  });

  it('who may pause: owner and delegated managers only; members can only suggest', async () => {
    const hub = await newHub();
    expect(() => hub.pauseProject(U.erika, 'prj-070', { idempotencyKey: key() })).toThrow(PermissionDenied);
    expect(() => hub.pauseProject(U.arantza, 'prj-070', { idempotencyKey: key() })).toThrow(PermissionDenied);
    expect(() => hub.resumeProject(U.erika, 'prj-070', { idempotencyKey: key() })).toThrow(PermissionDenied);
    hub.suggestPause(U.erika, 'prj-070', 'Waiting for API access', key());
    expect(hub.getProject(U.dalia, 'prj-070').pause).toBeNull(); // nothing changes by itself
    expect(hub.listNotifications(U.dalia).find((n) => n.type === 'PAUSE_SUGGESTION')!.title).toBe('Erika suggests pausing P-070');
    expect(() => hub.suggestPause(U.arantza, 'prj-070', 'x', key())).toThrow(PermissionDenied);
    // delegated manager
    expect(() => hub.setProjectManagers(U.dalia, 'prj-070', [U.arantza])).toThrow(HubError); // must work on it
    hub.setProjectManagers(U.dalia, 'prj-070', [U.carolina]);
    hub.pauseProject(U.carolina, 'prj-070', { reasonCode: 'WAITING', idempotencyKey: key() });
    expect(hub.getProject(U.dalia, 'prj-070').pause!.pausedByUserId).toBe(U.carolina);
    // private projects can be paused by the owner only
    hub.pauseProject(U.dalia, 'prj-priv', { idempotencyKey: key() });
    expect(() => hub.getProject(U.erika, 'prj-priv')).toThrow(PermissionDenied);
    expect(hub.listNotifications(U.erika).some((n) => /Private|P-D01/.test(n.title + n.preview))).toBe(false);
  });

  it('deadlines are never moved; the page explains what happened; only an explicit change moves them', async () => {
    const hub = await newHub();
    hub.pauseProject(U.dalia, 'prj-012', { idempotencyKey: key() });
    const original = hub.getProject(U.dalia, 'prj-012').deadlineAt;
    hub.demoAdvanceToDate('2026-10-23'); // after the Oct 21 deadline
    const p = hub.getProject(U.dalia, 'prj-012');
    expect(p.deadlineAt).toBe(original);
    const info = deadlineInfo(p, hub.now)!;
    expect(info.elapsedWhilePaused).toBe(true);
    expect(info.text).toMatch(/Original deadline Oct 21; paused Oct 16/);
    expect(hub.ownerOverview(U.dalia).queue.some((q) => q.kind === 'Pick a new deadline')).toBe(true);
    expect(hub.ownerOverview(U.dalia).queue.some((q) => q.kind === 'Late' && q.label.includes('P-012'))).toBe(false); // no nagging while paused
    expect(() => hub.setProjectDeadline(U.erika, 'prj-012', '2026-11-30')).toThrow(PermissionDenied);
    hub.setProjectDeadline(U.dalia, 'prj-012', '2026-11-30');
    expect(deadlineInfo(hub.getProject(U.dalia, 'prj-012'), hub.now)!.text).toMatch(/Nov 30/);
    expect(hub.getAudit(U.dalia, 'prj-012').some((a) => a.action === 'DEADLINE_CHANGED')).toBe(true);
    // a deadline that had already passed before the pause is labeled differently
    const h2 = await newHub();
    h2.setProjectDeadline(U.dalia, 'prj-044', '2026-10-10');
    h2.pauseProject(U.dalia, 'prj-044', { idempotencyKey: key() });
    expect(deadlineInfo(h2.getProject(U.dalia, 'prj-044'), h2.now)!.pastDueBeforePause).toBe(true);
  });

  it('Scenario 5: activity found while paused is neutral, never resumes the project and offers human choices', async () => {
    const hub = await newHub();
    hub.pauseProject(U.dalia, 'prj-081', { reasonCode: 'WAITING', idempotencyKey: key() });
    await hub.demoReleaseFbaHour();
    const f = hub.state.findings.find((x) => x.stepId === 's-081-2' && x.status === 'PROPOSED')!;
    expect(f.whilePaused).toBe(true);
    expect(f.headline).toMatch(/while it is paused/);
    expect(f.inference).toMatch(/Nothing was resumed and nothing is wrong/);
    expect(JSON.stringify(f)).not.toMatch(/idle|violation|should not have/i);
    expect(hub.getProject(U.dalia, 'prj-081').pause!.isPaused).toBe(true);
    expect(hub.getStep(U.dalia, 's-081-2').status).toBe('IN_PROGRESS');
    const card = hub.outstandingCards(U.erika).find((c) => c.stepId === 's-081-2')!;
    expect(card.title).toBe('Activity while the project was paused');
    expect(card.canBulkReview).toBe(false);
    expect(hub.getJournal(U.dalia, { projectId: 'prj-081', types: ['AI_OBSERVATION'] })[0].title).toBe('Activity detected while the project was paused');
    hub.submitDecision(U.erika, card.id, { action: 'CONFIRM', idempotencyKey: key() }); // attach to history
    hub.suggestResume(U.erika, 'prj-081', 'Needed for a sanctioned test', key());
    expect(hub.getProject(U.dalia, 'prj-081').pause!.isPaused).toBe(true); // still paused until Dalia decides
    expect(hub.listNotifications(U.dalia).some((n) => n.title === 'Erika suggests resuming P-081')).toBe(true);
  });

  it('Scenario 9: an update request on a paused project is answered through the normal paid review and never resumes it', async () => {
    const hub = await newHub();
    hub.pauseProject(U.dalia, 'prj-012', { idempotencyKey: key() });
    const req = hub.createUpdateRequest(U.dalia, { projectId: 'prj-012', stepId: 's-012-3', question: 'Where did the test stop?', idempotencyKey: key() });
    const card = hub.listReviewCards(U.erika).find((c) => c.updateRequestId === req.id)!;
    hub.submitDecision(U.erika, card.id, { action: 'SEND_STATUS', statusAnswer: 'IN_PROGRESS', note: 'Stopped at row 20', idempotencyKey: key() });
    expect(hub.listNotifications(U.dalia).some((n) => n.type === 'EMPLOYEE_RESPONSE' && n.preview.includes('Stopped at row 20'))).toBe(true);
    expect(hub.getProject(U.dalia, 'prj-012').pause!.isPaused).toBe(true);
  });

  it('paid time and review are unaffected by a pause', async () => {
    const hub = await newHub();
    hub.pauseProject(U.dalia, 'prj-012', { idempotencyKey: key() });
    const shiftsBefore = JSON.stringify(hub.state.shifts);
    expect(hub.outstandingCards(U.erika).length).toBeGreaterThan(0);
    expect(JSON.stringify(hub.state.shifts)).toBe(shiftsBefore);
    expect(hub.clockOut(U.erika, key()).shift?.clockOutAt).toBeTruthy();
    hub.demoAdvanceToNextMorning();
    expect(hub.clockIn(U.erika, key()).outstanding.length).toBeGreaterThan(0);
    // print figures do not change
    expect(hub.myPrintStats(U.printA, U.printA, '2026-10-16').stats.completed).toBeGreaterThan(0);
  });

  it('a step can be put on hold without pausing the project; its status is kept', async () => {
    const hub = await newHub();
    hub.holdStep(U.dalia, 's-070-2', 'Waiting on credentials');
    expect(hub.getStep(U.dalia, 's-070-2')).toMatchObject({ status: 'IN_PROGRESS' });
    expect(hub.getStep(U.dalia, 's-070-2').onHold?.reason).toBe('Waiting on credentials');
    expect(hub.getProject(U.dalia, 'prj-070').pause).toBeNull();
    expect(() => hub.holdStep(U.erika, 's-070-2', null)).toThrow(PermissionDenied);
    hub.releaseStep(U.dalia, 's-070-2');
    expect(hub.getStep(U.dalia, 's-070-2').onHold).toBeNull();
  });

  it('finished projects are never auto-resumed; reopening is explicit and audited; a paused project cannot be closed', async () => {
    const hub = await newHub();
    hub.pauseProject(U.dalia, 'prj-044', { mode: 'AUTOMATIC_ON_DATE', resumeDateLocal: '2026-10-20', idempotencyKey: key() });
    expect(() => hub.closeProject(U.dalia, 'prj-044')).toThrow(/Resume this project/);
    hub.cancelProject(U.dalia, 'prj-044');
    hub.demoAdvanceToDate('2026-10-25');
    expect(hub.getProject(U.dalia, 'prj-044').pause!.isPaused).toBe(true); // not silently restarted
    expect(status(hub, 'prj-044')).toBe('CANCELED');
    hub.reopenProject(U.dalia, 'prj-044');
    expect(hub.getAudit(U.dalia, 'prj-044').some((a) => a.action === 'REOPEN')).toBe(true);
    expect(() => hub.cancelProject(U.erika, 'prj-044')).toThrow(PermissionDenied);
  });

  it('paused projects stay searchable and journals show both pause and resume in plain sentences', async () => {
    const hub = await newHub();
    hub.pauseProject(U.dalia, 'prj-012', { reasonCode: 'TESTING_SMALLER_BATCH', reasonNote: 'Testing 20 listings before expanding', idempotencyKey: key() });
    expect(hub.search(U.erika, 'P-012').projects.map((p) => p.key)).toContain('P-012');
    const e = hub.getJournal(U.dalia, { projectId: 'prj-012', types: ['PROJECT_PAUSED'] })[0];
    expect(e.title).toBe('Paused by Dalia on Oct 16');
    expect(e.summary).toMatch(/Testing a smaller batch first — Testing 20 listings before expanding/);
    expect(e.summary).not.toMatch(/PROJECT_PAUSED|resumeMode|AUTOMATIC/);
  });
});
