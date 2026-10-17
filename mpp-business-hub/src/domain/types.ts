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

export interface Project {
  id: string;
  key: string; // P-012
  title: string;
  objective: string;
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
  dueAt: string | null;
  impact: 'ROUTINE' | 'HIGH';
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
  humanReported: { choice: ResponseChoice; note: string | null; at: string; byUid: string } | null;
  /** Independent verifier results for this step (e.g. marketplace state). */
  verifications: Verification[];
  /** Latest Not-yet-handled "new activity" marker. */
  newActivityAt: string | null;
  linkedDocLabel?: string;
}

export interface Verification {
  id: string;
  stepId: string;
  verifier: string; // e.g. "Shopify product lookup (simulated)"
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
  /** Only set for a verified (simulated) openable link. */
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
  sourceLinked?: boolean; // scripts: is source/manifest linked?
  checklistSummary?: { total: number; yes: number; fix: number; blank: number; sourceNote: string } | null;
  notes?: string;
}

export interface ResourceLink {
  id: string;
  resourceId: string;
  projectId: string;
  stepId: string | null;
  role: ResourceRole;
  associationState: 'SUGGESTED' | 'CONFIRMED' | 'REJECTED';
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
  | 'ACK' | 'PLAN_CHANGE' | 'ACCESS';
export type ConfidenceBand = 'LOW' | 'MEDIUM' | 'HIGH' | 'N_A';
export type VerificationState = 'OFFICIAL' | 'AI_DETECTED' | 'EMPLOYEE_CONFIRMED' | 'INDEPENDENTLY_VERIFIED' | 'NEEDS_REVIEW' | 'UNKNOWN';

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

export type ResponseChoice = 'COMPLETED' | 'IN_PROGRESS' | 'NOT_STARTED' | 'BLOCKED' | 'WAITING' | 'NOT_APPLICABLE';
export type CardAction = 'CONFIRM' | 'NEEDS_CORRECTION' | 'NOT_MY_WORK' | 'DISMISS' | 'DEFER' | 'SEND_STATUS';

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
  | 'DAILY_DIGEST' | 'WEEKLY_PRINT_INSIGHT' | 'DIRECT_MENTION' | 'FOLLOW_UP';
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
}

export interface Verifier { id: string }
