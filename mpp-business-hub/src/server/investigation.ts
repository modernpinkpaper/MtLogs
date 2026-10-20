import { isMuted } from './ownerHome';
import type { HubServer } from './hub';
import type { BusinessGoal, FindingEvidence, IntelligenceSource, InvestigationBucket, OwnerFinding, PlanStepDraft, Project, ProposedPlan, Step } from '../domain/types';
import { CHECK_LIBRARY, SOURCE_CATALOG } from '../domain/catalog';
import { isStepDone } from '../domain/projectStatus';
import { HubError } from './errors';

// OWNER-ONLY. The investigation runner reads only sources the owner approved, runs plain rule-based checks over data that really
// exists in this build, and writes findings with their evidence. It makes no AI call, no network call, and changes nothing outside the app.

const owner = (hub: HubServer, uid: string) => hub.requireOwner(uid);
const DAY = 86400000;
const USABLE: IntelligenceSource['status'][] = ['DEMO_ONLY', 'CONNECTED', 'STALE'];

// ------------------------------------------------------------------ sources
export type SourcePatch = Partial<Pick<IntelligenceSource, 'name' | 'purpose' | 'scope' | 'allowed' | 'excluded' | 'retention' | 'cadence' | 'visibility' | 'costNote' | 'suggestedPriority' | 'note' | 'exampleQuestions'>>;

export function sourceIsUsable(s: IntelligenceSource | undefined): boolean {
  return !!s && !!s.approved && !!s.status && USABLE.includes(s.status) && (s.dataKind ?? 'NONE') !== 'NONE';
}
export function sourceStateText(s: IntelligenceSource): string {
  return ({ NOT_CONNECTED: 'Not connected', DEMO_ONLY: 'Demo only (made-up data)', PENDING_PERMISSION: 'Pending permission', CONNECTED: 'Connected', STALE: 'Connected but stale', ERROR: 'Error', DISABLED: 'Disabled' } as const)[s.status ?? 'NOT_CONNECTED'];
}

/** Approve or pause a source. Approving a source with no data in this build records your permission but does NOT connect anything. */
export function setSourceApproval(hub: HubServer, uid: string, id: string, on: boolean) {
  owner(hub, uid); const s = hub.state.sources.find((x) => x.id === id);
  if (!s) throw new HubError('NOT_FOUND', 'We could not find that source.');
  return hub.commit(() => {
    const kind = s.dataKind ?? 'NONE';
    s.approved = on; s.demoEnabled = on && kind === 'SYNTHETIC';
    if (!on) { s.status = kind === 'NONE' ? 'NOT_CONNECTED' : 'DISABLED'; s.health = 'NOT_CONNECTED'; }
    else if (kind === 'NONE') { s.status = 'PENDING_PERMISSION'; s.health = 'NOT_CONNECTED'; s.note = `You approved this. Nothing is connected yet. ${s.missing ?? ''}`.trim(); }
    else if (kind === 'REAL_SNAPSHOT') { s.status = 'STALE'; s.health = 'LATE'; s.lastCheckedAt ??= hub.state.now; }
    else { s.status = s.health === 'GAP' || s.health === 'LATE' ? 'STALE' : 'DEMO_ONLY'; if (s.health === 'NOT_CONNECTED') s.health = 'OK'; s.lastCheckedAt = hub.state.now; }
    hub.audit({ entityType: 'source', entityId: s.id, action: on ? 'SOURCE_APPROVED' : 'SOURCE_PAUSED', before: null, after: { status: s.status }, actorUid: uid, actorLabel: hub.userName(uid), reason: on ? 'Owner approved this source. No live connection was made.' : 'Owner paused this source. Future investigations will not use it.', evidenceRefs: [], projectId: null });
    return s;
  });
}
export function updateSource(hub: HubServer, uid: string, id: string, patch: SourcePatch) {
  owner(hub, uid); const s = hub.state.sources.find((x) => x.id === id);
  if (!s) throw new HubError('NOT_FOUND', 'We could not find that source.');
  if (patch.name !== undefined && !patch.name.trim()) throw new HubError('VALIDATION', 'Please give the source a name.');
  return hub.commit(() => {
    Object.assign(s, patch);
    hub.audit({ entityType: 'source', entityId: s.id, action: 'SOURCE_EDITED', before: null, after: Object.keys(patch), actorUid: uid, actorLabel: hub.userName(uid), reason: 'Owner edited what this source may read.', evidenceRefs: [], projectId: null });
    return s;
  });
}
export function addSource(hub: HubServer, uid: string, input: { name: string; purpose: string; scope: string; allowed: string; sensitivity?: IntelligenceSource['sensitivity'] }) {
  owner(hub, uid);
  if (!input.name.trim()) throw new HubError('VALIDATION', 'Please give the source a name.');
  return hub.commit(() => {
    const s: IntelligenceSource = { id: hub.nid('src'), custom: true, name: input.name.trim(), type: 'Custom', allowed: input.allowed.trim() || 'Not set yet', sensitivity: input.sensitivity ?? 'OWNER_ONLY', demoEnabled: false, health: 'NOT_CONNECTED', lastCheckedAt: null,
      note: 'Added by you. Nothing is connected. The app needs a way to read this before it can be used.', cadence: 'Not set yet', status: 'NOT_CONNECTED', approved: false, dataKind: 'NONE', purpose: input.purpose.trim(), scope: input.scope.trim() || 'Not set yet',
      excluded: 'Not set yet', retention: 'Not set yet', visibility: 'OWNER_ONLY', coverage: 'Nothing read yet', lag: '—', costNote: 'Not estimated', missing: 'Needs a read-only way to get this data, approved by you.', exampleQuestions: [], suggestedPriority: 'NORMAL' };
    hub.state.sources.push(s);
    hub.audit({ entityType: 'source', entityId: s.id, action: 'SOURCE_ADDED', before: null, after: { name: s.name }, actorUid: uid, actorLabel: hub.userName(uid), reason: 'Owner added a custom source.', evidenceRefs: [], projectId: null });
    return s;
  });
}
export function removeSource(hub: HubServer, uid: string, id: string) {
  owner(hub, uid); const s = hub.state.sources.find((x) => x.id === id);
  if (!s) throw new HubError('NOT_FOUND', 'We could not find that source.');
  if (!s.custom) throw new HubError('VALIDATION', 'Catalog sources cannot be removed. Pause the source instead.');
  return hub.commit(() => { hub.state.sources = hub.state.sources.filter((x) => x.id !== id); for (const g of hub.state.goals) g.sourceIds = (g.sourceIds ?? []).filter((x) => x !== id); return true; });
}

