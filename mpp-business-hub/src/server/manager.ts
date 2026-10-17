import type { HubServer } from './hub';
import type { FindingEvidence, ModelVar, OpportunityModel, OwnerFinding, PlanStepDraft, Project } from '../domain/types';
import { addMinutes, chicagoDate, chicagoToUtc, formatLocalDate, isValidLocalDate } from '../domain/time';
import { compute, confidenceOf, classifyWebSource, findOwnerOnlyTerms, type Scenario } from './finance';
import { provisionWorkspace } from './drive';
import { HubError, PermissionDenied } from './errors';

// Everything here is OWNER-ONLY and reads the owner-only collections. Employees get a separate, sanitized copy
// (the project, steps and brief created on approval) that never contains these records.

function owner(hub: HubServer, uid: string) { return hub.requireOwner(uid); }
function find(hub: HubServer, id: string): OwnerFinding {
  const f = hub.state.ownerFindings.find((x) => x.id === id || x.code === id);
  if (!f) throw new HubError('NOT_FOUND', 'We could not find that recommendation.');
  return f;
}
function decide(hub: HubServer, uid: string, f: OwnerFinding, decision: string, rationale?: string, changed?: string[]) {
  f.decisions.push({ id: hub.nid('dcn'), at: hub.state.now, decision, actorUid: uid, rationale, changedFields: changed });
  hub.audit({ entityType: 'finding', entityId: f.code, action: `OWNER_${decision}`, before: null, after: { status: f.status }, actorUid: uid, actorLabel: hub.userName(uid), reason: rationale ?? decision, evidenceRefs: f.evidence.map((e) => e.id), projectId: null });
}

export const KIND_URGENCY_ORDER: Record<string, number> = { URGENT: 0, NORMAL: 1, STRATEGIC: 2 };

export function listFindings(hub: HubServer, uid: string, f: { q?: string; view?: 'decision' | 'investigating' | 'approved' | 'snoozed' | 'done' | 'all'; urgency?: string; area?: string; kind?: string } = {}) {
  owner(hub, uid);
  const needle = f.q?.trim().toLowerCase();
  const view = f.view ?? 'decision';
  return hub.state.ownerFindings.filter((x) => {
    if (view === 'decision' && !['NEW', 'INVESTIGATING'].includes(x.status)) return false;
    if (view === 'investigating' && x.status !== 'INVESTIGATING') return false;
    if (view === 'approved' && !['APPROVED', 'LINKED'].includes(x.status)) return false;
    if (view === 'snoozed' && x.status !== 'SNOOZED') return false;
    if (view === 'done' && !['DISMISSED', 'ARCHIVED', 'INFORMATIONAL'].includes(x.status)) return false;
    if (f.urgency && x.urgency !== f.urgency) return false;
    if (f.area && x.area !== f.area) return false;
    if (f.kind && x.kind !== f.kind) return false;
    if (needle && !`${x.code} ${x.title} ${x.summary} ${x.area} ${x.kind} ${x.evidence.map((e) => `${e.label} ${e.sourceName}`).join(' ')}`.toLowerCase().includes(needle)) return false;
    return true;
  }).sort((a, b) => KIND_URGENCY_ORDER[a.urgency] - KIND_URGENCY_ORDER[b.urgency] || b.lastEvidenceAt.localeCompare(a.lastEvidenceAt) || a.code.localeCompare(b.code));
}

export function inboxSummary(hub: HubServer, uid: string) {
  owner(hub, uid);
  const st = hub.state; const all = st.ownerFindings;
  const open = all.filter((x) => ['NEW', 'INVESTIGATING'].includes(x.status));
  const unassigned = st.projects.filter((p) => p.origin === 'AI_RECOMMENDATION' && !p.memberUids.length && !p.closedAt && !p.canceledAt);
  return {
    newSinceLastLook: all.filter((x) => x.discoveredAt > st.lastFindingsLookAt || x.occurrences.some((o) => o.at > st.lastFindingsLookAt)).length,
    urgent: open.filter((x) => x.urgency === 'URGENT').length,
    needsDecision: open.length,
    investigating: all.filter((x) => x.status === 'INVESTIGATING').length,
    approvedUnassigned: unassigned.length,
    unassignedProjects: unassigned.map((p) => ({ id: p.id, key: p.key, title: p.title })),
    followUps: all.filter((x) => (x.followUpAt && x.followUpAt <= st.now) || (x.status === 'SNOOZED' && x.snoozedUntil && x.snoozedUntil <= st.now)).length,
    observedBenefits: st.outcomes.length,
    freshness: { lastScanAt: st.lastScanAt, scans: st.scanCount, coverageNote: 'Computer activity arrives about every hour. This list can be a little behind.' },
  };
}

