import type { HubServer } from './hub';
import type { PilotCheckpoint, PilotRow, PilotRowState, Project } from '../domain/types';
import { HubError, PermissionDenied } from './errors';
import { canControlProject, pauseProject } from './pause';
import { formatDateTime } from '../domain/time';

export const PILOT_STATE_LABEL: Record<PilotRowState, string> = {
  NOT_DONE: 'Not done yet', TRIED: 'Tried', CHECKED_OFF: 'Checked off in the sheet', UPLOADED: 'Uploaded', VERIFIED: 'Checked in the source system', FAILED: 'Did not work',
};
/** States an employee may set. Only an owner or a system check can mark a row verified. */
const EMPLOYEE_STATES: PilotRowState[] = ['NOT_DONE', 'TRIED', 'CHECKED_OFF', 'UPLOADED', 'FAILED'];

export function verifiedCount(pc: PilotCheckpoint): number {
  return pc.rows.filter((r) => r.state === 'VERIFIED').length;
}

function pilotOf(project: Project): PilotCheckpoint {
  if (!project.pilot?.enabled) throw new HubError('NO_PILOT', 'This project has no limited test set up.');
  return project.pilot;
}

export interface PilotInput {
  stepId?: string | null;
  metricType: PilotCheckpoint['metricType'];
  metricLabel: string;
  targetCount: number;
  scopeLabel: string;
  skus: string[];
  enforcement?: PilotCheckpoint['enforcement'];
  whenReached?: PilotCheckpoint['whenReached'];
  idempotencyKey: string;
}

/** Owner sets up a limited test: "do exactly these N things, then stop and ask me". */
export function configurePilot(hub: HubServer, uid: string, projectId: string, input: PilotInput): Project {
  const project = hub.projectFor(uid, projectId);
  if (!canControlProject(hub, hub.user(uid), project)) throw new PermissionDenied();
  return hub.idem('pilot:' + input.idempotencyKey, () => {
    const skus = [...new Set(input.skus.map((s) => s.trim()).filter(Boolean))];
    if (!Number.isInteger(input.targetCount) || input.targetCount < 1) throw new HubError('VALIDATION', 'The number for the test must be 1 or more.');
    if (skus.length && skus.length !== input.targetCount) throw new HubError('VALIDATION', `You listed ${skus.length} items but the test is for ${input.targetCount}. Make them match.`);
    if (project.pilot?.enabled && project.pilot.status !== 'NEXT_BATCH_APPROVED') throw new HubError('PILOT_EXISTS', 'A limited test is already set up for this project.');
    return hub.commit(() => {
      const batch = (project.pilot?.batchNumber ?? 0) + 1;
      const rows: PilotRow[] = (skus.length ? skus : Array.from({ length: input.targetCount }, (_, i) => `Item ${i + 1}`)).map((sku) => ({ sku, state: 'NOT_DONE', note: null, updatedAt: null, evidence: null, verifiedBy: null }));
      project.pilot = {
        enabled: true, stepId: input.stepId ?? null, metricType: input.metricType, metricLabel: input.metricLabel, targetCount: input.targetCount, scopeLabel: input.scopeLabel, rows,
        // We never pretend the app can stop an outside script. Without a connector the limit is tracking only.
        enforcement: input.enforcement ?? 'TRACKING_ONLY', continuationRequiresApproval: true, whenReached: input.whenReached ?? 'PROPOSE_PAUSE',
        approvedBy: uid, approvedAt: hub.state.now, status: 'RUNNING', reachedAt: null, batchNumber: batch,
        history: [{ at: hub.state.now, text: `Test ${batch} set up by ${hub.userName(uid)}: ${input.targetCount} ${input.metricLabel}. ${input.scopeLabel}` }],
      };
      hub.audit({ entityType: 'pilot', entityId: project.id, action: 'PILOT_CONFIGURED', before: null, after: { target: input.targetCount, metric: input.metricType, enforcement: project.pilot.enforcement }, actorUid: uid, actorLabel: hub.userName(uid), reason: 'Owner approved a limited test', evidenceRefs: [], projectId: project.id });
      hub.addJournal({
        projectId: project.id, stepIds: input.stepId ? [input.stepId] : [], type: 'PILOT', actorUid: uid, title: `Limited test set up: ${input.targetCount} ${input.metricLabel}`,
        summary: `${input.scopeLabel} Do not go past this list until ${hub.userName(project.ownerUid)} approves the results. ${project.pilot.enforcement === 'TRACKING_ONLY' ? 'Tracking limit only: the app cannot stop a script that is running outside it.' : 'The script has a limit that stops it at the approved list.'}`,
        verificationState: 'OFFICIAL',
      });
      for (const m of hub.state.users.filter((u) => u.active && u.role === 'EMPLOYEE' && project.memberUids.includes(u.id))) {
        hub.notify({ recipientUid: m.id, senderUid: uid, type: 'DIRECT_MENTION', title: `${project.key}: a limited test of ${input.targetCount} was set up`, preview: `${input.scopeLabel} Please stop after these and wait for approval.`, projectId: project.id, stepId: input.stepId ?? null, sourceEntityId: project.id, deepLink: `/projects/${project.id}`, key: `n:pilot:${project.id}:${batch}:${m.id}` });
      }
      return project;
    });
  });
}