// ------------------------------------------------------------------ goals
export type GoalPatch = Partial<Pick<BusinessGoal, 'title' | 'description' | 'question' | 'priority' | 'enabled' | 'sourceIds' | 'checks' | 'params' | 'evidenceNeeded' | 'projectExamples'>>;
export function addInvestigationGoal(hub: HubServer, uid: string, input: { title: string; question: string; priority: BusinessGoal['priority']; sourceIds: string[]; checks: string[]; params?: Record<string, number> }) {
  owner(hub, uid);
  if (!input.title.trim()) throw new HubError('VALIDATION', 'Please write the goal in a few words.');
  for (const id of input.sourceIds) if (!hub.state.sources.some((s) => s.id === id)) throw new HubError('NOT_FOUND', 'One of the chosen sources does not exist.');
  for (const c of input.checks) if (!CHECK_LIBRARY.some((x) => x.id === c)) throw new HubError('VALIDATION', 'One of the chosen checks does not exist.');
  return hub.commit(() => {
    const defaults = Object.fromEntries(input.checks.flatMap((c) => Object.entries(CHECK_LIBRARY.find((x) => x.id === c)!.params).map(([k, v]) => [k, v.value])));
    const g: BusinessGoal = { id: hub.nid('g'), title: input.title.trim(), description: input.question.trim(), question: input.question.trim(), priority: input.priority, enabled: true, area: 'Custom', createdAt: hub.state.now, custom: true,
      sourceIds: input.sourceIds, checks: input.checks, params: { ...defaults, ...(input.params ?? {}) }, evidenceNeeded: 'Set by you.', projectExamples: [], safety: 'Uses only the sources you chose, once you approve them.' };
    hub.state.goals.push(g); return g;
  });
}
export function patchGoal(hub: HubServer, uid: string, id: string, patch: GoalPatch) {
  owner(hub, uid); const g = hub.state.goals.find((x) => x.id === id);
  if (!g) throw new HubError('NOT_FOUND', 'We could not find that goal.');
  if (patch.title !== undefined && !patch.title.trim()) throw new HubError('VALIDATION', 'Please write the goal in a few words.');
  return hub.commit(() => { Object.assign(g, patch); if (patch.question !== undefined) g.description = patch.question; return g; });
}
export function removeGoal(hub: HubServer, uid: string, id: string) {
  owner(hub, uid); const g = hub.state.goals.find((x) => x.id === id);
  if (!g) throw new HubError('NOT_FOUND', 'We could not find that goal.');
  if (!g.custom) throw new HubError('VALIDATION', 'Catalog goals cannot be removed. Turn them off instead.');
  return hub.commit(() => { hub.state.goals = hub.state.goals.filter((x) => x.id !== id); return true; });
}

/** Can this goal run right now? If not, say exactly what is missing. Never guesses. */
export function goalReadiness(hub: HubServer, g: BusinessGoal): { ready: boolean; missing: string[]; usesSample: boolean; noChecks: boolean } {
  const missing: string[] = []; let usesSample = false;
  const ids = g.sourceIds ?? [];
  if (!ids.length) missing.push('No source chosen. Pick where the AI may look.');
  for (const id of ids) {
    const s = hub.state.sources.find((x) => x.id === id);
    if (!s) { missing.push('A chosen source no longer exists.'); continue; }
    if (!s.approved) missing.push(`“${s.name}”: you have not approved this source.`);
    else if (!sourceIsUsable(s)) missing.push(`“${s.name}”: ${sourceStateText(s).toLowerCase()}. ${s.missing ?? ''}`.trim());
    else if (s.dataKind === 'SYNTHETIC') usesSample = true;
  }
  const noChecks = !(g.checks ?? []).length;
  return { ready: missing.length === 0 && !noChecks, missing, usesSample, noChecks };
}

// ------------------------------------------------------------------ the check library
interface Cand {
  key: string; title: string; kind: OwnerFinding['kind']; area: string; urgency: OwnerFinding['urgency']; fact: OwnerFinding['factLabel']; summary: string; scope: string;
  evidence: Omit<FindingEvidence, 'id' | 'observedAt'>[]; alternatives: string[]; uncertainties: string[]; action: string; validation: string; related: string[];
  project: { title: string; objective: string; deliverables: string[]; steps: { title: string; instructions: string }[] }; sig: string; bucket: InvestigationBucket; bucketWhy: string;
  impactKind?: NonNullable<OwnerFinding['impact']>['kind']; impact?: OwnerFinding['impact'];
}
type Ctx = { hub: HubServer; goal: BusinessGoal; srcs: IntelligenceSource[]; p: (k: string, d: number) => number };
const activeProjects = (hub: HubServer) => hub.state.projects.filter((p) => !p.closedAt && !p.canceledAt && p.visibility !== 'OWNER_PRIVATE');
const days = (hub: HubServer, iso: string) => Math.floor((Date.parse(hub.state.now) - Date.parse(iso)) / DAY);
const ymd = (iso: string) => iso.slice(0, 10);
const srcFor = (c: Ctx, cat: string) => c.srcs.find((s) => s.catalogId === cat) ?? c.srcs[0];
const ev = (c: Ctx, cat: string, label: string, type: FindingEvidence['sourceType'], quality: FindingEvidence['quality'] = 'MEASURED'): Omit<FindingEvidence, 'id' | 'observedAt'> => {
  const s = srcFor(c, cat);
  return { label, sourceType: type, sourceName: `${s?.name ?? 'Source'} (${s?.dataKind === 'SYNTHETIC' ? 'made-up sample' : 'copy of real data'})`, url: null, quality };
};
const NO_ESTIMATE = 'Insufficient data to estimate. No sales, cost or time numbers are connected to this finding.';

