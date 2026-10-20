import { describe, expect, it } from 'vitest';
import { newHub, U } from './helpers';
import { chicagoToUtc } from '../domain/time';
import { parsePrintLogCsv, parseFileName } from '../server/printVerify';
import type { HubServer } from '../server/hub';
import type { PrintClaim } from '../domain/types';

const D = '2026-10-14';
const T = (hhmm: string, d = D) => chicagoToUtc(d, hhmm);
const claim = (id: string, uid: string, at: string, subtotal: number, extra: Partial<PrintClaim> = {}): PrintClaim => ({ id, orderId: id, uid, claimedAt: at, buyer: 'Test Buyer', items: [{ sku: 'X', quantity: 20, subtotal, prints: 20 }], subtotal, prints: 20, ...extra });
/** A clean hub: no practice claims, shifts or logs, so each test is exact. */
async function fresh(): Promise<HubServer> {
  const hub = await newHub();
  hub.state.claims = []; hub.state.printLogs = []; hub.state.shifts = []; hub.state.findings = []; hub.state.events = []; hub.state.errorLogs = [];
  return hub;
}
const shift = (hub: HubServer, uid: string, inAt: string, outAt: string) => hub.state.shifts.push({ id: `s-${uid}-${inAt}`, uid, clockInAt: inAt, clockOutAt: outAt, reviewSessions: [], clockInKey: `i-${uid}-${inAt}`, clockOutKey: `o-${uid}-${inAt}` });
/** A confirmed project finding whose first and last evidence are at the given times. */
const project = (hub: HubServer, uid: string, from: string, to: string, n: number) => {
  const ids = [`e${n}a`, `e${n}b`];
  for (const [i, t] of [from, to].entries()) hub.state.events.push({ id: ids[i], occurredAt: t, ingestedAt: t, deviceId: 'X', actorUid: uid, attributionState: 'ATTRIBUTED' as never, eventType: 'x', app: 'x', sourceArchiveId: 'a', sequence: null, watcherRunId: null, allowedSummary: '', keys: { skus: [], submissionRefs: [], fileNames: [], projectHints: [], actions: [], docIds: [] } } as never);
  hub.state.findings.push({ id: `f${n}`, projectId: 'prj-012', stepId: null, deviceId: 'X', actorUid: uid, status: 'CONFIRMED', sourceEventIds: ids } as never);
};

describe('v1.11 claims count once, for whoever has them now', () => {
  it('unclaimed orders count for nobody; a reassigned order counts only for the new person; duplicates count once', async () => {
    const hub = await fresh();
    hub.state.claims = [
      claim('A1', U.erika, T('09:00'), 100),
      claim('A2', U.erika, T('10:00'), 50, { unclaimedAt: T('11:00') }),
      claim('B1', U.erika, T('09:00'), 80), claim('B1', U.carolina, T('12:00'), 80),
      claim('C1', U.erika, T('13:00'), 30), claim('C1', U.erika, T('13:00'), 30),
    ];
    shift(hub, U.erika, T('08:00'), T('16:00')); shift(hub, U.carolina, T('08:00'), T('16:00'));
    const e = hub.printSummary(U.dalia, U.erika, D).day; const c = hub.printSummary(U.dalia, U.carolina, D).day;
    expect(e.orders).toBe(2); expect(e.revenue).toBe(130);
    expect(c.orders).toBe(1); expect(c.revenue).toBe(80);
  });
});

