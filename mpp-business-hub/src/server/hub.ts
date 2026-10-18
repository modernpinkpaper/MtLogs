import type {
  Area, AuditEvent, CardAction, Finding, JournalType, Notification, NotificationType, Project, ProjectEvent, Resource,
  ResourceLink, ResourceRole, ResponseChoice, ReviewCard, ReviewCorrection, ReviewDecision, ReviewOutcome, Shift, Step, StepStatus, UpdateRequest, UpdateResponse,
  User, VerificationState, WorkAssignment,
} from '../domain/types';
import { addMinutes, chicagoDate, chicagoToUtc, formatDate, minutesBetween, nextBusinessMorning } from '../domain/time';
import { buildSeedState, NOW } from './seed';
import type { HubState } from './state';
import { HubError, PermissionDenied } from './errors';
import { assignEpisodes, findSequenceGaps, hashText, normalizeEvent, parseJsonl } from '../ai/ingest';
import type { AnalysisContext, FindingDraft, ModelAdapter } from '../ai/adapter';
import { describeEvent, validateFindingDraft } from '../ai/adapter';
import { outcomeEffect, plainToolName, reviewKind, shortProjectName } from '../domain/reviewKinds';
import { isStepDone, notReadyReason } from '../domain/projectStatus';
import { ReplayAnalyzer } from '../ai/replay';
import { cardTitle, cardTypeFor, Hub_rank } from './cards';
import * as PS from './pause';
import type { PauseInput } from './pause';
import * as PL from './pilot';
import * as MG from './manager';
import * as DR from './drive';
import { searchAll } from './search';
import { computeShiftStats, groupProblemEpisodes, fourStateMinutes, weeklyPrinterSummary } from './print';
import * as FX from '../ai/fixtures';
import type { AiRun, CardType, CoverageState, IntakeRun, IntakeStage, WorkLogEntry } from '../domain/types';

export interface QueueItem {
  /** Old label kept for tests and filters. */
  kind: string; label: string; link: string; weight: number;
  /** What a person reads: a short title, one sentence on why it matters, and one button. */
  title: string; why: string; cta: string; chip: string;
  /** Behind "View technical details". Never shown on Home itself. */
  technical?: string[];
  /** Set when the item is about one project, so the screen can show its description card. */
  projectId?: string;
  /** Where it belongs on Dalia's phone: a decision, an urgent problem, a reply, a paused project, or an AI idea. */
  group?: 'DECISION' | 'URGENT' | 'REPLY' | 'PAUSED' | 'AI' | 'OTHER';
  /** A quick action she can take right on Home. Always asks her to confirm first. */
  action?: { type: 'APPROVE_VERSION'; resourceId: string; version: string; label: string; confirm: string } | { type: 'MARK_SEEN'; notificationId: string; label: string };
}
export const STORAGE_KEY = 'mpp-hub-demo-state-v3';
/** Compile-time guard: demo-only operations exist only in this prototype build. */
export const DEMO_MODE = true as const;

export const CHOICE_LABEL: Record<ResponseChoice, string> = {
  COMPLETED: 'Completed', IN_PROGRESS: 'Still working on it', NOT_STARTED: 'Not started',
  BLOCKED: 'Blocked — I need help', WAITING: 'Waiting for someone or something', NOT_APPLICABLE: 'No longer needed', NEED_CLARIFICATION: 'I need clarification',
};

const TRANSITIONS: Record<StepStatus, StepStatus[]> = {
  NOT_STARTED: ['IN_PROGRESS', 'REPORTED_COMPLETE', 'NOT_APPLICABLE', 'CANCELLED'],
  IN_PROGRESS: ['BLOCKED', 'WAITING', 'REPORTED_COMPLETE', 'NOT_APPLICABLE', 'CANCELLED'],
  BLOCKED: ['IN_PROGRESS', 'CANCELLED'],
  WAITING: ['IN_PROGRESS', 'CANCELLED'],
  REPORTED_COMPLETE: ['VERIFIED_COMPLETE', 'REOPENED', 'IN_PROGRESS'],
  VERIFIED_COMPLETE: ['REOPENED'],
  CANCELLED: ['REOPENED'],
  NOT_APPLICABLE: ['REOPENED'],
  REOPENED: ['IN_PROGRESS', 'BLOCKED', 'WAITING', 'REPORTED_COMPLETE'],
};
const EMPLOYEE_TARGETS: StepStatus[] = ['IN_PROGRESS', 'BLOCKED', 'WAITING', 'REPORTED_COMPLETE', 'NOT_APPLICABLE'];
export const TERMINAL: StepStatus[] = ['VERIFIED_COMPLETE', 'CANCELLED', 'NOT_APPLICABLE'];

export type Listener = () => void;

export class HubServer {
  state: HubState;
  private listeners = new Set<Listener>();
  version = 0;
  private persist: boolean;

  protected constructor(state: HubState, persist: boolean) {
    this.state = state;
    this.persist = persist;
  }

  // ------------------------------------------------------------------ infrastructure
  subscribe = (fn: Listener) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  getVersion = () => this.version;

