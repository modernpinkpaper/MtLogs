import type { Project, Step, User, ProjectEvent } from '../domain/types';
import { chicagoToUtc } from '../domain/time';
import type { HubState } from './state';
import type { OwnerFinding, FindingEvidence, ActivityBin, PrintJob, PrinterProblemEvent, PrintStation } from '../domain/types';

export interface RealFinding { code: string; kind: OwnerFinding['kind']; area: string; urgency: OwnerFinding['urgency']; fact: OwnerFinding['factLabel']; project: OwnerFinding['projectMatch']; title: string; summary: string; action: string; uncertainties: string[]; evidence: [string, FindingEvidence['sourceType'], string, FindingEvidence['quality']][] }
export interface RealLogs { printers: Record<string, string[]>; printJobs: PrintJob[]; printerProblems: PrinterProblemEvent[]; activityBins: ActivityBin[] }
import { base, stepBase, settings } from './seed';
import { catalogSources, catalogGoals } from '../domain/catalog';
import type { IntelligenceSource } from '../domain/types';

type Row = [string, string, 'D' | 'I' | 'B' | 'N' | 'X', string | null, string | null, (string | null)?, (string | null)?];
interface RealProject { key: string; short: string; lead: string; members: string[]; deadline: string | null; priority: Project['priority']; title: string; details: string; steps: Row[]; closed?: string }
export interface RealTracker { people: { id: string; name: string; role: User['role']; area: User['area']; device: string | null; note: string }[]; projects: RealProject[] }

const ts = (s: string | null) => (s ? chicagoToUtc(s.slice(0, 10), s.slice(11, 16)) : null);

