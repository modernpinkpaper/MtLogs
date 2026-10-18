import type { Project, ProjectWorkStatus, Step } from './types';
import { chicagoDate, formatLocalDate } from './time';

const TERMINAL = ['VERIFIED_COMPLETE', 'CANCELLED', 'NOT_APPLICABLE'];

export const STATUS_LABEL: Record<ProjectWorkStatus, string> = {
  NOT_STARTED: 'Not started', IN_PROGRESS: 'In progress', PAUSED: 'Paused', COMPLETED: 'Completed', CANCELED: 'Canceled',
};

/**
 * Plain-language project status derived from existing data. Rich step statuses are kept as they are;
 * "Blocked" and "Waiting" stay conditions on steps, never a stand-in for a deliberate pause.
 */
export function projectWorkStatus(p: Project, steps: Step[]): ProjectWorkStatus {
  if (p.canceledAt) return 'CANCELED';
  if (p.closedAt) return 'COMPLETED';
  if (p.pause?.isPaused) return 'PAUSED';
  const top = steps.filter((s) => !s.parentStepId);
  if (top.length && top.every((s) => s.status === 'NOT_STARTED')) return 'NOT_STARTED';
  return 'IN_PROGRESS';
}

/** Status a project had (or would have) when it is not paused. */
export function statusIgnoringPause(p: Project, steps: Step[]): 'NOT_STARTED' | 'IN_PROGRESS' {
  const top = steps.filter((s) => !s.parentStepId);
  return top.length && top.every((s) => s.status === 'NOT_STARTED') ? 'NOT_STARTED' : 'IN_PROGRESS';
}

/** A step is done when the person says so, unless Dalia chose to check that one herself. */
export function isStepDone(s: Pick<Step, 'status' | 'requiresCheck'>): boolean {
  return s.status === 'VERIFIED_COMPLETE' || (s.status === 'REPORTED_COMPLETE' && !s.requiresCheck);
}

/**
 * Progress. A finished step counts as done when the person reports it. The app never claims the result was checked
 * in another system. If Dalia asked to check a step herself, it waits for her and is counted separately.
 * Top-level steps only, so a parent and its substeps are never double counted.
 */
export function progressCounts(steps: Step[]) {
  const top = steps.filter((s) => !s.parentStepId && s.status !== 'CANCELLED' && s.status !== 'NOT_APPLICABLE');
  const done = top.filter(isStepDone).length;
  const awaiting = top.filter((s) => s.status === 'REPORTED_COMPLETE' && s.requiresCheck).length;
  const reported = top.filter((s) => s.status === 'REPORTED_COMPLETE').length;
  const verified = top.filter((s) => s.status === 'VERIFIED_COMPLETE').length;
  const checked = top.filter((s) => s.status === 'VERIFIED_COMPLETE' && s.verificationSource === 'INDEPENDENT').length;
  const label = `${done} of ${top.length} steps done${awaiting ? ` · ${awaiting} waiting for your check` : ''}`;
  return { done, verified, reported, awaiting, total: top.length, checkedInSource: checked, label };
}

export function isStepReady(step: Step, steps: Step[], project: Project): boolean {
  return !notReadyReason(step, steps, project) && !TERMINAL.includes(step.status) && step.status !== 'REPORTED_COMPLETE';
}

/** Why a step is not ready to work on right now (or null when it is ready). */
export function notReadyReason(step: Step, steps: Step[], project: Project, ownerName = 'Dalia'): string | null {
  if (project.pause?.isPaused) return `This project is paused${project.pause.reasonNote || project.pause.reasonCode ? '' : ''}.`;
  if (step.onHold) return 'This step is on hold.';
  if (step.status === 'BLOCKED') return `Blocked: ${step.blockerReason ?? 'see the step'}.`;
  if (step.status === 'WAITING') return `Waiting: ${step.blockerReason ?? 'for someone or something'}.`;
  const open = step.dependencyIds.map((d) => steps.find((s) => s.id === d)).filter((s): s is Step => !!s && !TERMINAL.includes(s.status) && s.status !== 'REPORTED_COMPLETE');
  if (open.length) return `Waiting for Step ${open.map((s) => s.sortOrder).join(', ')} to be finished first.`;
  void ownerName;
  return null;
}

export function nextStep(steps: Step[], project: Project): Step | null {
  const top = steps.filter((s) => !s.parentStepId).sort((a, b) => a.sortOrder - b.sortOrder);
  const active = top.filter((s) => !TERMINAL.includes(s.status) && s.status !== 'REPORTED_COMPLETE');
  return active.find((s) => !s.onHold && s.status !== 'BLOCKED' && s.status !== 'WAITING' && !notReadyReason(s, steps, { ...project, pause: null })) ?? active[0] ?? null;
}

/** One short line for cards: "Paused · Until you resume", "Paused · Resumes Oct 30", "Paused · Review on Oct 30". */
export function pauseLine(p: Project, viewerIsOwner: boolean): string {
  const ps = p.pause;
  if (!ps?.isPaused) return '';
  if (ps.resumeMode === 'AUTOMATIC_ON_DATE' && ps.resumeDateLocal) return `Paused · Resumes ${formatLocalDate(ps.resumeDateLocal)}`;
  if (ps.resumeMode === 'REMIND_ON_DATE' && ps.resumeDateLocal) return `Paused · ${viewerIsOwner ? 'Review' : 'Dalia reviews'} on ${formatLocalDate(ps.resumeDateLocal)}`;
  return viewerIsOwner ? 'Paused · Until you resume' : 'Paused · Until Dalia resumes';
}

/** Deadline wording that never rewrites the original date. */
export function deadlineInfo(p: Project, nowIso: string): { text: string; elapsedWhilePaused: boolean; pastDueBeforePause: boolean } | null {
  if (!p.deadlineAt) return null;
  const dl = p.deadlineAt;
  const dlDay = formatLocalDate(chicagoDate(dl));
  const ps = p.pause;
  if (ps?.isPaused && ps.pausedAt) {
    const pastBefore = dl < ps.pausedAt;
    const elapsed = dl < nowIso && !pastBefore;
    if (pastBefore) return { text: `Past due before pause (was due ${dlDay}); paused ${formatLocalDate(chicagoDate(ps.pausedAt))}`, elapsedWhilePaused: false, pastDueBeforePause: true };
    if (elapsed) return { text: `Original deadline ${dlDay}; paused ${formatLocalDate(chicagoDate(ps.pausedAt))}`, elapsedWhilePaused: true, pastDueBeforePause: false };
    return { text: `Due ${dlDay} (paused)`, elapsedWhilePaused: false, pastDueBeforePause: false };
  }
  return { text: `Due ${dlDay}`, elapsedWhilePaused: false, pastDueBeforePause: false };
}