export function markFindingsSeen(hub: HubServer, uid: string) {
  owner(hub, uid);
  return hub.commit(() => { hub.state.lastFindingsLookAt = hub.state.now; for (const f of hub.state.ownerFindings) f.seenByOwner = true; });
}

export function getFinding(hub: HubServer, uid: string, id: string): OwnerFinding { owner(hub, uid); return find(hub, id); }

export function findingModel(hub: HubServer, uid: string, findingId: string) {
  owner(hub, uid);
  const f = find(hub, findingId);
  const model = f.modelId ? hub.state.ownerModels.find((m) => m.id === f.modelId) ?? null : null;
  if (!model) return null;
  const scenarios = (['low', 'base', 'high'] as Scenario[]).map((s) => compute(model, s));
  return { model, scenarios, confidence: confidenceOf(model) };
}

/** The owner edits a number and everything is recomputed from the stored inputs. */
export function updateModelVar(hub: HubServer, uid: string, modelId: string, key: string, patch: { low?: number | null; base?: number | null; high?: number | null; quality?: ModelVar['quality']; source?: string }) {
  owner(hub, uid);
  const m = hub.state.ownerModels.find((x) => x.id === modelId);
  if (!m) throw new HubError('NOT_FOUND', 'We could not find that calculation.');
  for (const k of ['low', 'base', 'high'] as const) { const x = patch[k]; if (x !== undefined && x !== null && (!Number.isFinite(x) || x < 0)) throw new HubError('VALIDATION', 'Numbers must be zero or more.'); }
  let variable = m.variables.find((x) => x.key === key);
  return hub.commit(() => {
    if (!variable) { variable = { key, label: key, unit: '', low: null, base: null, high: null, quality: 'ASSUMPTION', source: 'Added by the owner' }; m.variables.push(variable); }
    const before = { ...variable };
    Object.assign(variable, Object.fromEntries(Object.entries(patch).filter(([, x]) => x !== undefined)));
    variable.retrievedAt = hub.state.now;
    m.version += 1; m.history.push({ version: m.version, at: hub.state.now, changed: `${variable.label}: ${JSON.stringify(patch)}` });
    hub.audit({ entityType: 'opportunityModel', entityId: m.id, action: 'ASSUMPTION_EDITED', before, after: { ...variable }, actorUid: uid, actorLabel: hub.userName(uid), reason: 'Owner changed a number', evidenceRefs: [], projectId: null });
    return m;
  });
}