/** Builds a state from the owner's real tracker rows. Used only by the private real-data build. */
const SRC_BY_TYPE: Record<string, string> = { MT_LOG: 'src-A2', PRINT_LOG: 'src-A4', PROJECT_RECORD: 'src-A1', SHEET: 'src-A1', OWNER_INPUT: 'src-A1', WEB: 'src-B9' };
function realSources(now: string, logs?: RealLogs | null): IntelligenceSource[] {
  const src = catalogSources();
  const snap = (cat: string, patch: Partial<IntelligenceSource>) => Object.assign(src.find((x) => x.catalogId === cat)!, { dataKind: 'REAL_SNAPSHOT', approved: true, status: 'STALE', health: 'LATE', lastCheckedAt: now, ...patch });
  snap('A1', { coverage: '8 projects from the tracker (the 5 to 8 most recently active), copied once on Oct 18', lag: 'One-time copy. It does not refresh.', scope: 'Dalia’s tracker: OCTOBER 2026 and each person’s tab. Not the time log.', note: 'A one-time read-only copy. It will not update by itself.' });
  if (logs) {
    snap('A2', { coverage: 'Oct 16, 8 AM to about 5 PM, 7 computers. Counts and times only.', lag: 'One day only. Does not refresh.', scope: 'Hourly files from the 7 company computers', note: 'One-time copy of one day. Customer names, order numbers and page titles were left out.' });
    snap('A4', { coverage: 'Oct 16, print jobs and printer warnings from 5 computers', lag: 'One day only. Does not refresh.', scope: 'Print records from the print computers', note: 'One-time copy of one day. Document names were left out.' });
  }
  return src;
}
export function buildRealState(demo: HubState, t: RealTracker, nowLocal: string, logs?: RealLogs | null, findings?: RealFinding[] | null): HubState {
  const now = ts(nowLocal)!;
  const users: User[] = t.people.map(p => ({ id: p.id, name: p.name, role: p.role, area: p.area, active: true, capabilities: [], primaryDeviceId: p.device, rosterNote: p.note }));
  const projects: Project[] = [];
  const steps: Step[] = [];
  const journal: ProjectEvent[] = [];
  for (const p of t.projects) {
    const id = `prj-${p.key.slice(2)}`;
    const last = p.steps.map(s => ts(s[3]) ?? ts(s[4])).filter(Boolean).sort().pop() ?? now;
    const allDone = p.steps.every(s => s[2] === 'D' || s[2] === 'X');
    projects.push({ ...base(), id, key: p.key, shortName: p.short, title: p.title, objective: p.details, description: p.details, businessGoal: '', ownerUid: 'u-dalia',
      memberUids: p.members, visibility: 'ASSIGNED_ONLY', priority: p.priority, deadlineAt: ts(p.deadline ? `${p.deadline} 17:00` : null), updatedAt: last,
      createdAt: ts(p.steps[0][4] ?? p.steps[0][3]) ?? last, closedAt: allDone && p.closed ? ts(p.closed) : null,
      currentRisk: p.steps.some(s => s[2] === 'B') ? 'Some steps are blocked.' : null });
    p.steps.forEach((s, i) => {
      const [title, details, code, done, started, reason, who] = s;
      const status = code === 'D' ? 'REPORTED_COMPLETE' : code === 'I' ? 'IN_PROGRESS' : code === 'B' ? 'BLOCKED' : code === 'X' ? 'CANCELLED' : 'NOT_STARTED';
      const sid = `s-${p.key.slice(2)}-${i + 1}`;
      const prev = i > 0 ? [`s-${p.key.slice(2)}-${i}`] : [];
      steps.push({ ...stepBase(), id: sid, projectId: id, sortOrder: i + 1, title, instructions: details || title, status, assignedUids: [who ?? p.lead], impact: 'ROUTINE',
        verificationSource: code === 'D' ? 'EMPLOYEE_CONFIRMED' : 'NONE', blockerReason: code === 'B' ? (reason ?? 'Blocked') : null, observedNote: code === 'X' ? reason ?? null : null, dependencyIds: [], lastConfirmedAt: ts(done), lastActivityAt: ts(done) ?? ts(started) } as Step);
      void prev;
      if (code === 'D' && done) {
        const actor = who ?? p.lead;
        journal.push({ id: `pe-${sid}`, projectId: id, stepIds: [sid], type: 'STATUS_CHANGE', occurredAt: ts(done)!, recordedAt: ts(done)!, actorUid: actor, actorType: 'HUMAN',
          actorLabel: `Authenticated ${t.people.find(x => x.id === actor)?.name ?? ''}`, title: `Step ${i + 1} marked done`, summary: `“${title}” (tracker: Done).`,
          verificationState: 'EMPLOYEE_CONFIRMED', confidenceBand: 'N_A', sourceRefs: [], relatedResourceIds: [], relatedRequestId: null, relatedResponseId: null, visibility: 'ASSIGNED_ONLY' });
      }
    });
  }
  return {
    ...demo, now, lastOwnerLookAt: chicagoToUtc('2026-10-16', '17:00'), users, assignments: [], projects, steps, resources: [], resourceLinks: [], projectEvents: journal,
    auditEvents: [], archives: [], rawFileText: {}, events: [], episodes: [], findings: [], reviewCards: [], reviewDecisions: [], updateRequests: [], updateResponses: [], notifications: [], shifts: [],
    printJobs: logs?.printJobs.map(j => ({ ...j, uid: t.people.find(p => p.device === j.deviceId)?.id ?? null })) ?? [], printerProblems: logs?.printerProblems ?? [], activityBins: logs?.activityBins ?? [],
    stations: Object.entries(logs?.printers ?? {}).map(([deviceId, printers]): PrintStation => ({ deviceId, printers, defaultUid: t.people.find(p => p.device === deviceId)?.id ?? null })), opportunities: [], settings: settings(), workLog: [], workingVersions: [],
    sources: realSources(now, logs), goals: realGoals(now),
    ownerFindings: (findings ?? []).map((f, i): OwnerFinding => ({ id: `af-r${i + 1}`, code: f.code, kind: f.kind, area: f.area, title: f.title, summary: f.summary, urgency: f.urgency, factLabel: f.fact,
      discoveredAt: now, lastEvidenceAt: now, analyzedAt: now, occurrences: [], decisions: [], status: 'NEW', projectMatch: f.project, linkedProjectId: null, approvedProjectId: null, modelId: null, plan: null,
      dedupeKey: f.code, goalId: undefined, isSample: false, sourcesUsed: [...new Set(f.evidence.map((e) => SRC_BY_TYPE[e[1]]))].map((id) => ({ sourceId: id, name: 'Copy of real data', coverage: 'Oct 16 (logs) and Oct 18 (tracker)', dataKind: 'REAL_SNAPSHOT' as const })),
      bucket: f.urgency === 'URGENT' ? 'Urgent' : f.kind === 'Open follow-up' || f.kind === 'Data quality gap' ? 'Follow up' : f.kind === 'Automation idea' || f.kind === 'Workflow improvement' ? 'Worth testing' : 'Background idea', bucketWhy: 'Written by Claude from the tracker and computer logs.', alternatives: f.uncertainties, impact: { kind: 'unknown' as const, text: 'Insufficient data to estimate. No sales, cost or time numbers are connected.', math: null, scenarios: null }, recommendedAction: f.action, uncertainties: f.uncertainties, ownerNotes: '', seenByOwner: false, goalIds: [],
      evidence: f.evidence.map(([label, sourceType, sourceName, quality], k) => ({ id: `e${k + 1}`, label, sourceType, sourceName, url: null, observedAt: now, quality })) })), ownerModels: [], outcomes: [], workspaces: {},
  };
}

function realGoals(now: string) {
  const g = catalogGoals(now);
  for (const id of ['ig-A1a', 'ig-A1b', 'ig-A4a', 'ig-A2a']) g.find((x) => x.id === id)!.enabled = true;
  return g;
}
