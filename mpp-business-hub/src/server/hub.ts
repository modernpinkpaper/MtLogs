import type {
  Area, AuditEvent, CardAction, Finding, JournalType, Notification, NotificationType, Project, ProjectEvent, Resource,
  ResourceLink, ResourceRole, ResponseChoice, ReviewCard, ReviewDecision, Shift, Step, StepStatus, UpdateRequest, UpdateResponse,
  User, VerificationState, WorkAssignment,
} from '../domain/types';
import { addMinutes, chicagoDate, chicagoToUtc, minutesBetween, nextBusinessMorning } from '../domain/time';
import { buildSeedState, NOW } from './seed';
import type { HubState } from './state';
import { HubError, PermissionDenied } from './errors';
import { assignEpisodes, findSequenceGaps, hashText, normalizeEvent, parseJsonl } from '../ai/ingest';
import type { AnalysisContext, FindingDraft, ModelAdapter } from '../ai/adapter';
import { describeEvent, validateFindingDraft } from '../ai/adapter';
import { ReplayAnalyzer } from '../ai/replay';
import { cardTitle, cardTypeFor, Hub_rank } from './cards';
import * as PS from './pause';
import type { PauseInput } from './pause';
import * as PL from './pilot';
import { computeShiftStats, groupProblemEpisodes, fourStateMinutes, weeklyPrinterSummary } from './print';
import * as FX from '../ai/fixtures';
import type { AiRun, CardType, CoverageState, IntakeRun, IntakeStage, WorkLogEntry } from '../domain/types';

export const STORAGE_KEY = 'mpp-hub-demo-state-v2';
/** Compile-time guard: demo-only operations exist only in this prototype build. */
export const DEMO_MODE = true as const;

