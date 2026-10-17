import type {
  ClaimType, ConfidenceBand, Finding, FindingType, InferenceLevel, NormalizedEvent, Project, Step, WorkEpisode, CoverageState,
} from '../domain/types';
import { formatTime } from '../domain/time';

/** What the model layer is allowed to see. Built AFTER permission filtering, never from raw state. */
export interface AnalysisContext {
  nowIso: string;
  steps: Pick<Step, 'id' | 'projectId' | 'title' | 'status' | 'evidenceHints' | 'impact'>[];
  projects: Pick<Project, 'id' | 'key' | 'title'>[];
  /** All normalized events in the analysis window (whole window, not just new ones). */
  events: NormalizedEvent[];
  episodes: WorkEpisode[];
  coverageByDevice: Record<string, CoverageState>;
  previousFindings: Pick<Finding, 'id' | 'stepId' | 'groupKey' | 'status' | 'sourceEventIds'>[];
}

export interface FindingDraft {
  findingType: FindingType;
  claimType: ClaimType;
  projectId: string | null;
  stepId: string | null;
  deviceId: string;
  headline: string;
  observedFacts: string[];
  inference: string;
  uncertainties: string[];
  verificationNeeded: string[];
  proposedUpdate: Finding['proposedUpdate'];
  confidenceBand: Exclude<ConfidenceBand, 'N_A'>;
  inferenceLevel: InferenceLevel;
  sourceEventIds: string[];
  coverageState: CoverageState;
  classification?: Finding['classification'];
  refs: Finding['refs'];
  groupKey: string;
}

export interface ModelAdapter {
  readonly name: string;
  readonly version: string;
  readonly promptVersion: string;
  /** Live adapters would be async + budget-gated. */
  analyze(ctx: AnalysisContext): Promise<unknown[]>;
}

/** Live provider adapter: present as a clean seam, DISABLED by default and never called in the prototype. */
export class DisabledLiveAdapter implements ModelAdapter {
  readonly name = 'live-llm (disabled)';
  readonly version = '0';
  readonly promptVersion = 'n/a';
  async analyze(): Promise<unknown[]> {
    throw new Error('Live AI adapter is disabled in the prototype (VITE_LIVE_AI_ENABLED=false). No API call was made.');
  }
}

const FINDING_TYPES: FindingType[] = ['AI_PROGRESS', 'AI_COMPLETION_SUGGESTION', 'AI_DISCREPANCY', 'AI_UNMATCHED_WORK', 'BLOCKER', 'RESOURCE_SUGGESTION', 'LATE_EVIDENCE'];
const CLAIMS: ClaimType[] = ['OBSERVED_ACTION', 'LIKELY_ACTION', 'EMPLOYEE_REPORTED', 'SYSTEM_VERIFIED', 'UNKNOWN_OR_CONFLICTING'];

/**
 * Strict schema validation of model output. Also enforces policy: a model can never emit
 * SYSTEM_VERIFIED (that requires a defined verifier record) or propose completion.
 */
export function validateFindingDraft(d: unknown): string[] {
  const errs: string[] = [];
  if (!d || typeof d !== 'object') return ['not an object'];
  const o = d as Record<string, unknown>;
  if (!FINDING_TYPES.includes(o.findingType as FindingType)) errs.push('findingType invalid');
  if (!CLAIMS.includes(o.claimType as ClaimType)) errs.push('claimType invalid');
  if (o.claimType === 'SYSTEM_VERIFIED') errs.push('model output may not claim SYSTEM_VERIFIED');
  if (typeof o.headline !== 'string' || !o.headline) errs.push('headline missing');
  for (const k of ['observedFacts', 'uncertainties', 'verificationNeeded', 'sourceEventIds']) {
    if (!Array.isArray(o[k])) errs.push(`${k} must be an array`);
  }
  if (Array.isArray(o.sourceEventIds) && o.sourceEventIds.length === 0) errs.push('sourceEventIds empty (no evidence cited)');
  if (typeof o.inference !== 'string') errs.push('inference missing');
  if (!['LOW', 'MEDIUM', 'HIGH'].includes(o.confidenceBand as string)) errs.push('confidenceBand invalid');
  const pu = o.proposedUpdate as { kind?: string } | undefined;
  if (!pu || typeof pu.kind !== 'string') errs.push('proposedUpdate missing');
  if (typeof o.groupKey !== 'string') errs.push('groupKey missing');
  const text = JSON.stringify(o).toLowerCase();
  if (/mark(ed)?\s+(it\s+)?(as\s+)?(done|complete)/.test(text) && pu?.kind !== 'NONE') {
    errs.push('model output proposes completion; findings may only observe');
  }
  return errs;
}

// ----- helpers for the replay analyzer -----
const t = (iso: string) => formatTime(iso);

export function describeEvent(e: NormalizedEvent): string {
  return `${t(e.occurredAt)} — ${e.allowedSummary} [${e.deviceId}]`;
}
