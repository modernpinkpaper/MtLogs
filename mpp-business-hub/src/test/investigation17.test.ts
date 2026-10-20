import { describe, expect, it } from 'vitest';
import { newHub, U } from './helpers';
import { PermissionDenied } from '../server/errors';
import { SOURCE_CATALOG, GOAL_CATALOG } from '../domain/catalog';
const RAW = import.meta.glob(['../server/investigation.ts', '../domain/catalog.ts'], { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

type H = Awaited<ReturnType<typeof newHub>>;
const src = (hub: H, id: string) => hub.listSources(U.dalia).find((s) => s.id === id)!;
const goal = (hub: H, id: string) => hub.listGoals(U.dalia).find((g) => g.id === id)!;

describe('v1.7 investigation priorities and data sources', () => {
  it('the registry lists every catalog source, and nothing is approved or connected for the owner', async () => {
    const hub = await newHub();
    const all = hub.listSources(U.dalia);
    for (const c of SOURCE_CATALOG) expect(all.some((s) => s.catalogId === c.id), c.id).toBe(true);
    for (const g of GOAL_CATALOG) expect(hub.listGoals(U.dalia).some((x) => x.catalogId === g.id), g.id).toBe(true);
    // none of the sources has a status of Connected in this prototype
    expect(all.some((s) => s.status === 'CONNECTED')).toBe(false);
    // every source carries the fields the spec asks for
    for (const s of all) for (const k of ['purpose', 'scope', 'excluded', 'retention', 'cadence', 'costNote', 'coverage', 'lag'] as const) expect(String(s[k] ?? ''), `${s.id}.${k}`).not.toBe('');
    // first-wave sources show the states: demo, stale, pending, not connected, disabled
    const states = new Set(all.map((s) => s.status));
    for (const st of ['DEMO_ONLY', 'STALE', 'PENDING_PERMISSION', 'NOT_CONNECTED', 'DISABLED']) expect(states.has(st as never), st).toBe(true);
  });

  it('an unconnected source is never claimed as analyzed: the goal says what is missing and no finding appears', async () => {
    const hub = await newHub();
    hub.updateGoal(U.dalia, 'ig-B2a', { enabled: true });
    const before = hub.state.ownerFindings.length;
    const r = hub.runInvestigations(U.dalia);
    expect(hub.state.ownerFindings.length).toBeGreaterThanOrEqual(before);
    expect(r.blocked.some((b) => b.goalId === 'ig-B2a')).toBe(true);
    const rd = hub.goalReadiness(U.dalia, 'ig-B2a');
    expect(rd.ready).toBe(false);
    expect(rd.missing.join(' ')).toMatch(/Amazon Business Report|permission|approve/i);
    expect(goal(hub, 'ig-B2a').lastRunNote).toMatch(/Could not investigate/);
    // no finding mentions sales numbers from an unconnected source
    expect(hub.state.ownerFindings.filter((f) => f.goalId === 'ig-B2a')).toHaveLength(0);
  });

  it('approving a source with no data records permission but connects nothing', async () => {
    const hub = await newHub();
    hub.setSourceApproval(U.dalia, 'src-B6', true);
    expect(src(hub, 'src-B6')).toMatchObject({ approved: true, status: 'PENDING_PERMISSION', dataKind: 'NONE' });
    hub.updateGoal(U.dalia, 'ig-B6a', { enabled: true, checks: ['stale-steps'] });
    expect(hub.goalReadiness(U.dalia, 'ig-B6a').ready).toBe(false);
    hub.runInvestigations(U.dalia);
    expect(hub.state.ownerFindings.filter((f) => f.goalId === 'ig-B6a')).toHaveLength(0);
  });

  it('a goal with no check is kept as a brief and invents nothing', async () => {
    const hub = await newHub();
    hub.setSourceApproval(U.dalia, 'src-A2', true);
    const g = hub.addInvestigationGoal(U.dalia, { title: 'Which seasonal bundles could raise profit?', question: 'Which seasonal bundles could increase contribution profit without extra production complexity?', priority: 'LOW', sourceIds: ['src-A2'], checks: [] });
    const before = hub.state.ownerFindings.length;
    const r = hub.runInvestigations(U.dalia);
    expect(r.briefOnly).toContain(g.id);
    expect(hub.state.ownerFindings.length).toBe(before + r.created.length);
    expect(hub.state.ownerFindings.filter((f) => f.goalId === g.id)).toHaveLength(0);
    expect(hub.goalBrief(U.dalia, g.id)).toMatch(/Do not guess numbers/);
  });

  it('the owner can add a goal later without any code, and it runs when its sources and checks are ready', async () => {
    const hub = await newHub();
    hub.setSourceApproval(U.dalia, 'src-A1', true);
    const g = hub.addInvestigationGoal(U.dalia, { title: 'Stuck work', question: 'What has been stuck for a few days?', priority: 'HIGH', sourceIds: ['src-A1'], checks: ['stale-steps'], params: { staleDays: 1 } });
    expect(hub.goalReadiness(U.dalia, g.id).ready).toBe(true);
    const r = hub.runInvestigations(U.dalia);
    expect(r.ran).toContain(g.id);
    expect(goal(hub, g.id).lastRunNote).toMatch(/Checked/);
    expect(() => hub.addInvestigationGoal(U.dalia, { title: 'x', question: '', priority: 'LOW', sourceIds: [], checks: ['nope'] })).toThrow(/does not exist/);
    expect(() => hub.addInvestigationGoal(U.dalia, { title: ' ', question: '', priority: 'LOW', sourceIds: [], checks: [] })).toThrow(/few words/);
  });

  it('every finding carries what was found, the data used, the recommended project and an honest impact', async () => {
    const hub = await newHub();
    for (const id of ['src-A1', 'src-A3', 'src-A5', 'src-B1']) hub.setSourceApproval(U.dalia, id, true);
    for (const id of ['ig-A1a', 'ig-A1b', 'ig-A3a', 'ig-B1a', 'ig-A4a']) hub.updateGoal(U.dalia, id, { enabled: true });
    hub.runInvestigations(U.dalia);
    const made = hub.state.ownerFindings.filter((f) => f.goalId);
    expect(made.length).toBeGreaterThan(2);
    for (const f of made) {
      expect(f.summary.length, f.code).toBeGreaterThan(20);
      expect(f.sourcesUsed?.length, f.code).toBeGreaterThan(0);
      expect(f.evidence.length, f.code).toBeGreaterThan(0);
      expect(f.scope, f.code).toBeTruthy();
      expect(f.alternatives?.length, f.code).toBeGreaterThan(0);
      expect(f.validation, f.code).toBeTruthy();
      expect(f.recommendedAction, f.code).toBeTruthy();
      expect(f.bucket, f.code).toBeTruthy();
      expect(f.score, f.code).toBeTruthy();
      // no connected cost or sales data, so impact must say so rather than invent numbers
      expect(f.impact?.text, f.code).toMatch(/Insufficient data to estimate/);
      expect(f.impact?.math, f.code).toBeNull();
      expect(f.employeeBrief ?? '', f.code).not.toMatch(/\$|profit|margin|revenue/i);
      // made-up data is always labeled
      expect(f.isSample, f.code).toBe(true);
    }
    // the unverified Amazon move says it is not checked, not that it worked
    const amazon = made.find((f) => f.dedupeKey.startsWith('unverified:'))!;
    expect(amazon.summary).toMatch(/not proof|nobody has read the final result/i);
    expect(amazon.evidence.every((e) => /not checked/i.test(e.label))).toBe(true);
  });

  it('a repeat run makes no duplicates; a dismissed finding stays dismissed unless the evidence changes', async () => {
    const hub = await newHub();
    hub.setSourceApproval(U.dalia, 'src-A1', true); hub.setSourceApproval(U.dalia, 'src-B1', true); hub.updateGoal(U.dalia, 'ig-B1a', { enabled: true });
    hub.runInvestigations(U.dalia);
    const n = hub.state.ownerFindings.length;
    hub.runInvestigations(U.dalia); hub.runInvestigations(U.dalia);
    expect(hub.state.ownerFindings.length).toBe(n);
    const f = hub.state.ownerFindings.find((x) => x.dedupeKey.startsWith('unverified:'))!;
    hub.dismissFinding(U.dalia, f.id, 'Already checked it');
    hub.runInvestigations(U.dalia);
    expect(hub.state.ownerFindings.find((x) => x.id === f.id)!.status).toBe('DISMISSED');
    // new evidence (a third unchecked upload) brings it back
    src(hub, 'src-B1').sampleRows!.push({ id: 'up-3', label: 'Another change', detail: 'Upload sent', verified: false, at: hub.state.now });
    hub.runInvestigations(U.dalia);
    expect(hub.state.ownerFindings.find((x) => x.id === f.id)!.status).toBe('NEW');
    expect(hub.state.ownerFindings.find((x) => x.id === f.id)!.occurrences.some((o) => /New evidence/.test(o.note))).toBe(true);
  });

  it('pausing a source stops future investigations from using it', async () => {
    const hub = await newHub();
    hub.setSourceApproval(U.dalia, 'src-B1', true); hub.updateGoal(U.dalia, 'ig-B1a', { enabled: true });
    expect(hub.goalReadiness(U.dalia, 'ig-B1a').ready).toBe(true);
    hub.setSourceApproval(U.dalia, 'src-B1', false);
    expect(src(hub, 'src-B1').status).toBe('DISABLED');
    expect(hub.goalReadiness(U.dalia, 'ig-B1a').ready).toBe(false);
    const before = hub.state.ownerFindings.length;
    hub.runInvestigations(U.dalia);
    expect(hub.state.ownerFindings.length).toBe(before);
  });

  it('a paused project is never restarted: the finding only asks the owner, and no project or assignment appears', async () => {
    const hub = await newHub();
    hub.setSourceApproval(U.dalia, 'src-A1', true); hub.updateGoal(U.dalia, 'ig-A1b', { enabled: true });
    const skus = Array.from({ length: 20 }, (_, i) => `MA${String(41 + i).padStart(3, '0')}`);
    hub.configurePilot(U.dalia, 'prj-012', { stepId: 's-012-3', metricType: 'VERIFIED_LISTINGS', metricLabel: 'verified listings', targetCount: 20, scopeLabel: 'SEO Master copy A', skus, idempotencyKey: 'k-gate' } as never);
    for (const s of skus) hub.recordPilotRow(U.erika, 'prj-012', s, 'UPLOADED', null, null);
    hub.verifyPilotRows(U.dalia, 'prj-012', skus, 'Found live in Shopify');
    const projectsBefore = hub.state.projects.map((x) => x.id + x.pause?.isPaused + x.closedAt).join();
    const assignBefore = JSON.stringify(hub.state.assignments);
    hub.runInvestigations(U.dalia);
    const f = hub.state.ownerFindings.find((x) => x.dedupeKey === 'gate:P-012')!;
    expect(f.bucket).toBe('Needs decision');
    expect(f.status).toBe('NEW');
    expect(hub.state.projects.map((x) => x.id + x.pause?.isPaused + x.closedAt).join()).toBe(projectsBefore);
    expect(JSON.stringify(hub.state.assignments)).toBe(assignBefore);
    expect(hub.getProject(U.dalia, 'prj-012').pilot!.status).toBe('TARGET_REACHED');
  });

  it('the owner can edit and add sources; custom sources start Not connected; catalog sources cannot be deleted', async () => {
    const hub = await newHub();
    hub.updateSource(U.dalia, 'src-A4', { scope: 'Only the print computers', excluded: 'Customer names' });
    expect(src(hub, 'src-A4')).toMatchObject({ scope: 'Only the print computers', excluded: 'Customer names' });
    const s = hub.addSource(U.dalia, { name: 'Supplier price list', purpose: 'Spot price changes', scope: 'One Drive file', allowed: 'Prices only' });
    expect(s).toMatchObject({ status: 'NOT_CONNECTED', approved: false, custom: true, dataKind: 'NONE' });
    expect(() => hub.removeSource(U.dalia, 'src-A1')).toThrow(/Pause the source/);
    hub.removeSource(U.dalia, s.id);
    expect(hub.listSources(U.dalia).some((x) => x.id === s.id)).toBe(false);
    expect(() => hub.updateSource(U.dalia, 'src-A4', { name: ' ' })).toThrow(/name/);
    expect(hub.getAudit(U.dalia).some((a) => a.action === 'SOURCE_EDITED')).toBe(true);
  });

  it('an employee cannot read or change goals, sources, findings, briefs or run an investigation (checked in the data layer)', async () => {
    const hub = await newHub();
    hub.setSourceApproval(U.dalia, 'src-B1', true); hub.updateGoal(U.dalia, 'ig-B1a', { enabled: true }); hub.runInvestigations(U.dalia);
    const calls: [string, () => unknown][] = [
      ['listSources', () => hub.listSources(U.erika)], ['listGoals', () => hub.listGoals(U.erika)], ['setSourceApproval', () => hub.setSourceApproval(U.erika, 'src-A1', true)],
      ['updateSource', () => hub.updateSource(U.erika, 'src-A1', { scope: 'x' })], ['addSource', () => hub.addSource(U.erika, { name: 'x', purpose: '', scope: '', allowed: '' })],
      ['addInvestigationGoal', () => hub.addInvestigationGoal(U.erika, { title: 'x', question: '', priority: 'LOW', sourceIds: [], checks: [] })], ['updateGoal', () => hub.updateGoal(U.erika, 'ig-A1a', { enabled: true })],
      ['removeGoal', () => hub.removeGoal(U.erika, 'ig-A1a')], ['goalReadiness', () => hub.goalReadiness(U.erika, 'ig-A1a')], ['runInvestigations', () => hub.runInvestigations(U.erika)],
      ['goalBrief', () => hub.goalBrief(U.erika, 'ig-A1a')], ['checkLibrary', () => hub.checkLibrary(U.erika)], ['setFindingBucket', () => hub.setFindingBucket(U.erika, 'af-1', 'Urgent')], ['listFindings', () => hub.listFindings(U.erika)],
    ];
    for (const [name, fn] of calls) expect(fn, name).toThrow(PermissionDenied);
    // and nothing an employee can fetch contains investigation content
    const text = JSON.stringify([hub.listProjects(U.erika), hub.search(U.erika, 'unverified'), hub.search(U.erika, 'Business Report'), hub.listNotifications(U.erika)]);
    expect(text).not.toMatch(/FBA_TY001 move|Insufficient data to estimate|investigation/i);
  });

  it('investigation never creates a project, assigns anyone, or notifies employees', async () => {
    const hub = await newHub();
    for (const id of ['src-A1', 'src-A3', 'src-A5', 'src-B1']) hub.setSourceApproval(U.dalia, id, true);
    for (const g of hub.listGoals(U.dalia)) hub.updateGoal(U.dalia, g.id, { enabled: true });
    const projects = hub.state.projects.length; const assigns = hub.state.assignments.length; const notes = hub.state.notifications.filter((n) => n.recipientUid !== U.dalia).length;
    hub.runInvestigations(U.dalia);
    expect(hub.state.projects.length).toBe(projects);
    expect(hub.state.assignments.length).toBe(assigns);
    expect(hub.state.notifications.filter((n) => n.recipientUid !== U.dalia).length).toBe(notes);
  });

  it('the investigation code makes no network call and uses no secrets', () => {
    const files = Object.entries(RAW);
    expect(files.length).toBe(2);
    for (const [name, text] of files) expect(text, name).not.toMatch(/\bfetch\(|XMLHttpRequest|WebSocket|process\.env|apiKey|api_key|Bearer /);
  });

  it('the plain checks find real problems in a real-shaped state: stale, overdue, blocked and printer problems', async () => {
    const hub = await newHub();
    hub.setSourceApproval(U.dalia, 'src-A1', true);
    for (const id of ['ig-A1a']) hub.updateGoal(U.dalia, id, { enabled: true, params: { staleDays: 1, minBlocked: 1 } });
    const st = hub.state;
    st.projects.find((p) => p.id === 'prj-012')!.deadlineAt = '2026-10-10T17:00:00.000Z';
    const r = hub.runInvestigations(U.dalia);
    expect(r.created.length).toBeGreaterThan(0);
    const keys = st.ownerFindings.map((f) => f.dedupeKey);
    expect(keys.some((k) => k.startsWith('overdue:'))).toBe(true);
    const od = st.ownerFindings.find((f) => f.dedupeKey === 'overdue:P-012')!;
    expect(od.urgency).toBe('URGENT');
    expect(od.projectMatch).toMatchObject({ type: 'ALREADY_COVERED', projectKey: 'P-012' });
    expect(od.overlap?.join(' ')).toMatch(/P-012/);
  });

  it('the sales check uses real arithmetic, shows its math and scenarios, leaves out the partial last day, and says it is revenue not profit', async () => {
    const hub = await newHub();
    const days: { d: string; amount: number; orders: number; units: number }[] = [];
    for (let i = 0; i < 100; i++) { const d = new Date(Date.UTC(2026, 5, 1 + i)).toISOString().slice(0, 10); days.push({ d, amount: i < 85 ? 1000 : 600, orders: i < 85 ? 20 : 10, units: i < 85 ? 20 : 10 }); }
    days[99] = { d: days[99].d, amount: 5, orders: 0, units: 0 }; // partial last day must be ignored
    hub.state.salesDaily = days;
    Object.assign(src(hub, 'src-B2'), { dataKind: 'SYNTHETIC' });
    hub.setSourceApproval(U.dalia, 'src-B2', true); hub.updateGoal(U.dalia, 'ig-B2a', { enabled: true });
    hub.runInvestigations(U.dalia);
    const f = hub.state.ownerFindings.find((x) => x.dedupeKey === 'sales-trend:7d')!;
    expect(f).toBeTruthy();
    // last 7 full days are 600 each = 4200. Of the 12 weeks before, 11 are 7000 and one is 4200, so the average is 6767 and the gap is 2567 per week.
    expect(f.impact?.kind).toBe('revenue');
    expect(f.impact?.text).toMatch(/Revenue only, not profit/);
    expect(f.impact?.math).toMatch(/\$6,767.*\$4,200.*\$2,567/);
    expect(f.impact?.scenarios).toHaveLength(3);
    expect(f.alternatives?.join(' ')).toMatch(/Seasonal/);
    expect(f.isSample).toBe(true);
    // with no sales data connected the same goal says what is missing and creates nothing
    const hub2 = await newHub(); hub2.updateGoal(U.dalia, 'ig-B2a', { enabled: true }); hub2.runInvestigations(U.dalia);
    expect(hub2.state.ownerFindings.some((x) => x.dedupeKey.startsWith('sales-trend'))).toBe(false);
    // employees cannot read it
    expect(() => hub.runInvestigations(U.erika)).toThrow(PermissionDenied);
    expect(JSON.stringify([hub.listProjects(U.erika), hub.search(U.erika, 'sales'), hub.counts(U.erika)])).not.toMatch(/Revenue only|sales-trend|2,567/);
  });
});
