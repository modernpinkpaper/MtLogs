import type { HubServer } from './hub';
import { stepLabel } from '../domain/stepLabels';
import type { Project, ProjectPauseState, ResumeMode, Step, User } from '../domain/types';
import { chicagoDate, chicagoToUtc, formatLocalDate, isValidLocalDate } from '../domain/time';
import { nextStep, statusIgnoringPause } from '../domain/projectStatus';
import { HubError, PermissionDenied } from './errors';

export const PAUSE_REASONS: Record<string, string> = {
  HIGHER_PRIORITY: 'Higher-priority work came up',
  TESTING_SMALLER_BATCH: 'Testing a smaller batch first',
  WAITING: 'Waiting for results or another person',
  SEASONAL: 'Seasonal / revisit later',
  OTHER: 'Other',
};

export interface PauseInput {
  reasonCode?: string;
  reasonNote?: string;
  mode?: ResumeMode;
  resumeDateLocal?: string;
  messageToTeam?: string;
  /** What people may still do while it is paused. */
  allowedWork?: string;
  idempotencyKey: string;
}

/** Owner always; delegated managers only when the owner explicitly granted it. Ordinary members can only suggest. */
export function canControlProject(hub: HubServer, u: User, p: Project): boolean {
  if (u.role === 'OWNER') return true;
  return p.visibility !== 'OWNER_PRIVATE' && p.managerUids.includes(u.id);
}
function control(hub: HubServer, uid: string, projectId: string): Project {
  const p = hub.projectFor(uid, projectId);
  if (!canControlProject(hub, hub.user(uid), p)) throw new PermissionDenied();
  return p;
}

export function reasonText(ps: ProjectPauseState): string {
  const base = ps.reasonCode ? PAUSE_REASONS[ps.reasonCode] ?? ps.reasonCode : '';
  return [base, ps.reasonNote].filter(Boolean).join(' — ') || 'No reason given';
}
export function scheduleSentence(ps: ProjectPauseState, forOwner: boolean): string {
  if (ps.resumeMode === 'AUTOMATIC_ON_DATE' && ps.resumeDateLocal) return `It will start again by itself on ${formatLocalDate(ps.resumeDateLocal, true)}.`;
  if (ps.resumeMode === 'REMIND_ON_DATE' && ps.resumeDateLocal) return forOwner ? `You will get a reminder on ${formatLocalDate(ps.resumeDateLocal, true)} to decide whether to resume.` : `Dalia will decide on ${formatLocalDate(ps.resumeDateLocal, true)} whether to resume.`;
  return forOwner ? 'It stays paused until you resume it.' : 'It stays paused until Dalia resumes it.';
}

function validateSchedule(hub: HubServer, mode: ResumeMode, date: string | undefined): string | undefined {
  if (mode === 'MANUAL') return undefined; // never invent a date
  if (!date || !isValidLocalDate(date)) throw new HubError('INVALID_DATE', 'Please pick a real date.');
  if (date <= chicagoDate(hub.state.now)) throw new HubError('INVALID_DATE', 'Please pick a date after today.');
  return date;
}

function teamToNotify(hub: HubServer, p: Project): User[] {
  return hub.state.users.filter((u) => u.active && u.role === 'EMPLOYEE' && (p.memberUids.includes(u.id)));
}

