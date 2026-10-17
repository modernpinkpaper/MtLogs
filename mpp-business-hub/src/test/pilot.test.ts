import { describe, expect, it } from 'vitest';
import { newHub, key, U } from './helpers';
import { PermissionDenied } from '../server/errors';
import { verifiedCount, pilotSummaryLine } from '../server/pilot';

const skus = Array.from({ length: 20 }, (_, i) => `MA${String(41 + i).padStart(3, '0')}`);
type H = Awaited<ReturnType<typeof newHub>>;
const setup = (hub: H, extra: Record<string, unknown> = {}) => hub.configurePilot(U.dalia, 'prj-012', { stepId: 's-012-3', metricType: 'VERIFIED_LISTINGS', metricLabel: 'verified listings', targetCount: 20, scopeLabel: 'SEO Master copy A, rows MA041–MA060.', skus, idempotencyKey: key(), ...extra } as never);

describe('Limited tests (pilot checkpoints)', () => {
  it('Scenario 4: 19 verified + 1 unresolved upload shows 19/20, not 20/20; the 20th verification reaches the target and asks Dalia', async () => {
    const hub = await newHub();
    setup(hub);
    for (const s of skus.slice(0, 19)) hub.recordPilotRow(U.erika, 'prj-012', s, 'UPLOADED', null, null);
    hub.recordPilotRow(U.erika, 'prj-012', skus[19], 'UPLOADED', 'Upload sent, no result page yet', null);
    expect(verifiedCount(hub.getProject(U.erika, 'prj-012').pilot!)).toBe(0); // uploaded is not verified
    hub.verifyPilotRows(U.dalia, 'prj-012', skus.slice(0, 19), 'Found live in Shopify with correct options');
    let p = hub.getProject(U.dalia, 'prj-012');
    expect(pilotSummaryLine(p)).toBe('Test: 19/20 checked');
    expect(p.pilot!.status).toBe('RUNNING');
    expect(hub.listNotifications(U.dalia).some((n) => n.type === 'PILOT_REACHED')).toBe(false);
    hub.verifyPilotRows(U.dalia, 'prj-012', [skus[19]], 'Result page confirms the draft');
    p = hub.getProject(U.dalia, 'prj-012');
    expect(pilotSummaryLine(p)).toBe('Test: 20/20 checked · waiting for your review');
    expect(p.pilot!.status).toBe('TARGET_REACHED');
    const n = hub.listNotifications(U.dalia).filter((x) => x.type === 'PILOT_REACHED');
    expect(n).toHaveLength(1);
    expect(p.pause).toBeNull(); // safe default: propose and ask, do not pause by itself
    const handoff = hub.pilotHandoff(U.dalia, 'prj-012');
    expect(handoff).toMatch(/20 of 20 verified listings checked in the source system/);
    expect(handoff).toMatch(/Who approves what comes next: Dalia/);
    expect(handoff).toMatch(/Tracking limit only/);
  });

  it('checkbox, upload and “tried” never count as verified; employees cannot verify or go outside the list', async () => {
    const hub = await newHub();
    setup(hub);
    hub.recordPilotRow(U.erika, 'prj-012', skus[0], 'CHECKED_OFF');
    hub.recordPilotRow(U.erika, 'prj-012', skus[1], 'TRIED');
    expect(verifiedCount(hub.getProject(U.dalia, 'prj-012').pilot!)).toBe(0);
    expect(() => hub.recordPilotRow(U.erika, 'prj-012', skus[0], 'VERIFIED')).toThrow(/Only a check in the source system/);
    expect(() => hub.recordPilotRow(U.erika, 'prj-012', 'MA999', 'UPLOADED')).toThrow(/not on the approved test list/);
    expect(() => hub.verifyPilotRows(U.erika, 'prj-012', [skus[0]], 'trust me')).toThrow(PermissionDenied);
    expect(() => hub.recordPilotRow(U.arantza, 'prj-012', skus[0], 'TRIED')).toThrow(PermissionDenied);
    expect(() => hub.configurePilot(U.erika, 'prj-012', { metricType: 'CUSTOM', metricLabel: 'x', targetCount: 5, scopeLabel: 'x', skus: [], idempotencyKey: key() })).toThrow(PermissionDenied);
  });

  it('only Dalia can approve the next batch, only after the target, and the earlier test stays in the history', async () => {
    const hub = await newHub();
    setup(hub);
    expect(() => hub.approveNextBatch(U.dalia, 'prj-012', { targetCount: 50, skus: [], idempotencyKey: key() })).toThrow(/has not reached/);
    hub.verifyPilotRows(U.dalia, 'prj-012', skus, 'All live');
    expect(() => hub.approveNextBatch(U.erika, 'prj-012', { targetCount: 50, skus: [], idempotencyKey: key() })).toThrow(PermissionDenied);
    const k = key();
    hub.approveNextBatch(U.dalia, 'prj-012', { targetCount: 50, skus: [], idempotencyKey: k });
    hub.approveNextBatch(U.dalia, 'prj-012', { targetCount: 50, skus: [], idempotencyKey: k });
    expect(hub.getProject(U.dalia, 'prj-012').pilot!.status).toBe('NEXT_BATCH_APPROVED');
    expect(hub.getAudit(U.dalia, 'prj-012').filter((a) => a.action === 'NEXT_BATCH_APPROVED')).toHaveLength(1);
    // a new test can now be set up for the next batch, as batch 2
    const next = Array.from({ length: 3 }, (_, i) => `MS${100 + i}`);
    hub.configurePilot(U.dalia, 'prj-012', { metricType: 'VERIFIED_LISTINGS', metricLabel: 'verified listings', targetCount: 3, scopeLabel: 'Batch 2', skus: next, idempotencyKey: key() });
    expect(hub.getProject(U.dalia, 'prj-012').pilot!.batchNumber).toBe(2);
  });

  it('auto-pause happens only when Dalia chose it ahead of time, and never publishes or expands anything', async () => {
    const hub = await newHub();
    setup(hub, { whenReached: 'AUTO_PAUSE_APPROVED' });
    hub.verifyPilotRows(U.dalia, 'prj-012', skus, 'All live');
    const p = hub.getProject(U.dalia, 'prj-012');
    expect(p.pause?.isPaused).toBe(true);
    expect(p.pause?.reasonCode).toBe('TESTING_SMALLER_BATCH');
    expect(p.pause?.resumeMode).toBe('MANUAL'); // a date arriving can never expand a test
    expect(p.pilot!.rows.length).toBe(20); // no extra items added
    // pausing keeps every row intact
    hub.demoAdvanceToDate('2026-12-01');
    expect(hub.getProject(U.dalia, 'prj-012').pause!.isPaused).toBe(true);
    expect(hub.getProject(U.dalia, 'prj-012').pilot!.rows.filter((r) => r.state === 'VERIFIED')).toHaveLength(20);
  });

  it('setup checks its numbers and is safe to click twice', async () => {
    const hub = await newHub();
    expect(() => setup(hub, { targetCount: 0 })).toThrow(/1 or more/);
    expect(() => setup(hub, { targetCount: 5 })).toThrow(/Make them match/);
    const k = key();
    setup(hub, { idempotencyKey: k }); setup(hub, { idempotencyKey: k });
    expect(hub.getAudit(U.dalia, 'prj-012').filter((a) => a.action === 'PILOT_CONFIGURED')).toHaveLength(1);
    expect(() => setup(hub)).toThrow(/already set up/);
    expect(hub.listNotifications(U.erika).filter((n) => n.title.includes('limited test'))).toHaveLength(1);
  });
});