const CHECKS: Record<string, (c: Ctx) => Cand[]> = {
  'stale-steps': (c) => {
    const limit = c.p('staleDays', 7); const out: Cand[] = [];
    for (const pr of activeProjects(c.hub)) {
      if (pr.pause?.isPaused) continue;
      const rows = c.hub.state.steps.filter((s) => s.projectId === pr.id && s.status === 'IN_PROGRESS').map((s) => ({ s, ref: s.lastActivityAt ?? s.lastConfirmedAt })).filter((x) => x.ref && days(c.hub, x.ref) >= limit);
      if (!rows.length) continue;
      rows.sort((a, b) => days(c.hub, b.ref!) - days(c.hub, a.ref!));
      const worst = days(c.hub, rows[0].ref!);
      out.push({ key: `stale:${pr.key}`, title: `${pr.shortName ?? pr.key}: ${rows.length} step${rows.length === 1 ? ' has' : 's have'} had no update for ${limit}+ days`, kind: 'Open follow-up', area: 'Projects', urgency: 'NORMAL', fact: 'LIKELY_INFERENCE',
        summary: `${rows.length} step${rows.length === 1 ? ' is' : 's are'} marked In progress, but the oldest update is ${worst} days old. The work may have moved on without the tracker, or it may be stuck.`,
        scope: `${pr.key}: ${rows.map((x) => `“${x.s.title}”`).join(', ')}`,
        evidence: rows.map((x) => ev(c, 'A1', `“${x.s.title}” was last updated ${ymd(x.ref!)} (${days(c.hub, x.ref!)} days ago)`, 'PROJECT_RECORD', 'SOURCED')),
        alternatives: ['The work may be happening but nobody wrote it down.', 'The step may be waiting on someone else.', 'Computer logs do not cover every kind of work, so “no update” is not proof of no activity.'], uncertainties: ['We do not know if anyone worked on it since.'],
        action: 'Ask the person on this project for a one-line update on each step, then update the tracker.', validation: 'Each listed step shows a new update in the tracker, or is marked blocked or done with a reason.',
        related: [pr.key], project: { title: `Get ${pr.shortName ?? pr.key} moving again`, objective: 'Confirm where each stale step really stands and decide the next move.', deliverables: ['An updated status for each stale step'], steps: rows.map((x) => ({ title: `Update status: ${x.s.title}`, instructions: 'Write what is done, what is left, and what you need.' })) },
        sig: rows.map((x) => `${x.s.id}:${x.ref}`).join('|'), bucket: 'Follow up', bucketWhy: 'A person can answer this in a minute.', impactKind: 'capacity' });
    }
    return out;
  },
  'overdue-projects': (c) => {
    const out: Cand[] = [];
    for (const pr of activeProjects(c.hub)) {
      if (!pr.deadlineAt || pr.pause?.isPaused || Date.parse(pr.deadlineAt) >= Date.parse(c.hub.state.now)) continue;
      const left = c.hub.state.steps.filter((s) => s.projectId === pr.id && !isStepDone(s) && !['CANCELLED', 'NOT_APPLICABLE'].includes(s.status));
      if (!left.length) continue;
      const late = days(c.hub, pr.deadlineAt);
      out.push({ key: `overdue:${pr.key}`, title: `${pr.shortName ?? pr.key} is ${late} day${late === 1 ? '' : 's'} past its deadline`, kind: 'Open follow-up', area: 'Projects', urgency: 'URGENT', fact: 'CONFIRMED_SOURCE_FACT',
        summary: `The deadline was ${ymd(pr.deadlineAt)}. ${left.length} step${left.length === 1 ? ' is' : 's are'} still not done.`, scope: `${pr.key}: ${left.map((s) => `“${s.title}”`).join(', ')}`,
        evidence: [ev(c, 'A1', `${pr.key} deadline ${ymd(pr.deadlineAt)}; ${left.length} steps not done`, 'PROJECT_RECORD', 'SOURCED')],
        alternatives: ['The deadline may have moved on purpose and the tracker was not updated.', 'Work may have been done that is not written down.'], uncertainties: ['We cannot see whether a new date was agreed.'],
        action: 'Ask for a new date, or change the deadline in the tracker if it moved on purpose.', validation: 'The project shows a new deadline, or the remaining steps are done.', related: [pr.key],
        project: { title: `Reset the plan for ${pr.shortName ?? pr.key}`, objective: 'Agree a real finish date and the next step.', deliverables: ['A new deadline', 'An owner for each remaining step'], steps: [{ title: 'Talk through what is left', instructions: 'List each remaining step and how long it will take.' }, { title: 'Update the deadline in the tracker', instructions: 'Write the new date and the reason.' }] },
        sig: `${pr.deadlineAt}:${left.length}`, bucket: 'Urgent', bucketWhy: 'A real deadline has passed with work left.', impactKind: 'risk reduction' });
    }
    return out;
  },
  'blocked-work': (c) => {
    const min = c.p('minBlocked', 1); const out: Cand[] = [];
    for (const pr of activeProjects(c.hub)) {
      if (pr.pause?.isPaused) continue;
      const rows = c.hub.state.steps.filter((s) => s.projectId === pr.id && s.status === 'BLOCKED');
      if (rows.length < min) continue;
      out.push({ key: `blocked:${pr.key}`, title: `${pr.shortName ?? pr.key}: ${rows.length} blocked step${rows.length === 1 ? '' : 's'}`, kind: 'Blocker', area: 'Projects', urgency: 'NORMAL', fact: 'CONFIRMED_SOURCE_FACT',
        summary: `${rows.length} step${rows.length === 1 ? ' is' : 's are'} marked Blocked. Later steps may be waiting on them.`, scope: `${pr.key}: ${rows.map((x) => `“${x.title}”`).join(', ')}`,
        evidence: rows.map((x) => ev(c, 'A1', `“${x.title}” is Blocked${x.blockerReason ? `: ${x.blockerReason}` : ''}`, 'PROJECT_RECORD', 'SOURCED')),
        alternatives: ['The block may already be cleared and the tracker not updated.', 'The block may belong to an old plan that was replaced.'], uncertainties: ['The reason may be out of date.'],
        action: 'Find out what each block needs and who can clear it.', validation: 'Each blocked step is unblocked, canceled with a reason, or has a named person and date.', related: [pr.key],
        project: { title: `Unblock ${pr.shortName ?? pr.key}`, objective: 'Clear or cancel each blocked step.', deliverables: ['A decision on each blocked step'], steps: rows.map((x) => ({ title: `Resolve: ${x.title}`, instructions: x.blockerReason ?? 'Find out what is needed and who owns it.' })) },
        sig: rows.map((x) => `${x.id}:${x.blockerReason}`).join('|'), bucket: 'Follow up', bucketWhy: 'Blocked work rarely clears by itself.', impactKind: 'risk reduction' });
    }
    return out;
  },
  'no-next-step': (c) => {
    const out: Cand[] = [];
    for (const pr of activeProjects(c.hub)) {
      if (pr.pause?.isPaused) continue;
      const st = c.hub.state.steps.filter((s) => s.projectId === pr.id && !['CANCELLED', 'NOT_APPLICABLE'].includes(s.status));
      const left = st.filter((s) => !isStepDone(s));
      if (!left.length || st.some((s) => ['IN_PROGRESS', 'BLOCKED', 'WAITING'].includes(s.status))) continue;
      out.push({ key: `nonext:${pr.key}`, title: `${pr.shortName ?? pr.key} has nothing in progress`, kind: 'Open follow-up', area: 'Projects', urgency: 'NORMAL', fact: 'LIKELY_INFERENCE',
        summary: `${left.length} step${left.length === 1 ? ' is' : 's are'} left, but none is marked started. The project may be waiting for someone to pick it up.`, scope: `${pr.key}: next is “${left[0].title}”`,
        evidence: [ev(c, 'A1', `${left.length} steps left, none in progress`, 'PROJECT_RECORD', 'SOURCED')], alternatives: ['Someone may be working and not have updated the tracker.', 'It may be waiting for something outside the tracker.'], uncertainties: ['Computer logs may not cover this work.'],
        action: 'Ask who is picking up the next step, or pause the project on purpose.', validation: 'A step is marked started, or the project is paused with a reason and a date.', related: [pr.key],
        project: { title: `Start the next step of ${pr.shortName ?? pr.key}`, objective: 'Get the next step started by a named person.', deliverables: ['A person and a start date for the next step'], steps: [{ title: `Start: ${left[0].title}`, instructions: left[0].instructions || 'Begin the step and mark it started.' }] },
        sig: `${left.length}:${left[0].id}`, bucket: 'Follow up', bucketWhy: 'No step is moving.', impactKind: 'capacity' });
    }
    return out;
  },
  'paused-gate': (c) => {
    const out: Cand[] = [];
    for (const pr of c.hub.state.projects) {
      const pi = pr.pilot;
      if (!pi || pi.status !== 'TARGET_REACHED' || pr.closedAt || pr.canceledAt) continue;
      out.push({ key: `gate:${pr.key}`, title: `${pr.shortName ?? pr.key}: the test reached its target and is waiting for you`, kind: 'Open follow-up', area: 'Projects', urgency: 'NORMAL', fact: 'CONFIRMED_SOURCE_FACT',
        summary: `The limited test (${pi.metricLabel}, target ${pi.targetCount}) is complete. Nothing continues until you choose.`, scope: `${pr.key}: ${pi.scopeLabel}`,
        evidence: [ev(c, 'A1', `Test target of ${pi.targetCount} reached${pi.reachedAt ? ` on ${ymd(pi.reachedAt)}` : ''}`, 'PROJECT_RECORD', 'SOURCED')], alternatives: ['The results may not yet be checked in the source system.'], uncertainties: ['Look at the results before you decide.'],
        action: 'Open the project and choose: continue, extend the test, keep paused, or cancel.', validation: 'You made and recorded a decision on the project.', related: [pr.key],
        project: { title: `Review the ${pr.shortName ?? pr.key} test`, objective: 'Decide what happens after the test.', deliverables: ['Your decision'], steps: [{ title: 'Review the test results', instructions: 'Check each item in the test.' }] },
        sig: `${pi.status}:${pi.batchNumber}`, bucket: 'Needs decision', bucketWhy: 'Work cannot continue without your choice.', impactKind: 'risk reduction' });
    }
    return out;
  },
  'activity-vs-tracker': (c) => {
    const out: Cand[] = [];
    for (const s of c.hub.state.steps) {
      if (s.status !== 'NOT_STARTED' || !s.newActivityAt) continue;
      const pr = c.hub.state.projects.find((p) => p.id === s.projectId); if (!pr || pr.closedAt || pr.pause?.isPaused) continue;
      out.push({ key: `activity:${s.id}`, title: `Activity matches “${s.title}”, but the tracker says not started`, kind: 'Data quality gap', area: 'Projects', urgency: 'NORMAL', fact: 'LIKELY_INFERENCE',
        summary: 'Computer activity looks related to this step, but the step has no start in the tracker.', scope: `${pr.key}: “${s.title}”`,
        evidence: [ev(c, 'A2', `Related computer activity seen ${ymd(s.newActivityAt)}`, 'MT_LOG'), ev(c, 'A1', 'Step status is Not started', 'PROJECT_RECORD', 'SOURCED')],
        alternatives: ['The activity may belong to a different step or project.', 'Logs can be late or incomplete, and activity is not progress.'], uncertainties: ['We cannot tell who did it or why.'],
        action: 'Ask the person on the project to confirm where this step stands.', validation: 'The step shows the real status, confirmed by the person on the project.', related: [pr.key],
        project: { title: `Confirm status: ${s.title}`, objective: 'Make the tracker match what is really happening.', deliverables: ['A confirmed status'], steps: [{ title: 'Confirm the step status', instructions: 'Say if it is started, done or waiting.' }] },
        sig: `${s.id}:${s.newActivityAt}`, bucket: 'Follow up', bucketWhy: 'The tracker and the evidence disagree.', impactKind: 'risk reduction' });
    }
    return out;
  },
  'printer-warnings': (c) => {
    const min = c.p('minEpisodes', 3); const per = new Map<string, Map<string, number>>(); const open = new Map<string, string>(); const dates = new Map<string, string[]>();
    for (const e of [...c.hub.state.printerProblems].sort((a, b) => a.at.localeCompare(b.at))) {
      const k = `${e.printer}|${e.kind}`;
      if (e.state === 'problem' && open.get(k) !== 'problem') { const m = per.get(e.printer) ?? new Map(); m.set(e.kind, (m.get(e.kind) ?? 0) + 1); per.set(e.printer, m); dates.set(e.printer, [...(dates.get(e.printer) ?? []), ymd(e.at)]); }
      open.set(k, e.state);
    }
    const out: Cand[] = [];
    for (const [printer, m] of per) {
      const total = [...m.values()].reduce((a, b) => a + b, 0); if (total < min) continue;
      const parts = [...m.entries()].map(([k, n]) => `${n} ${({ TONER: 'ink or toner', JAM: 'jam', PAUSED: 'pause or paper', OFFLINE: 'offline' } as Record<string, string>)[k] ?? k.toLowerCase()}`).join(', ');
      const span = [...new Set(dates.get(printer))].sort();
      out.push({ key: `printer:${printer}`, title: `“${printer}” had ${total} separate problems`, kind: 'Incident', area: 'Production', urgency: 'NORMAL', fact: 'CONFIRMED_SOURCE_FACT',
        summary: `Separate problems on “${printer}”: ${parts}. A problem that cleared and came back within 10 minutes may be counted twice in the raw records, so treat the count as a guide.`, scope: `Printer “${printer}”, ${span[0]}${span.length > 1 ? ` to ${span[span.length - 1]}` : ''}`,
        evidence: [ev(c, 'A4', `${total} separate problems: ${parts}`, 'PRINT_LOG')], alternatives: ['Supplies may simply be low. That is easy to fix.', 'One busy job type may cause the problems.', 'We do not know how many minutes of printing were lost.'], uncertainties: ['No cost or time lost is recorded.'],
        action: 'Check supplies and the printer itself. Write a short troubleshooting checklist for this printer.', validation: 'Fewer separate problems on this printer over the next two weeks.', related: [],
        project: { title: `Fix repeated problems on “${printer}”`, objective: 'Find out why this printer stops and fix the common cause.', deliverables: ['A troubleshooting checklist', 'A supplies reorder level'], steps: [{ title: 'Check supplies and the paper path', instructions: 'Look at ink or toner, paper and rollers.' }, { title: 'Write a short checklist', instructions: 'Put the common fixes on one page near the printer.' }] },
        sig: `${printer}:${total}`, bucket: 'Worth testing', bucketWhy: 'A small, cheap fix may remove repeated stops.', impactKind: 'capacity' });
    }
    return out;
  },
  'unapproved-finals': (c) => {
    const rows = c.hub.state.resources.filter((r) => r.visibility !== 'OWNER_PRIVATE' && (r.pendingApproval || r.suggestedVersion || (r.approvedVersion && !c.hub.approvalIsRecorded(r))));
    if (!rows.length) return [];
    return [{ key: 'files-unapproved', title: `${rows.length} file${rows.length === 1 ? ' has' : 's have'} a newer version or an unrecorded choice`, kind: 'Documentation gap', area: 'Files', urgency: 'NORMAL', fact: 'CONFIRMED_SOURCE_FACT',
      summary: 'These files have a newer version, a request waiting, or a version marked without a record of who chose it. People may be using different versions.', scope: rows.map((r) => `“${r.label}”`).join(', '),
      evidence: rows.map((r) => ev(c, 'A3', `“${r.label}”: ${r.pendingApproval ? 'request waiting' : r.suggestedVersion ? `newer version ${r.suggestedVersion.version} suggested` : 'chosen version has no record'}`, 'SHEET', 'SOURCED')),
      alternatives: ['The newest version may be the right one. A file name does not prove approval.'], uncertainties: ['We cannot see which version each person used.'],
      action: 'Ask the people on the project which version is right, and have them choose it in the app.', validation: 'Each listed file shows a chosen version with who chose it and when.', related: [],
      project: { title: 'Settle which file version is right', objective: 'One clear, recorded version for each file people use.', deliverables: ['A chosen version for each file'], steps: rows.map((r) => ({ title: `Choose the version of “${r.label}”`, instructions: 'Open the file list on the step and choose the version to work from.' })) },
      sig: rows.map((r) => `${r.id}:${r.version}:${r.suggestedVersion?.version}`).join('|'), bucket: 'Follow up', bucketWhy: 'Different versions cause rework.', impactKind: 'risk reduction' }];
  },
  'repeat-corrections': (c) => {
    const min = c.p('minCount', 3); const by = new Map<string, number>();
    for (const d of c.hub.state.reviewDecisions) { if (!d.correction && !d.correctionText) continue; const card = c.hub.state.reviewCards.find((x) => x.id === d.cardId); const k = card?.cardType ?? 'review'; by.set(k, (by.get(k) ?? 0) + 1); }
    return [...by.entries()].filter(([, n]) => n >= min).map(([k, n]) => ({ key: `corr:${k}`, title: `The same kind of correction was made ${n} times`, kind: 'Employee learning/support' as const, area: 'Operations', urgency: 'NORMAL' as const, fact: 'HYPOTHESIS' as const,
      summary: `People corrected the same type of review (${k.toLowerCase().replace(/_/g, ' ')}) ${n} times. The wording may be unclear. This is about the wording, not about people.`, scope: `Review type: ${k}`,
      evidence: [ev(c, 'A5', `${n} corrections on ${k} cards`, 'PROJECT_RECORD')], alternatives: ['The matching rule may need a fix instead of the wording.', 'A small number of corrections can be chance.'], uncertainties: [`Only ${n} corrections so far.`],
      action: 'Read the questions on these cards and reword the unclear one.', validation: 'Fewer corrections on this review type over the next two weeks.', related: [],
      project: { title: 'Reword an unclear review question', objective: 'Make the question clear so it is answered correctly the first time.', deliverables: ['New wording', 'A check of corrections afterward'], steps: [{ title: 'Read the corrected cards', instructions: 'Find what people misunderstood.' }, { title: 'Write clearer wording', instructions: 'Use plain words and one question at a time.' }] },
      sig: `${k}:${n}`, bucket: 'Worth testing' as const, bucketWhy: 'A wording change is cheap to try.', impactKind: 'capacity' as const }));
  },
  'sales-trend': (c) => {
    const all = c.hub.state.salesDaily ?? [];
    // The last day in a snapshot is usually only part of a day, so it is left out. Only full days are compared.
    const full = all.slice(0, -1);
    const weeks = c.p('baselineWeeks', 12); const minDrop = c.p('minDropPct', 15);
    if (full.length < 7 * 4) return [];
    const sum = (rows: typeof full) => rows.reduce((a, r) => ({ amount: a.amount + r.amount, orders: a.orders + r.orders, units: a.units + r.units }), { amount: 0, orders: 0, units: 0 });
    const last = full.slice(-7); const prior: ReturnType<typeof sum>[] = [];
    for (let i = 1; i <= weeks; i++) { const w = full.slice(full.length - 7 * (i + 1), full.length - 7 * i); if (w.length === 7) prior.push(sum(w)); }
    if (prior.length < 3) return [];
    const L = sum(last); const base = { amount: prior.reduce((a, r) => a + r.amount, 0) / prior.length, orders: prior.reduce((a, r) => a + r.orders, 0) / prior.length };
    const dropPct = (1 - L.amount / base.amount) * 100;
    if (dropPct < minDrop) return [];
    const gap = base.amount - L.amount; const aovNow = L.amount / Math.max(1, L.orders); const aovBase = base.amount / Math.max(1, base.orders);
    const money = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;
    const from = last[0].d; const to = last[6].d;
    return [{ key: 'sales-trend:7d', title: `Sales for the last 7 days are ${Math.round(dropPct)}% below the recent average`, kind: 'Revenue opportunity', area: 'Sales', urgency: 'NORMAL', fact: 'CONFIRMED_SOURCE_FACT',
      summary: `Store sales from ${from} to ${to} were ${money(L.amount)} from ${L.orders} orders. The average of the ${prior.length} weeks before was ${money(base.amount)} from about ${Math.round(base.orders)} orders. Orders fell more (${Math.round((1 - L.orders / base.orders) * 100)}%) than dollars, so the average order is larger (${money(aovNow)} now, ${money(aovBase)} before). This file has store totals only, so it cannot say which products or why.`,
      scope: `Store totals, ${from} to ${to}. No product, traffic or conversion data.`,
      evidence: [ev(c, 'B2', `${from} to ${to}: ${money(L.amount)}, ${L.orders} orders, ${L.units} units`, 'SHEET'), ev(c, 'B2', `Average of the ${prior.length} weeks before: ${money(base.amount)}, about ${Math.round(base.orders)} orders`, 'SHEET')],
      alternatives: ['Seasonal swing. There is no last-year data here to compare, so a normal fall dip cannot be ruled out.', 'Fewer visitors, a stock problem, a price change, an ad change or a listing change. None of these are in this file.', 'A one-off slow week. Look at the next 7 days before acting.', 'Late orders or days still being counted.'],
      uncertainties: ['This is dollars of sales, not profit. No costs are connected.', 'The file does not say which sales channel it covers.'],
      action: 'Look at the same 7 days by product, traffic and stock in the sales report before changing anything. Check whether any listing, price or ad changed in the last two weeks.', validation: 'The next 7 days are compared with this one, and a cause is found in the product-level report.', related: [],
      project: { title: 'Find out why sales slowed', objective: 'Explain the drop using product, traffic, stock and change history.', deliverables: ['A one-page cause list', 'A decision on what to test'], steps: [{ title: 'Compare the last 14 days by product', instructions: 'Use the sales report by product. Note which products fell most.' }, { title: 'List what changed in the last two weeks', instructions: 'Listings, prices, ads, stock, photos.' }, { title: 'Pick one thing to test', instructions: 'Choose the likeliest cause and write how you will check it.' }] },
      sig: `${to}:${Math.round(L.amount)}`, bucket: 'Needs decision', bucketWhy: 'A large change in sales is worth a look soon, but the cause is not known.', impactKind: 'revenue',
      impact: { kind: 'revenue', text: `Revenue only, not profit. This week is ${money(gap)} below the recent weekly average.`, math: `Gap = average of ${prior.length} prior weeks (${money(base.amount)}) minus the last 7 days (${money(L.amount)}) = ${money(gap)} per week`,
        scenarios: [{ label: 'Back to normal next week', value: `${money(0)} more lost` }, { label: 'Stays this low for 4 more weeks', value: `about ${money(gap * 4)} less revenue` }, { label: 'Stays this low until Dec 31 (11 weeks)', value: `about ${money(gap * 11)} less revenue` }] } }];
  },
  'unverified-outcomes': (c) => {
    const out: Cand[] = [];
    for (const s of c.srcs) {
      const rows = (s.sampleRows ?? []).filter((r) => !r.verified);
      if (!rows.length) continue;
      out.push({ key: `unverified:${s.id}`, title: `${rows.length} ${s.catalogId === 'B1' ? 'Amazon ' : ''}change${rows.length === 1 ? '' : 's'} ${rows.length === 1 ? 'has' : 'have'} no checked result`, kind: 'Open follow-up', area: s.catalogId === 'B1' ? 'Amazon' : 'Operations', urgency: 'NORMAL', fact: 'LIKELY_INFERENCE',
        summary: 'An upload or change was recorded, but nobody has read the final result. An attempt is not proof that the live listing is right.', scope: rows.map((r) => r.label).join(', '),
        evidence: rows.map((r) => ev(c, s.catalogId ?? 'B1', `${r.label}: ${r.detail} (${ymd(r.at)}). Final result not checked.`, 'SHEET')),
        alternatives: ['It may have worked and just not been checked.', 'A later upload may have replaced it.'], uncertainties: ['No report of the final state has been seen.'],
        action: 'Read the final state of each item and write it down. Do not call it finished until you have.', validation: 'The final state of each item is read from the source and logged.', related: [],
        project: { title: 'Check the result of recent changes', objective: 'Confirm each change really ended up correct.', deliverables: ['A written result for each change', 'A reusable checklist'], steps: rows.map((r) => ({ title: `Check: ${r.label}`, instructions: 'Open the final state and compare it with what was intended.' })) },
        sig: rows.map((r) => r.id).join('|'), bucket: 'Follow up', bucketWhy: 'An unchecked change may be wrong.', impactKind: 'risk reduction' });
    }
    return out;
  },
};
export const RUNNABLE_CHECKS = Object.keys(CHECKS);

