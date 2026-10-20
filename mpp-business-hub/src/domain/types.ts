// Typed domain model for the MPP Business Hub prototype. All data is SYNTHETIC demo data.

export type Role = 'OWNER' | 'EMPLOYEE';
export type Area = 'PROJECT' | 'PRINT' | 'MIXED' | 'UNASSIGNED';

export interface User {
  id: string;
  name: string;
  role: Role;
  /** Default area; time-bound assignments override it (see WorkAssignment). */
  area: Area;
  active: boolean;
  /** Free-text capabilities; never used to infer duties not on the roster. */
  capabilities: string[];
  primaryDeviceId: string | null;
  rosterNote?: string;
  /** v1.9: extra permissions Dalia can give. Customer service may log errors for team members. */
  permissions?: 'CUSTOMER_SERVICE'[];
  /** A small photo the person chose themselves (a tiny data URL). Initials are shown until then. */
  photo?: string;
  /** An owner who does not clock in (for example Moe). */
  noClock?: boolean;
}

export interface WorkAssignment {
  id: string;
  uid: string;
  area: Area;
  validFrom: string; // UTC ISO
  validTo: string | null;
  note?: string;
}

export type ProjectVisibility = 'OWNER_PRIVATE' | 'ASSIGNED_ONLY' | 'TEAM_SHARED';
/** Plain-language project states shown in the UI. Mapped from richer step data without changing it. */
export type ProjectWorkStatus = 'NOT_STARTED' | 'IN_PROGRESS' | 'PAUSED' | 'COMPLETED' | 'CANCELED';
export type ResumeMode = 'MANUAL' | 'AUTOMATIC_ON_DATE' | 'REMIND_ON_DATE';

export interface ProjectPauseState {
  isPaused: boolean;
  pausedAt?: string; // UTC ISO
  pausedByUserId?: string;
  reasonCode?: string;
  reasonNote?: string;
  messageToTeam?: string;
  /** What people may still do while paused. Plain words. Empty means nothing is scheduled. */
  allowedWork?: string;
  priorProjectStatus?: 'NOT_STARTED' | 'IN_PROGRESS';
  resumeMode: ResumeMode;
  resumeDateLocal?: string; // YYYY-MM-DD in America/Chicago
  timeZone: 'America/Chicago';
  scheduleVersion: number;
  lastReminderAt?: string;
  reminderSentForVersion?: number;
  resumedAt?: string;
  resumedByUserId?: string | null; // null = automatic
  resumeNote?: string;
  deadlineAtPause?: string | null;
}

export type PilotRowState = 'NOT_DONE' | 'TRIED' | 'CHECKED_OFF' | 'UPLOADED' | 'VERIFIED' | 'FAILED';
export interface PilotRow { sku: string; state: PilotRowState; note: string | null; updatedAt: string | null; evidence: string | null; verifiedBy: string | null }
export interface PilotCheckpoint {
  enabled: boolean;
  stepId: string | null;
  metricType: 'VERIFIED_LISTINGS' | 'CONFIRMED_ROWS' | 'PRINT_JOBS' | 'CUSTOM';
  metricLabel: string;
  targetCount: number;
  scopeLabel: string; // e.g. source sheet + filter + version
  rows: PilotRow[];
  enforcement: 'TECHNICAL_LIMIT' | 'TRACKING_ONLY';
  continuationRequiresApproval: true;
  whenReached: 'PROPOSE_PAUSE' | 'AUTO_PAUSE_APPROVED';
  approvedBy: string;
  approvedAt: string;
  status: 'RUNNING' | 'TARGET_REACHED' | 'NEXT_BATCH_APPROVED';
  reachedAt: string | null;
  batchNumber: number;
  history: { at: string; text: string }[];
}

export interface Project {
  id: string;
  /** v1.10: a note from Dalia shown at the top of the project to the people on it. */
  ownerNote?: { text: string; at: string; byUid: string };
  key: string; // P-012
  title: string;
  /** Short everyday name for alerts and lists, like "Shopify listings". */
  shortName?: string;
  objective: string;
  /** Plain-language description for the hover/click card. Written by Dalia or the people on the project. */
  description?: string;
  ownerUid: string;
  /** Assigned people. Access is membership-based; ownerUid alone never grants employee access. */
  memberUids: string[];
  /** Explicit, granular shares (can be revoked). */
  sharedWithUids: string[];
  visibility: ProjectVisibility;
  priority: 'LOW' | 'NORMAL' | 'HIGH';
  deadlineAt: string | null;
  businessGoal: string;
  closedAt: string | null;
  createdAt: string;
  updatedAt: string;
  lastVerifiedAt: string | null;
  currentRisk: string | null;
  impactPlan: { target: string; observed: string | null } | null;
  /** v1.1 additive fields (all optional-safe; old data defaults them). */
  pause: ProjectPauseState | null;
  pilot: PilotCheckpoint | null;
  managerUids: string[]; // delegated people allowed to pause/resume
  /** v1.8: when the AI last read each person’s computer activity for this project (checked by that person). */
  aiCheckedAt?: Record<string, string>;
  pinned: boolean;
  canceledAt: string | null;
  origin: 'MANUAL' | 'AI_RECOMMENDATION';
  category: string | null;
  employeeBrief: string | null; // sanitized worker brief (never contains owner finances)
}

