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
  const team = st.notifications.filter((n) => n.recipientUid === uid && TEAM_TYPES.includes(n.type) && !n.acknowledgedAt && n.state !== 'DISMISSED' && (!n.snoozedUntil || n.snoozedUntil <= st.now)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const alerts = st.notifications.filter((n) => n.recipientUid === uid && ['ERROR_ACKNOWLEDGED'].includes(n.type) && !n.acknowledgedAt && n.state !== 'DISMISSED');
  return {
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