export function pauseProject(hub: HubServer, uid: string, projectId: string, input: PauseInput): Project {
  const p = control(hub, uid, projectId);
  return hub.idem('pause:' + input.idempotencyKey, () => {
    if (p.closedAt || p.canceledAt) throw new HubError('NOT_ACTIVE', 'This project is finished. Reopen it before pausing.');
    if (p.pause?.isPaused) throw new HubError('ALREADY_PAUSED', 'This project is already paused. You can change when it resumes instead.');
    const mode: ResumeMode = input.mode ?? 'MANUAL';
    const date = validateSchedule(hub, mode, input.resumeDateLocal);
    return hub.commit(() => {
      const steps = hub.state.steps.filter((s) => s.projectId === p.id);
      const prior = p.pause;
      const ps: ProjectPauseState = {
        isPaused: true, pausedAt: hub.state.now, pausedByUserId: uid, reasonCode: input.reasonCode, reasonNote: input.reasonNote?.trim() || undefined,
        messageToTeam: input.messageToTeam?.trim() || undefined, allowedWork: input.allowedWork?.trim() || undefined, priorProjectStatus: statusIgnoringPause(p, steps), resumeMode: mode, resumeDateLocal: date,
        timeZone: 'America/Chicago', scheduleVersion: (prior?.scheduleVersion ?? 0) + 1, deadlineAtPause: p.deadlineAt,
      };
      const before = prior ? { isPaused: prior.isPaused } : null;
      p.pause = ps; p.updatedAt = hub.state.now;
      hub.audit({ entityType: 'project', entityId: p.id, action: 'PROJECT_PAUSED', before, after: { ...ps }, actorUid: uid, actorLabel: hub.userName(uid), reason: reasonText(ps), evidenceRefs: [], projectId: p.id });
      hub.addJournal({
        projectId: p.id, type: 'PROJECT_PAUSED', actorUid: uid, title: `Paused by ${hub.userName(uid)} on ${formatLocalDate(chicagoDate(hub.state.now))}`,
        summary: `${reasonText(ps)}. ${scheduleSentence(ps, true)} All steps, files, checklists and history are kept.`, verificationState: 'OFFICIAL',
      });
      for (const m of teamToNotify(hub, p)) {
        hub.notify({
          recipientUid: m.id, senderUid: uid, type: 'PROJECT_PAUSED', title: `${p.key} “${p.title.slice(0, 60)}” was paused`,
          preview: `${reasonText(ps)}. ${scheduleSentence(ps, false)}${ps.messageToTeam ? ` Message: ${ps.messageToTeam}` : ''}`, projectId: p.id, sourceEntityId: p.id,
          deepLink: `/projects/${p.id}`, key: `n:paused:${p.id}:${ps.scheduleVersion}:${m.id}`,
        });
      }
      return p;
    });
  });
}

export function resumeProject(hub: HubServer, uid: string, projectId: string, input: { note?: string; expectedScheduleVersion?: number; idempotencyKey: string }): Project {
  const p = control(hub, uid, projectId);
  return hub.idem('resume:' + input.idempotencyKey, () => {
    if (!p.pause?.isPaused) throw new HubError('NOT_PAUSED', 'This project is not paused.');
    if (input.expectedScheduleVersion != null && input.expectedScheduleVersion !== p.pause.scheduleVersion) throw new HubError('CONFLICT', 'Someone just changed this. Please refresh and try again.');
    return doResume(hub, p, uid, input.note);
  });
}