export type StepStatus =
  | 'NOT_STARTED' | 'IN_PROGRESS' | 'BLOCKED' | 'WAITING'
  | 'REPORTED_COMPLETE' | 'VERIFIED_COMPLETE'
  | 'CANCELLED' | 'NOT_APPLICABLE' | 'REOPENED';

export type VerificationSource = 'NONE' | 'EMPLOYEE_CONFIRMED' | 'INDEPENDENT' | 'OWNER_APPROVED';
export type InferenceLevel =
  | 'NO_EVIDENCE' | 'POSSIBLE_ACTIVITY' | 'STRONG_ACTIVITY'
  | 'DELIVERABLE_OBSERVED' | 'RESULT_OBSERVED' | 'INCONCLUSIVE';
export type ObservedReviewState =
  | 'PENDING_EMPLOYEE' | 'EMPLOYEE_CONFIRMED' | 'CORRECTED' | 'DISMISSED' | 'EXTERNALLY_VERIFIED' | 'NONE';

export interface ChecklistItem { id: string; text: string; done: boolean; doneByUid?: string | null; doneAt?: string | null }

export interface Step {
  id: string;
  projectId: string;
  parentStepId: string | null;
  phase: string | null;
  sortOrder: number;
  title: string;
  instructions: string;
  objective: string;
  acceptance: string;
  status: StepStatus;
  /** Blocker reason retained alongside last active state. */
  blockerReason: string | null;
  assignedUids: string[];
  /** v1.10: when a step is blocked, the day to look at it again. */
  remindOn?: string | null;
  dueAt: string | null;
  impact: 'ROUTINE' | 'HIGH';
  /** Dalia can choose to check a specific step herself. Off by default: when someone says it is done, it is done. */
  requiresCheck?: boolean;
  /** Kept for older saved data. Not used any more. */
  employeeSignOffAllowed?: boolean;
  dependencyIds: string[];
  evidenceHints: string[];
  checklist: ChecklistItem[];
  /** Official verification label for the completion state. */
  verificationSource: VerificationSource;
  /** Parallel AI inference fields — never overwrite `status`. */
  observedLevel: InferenceLevel;
  observedReview: ObservedReviewState;
  observedNote: string | null;
  lastActivityAt: string | null;
  lastConfirmedAt: string | null;
  lastVerifiedAt: string | null;
  /** Latest human-reported status from an update response/proactive update. */
  humanReported: { choice: ResponseChoice; note: string | null; at: string; byUid: string; outcome?: ReviewOutcome; outcomeText?: string } | null;
  /** Independent verifier results for this step (e.g. marketplace state). */
  verifications: Verification[];
  /** Latest Not-yet-handled "new activity" marker. */
  newActivityAt: string | null;
  linkedDocLabel?: string;
  /** Step-level hold that does not pause the whole project. */
  onHold: { at: string; byUid: string; reason: string | null } | null;
  /** Employee-safe reason this step exists (never financial). */
  whyForGoal?: string;
}

export interface Verification {
  id: string;
  stepId: string;
  verifier: string; // e.g. "Shopify product lookup (pretend)"
  entity: string;
  result: 'CONFIRMED' | 'NOT_FOUND' | 'MISMATCH';
  detail: string;
  at: string;
  recordedBy: string;
}

// ---------- Resources ----------
export type ResourceType =
  | 'GOOGLE_DOC' | 'GOOGLE_SHEET' | 'EXCEL' | 'PDF' | 'SCRIPT' | 'SOURCE_REPOSITORY'
  | 'IMAGE_FOLDER' | 'IMAGE_ASSET' | 'ARCHIVE' | 'WINDOWS_FILE_PATH' | 'NETWORK_SHARE'
  | 'DRIVE_FOLDER' | 'SHOPIFY_RESOURCE' | 'AMAZON_RESOURCE' | 'ETSY_RESOURCE' | 'SOP'
  | 'CHECKLIST' | 'REPORT' | 'WEB_LINK' | 'OTHER';
export type ResourceRole =
  | 'INPUT' | 'WORKING' | 'OUTPUT' | 'APPROVED_FINAL' | 'INSTRUCTIONS' | 'AUTOMATION_TOOL'
  | 'REFERENCE' | 'VALIDATION' | 'CHECKLIST' | 'SOURCE_IMAGES' | 'PRODUCTION_ASSET';
export type LinkState = 'VERIFIED' | 'ACCESS_DENIED' | 'MOVED' | 'MISSING' | 'UNKNOWN' | 'LOCAL_ONLY';