describe('v1.11 revenue per productive hour', () => {
  it('8 clocked hours, 2 project hours, $600 → 6 hours → $100/hr', async () => {
    const hub = await fresh();
    shift(hub, U.erika, T('08:00'), T('16:00')); project(hub, U.erika, T('09:00'), T('11:00'), 1);
    hub.state.claims = [claim('R1', U.erika, T('12:00'), 600)];
    const d = hub.printSummary(U.dalia, U.erika, D).day;
    expect(d.workedMin).toBe(480); expect(d.projectMin).toBe(120); expect(d.basisMin).toBe(360); expect(d.revenuePerHour).toBe(100);
  });
  it('overlapping project time counts once: 9–10 and 9:30–10:30 take out 1.5 hours', async () => {
    const hub = await fresh();
    shift(hub, U.erika, T('08:00'), T('16:00')); project(hub, U.erika, T('09:00'), T('10:00'), 1); project(hub, U.erika, T('09:30'), T('10:30'), 2);
    expect(hub.printSummary(U.dalia, U.erika, D).day.projectMin).toBe(90);
  });
  it('only project time inside clocked time comes out, and productive time never goes below zero', async () => {
    const hub = await fresh();
    shift(hub, U.erika, T('08:00'), T('09:00')); project(hub, U.erika, T('08:30'), T('12:00'), 1);
    const d = hub.printSummary(U.dalia, U.erika, D).day;
    expect(d.projectMin).toBe(30); expect(d.basisMin).toBe(30);
    const hub2 = await fresh(); shift(hub2, U.erika, T('08:00'), T('09:00')); project(hub2, U.erika, T('07:00'), T('10:00'), 1);
    expect(hub2.printSummary(U.dalia, U.erika, D).day.basisMin).toBe(0);
    hub2.state.claims = [claim('Z', U.erika, T('08:30'), 50)];
    expect(hub2.printSummary(U.dalia, U.erika, D).day.revenuePerHour).toBeNull();
  });
  it('breaks stay in (they are paid), and no hours means “—”, never $0 an hour', async () => {
    const hub = await fresh(); hub.state.claims = [claim('Q', U.erika, T('10:00'), 40)];
    expect(hub.printSummary(U.dalia, U.erika, D).day.revenuePerHour).toBeNull();
  });
  it('Moe does not clock in: working time runs from the first to the last printing record, minus project time', async () => {
    const hub = await fresh();
    hub.state.printLogs = [
      { id: 'a', at: T('10:00'), file: 'A - 20 - FLAT.indd', copies: 20, pc: 'MOEPC', printer: 'P', path: 'x' },
      { id: 'b', at: T('14:00'), file: 'B - 20 - FLAT.indd', copies: 20, pc: 'MOEPC', printer: 'P', path: 'y' },
    ];
    project(hub, U.moe, T('11:00'), T('12:00'), 1);
    hub.state.claims = [claim('M1', U.moe, T('10:30'), 360)];
    const d = hub.printSummary(U.dalia, U.moe, D).day;
    expect(d.basisSource).toBe('PRINT_LOG_SPAN'); expect(d.workedMin).toBe(240); expect(d.projectMin).toBe(60); expect(d.revenuePerHour).toBe(120);
  });
});

describe('v1.11 the whole print team on one day', () => {
  it('team rate is total revenue ÷ total hours ($400 ÷ 5h = $80), not the average of personal rates ($75)', async () => {
    const hub = await fresh();
    shift(hub, U.printA, T('08:00'), T('11:00')); shift(hub, U.printB, T('08:00'), T('10:00'));
    hub.state.claims = [claim('A', U.printA, T('09:00'), 300), claim('B', U.printB, T('09:00'), 100)];
    const t = hub.printTeam(U.dalia, D);
    expect(t.team.revenue).toBe(400); expect(t.team.revenuePerHour).toBe(80); expect(t.rows.find((r) => r.uid === U.printA)!.revenuePerHour).toBe(100); expect(t.rows.find((r) => r.uid === U.printB)!.revenuePerHour).toBe(50);
  });
  it('someone with revenue but no hours is left out of the rate and a warning says so', async () => {
    const hub = await fresh();
    shift(hub, U.printA, T('08:00'), T('11:00')); hub.state.claims = [claim('A', U.printA, T('09:00'), 300), claim('B', U.printB, T('09:00'), 100)];
    const t = hub.printTeam(U.dalia, D);
    expect(t.team.revenue).toBe(400); expect(t.team.revenuePerHour).toBe(100); expect(t.warning).toMatch(/Print Employee B/);
  });
  it('only the owner sees the team; each person sees only their own', async () => {
    const hub = await fresh();
    expect(() => hub.printTeam(U.erika, D)).toThrow();
    expect(() => hub.printSummary(U.erika, U.printA, D)).toThrow();
    expect(() => hub.printOrders(U.erika, U.printA, D)).toThrow();
    expect(hub.printOrders(U.erika, U.erika, D)).toEqual([]);
  });
  it('not connected is different from no orders', async () => {
    const hub = await newHub(); hub.state.claims = undefined;
    expect(hub.printTeam(U.dalia, D).connected).toBe(false);
    hub.state.claims = [];
    expect(hub.printTeam(U.dalia, D).connected).toBe(true);
  });
});

