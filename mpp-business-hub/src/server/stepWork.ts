import type { HubServer } from './hub';
import type { Project, Resource, ResourceLink, Step } from '../domain/types';
import { stepLabel, stepLabels } from '../domain/stepLabels';
import { HubError, PermissionDenied } from './errors';

// Day-to-day work on a project: adding, naming and ordering steps, making and linking files, and checking recent activity.
// People on a project may do all of this. Every change is written to the audit trail and the project history, and none of it can be deleted.

/** SKU families and columns offered when a sheet starts from SKUs. Names come from the team’s own SKU master. */
export const SKU_FAMILIES = ['CPI', 'WI', 'FI', 'SDI', 'TGI', 'WAI', 'RDI', 'RPI', 'BAC', 'BRSI', 'EI', 'QI', 'SSI', 'BMI', 'HPI', 'GPI', 'FPI', 'KDI', 'RI', 'BAP', 'FCI', 'CONI'];
export const SKU_COLUMNS = ['Design seen', 'Amazon Title', 'Amazon Item Highlight', 'Amazon Backend', 'Bullet Set', 'Description Intro', 'Amazon Full Description', 'Your Price', 'Etsy Title', 'Etsy Tags'];
export const DEFAULT_STEP_NAME = 'New step';

const workProject = (hub: HubServer, uid: string, projectId: string): Project => {
  const project = hub.projectFor(uid, projectId);
  if (!hub.canWorkOnProject(hub.user(uid), project)) throw new PermissionDenied();
  if (project.closedAt || project.canceledAt) throw new HubError('CLOSED', 'This project is finished, so its plan cannot be changed. Reopen it first.');
  return project;
};

/** Keep the stored order tidy: top-level steps 1..n in order, and each group of sub steps 1..m. The label shown comes from the order. */
function renumber(hub: HubServer, projectId: string) {
  const all = hub.state.steps.filter((s) => s.projectId === projectId);
  const groups = new Map<string | null, Step[]>();
  for (const s of all) groups.set(s.parentStepId ?? null, [...(groups.get(s.parentStepId ?? null) ?? []), s]);
  for (const g of groups.values()) g.sort((a, b) => a.sortOrder - b.sortOrder).forEach((s, i) => { s.sortOrder = i + 1; });
}

/** Bring the names of files made in the app in line with the current step numbers and names. (A practice rename here; a real one needs your approval.) */
export function syncFileNames(hub: HubServer, projectId: string): number {
  let n = 0;
  for (const r of hub.state.resources) {
    if (!r.nameParts || r.nameParts.projectId !== projectId) continue;
    const want = standardFileName(hub, r);
    if (want && want !== r.label) { r.label = want; n++; }
  }
  return n;
}

export function standardFileName(hub: HubServer, r: Resource): string | null {
  const parts = r.nameParts; if (!parts) return null;
  const project = hub.state.projects.find((p) => p.id === parts.projectId);
  const step = hub.state.steps.find((s) => s.id === parts.stepId);
  if (!project || !step) return null;
  const label = stepLabel(hub.state.steps, step);
  return `${project.key} - ${project.title} - ${label} ${step.title} - ${parts.person} - File ${parts.n}${parts.suffix ?? ''}`;
}

