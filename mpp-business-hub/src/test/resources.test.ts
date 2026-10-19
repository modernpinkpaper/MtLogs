import { describe, expect, it } from 'vitest';
import { newHub, key, U } from './helpers';

// Acceptance matrix D — resources / journal
describe('D. resources, journal, audit', () => {
  it('one canonical resource links to many steps with different roles', async () => {
    const hub = await newHub();
    const seo = hub.listResources(U.dalia).find((r) => r.resource.id === 'r-seo-a')!;
    const roles = seo.links.map((l) => `${l.stepId}:${l.role}`);
    expect(roles).toEqual(expect.arrayContaining(['s-012-1:OUTPUT', 's-012-2:WORKING', 's-012-3:INPUT']));
    expect(hub.state.resources.filter((r) => r.id === 'r-seo-a')).toHaveLength(1);
  });

  it('provider ID overrides filenames: two similarly named SEO sheets stay distinct with different counts', async () => {
    const hub = await newHub();
    const a = hub.state.resources.find((r) => r.id === 'r-seo-a')!;
    const b = hub.state.resources.find((r) => r.id === 'r-seo-b')!;
    expect(a.sourceId).not.toBe(b.sourceId);
    expect(a.checklistSummary).toMatchObject({ total: 154, yes: 61, fix: 11, blank: 82 });
    expect(b.checklistSummary).toMatchObject({ total: 154, yes: 132, blank: 22 });
    expect(a.approvedVersion).toBeNull();
    expect(b.approvedVersion).toBeNull(); // neither assumed final
  });

  it('local/network paths and unknown links are not invented as clickable cloud links', async () => {
    const hub = await newHub();
    const byId = (id: string) => hub.state.resources.find((r) => r.id === id)!;
    expect(byId('r-images').canonicalUrl).toBeNull();
    expect(byId('r-images').linkState).toBe('LOCAL_ONLY');
    expect(byId('r-amazon-flat').canonicalUrl).toBeNull();
    expect(byId('r-product-urls').canonicalUrl).toBeNull();
    expect(byId('r-product-urls').linkState).not.toBe('VERIFIED');
    expect(byId('r-validation').linkState).toBe('MISSING');
    expect(byId('r-lister').sourceLinked).toBe(false);
  });

  it('a new version never silently replaces an approved input: it is a suggestion until deliberately approved', async () => {
    const hub = await newHub();
    hub.setApprovedVersion(U.dalia, 'r-seo-a', 'rev 41');
    hub.demoNewResourceVersion('r-seo-a');
    const r = hub.state.resources.find((x) => x.id === 'r-seo-a')!;
    expect(r.version).toBe('rev 41');
    expect(r.approvedVersion).toBe('rev 41');
    expect(r.suggestedVersion?.version).toBe('rev 42');
    hub.setApprovedVersion(U.dalia, 'r-seo-a', 'rev 42');
    expect(r.version).toBe('rev 42');
    expect(r.suggestedVersion).toBeNull();
    const aud = hub.getAudit(U.dalia).filter((a) => a.entityId === 'r-seo-a' && a.action === 'APPROVE_RESOURCE_VERSION');
    expect(aud).toHaveLength(2);
    expect(aud[0].before).toMatchObject({ approvedVersion: 'rev 41' });
  });

  it('resource discovery creates SUGGESTED links; employee accepts; marked not-related stays out', async () => {
    const hub = await newHub();
    hub.demoDiscoverSheet(U.dalia);
    expect(hub.stepResources(U.erika, 's-012-1').some((x) => x.resource.id === 'r-seo-c' && x.link.associationState === 'SUGGESTED')).toBe(true);
    hub.reviewResourceLink(U.erika, 'l-sug-1', 'CONFIRM');
    hub.reviewResourceLink(U.erika, 'l-sug-3', 'NOT_RELATED');
    expect(hub.stepResources(U.erika, 's-012-1').find((x) => x.resource.id === 'r-seo-c')!.link.associationState).toBe('CONFIRMED');
    expect(hub.stepResources(U.erika, 's-012-3').some((x) => x.resource.id === 'r-seo-c')).toBe(false);
    expect(hub.state.resources.find((r) => r.id === 'r-seo-c')!.provenance).toBe('EMPLOYEE_CONFIRMED');
  });

  it('project journal aggregates all step events; step journal is the same stored events, filtered (no duplicates)', async () => {
    const hub = await newHub();
    hub.createUpdateRequest(U.dalia, { projectId: 'prj-012', stepId: 's-012-3', idempotencyKey: key() });
    const project = hub.getJournal(U.dalia, { projectId: 'prj-012' });
    const step3 = hub.getJournal(U.dalia, { stepId: 's-012-3' });
    const stored = hub.state.projectEvents.filter((e) => e.projectId === 'prj-012').length;
    expect(project).toHaveLength(stored);
    expect(step3.length).toBeGreaterThan(0);
    expect(step3.length).toBeLessThan(project.length);
    const ids = new Set(project.map((e) => e.id));
    expect(step3.every((e) => ids.has(e.id))).toBe(true); // same ids, same records
    // filters
    expect(hub.getJournal(U.dalia, { projectId: 'prj-012', types: ['AI_OBSERVATION'] }).every((e) => e.type === 'AI_OBSERVATION')).toBe(true);
    expect(hub.getJournal(U.dalia, { q: 'Make 1 draft' }).length).toBeGreaterThan(0);
  });

  it('audit shows before/after, actor, time and reason for transitions', async () => {
    const hub = await newHub();
    hub.transitionStep(U.erika, 's-070-2', 'WAITING', { reason: 'waiting for credentials' });
    const a = hub.getAudit(U.dalia, 'prj-070').find((x) => x.entityId === 's-070-2')!;
    expect(a.before).toMatchObject({ status: 'IN_PROGRESS' });
    expect(a.after).toMatchObject({ status: 'WAITING' });
    expect(a.actorUid).toBe(U.erika);
    expect(a.reason).toContain('waiting for credentials');
    expect(a.recordedAt).toBe(hub.now);
  });

  it('employee resource lists contain no unauthorized/private items', async () => {
    const hub = await newHub();
    for (const uid of [U.erika, U.arantza, U.carolina]) {
      const ids = hub.listResources(uid).map((r) => r.resource.id);
      expect(ids).not.toContain('r-private-plan');
    }
    expect(hub.listResources(U.arantza).map((r) => r.resource.id)).not.toContain('r-seo-a'); // P-012 not shared with Arantza
  });

  it('projects keep their step hierarchy; people on a project can add steps; other employees cannot; progress is explicit counts', async () => {
    const hub = await newHub();
    expect(hub.projectSteps(U.dalia, 'prj-012').map((s) => s.sortOrder)).toEqual([1, 2, 3, 4]);
    const sub = hub.addStep(U.erika, 'prj-012', { title: 'Pick approved SEO copy', parentStepId: 's-012-3' });
    expect(sub.parentStepId).toBe('s-012-3');
    const top = hub.addStep(U.erika, 'prj-012', { title: 'A step Erika adds herself' });
    expect(top.parentStepId).toBeNull();
    expect(() => hub.addStep(U.arantza, 'prj-012', { title: 'rogue top-level step' })).toThrow();
    expect(() => hub.addStep(U.arantza, 'prj-012', { title: 'x', parentStepId: 's-012-3' })).toThrow();
    const created = hub.createProject(U.dalia, { title: 'New demo project', objective: 'o', memberUids: [U.arantza], visibility: 'ASSIGNED_ONLY' });
    expect(created.key).toMatch(/^P-\d{3}$/);
    expect(hub.state.projects.filter((p) => p.key === created.key)).toHaveLength(1);
    const priv = hub.createProject(U.dalia, { title: 'Another private', objective: '', memberUids: [U.erika], visibility: 'OWNER_PRIVATE' });
    expect(priv.memberUids).toEqual([]); // private projects never carry members
  });
});