describe('v1.11 customer service print verification', () => {
  const setup = async () => {
    const hub = await fresh(); hub.setCustomerService(U.dalia, U.arantza, true);
    hub.state.claims = [claim('111-AAA', U.printA, T('10:00'), 90, { buyer: 'Lynn Hawkey', items: [{ sku: 'CPI', quantity: 40, subtotal: 90, prints: 40 }], prints: 40 })];
    const pc = hub.user(U.printA).primaryDeviceId!;
    hub.state.printLogs = [
      { id: '1', at: T('10:05'), file: 'Lynn Hawkey - 40 - FLAT.indd', copies: 1, pc, printer: 'LEFT', path: 'G:\\x\\Lynn Hawkey - 40 - FLAT_c_1copies.jpg' },
      { id: '2', at: T('10:07'), file: 'Lynn Hawkey - 40 - FLAT.indd', copies: 29, pc, printer: 'LEFT', path: 'G:\\x\\Lynn Hawkey - 40 - FLAT_c_29copies.jpg' },
      { id: '3', at: T('10:07'), file: 'Lynn Hawkey - 40 - FLAT.indd', copies: 29, pc, printer: 'LEFT', path: 'G:\\x\\Lynn Hawkey - 40 - FLAT_c_29copies.jpg' },
      { id: '4', at: T('10:20'), file: 'Lynn Hawkey - 40 - ENV.indd', copies: 40, pc, printer: 'RIGHT', path: 'G:\\x\\Lynn Hawkey - 40 - ENV_c_40copies.jpg' },
    ];
    return hub;
  };
  it('only customer service and Dalia may search; everyone else is refused', async () => {
    const hub = await setup();
    expect(() => hub.lookupOrder(U.erika, '111-AAA')).toThrow(); expect(() => hub.lookupOrder(U.printA, '111-AAA')).toThrow();
    expect(hub.lookupOrder(U.arantza, '111-AAA').found).toBe(true); expect(hub.lookupOrder(U.dalia, '111-AAA').found).toBe(true);
  });
  it('finds the claim, the claimant and separate files; a name alone is only “probable”, duplicate rows count once, and “delivered” is never claimed', async () => {
    const hub = await setup(); const r = hub.lookupOrder(U.arantza, '111-AAA');
    expect(r.claim?.claimedBy).toBe('Print Employee A'); expect(r.claim?.orderedQty).toBe(40);
    const flat = r.candidates.find((c) => /FLAT/.test(c.file))!; const env = r.candidates.find((c) => /ENV/.test(c.file))!;
    expect(flat.submittedCopies).toBe(30); expect(flat.jobs).toBe(2); expect(env.submittedCopies).toBe(40);
    expect(r.candidates.length).toBe(2); expect(r.level).toBe('SEVERAL');
    expect(JSON.stringify(r.knows)).toMatch(/NOT proven/); expect(JSON.stringify(r)).not.toMatch(/delivered to|were delivered/i);
  });
  it('a person at customer service can choose the file; it is saved and then counts as verified', async () => {
    const hub = await setup();
    expect(() => hub.confirmFileForOrder(U.arantza, '111-AAA', 'Other.indd')).toThrow();
    hub.confirmFileForOrder(U.arantza, '111-AAA', 'Lynn Hawkey - 40 - FLAT.indd');
    const r = hub.lookupOrder(U.arantza, '111-AAA'); expect(r.level).toBe('EXACT_VERIFIED'); expect(r.linkedFile).toMatch(/FLAT/);
    expect(hub.state.auditEvents.some((a) => a.action === 'CS_FILE_CONFIRMED')).toBe(true);
  });
  it('an order number inside the file path counts as an exact link', async () => {
    const hub = await setup(); hub.state.printLogs![0].path = 'G:\\x\\111-AAA_Lynn Hawkey - 40 - FLAT.jpg';
    expect(hub.lookupOrder(U.arantza, '111-AAA').level).toBe('EXACT_VERIFIED');
  });
  it('two orders with the same name never auto-confirm', async () => {
    const hub = await setup();
    hub.state.printLogs = hub.state.printLogs!.filter((r) => /FLAT/.test(r.file));
    hub.state.claims!.push(claim('222-BBB', U.printA, T('11:00'), 90, { buyer: 'Lynn Hawkey' }));
    expect(hub.lookupOrder(U.arantza, '111-AAA').level).toBe('SEVERAL');
  });
  it('one clean name match is “probable”, never “verified”', async () => {
    const hub = await setup(); hub.state.printLogs = hub.state.printLogs!.filter((r) => /FLAT/.test(r.file));
    expect(hub.lookupOrder(U.arantza, '111-AAA').level).toBe('PROBABLE');
  });
  it('missing logs say “insufficient coverage”, not “0 printed”; an unclaimed or unknown order says so', async () => {
    const hub = await setup(); hub.state.printLogs = [];
    const r = hub.lookupOrder(U.arantza, '111-AAA'); expect(r.coverage.ok).toBe(false); expect(r.coverage.note).toMatch(/Insufficient log coverage/); expect(r.level).toBe('NONE');
    hub.state.claims!.push(claim('333-CCC', U.printA, T('09:00'), 10, { unclaimedAt: T('10:00') }));
    expect(hub.lookupOrder(U.arantza, '333-CCC').unclaimed).toBe(true); expect(hub.lookupOrder(U.arantza, '999').found).toBe(false);
  });
  it('searches and notes are recorded; customer service cannot read the team numbers', async () => {
    const hub = await setup(); hub.lookupOrder(U.arantza, '111-AAA'); hub.addCaseNote(U.arantza, '111-AAA', 'Customer says 30 arrived.');
    expect(hub.state.csSearches!.length).toBe(1); expect(hub.lookupOrder(U.arantza, '111-AAA').notes).toHaveLength(1);
    expect(() => hub.printTeam(U.arantza, D)).toThrow(); expect(() => hub.printSummary(U.arantza, U.printA, D)).toThrow();
  });
});