/** Employees record what happened per row. Counting only ever uses VERIFIED rows. */
export function recordPilotRow(hub: HubServer, uid: string, projectId: string, sku: string, state: PilotRowState, note: string | null, evidence: string | null): Project {
  const project = hub.projectFor(uid, projectId);
  const u = hub.user(uid);
  if (!hub.canWorkOnProject(u, project)) throw new PermissionDenied();
  const pc = pilotOf(project);
  const row = pc.rows.find((r) => r.sku === sku);
  if (!row) throw new HubError('OUTSIDE_SCOPE', `“${sku}” is not on the approved test list. Ask Dalia to approve more first.`);
  if (state === 'VERIFIED' && u.role !== 'OWNER') throw new HubError('REQUIRES_CHECK', 'Only a check in the source system, or Dalia, can mark an item as verified.');
  if (u.role !== 'OWNER' && !EMPLOYEE_STATES.includes(state)) throw new PermissionDenied();
  return hub.commit(() => {
    const before = row.state;
    row.state = state; row.note = note?.trim() || row.note; row.evidence = evidence?.trim() || row.evidence; row.updatedAt = hub.state.now;
    if (state === 'VERIFIED') row.verifiedBy = uid;
    hub.audit({ entityType: 'pilotRow', entityId: `${project.id}/${sku}`, action: 'ROW_UPDATED', before, after: state, actorUid: uid, actorLabel: hub.userName(uid), reason: note ?? 'Test item updated', evidenceRefs: evidence ? [evidence] : [], projectId: project.id });
    checkTarget(hub, project, uid);
    return project;
  });
}

/** Stand-in for a trusted source-system check (demo). Marks rows verified and may reach the target. */
export function verifyPilotRows(hub: HubServer, uid: string, projectId: string, skus: string[], detail: string): Project {
  const project = hub.projectFor(uid, projectId);
  hub.requireOwner(uid);
  const pc = pilotOf(project);
  return hub.commit(() => {
    for (const sku of skus) {
      const row = pc.rows.find((r) => r.sku === sku);
      if (!row) throw new HubError('OUTSIDE_SCOPE', `“${sku}” is not on the approved test list.`);
      row.state = 'VERIFIED'; row.verifiedBy = 'source-check (simulated)'; row.evidence = detail; row.updatedAt = hub.state.now;
    }
    hub.audit({ entityType: 'pilot', entityId: project.id, action: 'ROWS_VERIFIED', before: null, after: { count: skus.length }, actorUid: uid, actorLabel: `${hub.userName(uid)} (via simulated source check)`, reason: detail, evidenceRefs: [], projectId: project.id });
    hub.addJournal({ projectId: project.id, stepIds: pc.stepId ? [pc.stepId] : [], type: 'VERIFICATION', actorUid: null, actorType: 'SERVICE', actorLabel: 'Source system check (simulated)', title: `${skus.length} test item(s) checked in the source system`, summary: detail, verificationState: 'INDEPENDENTLY_VERIFIED' });
    checkTarget(hub, project, uid);
    return project;
  });
}

function checkTarget(hub: HubServer, project: Project, actorUid: string) {
  const pc = project.pilot!;
  if (pc.status !== 'RUNNING') return;
  if (verifiedCount(pc) < pc.targetCount) return;
  pc.status = 'TARGET_REACHED'; pc.reachedAt = hub.state.now;
  pc.history.push({ at: hub.state.now, text: `${verifiedCount(pc)}/${pc.targetCount} checked in the source system. Waiting for ${hub.userName(project.ownerUid)} to review.` });
  hub.addJournal({ projectId: project.id, stepIds: pc.stepId ? [pc.stepId] : [], type: 'PILOT', actorUid: null, actorType: 'SERVICE', actorLabel: 'System', title: `Test target reached: ${verifiedCount(pc)} of ${pc.targetCount} checked`, summary: pilotHandoff(hub, project).split('\n').slice(0, 3).join(' '), verificationState: 'INDEPENDENTLY_VERIFIED' });
  hub.notify({ recipientUid: project.ownerUid, senderUid: null, type: 'PILOT_REACHED', title: `${project.key}: test reached ${verifiedCount(pc)} of ${pc.targetCount}`, preview: 'Review the results and decide whether to approve the next batch.', projectId: project.id, sourceEntityId: project.id, deepLink: `/projects/${project.id}?pilot=review`, key: `n:pilotreached:${project.id}:${pc.batchNumber}` });
  // Only if the owner chose this ahead of time. The safe default is to propose a pause and ask.
  if (pc.whenReached === 'AUTO_PAUSE_APPROVED' && !project.pause?.isPaused) {
    pauseProject(hub, project.ownerUid, project.id, { reasonCode: 'TESTING_SMALLER_BATCH', reasonNote: 'Awaiting test review', mode: 'MANUAL', idempotencyKey: `autopause:${project.id}:${pc.batchNumber}` });
    pc.history.push({ at: hub.state.now, text: 'Project paused automatically, as approved ahead of time. Nothing was published or expanded.' });
  }
  void actorUid;
}