  emit() {
    this.version++;
    if (this.persist && typeof localStorage !== 'undefined') {
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state)); } catch { /* storage full/blocked: demo continues in memory */ }
    }
    this.listeners.forEach((l) => l());
  }

  /** Run a mutation then notify subscribers. All writes go through here. */
  commit<T>(fn: () => T): T {
    const out = fn();
    this.emit();
    return out;
  }

  get now() { return this.state.now; }

  nid(prefix: string): string {
    const n = (this.state.counters[prefix] ?? 0) + 1;
    this.state.counters[prefix] = n;
    return `${prefix}-${String(n).padStart(4, '0')}`;
  }

  /** Idempotency: the first result for a key is returned for every retry with no new side effects. */
  idem<T>(key: string | undefined, fn: () => T): T {
    if (!key) return fn();
    if (key in this.state.idempotency) return this.state.idempotency[key] as T;
    const out = fn();
    this.state.idempotency[key] = out;
    return out;
  }

  // ------------------------------------------------------------------ identity & authorization
  user(uid: string): User {
    const u = this.state.users.find((x) => x.id === uid && x.active);
    if (!u) throw new PermissionDenied();
    return u;
  }
  userName(uid: string | null): string {
    if (!uid) return 'Unknown actor';
    return this.state.users.find((x) => x.id === uid)?.name ?? 'Unknown actor';
  }
  isOwner(uid: string) { return this.user(uid).role === 'OWNER'; }
  requireOwner(uid: string): User {
    const u = this.user(uid);
    if (u.role !== 'OWNER') throw new PermissionDenied();
    return u;
  }

  /** Live evaluation on every read: removing a collaborator takes effect immediately, even for stale deep links. */
  canReadProject(u: User, p: Project): boolean {
    if (u.role === 'OWNER') return true;
    if (p.visibility === 'OWNER_PRIVATE') return false;
    return p.memberUids.includes(u.id) || p.sharedWithUids.includes(u.id);
  }
  /** Who may report on / change steps. Shared (read) access does not grant write access. */
  canWorkOnProject(u: User, p: Project): boolean {
    if (u.role === 'OWNER') return true;
    if (p.visibility === 'OWNER_PRIVATE') return false;
    return p.memberUids.includes(u.id);
  }
  projectFor(uid: string, projectId: string): Project {
    const u = this.user(uid);
    const p = this.state.projects.find((x) => x.id === projectId);
    if (!p || !this.canReadProject(u, p)) throw new PermissionDenied();
    return p;
  }
  stepFor(uid: string, stepId: string): { step: Step; project: Project } {
    const step = this.state.steps.find((s) => s.id === stepId);
    if (!step) throw new PermissionDenied();
    return { step, project: this.projectFor(uid, step.projectId) };
  }
  workStepFor(uid: string, stepId: string) {
    const r = this.stepFor(uid, stepId);
    if (!this.canWorkOnProject(this.user(uid), r.project)) throw new PermissionDenied();
    return r;
  }

  areaOn(uid: string, iso: string = this.state.now): Area {
    const covering = this.state.assignments.filter((a) => a.uid === uid && a.validFrom <= iso && (!a.validTo || iso < a.validTo));
    if (covering.length) return covering[covering.length - 1].area;
    return this.state.users.find((u) => u.id === uid)?.area ?? 'UNASSIGNED';
  }

  // ------------------------------------------------------------------ audit / journal / notifications
  audit(a: Omit<AuditEvent, 'id' | 'recordedAt'>) {
    this.state.auditEvents.push({ ...a, id: this.nid('aud'), recordedAt: this.state.now });
  }

  addJournal(e: {
    projectId: string; stepIds?: string[]; type: JournalType; actorUid: string | null; actorLabel?: string; actorType?: ProjectEvent['actorType'];
    title: string; summary: string; verificationState: VerificationState; confidenceBand?: ProjectEvent['confidenceBand'];
    sourceRefs?: string[]; relatedResourceIds?: string[]; relatedRequestId?: string | null; relatedResponseId?: string | null; occurredAt?: string;
  }): ProjectEvent {
    const project = this.state.projects.find((p) => p.id === e.projectId)!;
    const ev: ProjectEvent = {
      id: this.nid('je'), projectId: e.projectId, stepIds: e.stepIds ?? [], type: e.type, occurredAt: e.occurredAt ?? this.state.now, recordedAt: this.state.now,
      actorUid: e.actorUid, actorType: e.actorType ?? (e.actorUid ? 'HUMAN' : 'SERVICE'),
      actorLabel: e.actorLabel ?? (e.actorUid ? `Authenticated ${this.userName(e.actorUid)}` : 'System'),
      title: e.title, summary: e.summary, verificationState: e.verificationState, confidenceBand: e.confidenceBand ?? 'N_A',
      sourceRefs: e.sourceRefs ?? [], relatedResourceIds: e.relatedResourceIds ?? [], relatedRequestId: e.relatedRequestId ?? null,
      relatedResponseId: e.relatedResponseId ?? null, visibility: project.visibility,
    };
    this.state.projectEvents.push(ev);
    project.updatedAt = this.state.now;
    return ev;
  }

  notify(n: {
    recipientUid: string; senderUid: string | null; type: NotificationType; title: string; preview: string; projectId: string | null;
    stepId?: string | null; sourceEntityId: string; deepLink: string; key: string;
  }): Notification {
    const existing = this.state.notifications.find((x) => x.idempotencyKey === n.key);
    if (existing) return existing; // retry never duplicates
    const note: Notification = {
      id: this.nid('n'), recipientUid: n.recipientUid, senderUid: n.senderUid, type: n.type, title: n.title, preview: n.preview,
      projectId: n.projectId, stepId: n.stepId ?? null, sourceEntityId: n.sourceEntityId, deepLink: n.deepLink,
      createdAt: this.state.now, deliveredAt: this.state.now, readAt: null, acknowledgedAt: null, state: 'DELIVERED', snoozedUntil: null, idempotencyKey: n.key,
    };
    this.state.notifications.push(note);
    return note;
  }

  // ------------------------------------------------------------------ users / team
  listUsers(uid: string): User[] {
    const me = this.user(uid);
    if (me.role === 'OWNER') return this.state.users;
    // Employees only learn about themselves and the owner — no roster browsing.
    return this.state.users.filter((u) => u.id === uid || u.role === 'OWNER');
  }

  // ------------------------------------------------------------------ projects
  listProjects(uid: string): Project[] {
    const u = this.user(uid);
    return this.state.projects.filter((p) => this.canReadProject(u, p));
  }
  getProject(uid: string, projectId: string): Project { return this.projectFor(uid, projectId); }

  projectSteps(uid: string, projectId: string): Step[] {
    this.projectFor(uid, projectId);
    return this.state.steps.filter((s) => s.projectId === projectId).sort((a, b) => a.sortOrder - b.sortOrder);
  }
  getStep(uid: string, stepId: string): Step { return this.stepFor(uid, stepId).step; }

  /** Everything permission-filtered counts: never reveals the existence of private items. */
  counts(uid: string) {
    const u = this.user(uid);
    const projects = this.listProjects(uid);
    const ids = new Set(projects.map((p) => p.id));
    const steps = this.state.steps.filter((s) => ids.has(s.projectId));
    return {
      projects: projects.length,
      openSteps: steps.filter((s) => !TERMINAL.includes(s.status)).length,
      unreadNotifications: this.state.notifications.filter((n) => n.recipientUid === u.id && !n.readAt).length,
      pendingCards: this.state.reviewCards.filter((c) => c.recipientUid === u.id && ['PENDING', 'IN_REVIEW', 'DEFERRED'].includes(c.status)).length,
    };
  }

  search(uid: string, q: string) {
    const u = this.user(uid);
    const needle = q.trim().toLowerCase();
    if (!needle) return { projects: [] as Project[], steps: [] as Step[], resources: [] as Resource[] };
    const projects = this.listProjects(uid);
    const ids = new Set(projects.map((p) => p.id));
    return {
      projects: projects.filter((p) => `${p.key} ${p.title} ${p.objective}`.toLowerCase().includes(needle)),
      steps: this.state.steps.filter((s) => ids.has(s.projectId) && `${s.title} ${s.instructions}`.toLowerCase().includes(needle)),
      resources: this.visibleResources(u).filter((r) => `${r.label} ${r.purpose} ${r.normalizedPath ?? ''} ${r.skuFamilies.join(' ')}`.toLowerCase().includes(needle)),
    };
  }

  /** Search with reasons (v1.1). Only items this person may see are ever matched. */
  searchAll(uid: string, q: string, limit = 12) { return searchAll(this, uid, q, limit); }

  createProject(uid: string, input: { title: string; objective: string; memberUids: string[]; visibility: Project['visibility']; priority?: Project['priority']; deadlineAt?: string | null; key?: string }): Project {
    this.requireOwner(uid);
    if (!input.title.trim()) throw new HubError('VALIDATION', 'Please type a title.');
    return this.commit(() => {
      const nums = this.state.projects.map((p) => Number(p.key.replace(/\D/g, ''))).filter((n) => n < 900 && !Number.isNaN(n));
      const key = input.visibility === 'OWNER_PRIVATE' ? `P-D${String(this.state.projects.filter((p) => p.visibility === 'OWNER_PRIVATE').length + 1).padStart(2, '0')}` : `P-${String(Math.max(0, ...nums) + 1).padStart(3, '0')}`;
      const p: Project = {
        id: this.nid('prj'), key: input.key ?? key, title: input.title.trim(), objective: input.objective.trim(), ownerUid: uid,
        memberUids: input.visibility === 'OWNER_PRIVATE' ? [] : input.memberUids, sharedWithUids: [], visibility: input.visibility,
        priority: input.priority ?? 'NORMAL', deadlineAt: input.deadlineAt ?? null, businessGoal: '', closedAt: null, createdAt: this.state.now,
        updatedAt: this.state.now, lastVerifiedAt: null, currentRisk: null, impactPlan: null,
        pause: null, pilot: null, managerUids: [], pinned: false, canceledAt: null, origin: 'MANUAL', category: null, employeeBrief: null,
      };
      this.state.projects.push(p);
      this.audit({ entityType: 'project', entityId: p.id, action: 'CREATE', before: null, after: { key: p.key, visibility: p.visibility }, actorUid: uid, actorLabel: this.userName(uid), reason: 'Owner created project (demo data)', evidenceRefs: [], projectId: p.id });
      this.addJournal({ projectId: p.id, type: 'PLAN_CHANGE', actorUid: uid, title: 'Project created', summary: `${p.key} created (demo data).`, verificationState: 'OFFICIAL' });
      return p;
    });
  }

  addStep(uid: string, projectId: string, input: { title: string; instructions?: string; parentStepId?: string | null; assignedUids?: string[]; impact?: Step['impact'] }): Step {
    const project = this.projectFor(uid, projectId);
    const u = this.user(uid);
    // Plan changes by employees are limited to adding substeps under steps they are assigned to.
    if (u.role !== 'OWNER') {
      const parent = input.parentStepId ? this.state.steps.find((s) => s.id === input.parentStepId) : null;
      if (!parent || !parent.assignedUids.includes(uid) || parent.projectId !== projectId) throw new PermissionDenied();
    }
    if (!input.title.trim()) throw new HubError('VALIDATION', 'Please type a title for the step.');
    return this.commit(() => {
      const siblings = this.state.steps.filter((s) => s.projectId === projectId);
      const step: Step = {
        id: this.nid('s'), projectId, parentStepId: input.parentStepId ?? null, phase: null, sortOrder: Math.max(0, ...siblings.map((s) => s.sortOrder)) + 1,
        title: input.title.trim(), instructions: input.instructions ?? '', objective: '', acceptance: '', status: 'NOT_STARTED', blockerReason: null,
        assignedUids: input.assignedUids ?? (u.role === 'OWNER' ? project.memberUids.slice(0, 1) : [uid]), dueAt: null, impact: input.impact ?? 'ROUTINE', dependencyIds: [], evidenceHints: [],
        checklist: [], verificationSource: 'NONE', observedLevel: 'NO_EVIDENCE', observedReview: 'NONE', observedNote: null, lastActivityAt: null,
        lastConfirmedAt: null, lastVerifiedAt: null, humanReported: null, verifications: [], newActivityAt: null, onHold: null,
      };
      this.state.steps.push(step);
      this.audit({ entityType: 'step', entityId: step.id, action: 'CREATE', before: null, after: { title: step.title, parentStepId: step.parentStepId }, actorUid: uid, actorLabel: this.userName(uid), reason: 'Plan change (demo data)', evidenceRefs: [], projectId });
      this.addJournal({ projectId, stepIds: [step.id], type: 'PLAN_CHANGE', actorUid: uid, title: 'Step added', summary: `Added ${step.parentStepId ? 'substep' : 'step'} “${step.title}”.`, verificationState: 'OFFICIAL' });
      return step;
    });
  }

  updateInstructions(uid: string, stepId: string, text: string): Step {
    const { step, project } = this.workStepFor(uid, stepId);
    return this.commit(() => {
      const before = step.instructions;
      step.instructions = text;
      this.audit({ entityType: 'step', entityId: step.id, action: 'EDIT_INSTRUCTIONS', before, after: text, actorUid: uid, actorLabel: this.userName(uid), reason: 'Instructions edited', evidenceRefs: [], projectId: project.id });
      this.addJournal({ projectId: project.id, stepIds: [step.id], type: 'PLAN_CHANGE', actorUid: uid, title: 'Instructions edited', summary: `Someone changed the instructions for “${step.title}”.`, verificationState: 'OFFICIAL' });
      return step;
    });
  }

  toggleChecklist(uid: string, stepId: string, itemId: string): Step {
    const { step, project } = this.workStepFor(uid, stepId);
    const item = step.checklist.find((c) => c.id === itemId);
    if (!item) throw new HubError('NOT_FOUND', 'We could not find that checklist item.');
    return this.commit(() => {
      item.done = !item.done;
      item.doneByUid = item.done ? uid : null;
      item.doneAt = item.done ? this.state.now : null;
      this.audit({ entityType: 'checklistItem', entityId: `${stepId}/${itemId}`, action: item.done ? 'CHECK' : 'UNCHECK', before: !item.done, after: item.done, actorUid: uid, actorLabel: this.userName(uid), reason: 'Checklist toggled', evidenceRefs: [], projectId: project.id });
      return step;
    });
  }

  setProjectMembers(uid: string, projectId: string, memberUids: string[]) {
    this.requireOwner(uid);
    const p = this.projectFor(uid, projectId);
    return this.commit(() => {
      const before = [...p.memberUids];
      p.memberUids = p.visibility === 'OWNER_PRIVATE' ? [] : memberUids;
      this.audit({ entityType: 'project', entityId: p.id, action: 'SET_MEMBERS', before, after: p.memberUids, actorUid: uid, actorLabel: this.userName(uid), reason: 'Owner changed assignment', evidenceRefs: [], projectId: p.id });
      this.addJournal({ projectId: p.id, type: 'ACCESS', actorUid: uid, title: 'Assignment changed', summary: `Members: ${p.memberUids.map((m) => this.userName(m)).join(', ') || 'none'}.`, verificationState: 'OFFICIAL' });
      return p;
    });
  }

  shareProject(uid: string, projectId: string, targetUid: string, grant: boolean) {
    this.requireOwner(uid);
    const p = this.projectFor(uid, projectId);
    if (p.visibility === 'OWNER_PRIVATE') throw new HubError('PRIVATE_PROJECT', 'A private project cannot be shared. Change who can see it first.');
    this.user(targetUid);
    return this.commit(() => {
      const before = [...p.sharedWithUids];
      p.sharedWithUids = grant ? [...new Set([...p.sharedWithUids, targetUid])] : p.sharedWithUids.filter((x) => x !== targetUid);
      this.audit({ entityType: 'project', entityId: p.id, action: grant ? 'GRANT_SHARE' : 'REVOKE_SHARE', before, after: p.sharedWithUids, actorUid: uid, actorLabel: this.userName(uid), reason: `Owner ${grant ? 'granted' : 'revoked'} read access`, evidenceRefs: [], projectId: p.id });
      return p;
    });
  }

  closeProject(uid: string, projectId: string) {
    this.requireOwner(uid);
    const p = this.projectFor(uid, projectId);
    if (p.pause?.isPaused) throw new HubError('PAUSED', 'Resume this project before closing it.');
    const open = this.state.steps.filter((s) => s.projectId === projectId && !TERMINAL.includes(s.status) && !isStepDone(s));
    if (open.length) throw new HubError('STEPS_OPEN', `${open.length} step(s) are not finished. A project never closes by itself.`);
    return this.commit(() => {
      p.closedAt = this.state.now;
      this.audit({ entityType: 'project', entityId: p.id, action: 'CLOSE', before: null, after: p.closedAt, actorUid: uid, actorLabel: this.userName(uid), reason: 'Owner closed project', evidenceRefs: [], projectId: p.id });
      this.addJournal({ projectId: p.id, type: 'DECISION', actorUid: uid, title: 'Owner closed the project', summary: 'Only the owner can close a project.', verificationState: 'OFFICIAL' });
      return p;
    });
  }

  // ------------------------------------------------------------------ step state machine
  transitionStep(uid: string, stepId: string, to: StepStatus, opts: { reason?: string; ownerApproval?: boolean } = {}): Step {
    const { step, project } = this.workStepFor(uid, stepId);
    const u = this.user(uid);
    const from = step.status;
    if (!TRANSITIONS[from].includes(to)) throw new HubError('INVALID_TRANSITION', `This step cannot go from “${from.replace(/_/g, ' ').toLowerCase()}” to “${to.replace(/_/g, ' ').toLowerCase()}”.`);
    if (u.role !== 'OWNER') {
      // An employee can REPORT a step finished. Only Dalia, or a real check, can make it verified.
      // The one exception is a routine step Dalia has chosen to let the person sign off.
      const signOff = to === 'VERIFIED_COMPLETE' && step.impact === 'ROUTINE' && !!step.employeeSignOffAllowed && step.assignedUids.includes(uid);
      if (to === 'VERIFIED_COMPLETE' && !signOff) throw new HubError('REQUIRES_VERIFICATION', step.impact === 'HIGH' ? 'This step needs a check in the source system, or Dalia’s approval.' : 'Only Dalia can sign this off. You can report that you finished it.');
      if (!EMPLOYEE_TARGETS.includes(to) && !signOff) throw new PermissionDenied();
      if (!step.assignedUids.includes(uid)) throw new PermissionDenied();
    }
    if ((to === 'BLOCKED') && !(opts.reason ?? '').trim()) throw new HubError('REASON_REQUIRED', 'Please say why it is blocked.');
    let verificationSource = step.verificationSource;
    if (to === 'VERIFIED_COMPLETE') {
      const hasIndependent = step.verifications.some((v) => v.result === 'CONFIRMED');
      if (step.impact === 'HIGH') {
        if (u.role !== 'OWNER') throw new HubError('REQUIRES_INDEPENDENT_VERIFICATION', 'This step needs a check in the source system, or Dalia’s approval.');
        if (!hasIndependent && !opts.ownerApproval) throw new HubError('REQUIRES_INDEPENDENT_VERIFICATION', 'Nothing has been checked in the source system yet. You must choose to approve it yourself.');
        verificationSource = hasIndependent ? 'INDEPENDENT' : 'OWNER_APPROVED';
      } else {
        verificationSource = hasIndependent ? 'INDEPENDENT' : u.role === 'OWNER' ? 'OWNER_APPROVED' : 'EMPLOYEE_CONFIRMED';
      }
    }
    return this.commit(() => this.applyTransition(step, project, to, uid, opts.reason ?? '', verificationSource));
  }

  applyTransition(step: Step, project: Project, to: StepStatus, actorUid: string | null, reason: string, verificationSource?: Step['verificationSource'], evidence: string[] = []): Step {
    const before = { status: step.status, verificationSource: step.verificationSource, blockerReason: step.blockerReason };
    step.status = to;
    step.blockerReason = to === 'BLOCKED' || to === 'WAITING' ? reason || step.blockerReason : to === 'IN_PROGRESS' ? null : step.blockerReason;
    if (to === 'REPORTED_COMPLETE') { step.verificationSource = 'NONE'; step.lastConfirmedAt = this.state.now; }
    if (to === 'VERIFIED_COMPLETE') { step.verificationSource = verificationSource ?? 'EMPLOYEE_CONFIRMED'; step.lastConfirmedAt = this.state.now; if (step.verificationSource === 'INDEPENDENT') step.lastVerifiedAt = this.state.now; }
    if (to === 'REOPENED') step.verificationSource = 'NONE';
    step.lastActivityAt = this.state.now;
    this.audit({ entityType: 'step', entityId: step.id, action: 'TRANSITION', before, after: { status: to, verificationSource: step.verificationSource, blockerReason: step.blockerReason }, actorUid, actorLabel: actorUid ? this.userName(actorUid) : 'System', reason: reason || 'Status change', evidenceRefs: evidence, projectId: project.id });
    this.addJournal({
      projectId: project.id, stepIds: [step.id], type: 'STATUS_CHANGE', actorUid,
      title: `Step status: ${before.status.replace(/_/g, ' ')} → ${to.replace(/_/g, ' ')}`,
      summary: `“${step.title}”${reason ? ` — ${reason}` : ''}. Verification: ${step.verificationSource === 'NONE' ? 'none' : step.verificationSource.replace(/_/g, ' ').toLowerCase()}.`,
      verificationState: step.verificationSource === 'INDEPENDENT' ? 'INDEPENDENTLY_VERIFIED' : step.verificationSource === 'NONE' ? 'OFFICIAL' : step.verificationSource === 'OWNER_APPROVED' ? 'OWNER_APPROVED' : 'EMPLOYEE_CONFIRMED',
    });
    return step;
  }

  /** Apply a human-reported choice as an official step change only when the transition is legal and not terminal. Never VERIFIED. */
  applyHumanReport(step: Step, project: Project, choice: ResponseChoice, note: string | null, uid: string, extra?: { outcome: ReviewOutcome; outcomeText: string }) {
    step.humanReported = { choice, note, at: this.state.now, byUid: uid, ...(extra ?? {}) };
    const target: StepStatus | null =
      choice === 'COMPLETED' ? 'REPORTED_COMPLETE' : choice === 'IN_PROGRESS' ? 'IN_PROGRESS' : choice === 'BLOCKED' ? 'BLOCKED' : choice === 'WAITING' ? 'WAITING' : null;
    if (!target || step.status === target || TERMINAL.includes(step.status)) return;
    if (!TRANSITIONS[step.status].includes(target)) return;
    this.applyTransition(step, project, target, uid, note ?? `Employee reported: ${CHOICE_LABEL[choice]}`, undefined);
  }

  // ------------------------------------------------------------------ shifts / paid time
  openShift(uid: string): Shift | null {
    return this.state.shifts.find((s) => s.uid === uid && s.clockOutAt === null) ?? null;
  }
  requirePaidShiftForEmployee(uid: string): Shift | null {
    const u = this.user(uid);
    const shift = this.openShift(uid);
    if (u.role !== 'OWNER' && !shift) {
      throw new HubError('REVIEW_REQUIRES_PAID_SHIFT', 'Reviews are paid work. Clock in first, then do your review. You never have to work while clocked out.');
    }
    return shift;
  }

  /**
   * Clock-in commits FIRST. It never reads cards, AI status, log coverage or notification state, so none
   * of those can block or delay it. Outstanding reviews are returned only after the commit.
   */
  clockIn(uid: string, idempotencyKey: string): { shift: Shift; alreadyClockedIn: boolean; outstanding: ReviewCard[] } {
    this.user(uid);
    return this.commit(() => {
      const open = this.openShift(uid);
      let alreadyClockedIn = false;
      let shift: Shift;
      const prior = this.state.shifts.find((s) => s.clockInKey === idempotencyKey);
      if (prior) { shift = prior; alreadyClockedIn = true; }
      else if (open) { shift = open; alreadyClockedIn = true; }
      else {
        shift = { id: this.nid('sh'), uid, clockInAt: this.state.now, clockOutAt: null, reviewSessions: [], clockInKey: idempotencyKey, clockOutKey: null };
        this.state.shifts.push(shift);
      }
      return { shift, alreadyClockedIn, outstanding: this.outstandingCards(uid) };
    });
  }

  /** Clock-out never waits for reviews, Claude, print stats or notifications. Pending cards are preserved untouched. */
  clockOut(uid: string, idempotencyKey: string): { shift: Shift | null; alreadyClockedOut: boolean; pendingCards: number } {
    this.user(uid);
    return this.commit(() => {
      const prior = this.state.shifts.find((s) => s.clockOutKey === idempotencyKey);
      if (prior) return { shift: prior, alreadyClockedOut: true, pendingCards: this.outstandingCards(uid).length };
      const open = this.openShift(uid);
      if (!open) return { shift: null, alreadyClockedOut: true, pendingCards: this.outstandingCards(uid).length };
      open.clockOutAt = this.state.now;
      open.clockOutKey = idempotencyKey;
      return { shift: open, alreadyClockedOut: false, pendingCards: this.outstandingCards(uid).length };
    });
  }

  lastShift(uid: string): Shift | null {
    const mine = this.state.shifts.filter((s) => s.uid === uid);
    return mine.length ? mine[mine.length - 1] : null;
  }

  outstandingCards(uid: string): ReviewCard[] {
    return this.state.reviewCards.filter((c) => c.recipientUid === uid && ['PENDING', 'IN_REVIEW', 'DEFERRED'].includes(c.status));
  }

  /** Honest readiness: provisional/missing coverage is stated, never turned into "0 activity". */
  reviewReadiness(uid: string) {
    const cards = this.outstandingCards(uid);
    const provisional = cards.filter((c) => c.provisional).length;
    const devices = [...new Set(this.state.archives.map((a) => a.deviceId))];
    const coverageIssues = devices
      .map((d) => ({ deviceId: d, state: this.coverageFor(d) }))
      .filter((x) => x.state !== 'FINAL');
    const aiDown = this.state.settings.aiOutage;
    const logDown = this.state.settings.logSyncOutage;
    let message = cards.length ? `${cards.length} review card(s) are ready.` : 'No review cards are ready yet.';
    if (aiDown) message += ' The AI helper is not working right now, so reports may be missing. That does not mean no work was done.';
    if (logDown) message += ' Computer activity data is late, so some may be missing. That does not mean no work was done.';
    if (!aiDown && !logDown && !cards.length) message += ' Anything not ready will show up at your next paid shift.';
    return { cards, provisional, coverageIssues, aiStatus: aiDown ? 'UNAVAILABLE' : 'OK', logSyncStatus: logDown ? 'DELAYED' : 'OK', message };
  }

  // ------------------------------------------------------------------ update requests (owner → employee)
  createUpdateRequest(uid: string, input: {
    projectId: string; stepId?: string | null; recipientUids?: string[]; question?: string | null; purpose?: string;
    importance?: 'NORMAL' | 'IMPORTANT'; dueAt?: string | null; options?: Partial<UpdateRequest['options']>; parentRequestId?: string | null; idempotencyKey: string;
  }): UpdateRequest {
    this.requireOwner(uid);
    const project = this.projectFor(uid, input.projectId);
    const step = input.stepId ? this.stepFor(uid, input.stepId).step : null;
    if (step && step.projectId !== project.id) throw new HubError('VALIDATION', 'That step is not part of this project.');
    return this.idem('req:' + input.idempotencyKey, () => {
      const authorized = (id: string) => this.state.users.some((u) => u.id === id && u.active && u.role === 'EMPLOYEE') && (project.memberUids.includes(id) || project.sharedWithUids.includes(id));
      const defaultRecipients = (step?.assignedUids.length ? step.assignedUids : project.memberUids).filter(authorized);
      const recipients = (input.recipientUids?.length ? input.recipientUids : defaultRecipients);
      if (!recipients.length || !recipients.every(authorized)) throw new HubError('NO_AUTHORIZED_RECIPIENT', 'Pick a person who works on this project.');
      // The same question to the same people on the same step, still waiting: do not make a second card or notification.
      const same = this.state.updateRequests.find((r) => ['OPEN', 'PARTIALLY_RESPONDED'].includes(r.state) && r.requestedByUid === uid && r.projectId === project.id && (r.stepId ?? null) === (step?.id ?? null)
        && (r.question ?? '') === (input.question?.trim() ?? '') && r.recipientUids.length === recipients.length && recipients.every((x) => r.recipientUids.includes(x)));
      if (same) return same;
      return this.commit(() => {
        const req: UpdateRequest = {
          id: this.nid('req'), projectId: project.id, stepId: step?.id ?? null, requestedByUid: uid, recipientUids: recipients,
          question: input.question?.trim() || null, purpose: input.purpose ?? 'Check progress', importance: input.importance ?? 'NORMAL', dueAt: input.dueAt ?? null,
          options: { notifyWhenVerified: false, sendNextResponse: false, reminderIfUnanswered: false, ...input.options }, state: 'OPEN',
          parentRequestId: input.parentRequestId ?? null, createdAt: this.state.now, deliveryStatus: 'DELIVERED', idempotencyKey: input.idempotencyKey,
        };
        this.state.updateRequests.push(req);
        const where = step ? `${project.key}, Step ${step.sortOrder} “${step.title}”` : project.key;
        for (const r of recipients) {
          const card: ReviewCard = {
            id: this.nid('card'), cardType: 'OWNER_REQUEST', recipientUid: r, projectId: project.id, stepId: step?.id ?? null, findingIds: [], updateRequestId: req.id,
            title: `Update requested by ${this.userName(uid)}`, explanatoryText: req.question ?? `Please tell us how ${where} is going.`, status: 'PENDING', dueAt: req.dueAt,
            provisional: false, sourceCoverage: 'FINAL', canBulkReview: false, reviewStartedAt: null, createdAt: this.state.now, lastUpdatedAt: this.state.now, groupKey: `req:${req.id}:${r}`,
          };
          this.state.reviewCards.push(card);
          this.notify({
            recipientUid: r, senderUid: uid, type: input.parentRequestId ? 'FOLLOW_UP' : 'OWNER_UPDATE_REQUEST',
            title: `${this.userName(uid)} asked for an update — ${where}`, preview: req.question ?? 'Please tell me how this is going.', projectId: project.id, stepId: step?.id ?? null,
            sourceEntityId: req.id, deepLink: `/review?card=${card.id}`, key: `n:req:${req.id}:${r}`,
          });
        }
        this.audit({ entityType: 'updateRequest', entityId: req.id, action: 'CREATE', before: null, after: { recipients, stepId: req.stepId }, actorUid: uid, actorLabel: this.userName(uid), reason: 'Owner requested an update', evidenceRefs: [], projectId: project.id });
        this.addJournal({
          projectId: project.id, stepIds: step ? [step.id] : [], type: 'UPDATE_REQUESTED', actorUid: uid, title: `${this.userName(uid)} asked for an update`,
          summary: `${req.question ?? 'Asked how it is going'} → ${recipients.map((r) => this.userName(r)).join(', ')}${req.importance === 'IMPORTANT' ? ' (Important)' : ''}.`,
          verificationState: 'OFFICIAL', relatedRequestId: req.id,
        });
        return req;
      });
    });
  }

  listRequests(uid: string): UpdateRequest[] {
    const u = this.user(uid);
    return this.state.updateRequests.filter((r) => u.role === 'OWNER' || r.recipientUids.includes(uid));
  }
  getRequest(uid: string, requestId: string): UpdateRequest {
    const r = this.state.updateRequests.find((x) => x.id === requestId);
    const u = this.user(uid);
    if (!r || (u.role !== 'OWNER' && !r.recipientUids.includes(uid))) throw new PermissionDenied();
    return r;
  }
  listResponses(uid: string, requestId?: string): UpdateResponse[] {
    const u = this.user(uid);
    return this.state.updateResponses.filter((r) => (!requestId || r.requestId === requestId) && (u.role === 'OWNER' || r.fromUid === uid));
  }

  /**
   * Persist the response, close the request card, journal it AND create the real in-app notification for the owner,
   * as one idempotent unit. Everything is validated before the first write.
   */
  submitUpdateResponse(uid: string, input: {
    requestId?: string | null; projectId?: string; stepId?: string | null; choice: ResponseChoice; note?: string | null;
    evidenceLinks?: string[]; needsOwnerHelp?: boolean; sourceCardId?: string | null; idempotencyKey: string;
  }): UpdateResponse {
    const u = this.user(uid);
    if (u.role === 'OWNER') throw new HubError('VALIDATION', 'Only employees answer update requests.');
    let req: UpdateRequest | null = null;
    if (input.requestId) {
      req = this.state.updateRequests.find((r) => r.id === input.requestId) ?? null;
      if (!req || !req.recipientUids.includes(uid)) throw new PermissionDenied();
    }
    const projectId = req?.projectId ?? input.projectId;
    const stepId = req ? req.stepId : input.stepId ?? null;
    if (!projectId) throw new HubError('VALIDATION', 'Please pick a project.');
    const project = this.projectFor(uid, projectId);
    if (!this.canWorkOnProject(u, project)) throw new PermissionDenied();
    const step = stepId ? this.stepFor(uid, stepId).step : null;
    if (!(input.choice in CHOICE_LABEL)) throw new HubError('VALIDATION', 'Please pick a status.');
    return this.idem('resp:' + input.idempotencyKey, () => {
      const shift = this.requirePaidShiftForEmployee(uid);
      return this.commit(() => {
        const needsHelp = input.needsOwnerHelp ?? input.choice === 'BLOCKED';
        const resp: UpdateResponse = {
          id: this.nid('resp'), requestId: req?.id ?? null, projectId: project.id, stepId: step?.id ?? null, fromUid: uid, toUid: project.ownerUid,
          choice: input.choice, note: input.note?.trim() || null, evidenceLinks: input.evidenceLinks ?? [], submittedAt: this.state.now,
          sourceCardId: input.sourceCardId ?? null, needsOwnerHelp: needsHelp, humanReportedOnly: true, idempotencyKey: input.idempotencyKey,
        };
        this.state.updateResponses.push(resp);
        if (req) {
          const answered = new Set(this.state.updateResponses.filter((r) => r.requestId === req!.id).map((r) => r.fromUid));
          req.state = req.recipientUids.every((r) => answered.has(r)) ? 'RESPONDED' : 'PARTIALLY_RESPONDED';
          for (const c of this.state.reviewCards.filter((c) => c.updateRequestId === req!.id && c.recipientUid === uid && c.status !== 'SUBMITTED')) {
            c.status = 'SUBMITTED'; c.lastUpdatedAt = this.state.now;
            if (shift) shift.reviewSessions.push({ startedAt: c.reviewStartedAt ?? this.state.now, submittedAt: this.state.now, cardId: c.id });
            this.recordDecision(uid, c, 'SEND_STATUS', input.choice, resp.note, resp.evidenceLinks, null, null, input.idempotencyKey, shift);
          }
        } else if (input.sourceCardId) {
          const c = this.state.reviewCards.find((x) => x.id === input.sourceCardId && x.recipientUid === uid);
          if (c && c.status !== 'SUBMITTED') { c.status = 'SUBMITTED'; c.lastUpdatedAt = this.state.now; }
        }
        if (step) this.applyHumanReport(step, project, input.choice, resp.note, uid);
        const where = step ? `${project.key}, Step ${step.sortOrder} “${step.title}”` : project.key;
        const label = CHOICE_LABEL[input.choice];
        const unverifiedNote = input.choice === 'COMPLETED' ? '. Employee confirmed. Not checked in the source system yet.' : '';
        this.audit({ entityType: 'updateResponse', entityId: resp.id, action: 'SUBMIT', before: req ? { requestState: 'OPEN' } : null, after: { choice: resp.choice, requestId: req?.id ?? null }, actorUid: uid, actorLabel: this.userName(uid), reason: req ? 'Answered owner request' : 'Proactive update', evidenceRefs: resp.evidenceLinks, projectId: project.id });
        const ev = this.addJournal({
          projectId: project.id, stepIds: step ? [step.id] : [], type: req ? 'UPDATE_RESPONSE' : 'PROACTIVE_UPDATE', actorUid: uid,
          title: `${this.userName(uid)} ${req ? 'answered' : 'sent an update'}: ${label}`, summary: `${resp.note ?? 'No note.'}${unverifiedNote}`,
          verificationState: 'EMPLOYEE_CONFIRMED', relatedRequestId: req?.id ?? null, relatedResponseId: resp.id, sourceRefs: resp.evidenceLinks,
        });
        void ev;
        this.notify({
          recipientUid: project.ownerUid, senderUid: uid, type: needsHelp ? 'BLOCKER' : req ? 'EMPLOYEE_RESPONSE' : 'EMPLOYEE_UPDATE',
          title: `${this.userName(uid)} ${req ? 'answered your request' : 'sent you an update'} — ${where}: ${label}`,
          preview: `${resp.note ?? 'No note'}${unverifiedNote}`, projectId: project.id, stepId: step?.id ?? null, sourceEntityId: resp.id,
          deepLink: `/projects/${project.id}${step ? `/steps/${step.id}` : ''}?response=${resp.id}`, key: `n:resp:${resp.id}`,
        });
        return resp;
      });
    });
  }

  sendProactiveUpdate(uid: string, input: { projectId: string; stepId?: string | null; choice: ResponseChoice; note?: string | null; needsOwnerHelp?: boolean; idempotencyKey: string }) {
    return this.submitUpdateResponse(uid, { ...input, requestId: null });
  }

  /** Owner follow-up creates a NEW request linked to the first; the employee's earlier answer is never touched. */
  followUp(uid: string, requestId: string, question: string, idempotencyKey: string) {
    this.requireOwner(uid);
    const orig = this.getRequest(uid, requestId);
    return this.createUpdateRequest(uid, { projectId: orig.projectId, stepId: orig.stepId, recipientUids: orig.recipientUids, question, purpose: 'Follow-up', importance: orig.importance, parentRequestId: orig.id, idempotencyKey });
  }
  closeRequest(uid: string, requestId: string) {
    this.requireOwner(uid);
    const r = this.getRequest(uid, requestId);
    return this.commit(() => {
      const before = r.state;
      r.state = 'CLOSED';
      for (const c of this.state.reviewCards.filter((c) => c.updateRequestId === r.id && !['SUBMITTED', 'CLOSED'].includes(c.status))) { c.status = 'CLOSED'; c.lastUpdatedAt = this.state.now; }
      this.audit({ entityType: 'updateRequest', entityId: r.id, action: 'CLOSE', before, after: 'CLOSED', actorUid: uid, actorLabel: this.userName(uid), reason: 'Owner closed request', evidenceRefs: [], projectId: r.projectId });
      return r;
    });
  }

  // ------------------------------------------------------------------ notifications
  listNotifications(uid: string): Notification[] {
    this.user(uid);
    return this.state.notifications.filter((n) => n.recipientUid === uid && n.state !== 'DISMISSED').sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  ownNote(uid: string, id: string): Notification {
    const n = this.state.notifications.find((x) => x.id === id);
    if (!n || n.recipientUid !== uid) throw new PermissionDenied();
    return n;
  }
  markRead(uid: string, id: string) {
    const n = this.ownNote(uid, id);
    return this.commit(() => { if (!n.readAt) { n.readAt = this.state.now; if (n.state === 'DELIVERED') n.state = 'READ'; } return n; });
  }
  markAllRead(uid: string) {
    this.user(uid);
    return this.commit(() => { for (const n of this.state.notifications) if (n.recipientUid === uid && !n.readAt) { n.readAt = this.state.now; if (n.state === 'DELIVERED') n.state = 'READ'; } });
  }
  acknowledge(uid: string, id: string) {
    const n = this.ownNote(uid, id);
    return this.commit(() => {
      if (n.acknowledgedAt) return n; // idempotent
      n.acknowledgedAt = this.state.now; n.readAt = n.readAt ?? this.state.now; n.state = 'ACKNOWLEDGED';
      const resp = this.state.updateResponses.find((r) => r.id === n.sourceEntityId);
      if (resp?.requestId) {
        const req = this.state.updateRequests.find((r) => r.id === resp.requestId);
        if (req && req.state !== 'CLOSED') req.state = 'ACKNOWLEDGED';
      }
      if (n.projectId) this.addJournal({ projectId: n.projectId, stepIds: n.stepId ? [n.stepId] : [], type: 'ACK', actorUid: uid, title: `${this.userName(uid)} saw the answer`, summary: n.title, verificationState: 'OFFICIAL', relatedResponseId: resp?.id ?? null });
      return n;
    });
  }
  dismissNotification(uid: string, id: string) {
    const n = this.ownNote(uid, id);
    return this.commit(() => { n.state = 'DISMISSED'; return n; });
  }
  snoozeNotification(uid: string, id: string, minutes: number) {
    const n = this.ownNote(uid, id);
    return this.commit(() => { n.snoozedUntil = addMinutes(this.state.now, minutes); return n; });
  }
  unreadCount(uid: string) {
    return this.state.notifications.filter((n) => n.recipientUid === uid && !n.readAt && n.state !== 'DISMISSED').length;
  }

  // ------------------------------------------------------------------ review cards & decisions
  listReviewCards(uid: string, scope: 'pending' | 'all' = 'pending'): ReviewCard[] {
    this.user(uid);
    return this.state.reviewCards
      .filter((c) => c.recipientUid === uid && (scope === 'all' || ['PENDING', 'IN_REVIEW', 'DEFERRED'].includes(c.status)))
      .sort((a, b) => (a.cardType === 'OWNER_REQUEST' ? -1 : 0) - (b.cardType === 'OWNER_REQUEST' ? -1 : 0) || a.createdAt.localeCompare(b.createdAt));
  }
  getCard(uid: string, cardId: string): ReviewCard {
    const c = this.state.reviewCards.find((x) => x.id === cardId);
    if (!c || c.recipientUid !== uid) throw new PermissionDenied();
    return c;
  }
  cardFindings(uid: string, cardId: string): Finding[] {
    const c = this.getCard(uid, cardId);
    return this.state.findings.filter((f) => c.findingIds.includes(f.id));
  }
  /** Evidence is shown via redacted normalized events, never raw logs. */
  findingEvidence(uid: string, findingId: string) {
    const f = this.state.findings.find((x) => x.id === findingId);
    const card = f && this.state.reviewCards.find((c) => c.findingIds.includes(f.id) && c.recipientUid === uid);
    if (!f || (!card && !this.isOwner(uid))) throw new PermissionDenied();
    return this.state.events.filter((e) => f.sourceEventIds.includes(e.id)).sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
  }

  startReview(uid: string, cardId: string) {
    const c = this.getCard(uid, cardId);
    if (c.updateRequestId) { // "Seen" for Dalia: the first time the person opens the request. Recorded once.
      const rq = this.state.updateRequests.find((r) => r.id === c.updateRequestId);
      if (rq && !rq.seenAt) this.commit(() => { rq.seenAt = this.state.now; });
    }
    if (c.reviewStartedAt || c.status === 'SUBMITTED') return c;
    return this.commit(() => { c.reviewStartedAt = this.state.now; if (c.status === 'PENDING' || c.status === 'DEFERRED') c.status = 'IN_REVIEW'; return c; });
  }

  recordDecision(uid: string, card: ReviewCard, action: CardAction, status: ResponseChoice | null, note: string | null, links: string[], correction: string | null, classification: string | null, key: string, shift: Shift | null): ReviewDecision {
    const d: ReviewDecision = {
      id: this.nid('dec'), cardId: card.id, actorUid: uid, selectedAction: action, statusAnswer: status, note, evidenceLinks: links, correctionText: correction,
      classificationChoice: classification, submittedAt: this.state.now, reviewStartedAt: card.reviewStartedAt, duringPaidShift: !!shift, shiftId: shift?.id ?? null, idempotencyKey: key,
    };
    this.state.reviewDecisions.push(d);
    return d;
  }

  submitDecision(uid: string, cardId: string, input0: {
    action?: CardAction; statusAnswer?: ResponseChoice | null; note?: string | null; correctionText?: string | null; evidenceLinks?: string[];
    needsOwnerHelp?: boolean; classification?: { kind: 'LINK_EXISTING' | 'NEW_STEP' | 'ROUTINE' | 'POTENTIAL_PROJECT'; projectId?: string; stepId?: string; newStepTitle?: string } | null; idempotencyKey: string;
    /** What happened with the work. When set, the action and status are worked out here, by the same rules the screen shows. */
    outcome?: ReviewOutcome | null; correction?: ReviewCorrection | null;
  }): ReviewDecision {
    const card = this.getCard(uid, cardId);
    let input = { ...input0, action: input0.action ?? ('CONFIRM' as CardAction) };
    let fx: ReturnType<typeof outcomeEffect> | null = null;
    if (input0.outcome && card.cardType !== 'OWNER_REQUEST') {
      const pf = this.state.findings.find((f) => card.findingIds.includes(f.id));
      const pstep = pf?.stepId ? this.state.steps.find((s) => s.id === pf.stepId) ?? null : null;
      fx = outcomeEffect(pf ? reviewKind(pf, pstep) : 'GENERAL', input0.outcome, pstep);
      const o = input0.outcome;
      if (o === 'NOT_SURE') input = { ...input, action: 'DEFER' };
      else if (o === 'NOT_ME') input = { ...input, action: 'NOT_MY_WORK' };
      else if (o === 'MISREAD') {
        const c = input0.correction;
        if (c?.kind === 'WRONG_PERSON') input = { ...input, action: 'NOT_MY_WORK', correctionText: input0.correctionText ?? 'Someone else was using this computer.' };
        else if (c?.kind === 'WRONG_STEP' && c.projectId && c.stepId) input = { ...input, action: 'NEEDS_CORRECTION', correctionText: input0.correctionText?.trim() || 'This work belongs to a different step.' };
        else input = { ...input, action: 'NEEDS_CORRECTION', correctionText: input0.correctionText?.trim() || input0.note?.trim() || 'The AI misunderstood what I was doing.' };
      } else if (fx.status) input = { ...input, action: 'SEND_STATUS', statusAnswer: fx.status };
      else input = { ...input, action: 'CONFIRM' };
    }
    const key = 'dec:' + input.idempotencyKey;
    // Cards for owner requests are answered through the response path (same idempotency, same atomic write).
    if (card.cardType === 'OWNER_REQUEST') {
      if (input.action !== 'SEND_STATUS' || !input.statusAnswer) throw new HubError('VALIDATION', 'Pick a status, then send your update.');
      this.submitUpdateResponse(uid, { requestId: card.updateRequestId, choice: input.statusAnswer, note: input.note, evidenceLinks: input.evidenceLinks, needsOwnerHelp: input.needsOwnerHelp, idempotencyKey: input.idempotencyKey });
      return this.state.reviewDecisions.filter((d) => d.cardId === card.id).slice(-1)[0];
    }
    if (input.action === 'NEEDS_CORRECTION' && !(input.correctionText ?? '').trim()) throw new HubError('VALIDATION', 'Tell us what is wrong so we can save your fix.');
    if (input.action === 'SEND_STATUS' && !input.statusAnswer) throw new HubError('VALIDATION', 'Please pick a status.');
    if (card.status === 'SUBMITTED' && !(key in this.state.idempotency)) throw new HubError('ALREADY_SUBMITTED', 'This card was already answered.');
    return this.idem(key, () => {
      const shift = input.action === 'DEFER' ? this.openShift(uid) : this.requirePaidShiftForEmployee(uid);
      return this.commit(() => {
        const findings = this.state.findings.filter((f) => card.findingIds.includes(f.id));
        const dec = this.recordDecision(uid, card, input.action, input.statusAnswer ?? null, input.note?.trim() || null, input.evidenceLinks ?? [], input.correctionText?.trim() || null, input.classification?.kind ?? null, input.idempotencyKey, shift);
        if (input.action === 'DEFER') { card.status = 'DEFERRED'; card.lastUpdatedAt = this.state.now; return dec; }
        card.status = 'SUBMITTED'; card.lastUpdatedAt = this.state.now;
        if (shift) shift.reviewSessions.push({ startedAt: card.reviewStartedAt ?? this.state.now, submittedAt: this.state.now, cardId: card.id });
        const newStatus: Finding['status'] = input.action === 'CONFIRM' || input.action === 'SEND_STATUS' ? 'CONFIRMED' : input.action === 'NEEDS_CORRECTION' ? 'CORRECTED' : input.action === 'NOT_MY_WORK' ? 'NOT_MINE' : 'DISMISSED';
        for (const f of findings) {
          f.status = newStatus; f.reviewedAt = this.state.now; f.reviewDecisionId = dec.id;
          if (f.stepId) {
            const step = this.state.steps.find((s) => s.id === f.stepId);
            if (step) step.observedReview = newStatus === 'CONFIRMED' ? 'EMPLOYEE_CONFIRMED' : newStatus === 'CORRECTED' ? 'CORRECTED' : 'DISMISSED';
          }
          // The finding text and its source events are preserved; the correction is a NEW record, never a rewrite.
          if (f.projectId) {
            this.addJournal({
              projectId: f.projectId, stepIds: f.stepId ? [f.stepId] : [], type: 'EMPLOYEE_REVIEW', actorUid: uid,
              title: `${this.userName(uid)} ${newStatus === 'CONFIRMED' ? 'confirmed' : newStatus === 'CORRECTED' ? 'corrected' : newStatus === 'NOT_MINE' ? 'said “not my work” on' : 'dismissed'} an AI observation`,
              summary: `${f.headline}${fx ? ` — ${this.userName(uid)} ${fx.text}` : ''}${input.correctionText ? ` — correction: ${input.correctionText}` : ''}${input.note ? ` — note: ${input.note}` : ''}. ${newStatus === 'NOT_MINE' ? 'This does not mean no work happened. The activity is kept and is not credited to this person. ' : ''}${fx?.needsCheck ? 'This is the employee’s report. It has not been checked in the source system. ' : ''}The activity check itself does not change the step status.`,
              verificationState: 'EMPLOYEE_CONFIRMED', sourceRefs: f.sourceEventIds,
            });
          }
          this.audit({ entityType: 'finding', entityId: f.id, action: `REVIEW_${newStatus}`, before: { status: 'PROPOSED' }, after: { status: newStatus, correction: input.correctionText ?? null }, actorUid: uid, actorLabel: this.userName(uid), reason: 'Person checked the AI guess', evidenceRefs: f.sourceEventIds, projectId: f.projectId });
        }
        const f0 = findings[0];
        if (input.action === 'SEND_STATUS' && input.statusAnswer && f0?.stepId && f0.projectId) {
          const step = this.state.steps.find((s) => s.id === f0.stepId)!;
          const project = this.state.projects.find((p) => p.id === f0.projectId)!;
          if (this.canWorkOnProject(this.user(uid), project)) this.applyHumanReport(step, project, input.statusAnswer, input.note?.trim() || null, uid, fx && input.outcome ? { outcome: input.outcome, outcomeText: fx.text } : undefined);
        }
        if (input.outcome) { dec.outcome = input.outcome; dec.correction = input.correction ?? null; }
        // Something went wrong: tell Dalia, with the person's own words.
        if (fx?.problem && f0?.projectId) {
          const project = this.state.projects.find((p) => p.id === f0.projectId)!;
          this.notify({ recipientUid: project.ownerUid, senderUid: uid, type: 'BLOCKER', title: `${this.userName(uid)} ran into a problem — ${shortProjectName(project)}`, preview: input.note ?? 'No note was added.', projectId: project.id, stepId: f0.stepId, sourceEntityId: dec.id, deepLink: `/projects/${project.id}${f0.stepId ? `/steps/${f0.stepId}` : ''}`, key: `n:problem:${dec.id}` });
        }
        // Wrong person (shared computer): keep the activity, dispute who did it.
        if (input.correction?.kind === 'WRONG_PERSON' && f0) {
          f0.attributionDisputed = true;
          const owner = this.state.users.find((u) => u.role === 'OWNER')!;
          this.notify({ recipientUid: owner.id, senderUid: uid, type: 'DIRECT_MENTION', title: `${this.userName(uid)} says someone else used that computer`, preview: f0.headline, projectId: f0.projectId, stepId: f0.stepId, sourceEntityId: f0.id, deepLink: f0.projectId ? `/projects/${f0.projectId}` : '/owner/other-work', key: `n:wrongperson:${f0.id}` });
        }
        // Wrong project or step: move the activity to the right step. The first guess stays in the history.
        if (input.correction?.kind === 'WRONG_STEP' && f0 && input.correction.projectId && input.correction.stepId) {
          const project = this.projectFor(uid, input.correction.projectId);
          if (!this.canWorkOnProject(this.user(uid), project)) throw new PermissionDenied();
          const target = this.stepFor(uid, input.correction.stepId).step;
          const was = f0.stepId ? this.state.steps.find((s) => s.id === f0.stepId) : null;
          f0.projectId = project.id; f0.stepId = target.id;
          target.lastActivityAt = this.state.now;
          this.addJournal({ projectId: project.id, stepIds: [target.id], type: 'EMPLOYEE_REVIEW', actorUid: uid, title: 'Activity moved to this step', summary: `${f0.headline} — ${this.userName(uid)} said it belongs here${was ? `, not on “${was.title}”` : ''}. The first guess is kept in the history.`, verificationState: 'EMPLOYEE_CONFIRMED', sourceRefs: f0.sourceEventIds });
        }
        if (input.action === 'CONFIRM' && f0?.findingType === 'AI_UNMATCHED_WORK') this.applyClassification(uid, f0, input.classification ?? null);
        // Optional, separate owner-help flag: a routine note never auto-flags a crisis.
        if (input.needsOwnerHelp && f0?.projectId) {
          const project = this.state.projects.find((p) => p.id === f0.projectId)!;
          this.notify({ recipientUid: project.ownerUid, senderUid: uid, type: 'BLOCKER', title: `${this.userName(uid)} asked for help — ${project.key}`, preview: input.note ?? f0.headline, projectId: project.id, stepId: f0.stepId, sourceEntityId: dec.id, deepLink: `/projects/${project.id}${f0.stepId ? `/steps/${f0.stepId}` : ''}`, key: `n:help:${dec.id}` });
        }
        return dec;
      });
    });
  }

  applyClassification(uid: string, f: Finding, c: { kind: string; projectId?: string; stepId?: string; newStepTitle?: string } | null) {
    if (!c) return;
    if (c.kind === 'ROUTINE' || c.kind === 'POTENTIAL_PROJECT') {
      // Saved to the person's own "other work" list. It does NOT create a step or change any project.
      f.classification = c.kind === 'ROUTINE' ? 'ROUTINE_PRODUCTION' : 'POTENTIAL_NEW_PROJECT';
      const evs = this.state.events.filter((e) => f.sourceEventIds.includes(e.id));
      const fallback = f.refs.fileNames[0] ? `Work on “${f.refs.fileNames[0]}”` : f.headline;
      this.state.workLog.push({
        id: this.nid('wl'), uid, findingId: f.id, kind: c.kind === 'ROUTINE' ? 'EVERYDAY' : 'MAYBE_PROJECT',
        title: c.newStepTitle?.trim() || fallback, loggedAt: this.state.now, deviceId: f.deviceId, evidenceSummaries: evs.map((e) => e.allowedSummary),
      });
      this.audit({ entityType: 'workLog', entityId: f.id, action: c.kind === 'ROUTINE' ? 'LOG_EVERYDAY' : 'LOG_MAYBE_PROJECT', before: null, after: { title: c.newStepTitle ?? fallback }, actorUid: uid, actorLabel: this.userName(uid), reason: 'Employee saved unmatched work', evidenceRefs: f.sourceEventIds, projectId: null });
      if (c.kind === 'POTENTIAL_PROJECT') {
        const owner = this.state.users.find((u) => u.role === 'OWNER')!;
        this.notify({ recipientUid: owner.id, senderUid: uid, type: 'DIRECT_MENTION', title: `${this.userName(uid)} thinks this may be a new project`, preview: c.newStepTitle?.trim() || fallback, projectId: null, sourceEntityId: f.id, deepLink: '/owner/other-work', key: `n:maybeproj:${f.id}` });
      }
      return;
    }
    if (!c.projectId) return;
    const project = this.projectFor(uid, c.projectId);
    if (!this.canWorkOnProject(this.user(uid), project)) throw new PermissionDenied();
    f.classification = 'EXISTING_PROJECT';
    if (c.kind === 'LINK_EXISTING' && c.stepId) {
      const step = this.stepFor(uid, c.stepId).step;
      f.projectId = project.id; f.stepId = step.id;
      step.lastActivityAt = f.sourceEventIds.length ? this.state.events.find((e) => e.id === f.sourceEventIds[f.sourceEventIds.length - 1])?.occurredAt ?? this.state.now : this.state.now;
      this.addJournal({ projectId: project.id, stepIds: [step.id], type: 'EMPLOYEE_REVIEW', actorUid: uid, title: 'Unmatched work attached to a step', summary: `${f.headline} — linked by ${this.userName(uid)}.`, verificationState: 'EMPLOYEE_CONFIRMED', sourceRefs: f.sourceEventIds });
    } else if (c.kind === 'NEW_STEP') {
      const s = this.addStep(uid, project.id, { title: c.newStepTitle?.trim() || f.headline, instructions: 'Created from unmatched work.', assignedUids: [uid] });
      f.projectId = project.id; f.stepId = s.id;
    }
  }

  /** Only low-risk, observed, routine, non-conflicting cards may be confirmed in bulk. High-risk items need individual attention. */
  bulkConfirm(uid: string, cardIds: string[], idempotencyKey: string): { confirmed: string[]; refused: { id: string; reason: string }[] } {
    this.user(uid);
    const refused: { id: string; reason: string }[] = [];
    const eligible: ReviewCard[] = [];
    for (const id of cardIds) {
      const c = this.getCard(uid, id);
      const fs = this.state.findings.filter((f) => c.findingIds.includes(f.id));
      const step = fs[0]?.stepId ? this.state.steps.find((s) => s.id === fs[0].stepId) : null;
      if (!c.canBulkReview || c.cardType !== 'AI_PROGRESS' || fs.some((f) => f.claimType !== 'OBSERVED_ACTION' || f.uncertainties.some((u) => /conflict|contradict/i.test(u))) || step?.impact === 'HIGH') {
        refused.push({ id, reason: 'High-risk or conflicting evidence needs individual confirmation.' });
      } else eligible.push(c);
    }
    const confirmed: string[] = [];
    for (const c of eligible) { this.submitDecision(uid, c.id, { action: 'CONFIRM', idempotencyKey: `${idempotencyKey}:${c.id}` }); confirmed.push(c.id); }
    return { confirmed, refused };
  }

  // ------------------------------------------------------------------ journal & audit
  getJournal(uid: string, f: {
    projectId?: string; stepId?: string; types?: JournalType[]; verifiedOnly?: boolean; q?: string; day?: string; order?: 'newest' | 'oldest'; actorUid?: string; aiOnly?: boolean;
  } = {}): (ProjectEvent & { projectKey: string })[] {
    const u = this.user(uid);
    const readable = new Set(this.state.projects.filter((p) => this.canReadProject(u, p)).map((p) => p.id));
    if (f.projectId && !readable.has(f.projectId)) throw new PermissionDenied();
    const needle = f.q?.trim().toLowerCase();
    const out = this.state.projectEvents.filter((e) => {
      if (!readable.has(e.projectId)) return false;
      if (f.projectId && e.projectId !== f.projectId) return false;
      if (f.stepId && !e.stepIds.includes(f.stepId)) return false; // the same stored events, filtered — no second diary
      if (f.types?.length && !f.types.includes(e.type)) return false;
      if (f.verifiedOnly && e.verificationState !== 'INDEPENDENTLY_VERIFIED') return false;
      if (f.aiOnly && e.actorType !== 'AI') return false;
      if (f.actorUid && e.actorUid !== f.actorUid) return false;
      if (f.day && chicagoDate(e.occurredAt) !== f.day) return false;
      if (needle) {
        // Search covers the entry text AND the redacted summaries of the evidence events it cites (SKU, file name, ref IDs).
        const evidenceText = this.state.events.filter((x) => e.sourceRefs.includes(x.id)).map((x) => x.allowedSummary).join(' ');
        if (!`${e.title} ${e.summary} ${evidenceText}`.toLowerCase().includes(needle)) return false;
      }
      return true;
    });
    out.sort((a, b) => (f.order === 'oldest' ? 1 : -1) * a.occurredAt.localeCompare(b.occurredAt) || a.id.localeCompare(b.id));
    return out.map((e) => ({ ...e, projectKey: this.state.projects.find((p) => p.id === e.projectId)!.key }));
  }

  getAudit(uid: string, projectId?: string): AuditEvent[] {
    this.requireOwner(uid);
    return this.state.auditEvents.filter((a) => !projectId || a.projectId === projectId).slice().reverse();
  }

  // ------------------------------------------------------------------ resources
  visibleResources(u: User): Resource[] {
    if (u.role === 'OWNER') return this.state.resources;
    const readable = new Set(this.state.projects.filter((p) => this.canReadProject(u, p)).map((p) => p.id));
    return this.state.resources.filter((r) => r.visibility !== 'OWNER_PRIVATE' && (r.visibility === 'TEAM_SHARED' || this.state.resourceLinks.some((l) => l.resourceId === r.id && readable.has(l.projectId) && l.associationState !== 'REJECTED')));
  }
  listResources(uid: string, q = ''): { resource: Resource; links: (ResourceLink & { projectKey: string; stepTitle: string | null })[] }[] {
    const u = this.user(uid);
    const needle = q.trim().toLowerCase();
    const readable = new Set(this.state.projects.filter((p) => this.canReadProject(u, p)).map((p) => p.id));
    return this.visibleResources(u)
      .filter((r) => !needle || `${r.label} ${r.purpose} ${r.normalizedPath ?? ''} ${r.skuFamilies.join(' ')}`.toLowerCase().includes(needle))
      .map((resource) => ({
        resource,
        links: this.state.resourceLinks.filter((l) => l.resourceId === resource.id && readable.has(l.projectId)).map((l) => ({
          ...l, projectKey: this.state.projects.find((p) => p.id === l.projectId)!.key, stepTitle: this.state.steps.find((s) => s.id === l.stepId)?.title ?? null,
        })),
      }));
  }
  stepResources(uid: string, stepId: string) {
    const { step } = this.stepFor(uid, stepId);
    const u = this.user(uid);
    const visible = new Set(this.visibleResources(u).map((r) => r.id));
    return this.state.resourceLinks
      .filter((l) => l.stepId === step.id && l.associationState !== 'REJECTED' && visible.has(l.resourceId))
      .map((l) => ({ link: l, resource: this.state.resources.find((r) => r.id === l.resourceId)! }));
  }
  projectResources(uid: string, projectId: string) {
    this.projectFor(uid, projectId);
    const visible = new Set(this.visibleResources(this.user(uid)).map((r) => r.id));
    return this.state.resourceLinks
      .filter((l) => l.projectId === projectId && l.associationState !== 'REJECTED' && visible.has(l.resourceId))
      .map((l) => ({ link: l, resource: this.state.resources.find((r) => r.id === l.resourceId)!, stepTitle: this.state.steps.find((s) => s.id === l.stepId)?.title ?? null }));
  }

  reviewResourceLink(uid: string, linkId: string, action: 'CONFIRM' | 'NOT_RELATED' | 'CHANGE_STEP', newStepId?: string): ResourceLink {
    const link = this.state.resourceLinks.find((l) => l.id === linkId);
    if (!link) throw new PermissionDenied();
    const project = this.projectFor(uid, link.projectId);
    if (!this.canWorkOnProject(this.user(uid), project)) throw new PermissionDenied();
    if (action === 'CHANGE_STEP') { const s = this.stepFor(uid, newStepId ?? ''); if (s.step.projectId !== project.id) throw new PermissionDenied(); }
    return this.commit(() => {
      const before = { state: link.associationState, stepId: link.stepId };
      if (action === 'CONFIRM') { link.associationState = 'CONFIRMED'; link.approvedBy = uid; }
      if (action === 'NOT_RELATED') link.associationState = 'REJECTED';
      if (action === 'CHANGE_STEP') { link.stepId = newStepId!; link.associationState = 'CONFIRMED'; link.approvedBy = uid; }
      link.lastReviewedAt = this.state.now;
      const res = this.state.resources.find((r) => r.id === link.resourceId)!;
      if (action !== 'NOT_RELATED' && res.provenance === 'AI_SUGGESTED') res.provenance = this.isOwner(uid) ? 'OWNER_APPROVED' : 'EMPLOYEE_CONFIRMED';
      this.audit({ entityType: 'resourceLink', entityId: link.id, action: `REVIEW_${action}`, before, after: { state: link.associationState, stepId: link.stepId }, actorUid: uid, actorLabel: this.userName(uid), reason: 'Resource link review', evidenceRefs: link.evidenceRefs, projectId: project.id });
      this.addJournal({ projectId: project.id, stepIds: link.stepId ? [link.stepId] : [], type: 'RESOURCE', actorUid: uid, title: action === 'NOT_RELATED' ? 'Resource marked not related' : 'Resource linked to step', summary: `${res.label} as ${link.role.replace(/_/g, ' ').toLowerCase()}.`, verificationState: 'EMPLOYEE_CONFIRMED', relatedResourceIds: [res.id] });
      return link;
    });
  }

  /** Newer versions only ever become *suggestions*. Approval is a deliberate act and the old version is retained in history. */
  // ------------------------------------------------------------------ file versions: three different things
  //  1. SELECT a working version  = "I will use this one." Anyone who can see the file. Changes nothing official.
  //  2. SUBMIT for approval       = "Dalia, please approve this one." People on the project. Approves nothing.
  //  3. APPROVE for team use      = the official decision. Dalia only. Recorded with who, when, old and new.
  private resourceAccess(uid: string, resourceId: string) {
    const u = this.user(uid);
    const res = this.visibleResources(u).find((r) => r.id === resourceId);
    if (!res) throw new PermissionDenied();
    const links = this.state.resourceLinks.filter((l) => l.resourceId === res.id);
    const onProject = u.role === 'OWNER' || links.some((l) => this.canWorkOnProject(u, this.state.projects.find((p) => p.id === l.projectId)!));
    return { u, res, links, onProject };
  }
  /** Can this person choose the version to use? Dalia, or someone on a project that uses this file. */
  canChooseVersion(uid: string, resourceId: string): boolean { try { return this.resourceAccess(uid, resourceId).onProject; } catch { return false; } }
  ownerUids(): string[] { return this.state.users.filter((u) => u.role === 'OWNER').map((u) => u.id); }
  /** What a person chose to work with. It is a personal choice. It is never an approval. */
  workingVersionFor(uid: string, resourceId: string): string | null {
    return this.state.workingVersions.find((w) => w.uid === uid && w.resourceId === resourceId)?.version ?? null;
  }
  selectWorkingVersion(uid: string, resourceId: string, version?: string) {
    const { res } = this.resourceAccess(uid, resourceId);
    const v = version ?? res.version ?? 'current';
    return this.commit(() => {
      const mine = this.state.workingVersions.find((w) => w.uid === uid && w.resourceId === resourceId);
      if (mine) { mine.version = v; mine.at = this.state.now; } else this.state.workingVersions.push({ uid, resourceId, version: v, at: this.state.now });
      this.audit({ entityType: 'resource', entityId: res.id, action: 'SELECT_WORKING_VERSION', before: null, after: { version: v }, actorUid: uid, actorLabel: this.userName(uid), reason: 'Chose a version to work with. Not an approval.', evidenceRefs: [], projectId: null });
      return res;
    });
  }
  submitForApproval(uid: string, resourceId: string, input: { version?: string; note?: string | null; idempotencyKey: string }) {
    const { res, links, onProject } = this.resourceAccess(uid, resourceId);
    if (!onProject) throw new PermissionDenied();
    const version = input.version ?? res.version ?? 'current';
    return this.idem('submitappr:' + input.idempotencyKey, () => {
      if (res.pendingApproval?.version === version && res.pendingApproval.requestedByUid === uid) return res; // already waiting: no second request, no second notification
      return this.commit(() => {
        res.pendingApproval = { version, requestedByUid: uid, at: this.state.now, note: input.note?.trim() || null };
        const link = links.find((l) => l.stepId) ?? links[0];
        const project = link ? this.state.projects.find((p) => p.id === link.projectId) : null;
        this.audit({ entityType: 'resource', entityId: res.id, action: 'SUBMIT_FOR_APPROVAL', before: null, after: { version }, actorUid: uid, actorLabel: this.userName(uid), reason: 'Asked the owner to approve a version', evidenceRefs: [], projectId: project?.id ?? null });
        for (const pid of new Set(links.map((l) => l.projectId))) this.addJournal({ projectId: pid, stepIds: links.filter((l) => l.projectId === pid && l.stepId).map((l) => l.stepId!), type: 'RESOURCE', actorUid: uid, title: `${this.userName(uid)} asked for approval of a file version`, summary: `${res.label}: ${version}.${res.pendingApproval!.note ? ` Note: “${res.pendingApproval!.note}”.` : ''} Waiting for Dalia. Nothing is approved yet.`, verificationState: 'EMPLOYEE_CONFIRMED', relatedResourceIds: [res.id] });
        for (const o of this.ownerUids()) this.notify({ recipientUid: o, senderUid: uid, type: 'APPROVAL_REQUEST', title: `${this.userName(uid)} asked you to approve a file version`, preview: `${res.label} — ${version}`, projectId: project?.id ?? null, stepId: link?.stepId ?? null, sourceEntityId: res.id, deepLink: project ? `/projects/${project.id}${link?.stepId ? `/steps/${link.stepId}` : ''}` : '/resources', key: `n:apprreq:${res.id}:${version}:${uid}` });
        return res;
      });
    });
  }
  /** Official approval. Dalia only. Checked here, not only in the buttons. */
  approveVersion(uid: string, resourceId: string, version: string, opts: { supersedesResourceId?: string | null } = {}) {
    const { res, links, onProject } = this.resourceAccess(uid, resourceId);
    if (!onProject) throw new PermissionDenied(); // Dalia, or a person on the project that uses this file
    if (res.approval?.version === version && res.approvedVersion === version && !res.pendingApproval) return res; // already approved: a repeat click changes nothing and adds nothing
    return this.commit(() => {
      const before = { version: res.version, approvedVersion: res.approvedVersion, approval: res.approval ?? null, pending: res.pendingApproval ?? null };
      if (res.suggestedVersion?.version === version) { res.version = version; res.lastModifiedAt = res.suggestedVersion.modifiedAt; res.suggestedVersion = null; }
      if (res.approvedVersion && res.approvedVersion !== version) (res.supersededVersions ??= []).push({ version: res.approvedVersion, at: this.state.now, byUid: uid });
      const requester = res.pendingApproval?.requestedByUid ?? null;
      res.approvedVersion = version; res.approval = { version, byUid: uid, at: this.state.now }; res.isDraft = false; res.pendingApproval = null;
      let replaced: Resource | null = null;
      if (opts.supersedesResourceId && opts.supersedesResourceId !== res.id) {
        replaced = this.state.resources.find((r) => r.id === opts.supersedesResourceId) ?? null;
        if (replaced) { replaced.supersededById = res.id; replaced.pendingApproval = null; }
      }
      this.audit({ entityType: 'resource', entityId: res.id, action: 'APPROVE_RESOURCE_VERSION', before, after: { version: res.version, approvedVersion: version, approvedBy: uid, supersedes: replaced?.id ?? null }, actorUid: uid, actorLabel: this.userName(uid), reason: 'A file version was chosen for the project', evidenceRefs: [], projectId: links[0]?.projectId ?? null });
      for (const pid of new Set(links.map((l) => l.projectId))) this.addJournal({ projectId: pid, stepIds: links.filter((l) => l.projectId === pid && l.stepId).map((l) => l.stepId!), type: 'RESOURCE', actorUid: uid, title: 'Version chosen for the project', summary: `${res.label}: ${before.approvedVersion ? `${before.approvedVersion} → ` : 'no version chosen → '}${version}, chosen by ${this.userName(uid)}.${replaced ? ` This replaces “${replaced.label}”.` : ''}`, verificationState: 'OWNER_APPROVED', relatedResourceIds: [res.id] });
      if (requester && requester !== uid) this.notify({ recipientUid: requester, senderUid: uid, type: 'DIRECT_MENTION', title: `${this.userName(uid)} approved ${res.label}`, preview: `Version ${version} is now the one to use.`, projectId: links[0]?.projectId ?? null, sourceEntityId: res.id, deepLink: links[0] ? `/projects/${links[0].projectId}${links[0].stepId ? `/steps/${links[0].stepId}` : ''}` : '/resources', key: `n:apprdone:${res.id}:${version}` });
      return res;
    });
  }
  /** Backward-compatible name. It is the same owner-only approval. */
  setApprovedVersion(uid: string, resourceId: string, version: string) { return this.approveVersion(uid, resourceId, version); }
  declineApproval(uid: string, resourceId: string, note?: string | null) {
    this.requireOwner(uid);
    const { res, links } = this.resourceAccess(uid, resourceId);
    const pend = res.pendingApproval;
    if (!pend) return res;
    return this.commit(() => {
      res.pendingApproval = null;
      this.audit({ entityType: 'resource', entityId: res.id, action: 'DECLINE_APPROVAL', before: { pending: pend }, after: { pending: null }, actorUid: uid, actorLabel: this.userName(uid), reason: note?.trim() || 'Not approved', evidenceRefs: [], projectId: links[0]?.projectId ?? null });
      for (const pid of new Set(links.map((l) => l.projectId))) this.addJournal({ projectId: pid, type: 'RESOURCE', actorUid: uid, title: 'File version not approved', summary: `${res.label}: ${pend.version} was not approved${note ? ` — ${note}` : ''}.`, verificationState: 'OWNER_APPROVED', relatedResourceIds: [res.id] });
      this.notify({ recipientUid: pend.requestedByUid, senderUid: uid, type: 'DIRECT_MENTION', title: `${this.userName(uid)} did not approve ${res.label}`, preview: note?.trim() || 'Please ask Dalia what to use instead.', projectId: links[0]?.projectId ?? null, sourceEntityId: res.id, deepLink: '/resources', key: `n:apprno:${res.id}:${pend.version}` });
      return res;
    });
  }
  /** Dalia, and the people on a project that uses this file, may choose its version. */
  approverUids(res: Resource): string[] {
    const pids = new Set(this.state.resourceLinks.filter((l) => l.resourceId === res.id).map((l) => l.projectId));
    const members = this.state.projects.filter((p) => pids.has(p.id)).flatMap((p) => p.memberUids);
    return [...new Set([...this.ownerUids(), ...members])];
  }
  /** True only when the choice has a matching record by someone allowed to make it. A bare approvedVersion on its own is not trusted. */
  approvalIsRecorded(res: Resource): boolean {
    return !!res.approvedVersion && !!res.approval && res.approval.version === res.approvedVersion && this.approverUids(res).includes(res.approval.byUid);
  }
  /** Resources that are waiting for Dalia, for her Home. */
  pendingApprovals(uid: string) {
    this.requireOwner(uid);
    return this.state.resources.filter((r) => r.pendingApproval).map((r) => ({ resource: r, pending: r.pendingApproval! }));
  }
  /**
   * Fix a resource whose location is not confirmed. We never invent a link: a path is saved as a path,
   * and a link is saved as "not checked yet" until a real integration verifies it.
   */
  setResourceLocation(uid: string, resourceId: string, location: string) {
    const u = this.user(uid);
    const res = this.visibleResources(u).find((r) => r.id === resourceId);
    if (!res) throw new PermissionDenied();
    const links = this.state.resourceLinks.filter((l) => l.resourceId === res.id);
    if (u.role !== 'OWNER' && !links.some((l) => this.canWorkOnProject(u, this.state.projects.find((p) => p.id === l.projectId)!))) throw new PermissionDenied();
    const loc = location.trim();
    if (!loc) throw new HubError('VALIDATION', 'Type where it is, like a folder path or a link.');
    const isPath = /^([a-z]:\\|\\\\)/i.test(loc);
    return this.commit(() => {
      const before = { normalizedPath: res.normalizedPath, canonicalUrl: res.canonicalUrl, linkState: res.linkState };
      if (isPath) { res.normalizedPath = loc; res.linkState = 'LOCAL_ONLY'; }
      else { res.notes = `${res.notes ? res.notes + ' ' : ''}${this.userName(uid)} says it is here: ${loc} (not checked yet).`; }
      this.audit({ entityType: 'resource', entityId: res.id, action: 'SET_RESOURCE_LOCATION', before, after: { location: loc, verified: false }, actorUid: uid, actorLabel: this.userName(uid), reason: 'Person supplied a location. It is not verified.', evidenceRefs: [], projectId: links[0]?.projectId ?? null });
      for (const pid of new Set(links.map((l) => l.projectId))) this.addJournal({ projectId: pid, type: 'RESOURCE', actorUid: uid, title: 'File location added', summary: `${res.label}: ${this.userName(uid)} said it is at ${loc}. Not checked yet.`, verificationState: 'EMPLOYEE_CONFIRMED', relatedResourceIds: [res.id] });
      return res;
    });
  }
  keepApprovedDismissSuggestion(uid: string, resourceId: string) {
    this.requireOwner(uid);
    const res = this.visibleResources(this.user(uid)).find((r) => r.id === resourceId);
    if (!res) throw new PermissionDenied();
    return this.commit(() => { res.suggestedVersion = null; return res; });
  }
  markSuperseded(uid: string, oldId: string, newId: string) {
    this.requireOwner(uid);
    const old = this.state.resources.find((r) => r.id === oldId); const nw = this.state.resources.find((r) => r.id === newId);
    if (!old || !nw) throw new HubError('NOT_FOUND', 'We could not find that file.');
    return this.commit(() => { old.supersededById = nw.id; this.audit({ entityType: 'resource', entityId: old.id, action: 'SUPERSEDE', before: null, after: nw.id, actorUid: uid, actorLabel: this.userName(uid), reason: 'Marked superseded; history retained', evidenceRefs: [], projectId: null }); return old; });
  }

  // ------------------------------------------------------------------ independent verification (simulated verifier)
  /** Stand-in for a trusted connector. A verifier result is recorded alongside — never in place of — earlier observations. */
  recordVerification(uid: string, stepId: string, input: { verifier: string; entity: string; result: 'CONFIRMED' | 'NOT_FOUND' | 'MISMATCH'; detail: string }) {
    if (!DEMO_MODE) throw new HubError('DEMO_ONLY', 'This is only for the demo.');
    this.requireOwner(uid);
    const { step, project } = this.stepFor(uid, stepId);
    return this.commit(() => {
      const v = { id: this.nid('ver'), stepId, ...input, at: this.state.now, recordedBy: uid };
      step.verifications.push(v);
      if (input.result === 'CONFIRMED') { step.lastVerifiedAt = this.state.now; step.observedReview = 'EXTERNALLY_VERIFIED'; step.observedLevel = 'RESULT_OBSERVED'; project.lastVerifiedAt = this.state.now; }
      this.audit({ entityType: 'verification', entityId: v.id, action: 'RECORD', before: null, after: v, actorUid: uid, actorLabel: `${this.userName(uid)} (via simulated verifier)`, reason: 'Independent verification result (pretend)', evidenceRefs: [], projectId: project.id });
      this.addJournal({
        projectId: project.id, stepIds: [stepId], type: 'VERIFICATION', actorUid: null, actorLabel: `${input.verifier} (pretend)`, actorType: 'SERVICE',
        title: `System check: ${input.result === 'CONFIRMED' ? 'it matches' : input.result === 'NOT_FOUND' ? 'not found' : 'does not match'}`, summary: `${input.entity} — ${input.detail}. Earlier notes are kept. The step status did not change by itself.`,
        verificationState: input.result === 'CONFIRMED' ? 'INDEPENDENTLY_VERIFIED' : 'NEEDS_REVIEW',
      });
      if (input.result !== 'CONFIRMED') this.notify({ recipientUid: project.ownerUid, senderUid: null, type: 'NEEDS_VERIFICATION', title: `The system check did not match — ${project.key}`, preview: input.detail, projectId: project.id, stepId, sourceEntityId: v.id, deepLink: `/projects/${project.id}/steps/${stepId}`, key: `n:ver:${v.id}` });
      return v;
    });
  }

  // ------------------------------------------------------------------ MT Log intake (deterministic, no LLM)
  adapter: ModelAdapter = new ReplayAnalyzer();
  setAdapter(a: ModelAdapter) { this.adapter = a; }
  private analysisInFlight = false;

  coverageFor(deviceId: string): CoverageState {
    const arch = this.state.archives.filter((a) => a.deviceId === deviceId);
    if (!arch.length) return 'MISSING';
    if (arch.some((a) => a.coverageState === 'INCOMPLETE')) return 'INCOMPLETE';
    if (arch.some((a) => a.coverageState === 'PROVISIONAL')) return 'PROVISIONAL';
    return 'FINAL';
  }
  primaryUserFor(deviceId: string): User | null {
    // A routing hint for who reviews a device's activity — NOT attribution of who did the work.
    return this.state.users.find((u) => u.active && u.primaryDeviceId === deviceId) ?? null;
  }

  /** Re-evaluate whether provisional hour files have since ended (e.g. after time advances). */
  refreshCoverage() {
    for (const a of this.state.archives) {
      const hourEnd = addMinutes(chicagoToUtc(a.day, `${String(a.hourWindow).padStart(2, '0')}:00`), 60);
      if (a.coverageState === 'PROVISIONAL' && !a.partialTail && this.state.now >= hourEnd) a.coverageState = 'FINAL';
    }
  }

  ingestFile(input: { deviceId: string; day: string; hour: number; fileId: string; text: string; final?: boolean }): IntakeRun {
    return this.commit(() => {
      const st = this.state;
      const at = (sec: number) => new Date(Date.parse(st.now) + sec * 1000).toISOString();
      const archiveId = `arch-${input.deviceId}-${input.day}-${input.hour}`;
      const run: IntakeRun = { id: this.nid('run'), archiveId, deviceId: input.deviceId, startedAt: st.now, added: 0, indexed: 0, deduplicated: 0, parseFailures: 0, stages: [], dataThrough: null };
      st.intakeRuns.push(run);
      const stage = (name: string, s: number, e: number | null, state: IntakeStage['state'], error?: string) => run.stages.push({ name, startedAt: at(s), endedAt: e === null ? null : at(e), state, error });
      stage('Detected file update', 0, 1, 'DONE');
      if (st.settings.logSyncOutage) {
        stage('Fetching', 1, 3, 'FAILED', 'Google Drive is not reachable (pretend). We will try again. Clocking in and out still works.');
        return run;
      }
      const hash = hashText(input.text);
      let archive = st.archives.find((a) => a.id === archiveId);
      if (archive && archive.hash === hash) {
        stage('Fetching', 1, 2, 'DONE');
        stage('No meaningful change', 2, 2, 'SKIPPED');
        archive.lastSeenAt = st.now;
        run.dataThrough = archive.maxTimestamp;
        return run;
      }
      stage('Fetching', 1, 2, 'DONE');
      const parsed = parseJsonl(input.text);
      stage('Parsing', 2, 3, 'DONE');
      const known = new Set(st.events.map((e) => e.id));
      const seenInFile = new Set<string>();
      const known2 = new Set(st.users.map((u) => u.id));
      let added = 0, dups = 0;
      for (const raw of parsed.events) {
        if (known.has(raw.event_id) || seenInFile.has(raw.event_id)) { dups++; continue; }
        seenInFile.add(raw.event_id);
        st.events.push(normalizeEvent(raw, archiveId, st.now, known2));
        added++;
      }
      const hourEnd = addMinutes(chicagoToUtc(input.day, `${String(input.hour).padStart(2, '0')}:00`), 60);
      const gaps = findSequenceGaps(parsed.events);
      const mine = st.events.filter((e) => e.sourceArchiveId === archiveId);
      const times = mine.map((e) => e.occurredAt).sort();
      const coverage: CoverageState = gaps.length ? 'INCOMPLETE' : parsed.partialTail ? 'PROVISIONAL' : st.now >= hourEnd || input.final ? 'FINAL' : 'PROVISIONAL';
      if (!archive) {
        archive = { id: archiveId, deviceId: input.deviceId, day: input.day, hourWindow: input.hour, provider: 'demo-drive', fileId: input.fileId, revision: 0, hash: '', ingestedAt: st.now, lastSeenAt: st.now, eventCount: 0, minTimestamp: null, maxTimestamp: null, coverageState: coverage, sequenceGaps: [], parseFailures: 0, duplicatesSkipped: 0, lastProcessedLine: 0, partialTail: false };
        st.archives.push(archive);
      }
      archive.revision++; archive.hash = hash; archive.lastSeenAt = st.now; archive.eventCount = mine.length;
      archive.minTimestamp = times[0] ?? null; archive.maxTimestamp = times[times.length - 1] ?? null;
      archive.coverageState = coverage; archive.sequenceGaps = gaps; archive.parseFailures = parsed.parseFailures;
      archive.duplicatesSkipped += dups; archive.lastProcessedLine = parsed.completeLines; archive.partialTail = parsed.partialTail;
      st.rawFileText[input.fileId] = input.text;
      st.deviceLastSeen[input.deviceId] = [st.deviceLastSeen[input.deviceId] ?? '', archive.maxTimestamp ?? ''].sort().pop() as string;
      stage('Indexed', 3, 4, 'DONE');
      const ep = assignEpisodes(st.events, st.episodes, () => this.nid('ep'));
      stage('Correlating', 4, 5, 'DONE');
      stage('AI review queued', 5, null, added ? 'PENDING' : 'SKIPPED');
      run.added = added; run.indexed = added; run.deduplicated = dups; run.parseFailures = parsed.parseFailures; run.dataThrough = archive.maxTimestamp;
      void ep;
      return run;
    });
  }

  // ------------------------------------------------------------------ AI pipeline (typed JSON in, proposals out)
  monthSpendUsd() { return this.state.aiRuns.reduce((s, r) => s + r.costUsd, 0); }

  buildContext(deviceId: string, recipient: User): AnalysisContext {
    const projects = this.state.projects.filter((p) => this.canReadProject(recipient, p));
    const ids = new Set(projects.map((p) => p.id));
    return {
      nowIso: this.state.now,
      steps: this.state.steps.filter((s) => ids.has(s.projectId)).map((s) => ({ id: s.id, projectId: s.projectId, title: s.title, status: s.status, evidenceHints: s.evidenceHints, impact: s.impact })),
      projects: projects.map((p) => ({ id: p.id, key: p.key, title: p.title })),
      events: this.state.events.filter((e) => e.deviceId === deviceId),
      episodes: this.state.episodes.filter((e) => e.deviceId === deviceId),
      coverageByDevice: { [deviceId]: this.coverageFor(deviceId) },
      previousFindings: this.state.findings.filter((f) => f.deviceId === deviceId).map((f) => ({ id: f.id, stepId: f.stepId, groupKey: f.groupKey, status: f.status, sourceEventIds: f.sourceEventIds })),
    };
  }

  async runAnalysis(cause = 'scheduled', opts: { optional?: boolean } = {}): Promise<{ created: number; updated: number; late: number; run: AiRun }> {
    const startedAt = this.state.now;
    const mkRun = (outcome: AiRun['outcome'], errors: string[], extra: Partial<AiRun> = {}): AiRun => ({
      id: this.nid('airun'), startedAt, endedAt: this.state.now, cause, model: this.adapter.name, inputTokens: 0, outputTokens: 0, costUsd: 0, outcome,
      promptVersion: this.adapter.promptVersion, sourceWatermark: Object.values(this.state.deviceLastSeen).sort().pop() ?? null, errors, ...extra,
    });
    const stats = { created: 0, updated: 0, late: 0 };
    if (this.analysisInFlight) { const run = mkRun('SKIPPED_BUDGET', ['Another AI check is already running.']); return { ...stats, run }; }
    if (opts.optional && this.monthSpendUsd() >= this.state.settings.monthlyBudgetUsd * (this.state.settings.budgetCircuitBreakerPct / 100)) {
      const run = this.commit(() => { const r = mkRun('SKIPPED_BUDGET', ['Extra AI work was skipped because the money limit was reached. Needed reviews keep going.']); this.state.aiRuns.push(r); return r; });
      return { ...stats, run };
    }
    if (this.state.settings.aiOutage) {
      const run = this.commit(() => { const r = mkRun('FAILED', ['The AI helper is down (pretend). The time clock and requests still work. Your cards stay.']); this.state.aiRuns.push(r); return r; });
      return { ...stats, run };
    }
    this.analysisInFlight = true;
    const errors: string[] = [];
    try {
      const devices = [...new Set(this.state.events.map((e) => e.deviceId))];
      for (const dev of devices) {
        const recipient = this.primaryUserFor(dev) ?? this.state.users.find((u) => u.role === 'OWNER')!;
        let raw: unknown[] = [];
        try { raw = await this.adapter.analyze(this.buildContext(dev, recipient)); } catch (e) { errors.push(`${dev}: ${(e as Error).message}`); continue; }
        const valid: FindingDraft[] = [];
        raw.forEach((d, i) => { const errs = validateFindingDraft(d); if (errs.length) errors.push(`${dev} finding #${i}: ${errs.join('; ')}`); else valid.push(d as FindingDraft); });
        this.commit(() => { const s = this.ingestFindings(valid, recipient); stats.created += s.created; stats.updated += s.updated; stats.late += s.late; });
      }
    } finally { this.analysisInFlight = false; }
    const run = this.commit(() => {
      const r = mkRun(errors.length && !stats.created && !stats.updated && !stats.late ? 'FAILED' : 'OK', errors);
      this.state.aiRuns.push(r);
      for (const ir of this.state.intakeRuns) {
        const pend = ir.stages.find((s) => s.name === 'AI review queued' && s.state === 'PENDING');
        if (pend) { pend.state = 'DONE'; pend.endedAt = this.state.now; ir.stages.push({ name: 'Candidate findings created', startedAt: this.state.now, endedAt: this.state.now, state: 'DONE' }, { name: 'Employee confirmation pending', startedAt: this.state.now, endedAt: null, state: 'PENDING' }); }
      }
      return r;
    });
    return { ...stats, run };
  }

  private static LEVEL_RANK: Record<string, number> = { NO_EVIDENCE: 0, INCONCLUSIVE: 1, POSSIBLE_ACTIVITY: 2, STRONG_ACTIVITY: 3, DELIVERABLE_OBSERVED: 4, RESULT_OBSERVED: 5 };

  ingestFindings(drafts: FindingDraft[], recipient: User): { created: number; updated: number; late: number } {
    const st = this.state;
    const stats = { created: 0, updated: 0, late: 0 };
    for (const d of drafts) {
      const prev = [...st.findings].reverse().find((f) => f.groupKey === d.groupKey && f.deviceId === d.deviceId && f.status !== 'SUPERSEDED' && f.findingType !== 'LATE_EVIDENCE');
      // Events already covered by the previous finding OR by a late-evidence supplement are not "new" again.
      const covered = new Set(st.findings.filter((f) => f.deviceId === d.deviceId && (f.groupKey === d.groupKey || (prev && f.groupKey.startsWith(`late:${prev.id}:`)))).flatMap((f) => f.sourceEventIds));
      const newIds = prev ? d.sourceEventIds.filter((id) => !covered.has(id)) : d.sourceEventIds;
      if (prev && !newIds.length) continue; // nothing new: no churn, no duplicate cards
      const lastEv = st.events.filter((e) => d.sourceEventIds.includes(e.id)).map((e) => e.occurredAt).sort().pop() ?? st.now;
      const base = {
        deviceId: d.deviceId, actorUid: null, actorEvidenceState: 'DEVICE_ONLY_ACTOR_UNVERIFIED' as const, modelRunId: this.nid('mr'), promptVersion: this.adapter.promptVersion,
        issuedAt: st.now, reviewedAt: null, reviewDecisionId: null,
      };
      const area = this.areaOn(recipient.id, lastEv);
      const wantsCard = recipient.role === 'OWNER' || area === 'PROJECT' || area === 'MIXED';
      const reviewedPrev = prev && ['CONFIRMED', 'CORRECTED', 'DISMISSED', 'NOT_MINE'].includes(prev.status);

      if (prev && reviewedPrev) {
        // Late evidence: an immutable supplement. The earlier confirmation is never rewritten.
        const newEvs = st.events.filter((e) => newIds.includes(e.id));
        const f: Finding = {
          ...d, ...base, id: this.nid('fnd'), findingType: 'LATE_EVIDENCE', claimType: d.claimType, headline: `New facts came in after your review: ${d.headline}`,
          observedFacts: newEvs.map(describeEvent), inference: 'These events arrived after you checked this. They may change things, so please look again. Your first answer is kept as it was.',
          sourceEventIds: newIds, status: 'PROPOSED', supersedesFindingId: null, groupKey: `late:${prev.id}:${newIds[newIds.length - 1]}`,
        };
        st.findings.push(f);
        stats.late++;
        if (wantsCard) {
          st.reviewCards.push(this.newCard('LATE_EVIDENCE', recipient.id, f, 'New facts came in late', f.inference));
          this.notify({ recipientUid: recipient.id, senderUid: null, type: 'NEEDS_VERIFICATION', title: `New facts came in late — ${d.projectId ? st.projects.find((p) => p.id === d.projectId)?.key : 'review'}`, preview: f.headline, projectId: d.projectId, stepId: d.stepId, sourceEntityId: f.id, deepLink: '/review', key: `n:late:${f.id}` });
        }
        const step = d.stepId ? st.steps.find((s) => s.id === d.stepId) : null;
        if (step) { step.observedReview = 'PENDING_EMPLOYEE'; step.newActivityAt = lastEv; step.observedNote = 'Late evidence arrived after review — summary flagged for reconsideration.'; }
        if (d.projectId) this.addJournal({ projectId: d.projectId, stepIds: d.stepId ? [d.stepId] : [], type: 'LATE_EVIDENCE', actorUid: null, actorType: 'AI', actorLabel: `${d.deviceId} device; actor unverified (automated AI suggestion)`, title: 'New facts came in late', summary: `${newEvs.length} event(s) came in after the review. The first answer is kept.`, verificationState: 'AI_DETECTED', confidenceBand: d.confidenceBand, sourceRefs: newIds });
        this.audit({ entityType: 'finding', entityId: f.id, action: 'LATE_EVIDENCE_CREATED', before: null, after: { relatesTo: prev.id }, actorUid: null, actorLabel: 'AI engine (replay adapter)', reason: 'Material events arrived after review', evidenceRefs: newIds, projectId: d.projectId });
        continue;
      }

      const f: Finding = { ...d, ...base, id: this.nid('fnd'), status: 'PROPOSED', supersedesFindingId: prev?.id ?? null };
      const pj = f.projectId ? st.projects.find((p) => p.id === f.projectId) : null;
      if (pj?.pause?.isPaused) {
        // Neutral wording: a paused project can still have planned tests, blocker fixes or saved documents. Nothing resumes.
        f.whilePaused = true;
        f.headline = `We found activity that may belong to ${pj.key} while it is paused`;
        f.inference = 'This may be a planned test, a fix for something in the way, or a document being saved. Nothing was resumed and nothing is wrong. Please tell us what it was.';
        f.proposedUpdate = { kind: 'ASK_EMPLOYEE', detail: 'Ask what the activity was. The project stays paused.' };
        f.uncertainties = f.uncertainties.filter((u) => !/tracker still says/i.test(u));
      }
      st.findings.push(f);
      if (prev) { prev.status = 'SUPERSEDED'; stats.updated++; } else stats.created++;
      this.audit({ entityType: 'finding', entityId: f.id, action: prev ? 'UPDATED' : 'CREATED', before: prev ? { id: prev.id } : null, after: { type: f.findingType, claim: f.claimType, level: f.inferenceLevel }, actorUid: null, actorLabel: 'AI engine (replay adapter)', reason: 'Proposed from observed events; official state unchanged', evidenceRefs: f.sourceEventIds, projectId: f.projectId });

      // Parallel inference markers — the official status field is never touched.
      const step = f.stepId ? st.steps.find((s) => s.id === f.stepId) : null;
      if (step) {
        if (Hub_rank(f.inferenceLevel) >= Hub_rank(step.observedLevel)) step.observedLevel = f.inferenceLevel;
        step.observedReview = 'PENDING_EMPLOYEE'; step.observedNote = f.headline; step.newActivityAt = lastEv;
        if (!step.lastActivityAt || lastEv > step.lastActivityAt) step.lastActivityAt = lastEv;
      }
      if (f.projectId) {
        this.addJournal({
          projectId: f.projectId, stepIds: f.stepId ? [f.stepId] : [], type: 'AI_OBSERVATION', actorUid: null, actorType: 'AI', actorLabel: `${f.deviceId} device; actor unverified (automated AI suggestion)`,
          title: f.whilePaused ? 'Activity detected while the project was paused' : 'AI saw some activity', summary: `${f.inference} The step status was not changed.`, verificationState: 'AI_DETECTED', confidenceBand: f.confidenceBand, sourceRefs: f.sourceEventIds, occurredAt: lastEv,
        });
      }
      if (!wantsCard) continue; // print-only day: no mandatory daily review card
      const existingCard = st.reviewCards.find((c) => c.recipientUid === recipient.id && c.groupKey === f.groupKey && ['PENDING', 'IN_REVIEW', 'DEFERRED'].includes(c.status));
      if (existingCard) {
        existingCard.findingIds = [...existingCard.findingIds.filter((id) => id !== prev?.id), f.id];
        existingCard.title = cardTitle(f); existingCard.explanatoryText = f.inference; existingCard.provisional = f.coverageState !== 'FINAL';
        existingCard.sourceCoverage = f.coverageState; existingCard.lastUpdatedAt = st.now;
      } else {
        st.reviewCards.push(this.newCard(cardTypeFor(f), recipient.id, f, cardTitle(f), f.inference));
      }
    }
    return stats;
  }

  newCard(type: CardType, recipientUid: string, f: Finding, title: string, text: string): ReviewCard {
    const step = f.stepId ? this.state.steps.find((s) => s.id === f.stepId) : null;
    return {
      id: this.nid('card'), cardType: type, recipientUid, projectId: f.projectId, stepId: f.stepId, findingIds: [f.id], updateRequestId: null, title, explanatoryText: text,
      status: 'PENDING', dueAt: null, provisional: f.coverageState !== 'FINAL', sourceCoverage: f.coverageState,
      canBulkReview: type === 'AI_PROGRESS' && f.claimType === 'OBSERVED_ACTION' && step?.impact !== 'HIGH' && !f.whilePaused, reviewStartedAt: null,
      createdAt: this.state.now, lastUpdatedAt: this.state.now, groupKey: f.groupKey,
    };
  }

  // ------------------------------------------------------------------ print production
  myPrintStats(uid: string, forUid: string = uid, date: string = chicagoDate(this.state.now)) {
    const u = this.user(uid);
    if (forUid !== uid && u.role !== 'OWNER') throw new PermissionDenied(); // own figures only
    const target = this.user(forUid);
    const station = this.state.stations.find((s) => s.defaultUid === forUid);
    const stats = computeShiftStats(this.state.printJobs, this.state.activityBins, this.state.stations, forUid, date, !!this.state.printPendingSync[forUid]);
    const printers = station?.printers ?? [];
    const dayStart = chicagoToUtc(date, '00:00');
    const dayEnd = addMinutes(dayStart, 1440);
    const episodes = groupProblemEpisodes(this.state.printerProblems.filter((p) => printers.includes(p.printer) && p.at >= dayStart && p.at < dayEnd));
    return { user: target, station: station ?? null, date, area: this.areaOn(forUid, addMinutes(dayStart, 720)), stats, problemEpisodes: episodes };
  }

  weeklyPrintReport(uid: string) {
    this.requireOwner(uid);
    const st = this.state;
    const printers = weeklyPrinterSummary(st.printJobs, st.printerProblems);
    const stations = st.stations.map((s) => {
      const bins = st.activityBins.filter((b) => b.deviceId === s.deviceId);
      const minutes = fourStateMinutes(bins);
      const jobs = st.printJobs.filter((j) => j.deviceId === s.deviceId);
      const gaps: { from: string; to: string; minutes: number }[] = [];
      let cur: { from: string; to: string; minutes: number } | null = null;
      for (const b of bins) {
        if (!b.covered) { if (cur && minutesBetween(cur.to, b.start) <= 5) { cur.to = addMinutes(b.start, 5); cur.minutes += 5; } else { cur = { from: b.start, to: addMinutes(b.start, 5), minutes: 5 }; gaps.push(cur); } }
      }
      return {
        deviceId: s.deviceId, printers: s.printers, defaultUser: st.users.find((u) => u.id === s.defaultUid)?.name ?? 'Unassigned', jobType: jobs[0]?.jobType ?? null,
        jobs: jobs.length, completed: jobs.filter((j) => j.status === 'COMPLETED').length, failed: jobs.filter((j) => j.status === 'FAILED').length, retries: jobs.filter((j) => j.retryOf).length,
        fourState: minutes, coverageGaps: gaps,
      };
    });
    const episodes = groupProblemEpisodes(st.printerProblems);
    const rawSnapshots = st.printerProblems.filter((p) => p.state === 'problem').length;
    const byType = new Map<string, typeof stations>();
    for (const s of stations) if (s.jobType) byType.set(s.jobType, [...(byType.get(s.jobType) ?? []), s]);
    return {
      weekStart: '2026-10-12', weekEnd: '2026-10-16', dataThrough: st.now, isDemo: true,
      printers, stations, episodes, rawSnapshots,
      comparisons: [...byType.entries()].map(([jobType, entries]) => ({ jobType, entries, comparable: entries.length > 1 })),
      opportunities: st.opportunities,
      caveats: [
        'These bars show what the computer and printer did. “Machine only” does not mean a person was doing nothing. They may be feeding paper or packing. “Neither” does not prove anyone was idle.',
        'Minutes with no data are shown on their own. We never count them as “neither”.',
        'We do not rank people who do different jobs, use different printers, or had different training.',
        'These numbers are not pay records. Never use them to start or stop pay, guess breaks, or punish someone for little typing.',
      ],
    };
  }

  // ------------------------------------------------------------------ owner dashboard, team, opportunities, settings
  ownerOverview(uid: string) {
    this.requireOwner(uid);
    const st = this.state;
    const since = st.lastOwnerLookAt;
    const ev = st.projectEvents.filter((e) => e.recordedAt > since);
    const responses = st.updateResponses.filter((r) => r.submittedAt > since);
    const open = st.updateRequests.filter((r) => ['OPEN', 'PARTIALLY_RESPONDED'].includes(r.state));
    const unmatched = st.findings.filter((f) => f.findingType === 'AI_UNMATCHED_WORK' && f.status === 'PROPOSED');
    const pendingReview = st.reviewCards.filter((c) => ['PENDING', 'IN_REVIEW', 'DEFERRED'].includes(c.status) && c.cardType !== 'OWNER_REQUEST');
    const reportedSteps = st.projectEvents.filter((e) => e.recordedAt > since && e.type === 'STATUS_CHANGE' && /→ REPORTED COMPLETE/.test(e.title));
    const verifiedSteps = st.projectEvents.filter((e) => e.recordedAt > since && e.type === 'STATUS_CHANGE' && /→ VERIFIED COMPLETE/.test(e.title));
    const narrative = [
      `${verifiedSteps.length} step(s) verified complete`,
      `${reportedSteps.length} step(s) reported finished (awaiting a check)`,
      `${responses.length} answer(s) or updates from your team`,
      `${open.length} request(s) still waiting for an answer`,
      `${unmatched.length} piece(s) of work that is not in any project`,
      `${pendingReview.length} AI guess(es) waiting for a person to check`,
    ];
    // Each item: a short title, one sentence of why it matters, and one button. Technical detail is kept, but behind "technical".
    const queue: QueueItem[] = [];
    const nm = (id: string | undefined) => (id ? this.userName(id) : 'Someone');
    const responses2 = st.notifications.filter((n) => n.recipientUid === uid && !n.acknowledgedAt && n.type === 'EMPLOYEE_RESPONSE');
    if (responses2.length >= 2) queue.push({ kind: 'They answered you', label: `${responses2.length} employee updates are ready`, title: `${responses2.length === 2 ? 'Two' : responses2.length === 3 ? 'Three' : responses2.length} employee updates are ready`, why: 'Your team answered your requests. Read them and close the loop.', cta: 'Read the updates', chip: 'Updates ready', link: '/notifications', weight: 100 });
    else for (const n of responses2) queue.push({ kind: 'They answered you', label: n.title, title: n.title, why: n.preview, cta: 'Read the answer', chip: 'Update ready', link: n.deepLink, weight: 100 });
    for (const s of st.steps) {
      const p = st.projects.find((p) => p.id === s.projectId)!;
      const short = shortProjectName(p);
      const who = nm(s.assignedUids[0]);
      const paused = !!p.pause?.isPaused;
      const stepLink = `/projects/${p.id}/steps/${s.id}`;
      const tech = [`${p.key} · Step ${s.sortOrder}: ${s.title}`];
      if (s.status === 'REPORTED_COMPLETE' && s.requiresCheck && !s.verifications.some((v) => v.result === 'CONFIRMED')) queue.push({ kind: 'Needs a check in the source system', label: `${p.key} — ${s.title} (says it is done, but it has not been checked in the source system)`, title: `${short} — Verify result`, why: `${who} says it is done. You asked to check this one.`, cta: 'Check the result', chip: 'Verify result', link: stepLink, weight: 80, technical: tech });
      if (s.status === 'BLOCKED' && !paused) queue.push({ kind: 'Blocked', label: `${p.key} — ${s.title}: ${s.blockerReason ?? ''}`, title: `${who} needs help with ${short.toLowerCase()}`, why: s.blockerReason ?? 'This step is blocked.', cta: 'See what is blocking it', chip: 'Needs help', link: stepLink, weight: 90, technical: tech });
      // Ordinary nags are quiet while a project is paused.
      if (!paused && s.dueAt && s.dueAt < st.now && !TERMINAL.includes(s.status)) queue.push({ kind: 'Late', label: `${p.key} — ${s.title}`, title: `${short} — A step is late`, why: `“${s.title}” was due ${formatDate(s.dueAt)}.`, cta: 'Open the step', chip: 'Late', link: stepLink, weight: 70, technical: tech });
      if (!paused && s.observedReview === 'PENDING_EMPLOYEE' && s.status === 'NOT_STARTED' && s.observedLevel !== 'NO_EVIDENCE') {
        const fnd = st.findings.filter((f) => f.stepId === s.id && f.status === 'PROPOSED').slice(-1)[0];
        const kind = fnd ? reviewKind(fnd, s) : 'GENERAL';
        const toolLink = st.resourceLinks.find((l) => l.stepId === s.id && l.role === 'AUTOMATION_TOOL');
        const toolLabel = plainToolName(toolLink ? st.resources.find((r) => r.id === toolLink.resourceId)?.label : null);
        const what = kind === 'AUTOMATION_TEST' ? `tested the ${toolLabel === 'the tool' ? 'tool' : toolLabel}` : kind === 'AMAZON_UPLOAD' ? 'uploaded to Amazon' : 'worked on this';
        queue.push({ kind: 'Tracker and activity do not match', label: `${p.key} — ${s.title}: we saw activity, but the tracker still says “Not started”`, title: `${short} — Progress needs confirmation`, why: `${who} ${what}, but the project hasn’t been updated.`, cta: 'Review progress', chip: 'Needs confirmation', link: stepLink, weight: 60, technical: [...tech, ...(fnd ? [`How sure: ${fnd.confidenceBand.toLowerCase()}`, `Source: ${fnd.deviceId} (we only see the computer, not the person)`, `Activity items: ${fnd.sourceEventIds.length}`] : [])] });
      }
    }
    for (const p of st.projects.filter((p) => p.pause?.isPaused && !p.closedAt)) {
      if (p.deadlineAt && p.deadlineAt < st.now && (p.pause!.pausedAt ?? '') <= p.deadlineAt) queue.push({ kind: 'Pick a new deadline', label: `${p.key} was paused, and its original deadline has passed`, title: `${shortProjectName(p)} — Pick a new deadline`, why: 'It was paused and its old deadline has passed. Dates never move on their own.', cta: 'Choose a deadline', chip: 'New deadline needed', link: `/projects/${p.id}`, weight: 65, technical: [`${p.key} · original deadline ${formatDate(p.deadlineAt)}`] });
    }
    const NCTA: Record<string, string> = { RESUME_REMINDER: 'Decide now', PAUSE_SUGGESTION: 'Read the suggestion', PILOT_REACHED: 'Review the limited test', AI_FINDING: 'Review it' };
    for (const n of st.notifications.filter((n) => n.recipientUid === uid && !n.acknowledgedAt && !n.readAt && ['RESUME_REMINDER', 'PAUSE_SUGGESTION', 'PILOT_REACHED', 'AI_FINDING'].includes(n.type))) queue.push({ kind: 'Needs your decision', label: n.title, title: n.title, why: n.preview, cta: NCTA[n.type], chip: 'Needs your decision', link: n.deepLink, weight: 95, group: n.type === 'RESUME_REMINDER' ? 'PAUSED' : n.type === 'AI_FINDING' ? 'AI' : 'DECISION' });
    for (const n of st.notifications.filter((n) => n.recipientUid === uid && !n.acknowledgedAt && ['BLOCKER', 'NEEDS_VERIFICATION'].includes(n.type))) queue.push({ kind: n.type === 'BLOCKER' ? 'Blocked' : 'Needs a check in the source system', label: n.title, title: n.title, why: n.preview, cta: n.type === 'BLOCKER' ? 'See what happened' : 'Check the result', chip: n.type === 'BLOCKER' ? 'Needs help' : 'Verify result', link: n.deepLink, weight: 85 });
    for (const rq of st.updateRequests.filter((r) => r.requestedByUid === uid && this.requestStage(r) === 'OVERDUE')) {
      const pr = st.projects.find((p) => p.id === rq.projectId)!;
      queue.push({ kind: 'Overdue answer', label: `${pr.key} request is overdue`, title: `${shortProjectName(pr)} — No answer yet`, why: `${rq.recipientUids.map((x) => nm(x)).join(', ')} hasn’t answered your request, and it was due ${formatDate(rq.dueAt!)}.`, cta: 'See the request', chip: 'Overdue', link: `/projects/${pr.id}${rq.stepId ? `/steps/${rq.stepId}` : ''}`, weight: 88, group: 'URGENT', technical: [`${pr.key}`, `Asked ${formatDate(rq.createdAt)}`] });
    }
    for (const n of st.notifications.filter((n) => n.recipientUid === uid && !n.acknowledgedAt && !n.readAt && n.type === 'EMPLOYEE_UPDATE')) queue.push({ kind: 'They updated you', label: n.title, title: n.title, why: n.preview, cta: 'Read it', chip: 'Update from your team', link: n.deepLink, weight: 75, group: 'REPLY', action: { type: 'MARK_SEEN', notificationId: n.id, label: 'I saw this' } });
    for (const a of st.archives.filter((a) => a.coverageState === 'INCOMPLETE')) queue.push({ kind: 'Data problem', label: `${a.deviceId} ${a.hourWindow}:00 file is missing some events (${a.sequenceGaps.join('; ')})`, title: 'Some computer activity may be missing', why: 'Counts and AI guesses from that time may look low. It does not mean nobody worked.', cta: 'See what is missing', chip: 'Activity may be missing', link: '/owner/data-intake', weight: 50, technical: [`${a.deviceId} · file for ${a.hourWindow}:00`, ...a.sequenceGaps] });
    if (st.settings.aiOutage || st.settings.logSyncOutage) queue.push({ kind: 'Data problem', label: st.settings.aiOutage ? 'The AI helper is off (demo switch)' : 'Computer data is late (demo switch)', title: st.settings.aiOutage ? 'The AI helper is off' : 'Computer activity is arriving late', why: 'Clocking in and out, requests and your own updates keep working.', cta: 'See details', chip: 'Data problem', link: '/owner/data-intake', weight: 55, technical: [st.settings.aiOutage ? 'AI outage (demo switch)' : 'Log sync outage (demo switch)'] });
    const GROUP: Record<string, NonNullable<QueueItem['group']>> = { 'They answered you': 'REPLY', 'They updated you': 'REPLY', 'Needs a check in the source system': 'DECISION', 'Blocked': 'URGENT', 'Late': 'URGENT', 'Tracker and activity do not match': 'DECISION', 'Pick a new deadline': 'PAUSED', 'Data problem': 'OTHER', 'Overdue answer': 'URGENT' };
    for (const q of queue) { q.projectId = q.link.match(/^\/projects\/([^/?]+)/)?.[1]; q.group ??= GROUP[q.kind] ?? 'OTHER'; if (q.kind === 'They answered you' && !q.action) { const n = st.notifications.find((x) => x.deepLink === q.link && x.recipientUid === uid && x.type === 'EMPLOYEE_RESPONSE' && !x.acknowledgedAt); if (n) q.action = { type: 'MARK_SEEN', notificationId: n.id, label: 'I saw this' }; } }
    queue.sort((a, b) => b.weight - a.weight);
    const workers = st.users.filter((u) => u.role === 'EMPLOYEE' && ['PROJECT', 'MIXED'].includes(this.areaOn(u.id))).concat(st.users.filter((u) => u.role === 'OWNER'));
    const workerCards = workers.map((u) => {
      const myProjects = st.projects.filter((p) => p.memberUids.includes(u.id) || (u.role === 'OWNER' && p.visibility !== 'OWNER_PRIVATE'));
      const lastConfirmed = st.projectEvents.filter((e) => e.actorUid === u.id && e.type === 'STATUS_CHANGE').sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))[0] ?? null;
      return {
        user: u, area: this.areaOn(u.id), clockedIn: !!this.openShift(u.id), lastConfirmed,
        pendingCards: this.outstandingCards(u.id).length, openRequests: open.filter((r) => r.recipientUids.includes(u.id)).length,
        projectKeys: u.role === 'OWNER' ? [] : myProjects.map((p) => p.key),
      };
    }).filter((w) => w.user.role === 'EMPLOYEE');
    const latestRun = st.intakeRuns[st.intakeRuns.length - 1];
    return {
      today: st.now, lastSync: Object.values(st.deviceLastSeen).sort().pop() ?? null, dataThrough: latestRun?.dataThrough ?? null, lastOwnerLookAt: since,
      changeCount: ev.length, narrative, queue, workerCards,
      counts: { ...this.projectCounts(uid), waitingForYou: queue.length },
      print: this.weeklyPrintReport(uid).printers.map((p) => ({ printer: p.printer, completed: p.completed, failed: p.failed, incidents: p.incidents.length })),
      privateProjects: st.projects.filter((p) => p.visibility === 'OWNER_PRIVATE').length,
    };
  }
  markOwnerLooked(uid: string) { this.requireOwner(uid); return this.commit(() => { this.state.lastOwnerLookAt = this.state.now; }); }

  teamOverview(uid: string) {
    this.requireOwner(uid);
    return this.state.users.map((u) => ({
      user: u, areaNow: this.areaOn(u.id), clockedIn: !!this.openShift(u.id), pendingCards: this.outstandingCards(u.id).length,
      projects: this.state.projects.filter((p) => p.memberUids.includes(u.id) || p.sharedWithUids.includes(u.id)).map((p) => ({ id: p.id, key: p.key, shared: !p.memberUids.includes(u.id) })),
      assignments: this.state.assignments.filter((a) => a.uid === u.id),
    }));
  }
  setAssignmentForToday(uid: string, targetUid: string, area: Area) {
    this.requireOwner(uid);
    this.user(targetUid);
    return this.commit(() => {
      const day = chicagoDate(this.state.now);
      const from = chicagoToUtc(day, '00:00');
      const to = addMinutes(from, 1440);
      this.state.assignments = this.state.assignments.filter((a) => !(a.uid === targetUid && a.validFrom === from));
      const a: WorkAssignment = { id: this.nid('wa'), uid: targetUid, area, validFrom: from, validTo: to, note: 'Set by owner (demo)' };
      this.state.assignments.push(a);
      this.audit({ entityType: 'assignment', entityId: a.id, action: 'SET_AREA', before: null, after: { uid: targetUid, area, day }, actorUid: uid, actorLabel: this.userName(uid), reason: 'Owner set assignment for the day', evidenceRefs: [], projectId: null });
      return a;
    });
  }
  addUser(uid: string, input: { name: string; area: Area }) {
    this.requireOwner(uid);
    if (!input.name.trim()) throw new HubError('VALIDATION', 'Please type a name.');
    return this.commit(() => {
      const u: User = { id: this.nid('u'), name: input.name.trim(), role: 'EMPLOYEE', area: input.area, active: true, capabilities: [], primaryDeviceId: null, rosterNote: 'Added in the demo. Verify against the real roster.' };
      this.state.users.push(u);
      return u;
    });
  }
  setUserActive(uid: string, targetUid: string, active: boolean) {
    this.requireOwner(uid);
    const u = this.state.users.find((x) => x.id === targetUid);
    if (!u || u.role === 'OWNER') throw new HubError('VALIDATION', 'The owner account cannot be changed.');
    return this.commit(() => { u.active = active; return u; });
  }

  decideOpportunity(uid: string, id: string, decision: 'APPROVED' | 'DEFERRED' | 'REJECTED' | 'MORE_EVIDENCE_REQUESTED', note: string) {
    this.requireOwner(uid);
    const op = this.state.opportunities.find((o) => o.id === id);
    if (!op) throw new HubError('NOT_FOUND', 'We could not find that idea.');
    return this.commit(() => {
      op.state = decision; op.decisionNote = note || null; op.decidedAt = this.state.now;
      if (decision === 'APPROVED' && !op.createdProjectId) {
        const p = this.createProject(uid, { title: `Improvement: ${op.title}`, objective: op.proposal, memberUids: [], visibility: 'ASSIGNED_ONLY' });
        p.impactPlan = { target: op.measurementPlan, observed: null };
        op.steps.forEach((t, i) => { const s = this.addStep(uid, p.id, { title: t, assignedUids: [] }); s.sortOrder = i + 1; });
        op.createdProjectId = p.id;
      }
      this.audit({ entityType: 'opportunity', entityId: op.id, action: decision, before: null, after: { note }, actorUid: uid, actorLabel: this.userName(uid), reason: 'Owner decision on AI-proposed opportunity', evidenceRefs: [], projectId: op.createdProjectId });
      return op;
    });
  }

  updateSettings(uid: string, patch: Partial<HubState['settings']>) {
    this.requireOwner(uid);
    return this.commit(() => { this.state.settings = { ...this.state.settings, ...patch }; return this.state.settings; });
  }
  setPrintPendingSync(forUid: string, pending: boolean) { return this.commit(() => { this.state.printPendingSync[forUid] = pending; }); }

  intakeOverview(uid: string) {
    this.requireOwner(uid);
    const st = this.state;
    const devices = [...new Set([...st.archives.map((a) => a.deviceId)])];
    return {
      devices: devices.map((d) => {
        const arch = st.archives.filter((a) => a.deviceId === d);
        const evs = st.events.filter((e) => e.deviceId === d);
        const runs = st.intakeRuns.filter((r) => r.deviceId === d);
        const last = runs[runs.length - 1];
        const user = this.primaryUserFor(d);
        return {
          deviceId: d, coverage: this.coverageFor(d), lastEvent: evs.map((e) => e.occurredAt).sort().pop() ?? null, eventCount: evs.length, archives: arch,
          lastRun: last ?? null, runs, actorNote: `Computer ${d}; we cannot tell who used it${user ? ` (usually checked by ${user.name} — just to know who to ask)` : ''}`,
          episodes: st.episodes.filter((e) => e.deviceId === d).length,
          relatedProjects: [...new Set(st.findings.filter((f) => f.deviceId === d && f.projectId).map((f) => st.projects.find((p) => p.id === f.projectId)!.key))],
        };
      }),
      aiRuns: st.aiRuns.slice().reverse(), monthSpendUsd: this.monthSpendUsd(), budget: st.settings.monthlyBudgetUsd, settings: st.settings,
      findings: st.findings.slice().reverse(),
    };
  }
  traceFinding(uid: string, findingId: string) {
    this.requireOwner(uid);
    const f = this.state.findings.find((x) => x.id === findingId);
    if (!f) throw new HubError('NOT_FOUND', 'We could not find that finding.');
    const events = this.state.events.filter((e) => f.sourceEventIds.includes(e.id));
    return {
      finding: f,
      archives: this.state.archives.filter((a) => events.some((e) => e.sourceArchiveId === a.id)),
      events, episodes: this.state.episodes.filter((e) => events.some((ev) => ev.episodeId === e.id)),
      cards: this.state.reviewCards.filter((c) => c.findingIds.includes(f.id)),
      decisions: this.state.reviewDecisions.filter((d) => f.reviewDecisionId === d.id),
      journal: this.state.projectEvents.filter((e) => e.sourceRefs.some((r) => f.sourceEventIds.includes(r))),
    };
  }

  /** What a model would be allowed to see for a user — used to prove private data never reaches AI context. */
  aiRetrievalFor(uid: string, q: string) {
    const r = this.search(uid, q);
    return { projects: r.projects.map((p) => p.key), steps: r.steps.map((s) => s.title), resources: r.resources.map((x) => x.label) };
  }

  // ------------------------------------------------------------------ request tracking: Requested -> Seen -> Responded, and Overdue
  requestStage(r: UpdateRequest): 'RESPONDED' | 'OVERDUE' | 'SEEN' | 'REQUESTED' | 'CLOSED' {
    if (['CLOSED', 'CANCELLED', 'ACKNOWLEDGED'].includes(r.state)) return 'CLOSED';
    if (r.state === 'RESPONDED') return 'RESPONDED';
    if (r.dueAt && r.dueAt < this.state.now) return 'OVERDUE';
    return r.seenAt ? 'SEEN' : 'REQUESTED';
  }
  /** Dalia's requests with where each one stands. Replies and unsolicited updates are told apart. */
  ownerRequests(uid: string, projectId?: string) {
    this.requireOwner(uid);
    return this.state.updateRequests.filter((r) => !projectId || r.projectId === projectId).map((r) => ({
      request: r, stage: this.requestStage(r), recipients: r.recipientUids.map((x) => this.userName(x)),
      responses: this.state.updateResponses.filter((x) => x.requestId === r.id),
    })).reverse();
  }

  /** Dalia can choose to check one particular step herself. Off by default: when someone says it is done, it is done. */
  setStepRequiresCheck(uid: string, stepId: string, on: boolean) {
    this.requireOwner(uid);
    const { step, project } = this.stepFor(uid, stepId);
    return this.commit(() => {
      step.requiresCheck = on;
      this.audit({ entityType: 'step', entityId: step.id, action: 'SET_REQUIRES_CHECK', before: null, after: { requiresCheck: on }, actorUid: uid, actorLabel: this.userName(uid), reason: 'Owner chose whether she checks this step', evidenceRefs: [], projectId: project.id });
      this.addJournal({ projectId: project.id, stepIds: [step.id], type: 'PLAN_CHANGE', actorUid: uid, title: on ? 'Dalia will check this step' : 'Dalia no longer checks this step', summary: `“${step.title}”.`, verificationState: 'OWNER_APPROVED' });
      return step;
    });
  }

  // ------------------------------------------------------------------ project counts (one definition, used everywhere)
  /**
   * Counts for the projects THIS person may see.
   *  team    = active, not paused, shared with the team or assigned to people
   *  private = active, not paused, Dalia-only (owner sees these; employees never do, and never see the number)
   *  paused  = paused and not closed
   * "Active" never includes paused, finished or canceled projects.
   */
  projectCounts(uid: string) {
    const u = this.user(uid);
    const live = this.state.projects.filter((p) => this.canReadProject(u, p) && !p.closedAt && !p.canceledAt);
    const running = live.filter((p) => !p.pause?.isPaused);
    const team = running.filter((p) => p.visibility !== 'OWNER_PRIVATE').length;
    const priv = u.role === 'OWNER' ? running.filter((p) => p.visibility === 'OWNER_PRIVATE').length : 0;
    return { team, private: priv, active: team + priv, paused: live.filter((p) => p.pause?.isPaused).length };
  }

  // ------------------------------------------------------------------ project description card (hover / click)
  /** Everything the little description card needs. Same permission as opening the project: a hidden project gives the same error as a missing one. */
  projectCard(uid: string, projectId: string) {
    const p = this.projectFor(uid, projectId);
    const steps = this.projectSteps(uid, projectId);
    const next = steps.filter((s) => !s.parentStepId && !TERMINAL.includes(s.status) && s.status !== 'REPORTED_COMPLETE').sort((a, b) => a.sortOrder - b.sortOrder)[0] ?? null;
    return {
      id: p.id, key: p.key, shortName: shortProjectName(p), title: p.title, description: p.description?.trim() || null, objective: p.objective,
      people: p.memberUids.map((m) => this.userName(m)), paused: !!p.pause?.isPaused, deadlineAt: p.deadlineAt, nextStepTitle: next?.title ?? null,
      canEdit: this.user(uid).role === 'OWNER' || this.canWorkOnProject(this.user(uid), p),
    };
  }

  /** Dalia or anyone on the project can write what the project is, in everyday words. */
  setProjectDescription(uid: string, projectId: string, text: string) {
    const p = this.projectFor(uid, projectId);
    const u = this.user(uid);
    if (u.role !== 'OWNER' && !this.canWorkOnProject(u, p)) throw new PermissionDenied();
    const clean = text.trim();
    if (clean.length > 600) throw new HubError('VALIDATION', 'Please keep the description under 600 characters.');
    return this.commit(() => {
      const before = p.description ?? null;
      p.description = clean || undefined; p.updatedAt = this.state.now;
      this.audit({ entityType: 'project', entityId: p.id, action: 'PROJECT_DESCRIPTION', before: { description: before }, after: { description: clean || null }, actorUid: uid, actorLabel: this.userName(uid), reason: 'Description edited', evidenceRefs: [], projectId: p.id });
      this.addJournal({ projectId: p.id, type: 'PLAN_CHANGE', actorUid: uid, title: 'Project description updated', summary: `${this.userName(uid)} updated what this project is about.`, verificationState: 'OFFICIAL' });
      return p;
    });
  }

  // ------------------------------------------------------------------ small tasks a person logs by hand
  /**
   * "Dalia remembered something, told Erika, Erika updated a listing." The computer logs may never show that, so a person can write it down.
   * It is the person's own report. It never changes a step's status.
   */
  logSmallTask(uid: string, input: { title: string; doneAt?: string | null; requestedByUid?: string | null; note?: string | null; projectId?: string | null; stepId?: string | null; idempotencyKey: string }): WorkLogEntry {
    this.user(uid);
    const title = input.title.trim();
    if (!title) throw new HubError('VALIDATION', 'Give it a short name, like “Updated the MS066 listing”.');
    if (title.length > 120) throw new HubError('VALIDATION', 'Please keep the name under 120 characters.');
    if (input.requestedByUid && !this.state.users.some((u) => u.id === input.requestedByUid)) throw new HubError('VALIDATION', 'We do not know who asked.');
    return this.idem('small:' + input.idempotencyKey, () => {
      this.requirePaidShiftForEmployee(uid);
      let project: Project | null = null; let step: Step | null = null;
      if (input.stepId) {
        const r = this.stepFor(uid, input.stepId); step = r.step; project = r.project;
        if (!this.canWorkOnProject(this.user(uid), project)) throw new PermissionDenied();
      } else if (input.projectId) {
        project = this.projectFor(uid, input.projectId);
        if (!this.canWorkOnProject(this.user(uid), project)) throw new PermissionDenied();
      }
      return this.commit(() => {
        const entry: WorkLogEntry = {
          id: this.nid('wl'), uid, findingId: '', kind: 'SMALL_TASK', title, loggedAt: this.state.now, deviceId: 'entered by hand', evidenceSummaries: [],
          doneAt: input.doneAt ?? this.state.now, requestedByUid: input.requestedByUid ?? null, note: input.note?.trim() || null, origin: 'MANUAL', projectId: project?.id ?? null, stepId: step?.id ?? null,
        };
        this.state.workLog.push(entry);
        const asker = input.requestedByUid ? ` Asked by ${this.userName(input.requestedByUid)}.` : '';
        if (project) {
          if (step) step.lastActivityAt = entry.doneAt ?? this.state.now;
          this.addJournal({ projectId: project.id, stepIds: step ? [step.id] : [], type: 'EMPLOYEE_REVIEW', actorUid: uid, title: `${this.userName(uid)} logged work${step ? ' on this step' : ''}`, summary: `${title}.${asker}${entry.note ? ` Note: “${entry.note}”.` : ''} Written by the person, not seen by the computer. The step status was not changed.`, verificationState: 'EMPLOYEE_CONFIRMED' });
        }
        this.audit({ entityType: 'workLog', entityId: entry.id, action: 'LOG_SMALL_TASK', before: null, after: { title, projectId: project?.id ?? null, stepId: step?.id ?? null, requestedBy: input.requestedByUid ?? null }, actorUid: uid, actorLabel: this.userName(uid), reason: 'Person logged a small task by hand', evidenceRefs: [], projectId: project?.id ?? null });
        return entry;
      });
    });
  }

  // ------------------------------------------------------------------ what to do next (and why), for one person
  /**
   * Splits the person's open steps into "ready to do" and "waiting", with a plain reason for each.
   * Never offered as ordinary work: paused, blocked, on hold, waiting, reported-done-awaiting-check, dependency-locked, limited-test gated.
   * Order: confirm stale progress first, then due date, then Dalia's priority, then step order.
   */
  myNextActions(uid: string) {
    const u = this.user(uid);
    type Row = { project: Project; step: Step; kind: 'CONFIRM_PROGRESS' | 'WORK'; why: string; cardId: string | null };
    type Held = { project: Project; step: Step; reason: string; code: 'PAUSED' | 'BLOCKED' | 'WAITING' | 'HOLD' | 'AWAITING_CHECK' | 'DEPENDENCY' | 'PILOT_GATED' };
    const ready: Row[] = []; const held: Held[] = [];
    const PRI: Record<string, number> = { HIGH: 0, NORMAL: 1, LOW: 2 };
    for (const project of this.listProjects(uid)) {
      const steps = this.projectSteps(uid, project.id);
      for (const step of steps.filter((x) => !x.parentStepId && x.assignedUids.includes(uid) && !TERMINAL.includes(x.status))) {
        const hold = (code: Held['code'], reason: string) => held.push({ project, step, reason, code });
        if (project.pause?.isPaused) { hold('PAUSED', 'This project is paused. Your work is saved.'); continue; }
        if (step.onHold) { hold('HOLD', 'This step is on hold.'); continue; }
        if (step.status === 'BLOCKED') { hold('BLOCKED', `You reported this as blocked${step.blockerReason ? `: ${step.blockerReason}` : ''}. Waiting for Dalia.`); continue; }
        if (step.status === 'WAITING') { hold('WAITING', `Waiting${step.blockerReason ? `: ${step.blockerReason}` : ' for someone or something'}.`); continue; }
        if (step.status === 'REPORTED_COMPLETE') { if (step.requiresCheck) hold('AWAITING_CHECK', 'You reported this finished. Dalia asked to check this one.'); continue; } // otherwise it is simply done
        if (project.pilot?.enabled && project.pilot.stepId === step.id && project.pilot.status === 'TARGET_REACHED') { hold('PILOT_GATED', 'The limited test reached its limit. Waiting for Dalia to approve more.'); continue; }
        const dep = notReadyReason(step, steps, project);
        if (dep) { hold('DEPENDENCY', dep); continue; }
        const stale = step.status === 'NOT_STARTED' && step.observedLevel !== 'NO_EVIDENCE' && step.observedReview === 'PENDING_EMPLOYEE';
        const card = stale ? this.outstandingCards(uid).find((c) => c.stepId === step.id && c.cardType !== 'OWNER_REQUEST') ?? null : null;
        if (stale) ready.push({ project, step, kind: 'CONFIRM_PROGRESS', why: 'The tracker still says “Not started”, but we saw computer activity on this step. Confirm where it really stands before you start over.', cardId: card?.id ?? null });
        else {
          const bits: string[] = [];
          if (step.dueAt) bits.push(`It is due ${formatDate(step.dueAt)}.`);
          if (project.priority === 'HIGH') bits.push('Dalia marked this project high priority.');
          if (step.dependencyIds.length) bits.push('The step before it is finished.');
          if (!bits.length) bits.push(`It is the next step that is ready in ${project.key}.`);
          ready.push({ project, step, kind: 'WORK', why: bits.join(' '), cardId: null });
        }
      }
    }
    ready.sort((a, b) => (a.kind === b.kind ? 0 : a.kind === 'CONFIRM_PROGRESS' ? -1 : 1) || (a.step.dueAt ?? '9').localeCompare(b.step.dueAt ?? '9') || PRI[a.project.priority] - PRI[b.project.priority] || a.project.key.localeCompare(b.project.key) || a.step.sortOrder - b.step.sortOrder);
    return { ready, held, role: u.role };
  }

  // ------------------------------------------------------------------ "other work" (unmatched work outcomes)
  myWorkLog(uid: string): WorkLogEntry[] {
    this.user(uid);
    return this.state.workLog.filter((w) => w.uid === uid).slice().reverse();
  }

  /** Owner view of everything that was not matched to a project, including what people skipped. Nothing is hidden by a dismissal. */
  otherWork(uid: string) {
    this.requireOwner(uid);
    const unmatched = this.state.findings.filter((f) => f.findingType === 'AI_UNMATCHED_WORK' && f.status !== 'SUPERSEDED');
    const row = (f: Finding) => {
      const dec = this.state.reviewDecisions.find((d) => d.id === f.reviewDecisionId) ?? null;
      const card = this.state.reviewCards.find((c) => c.findingIds.includes(f.id));
      return {
        finding: f, decision: dec, byName: dec ? this.userName(dec.actorUid) : card ? this.userName(card.recipientUid) : 'Unknown',
        events: this.state.events.filter((e) => f.sourceEventIds.includes(e.id)).map((e) => e.allowedSummary),
        linkedTo: f.projectId ? `${this.state.projects.find((p) => p.id === f.projectId)?.key}${f.stepId ? ` · Step ${this.state.steps.find((s) => s.id === f.stepId)?.sortOrder}` : ''}` : null,
        logEntry: this.state.workLog.find((w) => w.findingId === f.id) ?? null,
      };
    };
    const rows = unmatched.map(row);
    const byHand = this.state.workLog.filter((w) => w.origin === 'MANUAL').slice().reverse().map((w) => ({
      entry: w, byName: this.userName(w.uid), askedBy: w.requestedByUid ? this.userName(w.requestedByUid) : null,
      linkedTo: w.projectId ? `${this.state.projects.find((p) => p.id === w.projectId)?.key}${w.stepId ? ` · Step ${this.state.steps.find((s) => s.id === w.stepId)?.sortOrder}` : ''}` : null,
    }));
    return {
      byHand,
      waiting: rows.filter((r) => r.finding.status === 'PROPOSED'),
      everyday: rows.filter((r) => r.logEntry?.kind === 'EVERYDAY'),
      maybeProject: rows.filter((r) => r.logEntry?.kind === 'MAYBE_PROJECT'),
      attached: rows.filter((r) => r.finding.status === 'CONFIRMED' && r.linkedTo),
      skipped: rows.filter((r) => r.finding.status === 'DISMISSED'),
      notMine: rows.filter((r) => r.finding.status === 'NOT_MINE'),
    };
  }

  /** Owner can send a skipped or "not me" item back to the person for another look. History is kept. */
  restoreFinding(uid: string, findingId: string) {
    this.requireOwner(uid);
    const f = this.state.findings.find((x) => x.id === findingId);
    if (!f || !['DISMISSED', 'NOT_MINE'].includes(f.status)) throw new HubError('VALIDATION', 'Only skipped items can be sent back.');
    const card = this.state.reviewCards.find((c) => c.findingIds.includes(f.id));
    return this.commit(() => {
      const before = f.status;
      f.status = 'PROPOSED'; f.reviewedAt = null; f.reviewDecisionId = null;
      if (card) {
        card.status = 'PENDING'; card.lastUpdatedAt = this.state.now; card.reviewStartedAt = null;
        this.notify({ recipientUid: card.recipientUid, senderUid: uid, type: 'DIRECT_MENTION', title: `${this.userName(uid)} asked you to look at this again`, preview: f.headline, projectId: null, sourceEntityId: f.id, deepLink: `/review?card=${card.id}`, key: `n:restore:${f.id}:${this.state.now}` });
      }
      this.audit({ entityType: 'finding', entityId: f.id, action: 'RESTORED_BY_OWNER', before: { status: before }, after: { status: 'PROPOSED' }, actorUid: uid, actorLabel: this.userName(uid), reason: 'Owner sent a skipped item back for review. Earlier decision kept in history.', evidenceRefs: f.sourceEventIds, projectId: null });
      return f;
    });
  }

  setProjectManagers(uid: string, projectId: string, managerUids: string[]) {
    this.requireOwner(uid);
    const p = this.projectFor(uid, projectId);
    if (p.visibility === 'OWNER_PRIVATE') throw new HubError('PRIVATE_PROJECT', 'A private project cannot have other managers.');
    for (const m of managerUids) { if (!p.memberUids.includes(m)) throw new HubError('VALIDATION', 'A manager must work on the project.'); }
    return this.commit(() => {
      const before = [...p.managerUids]; p.managerUids = managerUids;
      this.audit({ entityType: 'project', entityId: p.id, action: 'SET_MANAGERS', before, after: managerUids, actorUid: uid, actorLabel: this.userName(uid), reason: 'Owner chose who may pause and resume', evidenceRefs: [], projectId: p.id });
      this.addJournal({ projectId: p.id, type: 'ACCESS', actorUid: uid, title: 'Who can pause this project changed', summary: `Allowed to pause or resume: ${managerUids.map((m) => this.userName(m)).join(', ') || 'only Dalia'}.`, verificationState: 'OFFICIAL' });
      return p;
    });
  }
  cancelProject(uid: string, projectId: string) {
    this.requireOwner(uid);
    const p = this.projectFor(uid, projectId);
    if (p.canceledAt) throw new HubError('NOT_ACTIVE', 'This project is already canceled.');
    return this.commit(() => {
      p.canceledAt = this.state.now;
      this.audit({ entityType: 'project', entityId: p.id, action: 'CANCEL', before: null, after: p.canceledAt, actorUid: uid, actorLabel: this.userName(uid), reason: 'Owner canceled the project', evidenceRefs: [], projectId: p.id });
      this.addJournal({ projectId: p.id, type: 'DECISION', actorUid: uid, title: 'Project canceled by owner', summary: 'Everything is kept. A canceled project never restarts by itself.', verificationState: 'OFFICIAL' });
      return p;
    });
  }
  /** Finished projects only come back when the owner deliberately reopens them. */
  reopenProject(uid: string, projectId: string) {
    this.requireOwner(uid);
    const p = this.projectFor(uid, projectId);
    if (!p.closedAt && !p.canceledAt) throw new HubError('NOT_ACTIVE', 'This project is not finished.');
    return this.commit(() => {
      const before = { closedAt: p.closedAt, canceledAt: p.canceledAt };
      p.closedAt = null; p.canceledAt = null;
      this.audit({ entityType: 'project', entityId: p.id, action: 'REOPEN', before, after: { closedAt: null, canceledAt: null }, actorUid: uid, actorLabel: this.userName(uid), reason: 'Owner reopened the project', evidenceRefs: [], projectId: p.id });
      this.addJournal({ projectId: p.id, type: 'DECISION', actorUid: uid, title: 'Project reopened by owner', summary: 'It is active again.', verificationState: 'OFFICIAL' });
      return p;
    });
  }

  // ------------------------------------------------------------------ pause / resume (v1.1) — see pause.ts
  canControlProject(uid: string, projectId: string): boolean { const p = this.projectFor(uid, projectId); return PS.canControlProject(this, this.user(uid), p); }
  pauseProject(uid: string, projectId: string, input: PauseInput) { return PS.pauseProject(this, uid, projectId, input); }
  resumeProject(uid: string, projectId: string, input: { note?: string; expectedScheduleVersion?: number; idempotencyKey: string }) { return PS.resumeProject(this, uid, projectId, input); }
  changePauseSchedule(uid: string, projectId: string, input: Parameters<typeof PS.changePauseSchedule>[3]) { return PS.changePauseSchedule(this, uid, projectId, input); }
  suggestPause(uid: string, projectId: string, note: string, key: string) { return PS.suggestPause(this, uid, projectId, note, key); }
  suggestResume(uid: string, projectId: string, note: string, key: string) { return PS.suggestResume(this, uid, projectId, note, key); }
  holdStep(uid: string, stepId: string, reason: string | null) { return PS.holdStep(this, uid, stepId, reason); }
  releaseStep(uid: string, stepId: string) { return PS.releaseStep(this, uid, stepId); }
  setProjectDeadline(uid: string, projectId: string, ymd: string | null) { return PS.setProjectDeadline(this, uid, projectId, ymd); }
  /** The scheduled status run. Idempotent; changes planning state only, never runs scripts or external actions. */
  processSchedules() { const r = PS.processSchedules(this); MG.processFindingSchedules(this); return r; }
  setPinned(uid: string, projectId: string, pinned: boolean) { this.requireOwner(uid); const p = this.projectFor(uid, projectId); return this.commit(() => { p.pinned = pinned; return p; }); }

  // ------------------------------------------------------------------ limited tests (pilot checkpoints) — see pilot.ts
  configurePilot(uid: string, projectId: string, input: PL.PilotInput) { return PL.configurePilot(this, uid, projectId, input); }
  recordPilotRow(uid: string, projectId: string, sku: string, state: import('../domain/types').PilotRowState, note: string | null = null, evidence: string | null = null) { return PL.recordPilotRow(this, uid, projectId, sku, state, note, evidence); }
  verifyPilotRows(uid: string, projectId: string, skus: string[], detail: string) { return PL.verifyPilotRows(this, uid, projectId, skus, detail); }
  approveNextBatch(uid: string, projectId: string, input: Parameters<typeof PL.approveNextBatch>[3]) { return PL.approveNextBatch(this, uid, projectId, input); }
  pilotHandoff(uid: string, projectId: string) { return PL.pilotHandoff(this, this.projectFor(uid, projectId)); }

  // ------------------------------------------------------------------ AI Recommendations (OWNER-ONLY) — see manager.ts / finance.ts / drive.ts
  listFindings(uid: string, f?: Parameters<typeof MG.listFindings>[2]) { return MG.listFindings(this, uid, f); }
  inboxSummary(uid: string) { return MG.inboxSummary(this, uid); }
  markFindingsSeen(uid: string) { return MG.markFindingsSeen(this, uid); }
  getFinding(uid: string, id: string) { return MG.getFinding(this, uid, id); }
  findingModel(uid: string, id: string) { return MG.findingModel(this, uid, id); }
  updateModelVar(uid: string, modelId: string, key: string, patch: Parameters<typeof MG.updateModelVar>[4]) { return MG.updateModelVar(this, uid, modelId, key, patch); }
  snoozeFinding(uid: string, id: string, ymd: string) { return MG.snoozeFinding(this, uid, id, ymd); }
  dismissFinding(uid: string, id: string, reason?: string) { return MG.dismissFinding(this, uid, id, reason); }
  archiveFinding(uid: string, id: string) { return MG.archiveFinding(this, uid, id); }
  markInformational(uid: string, id: string) { return MG.markInformational(this, uid, id); }
  reopenFinding(uid: string, id: string) { return MG.reopenFinding(this, uid, id); }
  setFindingFollowUp(uid: string, id: string, ymd: string | null) { return MG.setFollowUp(this, uid, id, ymd); }
  linkFinding(uid: string, id: string, projectId: string) { return MG.linkFinding(this, uid, id, projectId); }
  investigateMore(uid: string, id: string) { return MG.investigateMore(this, uid, id); }
  runAiScan(uid: string) { return MG.runAiScan(this, uid); }
  approveFindingAsProject(uid: string, id: string, input: MG.ApproveInput) { return MG.approveFindingAsProject(this, uid, id, input); }
  employeeBriefPreview(uid: string, input: Parameters<typeof MG.employeeBriefPreview>[0]) { this.requireOwner(uid); return MG.employeeBriefPreview(input); }
  assignProject(uid: string, projectId: string, assignUids: string[], key: string) { return MG.assignProject(this, uid, projectId, assignUids, key); }
  addGoal(uid: string, title: string, description: string, priority: 'HIGH' | 'NORMAL' | 'LOW') { return MG.addGoal(this, uid, title, description, priority); }
  updateGoal(uid: string, id: string, patch: Parameters<typeof MG.updateGoal>[3]) { return MG.updateGoal(this, uid, id, patch); }
  toggleSource(uid: string, id: string, on: boolean) { return MG.toggleSource(this, uid, id, on); }
  recordOutcome(uid: string, findingId: string, input: Parameters<typeof MG.recordOutcome>[3]) { return MG.recordOutcome(this, uid, findingId, input); }
  outcomeTracker(uid: string) { return MG.outcomeTracker(this, uid); }
  listGoals(uid: string) { this.requireOwner(uid); return this.state.goals; }
  listSources(uid: string) { this.requireOwner(uid); return this.state.sources; }
  // workspace (safe view for people on the project; owner extras only for the owner)
  provisionWorkspace(uid: string, projectId: string, key: string) { return DR.provisionWorkspace(this, uid, projectId, key); }
  projectWorkspace(uid: string, projectId: string) { return DR.projectWorkspaceView(this, uid, projectId); }
  createChecklistSheet(uid: string, projectId: string, stepId: string | null, title: string, rows: number) { return DR.createChecklistSheet(this, uid, projectId, stepId, title, rows); }
  demoDriveFailAfter(n: number | null) { this.assertDemo(); return this.commit(() => { this.state.drive.failAfterOps = n; }); }

  // ------------------------------------------------------------------ demo-only operations (never production)
  private assertDemo() { if (!DEMO_MODE) throw new HubError('DEMO_ONLY', 'Demo operation.'); }

  demoAdvance(minutes: number) {
    this.assertDemo();
    this.commit(() => { this.state.now = addMinutes(this.state.now, minutes); this.refreshCoverage(); });
    this.processSchedules();
  }
  demoAdvanceToNextMorning() {
    this.assertDemo();
    this.commit(() => { this.state.now = nextBusinessMorning(this.state.now, '07:30'); this.refreshCoverage(); });
    this.processSchedules();
  }
  /** Jump to a date (first status run of that Chicago day, 6:00 AM + 1 min). Only moves forward. */
  demoAdvanceToDate(ymd: string) {
    this.assertDemo();
    const t = addMinutes(chicagoToUtc(ymd, this.state.settings.statusRunLocalTime || '06:00'), 1);
    if (t > this.state.now) this.commit(() => { this.state.now = t; this.refreshCoverage(); });
    this.processSchedules();
  }
  async demoReleaseFbaHour() {
    this.assertDemo();
    this.ingestFile({ ...FX.FILE_ERIKA_15, text: FX.erika15() });
    return this.runAnalysis('demo: FBA hour arrived');
  }
  async demoLateEvent() {
    this.assertDemo();
    this.ingestFile({ ...FX.FILE_ERIKA_14, text: FX.erika14Rev2() });
    return this.runAnalysis('demo: late event');
  }
  async demoPartialWrite() {
    this.assertDemo();
    return this.ingestFile({ ...FX.FILE_ERIKA_15, text: FX.erika15() + '{"schema_version":1,"event_id":"erikapc-20261016-00' });
  }
  async demoHostileFile() {
    this.assertDemo();
    this.ingestFile({ ...FX.FILE_PC04_14, text: FX.injectionHour() });
    this.commit(() => { this.state.seenInjection = true; });
    return this.runAnalysis('demo: hostile filename');
  }
  demoToggle(key: 'aiOutage' | 'logSyncOutage', value: boolean) {
    this.assertDemo();
    return this.commit(() => { this.state.settings[key] = value; });
  }
  demoDiscoverSheet(uid: string) {
    this.assertDemo();
    this.requireOwner(uid);
    if (this.state.resources.some((r) => r.id === 'r-seo-c')) return;
    this.commit(() => {
      this.state.resources.push({
        id: 'r-seo-c', type: 'GOOGLE_SHEET', label: 'Halloween SKU checklist (discovered)', purpose: 'Per-SKU checklist (Done, Notes) for the 154 new SKUs. Found because it was opened next to the SEO Master.',
        usedBy: 'Listing staff', sourceProvider: 'demo-drive', sourceId: 'demo-sheet-checklist', canonicalUrl: 'demo://drive/sheet/demo-sheet-checklist', normalizedPath: null, linkState: 'VERIFIED', version: 'rev 3',
        lastModifiedAt: this.state.now, visibility: 'PROJECT_SCOPED', ownerUid: uid, skuFamilies: ['MA', 'MS'], provenance: 'AI_SUGGESTED', approvedVersion: null, suggestedVersion: null, supersededById: null,
        checklistSummary: { total: 154, yes: 40, fix: 3, blank: 111, sourceNote: 'Done column, checklist rev 3' },
      });
      const mk = (id: string, stepId: string, role: ResourceRole, why: string) => this.state.resourceLinks.push({ id, resourceId: 'r-seo-c', projectId: 'prj-012', stepId, role, associationState: 'SUGGESTED', suggestedBy: 'AI', explanation: why, evidenceRefs: [], approvedBy: null, createdAt: this.state.now, lastReviewedAt: null });
      mk('l-sug-1', 's-012-1', 'OUTPUT', 'Opened alongside the SEO generation step; mirrors its 154 SKU rows (AI suggestion).');
      mk('l-sug-2', 's-012-2', 'CHECKLIST', 'Contains the Yes/Fix column used while reviewing SEO (AI suggestion).');
      mk('l-sug-3', 's-012-3', 'VALIDATION', 'Tracks which SKUs are ready to list (AI suggestion). A checkbox is not proof a listing is live.');
      this.audit({ entityType: 'resource', entityId: 'r-seo-c', action: 'DISCOVERED', before: null, after: { sourceId: 'demo-sheet-checklist' }, actorUid: null, actorLabel: 'AI engine (replay adapter)', reason: 'Resource candidate discovered (demo)', evidenceRefs: [], projectId: 'prj-012' });
    });
  }
  demoNewResourceVersion(resourceId = 'r-seo-a') {
    this.assertDemo();
    return this.commit(() => {
      const r = this.state.resources.find((x) => x.id === resourceId);
      if (r) r.suggestedVersion = { version: 'rev 42', modifiedAt: this.state.now, note: 'A newer revision exists. Newest is not automatically approved.' };
    });
  }
  demoSimulateReviewResponse() {
    this.assertDemo();
    const card = this.state.reviewCards.find((c) => c.recipientUid === 'u-erika' && c.cardType === 'OWNER_REQUEST' && c.status !== 'SUBMITTED');
    if (!card) throw new HubError('NOT_FOUND', 'Erika has no open request from Dalia.');
    if (!this.openShift('u-erika')) this.clockIn('u-erika', 'demo-clock-in-' + this.state.now);
    return this.submitDecision('u-erika', card.id, { action: 'SEND_STATUS', statusAnswer: 'IN_PROGRESS', note: 'Test attempted; investigating permissions (simulated reply).', idempotencyKey: 'demo-sim-' + card.id });
  }

  // ------------------------------------------------------------------ lifecycle
  static async create(opts: { persist?: boolean } = {}): Promise<HubServer> {
    const persist = opts.persist ?? false;
    if (persist && typeof localStorage !== 'undefined') {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw) as HubState;
          if (parsed && Array.isArray(parsed.users) && parsed.users.length) { parsed.workLog ??= []; return new HubServer(parsed, persist); }
        }
      } catch { /* fall through to fresh seed */ }
    }
    const hub = new HubServer(buildSeedState(), persist);
    await hub.bootstrap();
    return hub;
  }

  async bootstrap() {
    this.ingestFile({ ...FX.FILE_ERIKA_14, text: FX.erika14Rev1() });
    this.ingestFile({ ...FX.FILE_PC04_13, text: FX.pc04_13() });
    await this.runAnalysis('seed: initial replay');
    this.emit();
  }

  async reset() {
    this.state = buildSeedState();
    await this.bootstrap();
  }
}