// ---------------------------------------------------------------- owner actions
export function snoozeFinding(hub: HubServer, uid: string, id: string, untilYmd: string) {
  owner(hub, uid); const f = find(hub, id);
  if (!isValidLocalDate(untilYmd) || untilYmd <= chicagoDate(hub.state.now)) throw new HubError('INVALID_DATE', 'Please pick a date after today.');
  return hub.commit(() => { f.status = 'SNOOZED'; f.snoozedUntil = chicagoToUtc(untilYmd, '06:00'); decide(hub, uid, f, 'SNOOZED', `Until ${untilYmd}`); return f; });
}
export function dismissFinding(hub: HubServer, uid: string, id: string, reason?: string) {
  owner(hub, uid); const f = find(hub, id);
  return hub.commit(() => { f.status = 'DISMISSED'; decide(hub, uid, f, 'DISMISSED', reason); return f; }); // evidence stays; this also helps avoid repeats
}
export function archiveFinding(hub: HubServer, uid: string, id: string) { owner(hub, uid); const f = find(hub, id); return hub.commit(() => { f.status = 'ARCHIVED'; decide(hub, uid, f, 'ARCHIVED'); return f; }); }
export function markInformational(hub: HubServer, uid: string, id: string) { owner(hub, uid); const f = find(hub, id); return hub.commit(() => { f.status = 'INFORMATIONAL'; decide(hub, uid, f, 'INFORMATIONAL'); return f; }); }
export function reopenFinding(hub: HubServer, uid: string, id: string) { owner(hub, uid); const f = find(hub, id); return hub.commit(() => { f.status = 'NEW'; f.snoozedUntil = undefined; decide(hub, uid, f, 'REOPENED'); return f; }); }
export function setFollowUp(hub: HubServer, uid: string, id: string, ymd: string | null) {
  owner(hub, uid); const f = find(hub, id);
  if (ymd && !isValidLocalDate(ymd)) throw new HubError('INVALID_DATE', 'Please pick a real date.');
  return hub.commit(() => { f.followUpAt = ymd ? chicagoToUtc(ymd, '06:00') : undefined; decide(hub, uid, f, 'FOLLOW_UP_SET', ymd ?? 'cleared'); return f; });
}
export function linkFinding(hub: HubServer, uid: string, id: string, projectId: string) {
  owner(hub, uid); const f = find(hub, id); const p = hub.projectFor(uid, projectId);
  return hub.commit(() => { f.status = 'LINKED'; f.linkedProjectId = p.id; f.projectMatch = { type: 'ALREADY_COVERED', projectKey: p.key }; decide(hub, uid, f, 'LINKED', `Linked to ${p.key}`); return f; });
}
/** Read-only research only (simulated). It adds a clearly labeled note and moves the item to “Looking into it”. */
export function investigateMore(hub: HubServer, uid: string, id: string) {
  owner(hub, uid); const f = find(hub, id);
  return hub.commit(() => {
    f.status = 'INVESTIGATING';
    f.occurrences.push({ at: hub.state.now, note: 'You asked for a closer look. A read-only check was queued (simulated). Nothing was changed anywhere.' });
    decide(hub, uid, f, 'INVESTIGATE_MORE');
    hub.state.aiRuns.push({ id: hub.nid('airun'), startedAt: hub.state.now, endedAt: hub.state.now, cause: `deeper look at ${f.code} (simulated)`, model: 'replay-adapter (no API)', inputTokens: 0, outputTokens: 0, costUsd: 0, outcome: 'OK', promptVersion: 'replay', sourceWatermark: null, errors: [] });
    return f;
  });
}

// ---------------------------------------------------------------- simulated scan (adds findings, dedupes repeats)
interface ScanItem { dedupeKey: string; make: (hub: HubServer) => Omit<OwnerFinding, 'id' | 'code' | 'discoveredAt' | 'lastEvidenceAt' | 'analyzedAt' | 'occurrences' | 'status' | 'decisions' | 'linkedProjectId' | 'approvedProjectId' | 'seenByOwner' | 'goalIds' | 'ownerNotes'>; evidenceNote: string }
const evd = (id: string, e: Omit<FindingEvidence, 'id'>): FindingEvidence => ({ id, ...e });