/** A plain handoff summary: what was done, what is left, who decides next, and the exact next step. */
export function pilotHandoff(hub: HubServer, project: Project): string {
  const pc = project.pilot;
  if (!pc) return '';
  const by = (st: PilotRowState) => pc.rows.filter((r) => r.state === st);
  const lines = [
    `Test ${pc.batchNumber}: ${verifiedCount(pc)} of ${pc.targetCount} ${pc.metricLabel} checked in the source system.`,
    `Items tested: ${pc.rows.map((r) => r.sku).join(', ')}.`,
    by('FAILED').length ? `Did not work: ${by('FAILED').map((r) => `${r.sku}${r.note ? ` (${r.note})` : ''}`).join(', ')}.` : 'Nothing is marked as failed.',
    pc.rows.filter((r) => r.state !== 'VERIFIED' && r.state !== 'FAILED').length ? `Still open: ${pc.rows.filter((r) => r.state !== 'VERIFIED' && r.state !== 'FAILED').map((r) => `${r.sku} (${PILOT_STATE_LABEL[r.state].toLowerCase()})`).join(', ')}.` : 'No open items.',
    `Scope: ${pc.scopeLabel}`,
    `Who approves what comes next: ${hub.userName(project.ownerUid)}.`,
    pc.status === 'TARGET_REACHED' ? 'Next step: review the results, then choose “Approve next batch” or keep the project paused.' : 'Next step: finish and check the remaining items.',
    pc.enforcement === 'TRACKING_ONLY' ? 'Tracking limit only. The app cannot stop a script that runs outside it.' : 'The script itself stops at the approved list.',
  ];
  return lines.join('\n');
}

/** Only the owner can approve going further. Employees can never expand the list. */
export function approveNextBatch(hub: HubServer, uid: string, projectId: string, input: { targetCount: number; skus: string[]; scopeLabel?: string; resume?: boolean; idempotencyKey: string }): Project {
  hub.requireOwner(uid);
  const project = hub.projectFor(uid, projectId);
  return hub.idem('nextbatch:' + input.idempotencyKey, () => {
    const pc = pilotOf(project);
    if (pc.status !== 'TARGET_REACHED') throw new HubError('NOT_READY', 'The current test has not reached its target yet.');
    return hub.commit(() => {
      pc.status = 'NEXT_BATCH_APPROVED';
      pc.history.push({ at: hub.state.now, text: `${hub.userName(uid)} approved the next batch of ${input.targetCount}.` });
      hub.audit({ entityType: 'pilot', entityId: project.id, action: 'NEXT_BATCH_APPROVED', before: { status: 'TARGET_REACHED', batch: pc.batchNumber }, after: { target: input.targetCount }, actorUid: uid, actorLabel: hub.userName(uid), reason: 'Owner approved expanding the test', evidenceRefs: [], projectId: project.id });
      hub.addJournal({ projectId: project.id, stepIds: pc.stepId ? [pc.stepId] : [], type: 'PILOT', actorUid: uid, title: `Next batch approved: ${input.targetCount}`, summary: `${hub.userName(uid)} approved going further.${input.resume ? ' The project was resumed.' : ' The project stays as it is.'}`, verificationState: 'OFFICIAL' });
      return project;
    });
  });
}

export function pilotSummaryLine(project: Project): string | null {
  const pc = project.pilot;
  if (!pc?.enabled) return null;
  const v = verifiedCount(pc);
  const state = pc.status === 'TARGET_REACHED' ? ' · waiting for your review' : pc.status === 'NEXT_BATCH_APPROVED' ? ' · next batch approved' : '';
  return `Test: ${v}/${pc.targetCount} checked${state}`;
}
export const pilotWhen = (iso: string) => formatDateTime(iso);