export interface Resource {
  id: string;
  type: ResourceType;
  label: string;
  purpose: string;
  usedBy: string;
  sourceProvider: 'demo-drive' | 'demo-local' | 'demo-network' | 'demo-shopify' | 'demo-amazon' | 'none';
  /** Stable provider identity. Filenames alone are weak and never merge resources. */
  sourceId: string | null;
  /** Only set for a verified (pretend) openable link. */
  canonicalUrl: string | null;
  normalizedPath: string | null;
  linkState: LinkState;
  version: string | null;
  lastModifiedAt: string | null;
  visibility: 'OWNER_PRIVATE' | 'PROJECT_SCOPED' | 'TEAM_SHARED';
  ownerUid: string;
  skuFamilies: string[];
  provenance: 'OWNER_APPROVED' | 'EMPLOYEE_CONFIRMED' | 'AI_SUGGESTED';
  /** Explicitly approved version label; newer versions are suggestions only. */
  approvedVersion: string | null;
  suggestedVersion: { version: string; modifiedAt: string; note: string } | null;
  supersededById: string | null;
  /** Explicitly marked as still being edited. Never inferred from a file name. */
  isDraft?: boolean;
  /** The record of who approved which version, and when. An approvedVersion without a matching record is not trusted. */
  approval?: { version: string; byUid: string; at: string } | null;
  /** A person asked Dalia to approve this version. It is not approved until she does. */
  pendingApproval?: { version: string; requestedByUid: string; at: string; note: string | null } | null;
  /** Old approved versions, kept for the history. */
  supersededVersions?: { version: string; at: string; byUid: string }[];
  /** Installed scripts live where the tool needs them. They are never moved to a project folder. */
  installPath?: string | null;
  sourceLinked?: boolean; // scripts: is source/manifest linked?
  checklistSummary?: { total: number; yes: number; fix: number; blank: number; sourceNote: string } | null;
  /** v1.8: files made or linked from a step. The name is built from these parts, so it follows renames and reordering. */
  nameParts?: { projectId: string; stepId: string; n: number; person: string; suffix?: string } | null;
  createdInApp?: boolean;
  /** How a sheet made in the app was started, so a copy can be made later. */
  startedFrom?: { mode: 'BLANK' | 'SKU' | 'COPY'; families: string[]; columns: string[]; copiedFromResourceId?: string } | null;
  notes?: string;
}

export interface ResourceLink {
  id: string;
  resourceId: string;
  projectId: string;
  stepId: string | null;
  role: ResourceRole;
  associationState: 'SUGGESTED' | 'CONFIRMED' | 'REJECTED';
  /** v1.10: a file taken off a step. Nothing in Drive is deleted. Kept for the history. */
  removed?: { at: string; byUid: string };
  /** v1.10: someone asked to remove a file from a step that is already done. The person who did the step decides. */
  removalRequest?: { at: string; byUid: string };
  suggestedBy: 'AI' | 'HUMAN' | 'RULE';
  explanation: string;
  evidenceRefs: string[];
  approvedBy: string | null;
  createdAt: string;
  lastReviewedAt: string | null;
}

// ---------- Journal & audit ----------
export type JournalType =
  | 'STATUS_CHANGE' | 'UPDATE_REQUESTED' | 'UPDATE_RESPONSE' | 'PROACTIVE_UPDATE' | 'AI_OBSERVATION'
  | 'EMPLOYEE_REVIEW' | 'RESOURCE' | 'VERIFICATION' | 'BLOCKER' | 'NOTE' | 'DECISION' | 'LATE_EVIDENCE'
  | 'ACK' | 'PLAN_CHANGE' | 'ACCESS'
  | 'PAUSE_REQUESTED' | 'PROJECT_PAUSED' | 'PAUSE_SCHEDULE_CHANGED' | 'RESUME_REMINDER_SENT' | 'PROJECT_RESUMED' | 'PILOT';
export type ConfidenceBand = 'LOW' | 'MEDIUM' | 'HIGH' | 'N_A';
export type VerificationState = 'OFFICIAL' | 'AI_DETECTED' | 'EMPLOYEE_CONFIRMED' | 'OWNER_APPROVED' | 'INDEPENDENTLY_VERIFIED' | 'NEEDS_REVIEW' | 'UNKNOWN';

export interface ProjectEvent {
  id: string;
  projectId: string;
  stepIds: string[];
  type: JournalType;
  occurredAt: string;
  recordedAt: string;
  actorUid: string | null;
  actorType: 'HUMAN' | 'SERVICE' | 'AI';
  actorLabel: string; // e.g. "Authenticated Erika", "ERIKAPC device; actor unverified"
  title: string;
  summary: string;
  verificationState: VerificationState;
  confidenceBand: ConfidenceBand;
  sourceRefs: string[];
  relatedResourceIds: string[];
  relatedRequestId: string | null;
  relatedResponseId: string | null;
  /** Journal visibility mirrors project visibility; filtered on read. */
  visibility: ProjectVisibility;
}

export interface AuditEvent {
  id: string;
  entityType: string;
  entityId: string;
  action: string;
  before: unknown;
  after: unknown;
  actorUid: string | null;
  actorLabel: string;
  reason: string;
  recordedAt: string;
  evidenceRefs: string[];
  projectId: string | null; // used to scope reads by project visibility
}