const SCAN_POOL: ScanItem[] = [
  {
    dedupeKey: 'prn-b-offline', evidenceNote: 'Printer “PRN-B” reported offline again.',
    make: (hub) => ({
      kind: 'Incident', area: 'Production', title: 'Printer “PRN-B” has been offline for 25 minutes', urgency: 'URGENT', factLabel: 'CONFIRMED_SOURCE_FACT',
      summary: 'The printer has not answered for 25 minutes during a shift. Orders waiting on it may be late. Please check the printer.',
      projectMatch: { type: 'NONE' }, modelId: null, plan: null, dedupeKey: 'prn-b-offline', recommendedAction: 'Check the printer now and tell the print team.', uncertainties: ['We do not know if someone is already fixing it.'], followUpAt: undefined, snoozedUntil: undefined,
      evidence: [evd('e1', { label: 'No reply from “PRN-B” since 2:35 PM', sourceType: 'PRINT_LOG', sourceName: 'Print log (made-up sample)', url: null, observedAt: hub.state.now, quality: 'MEASURED' })],
    }),
  },
  {
    dedupeKey: 'shopify-listing-prep', evidenceNote: 'The same repeated listing-prep clicks were seen again on another day.',
    make: (hub) => ({ ...(hub.state.ownerFindings.find((f) => f.dedupeKey === 'shopify-listing-prep') as OwnerFinding) }),
  },
  {
    dedupeKey: 'old-policy-page', evidenceNote: 'An older public page was found.',
    make: (hub) => {
      const published = chicagoToUtc('2026-03-02', '10:00');
      const cls = classifyWebSource({ publishedAt: published, retrievedAt: hub.state.now });
      return {
        kind: 'Compliance/policy change', area: 'Etsy', title: 'A public Etsy page about listing photos was found', urgency: 'NORMAL', factLabel: 'UNKNOWN',
        summary: `A help page about listing photos was found. ${cls.text} It is saved for reference only.`, projectMatch: { type: 'NONE' }, modelId: null, plan: null, dedupeKey: 'old-policy-page',
        recommendedAction: 'Keep as information. No action is needed unless you want to check it.', uncertainties: ['We cannot show this is a recent change.'], followUpAt: undefined, snoozedUntil: undefined,
        evidence: [evd('e1', { label: 'Help page about listing photos (example, simulated source)', sourceType: 'WEB', sourceName: 'Example marketplace help (simulated)', url: 'https://example.com/photo-help', publishedAt: published, retrievedAt: hub.state.now, observedAt: hub.state.now, quality: 'SOURCED', excerpt: 'Simulated excerpt.' })],
      };
    },
  },
  {
    dedupeKey: 'training-need', evidenceNote: 'A pattern of repeated corrections on the same step.',
    make: (hub) => ({
      kind: 'Employee learning/support', area: 'Operations', title: 'The same correction was made on three listings', urgency: 'NORMAL', factLabel: 'HYPOTHESIS',
      summary: 'Three listings needed the same fix. The instructions for that step may be unclear. This is not about any person. A clearer instruction may help everyone.',
      projectMatch: { type: 'UNASSIGNED_INSIGHT' }, modelId: null, plan: null, dedupeKey: 'training-need', recommendedAction: 'Review the step instructions with the team.', uncertainties: ['Three listings is a small number.'], followUpAt: undefined, snoozedUntil: undefined,
      evidence: [evd('e1', { label: 'Three “Fix” marks in the same column', sourceType: 'SHEET', sourceName: '“SEO Master” sheet (made-up sample)', url: null, observedAt: hub.state.now, quality: 'MEASURED' })],
    }),
  },
];

/** Pretend scan. Re-running never creates duplicates: a repeat adds a dated note to the same item. */
export function runAiScan(hub: HubServer, uid: string) {
  owner(hub, uid);
  const st = hub.state;
  const out = { created: [] as string[], updated: [] as string[] };
  hub.commit(() => {
    st.scanCount += 1; st.lastScanAt = st.now;
    // Each scan looks at the next pool items; every scan also "re-sees" something old to show de-duplication.
    const slice = st.scanCount === 1 ? SCAN_POOL : SCAN_POOL.slice(0, 2);
    for (const item of slice) {
      const existing = st.ownerFindings.find((f) => f.dedupeKey === item.dedupeKey);
      if (existing) {
        const already = existing.occurrences.some((o) => o.note === item.evidenceNote && o.at === st.now);
        if (!already) { existing.occurrences.push({ at: st.now, note: item.evidenceNote }); existing.lastEvidenceAt = st.now; existing.analyzedAt = st.now; existing.seenByOwner = false; out.updated.push(existing.code); }
        continue;
      }
      const draft = item.make(hub);
      const code = `AF-${String(st.ownerFindings.length + 1).padStart(3, '0')}`;
      const f: OwnerFinding = { ...(draft as OwnerFinding), id: `af-${st.ownerFindings.length + 1}`, code, discoveredAt: st.now, lastEvidenceAt: st.now, analyzedAt: st.now, occurrences: [{ at: st.now, note: 'First seen.' }], status: 'NEW', decisions: [], linkedProjectId: null, approvedProjectId: null, seenByOwner: false, goalIds: [], ownerNotes: '' };
      st.ownerFindings.push(f); out.created.push(code);
      if (f.urgency === 'URGENT') hub.notify({ recipientUid: uid, senderUid: null, type: 'AI_FINDING', title: `Urgent: ${f.title}`, preview: f.summary, projectId: null, sourceEntityId: f.id, deepLink: `/owner/ai/${f.id}`, key: `n:finding:${f.dedupeKey}` });
    }
    const normal = st.ownerFindings.filter((f) => f.urgency === 'NORMAL' && f.status === 'NEW').length;
    if (normal) hub.notify({ recipientUid: uid, senderUid: null, type: 'DAILY_DIGEST', title: `AI summary: ${normal} new item${normal === 1 ? '' : 's'} to look at`, preview: 'Everything is in AI Recommendations. Only urgent items alert you right away.', projectId: null, sourceEntityId: 'ai-digest', deepLink: '/owner/ai', key: `n:aidigest:${chicagoDate(st.now)}` });
    st.aiRuns.push({ id: hub.nid('airun'), startedAt: st.now, endedAt: st.now, cause: 'manual scan (simulated)', model: 'replay-adapter (no API)', inputTokens: 0, outputTokens: 0, costUsd: 0, outcome: 'OK', promptVersion: 'replay', sourceWatermark: null, errors: [] });
  });
  return out;
}

