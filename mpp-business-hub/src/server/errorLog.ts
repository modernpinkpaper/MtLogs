import type { HubServer } from './hub';
import type { ErrorLog, User } from '../domain/types';
import { HubError, PermissionDenied } from './errors';
import { chicagoDate, isValidLocalDate } from '../domain/time';

// Customer service errors. A customer wrote to say we made a mistake, we confirmed it, and it goes in that person's log.
// Order of events: the CS person logs it, Dalia is alerted and acknowledges (and may add a note), only THEN does the person see it,
// the person acknowledges with a note (or snoozes until the next clock in). Nothing here can be dismissed or deleted.

const errs = (hub: HubServer): ErrorLog[] => (hub.state.errorLogs ??= []);
const isOwner = (u: User) => u.role === 'OWNER';
export const canLogErrors = (hub: HubServer, uid: string) => { const u = hub.user(uid); return isOwner(u) || !!u.permissions?.includes('CUSTOMER_SERVICE'); };
const owners = (hub: HubServer) => hub.state.users.filter((u) => u.role === 'OWNER' && u.active && !u.noClock);

function find(hub: HubServer, id: string): ErrorLog {
  const e = errs(hub).find((x) => x.id === id);
  if (!e) throw new PermissionDenied();
  return e;
}

/** Dalia gives or takes away the customer service permission. */
export function setCustomerService(hub: HubServer, uid: string, targetUid: string, on: boolean): User {
  hub.requireOwner(uid);
  const t = hub.user(targetUid);
  if (isOwner(t)) throw new HubError('VALIDATION', 'Owners can already log errors.');
  return hub.commit(() => {
    const had = !!t.permissions?.includes('CUSTOMER_SERVICE');
    t.permissions = on ? [...new Set([...(t.permissions ?? []), 'CUSTOMER_SERVICE' as const])] : (t.permissions ?? []).filter((p) => p !== 'CUSTOMER_SERVICE');
    hub.audit({ entityType: 'user', entityId: t.id, action: on ? 'GRANT_CUSTOMER_SERVICE' : 'REVOKE_CUSTOMER_SERVICE', before: { had }, after: { has: on }, actorUid: uid, actorLabel: hub.userName(uid), reason: 'Permission change', evidenceRefs: [], projectId: null });
    return t;
  });
}

export interface ErrorInput { uid: string; occurredOn: string; links: string[]; description: string; idempotencyKey?: string }

