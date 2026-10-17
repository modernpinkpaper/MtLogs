import type {
  ActivityBin, AiRun, AuditEvent, Finding, IntakeRun, MtLogEvent, NormalizedEvent, Notification, Opportunity, PrintJob,
  PrinterProblemEvent, PrintStation, Project, ProjectEvent, Resource, ResourceLink, ReviewCard, ReviewDecision, Settings,
  Shift, SourceArchive, Step, UpdateRequest, UpdateResponse, User, WorkAssignment, WorkEpisode, WorkLogEntry,
} from '../domain/types';

export interface HubState {
  /** Simulated clock. The prototype never reads wall-clock time for business logic. */
  now: string;
  lastOwnerLookAt: string;
  users: User[];
  assignments: WorkAssignment[];
  projects: Project[];
  steps: Step[];
  resources: Resource[];
  resourceLinks: ResourceLink[];
  projectEvents: ProjectEvent[];
  auditEvents: AuditEvent[];
  archives: SourceArchive[];
  /** Raw file text stands in for the authorized file store (not Firestore). */
  rawFileText: Record<string, string>;
  events: NormalizedEvent[];
  episodes: WorkEpisode[];
  findings: Finding[];
  reviewCards: ReviewCard[];
  reviewDecisions: ReviewDecision[];
  updateRequests: UpdateRequest[];
  updateResponses: UpdateResponse[];
  notifications: Notification[];
  shifts: Shift[];
  intakeRuns: IntakeRun[];
  aiRuns: AiRun[];
  printJobs: PrintJob[];
  printerProblems: PrinterProblemEvent[];
  activityBins: ActivityBin[];
  stations: PrintStation[];
  opportunities: Opportunity[];
  settings: Settings;
  idempotency: Record<string, unknown>;
  counters: Record<string, number>;
  printPendingSync: Record<string, boolean>;
  deviceLastSeen: Record<string, string>;
  seenInjection: boolean;
  workLog: WorkLogEntry[];
}

export type { MtLogEvent };