// ------------------------------------------------------------------ the runner
function overlapFor(hub: HubServer, cand: Cand): { text: string[]; match: OwnerFinding['projectMatch']; pausedNote: string | null } {
  const text: string[] = []; let pausedNote: string | null = null; let match: OwnerFinding['projectMatch'] = { type: 'NONE' };
  for (const k of cand.related) {
    const p = hub.state.projects.find((x) => x.key === k); if (!p) continue;
    const st = p.closedAt ? 'completed' : p.canceledAt ? 'canceled' : p.pause?.isPaused ? 'paused' : 'active';
    text.push(`${p.key} ${p.shortName ?? p.title} (${st})`);
    if (!p.closedAt) match = { type: 'ALREADY_COVERED', projectKey: p.key };
    if (st === 'paused') pausedNote = `${p.key} is paused. This will not restart it. Only you can resume it.`;
  }
  if (!text.length) { for (const f of hub.state.ownerFindings) if (f.area === cand.area && f.status !== 'DISMISSED' && f.dedupeKey !== cand.key && f.title.toLowerCase().includes(cand.title.slice(0, 18).toLowerCase())) text.push(`Earlier recommendation ${f.code}`); match = { type: 'CANDIDATE_NEW' }; }
  return { text, match, pausedNote };
}
function planFrom(c: Cand, kind: string): ProposedPlan {
  const steps: PlanStepDraft[] = c.project.steps.map((s) => ({ title: s.title, instructions: s.instructions, whyForGoal: c.project.objective, deliverable: 'A short written result', tools: [], evidenceDescription: 'The result is written in the step notes.' }));
  return { title: c.project.title, employeeObjective: c.project.objective, deliverables: c.project.deliverables, steps, suggestedAssignees: [], risks: [`Nothing is changed in any live system by this plan. ${kind === 'sample' ? 'This is a sample from made-up data.' : ''}`.trim()] };
}
function scoreOf(c: Cand, goal: BusinessGoal, overlapCount: number, sample: boolean): NonNullable<OwnerFinding['score']> {
  return { urgency: c.urgency === 'URGENT' ? 3 : c.urgency === 'NORMAL' ? 2 : 1, value: c.impactKind === 'risk reduction' ? 2 : 1, evidence: c.fact === 'CONFIRMED_SOURCE_FACT' ? 3 : c.fact === 'LIKELY_INFERENCE' ? 2 : 1, feasibility: 2, risk: sample ? 0 : 1, ownerPriority: goal.priority === 'HIGH' ? 3 : goal.priority === 'NORMAL' ? 2 : 1, overlap: overlapCount ? 1 : 0 };
}
export function rankScore(f: OwnerFinding): number { const s = f.score; return s ? s.urgency * 3 + s.evidence * 2 + s.ownerPriority + s.value + s.feasibility - s.overlap : 0; }

