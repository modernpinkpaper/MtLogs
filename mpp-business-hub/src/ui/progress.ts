import type { Step } from '../domain/types';

/** Progress is always shown as explicit, labeled counts — never a manufactured percentage from uneven effort. */
export function progressOf(steps: Step[]) {
  const top = steps.filter((s) => !s.parentStepId && s.status !== 'CANCELLED' && s.status !== 'NOT_APPLICABLE');
  const verified = top.filter((s) => s.status === 'VERIFIED_COMPLETE').length;
  const independent = top.filter((s) => s.status === 'VERIFIED_COMPLETE' && s.verificationSource !== 'EMPLOYEE_CONFIRMED').length;
  const reported = top.filter((s) => s.status === 'REPORTED_COMPLETE').length;
  const aiSeen = top.filter((s) => s.observedLevel !== 'NO_EVIDENCE' && !['VERIFIED_COMPLETE', 'REPORTED_COMPLETE'].includes(s.status)).length;
  const total = top.length;
  const parts = [`${verified}/${total} steps confirmed`];
  if (verified) parts.push(`${independent} independently verified, ${verified - independent} employee/owner-confirmed`);
  if (reported) parts.push(`${reported} reported, awaiting confirmation`);
  if (aiSeen) parts.push(`${aiSeen} with AI-detected activity (not counted)`);
  return { total, verified, independent, reported, aiSeen, label: parts.join(' · ') };
}