function doResume(hub: HubServer, p: Project, byUid: string | null, note?: string): Project {
  return hub.commit(() => {
    const ps = p.pause!;
    const steps = hub.state.steps.filter((s) => s.projectId === p.id);
    const scheduled = ps.resumeDateLocal;
    ps.isPaused = false; ps.resumedAt = hub.state.now; ps.resumedByUserId = byUid; ps.resumeNote = note?.trim() || undefined;
    p.updatedAt = hub.state.now;
    const next = nextStep(steps, p);
    const who = byUid ? hub.userName(byUid) : 'the schedule';
    hub.audit({ entityType: 'project', entityId: p.id, action: 'PROJECT_RESUMED', before: { isPaused: true }, after: { isPaused: false, restoredStatus: ps.priorProjectStatus }, actorUid: byUid, actorLabel: byUid ? hub.userName(byUid) : 'Scheduled resume', reason: note ?? (byUid ? 'Resumed by owner' : `Automatic resume scheduled for ${scheduled}`), evidenceRefs: [], projectId: p.id });
    hub.addJournal({
      projectId: p.id, type: 'PROJECT_RESUMED', actorUid: byUid, actorType: byUid ? 'HUMAN' : 'SERVICE', actorLabel: byUid ? `Authenticated ${hub.userName(byUid)}` : 'Scheduled resume',
      title: byUid ? `Resumed by ${who}` : `Resumed automatically${scheduled ? ` (scheduled for ${formatLocalDate(scheduled)})` : ''}`,
      summary: `${p.key} is active again. Nothing was reset: finished steps stay finished.${next ? ` Next step: Step ${stepLabel(hub.state.steps, next)} “${next.title}”.` : ''}${note ? ` Note: ${note}` : ''}`, verificationState: 'OFFICIAL',
    });
    const owner = hub.state.users.find((u) => u.role === 'OWNER')!;
    const recipients = [...teamToNotify(hub, p), ...(byUid === owner.id ? [] : [owner])];
    for (const m of recipients) {
      hub.notify({
        recipientUid: m.id, senderUid: byUid, type: 'PROJECT_RESUMED', title: `${p.key} “${p.title.slice(0, 60)}” is active again`,
        preview: `${byUid ? `Resumed by ${who}.` : 'It resumed on its scheduled date.'}${next ? ` Next step: “${next.title}”.` : ''}`, projectId: p.id, sourceEntityId: p.id,
        deepLink: `/projects/${p.id}`, key: `n:resumed:${p.id}:${ps.scheduleVersion}:${m.id}`,
      });
    }
    return p;
  });
}

export function changePauseSchedule(hub: HubServer, uid: string, projectId: string, input: { mode: ResumeMode; resumeDateLocal?: string; expectedScheduleVersion?: number; idempotencyKey: string }): Project {
  const p = control(hub, uid, projectId);
  return hub.idem('sched:' + input.idempotencyKey, () => {
    const ps = p.pause;
    if (!ps?.isPaused) throw new HubError('NOT_PAUSED', 'This project is not paused.');
    if (input.expectedScheduleVersion != null && input.expectedScheduleVersion !== ps.scheduleVersion) throw new HubError('CONFLICT', 'Someone just changed this. Please refresh and try again.');
    const date = validateSchedule(hub, input.mode, input.resumeDateLocal);
    return hub.commit(() => {
      const before = { mode: ps.resumeMode, date: ps.resumeDateLocal, version: ps.scheduleVersion };
      ps.resumeMode = input.mode; ps.resumeDateLocal = date; ps.scheduleVersion += 1;
      p.updatedAt = hub.state.now;
      hub.audit({ entityType: 'project', entityId: p.id, action: 'PAUSE_SCHEDULE_CHANGED', before, after: { mode: ps.resumeMode, date: ps.resumeDateLocal, version: ps.scheduleVersion }, actorUid: uid, actorLabel: hub.userName(uid), reason: 'Owner changed when the project resumes', evidenceRefs: [], projectId: p.id });
      hub.addJournal({ projectId: p.id, type: 'PAUSE_SCHEDULE_CHANGED', actorUid: uid, title: 'Resume plan changed', summary: scheduleSentence(ps, true), verificationState: 'OFFICIAL' });
      return p;
    });
  });
}