export function runInvestigations(hub: HubServer, uid: string) {
  owner(hub, uid);
  const st = hub.state; const out = { created: [] as string[], updated: [] as string[], reopened: [] as string[], blocked: [] as { goalId: string; title: string; missing: string[] }[], briefOnly: [] as string[], ran: [] as string[] };
  hub.commit(() => {
    const goals = st.goals.filter((g) => g.enabled && (g.checks !== undefined || g.sourceIds !== undefined)).sort((a, b) => (a.priority === b.priority ? 0 : a.priority === 'HIGH' ? -1 : b.priority === 'HIGH' ? 1 : a.priority === 'NORMAL' ? -1 : 1));
    for (const g of goals) {
      g.lastRunAt = st.now;
      const rd = goalReadiness(hub, g);
      if (rd.noChecks && !rd.missing.length) { g.lastRunNote = 'Saved as a brief. No automatic check is attached yet, so nothing was investigated. Pick a check, or ask for a custom analysis.'; out.briefOnly.push(g.id); continue; }
      if (!rd.ready) { g.lastRunNote = `Could not investigate. ${rd.missing.join(' ')}`; out.blocked.push({ goalId: g.id, title: g.title, missing: rd.missing }); continue; }
      const srcs = (g.sourceIds ?? []).map((id) => st.sources.find((s) => s.id === id)!).filter(Boolean);
      const ctx: Ctx = { hub, goal: g, srcs, p: (k, d) => g.params?.[k] ?? d };
      let found = 0;
      for (const cid of g.checks ?? []) {
        const fn = CHECKS[cid]; if (!fn) continue;
        const def = CHECK_LIBRARY.find((x) => x.id === cid);
        // A check reads only the sources it names. If the goal does not include them, say so and skip.
        const need = def?.sourceCatalogIds ?? [];
        const lacking = need.filter((cat) => !srcs.some((s) => s.catalogId === cat || (s.custom && cat === 'B1')));
        if (lacking.length && !srcs.some((s) => s.sampleRows?.length)) { out.blocked.push({ goalId: g.id, title: g.title, missing: [`The check “${def?.name}” also needs source ${lacking.join(', ')}. Add it to this goal.`] }); continue; }
        for (const cand of fn(ctx)) { found++; upsert(hub, g, cand, srcs, out); }
      }
      g.lastRunNote = found ? `Checked ${srcs.map((s) => s.name).join(', ')}. ${found} thing${found === 1 ? '' : 's'} found.` : `Checked ${srcs.map((s) => s.name).join(', ')}. Nothing to report.`;
      out.ran.push(g.id);
    }
    st.scanCount += 1; st.lastScanAt = st.now;
    st.aiRuns.push({ id: hub.nid('airun'), startedAt: st.now, endedAt: st.now, cause: 'investigation run (rule-based checks, no AI model call)', model: 'rule-based checks', inputTokens: 0, outputTokens: 0, costUsd: 0, outcome: 'OK', promptVersion: 'investigation-v1', sourceWatermark: null, errors: [] });
  });
  return out;
}

