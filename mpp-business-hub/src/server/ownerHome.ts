import type { HubServer } from './hub';
import type { AiFeedback, NotificationType, OwnerFinding } from '../domain/types';
import { HubError } from './errors';
import { errorsForOwner, errorsWaitingOnPeople } from './errorLog';

// Dalia’s Home groups what needs her by kind. The AI is taught by what she dismisses: every dismissal can carry a reason, and
// “don’t send me this kind” becomes a rule she can see and undo on the Priorities and sources screen.

export type HomeSection = 'AI_PROJECT' | 'OPPORTUNITY' | 'OPTIMIZATION' | 'OTHER';

export function sectionOf(f: OwnerFinding): HomeSection {
  const money = f.impact?.kind === 'revenue' || f.impact?.kind === 'contribution profit' || f.kind === 'Revenue opportunity';
  const saves = f.impact?.kind === 'cost savings' || f.impact?.kind === 'capacity' || ['Expense reduction', 'Automation idea', 'Workflow improvement'].includes(f.kind);
  if (money) return 'OPPORTUNITY';
  if (saves) return 'OPTIMIZATION';
  return f.plan ? 'AI_PROJECT' : 'OTHER';
}

export type AiSub = 'GROWTH' | 'SAVER_PC' | 'SAVER_OTHER' | 'OTHER';
/** Growth = brings in money. Savers cut cost or time: PC based (a person repeating computer work, a script could help) or not PC based (printers, paper, cleaning, things the computer cannot see). */
export function subOf(f: OwnerFinding): AiSub {
  const sec = sectionOf(f);
  if (sec === 'OPPORTUNITY') return 'GROWTH';
  if (sec === 'OPTIMIZATION') return f.area === 'Production' || /printer|toner|ink|jam|inventory|paper|clean|envelope/i.test(`${f.title} ${f.summary}`) ? 'SAVER_OTHER' : 'SAVER_PC';
  return 'OTHER';
}

export const checkKeyOf = (f: OwnerFinding) => f.dedupeKey.split(':')[0];
const fb = (hub: HubServer): AiFeedback[] => (hub.state.aiFeedback ??= []);

export interface HomeFindingItem { id: string; code: string; title: string; summary: string; urgent: boolean; impact: string; isSample: boolean; link: string; discoveredAt: string }

const TEAM_TYPES: NotificationType[] = ['EMPLOYEE_RESPONSE', 'EMPLOYEE_UPDATE', 'BLOCKER', 'NEEDS_VERIFICATION', 'PAUSE_SUGGESTION', 'APPROVAL_REQUEST'];

