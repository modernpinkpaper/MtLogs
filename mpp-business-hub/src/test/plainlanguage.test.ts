import { describe, expect, it } from 'vitest';
import { newHub, key, U } from './helpers';

/** Rough Flesch-Kincaid grade level (heuristic syllable counter). */
function syllables(w: string): number {
  w = w.toLowerCase().replace(/[^a-z]/g, '');
  if (!w) return 0;
  if (w.length <= 3) return 1;
  w = w.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '').replace(/^y/, '');
  return Math.max(1, (w.match(/[aeiouy]{1,2}/g) ?? []).length);
}
export function grade(raw: string): number {
  const text = raw.replace(/“[^”]*”/g, 'Name'); // names in quotes are labels, not reading text
  const sentences = Math.max(1, (text.match(/[.!?]+(\s|$)/g) ?? []).length);
  const words = text.split(/\s+/).filter((w) => /[a-z]/i.test(w));
  if (!words.length) return 0;
  const syl = words.reduce((s, w) => s + syllables(w), 0);
  return 0.39 * (words.length / sentences) + 11.8 * (syl / words.length) - 15.59;
}

describe('plain language (about a 5th–6th grade reading level)', () => {
  it('AI finding text, notifications and messages read easily', async () => {
    const hub = await newHub();
    await hub.demoReleaseFbaHour();
    const req = hub.createUpdateRequest(U.dalia, { projectId: 'prj-081', stepId: 's-081-2', question: 'How is it going?', idempotencyKey: key() });
    const card = hub.listReviewCards(U.erika).find((c) => c.updateRequestId === req.id)!;
    hub.submitDecision(U.erika, card.id, { action: 'SEND_STATUS', statusAnswer: 'COMPLETED', note: 'done', idempotencyKey: key() });
    const texts: string[] = [];
    for (const f of hub.state.findings) texts.push(f.inference, ...f.uncertainties, ...f.verificationNeeded, f.proposedUpdate.detail);
    for (const n of hub.listNotifications(U.dalia)) texts.push(n.title + '.', n.preview);
    for (const j of hub.state.projectEvents.filter((e) => e.actorType !== 'HUMAN' || e.type === 'UPDATE_RESPONSE')) texts.push(j.title + '.', j.summary);
    texts.push(hub.reviewReadiness(U.erika).message);
    const joined = texts.filter(Boolean).map((t) => (/[.!?]$/.test(t.trim()) ? t : t + '.'));
    const grades = joined.map((t) => ({ t, g: grade(t) }));
    const avg = grades.reduce((s, x) => s + x.g, 0) / grades.length;
    expect(avg).toBeLessThanOrEqual(7);
    // Very short labels (under 5 words) give meaningless scores, so only real sentences are checked.
    const hard = grades.filter((x) => x.g > 10 && x.t.split(/\s+/).length >= 5);
    expect(hard.map((x) => `${x.g.toFixed(1)}: ${x.t}`)).toEqual([]);
  });

  it('error messages are short and plain', async () => {
    const hub = await newHub();
    const msgs: string[] = [];
    const t = (fn: () => unknown) => { try { fn(); } catch (e) { msgs.push((e as Error).message); } };
    t(() => hub.transitionStep(U.erika, 's-070-2', 'BLOCKED'));
    t(() => hub.transitionStep(U.erika, 's-070-5', 'VERIFIED_COMPLETE'));
    t(() => hub.createUpdateRequest(U.dalia, { projectId: 'prj-044', recipientUids: [U.erika], idempotencyKey: key() }));
    t(() => hub.closeProject(U.dalia, 'prj-081'));
    hub.clockOut(U.erika, key());
    t(() => hub.submitDecision(U.erika, hub.outstandingCards(U.erika)[0].id, { action: 'DISMISS', idempotencyKey: key() }));
    expect(msgs.length).toBe(5);
    for (const m of msgs) expect(grade(m)).toBeLessThanOrEqual(9);
  });

  it('names of steps are shown in quotes in notifications', async () => {
    const hub = await newHub();
    const req = hub.createUpdateRequest(U.dalia, { projectId: 'prj-012', stepId: 's-012-3', idempotencyKey: key() });
    const n = hub.listNotifications(U.erika).find((x) => x.sourceEntityId === req.id)!;
    expect(n.title).toContain('“Use Shopify Lister Tampermonkey script to list the new SKUs”');
  });
});