function upsert(hub: HubServer, g: BusinessGoal, cand: Cand, srcs: IntelligenceSource[], out: { created: string[]; updated: string[]; reopened: string[] }) {
  const st = hub.state; const now = st.now;
  // Dalia said “don’t send me this kind”. Nothing is created or reopened until she turns that rule off.
  if (isMuted(hub, cand.key.split(':')[0], g.id)) return;
  const existing = st.ownerFindings.find((f) => f.dedupeKey === cand.key);
  if (existing) {
    const closed = ['DISMISSED', 'ARCHIVED', 'SNOOZED', 'INFORMATIONAL'].includes(existing.status);
    if (closed && existing.evidenceSig === cand.sig) return; // respect the owner’s decision unless there is new evidence
    if (closed) { existing.status = 'NEW'; existing.snoozedUntil = undefined; existing.occurrences.push({ at: now, note: 'New evidence appeared, so this is back in your list.' }); existing.evidenceSig = cand.sig; existing.seenByOwner = false; out.reopened.push(existing.code); return; }
    if (existing.evidenceSig !== cand.sig || !existing.occurrences.some((o) => o.at === now)) { existing.occurrences.push({ at: now, note: existing.evidenceSig === cand.sig ? 'Seen again. Nothing new.' : 'The evidence changed.' }); existing.evidenceSig = cand.sig; existing.lastEvidenceAt = now; existing.analyzedAt = now; out.updated.push(existing.code); }
    return;
  }
  const ov = overlapFor(hub, cand);
  const sample = srcs.some((s) => s.dataKind === 'SYNTHETIC');
  let n = st.ownerFindings.length + 1; while (st.ownerFindings.some((f) => f.code === `AF-${String(n).padStart(3, '0')}`)) n++;
  const code = `AF-${String(n).padStart(3, '0')}`;
  const f: OwnerFinding = {
    id: hub.nid('af'), code, kind: cand.kind, area: cand.area, title: cand.title, summary: cand.summary + (ov.pausedNote ? ` ${ov.pausedNote}` : ''), urgency: cand.urgency, factLabel: cand.fact,
    discoveredAt: now, lastEvidenceAt: now, analyzedAt: now, evidence: cand.evidence.map((e, i) => ({ ...e, id: `e${i + 1}`, observedAt: now })), occurrences: [{ at: now, note: 'First seen.' }], status: 'NEW', projectMatch: ov.match,
    linkedProjectId: null, approvedProjectId: null, modelId: null, plan: ov.match.type === 'ALREADY_COVERED' ? null : planFrom(cand, sample ? 'sample' : 'real'), dedupeKey: cand.key, decisions: [], recommendedAction: cand.action,
    uncertainties: cand.uncertainties, ownerNotes: '', seenByOwner: false, goalIds: [g.id], goalId: g.id,
    sourcesUsed: srcs.map((s) => ({ sourceId: s.id, name: s.name, coverage: s.coverage ?? '', dataKind: s.dataKind ?? 'NONE' })), isSample: sample, bucket: cand.bucket, bucketWhy: cand.bucketWhy,
    scope: cand.scope, alternatives: cand.alternatives, validation: cand.validation, overlap: ov.text,
    employeeBrief: `Goal: ${cand.project.objective} Steps: ${cand.project.steps.map((s, i) => `${i + 1}. ${s.title}`).join(' ')}`,
    impact: cand.impact ?? { kind: 'unknown', text: NO_ESTIMATE, math: null, scenarios: null }, score: scoreOf(cand, g, ov.text.length, sample), evidenceSig: cand.sig,
  };
  st.ownerFindings.push(f); out.created.push(f.code);
  if (f.urgency === 'URGENT') hub.notify({ recipientUid: st.users.find((u) => u.role === 'OWNER')!.id, senderUid: null, type: 'AI_FINDING', title: `Urgent: ${f.title}`, preview: f.summary, projectId: null, sourceEntityId: f.id, deepLink: `/owner/ai/${f.id}`, key: `n:finding:${f.dedupeKey}` });
}