/** Members can ask the owner to pause; nothing changes until the owner decides. */
export function suggestPause(hub: HubServer, uid: string, projectId: string, note: string, idempotencyKey: string): void {
  const p = hub.projectFor(uid, projectId);
  const u = hub.user(uid);
  if (u.role === 'OWNER' || !hub.canWorkOnProject(u, p)) throw new PermissionDenied();
  if (p.pause?.isPaused) throw new HubError('ALREADY_PAUSED', 'This project is already paused.');
  hub.idem('suggest:' + idempotencyKey, () => hub.commit(() => {
    hub.addJournal({ projectId: p.id, type: 'PAUSE_REQUESTED', actorUid: uid, title: `${hub.userName(uid)} suggested pausing`, summary: note.trim() || 'No reason given. Nothing changed.', verificationState: 'EMPLOYEE_CONFIRMED' });
    hub.notify({ recipientUid: p.ownerUid, senderUid: uid, type: 'PAUSE_SUGGESTION', title: `${hub.userName(uid)} suggests pausing ${p.key}`, preview: note.trim() || 'No reason given.', projectId: p.id, sourceEntityId: p.id, deepLink: `/projects/${p.id}?pause=1`, key: `n:suggestpause:${idempotencyKey}` });
  }));
}
export function suggestResume(hub: HubServer, uid: string, projectId: string, note: string, idempotencyKey: string): void {
  const p = hub.projectFor(uid, projectId);
  const u = hub.user(uid);
  if (u.role === 'OWNER' || !hub.canWorkOnProject(u, p)) throw new PermissionDenied();
  if (!p.pause?.isPaused) throw new HubError('NOT_PAUSED', 'This project is not paused.');
  hub.idem('suggestres:' + idempotencyKey, () => hub.commit(() => {
    hub.addJournal({ projectId: p.id, type: 'PAUSE_REQUESTED', actorUid: uid, title: `${hub.userName(uid)} suggested resuming`, summary: note.trim() || 'No reason given. The project is still paused.', verificationState: 'EMPLOYEE_CONFIRMED' });
    hub.notify({ recipientUid: p.ownerUid, senderUid: uid, type: 'PAUSE_SUGGESTION', title: `${hub.userName(uid)} suggests resuming ${p.key}`, preview: note.trim() || 'No reason given.', projectId: p.id, sourceEntityId: p.id, deepLink: `/projects/${p.id}?pause=1`, key: `n:suggestresume:${idempotencyKey}` });
  }));
}

/** The status run. Safe to call any number of times: each due item is handled once. Never runs scripts or external actions. */
export function processSchedules(hub: HubServer): { resumed: string[]; reminded: string[] } {
  const out = { resumed: [] as string[], reminded: [] as string[] };
  const runTime = hub.state.settings.statusRunLocalTime || '06:00';
  for (const p of hub.state.projects) {
    const ps = p.pause;
    if (!ps?.isPaused || !ps.resumeDateLocal) continue;
    if (p.closedAt || p.canceledAt) continue; // finished projects are never auto-resumed
    const due = hub.state.now >= chicagoToUtc(ps.resumeDateLocal, runTime);
    if (!due) continue;
    if (ps.resumeMode === 'AUTOMATIC_ON_DATE') { doResume(hub, p, null); out.resumed.push(p.id); }
    else if (ps.resumeMode === 'REMIND_ON_DATE' && ps.reminderSentForVersion !== ps.scheduleVersion) {
      hub.commit(() => {
        ps.lastReminderAt = hub.state.now; ps.reminderSentForVersion = ps.scheduleVersion;
        hub.addJournal({ projectId: p.id, type: 'RESUME_REMINDER_SENT', actorUid: null, title: 'Reminder sent to decide about resuming', summary: `A reminder went to ${hub.userName(p.ownerUid)}. The project stays paused until a person decides.`, verificationState: 'OFFICIAL' });
        hub.audit({ entityType: 'project', entityId: p.id, action: 'RESUME_REMINDER_SENT', before: null, after: { scheduleVersion: ps.scheduleVersion }, actorUid: null, actorLabel: 'Scheduled reminder', reason: `Reminder date ${ps.resumeDateLocal}`, evidenceRefs: [], projectId: p.id });
        hub.notify({ recipientUid: p.ownerUid, senderUid: null, type: 'RESUME_REMINDER', title: `Decide whether to resume ${p.key}`, preview: 'You can resume it, set another reminder, or keep it paused.', projectId: p.id, sourceEntityId: p.id, deepLink: `/projects/${p.id}?pause=decide`, key: `n:remind:${p.id}:${ps.scheduleVersion}` });
      });
      out.reminded.push(p.id);
    }
  }
  return out;
}