function validate(hub: HubServer, i: Pick<ErrorInput, 'occurredOn' | 'links' | 'description'>) {
  if (!isValidLocalDate(i.occurredOn)) throw new HubError('INVALID_DATE', 'Pick the date the error happened.');
  if (i.occurredOn > chicagoDate(hub.state.now)) throw new HubError('INVALID_DATE', 'The date cannot be in the future.');
  if (!i.description.trim()) throw new HubError('VALIDATION', 'Describe what happened.');
  const links = i.links.map((l) => l.trim()).filter(Boolean);
  for (const l of links) if (!/^https?:\/\//i.test(l)) throw new HubError('VALIDATION', 'Each order link must start with https://');
  return links;
}

export function logError(hub: HubServer, uid: string, input: ErrorInput): ErrorLog {
  if (!canLogErrors(hub, uid)) throw new PermissionDenied();
  const person = hub.state.users.find((u) => u.id === input.uid && u.active);
  if (!person) throw new HubError('VALIDATION', 'Pick a person.');
  if (person.id === uid && !isOwner(hub.user(uid))) throw new HubError('VALIDATION', 'You cannot log an error for yourself.');
  const links = validate(hub, input);
  if (input.idempotencyKey) { const dup = errs(hub).find((e) => e.id === `err-${input.idempotencyKey}`); if (dup) return dup; }
  return hub.commit(() => {
    const e: ErrorLog = {
      id: input.idempotencyKey ? `err-${input.idempotencyKey}` : hub.nid('err'), uid: person.id, occurredOn: input.occurredOn, links, description: input.description.trim(),
      createdByUid: uid, createdAt: hub.state.now, ownerAck: null, personAck: null, snoozedUntilClockIn: false, history: [],
    };
    errs(hub).push(e);
    hub.audit({ entityType: 'error', entityId: e.id, action: 'LOG_ERROR', before: null, after: { uid: person.id, occurredOn: e.occurredOn, links: links.length }, actorUid: uid, actorLabel: hub.userName(uid), reason: 'Customer service logged an error', evidenceRefs: [], projectId: null });
    for (const o of owners(hub)) hub.notify({ recipientUid: o.id, senderUid: uid, type: 'ERROR_LOGGED', title: `${hub.userName(uid)} logged an error for ${person.name}`, preview: `Happened ${e.occurredOn}. ${person.name} cannot see it until you acknowledge it.`, projectId: null, sourceEntityId: e.id, deepLink: '/home', key: `err-logged-${e.id}-${o.id}` });
    return e;
  });
}

/** The person who logged it may fix it until the person has acknowledged it. Every change is kept. */
export function editError(hub: HubServer, uid: string, id: string, patch: { occurredOn?: string; links?: string[]; description?: string }): ErrorLog {
  const e = find(hub, id);
  if (e.createdByUid !== uid && !isOwner(hub.user(uid))) throw new PermissionDenied();
  if (e.personAck) throw new HubError('LOCKED', 'The person has already acknowledged this, so it cannot be changed. Log a new entry if something was missed.');
  const next = { occurredOn: patch.occurredOn ?? e.occurredOn, links: patch.links ?? e.links, description: patch.description ?? e.description };
  const links = validate(hub, next);
  return hub.commit(() => {
    const before = { occurredOn: e.occurredOn, links: e.links, description: e.description };
    e.occurredOn = next.occurredOn; e.links = links; e.description = next.description.trim();
    e.history.push({ at: hub.state.now, byUid: uid, what: `Edited. Before: ${before.occurredOn}, ${before.links.length} link(s).` });
    hub.audit({ entityType: 'error', entityId: e.id, action: 'EDIT_ERROR', before, after: { occurredOn: e.occurredOn, links: e.links, description: e.description }, actorUid: uid, actorLabel: hub.userName(uid), reason: 'Error entry edited', evidenceRefs: [], projectId: null });
    return e;
  });
}

/** The owner reads it first. The note is optional. For an owner who is the subject, this one click covers both. */
export function ownerAcknowledge(hub: HubServer, uid: string, id: string, note = ''): ErrorLog {
  hub.requireOwner(uid);
  const e = find(hub, id);
  if (e.ownerAck) return e;
  const subject = hub.user(e.uid);
  return hub.commit(() => {
    const both = isOwner(subject);
    e.ownerAck = { byUid: uid, at: hub.state.now, note: note.trim(), alsoForSubject: both };
    if (both) e.personAck = { at: hub.state.now, byUid: uid, note: note.trim() || `Acknowledged by ${hub.userName(uid)} on behalf of ${subject.name}.` };
    hub.audit({ entityType: 'error', entityId: e.id, action: both && subject.id !== uid ? 'OWNER_ACK_FOR_OWNER' : 'OWNER_ACK', before: null, after: { subject: subject.id, both }, actorUid: uid, actorLabel: hub.userName(uid), reason: both && subject.id !== uid ? `Acknowledged for ${subject.name} as well` : 'Owner acknowledged', evidenceRefs: [], projectId: null });
    for (const n of hub.state.notifications) if (n.sourceEntityId === e.id && n.type === 'ERROR_LOGGED' && n.recipientUid === uid && !n.acknowledgedAt) { n.acknowledgedAt = hub.state.now; n.readAt ??= hub.state.now; n.state = 'ACKNOWLEDGED'; }
    if (!both) hub.notify({ recipientUid: subject.id, senderUid: uid, type: 'ERROR_FOR_YOU', title: 'An error was added to your log', preview: 'Please read it and acknowledge it with a note. You can snooze it until your next clock in.', projectId: null, sourceEntityId: e.id, deepLink: '/home', key: `err-for-${e.id}` });
    return e;
  });
}

/** The person acknowledges with a note that says what they understood and how to prevent it. */
export function personAcknowledge(hub: HubServer, uid: string, id: string, note: string): ErrorLog {
  const e = find(hub, id);
  if (e.uid !== uid || !e.ownerAck) throw new PermissionDenied();
  if (e.personAck) return e;
  if (note.trim().length < 15) throw new HubError('NOTE_REQUIRED', 'Please write a few words: what the error was and what you will do to prevent it.');
  return hub.commit(() => {
    e.personAck = { at: hub.state.now, byUid: uid, note: note.trim() }; e.snoozedUntilClockIn = false;
    hub.audit({ entityType: 'error', entityId: e.id, action: 'PERSON_ACK', before: null, after: { note: e.personAck!.note }, actorUid: uid, actorLabel: hub.userName(uid), reason: 'Person acknowledged an error', evidenceRefs: [], projectId: null });
    for (const n of hub.state.notifications) if (n.sourceEntityId === e.id && n.type === 'ERROR_FOR_YOU' && !n.acknowledgedAt) { n.acknowledgedAt = hub.state.now; n.readAt ??= hub.state.now; n.state = 'ACKNOWLEDGED'; }
    for (const o of owners(hub)) hub.notify({ recipientUid: o.id, senderUid: uid, type: 'ERROR_ACKNOWLEDGED', title: `${hub.userName(uid)} acknowledged an error`, preview: e.personAck!.note.slice(0, 140), projectId: null, sourceEntityId: e.id, deepLink: '/home', key: `err-pack-${e.id}-${o.id}` });
    return e;
  });
}

/** Leave now, look at it tomorrow. It comes back at the next clock in. This is the only way to put it off. */
export function snoozeError(hub: HubServer, uid: string, id: string): ErrorLog {
  const e = find(hub, id);
  if (e.uid !== uid || !e.ownerAck || e.personAck) throw new PermissionDenied();
  return hub.commit(() => { e.snoozedUntilClockIn = true; return e; });
}
export function clearErrorSnoozes(hub: HubServer, uid: string) { for (const e of errs(hub)) if (e.uid === uid && e.snoozedUntilClockIn) e.snoozedUntilClockIn = false; }

export type ErrorRow = ErrorLog & { personName: string; createdByName: string; state: 'WAITING_FOR_OWNER' | 'WAITING_FOR_PERSON' | 'SNOOZED' | 'DONE' };
const row = (hub: HubServer, e: ErrorLog): ErrorRow => ({ ...e, personName: hub.userName(e.uid), createdByName: hub.userName(e.createdByUid), state: !e.ownerAck ? 'WAITING_FOR_OWNER' : e.personAck ? 'DONE' : e.snoozedUntilClockIn ? 'SNOOZED' : 'WAITING_FOR_PERSON' });

/** What a person may see. Employees see only their own, and only after an owner acknowledged. CS sees what they logged. Owners see all. */
export function listErrors(hub: HubServer, uid: string, f: { mine?: boolean } = {}): ErrorRow[] {
  const u = hub.user(uid);
  let list = errs(hub);
  if (f.mine) list = list.filter((e) => e.uid === uid && !!e.ownerAck);
  else if (isOwner(u)) list = [...list];
  else if (canLogErrors(hub, uid)) list = list.filter((e) => e.createdByUid === uid || (e.uid === uid && !!e.ownerAck));
  else list = list.filter((e) => e.uid === uid && !!e.ownerAck);
  return list.map((e) => row(hub, e)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
/** For the owner Home: not yet acknowledged by an owner. */
export function errorsForOwner(hub: HubServer, uid: string): ErrorRow[] { hub.requireOwner(uid); return errs(hub).filter((e) => !e.ownerAck).map((e) => row(hub, e)).sort((a, b) => a.createdAt.localeCompare(b.createdAt)); }
/** Owner acknowledged, waiting for the person (so Dalia can see it came back). */
export function errorsWaitingOnPeople(hub: HubServer, uid: string): ErrorRow[] { hub.requireOwner(uid); return errs(hub).filter((e) => e.ownerAck && !e.personAck).map((e) => row(hub, e)); }
/** For the person: to read now, and snoozed. */
export function errorsForPerson(hub: HubServer, uid: string): { toReview: ErrorRow[]; snoozed: ErrorRow[] } {
  const mine = errs(hub).filter((e) => e.uid === uid && e.ownerAck && !e.personAck).map((e) => row(hub, e));
  return { toReview: mine.filter((e) => !e.snoozedUntilClockIn), snoozed: mine.filter((e) => e.snoozedUntilClockIn) };
}
export function errorCount(hub: HubServer, uid: string, sinceYmd: string | null): number { return errs(hub).filter((e) => e.uid === uid && (!sinceYmd || e.occurredOn >= sinceYmd)).length; }

// ---------------------------------------------------------------- reminders for the customer service person
export interface ErrorHint { key: string; uid: string; personName: string; date: string; text: string }
/** MT Logs can show reprints. It cannot know a customer was affected. So this is only a reminder to check, and it says so. */
export function errorHints(hub: HubServer, uid: string): ErrorHint[] {
  if (!canLogErrors(hub, uid)) throw new PermissionDenied();
  const st = hub.state; const done = new Set((st.errorHintDismissals ?? []).map((d) => d.key));
  const out: ErrorHint[] = [];
  const by = new Map<string, number>();
  for (const j of st.printJobs) {
    if (!j.retryOf) continue;
    const owner = j.uid ?? st.stations.find((s) => s.deviceId === j.deviceId)?.defaultUid ?? null;
    if (!owner) continue;
    const k = `${owner}|${chicagoDate(j.startedAt)}`; by.set(k, (by.get(k) ?? 0) + 1);
  }
  for (const [k, n] of by) {
    const [pid, date] = k.split('|'); const key = `reprints:${k}`;
    if (n < 2 || done.has(key) || errs(hub).some((e) => e.uid === pid && e.occurredOn === date)) continue;
    out.push({ key, uid: pid, personName: hub.userName(pid), date, text: `${hub.userName(pid)} had ${n} reprints on ${date}. If a customer wrote to us about an order that day, this may be worth logging. MT Logs cannot tell if a customer was affected.` });
  }
  return out.sort((a, b) => b.date.localeCompare(a.date));
}
export function dismissErrorHint(hub: HubServer, uid: string, key: string) {
  if (!canLogErrors(hub, uid)) throw new PermissionDenied();
  return hub.commit(() => { (hub.state.errorHintDismissals ??= []).push({ key, uid, at: hub.state.now }); });
}

/** The people a customer service person can pick from: everyone active except themselves. Names only. */
export function errorPeople(hub: HubServer, uid: string): { id: string; name: string }[] {
  if (!canLogErrors(hub, uid)) throw new PermissionDenied();
  return hub.state.users.filter((u) => u.active && u.id !== uid).map((u) => ({ id: u.id, name: u.name }));
}