// ---------- MT Log source data ----------
/** Existing MT Log v1 envelope. employee_id may be a device label (e.g. ERIKAPC): not proof of identity. */
export interface MtLogEvent {
  schema_version: number;
  event_id: string;
  timestamp_utc: string;
  timestamp_local?: string;
  computer_id: string;
  employee_id?: string;
  windows_username?: string;
  event_type: string;
  application?: string;
  process_name?: string;
  session_id?: string;
  task_context_id?: string | null;
  watcher_run_id?: string;
  sequence?: number;
  collector?: string;
  collector_version?: string;
  metadata?: Record<string, unknown>;
}

export type AttributionState = 'DEVICE_ONLY_ACTOR_UNVERIFIED' | 'ACTOR_KNOWN';

export interface NormalizedEvent {
  id: string; // = event_id
  occurredAt: string;
  ingestedAt: string;
  deviceId: string;
  actorUid: string | null;
  attributionState: AttributionState;
  eventType: string;
  app: string;
  sourceArchiveId: string;
  sequence: number | null;
  watcherRunId: string | null;
  /** Redacted, allow-listed summary only. Raw JSONL stays in the authorized file store. */
  allowedSummary: string;
  keys: { skus: string[]; submissionRefs: string[]; fileNames: string[]; projectHints: string[]; actions: string[]; docIds: string[] };
  episodeId: string | null;
}

export type CoverageState = 'FINAL' | 'PROVISIONAL' | 'INCOMPLETE' | 'MISSING';

export interface SourceArchive {
  id: string;
  deviceId: string;
  day: string; // YYYY-MM-DD (local)
  hourWindow: number; // local hour
  provider: 'demo-drive';
  fileId: string;
  revision: number;
  hash: string;
  ingestedAt: string;
  lastSeenAt: string;
  eventCount: number;
  minTimestamp: string | null;
  maxTimestamp: string | null;
  coverageState: CoverageState;
  sequenceGaps: string[];
  parseFailures: number;
  duplicatesSkipped: number;
  /** Count of complete lines already consumed (restart-safe cursor). */
  lastProcessedLine: number;
  partialTail: boolean;
}

export interface WorkEpisode {
  id: string;
  deviceId: string;
  actorUid: string | null;
  actorConfidence: 'NONE';
  startedAt: string;
  endedAt: string;
  observedApplications: string[];
  skuKeys: string[];
  sourceEventIds: string[];
  humanActivityUncertain: true;
  notes: string[];
}

export interface IntakeStage { name: string; startedAt: string; endedAt: string | null; state: 'DONE' | 'PENDING' | 'FAILED' | 'SKIPPED'; error?: string }
export interface IntakeRun {
  id: string;
  archiveId: string;
  deviceId: string;
  startedAt: string;
  added: number;
  indexed: number;
  deduplicated: number;
  parseFailures: number;
  stages: IntakeStage[];
  dataThrough: string | null;
}

// ---------- AI findings & review ----------
export type FindingType =
  | 'AI_PROGRESS' | 'AI_COMPLETION_SUGGESTION' | 'AI_DISCREPANCY' | 'AI_UNMATCHED_WORK'
  | 'BLOCKER' | 'RESOURCE_SUGGESTION' | 'LATE_EVIDENCE';
export type ClaimType = 'OBSERVED_ACTION' | 'LIKELY_ACTION' | 'EMPLOYEE_REPORTED' | 'SYSTEM_VERIFIED' | 'UNKNOWN_OR_CONFLICTING';

export interface Finding {
  id: string;
  findingType: FindingType;
  claimType: ClaimType;
  projectId: string | null;
  stepId: string | null;
  deviceId: string;
  actorUid: string | null;
  actorEvidenceState: 'DEVICE_ONLY_ACTOR_UNVERIFIED' | 'ACTOR_KNOWN';
  headline: string;
  observedFacts: string[];
  inference: string;
  uncertainties: string[];
  verificationNeeded: string[];
  proposedUpdate: { kind: 'ADD_JOURNAL_NOTE' | 'ASK_EMPLOYEE' | 'CLASSIFY_WORK' | 'SUGGEST_RESOURCE_LINK' | 'NONE'; detail: string };
  confidenceBand: Exclude<ConfidenceBand, 'N_A'>;
  inferenceLevel: InferenceLevel;
  sourceEventIds: string[];
  coverageState: CoverageState;
  classification?: 'ROUTINE_PRODUCTION' | 'EXISTING_PROJECT' | 'POTENTIAL_NEW_PROJECT' | 'AD_HOC_OWNER_REQUEST' | 'UNCLEAR' | 'NON_WORK';
  refs: { skus: string[]; submissionRefs: string[]; fileNames: string[] };
  status: 'PROPOSED' | 'CONFIRMED' | 'CORRECTED' | 'DISMISSED' | 'NOT_MINE' | 'SUPERSEDED';
  supersedesFindingId: string | null;
  modelRunId: string;
  promptVersion: string;
  issuedAt: string;
  reviewedAt: string | null;
  reviewDecisionId: string | null;
  groupKey: string;
  /** Activity noticed on a project that is currently paused. Neutral wording; never resumes anything. */
  whilePaused?: boolean;
  /** A person said someone else was using that computer. The activity stays; the attribution is disputed. */
  attributionDisputed?: boolean;
}