/** Brings snoozed items back when their date arrives (called by the status run). Idempotent. */
export function processFindingSchedules(hub: HubServer) {
  for (const f of hub.state.ownerFindings) {
    if (f.status === 'SNOOZED' && f.snoozedUntil && hub.state.now >= f.snoozedUntil) {
      f.status = 'NEW'; f.snoozedUntil = undefined; f.occurrences.push({ at: hub.state.now, note: 'Snooze ended. Back in your list.' });
      const owner = hub.state.users.find((u) => u.role === 'OWNER')!;
      hub.notify({ recipientUid: owner.id, senderUid: null, type: 'AI_FINDING', title: `Back in your list: ${f.title}`, preview: 'Your snooze ended.', projectId: null, sourceEntityId: f.id, deepLink: `/owner/ai/${f.id}`, key: `n:snoozeend:${f.id}:${f.occurrences.length}` });
    }
  }
}

// ---------------------------------------------------------------- approve → project → assign
export interface ApproveInput {
  title: string; employeeObjective: string; priority?: Project['priority']; deadlineYmd?: string | null; key?: string;
  steps: PlanStepDraft[]; assignUids?: string[]; createWorkspace?: boolean; idempotencyKey: string;
}

/** What a worker would see: only these fields. Used for the preview and for the real brief. */
export function employeeBriefPreview(input: Pick<ApproveInput, 'title' | 'employeeObjective' | 'steps'>) {
  return {
    title: input.title, objective: input.employeeObjective,
    steps: input.steps.map((s, i) => ({ number: i + 1, title: s.title, instructions: s.instructions, why: s.whyForGoal, deliverable: s.deliverable, tools: s.tools, doneWhen: s.evidenceDescription })),
  };
}
function assertEmployeeSafe(input: ApproveInput) {
  const fields: [string, string][] = [['Title', input.title], ['Goal', input.employeeObjective]];
  input.steps.forEach((s, i) => fields.push([`Step ${i + 1} name`, s.title], [`Step ${i + 1} instructions`, s.instructions], [`Step ${i + 1} reason`, s.whyForGoal], [`Step ${i + 1} deliverable`, s.deliverable], [`Step ${i + 1} done when`, s.evidenceDescription]));
  for (const [label, text] of fields) {
    const hits = findOwnerOnlyTerms(text);
    if (hits.length) throw new HubError('OWNER_ONLY_TEXT', `${label} mentions ${hits[0]}. Keep money details out of the worker plan. They stay private to you.`);
  }
}

