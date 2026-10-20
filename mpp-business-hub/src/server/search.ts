import { stepLabel } from '../domain/stepLabels';
import type { HubServer } from './hub';

export interface SearchHit { kind: 'Project' | 'Step' | 'File' | 'History' | 'Person' | 'Recommendation'; id: string; title: string; why: string; link: string; score: number }

/**
 * One search over what the person is allowed to see. Every hit says WHY it matched and links to the exact place.
 * Private items are filtered out before matching, so they cannot show up in results, counts or hints.
 */
export function searchAll(hub: HubServer, uid: string, q: string, limit = 12): SearchHit[] {
  const needle = q.trim().toLowerCase();
  if (needle.length < 2) return [];
  const u = hub.user(uid);
  const hits: SearchHit[] = [];
  const has = (t: string | null | undefined) => !!t && t.toLowerCase().includes(needle);
  const projects = hub.listProjects(uid);
  const pids = new Set(projects.map((p) => p.id));

  for (const p of projects) {
    const exact = p.key.toLowerCase() === needle;
    if (exact || has(p.key) || has(p.title)) hits.push({ kind: 'Project', id: p.id, title: `${p.key} — ${p.title}`, why: exact ? 'Matches the project number' : has(p.key) ? 'Matches the project number' : 'Found in the project name', link: `/projects/${p.id}`, score: exact ? 100 : 80 });
    else if (has(p.objective)) hits.push({ kind: 'Project', id: p.id, title: `${p.key} — ${p.title}`, why: 'Found in the project goal', link: `/projects/${p.id}`, score: 40 });
  }
  const steps = hub.state.steps.filter((s) => pids.has(s.projectId));
  for (const s of steps) {
    const p = projects.find((x) => x.id === s.projectId)!;
    if (has(s.title)) hits.push({ kind: 'Step', id: s.id, title: `${p.key} · Step ${stepLabel(steps, s)}: ${s.title}`, why: 'Found in the step name', link: `/projects/${p.id}/steps/${s.id}`, score: 70 });
    else if (has(s.instructions)) hits.push({ kind: 'Step', id: s.id, title: `${p.key} · Step ${stepLabel(steps, s)}: ${s.title}`, why: 'Found in the step instructions', link: `/projects/${p.id}/steps/${s.id}`, score: 45 });
  }
  const lists = hub.listResources(uid);
  for (const { resource: r, links } of lists) {
    const where = links.find((l) => pids.has(l.projectId));
    const stepText = where?.stepTitle ? `Step “${where.stepTitle}”` : where ? `project ${where.projectKey}` : 'the file library';
    const fields: [string, string | null | undefined][] = [['file name', r.label], ['file location', r.normalizedPath], ['what the file is for', r.purpose], ['product family', r.skuFamilies.join(' ')], ['file ID', r.sourceId]];
    const f = fields.find(([, t]) => has(t));
    if (f) hits.push({ kind: 'File', id: r.id, title: r.label, why: `Found in the ${f[0]}, used in ${stepText}`, link: `/resources?q=${encodeURIComponent(r.label)}`, score: has(r.label) ? 65 : 40 });
  }
  // History: entries and the redacted evidence they cite (SKUs, file names, upload numbers). Only readable projects.
  const journal = hub.getJournal(uid, {});
  for (const e of journal) {
    const evText = hub.state.events.filter((x) => e.sourceRefs.includes(x.id)).map((x) => x.allowedSummary).join(' ');
    const stepId = e.stepIds[0];
    const link = `/projects/${e.projectId}${stepId ? `/steps/${stepId}` : ''}`;
    if (e.type === 'AI_OBSERVATION' && has(evText)) hits.push({ kind: 'History', id: e.id, title: `${e.projectKey}: ${e.title}`, why: 'Matches activity the computer saw (a SKU, file name or upload number)', link, score: 35 });
    else if (has(e.title) || has(e.summary)) hits.push({ kind: 'History', id: e.id, title: `${e.projectKey}: ${e.title}`, why: e.verificationState === 'INDEPENDENTLY_VERIFIED' ? 'Found in a history note that was checked in the source system' : e.type === 'UPDATE_RESPONSE' || e.type === 'PROACTIVE_UPDATE' ? 'Mentioned in an employee update' : 'Mentioned in the project history', link, score: 30 });
    else if (has(evText)) hits.push({ kind: 'History', id: e.id, title: `${e.projectKey}: ${e.title}`, why: 'Matches activity the computer saw (a SKU, file name or upload number)', link, score: 35 });
  }
  if (u.role === 'OWNER') {
    for (const f of hub.state.ownerFindings) {
      const t = `${f.code} ${f.title} ${f.summary} ${f.evidence.map((e) => e.label).join(' ')}`;
      if (has(t)) hits.push({ kind: 'Recommendation', id: f.id, title: `${f.code} — ${f.title}`, why: has(f.code) ? 'Matches the recommendation number' : 'Found in an AI recommendation', link: `/owner/ai/${f.id}`, score: has(f.code) ? 90 : 50 });
    }
    for (const person of hub.state.users.filter((x) => x.role === 'EMPLOYEE')) if (has(person.name)) hits.push({ kind: 'Person', id: person.id, title: person.name, why: 'Matches a team member', link: '/owner/team', score: 60 });
  }
  const seen = new Set<string>();
  return hits.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title)).filter((h) => { const k = `${h.kind}:${h.id}`; if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, limit);
}