export type CardType = 'AI_PROGRESS' | 'AI_COMPLETION_SUGGESTION' | 'AI_DISCREPANCY' | 'AI_UNMATCHED_WORK' | 'BLOCKER' | 'RESOURCE_SUGGESTION' | 'OWNER_REQUEST' | 'LATE_EVIDENCE';
export type CardStatus = 'PENDING' | 'IN_REVIEW' | 'SUBMITTED' | 'DEFERRED' | 'CLOSED' | 'SUPERSEDED';

export interface ReviewCard {
  id: string;
  cardType: CardType;
  recipientUid: string;
  projectId: string | null;
  stepId: string | null;
  findingIds: string[];
  updateRequestId: string | null;
  title: string;
  explanatoryText: string;
  status: CardStatus;
  dueAt: string | null;
  provisional: boolean;
  sourceCoverage: CoverageState;
  canBulkReview: boolean;
  reviewStartedAt: string | null;
  createdAt: string;
  lastUpdatedAt: string;
  groupKey: string;
}

export type ResponseChoice = 'COMPLETED' | 'IN_PROGRESS' | 'NOT_STARTED' | 'BLOCKED' | 'WAITING' | 'NOT_APPLICABLE' | 'NEED_CLARIFICATION';
export type CardAction = 'CONFIRM' | 'NEEDS_CORRECTION' | 'NOT_MY_WORK' | 'DISMISS' | 'DEFER' | 'SEND_STATUS';
/** What happened with the work. Separate from "did the AI see it right?" and never proof by itself. */
export type ReviewOutcome = 'DONE' | 'DONE_PART' | 'PROBLEM' | 'WORKING' | 'NOT_ME' | 'MISREAD' | 'NOT_SURE' | 'WORKED_PAUSED';
export type ReviewKindId = 'AUTOMATION_TEST' | 'AMAZON_UPLOAD' | 'FILE_EDIT' | 'UNMATCHED' | 'PAUSED' | 'LATE' | 'REQUEST' | 'GENERAL';
export interface ReviewCorrection { kind: 'WRONG_STEP' | 'WRONG_PERSON' | 'OTHER'; projectId?: string; stepId?: string }

export interface ReviewDecision {
  id: string;
  cardId: string;
  actorUid: string;
  selectedAction: CardAction;
  statusAnswer: ResponseChoice | null;
  note: string | null;
  evidenceLinks: string[];
  correctionText: string | null;
  classificationChoice: string | null;
  /** What the person said happened. Activity accuracy is the action; this is the result. */
  outcome?: ReviewOutcome | null;
  correction?: ReviewCorrection | null;
  submittedAt: string;
  reviewStartedAt: string | null;
  duringPaidShift: boolean;
  shiftId: string | null;
  idempotencyKey: string;
}

export interface UpdateRequest {
  id: string;
  projectId: string;
  stepId: string | null;
  requestedByUid: string;
  recipientUids: string[];
  question: string | null;
  purpose: string;
  importance: 'NORMAL' | 'IMPORTANT';
  dueAt: string | null;
  /** First time a recipient opened the request. */
  seenAt?: string | null;
  options: { notifyWhenVerified: boolean; sendNextResponse: boolean; reminderIfUnanswered: boolean };
  state: 'OPEN' | 'PARTIALLY_RESPONDED' | 'RESPONDED' | 'ACKNOWLEDGED' | 'CLOSED' | 'CANCELLED';
  parentRequestId: string | null;
  createdAt: string;
  deliveryStatus: 'DELIVERED';
  idempotencyKey: string;
}

export interface UpdateResponse {
  id: string;
  requestId: string | null;
  projectId: string;
  stepId: string | null;
  fromUid: string;
  toUid: string;
  choice: ResponseChoice;
  note: string | null;
  evidenceLinks: string[];
  submittedAt: string;
  sourceCardId: string | null;
  needsOwnerHelp: boolean;
  /** Always a HUMAN-reported state, separate from independent verification. */
  humanReportedOnly: true;
  idempotencyKey: string;
}

export type NotificationType =
  | 'OWNER_UPDATE_REQUEST' | 'EMPLOYEE_RESPONSE' | 'NEEDS_VERIFICATION' | 'BLOCKER' | 'MISSING_COVERAGE'
  | 'DAILY_DIGEST' | 'WEEKLY_PRINT_INSIGHT' | 'DIRECT_MENTION' | 'FOLLOW_UP'
  | 'PROJECT_PAUSED' | 'PROJECT_RESUMED' | 'RESUME_REMINDER' | 'PAUSE_SUGGESTION' | 'PILOT_REACHED' | 'AI_FINDING' | 'PROJECT_ASSIGNED' | 'APPROVAL_REQUEST' | 'EMPLOYEE_UPDATE'
  | 'ERROR_LOGGED' | 'ERROR_ACKNOWLEDGED' | 'ERROR_FOR_YOU' | 'ERROR_REMINDER';