export function approveFindingAsProject(hub: HubServer, uid: string, findingId: string, input: ApproveInput): Project {
  owner(hub, uid);
  const f = find(hub, findingId);
  return hub.idem('approve:' + input.idempotencyKey, () => {
    if (['APPROVED'].includes(f.status) && f.approvedProjectId) throw new HubError('ALREADY_APPROVED', 'This was already approved as a project.');
    if (!input.title.trim()) throw new HubError('VALIDATION', 'Please give the project a name.');
    if (!input.steps.length) throw new HubError('VALIDATION', 'Add at least one step.');
    assertEmployeeSafe(input);
    if (input.key && (!/^P-\d{3}$/.test(input.key) || hub.state.projects.some((p) => p.key === input.key))) throw new HubError('VALIDATION', 'That project number is not valid or is already used.');
    for (const a of input.assignUids ?? []) { const u = hub.state.users.find((x) => x.id === a); if (!u || !u.active || u.role !== 'EMPLOYEE') throw new HubError('VALIDATION', 'You can only assign people who work here.'); }
    const project = hub.commit(() => {
      const p = hub.createProject(uid, { title: input.title, objective: input.employeeObjective, memberUids: [], visibility: 'ASSIGNED_ONLY', priority: input.priority ?? 'NORMAL', key: input.key });
      p.origin = 'AI_RECOMMENDATION';
      // The employee brief is built here from sanitized fields only. No finding id, no numbers, no strategy.
      p.employeeBrief = `${input.employeeObjective}\n\nSteps: ${input.steps.map((s, i) => `${i + 1}. ${s.title}`).join('; ')}`;
      if (input.deadlineYmd) p.deadlineAt = chicagoToUtc(input.deadlineYmd, '17:00');
      input.steps.forEach((s, i) => {
        const st = hub.addStep(uid, p.id, { title: s.title, instructions: s.instructions, assignedUids: [] });
        st.sortOrder = i + 1; st.objective = s.deliverable; st.acceptance = s.evidenceDescription; st.whyForGoal = s.whyForGoal;
        if (i > 0) st.dependencyIds = [];
        st.instructions = `${s.instructions}${s.tools.length ? `\n\nTools and files: ${s.tools.join(', ')}.` : ''}`;
      });
      f.status = 'APPROVED'; f.approvedProjectId = p.id;
      decide(hub, uid, f, 'APPROVED_AS_PROJECT', `Created ${p.key}`, ['title', 'objective', 'steps']);
      return p;
    });
    if (input.createWorkspace !== false) provisionWorkspace(hub, uid, project.id, `prov:${input.idempotencyKey}`); // errors are recorded on the workspace, never thrown
    if (input.assignUids?.length) assignProject(hub, uid, project.id, input.assignUids, `assign:${input.idempotencyKey}`);
    return project;
  });
}

/** Dalia alone assigns. Only now does the employee get the brief, the folder and a notification. */
export function assignProject(hub: HubServer, uid: string, projectId: string, assignUids: string[], idempotencyKey: string): Project {
  owner(hub, uid);
  const p = hub.projectFor(uid, projectId);
  if (p.visibility === 'OWNER_PRIVATE') throw new HubError('PRIVATE_PROJECT', 'A private project cannot be assigned.');
  for (const a of assignUids) { const u = hub.state.users.find((x) => x.id === a); if (!u || !u.active || u.role !== 'EMPLOYEE') throw new HubError('VALIDATION', 'You can only assign people who work here.'); }
  return hub.idem('assign:' + idempotencyKey, () => hub.commit(() => {
    const before = [...p.memberUids];
    p.memberUids = [...new Set([...p.memberUids, ...assignUids])];
    for (const s of hub.state.steps.filter((x) => x.projectId === p.id && !x.assignedUids.length)) s.assignedUids = [...assignUids];
    hub.audit({ entityType: 'project', entityId: p.id, action: 'ASSIGNED', before, after: p.memberUids, actorUid: uid, actorLabel: hub.userName(uid), reason: 'Owner chose who works on this project', evidenceRefs: [], projectId: p.id });
    hub.addJournal({ projectId: p.id, type: 'ACCESS', actorUid: uid, title: `Assigned to ${assignUids.map((a) => hub.userName(a)).join(', ')}`, summary: 'The project brief and folder are now shared with them.', verificationState: 'OFFICIAL' });
    const ws = hub.state.workspaces[p.id];
    if (ws) ws.log.push({ at: hub.state.now, op: 'permissions', detail: `Folder shared with ${assignUids.map((a) => hub.userName(a)).join(', ')} (simulated)` });
    const steps = hub.state.steps.filter((x) => x.projectId === p.id).sort((a, b) => a.sortOrder - b.sortOrder);
    for (const a of assignUids) hub.notify({ recipientUid: a, senderUid: uid, type: 'PROJECT_ASSIGNED', title: `You were given a new project: ${p.key} “${p.title.slice(0, 60)}”`, preview: `${p.employeeBrief?.split('\n')[0] ?? p.objective} First step: “${steps[0]?.title ?? ''}”.`, projectId: p.id, sourceEntityId: p.id, deepLink: `/projects/${p.id}`, key: `n:assigned:${p.id}:${a}` });
    return p;
  }));
}