// ------------------------------------------------------------------ steps
export function addSteps(hub: HubServer, uid: string, projectId: string, count: number, parentStepId: string | null = null): Step[] {
  const project = workProject(hub, uid, projectId);
  if (!Number.isInteger(count) || count < 1 || count > 40) throw new HubError('VALIDATION', 'Choose a whole number from 1 to 40.');
  const parent = parentStepId ? hub.state.steps.find((s) => s.id === parentStepId && s.projectId === projectId) : null;
  if (parentStepId && !parent) throw new PermissionDenied();
  const u = hub.user(uid);
  return hub.commit(() => {
    const made: Step[] = [];
    for (let i = 0; i < count; i++) {
      const sibs = hub.state.steps.filter((s) => s.projectId === projectId && (s.parentStepId ?? null) === (parentStepId ?? null));
      const step: Step = {
        id: hub.nid('s'), projectId, parentStepId: parentStepId ?? null, phase: null, sortOrder: Math.max(0, ...sibs.map((s) => s.sortOrder)) + 1, title: DEFAULT_STEP_NAME, instructions: '', objective: '', acceptance: '',
        status: 'NOT_STARTED', blockerReason: null, assignedUids: u.role === 'OWNER' ? project.memberUids.slice(0, 1) : [uid], dueAt: null, impact: 'ROUTINE', dependencyIds: [], evidenceHints: [], checklist: [],
        verificationSource: 'NONE', observedLevel: 'NO_EVIDENCE', observedReview: 'NONE', observedNote: null, lastActivityAt: null, lastConfirmedAt: null, lastVerifiedAt: null, humanReported: null, verifications: [], newActivityAt: null, onHold: null,
      };
      hub.state.steps.push(step); made.push(step);
    }
    renumber(hub, projectId);
    const labels = stepLabels(hub.state.steps.filter((s) => s.projectId === projectId));
    hub.audit({ entityType: 'project', entityId: projectId, action: 'ADD_STEPS', before: null, after: { count, parentStepId }, actorUid: uid, actorLabel: hub.userName(uid), reason: 'Steps added', evidenceRefs: [], projectId });
    hub.addJournal({ projectId, stepIds: made.map((s) => s.id), type: 'PLAN_CHANGE', actorUid: uid, title: `${count} ${parentStepId ? 'sub step' : 'step'}${count === 1 ? '' : 's'} added`, summary: `${hub.userName(uid)} added ${made.map((s) => labels.get(s.id)).join(', ')}. They still need names.`, verificationState: 'OFFICIAL' });
    return made;
  });
}

export function renameStep(hub: HubServer, uid: string, stepId: string, title: string): Step {
  const { step, project } = hub.workStepFor(uid, stepId);
  if (project.closedAt || project.canceledAt) throw new HubError('CLOSED', 'This project is finished, so it cannot be changed.');
  const t = title.trim();
  if (!t) throw new HubError('VALIDATION', 'A step needs a name.');
  if (t === step.title) return step;
  return hub.commit(() => {
    const before = step.title; step.title = t;
    const synced = syncFileNames(hub, project.id);
    hub.audit({ entityType: 'step', entityId: step.id, action: 'RENAME', before, after: t, actorUid: uid, actorLabel: hub.userName(uid), reason: 'Step renamed', evidenceRefs: [], projectId: project.id });
    hub.addJournal({ projectId: project.id, stepIds: [step.id], type: 'PLAN_CHANGE', actorUid: uid, title: 'Step renamed', summary: `“${before}” is now “${t}”.${synced ? ` ${synced} file name${synced === 1 ? '' : 's'} updated to match (practice).` : ''}`, verificationState: 'OFFICIAL' });
    return step;
  });
}

export function setStepDescription(hub: HubServer, uid: string, stepId: string, text: string): Step {
  const { step, project } = hub.workStepFor(uid, stepId);
  if (project.closedAt || project.canceledAt) throw new HubError('CLOSED', 'This project is finished, so it cannot be changed.');
  const t = text.trim();
  if (t === (step.objective ?? '')) return step;
  return hub.commit(() => {
    const before = step.objective; step.objective = t;
    hub.audit({ entityType: 'step', entityId: step.id, action: 'EDIT_DESCRIPTION', before, after: t, actorUid: uid, actorLabel: hub.userName(uid), reason: 'Short description edited', evidenceRefs: [], projectId: project.id });
    hub.addJournal({ projectId: project.id, stepIds: [step.id], type: 'PLAN_CHANGE', actorUid: uid, title: 'Description edited', summary: `${hub.userName(uid)} changed the short description of “${step.title}”.`, verificationState: 'OFFICIAL' });
    return step;
  });
}

export function renameProject(hub: HubServer, uid: string, projectId: string, title: string): Project {
  const project = workProject(hub, uid, projectId);
  const t = title.trim();
  if (!t) throw new HubError('VALIDATION', 'A project needs a name.');
  if (t === project.title) return project;
  return hub.commit(() => {
    const before = project.title; project.title = t; project.updatedAt = hub.state.now;
    const synced = syncFileNames(hub, projectId);
    hub.audit({ entityType: 'project', entityId: projectId, action: 'RENAME', before, after: t, actorUid: uid, actorLabel: hub.userName(uid), reason: 'Project renamed', evidenceRefs: [], projectId });
    hub.addJournal({ projectId, type: 'PLAN_CHANGE', actorUid: uid, title: 'Project renamed', summary: `“${before}” is now “${t}”.${synced ? ` ${synced} file name${synced === 1 ? '' : 's'} updated to match (practice).` : ''}`, verificationState: 'OFFICIAL' });
    return project;
  });
}