export const CHOICE_LABEL: Record<ResponseChoice, string> = {
  COMPLETED: 'I finished it', IN_PROGRESS: 'Still working on it', NOT_STARTED: 'Not started',
  BLOCKED: 'Stuck, I need help', WAITING: 'Waiting for someone or something', NOT_APPLICABLE: 'Not my job',
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
const EMPLOYEE_TARGETS: StepStatus[] = ['IN_PROGRESS', 'BLOCKED', 'WAITING', 'REPORTED_COMPLETE', 'NOT_APPLICABLE', 'VERIFIED_COMPLETE'];
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

  createProject(uid: string, input: { title: string; objective: string; memberUids: string[]; visibility: Project['visibility']; priority?: Project['priority']; deadlineAt?: string | null }): Project {
    this.requireOwner(uid);
    if (!input.title.trim()) throw new HubError('VALIDATION', 'Please type a title.');
    return this.commit(() => {
      const nums = this.state.projects.map((p) => Number(p.key.replace(/\D/g, ''))).filter((n) => n < 900 && !Number.isNaN(n));
      const key = input.visibility === 'OWNER_PRIVATE' ? `P-D${String(this.state.projects.filter((p) => p.visibility === 'OWNER_PRIVATE').length + 1).padStart(2, '0')}` : `P-${String(Math.max(0, ...nums) + 1).padStart(3, '0')}`;
      const p: Project = {
        id: this.nid('prj'), key, title: input.title.trim(), objective: input.objective.trim(), ownerUid: uid,
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
        assignedUids: input.assignedUids ?? project.memberUids.slice(0, 1), dueAt: null, impact: input.impact ?? 'ROUTINE', dependencyIds: [], evidenceHints: [],
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
    const open = this.state.steps.filter((s) => s.projectId === projectId && !TERMINAL.includes(s.status));
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
      if (!EMPLOYEE_TARGETS.includes(to)) throw new PermissionDenied();
      if (!step.assignedUids.includes(uid)) throw new PermissionDenied();
    }
    if ((to === 'BLOCKED') && !(opts.reason ?? '').trim()) throw new HubError('REASON_REQUIRED', 'Please say why it is blocked.');
    let verificationSource = step.verificationSource;
    if (to === 'VERIFIED_COMPLETE') {
      const hasIndependent = step.verifications.some((v) => v.result === 'CONFIRMED');
      if (step.impact === 'HIGH') {
        if (u.role !== 'OWNER') throw new HubError('REQUIRES_INDEPENDENT_VERIFICATION', 'This is a big step. A system must double-check it, or the owner must approve it.');
        if (!hasIndependent && !opts.ownerApproval) throw new HubError('REQUIRES_INDEPENDENT_VERIFICATION', 'No system has double-checked this yet. You must choose to approve it yourself.');
        verificationSource = hasIndependent ? 'INDEPENDENT' : 'OWNER_APPROVED';
      } else {
        verificationSource = u.role === 'OWNER' ? 'OWNER_APPROVED' : 'EMPLOYEE_CONFIRMED';
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
      verificationState: step.verificationSource === 'INDEPENDENT' ? 'INDEPENDENTLY_VERIFIED' : step.verificationSource === 'NONE' ? 'OFFICIAL' : 'EMPLOYEE_CONFIRMED',
    });
    return step;
  }

  /** Apply a human-reported choice as an official step change only when the transition is legal and not terminal. Never VERIFIED. */
  applyHumanReport(step: Step, project: Project, choice: ResponseChoice, note: string | null, uid: string) {
    step.humanReported = { choice, note, at: this.state.now, byUid: uid };
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
        const unverifiedNote = input.choice === 'COMPLETED' ? ' (told to us by a person, not double-checked yet)' : '';
        this.audit({ entityType: 'updateResponse', entityId: resp.id, action: 'SUBMIT', before: req ? { requestState: 'OPEN' } : null, after: { choice: resp.choice, requestId: req?.id ?? null }, actorUid: uid, actorLabel: this.userName(uid), reason: req ? 'Answered owner request' : 'Proactive update', evidenceRefs: resp.evidenceLinks, projectId: project.id });
        const ev = this.addJournal({
          projectId: project.id, stepIds: step ? [step.id] : [], type: req ? 'UPDATE_RESPONSE' : 'PROACTIVE_UPDATE', actorUid: uid,
          title: `${this.userName(uid)} ${req ? 'answered' : 'sent an update'}: ${label}`, summary: `${resp.note ?? 'No note.'}${unverifiedNote}`,
          verificationState: 'EMPLOYEE_CONFIRMED', relatedRequestId: req?.id ?? null, relatedResponseId: resp.id, sourceRefs: resp.evidenceLinks,
        });
        void ev;
        this.notify({
          recipientUid: project.ownerUid, senderUid: uid, type: needsHelp ? 'BLOCKER' : 'EMPLOYEE_RESPONSE',
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

  submitDecision(uid: string, cardId: string, input: {
    action: CardAction; statusAnswer?: ResponseChoice | null; note?: string | null; correctionText?: string | null; evidenceLinks?: string[];
    needsOwnerHelp?: boolean; classification?: { kind: 'LINK_EXISTING' | 'NEW_STEP' | 'ROUTINE' | 'POTENTIAL_PROJECT'; projectId?: string; stepId?: string; newStepTitle?: string } | null; idempotencyKey: string;
  }): ReviewDecision {
    const card = this.getCard(uid, cardId);
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
              summary: `${f.headline}${input.correctionText ? ` — correction: ${input.correctionText}` : ''}${input.note ? ` — note: ${input.note}` : ''}. The step status was not changed by this check.`,
              verificationState: 'EMPLOYEE_CONFIRMED', sourceRefs: f.sourceEventIds,
            });
          }
          this.audit({ entityType: 'finding', entityId: f.id, action: `REVIEW_${newStatus}`, before: { status: 'PROPOSED' }, after: { status: newStatus, correction: input.correctionText ?? null }, actorUid: uid, actorLabel: this.userName(uid), reason: 'Person checked the AI guess', evidenceRefs: f.sourceEventIds, projectId: f.projectId });
        }
        const f0 = findings[0];
        if (input.action === 'SEND_STATUS' && input.statusAnswer && f0?.stepId && f0.projectId) {
          const step = this.state.steps.find((s) => s.id === f0.stepId)!;
          const project = this.state.projects.find((p) => p.id === f0.projectId)!;
          if (this.canWorkOnProject(this.user(uid), project)) this.applyHumanReport(step, project, input.statusAnswer, input.note?.trim() || null, uid);
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
  setApprovedVersion(uid: string, resourceId: string, version: string) {
    const u = this.user(uid);
    const res = this.visibleResources(u).find((r) => r.id === resourceId);
    if (!res) throw new PermissionDenied();
    const links = this.state.resourceLinks.filter((l) => l.resourceId === res.id);
    if (u.role !== 'OWNER' && !links.some((l) => this.canWorkOnProject(u, this.state.projects.find((p) => p.id === l.projectId)!))) throw new PermissionDenied();
    return this.commit(() => {
      const before = { version: res.version, approvedVersion: res.approvedVersion, suggested: res.suggestedVersion };
      if (res.suggestedVersion?.version === version) { res.version = version; res.lastModifiedAt = res.suggestedVersion.modifiedAt; res.suggestedVersion = null; }
      res.approvedVersion = version;
      this.audit({ entityType: 'resource', entityId: res.id, action: 'SET_APPROVED_VERSION', before, after: { version: res.version, approvedVersion: version }, actorUid: uid, actorLabel: this.userName(uid), reason: 'Deliberate approval of resource version', evidenceRefs: [], projectId: links[0]?.projectId ?? null });
      for (const pid of new Set(links.map((l) => l.projectId))) this.addJournal({ projectId: pid, type: 'RESOURCE', actorUid: uid, title: 'Approved version set', summary: `${res.label}: approved ${version}.`, verificationState: 'OFFICIAL', relatedResourceIds: [res.id] });
      return res;
    });
  }
  keepApprovedDismissSuggestion(uid: string, resourceId: string) {
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
    const confirmedSteps = st.projectEvents.filter((e) => e.recordedAt > since && e.type === 'STATUS_CHANGE' && /→ (REPORTED|VERIFIED) COMPLETE/.test(e.title));
    const narrative = [
      `${confirmedSteps.length} step(s) marked finished`,
      `${responses.length} answer(s) or updates from your team`,
      `${open.length} request(s) still waiting for an answer`,
      `${unmatched.length} piece(s) of work that is not in any project`,
      `${pendingReview.length} AI guess(es) waiting for a person to check`,
    ];
    const queue: { kind: string; label: string; link: string; weight: number }[] = [];
    for (const n of st.notifications.filter((n) => n.recipientUid === uid && !n.acknowledgedAt && ['EMPLOYEE_RESPONSE'].includes(n.type))) queue.push({ kind: 'They answered you', label: n.title, link: n.deepLink, weight: 100 });
    for (const s of st.steps) {
      const p = st.projects.find((p) => p.id === s.projectId)!;
      const paused = !!p.pause?.isPaused;
      if (s.status === 'REPORTED_COMPLETE' && s.impact === 'HIGH' && !s.verifications.some((v) => v.result === 'CONFIRMED')) queue.push({ kind: 'Needs a double-check', label: `${p.key} — ${s.title} (says it is done, but nobody double-checked)`, link: `/projects/${p.id}/steps/${s.id}`, weight: 80 });
      if (s.status === 'BLOCKED' && !paused) queue.push({ kind: 'Blocked', label: `${p.key} — ${s.title}: ${s.blockerReason ?? ''}`, link: `/projects/${p.id}/steps/${s.id}`, weight: 90 });
      // Ordinary nags are quiet while a project is paused.
      if (!paused && s.dueAt && s.dueAt < st.now && !TERMINAL.includes(s.status)) queue.push({ kind: 'Late', label: `${p.key} — ${s.title}`, link: `/projects/${p.id}/steps/${s.id}`, weight: 70 });
      if (!paused && s.observedReview === 'PENDING_EMPLOYEE' && s.status === 'NOT_STARTED' && s.observedLevel !== 'NO_EVIDENCE') queue.push({ kind: 'Tracker and activity do not match', label: `${p.key} — ${s.title}: we saw activity, but the tracker still says “Not started”`, link: `/projects/${p.id}/steps/${s.id}`, weight: 60 });
    }
    for (const p of st.projects.filter((p) => p.pause?.isPaused && !p.closedAt)) {
      if (p.deadlineAt && p.deadlineAt < st.now && (p.pause!.pausedAt ?? '') <= p.deadlineAt) queue.push({ kind: 'Pick a new deadline', label: `${p.key} was paused, and its original deadline has passed`, link: `/projects/${p.id}`, weight: 65 });
    }
    for (const n of st.notifications.filter((n) => n.recipientUid === uid && !n.acknowledgedAt && !n.readAt && ['RESUME_REMINDER', 'PAUSE_SUGGESTION', 'PILOT_REACHED', 'AI_FINDING'].includes(n.type))) queue.push({ kind: 'Needs your decision', label: n.title, link: n.deepLink, weight: 95 });
    for (const n of st.notifications.filter((n) => n.recipientUid === uid && !n.acknowledgedAt && ['BLOCKER', 'NEEDS_VERIFICATION'].includes(n.type))) queue.push({ kind: n.type === 'BLOCKER' ? 'Blocked' : 'Needs a double-check', label: n.title, link: n.deepLink, weight: 85 });
    for (const a of st.archives.filter((a) => a.coverageState === 'INCOMPLETE')) queue.push({ kind: 'Data problem', label: `${a.deviceId} ${a.hourWindow}:00 file is missing some events (${a.sequenceGaps.join('; ')})`, link: '/owner/data-intake', weight: 50 });
    if (st.settings.aiOutage || st.settings.logSyncOutage) queue.push({ kind: 'Data problem', label: st.settings.aiOutage ? 'The AI helper is off (demo switch)' : 'Computer data is late (demo switch)', link: '/owner/data-intake', weight: 55 });
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
      counts: { active: st.projects.filter((p) => !p.closedAt && !p.canceledAt && !p.pause?.isPaused && p.visibility !== 'OWNER_PRIVATE').length, paused: st.projects.filter((p) => p.pause?.isPaused && !p.closedAt).length, waitingForYou: queue.length },
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
    return {
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
  processSchedules() { return PS.processSchedules(this); }
  setPinned(uid: string, projectId: string, pinned: boolean) { this.requireOwner(uid); const p = this.projectFor(uid, projectId); return this.commit(() => { p.pinned = pinned; return p; }); }

  // ------------------------------------------------------------------ limited tests (pilot checkpoints) — see pilot.ts
  configurePilot(uid: string, projectId: string, input: PL.PilotInput) { return PL.configurePilot(this, uid, projectId, input); }
  recordPilotRow(uid: string, projectId: string, sku: string, state: import('../domain/types').PilotRowState, note: string | null = null, evidence: string | null = null) { return PL.recordPilotRow(this, uid, projectId, sku, state, note, evidence); }
  verifyPilotRows(uid: string, projectId: string, skus: string[], detail: string) { return PL.verifyPilotRows(this, uid, projectId, skus, detail); }
  approveNextBatch(uid: string, projectId: string, input: Parameters<typeof PL.approveNextBatch>[3]) { return PL.approveNextBatch(this, uid, projectId, input); }
  pilotHandoff(uid: string, projectId: string) { return PL.pilotHandoff(this, this.projectFor(uid, projectId)); }

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