export function setFindingBucket(hub: HubServer, uid: string, id: string, bucket: InvestigationBucket) {
  owner(hub, uid); const f = hub.state.ownerFindings.find((x) => x.id === id || x.code === id);
  if (!f) throw new HubError('NOT_FOUND', 'We could not find that recommendation.');
  return hub.commit(() => { f.bucket = bucket; f.bucketWhy = 'You chose this group.'; return f; });
}

/** A plain-English brief for a goal that has no automatic check yet. Copy it to ask for a custom analysis. */
export function goalBrief(hub: HubServer, uid: string, id: string): string {
  owner(hub, uid); const g = hub.state.goals.find((x) => x.id === id);
  if (!g) throw new HubError('NOT_FOUND', 'We could not find that goal.');
  const srcs = (g.sourceIds ?? []).map((sid) => hub.state.sources.find((s) => s.id === sid)).filter(Boolean) as IntelligenceSource[];
  return [`Investigation brief: ${g.title}`, `Question: ${g.question ?? g.description}`, `Importance: ${g.priority.toLowerCase()}`,
    `Allowed sources: ${srcs.map((s) => `${s.name} (${sourceStateText(s)})`).join('; ') || 'none chosen'}`, `Evidence needed: ${g.evidenceNeeded ?? 'not set'}`,
    'Rules: use only approved sources. Say what is missing. Do not guess numbers. Cite the data used. Propose a project but do not create one.'].join('\n');
}
export const sourceCatalogName = (cat: string) => SOURCE_CATALOG.find((s) => s.id === cat)?.name ?? cat;
export type { Project, Step };