/** Put one group of steps in a new order. Numbers, sub step letters and file names follow on their own. */
export function reorderSteps(hub: HubServer, uid: string, projectId: string, parentStepId: string | null, orderedIds: string[]): Step[] {
  workProject(hub, uid, projectId);
  const sibs = hub.state.steps.filter((s) => s.projectId === projectId && (s.parentStepId ?? null) === (parentStepId ?? null));
  if (sibs.length !== orderedIds.length || sibs.some((s) => !orderedIds.includes(s.id)) || new Set(orderedIds).size !== orderedIds.length) throw new HubError('VALIDATION', 'The new order does not match the steps in this group.');
  return hub.commit(() => {
    const before = stepLabels(hub.state.steps.filter((s) => s.projectId === projectId));
    orderedIds.forEach((id, i) => { hub.state.steps.find((s) => s.id === id)!.sortOrder = i + 1; });
    renumber(hub, projectId);
    const after = stepLabels(hub.state.steps.filter((s) => s.projectId === projectId));
    const changed = orderedIds.filter((id) => before.get(id) !== after.get(id));
    const synced = syncFileNames(hub, projectId);
    if (changed.length) {
      hub.audit({ entityType: 'project', entityId: projectId, action: 'REORDER_STEPS', before: Object.fromEntries(changed.map((id) => [id, before.get(id)])), after: Object.fromEntries(changed.map((id) => [id, after.get(id)])), actorUid: uid, actorLabel: hub.userName(uid), reason: 'Steps reordered', evidenceRefs: [], projectId });
      hub.addJournal({ projectId, stepIds: changed, type: 'PLAN_CHANGE', actorUid: uid, title: 'Steps reordered', summary: `${hub.userName(uid)} moved ${changed.map((id) => `${before.get(id)} to ${after.get(id)}`).join(', ')}.${synced ? ` ${synced} file name${synced === 1 ? '' : 's'} renumbered to match (practice).` : ''}`, verificationState: 'OFFICIAL' });
    }
    return hub.state.steps.filter((s) => s.projectId === projectId).sort((a, b) => a.sortOrder - b.sortOrder);
  });
}

// ------------------------------------------------------------------ files
export interface NewFileInput { kind: 'SHEET' | 'DOC'; mode?: 'BLANK' | 'SKU' | 'COPY'; families?: string[]; columns?: string[]; copyFromResourceId?: string }

function addFileLink(hub: HubServer, uid: string, project: Project, step: Step, res: Resource, why: string) {
  hub.state.resources.push(res);
  const link: ResourceLink = { id: hub.nid('l'), resourceId: res.id, projectId: project.id, stepId: step.id, role: 'WORKING', associationState: 'CONFIRMED', suggestedBy: 'HUMAN', explanation: why, evidenceRefs: [], approvedBy: uid, createdAt: hub.state.now, lastReviewedAt: hub.state.now };
  hub.state.resourceLinks.push(link);
  return link;
}

function personFor(hub: HubServer, step: Step, uid: string): string {
  return hub.userName(step.assignedUids[0] && step.assignedUids.includes(uid) ? uid : step.assignedUids[0] ?? uid);
}

