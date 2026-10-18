import type {
  ActivityBin, AiRun, AuditEvent, Finding, IntakeRun, MtLogEvent, NormalizedEvent, Notification, Opportunity, PrintJob,
  PrinterProblemEvent, PrintStation, Project, ProjectEvent, Resource, ResourceLink, ReviewCard, ReviewDecision, Settings,
  Shift, SourceArchive, BusinessGoal, IntelligenceSource, OpportunityModel, OutcomeMeasurement, OwnerFinding, ProjectWorkspace, DriveSim, Step, UpdateRequest, UpdateResponse, User, WorkAssignment, WorkEpisode, WorkLogEntry,
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
  /** Which version each person chose to work with. A choice, never an approval. */
  workingVersions: { uid: string; resourceId: string; version: string; at: string }[];
  // ---- v1.1 ----
  /** OWNER-ONLY collections. Only methods that call requireOwner may read them. */
  ownerFindings: OwnerFinding[];
  ownerModels: OpportunityModel[];
  outcomes: OutcomeMeasurement[];
  goals: BusinessGoal[];
  sources: IntelligenceSource[];
  workspaces: Record<string, ProjectWorkspace>;
  drive: DriveSim;
  lastFindingsLookAt: string;
  lastScanAt: string | null;
  scanCount: number;
}

export type { MtLogEvent };