export type NotificationState = 'CREATED' | 'DELIVERED' | 'READ' | 'ACKNOWLEDGED' | 'DISMISSED';

export interface Notification {
  id: string;
  recipientUid: string;
  senderUid: string | null;
  type: NotificationType;
  title: string;
  preview: string;
  projectId: string | null;
  stepId: string | null;
  sourceEntityId: string;
  deepLink: string;
  createdAt: string;
  deliveredAt: string | null;
  readAt: string | null;
  acknowledgedAt: string | null;
  state: NotificationState;
  snoozedUntil: string | null;
  idempotencyKey: string;
}

// ---------- Time clock ----------
export interface Shift {
  id: string;
  uid: string;
  clockInAt: string;
  clockOutAt: string | null;
  /** Review work is paid working time. These record when review happened relative to the shift. */
  reviewSessions: { startedAt: string; submittedAt: string | null; cardId: string }[];
  clockInKey: string;
  clockOutKey: string | null;
}

// ---------- Print ----------
export interface PrintJob {
  id: string;
  printer: string;
  deviceId: string;
  uid: string | null; // actor if known; frequently null (device only)
  startedAt: string;
  endedAt: string | null;
  status: 'COMPLETED' | 'FAILED' | 'CANCELLED' | 'IN_PROGRESS' | 'RETRY';
  sheets: number;
  jobType: 'ENVELOPES' | 'INVITATIONS' | 'LABELS' | 'CARDS';
  retryOf: string | null;
}
export interface PrinterProblemEvent { id: string; printer: string; at: string; kind: 'JAM' | 'TONER' | 'OFFLINE' | 'PAUSED'; state: 'problem' | 'cleared' }
/** Per 5-minute bin observations used for the four-state analysis. */
export interface ActivityBin { deviceId: string; start: string; printerRunning: boolean; pcInputObserved: boolean; covered: boolean }
export interface PrintStation { deviceId: string; printers: string[]; defaultUid: string | null }

export interface Opportunity {
  id: string;
  title: string;
  problem: string;
  evidence: string[];
  rootCauseHypothesis: string;
  proposal: string;
  steps: string[];
  estMinutesSavedPerUnit: number;
  unitsPerMonth: number;
  risk: string;
  confidence: 'LOW' | 'MEDIUM' | 'HIGH';
  measurementPlan: string;
  state: 'PROPOSED' | 'APPROVED' | 'DEFERRED' | 'REJECTED' | 'MORE_EVIDENCE_REQUESTED';
  createdProjectId: string | null;
  decisionNote: string | null;
  decidedAt: string | null;
  realizedValue: string;
}

export interface AiRun {
  id: string;
  startedAt: string;
  endedAt: string;
  cause: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  outcome: 'OK' | 'SKIPPED_BUDGET' | 'FAILED' | 'DISABLED';
  promptVersion: string;
  sourceWatermark: string | null;
  errors: string[];
}

export interface Settings {
  aiOutage: boolean; // demo toggle: model provider down
  logSyncOutage: boolean; // demo toggle: MT Log sync missing
  monthlyBudgetUsd: number;
  budgetWarnPct: number;
  budgetCircuitBreakerPct: number;
  emailUrgentOptIn: boolean; // simulated only
  reviewReadyTargetMinutes: number;
  backupReadyLocalTime: string;
  retentionDays: { raw: number; business: number };
  statusRunLocalTime: string; // first scheduled status run of the day (America/Chicago)
}

export interface Verifier { id: string }

/** Work an employee saved as "everyday work" or "maybe a new project" — not part of a tracked project step. */
export interface WorkLogEntry {
  id: string;
  uid: string;
  /** Empty for small tasks a person logged by hand. */
  findingId: string;
  kind: 'EVERYDAY' | 'MAYBE_PROJECT' | 'SMALL_TASK';
  title: string;
  loggedAt: string;
  deviceId: string;
  evidenceSummaries: string[];
  /** When the work was done (a person can enter it by hand). */
  doneAt?: string;
  /** Who asked for it ("Dalia asked Erika"). */
  requestedByUid?: string | null;
  note?: string | null;
  origin?: 'DETECTED' | 'MANUAL';
  projectId?: string | null;
  stepId?: string | null;
}

// ======================= v1.1: AI Recommendations (OWNER-ONLY unless noted) =======================
export type FindingKind =
  | 'Incident' | 'Blocker' | 'Open follow-up' | 'Workflow improvement' | 'Automation idea' | 'Revenue opportunity' | 'Expense reduction'
  | 'Quality risk' | 'Compliance/policy change' | 'Documentation gap' | 'Employee learning/support' | 'Data quality gap' | 'Other';
export type FactLabel = 'CONFIRMED_SOURCE_FACT' | 'LIKELY_INFERENCE' | 'HYPOTHESIS' | 'UNKNOWN';
export type EvidenceQuality = 'MEASURED' | 'SOURCED' | 'ASSUMPTION' | 'HYPOTHESIS';