/** Make a new Google Sheet or Doc for a step. In this copy it is a practice file: nothing is made in Google Drive. */
export function createStepFile(hub: HubServer, uid: string, stepId: string, input: NewFileInput): Resource {
  const { step, project } = hub.workStepFor(uid, stepId);
  if (project.closedAt || project.canceledAt) throw new HubError('CLOSED', 'This project is finished, so files cannot be added.');
  const mode = input.kind === 'DOC' ? 'BLANK' : input.mode ?? 'BLANK';
  const families = (input.families ?? []).filter((f) => SKU_FAMILIES.includes(f));
  const columns = (input.columns ?? []).filter((c) => SKU_COLUMNS.includes(c));
  if (mode === 'SKU' && !families.length) throw new HubError('VALIDATION', 'Pick at least one SKU family.');
  const source = mode === 'COPY' ? hub.state.resources.find((r) => r.id === input.copyFromResourceId && r.type === 'GOOGLE_SHEET') : null;
  if (mode === 'COPY' && !source) throw new HubError('VALIDATION', 'Pick a sheet to copy.');
  if (source) { const ok = hub.state.resourceLinks.some((l) => l.resourceId === source.id && l.projectId === project.id); if (!ok) throw new PermissionDenied(); }
  return hub.commit(() => {
    const n = hub.state.resources.filter((r) => r.nameParts?.stepId === step.id).length + 1;
    const id = `r-new-${hub.nid('f')}`;
    const owner = hub.user(uid).role === 'OWNER';
    const res: Resource = {
      id, type: input.kind === 'DOC' ? 'GOOGLE_DOC' : 'GOOGLE_SHEET', label: '', purpose: input.kind === 'DOC' ? 'Working document for this step.' : mode === 'SKU' ? `SKU sheet: ${families.join(', ')}. Tick a box when a SKU is done.` : 'Working sheet for this step.',
      usedBy: 'Project team', sourceProvider: 'demo-drive', sourceId: `practice-${id}`, canonicalUrl: `demo://drive/${input.kind === 'DOC' ? 'doc' : 'sheet'}/${id}`, normalizedPath: null, linkState: 'VERIFIED', version: 'rev 1', lastModifiedAt: hub.state.now,
      visibility: project.visibility === 'OWNER_PRIVATE' ? 'OWNER_PRIVATE' : 'PROJECT_SCOPED', ownerUid: project.ownerUid, skuFamilies: mode === 'COPY' ? source!.skuFamilies : families, provenance: owner ? 'OWNER_APPROVED' : 'EMPLOYEE_CONFIRMED',
      approvedVersion: null, suggestedVersion: null, supersededById: null, checklistSummary: null, createdInApp: true,
      nameParts: { projectId: project.id, stepId: step.id, n, person: personFor(hub, step, uid) },
      startedFrom: input.kind === 'DOC' ? null : { mode, families: mode === 'COPY' ? source!.skuFamilies : families, columns: mode === 'SKU' ? columns : [], copiedFromResourceId: source?.id },
    };
    res.label = standardFileName(hub, res)!;
    addFileLink(hub, uid, project, step, res, 'Made from the step page (practice).');
    hub.audit({ entityType: 'resource', entityId: id, action: 'CREATE_STEP_FILE', before: null, after: { kind: input.kind, mode, families, columns, simulated: true }, actorUid: uid, actorLabel: hub.userName(uid), reason: 'File made for a step. Practice only: nothing was made in Google Drive.', evidenceRefs: [], projectId: project.id });
    hub.addJournal({ projectId: project.id, stepIds: [step.id], type: 'RESOURCE', actorUid: uid, title: input.kind === 'DOC' ? 'Google Doc made for the step (practice)' : 'Google Sheet made for the step (practice)', summary: `“${res.label}” was added to step ${stepLabel(hub.state.steps, step)}.`, verificationState: 'EMPLOYEE_CONFIRMED', relatedResourceIds: [id] });
    return res;
  });
}