// ---------------------------------------------------------------- goals, sources, outcomes
export function addGoal(hub: HubServer, uid: string, title: string, description: string, priority: 'HIGH' | 'NORMAL' | 'LOW') {
  owner(hub, uid);
  if (!title.trim()) throw new HubError('VALIDATION', 'Please write the goal in a few words.');
  return hub.commit(() => { const g = { id: hub.nid('g'), title: title.trim(), description: description.trim(), priority, enabled: true, area: 'All', createdAt: hub.state.now }; hub.state.goals.push(g); return g; });
}
export function updateGoal(hub: HubServer, uid: string, id: string, patch: { enabled?: boolean; priority?: 'HIGH' | 'NORMAL' | 'LOW' }) {
  owner(hub, uid); const g = hub.state.goals.find((x) => x.id === id);
  if (!g) throw new HubError('NOT_FOUND', 'We could not find that goal.');
  return hub.commit(() => { Object.assign(g, patch); return g; });
}
export function toggleSource(hub: HubServer, uid: string, id: string, on: boolean) {
  owner(hub, uid); const s = hub.state.sources.find((x) => x.id === id);
  if (!s) throw new HubError('NOT_FOUND', 'We could not find that source.');
  return hub.commit(() => {
    // This switch only turns a pretend connector on or off. A live connection cannot be made from here.
    s.demoEnabled = on; s.health = on ? (s.health === 'NOT_CONNECTED' ? 'OK' : s.health) : 'NOT_CONNECTED'; s.lastCheckedAt = on ? hub.state.now : s.lastCheckedAt;
    hub.audit({ entityType: 'source', entityId: s.id, action: on ? 'PRETEND_CONNECTOR_ON' : 'PRETEND_CONNECTOR_OFF', before: null, after: { on }, actorUid: uid, actorLabel: hub.userName(uid), reason: 'Practice-copy switch. No live connection.', evidenceRefs: [], projectId: null });
    return s;
  });
}
export function recordOutcome(hub: HubServer, uid: string, findingId: string, input: { period: string; actualHours: number | null; actualOrders: number | null; limitations: string }) {
  owner(hub, uid); const f = find(hub, findingId);
  if (!f.approvedProjectId) throw new HubError('VALIDATION', 'Only approved projects have results to record.');
  return hub.commit(() => { const o = { id: hub.nid('out'), findingId: f.id, projectId: f.approvedProjectId!, period: input.period, actualHours: input.actualHours, actualOrders: input.actualOrders, limitations: input.limitations, recordedAt: hub.state.now }; hub.state.outcomes.push(o); return o; });
}
export function outcomeTracker(hub: HubServer, uid: string) {
  owner(hub, uid);
  return hub.state.ownerFindings.filter((f) => f.approvedProjectId).map((f) => {
    const p = hub.state.projects.find((x) => x.id === f.approvedProjectId)!;
    const model = f.modelId ? hub.state.ownerModels.find((m) => m.id === f.modelId) ?? null : null;
    const est = model ? compute(model, 'base') : null;
    const outs = hub.state.outcomes.filter((o) => o.findingId === f.id);
    const last = outs[outs.length - 1] ?? null;
    return {
      finding: f, project: p, estimatedHours: est?.hoursPerMonth ?? null, estimatedOrders: est?.incrementalOrdersPerMonth ?? null, outcomes: outs,
      comparison: last && est?.hoursPerMonth != null && last.actualHours != null ? `Planned ${est.hoursPerMonth.toFixed(1)} hours per month. Measured ${last.actualHours} hours. This is what changed. It is not proof that this project caused it.` : 'Nothing measured yet.',
      reviewDue: addMinutes(p.createdAt, 60 * 24 * 30),
    };
  });
}

/** What an employee can ever see of this feature: nothing. Used by tests to prove it. */
export function assertNotEmployee(hub: HubServer, uid: string) { if (hub.user(uid).role !== 'OWNER') throw new PermissionDenied(); }
export const fmtLocal = formatLocalDate;