export interface FindingEvidence {
  id: string;
  label: string;
  sourceType: 'MT_LOG' | 'SHEET' | 'PRINT_LOG' | 'WEB' | 'OWNER_INPUT' | 'PROJECT_RECORD';
  sourceName: string;
  url: string | null; // web sources only; demo URLs are labeled simulated
  observedAt: string;
  retrievedAt?: string;
  publishedAt?: string;
  effectiveDate?: string;
  excerpt?: string;
  quality: EvidenceQuality;
}

export interface PlanStepDraft {
  title: string;
  instructions: string;
  /** Employee-safe reason. Never contains money, margin, ROI or strategy. */
  whyForGoal: string;
  deliverable: string;
  tools: string[];
  estimateHours?: number;
  evidenceDescription: string;
}
export interface ProposedPlan {
  title: string;
  /** Employee-safe objective (what to do and why in operational terms). */
  employeeObjective: string;
  deliverables: string[];
  steps: PlanStepDraft[];
  suggestedAssignees: { uid: string; caveat: string }[];
  risks: string[];
}

export interface OwnerDecision { id: string; at: string; decision: string; actorUid: string; rationale?: string; changedFields?: string[] }

export interface OwnerFinding {
  id: string;
  code: string; // AF-001
  kind: FindingKind;
  area: string;
  title: string;
  summary: string; // what was found, why it matters, how urgent, recommended action
  urgency: 'URGENT' | 'NORMAL' | 'STRATEGIC';
  factLabel: FactLabel;
  discoveredAt: string;
  lastEvidenceAt: string;
  analyzedAt: string;
  evidence: FindingEvidence[];
  occurrences: { at: string; note: string }[];
  status: 'NEW' | 'INVESTIGATING' | 'APPROVED' | 'LINKED' | 'SNOOZED' | 'DISMISSED' | 'ARCHIVED' | 'INFORMATIONAL';
  snoozedUntil?: string;
  followUpAt?: string;
  projectMatch: { type: 'NONE' | 'ALREADY_COVERED' | 'POSSIBLE_DUPLICATE' | 'CANDIDATE_NEW' | 'UNASSIGNED_INSIGHT'; projectKey?: string };
  linkedProjectId: string | null;
  approvedProjectId: string | null;
  modelId: string | null;
  plan: ProposedPlan | null;
  dedupeKey: string;
  decisions: OwnerDecision[];
  recommendedAction: string;
  uncertainties: string[];
  ownerNotes: string; // owner investigation notes: never shared
  seenByOwner: boolean;
  goalIds: string[];
  /** v1.7: structured evidence fields. All optional so older findings keep working. */
  goalId?: string; sourcesUsed?: { sourceId: string; name: string; coverage: string; dataKind: 'SYNTHETIC' | 'REAL_SNAPSHOT' | 'NONE' }[];
  isSample?: boolean; bucket?: InvestigationBucket; bucketWhy?: string;
  scope?: string; alternatives?: string[]; validation?: string; overlap?: string[]; employeeBrief?: string;
  impact?: { kind: 'revenue' | 'contribution profit' | 'cost savings' | 'capacity' | 'risk reduction' | 'unknown'; text: string; math: string | null; scenarios: { label: string; value: string }[] | null };
  score?: { urgency: number; value: number; evidence: number; feasibility: number; risk: number; ownerPriority: number; overlap: number };
  evidenceSig?: string;
}

export interface ModelVar {
  key: string;
  label: string;
  unit: string;
  low: number | null;
  base: number | null;
  high: number | null;
  quality: EvidenceQuality;
  source: string;
  retrievedAt?: string;
}
export interface OpportunityModel {
  id: string;
  findingId: string;
  version: number;
  type: 'CAPACITY' | 'REVENUE';
  impactCategory: string;
  baselinePeriod: string;
  variables: ModelVar[];
  overlapKey: string | null; // opportunities sharing an output cannot be added together
  measurementPlan: string;
  history: { version: number; at: string; changed: string }[];
}