/** Link a file that already exists. It keeps its own name. */
export function linkExistingFile(hub: HubServer, uid: string, stepId: string, input: { url: string; name: string; kind?: 'SHEET' | 'DOC' | 'OTHER' }): Resource {
  const { step, project } = hub.workStepFor(uid, stepId);
  if (project.closedAt || project.canceledAt) throw new HubError('CLOSED', 'This project is finished, so files cannot be added.');
  const url = input.url.trim(); const name = input.name.trim();
  if (!/^https?:\/\//i.test(url)) throw new HubError('VALIDATION', 'Paste the full link, starting with https://');
  if (!name) throw new HubError('VALIDATION', 'Give the file a name so people know which one it is.');
  return hub.commit(() => {
    const id = `r-link-${hub.nid('f')}`;
    const type: Resource['type'] = input.kind === 'DOC' || /\/document\//.test(url) ? 'GOOGLE_DOC' : input.kind === 'SHEET' || /\/spreadsheets\//.test(url) ? 'GOOGLE_SHEET' : 'WINDOWS_FILE_PATH';
    const res: Resource = {
      id, type, label: name, purpose: 'Linked from the step page.', usedBy: 'Project team', sourceProvider: /google\.com/.test(url) ? 'demo-drive' : 'none', sourceId: null, canonicalUrl: url, normalizedPath: null, linkState: 'UNVERIFIED' as Resource['linkState'], version: null, lastModifiedAt: null,
      visibility: project.visibility === 'OWNER_PRIVATE' ? 'OWNER_PRIVATE' : 'PROJECT_SCOPED', ownerUid: project.ownerUid, skuFamilies: [], provenance: hub.user(uid).role === 'OWNER' ? 'OWNER_APPROVED' : 'EMPLOYEE_CONFIRMED', approvedVersion: null, suggestedVersion: null, supersededById: null, checklistSummary: null, createdInApp: false,
    };
    addFileLink(hub, uid, project, step, res, 'Linked by a person from the step page.');
    hub.audit({ entityType: 'resource', entityId: id, action: 'LINK_EXISTING_FILE', before: null, after: { url, name }, actorUid: uid, actorLabel: hub.userName(uid), reason: 'File linked to a step', evidenceRefs: [], projectId: project.id });
    hub.addJournal({ projectId: project.id, stepIds: [step.id], type: 'RESOURCE', actorUid: uid, title: 'File linked', summary: `“${name}” was linked to step ${stepLabel(hub.state.steps, step)}.`, verificationState: 'EMPLOYEE_CONFIRMED', relatedResourceIds: [id] });
    return res;
  });
}

/** Files the AI thinks belong to a step, waiting for the person to say yes or no. */
export function pendingFileSuggestions(hub: HubServer, uid: string) {
  const u = hub.user(uid);
  const visible = new Set(hub.visibleResources(u).map((r) => r.id));
  return hub.state.resourceLinks.filter((l) => l.associationState === 'SUGGESTED' && visible.has(l.resourceId)).flatMap((link) => {
    const project = hub.state.projects.find((p) => p.id === link.projectId);
    if (!project || !hub.canWorkOnProject(u, project) || project.closedAt) return [];
    const step = hub.state.steps.find((s) => s.id === link.stepId) ?? null;
    if (u.role !== 'OWNER' && step && step.assignedUids.length && !step.assignedUids.includes(uid)) return [];
    return [{ link, resource: hub.state.resources.find((r) => r.id === link.resourceId)!, project, step }];
  });
}

/** The person answers about an AI-found file: it is right, it is not related, or it belongs to a different step or project. */
export function answerFileSuggestion(hub: HubServer, uid: string, linkId: string, answer: { action: 'CONFIRM' | 'NOT_RELATED' | 'MOVE'; projectId?: string; stepId?: string }): ResourceLink {
  const link = hub.state.resourceLinks.find((l) => l.id === linkId && l.associationState === 'SUGGESTED');
  if (!link) throw new PermissionDenied();
  const from = hub.projectFor(uid, link.projectId);
  if (!hub.canWorkOnProject(hub.user(uid), from)) throw new PermissionDenied();
  if (answer.action !== 'MOVE') return hub.reviewResourceLink(uid, linkId, answer.action);
  const to = hub.projectFor(uid, answer.projectId ?? link.projectId);
  if (!hub.canWorkOnProject(hub.user(uid), to) || to.closedAt) throw new PermissionDenied();
  const step = hub.state.steps.find((s) => s.id === answer.stepId && s.projectId === to.id);
  if (!step) throw new HubError('VALIDATION', 'Choose the step it belongs to.');
  return hub.commit(() => {
    const res = hub.state.resources.find((r) => r.id === link.resourceId)!;
    const before = { projectId: link.projectId, stepId: link.stepId, label: res.label };
    link.projectId = to.id; link.stepId = step.id; link.associationState = 'CONFIRMED'; link.approvedBy = uid; link.lastReviewedAt = hub.state.now;
    if (res.provenance === 'AI_SUGGESTED') res.provenance = hub.user(uid).role === 'OWNER' ? 'OWNER_APPROVED' : 'EMPLOYEE_CONFIRMED';
    const n = hub.state.resources.filter((r) => r.nameParts?.stepId === step.id).length + 1;
    res.nameParts = { projectId: to.id, stepId: step.id, n, person: personFor(hub, step, uid), suffix: res.nameParts?.suffix };
    const want = standardFileName(hub, res); if (want) res.label = want;
    hub.audit({ entityType: 'resourceLink', entityId: link.id, action: 'MOVE_SUGGESTED_FILE', before, after: { projectId: to.id, stepId: step.id, label: res.label }, actorUid: uid, actorLabel: hub.userName(uid), reason: 'The AI guessed the wrong step. The person moved it and the file name follows (practice rename).', evidenceRefs: link.evidenceRefs, projectId: to.id });
    hub.addJournal({ projectId: to.id, stepIds: [step.id], type: 'RESOURCE', actorUid: uid, title: 'File moved to this step', summary: `${hub.userName(uid)} said “${before.label}” belongs to step ${stepLabel(hub.state.steps, step)}. It was renamed “${res.label}” (practice rename).`, verificationState: 'EMPLOYEE_CONFIRMED', relatedResourceIds: [res.id] });
    return link;
  });
}

// ------------------------------------------------------------------ recent activity
function lastEventTime(hub: HubServer, uid: string): string | null {
  const dev = hub.user(uid).primaryDeviceId; if (!dev) return null;
  const ev = hub.state.events.filter((e) => e.deviceId === dev).map((e) => e.occurredAt ?? '').filter(Boolean);
  const bins = hub.state.activityBins.filter((b) => b.deviceId === dev && b.covered).map((b) => b.start);
  const all = [...ev, ...bins].sort();
  return all.length ? all[all.length - 1] : null;
}

/** When the AI last read this person’s computer activity: their own check, or how far the logs reach. */
export function activityCheckedAt(hub: HubServer, uid: string, projectId?: string): { at: string | null; how: 'CHECKED' | 'LOGS' | 'NONE' } {
  const mine = projectId ? hub.state.projects.find((p) => p.id === projectId)?.aiCheckedAt?.[uid] : null;
  const logs = lastEventTime(hub, uid);
  if (mine && (!logs || mine >= logs)) return { at: mine, how: 'CHECKED' };
  if (logs) return { at: logs, how: 'LOGS' };
  return { at: mine ?? null, how: mine ? 'CHECKED' : 'NONE' };
}

/** Ask the AI to read this person’s newest computer activity now. It only suggests. A person confirms every suggestion. */
export async function checkMyActivity(hub: HubServer, uid: string, projectId: string): Promise<{ checkedAt: string; newCards: number; note: string; upTo: string | null }> {
  const project = hub.projectFor(uid, projectId);
  if (!hub.canWorkOnProject(hub.user(uid), project)) throw new PermissionDenied();
  const before = new Set(hub.outstandingCards(uid).map((c) => c.id));
  const outage = hub.state.settings.aiOutage;
  const hasLogs = hub.state.events.some((e) => e.deviceId === hub.user(uid).primaryDeviceId);
  let note = '';
  if (outage) note = 'The AI helper is not available right now (pretend). Nothing was changed. Your clock and your cards still work.';
  else if (!hasLogs) note = 'No computer activity files are loaded for you in this copy, so there was nothing new to read.';
  else await hub.runAnalysis('check my activity');
  const after = hub.outstandingCards(uid).filter((c) => !before.has(c.id)).length;
  const checkedAt = hub.state.now;
  hub.commit(() => {
    if (!outage) { project.aiCheckedAt = { ...(project.aiCheckedAt ?? {}), [uid]: checkedAt }; }
    hub.audit({ entityType: 'project', entityId: projectId, action: 'CHECK_MY_ACTIVITY', before: null, after: { newCards: after, outage, hasLogs }, actorUid: uid, actorLabel: hub.userName(uid), reason: 'The person asked the AI to read their latest activity. The AI only suggests.', evidenceRefs: [], projectId });
  });
  if (!note) note = after ? `Found ${after} thing${after === 1 ? '' : 's'} for you to confirm.` : 'Nothing new to confirm.';
  return { checkedAt, newCards: after, note, upTo: lastEventTime(hub, uid) };
}

/** Where someone left off on a project: the latest thing they confirmed, down to the step or sub step. */
export function lastConfirmed(hub: HubServer, uid: string, projectId: string): { at: string; stepId: string | null; text: string } | null {
  const steps = hub.state.steps.filter((s) => s.projectId === projectId);
  const labels = stepLabels(steps);
  let best: { at: string; stepId: string | null; text: string } | null = null;
  const consider = (at: string | null | undefined, stepId: string | null, text: string) => { if (at && (!best || at > best.at)) best = { at, stepId, text }; };
  for (const s of steps) {
    if (!s.assignedUids.includes(uid) && hub.user(uid).role !== 'OWNER') continue;
    const l = labels.get(s.id);
    if (s.humanReported && (s.humanReported.byUid === uid || hub.user(uid).role === 'OWNER')) consider(s.humanReported.at, s.id, `Step ${l}: ${s.title}`);
    consider(s.lastConfirmedAt, s.id, `Step ${l}: ${s.title}`);
  }
  return best;
}