/** Dalia, a manager, or the person the step is assigned to may put a step on hold or take it off hold. */
function mayHoldStep(hub: HubServer, uid: string, step: Step, project: Project) {
  const u = hub.user(uid);
  return canControlProject(hub, u, project) || (step.assignedUids.includes(uid) && hub.canWorkOnProject(u, project));
}
export function holdStep(hub: HubServer, uid: string, stepId: string, reason: string | null): Step {
  const { step, project } = hub.stepFor(uid, stepId);
  if (!mayHoldStep(hub, uid, step, project)) throw new PermissionDenied();
  if (step.onHold) throw new HubError('ALREADY_PAUSED', 'This step is already on hold.');
  return hub.commit(() => {
    step.onHold = { at: hub.state.now, byUid: uid, reason: reason?.trim() || null };
    hub.audit({ entityType: 'step', entityId: step.id, action: 'STEP_HOLD', before: { status: step.status }, after: { onHold: true, status: step.status }, actorUid: uid, actorLabel: hub.userName(uid), reason: reason ?? 'Step put on hold', evidenceRefs: [], projectId: project.id });
    hub.addJournal({ projectId: project.id, stepIds: [step.id], type: 'PROJECT_PAUSED', actorUid: uid, title: `Step ${stepLabel(hub.state.steps, step)} put on hold`, summary: `“${step.title}” is on hold${reason ? `: ${reason}` : ''}. Its status stays “${step.status.replace(/_/g, ' ').toLowerCase()}”. The rest of the project keeps going.`, verificationState: 'OFFICIAL' });
    return step;
  });
}
export function releaseStep(hub: HubServer, uid: string, stepId: string): Step {
  const { step, project } = hub.stepFor(uid, stepId);
  if (!mayHoldStep(hub, uid, step, project)) throw new PermissionDenied();
  if (!step.onHold) throw new HubError('NOT_PAUSED', 'This step is not on hold.');
  return hub.commit(() => {
    step.onHold = null;
    hub.audit({ entityType: 'step', entityId: step.id, action: 'STEP_RELEASE', before: { onHold: true }, after: { onHold: false }, actorUid: uid, actorLabel: hub.userName(uid), reason: 'Hold removed', evidenceRefs: [], projectId: project.id });
    hub.addJournal({ projectId: project.id, stepIds: [step.id], type: 'PROJECT_RESUMED', actorUid: uid, title: `Step ${stepLabel(hub.state.steps, step)} is active again`, summary: `“${step.title}” continues where it left off.`, verificationState: 'OFFICIAL' });
    return step;
  });
}

/** Deadlines only move when a person chooses a new one. */
export function setProjectDeadline(hub: HubServer, uid: string, projectId: string, ymd: string | null): Project {
  const p = control(hub, uid, projectId);
  if (ymd && !isValidLocalDate(ymd)) throw new HubError('INVALID_DATE', 'Please pick a real date.');
  return hub.commit(() => {
    const before = p.deadlineAt;
    p.deadlineAt = ymd ? chicagoToUtc(ymd, '17:00') : null;
    hub.audit({ entityType: 'project', entityId: p.id, action: 'DEADLINE_CHANGED', before, after: p.deadlineAt, actorUid: uid, actorLabel: hub.userName(uid), reason: 'Owner chose a new deadline', evidenceRefs: [], projectId: p.id });
    hub.addJournal({ projectId: p.id, type: 'PLAN_CHANGE', actorUid: uid, title: 'Deadline changed', summary: `New deadline: ${ymd ? formatLocalDate(ymd, true) : 'none'}${before ? ` (was ${formatLocalDate(chicagoDate(before), true)})` : ''}.`, verificationState: 'OFFICIAL' });
    return p;
  });
}