export function ownerHome(hub: HubServer, uid: string) {
  hub.requireOwner(uid);
  const st = hub.state;
  const open = st.ownerFindings.filter((f) => ['NEW', 'INVESTIGATING'].includes(f.status));
  const item = (f: OwnerFinding): HomeFindingItem => ({ id: f.id, code: f.code, title: f.title, summary: f.summary, urgent: f.urgency === 'URGENT', impact: f.impact?.text ?? '', isSample: !!f.isSample, link: `/owner/ai/${f.id}`, discoveredAt: f.discoveredAt });
  const by = (s: HomeSection) => open.filter((f) => sectionOf(f) === s).sort((a, b) => (a.urgency === 'URGENT' ? 0 : 1) - (b.urgency === 'URGENT' ? 0 : 1) || b.discoveredAt.localeCompare(a.discoveredAt)).map(item);
  const unassigned = st.projects.filter((p) => p.origin === 'AI_RECOMMENDATION' && !p.memberUids.length && !p.closedAt && !p.canceledAt).map((p) => ({ id: p.id, key: p.key, title: p.title }));
  const sub = (k: AiSub) => open.filter((f) => subOf(f) === k).sort((a, b) => (a.urgency === 'URGENT' ? 0 : 1) - (b.urgency === 'URGENT' ? 0 : 1) || b.discoveredAt.localeCompare(a.discoveredAt)).map(item);
  const covered: NotificationType[] = [...TEAM_TYPES, 'AI_FINDING', 'ERROR_LOGGED', 'ERROR_ACKNOWLEDGED', 'OWNER_UPDATE_REQUEST', 'FOLLOW_UP'];
  const otherAlerts = st.notifications.filter((n) => n.recipientUid === uid && !covered.includes(n.type) && !n.acknowledgedAt && n.state !== 'DISMISSED' && (!n.snoozedUntil || n.snoozedUntil <= st.now)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const team = st.notifications.filter((n) => n.recipientUid === uid && TEAM_TYPES.includes(n.type) && !n.acknowledgedAt && n.state !== 'DISMISSED' && (!n.snoozedUntil || n.snoozedUntil <= st.now)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const alerts = st.notifications.filter((n) => n.recipientUid === uid && ['ERROR_ACKNOWLEDGED'].includes(n.type) && !n.acknowledgedAt && n.state !== 'DISMISSED');
  return {
    ai: { growth: sub('GROWTH'), saverPc: sub('SAVER_PC'), saverOther: sub('SAVER_OTHER'), other: sub('OTHER') }, otherAlerts, reminders: hub.remindersDue(uid),
    aiProjects: by('AI_PROJECT'), opportunities: by('OPPORTUNITY'), optimizations: by('OPTIMIZATION'), other: by('OTHER'), unassigned, team,
    errorsToAcknowledge: errorsForOwner(hub, uid), errorsWaiting: errorsWaitingOnPeople(hub, uid), errorAnswers: alerts,
    muted: fb(hub).filter((m) => m.active && m.scope === 'NEVER_AGAIN').length,
  };
}

export const FEEDBACK_REASONS = [
  'Not useful to me', 'Already handled', 'Wrong or out of date', 'Not a priority right now', 'Too small to matter', 'Other',
] as const;

/**
 * Dismiss a finding and say why.
 * THIS_TIME: dismissed once. It only comes back if new evidence appears.
 * NEVER_AGAIN: also stops this kind of check for this goal until Dalia undoes it.
 */
export function dismissWithFeedback(hub: HubServer, uid: string, findingId: string, input: { scope: AiFeedback['scope']; reason: string; note?: string }): AiFeedback {
  hub.requireOwner(uid);
  const f = hub.state.ownerFindings.find((x) => x.id === findingId);
  if (!f) throw new HubError('NOT_FOUND', 'We could not find that recommendation.');
  if (!input.reason.trim()) throw new HubError('VALIDATION', 'Pick a reason so the AI can learn from it.');
  return hub.commit(() => {
    const entry: AiFeedback = {
      id: hub.nid('fb'), findingId: f.id, findingCode: f.code, checkKey: checkKeyOf(f), goalId: f.goalId ?? null, kind: f.kind, area: f.area, title: f.title,
      scope: input.scope, note: [input.reason.trim(), input.note?.trim()].filter(Boolean).join(': '), at: hub.state.now, active: true,
    };
    fb(hub).push(entry);
    hub.dismissFinding(uid, f.id, entry.note);
    return entry;
  });
}

export function feedbackList(hub: HubServer, uid: string): AiFeedback[] { hub.requireOwner(uid); return [...fb(hub)].sort((a, b) => b.at.localeCompare(a.at)); }

/** Turn a “never again” rule off. The old dismissal stays in the history. */
export function undoFeedback(hub: HubServer, uid: string, id: string): AiFeedback {
  hub.requireOwner(uid);
  const m = fb(hub).find((x) => x.id === id);
  if (!m) throw new HubError('NOT_FOUND', 'We could not find that.');
  return hub.commit(() => { m.active = false; hub.audit({ entityType: 'aiFeedback', entityId: m.id, action: 'UNDO', before: { active: true }, after: { active: false }, actorUid: uid, actorLabel: hub.userName(uid), reason: 'Owner turned a rule off', evidenceRefs: [], projectId: null }); return m; });
}

export function isMuted(hub: HubServer, checkKey: string, goalId: string): boolean {
  return fb(hub).some((m) => m.active && m.scope === 'NEVER_AGAIN' && m.checkKey === checkKey && (m.goalId === null || m.goalId === goalId));
}

// ---------------------------------------------------------------- History: everything that ever came to Home
export interface HistoryExtra { id: string; at: string; kind: 'Alert' | 'Error' | 'AI recommendation'; title: string; summary: string; link: string }
/** Alerts and things that were on Home stay here after they are cleared. A person sees only what was theirs. */
export function historyExtras(hub: HubServer, uid: string): HistoryExtra[] {
  const st = hub.state; const u = hub.user(uid); const out: HistoryExtra[] = [];
  for (const n of st.notifications) if (n.recipientUid === uid) out.push({ id: `n-${n.id}`, at: n.createdAt, kind: 'Alert', title: n.title, summary: `${n.preview}${n.acknowledgedAt ? ` · cleared ${n.acknowledgedAt.slice(0, 10)}` : n.state === 'DISMISSED' ? ' · dismissed' : ''}`, link: n.deepLink });
  for (const e of hub.listErrors(uid)) {
    out.push({ id: `e1-${e.id}`, at: e.createdAt, kind: 'Error', title: `Error logged for ${e.personName}`, summary: `By ${e.createdByName}. Happened ${e.occurredOn}. ${e.description.replace(/\s+/g, ' ').slice(0, 160)}`, link: '/errors' });
    if (e.ownerAck) out.push({ id: `e2-${e.id}`, at: e.ownerAck.at, kind: 'Error', title: `${hub.userName(e.ownerAck.byUid)} acknowledged the error for ${e.personName}`, summary: e.ownerAck.note || 'No note.', link: '/errors' });
    if (e.personAck && e.personAck.byUid === e.uid) out.push({ id: `e3-${e.id}`, at: e.personAck.at, kind: 'Error', title: `${e.personName} acknowledged the error`, summary: e.personAck.note, link: '/errors' });
  }
  if (u.role === 'OWNER') {
    for (const f of st.ownerFindings) for (const d of f.decisions) out.push({ id: `d-${f.id}-${d.id}`, at: d.at, kind: 'AI recommendation', title: `${f.code} ${d.decision.replace(/_/g, ' ').toLowerCase()}: ${f.title}`, summary: d.rationale ?? '', link: `/owner/ai/${f.id}` });
    for (const m of st.aiFeedback ?? []) out.push({ id: `fb-${m.id}`, at: m.at, kind: 'AI recommendation', title: `You told the AI: ${m.scope === 'NEVER_AGAIN' ? 'never send this kind' : 'not this time'}`, summary: `${m.title} · ${m.note}`, link: '/owner/ai?tab=priorities' });
  }
  return out.sort((a, b) => b.at.localeCompare(a.at));
}

// ---------------------------------------------------------------- the employee Home, and the number on the Home tab
/** Everything an employee has to clear. One list: nothing lives in a second place. */
export function employeeHome(hub: HubServer, uid: string) {
  const st = hub.state;
  const cards = hub.outstandingCards(uid);
  const errs = hub.errorsForPerson(uid);
  const files = hub.pendingFileSuggestions(uid);
  const removals = hub.pendingFileRemovals(uid);
  const linkIds = new Set(st.resourceLinks.map((l) => l.id));
  const hidden: NotificationType[] = ['OWNER_UPDATE_REQUEST', 'FOLLOW_UP', 'ERROR_FOR_YOU'];
  const alerts = st.notifications.filter((n) => n.recipientUid === uid && !hidden.includes(n.type) && !(n.type === 'APPROVAL_REQUEST' && linkIds.has(n.sourceEntityId)) && !n.acknowledgedAt && n.state !== 'DISMISSED' && (!n.snoozedUntil || n.snoozedUntil <= st.now)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return { requests: cards.filter((c) => c.cardType === 'OWNER_REQUEST'), toConfirm: cards.filter((c) => c.cardType !== 'OWNER_REQUEST'), files, removals, errors: [...errs.toReview, ...errs.snoozed], reminders: hub.remindersDue(uid), alerts };
}

/** The number on the Home tab and the bell: how many things are waiting to be cleared. */
export function homeCount(hub: HubServer, uid: string): number {
  if (hub.user(uid).role === 'OWNER') {
    const h = ownerHome(hub, uid); const o = hub.ownerOverview(uid);
    return h.errorsToAcknowledge.length + h.errorAnswers.length + h.team.length + h.otherAlerts.length + h.reminders.length + h.unassigned.length
      + h.ai.growth.length + h.ai.saverPc.length + h.ai.saverOther.length + h.ai.other.length + o.queue.filter((q) => q.kind !== 'They answered you').length;
  }
  const e = employeeHome(hub, uid);
  return e.requests.length + e.toConfirm.length + e.files.length + e.removals.length + e.errors.length + e.reminders.length + e.alerts.length;
}