describe('v1.11 reading a print log file', () => {
  it('reads the shop’s CSV format, ignoring the summary lines on top', () => {
    const csv = ['Total Copies Printed Today: 31  ', 'Total DYMO Copies Printed: 0  ', 'Average Prints Per Order: 0.00  ', 'Date,File Name,Copies,PC,Printer,File Path  ',
      '"2026-10-20 10:17:17","Pat Doe - 30 - FLAT.indd","1","MOEPC","RIGHT SIDE PRINTER---\\>","G:\\\\My Drive\\\\Printed\\_Jobs\\\\2026-10-20\\\\Pat Doe - 30 - FLAT\\_MOEPC\\_1copies.jpg"  ',
      '"2026-10-20 10:20:47","Pat Doe - 30 - FLAT.indd","29","MOEPC","RIGHT SIDE PRINTER---\\>","G:\\\\My Drive\\\\Printed\\_Jobs\\\\2026-10-20\\\\Pat Doe - 30 - FLAT\\_MOEPC\\_29copies.jpg"  '].join('\n');
    const rows = parsePrintLogCsv(csv);
    expect(rows).toHaveLength(2); expect(rows[1].copies).toBe(29); expect(rows[0].pc).toBe('MOEPC'); expect(rows[0].file).toBe('Pat Doe - 30 - FLAT.indd');
    expect(parseFileName('Pat Doe - 30 - FLAT.indd')).toEqual({ name: 'Pat Doe', qty: 30, style: 'FLAT' });
  });
});

describe('v1.11 step notes, photos and project files on steps', () => {
  it('a note belongs to one step; only the person on the step or Dalia may add one; it shows in History', async () => {
    const hub = await newHub();
    hub.addStepNote(U.erika, 's-070-2', 'One image failed. Retesting.');
    expect(hub.stepNotes(U.erika, 's-070-2')).toHaveLength(1); expect(hub.stepNotes(U.erika, 's-070-3')).toHaveLength(0);
    expect(() => hub.addStepNote(U.erika, 's-070-6', 'not mine')).toThrow();
    expect(() => hub.addStepNote(U.erika, 's-070-2', '   ')).toThrow();
    hub.addStepNote(U.dalia, 's-070-6', 'Please hurry.');
    expect(hub.getJournal(U.erika, { stepId: 's-070-2' }).some((e) => e.type === 'NOTE')).toBe(true);
    expect(() => hub.stepNotes(U.arantza, 's-070-2')).toThrow();
  });
  it('project files without a step are kept in a list only Dalia sees, and she can put each on a step', async () => {
    const hub = await newHub();
    hub.state.resourceLinks.push({ id: 'l-loose', resourceId: 'r-seo-a', projectId: 'prj-070', stepId: null, role: 'REFERENCE', associationState: 'CONFIRMED', suggestedBy: 'HUMAN', explanation: '', evidenceRefs: [], approvedBy: null, createdAt: hub.now, lastReviewedAt: null });
    expect(hub.needsStepAssignment(U.dalia, 'prj-070').some((x) => x.link.id === 'l-loose')).toBe(true);
    expect(() => hub.needsStepAssignment(U.erika, 'prj-070')).toThrow();
    hub.assignLinkToStep(U.dalia, 'l-loose', 's-070-2');
    expect(hub.needsStepAssignment(U.dalia, 'prj-070').some((x) => x.link.id === 'l-loose')).toBe(false);
    expect(hub.stepResources(U.erika, 's-070-2').some((x) => x.link.id === 'l-loose')).toBe(true);
  });
  it('a person can set and remove their own small photo, and nothing else is accepted', async () => {
    const hub = await newHub();
    hub.setMyPhoto(U.erika, 'data:image/jpeg;base64,/9j/4AAQSkZJRg==');
    expect(hub.user(U.erika).photo).toMatch(/^data:image\/jpeg/);
    expect(() => hub.setMyPhoto(U.erika, 'https://evil.example/x.png')).toThrow();
    expect(() => hub.setMyPhoto(U.erika, 'data:text/html;base64,PHNjcmlwdD4=')).toThrow();
    hub.setMyPhoto(U.erika, null); expect(hub.user(U.erika).photo).toBeUndefined();
  });
});
