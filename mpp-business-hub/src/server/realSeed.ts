import type { Project, Step, User, ProjectEvent } from '../domain/types';
import { chicagoToUtc } from '../domain/time';
import type { HubState } from './state';
import type { ActivityBin, PrintJob, PrinterProblemEvent, PrintStation } from '../domain/types';

export interface RealLogs { printers: Record<string, string[]>; printJobs: PrintJob[]; printerProblems: PrinterProblemEvent[]; activityBins: ActivityBin[] }
import { base, stepBase, settings } from './seed';

type Row = [string, string, 'D' | 'I' | 'B' | 'N' | 'X', string | null, string | null, (string | null)?, (string | null)?];
interface RealProject { key: string; short: string; lead: string; members: string[]; deadline: string | null; priority: Project['priority']; title: string; details: string; steps: Row[]; closed?: string }
export interface RealTracker { people: { id: string; name: string; role: User['role']; area: User['area']; device: string | null; note: string }[]; projects: RealProject[] }

const ts = (s: string | null) => (s ? chicagoToUtc(s.slice(0, 10), s.slice(11, 16)) : null);

/** Builds a state from the owner's real tracker rows. Used only by the private real-data build. */
export function buildRealState(demo: HubState, t: RealTracker, nowLocal: string, logs?: RealLogs | null): HubState {
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
    ownerFindings: [], ownerModels: [], outcomes: [], goals: [], sources: [], workspaces: {},
  };
}