export type InvestigationBucket = 'Urgent' | 'Needs decision' | 'Follow up' | 'Worth testing' | 'Background idea';
export interface BusinessGoal {
  id: string; title: string; description: string; priority: 'HIGH' | 'NORMAL' | 'LOW'; enabled: boolean; area: string; createdAt: string;
  /** v1.7: investigation priorities. All optional so older goals keep working. */
  catalogId?: string; custom?: boolean; tier?: 'A' | 'B' | 'C';
  /** The business question in plain English. Editable. */
  question?: string;
  /** Sources this goal may use. The goal cannot run unless every one is approved and has data. */
  sourceIds?: string[];
  /** Checks to run (from the check library). A goal with no checks is saved as a brief and does not invent findings. */
  checks?: string[];
  /** Editable numbers for the checks, for example how many days count as stale. */
  params?: Record<string, number>;
  evidenceNeeded?: string; projectExamples?: string[]; safety?: string;
  lastRunAt?: string | null; lastRunNote?: string | null;
}
export type SourceStatus = 'NOT_CONNECTED' | 'DEMO_ONLY' | 'PENDING_PERMISSION' | 'CONNECTED' | 'STALE' | 'ERROR' | 'DISABLED';
export interface IntelligenceSource {
  id: string; name: string; type: string; allowed: string; sensitivity: 'OWNER_ONLY' | 'TEAM' | 'PUBLIC';
  demoEnabled: boolean; health: 'OK' | 'LATE' | 'GAP' | 'NOT_CONNECTED'; lastCheckedAt: string | null; note: string; cadence: string;
  /** v1.7: source registry fields. All optional so older sources keep working. */
  catalogId?: string; tier?: 'A' | 'B' | 'C'; custom?: boolean;
  status?: SourceStatus;
  /** Did the owner approve the AI reading this source? Nothing is approved automatically. */
  approved?: boolean;
  /** What data exists behind this source in THIS build. NONE = nothing to read. SYNTHETIC = made-up sample. REAL_SNAPSHOT = a one-time copy of real data. */
  dataKind?: 'NONE' | 'SYNTHETIC' | 'REAL_SNAPSHOT';
  purpose?: string; scope?: string; excluded?: string; retention?: string; visibility?: 'OWNER_ONLY' | 'WORKER_SAFE';
  coverage?: string; lag?: string; costNote?: string; missing?: string; safety?: string;
  exampleQuestions?: string[]; suggestedPriority?: 'HIGH' | 'NORMAL' | 'LOW';
  /** Small made-up fixture rows for demo investigations (never present in a real-data build). */
  sampleRows?: { id: string; label: string; detail: string; verified: boolean; at: string }[];
}
export interface OutcomeMeasurement {
  id: string; findingId: string; projectId: string; period: string; actualHours: number | null; actualOrders: number | null; limitations: string; recordedAt: string;
}

export interface WorkspaceFolder { id: string; name: string; parentId: string | null; webViewLink: string }
export interface WorkspaceShortcut { id: string; name: string; parentId: string; targetId: string; targetResourceId: string }
export interface ProjectWorkspace {
  projectId: string;
  state: 'PLANNED' | 'CREATING' | 'PARTIALLY_CREATED' | 'READY' | 'ERROR' | 'REPAIR_REQUIRED';
  rootId: string;
  folderId: string | null;
  subfolderIds: Record<string, string>;
  shortcuts: WorkspaceShortcut[];
  pointers: { id: string; label: string; path: string; purpose: string; version: string | null; resourceId: string }[];
  sheetResourceIds: string[];
  attempts: number;
  lastError: string | null;
  idempotencyKey: string;
  completedAt: string | null;
  log: { at: string; op: string; detail: string }[]; // always labeled simulated in the UI
}
export interface DriveSim { folders: WorkspaceFolder[]; shortcuts: WorkspaceShortcut[]; failAfterOps: number | null; opCount: number }

// ---------- v1.9: owner feedback on AI findings ----------
/** What Dalia told the AI when she dismissed something. NEVER_AGAIN stops that kind of finding for that goal until she undoes it. */
export interface AiFeedback {
  id: string; findingId: string; findingCode: string; checkKey: string; goalId: string | null; kind: FindingKind; area: string; title: string;
  scope: 'THIS_TIME' | 'NEVER_AGAIN'; note: string; at: string; active: boolean;
}

// ---------- v1.9: print orders (claims) and errors ----------
/** One claimed order from the print log. A claim is "what the order asked for", never how many tries it took. */
export interface PrintClaim {
  id: string; orderId: string; uid: string; claimedAt: string; buyer: string;
  items: { sku: string; quantity: number; subtotal: number; prints: number }[];
  subtotal: number; prints: number;
  /** Set when the person gave the order back. An unclaimed order counts for nobody. */
  unclaimedAt?: string;
}
/** One row of a PC print log CSV (Date, File Name, Copies, PC, Printer, File Path). Copies are what was SUBMITTED to the printer. */
export interface PrintLogRow { id: string; at: string; file: string; copies: number; pc: string; printer: string; path: string }
/** A person at customer service said “this log file is for that order”. Kept with who and when. */
export interface OrderFileLink { id: string; orderId: string; file: string; byUid: string; at: string }
export interface CsCaseNote { id: string; orderId: string; byUid: string; at: string; text: string }
export interface CsSearch { id: string; byUid: string; at: string; orderId: string; found: boolean }
/** A note on one step. Every note belongs to a step. */
export interface StepNote { id: string; stepId: string; projectId: string; byUid: string; at: string; text: string }

export interface DayNote { id: string; uid: string; date: string; text: string; at: string }

/** A customer service error entry. The person sees it only after an owner has acknowledged it. */
export interface ErrorLog {
  id: string; uid: string; occurredOn: string; links: string[]; description: string;
  createdByUid: string; createdAt: string;
  /** Owner review. For an owner who is the subject (like Moe) one acknowledgement covers both the review and their own. */
  ownerAck: { byUid: string; at: string; note: string; alsoForSubject: boolean } | null;
  personAck: { at: string; note: string; byUid: string } | null;
  /** Hidden from the clock-out check until this time (next clock in). Never a dismissal. */
  snoozedUntilClockIn: boolean;
  /** Edits made later are kept. */
  history: { at: string; byUid: string; what: string }[];
}
export interface ErrorHintDismissal { key: string; uid: string; at: string }
