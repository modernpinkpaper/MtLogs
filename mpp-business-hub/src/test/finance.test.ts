import { describe, expect, it } from 'vitest';
import { newHub, key, U } from './helpers';
import { combineBenefits, compute, confidenceOf, classifyWebSource, findOwnerOnlyTerms } from '../server/finance';
import { HubError } from '../server/errors';
import type { OpportunityModel } from '../domain/types';

const model = async (id = 'om-1') => { const hub = await newHub(); return { hub, m: hub.state.ownerModels.find((x) => x.id === id)! }; };
const clone = (m: OpportunityModel): OpportunityModel => JSON.parse(JSON.stringify(m));

describe('Impact calculator (owner-only math)', () => {
  it('the spec’s Shopify example: 200 × 5 ÷ 60 = 16.67 hours, $20/hour = $333.33 of freed time, NOT cash savings', async () => {
    const { m } = await model();
    const r = compute(m, 'base');
    expect(r.hoursPerMonth).toBeCloseTo(16.6667, 3);
    expect(r.capacityValuePerMonth).toBeCloseTo(333.33, 1);
    expect(r.notes.join(' ')).toMatch(/Capacity freed, not cash savings/);
    expect(r.notes.join(' ')).toMatch(/No verified cash savings yet/);
    expect(r.realizedCostSavingsPerMonth).toBeNull();
    expect(r.netMonthlyCashBenefit).toBeNull(); // freed time never becomes a cash benefit by itself
    expect(r.roiPct).toBeNull();
    expect(r.implementationLaborValue).toBe(240); // 12h × $20, labeled as worker time
    expect(r.lines.find((l) => l.label === 'Time freed each month')!.inputs).toBe('200 × 5 ÷ 60');
    expect(r.lines.map((l) => l.result).join(' ')).toMatch(/not cash out the door/);
  });

  it('low, base and high scenarios come from the stored inputs', async () => {
    const { m } = await model();
    expect(compute(m, 'low').hoursPerMonth).toBeCloseTo(7.5, 5);
    expect(compute(m, 'high').hoursPerMonth).toBeCloseTo(29.1667, 3);
  });

  it('revenue is not profit: without a margin it says so and shows no profit, no return', async () => {
    const { m } = await model('om-2');
    const r = compute(m, 'base');
    expect(r.incrementalOrdersPerMonth).toBeCloseTo(10, 5);
    expect(r.incrementalRevenuePerMonth).toBeCloseTo(320, 5);
    expect(r.contributionProfitPerMonth).toBeNull();
    expect(r.notes.join(' ')).toMatch(/Revenue scenario only — profit not calculated/);
    expect(r.missing.join(' ')).toMatch(/Profit margin/);
    expect(r.roiPct).toBeNull();
    expect(r.netMonthlyCashBenefit).toBeNull();
  });

  it('when the owner adds a margin the profit is recomputed from the stored numbers and the edit is versioned and audited', async () => {
    const { hub, m } = await model('om-2');
    hub.updateModelVar(U.dalia, m.id, 'contributionMarginPct', { low: 0.3, base: 0.4, high: 0.5, quality: 'SOURCED', source: 'Owner’s margin sheet' });
    const r = compute(hub.state.ownerModels.find((x) => x.id === 'om-2')!, 'base');
    expect(r.contributionProfitPerMonth).toBeCloseTo(128, 5);
    expect(r.netMonthlyCashBenefit).toBeCloseTo(128, 5);
    expect(hub.state.ownerModels.find((x) => x.id === 'om-2')!.version).toBe(2);
    expect(hub.getAudit(U.dalia).some((a) => a.action === 'ASSUMPTION_EDITED')).toBe(true);
    expect(() => hub.updateModelVar(U.dalia, 'om-2', 'averageOrderValue', { base: -5 })).toThrow(HubError);
    expect(() => hub.updateModelVar(U.erika, 'om-2', 'averageOrderValue', { base: 1 })).toThrow(/permission denied/);
  });

  it('verified cash savings, running costs, return and payback use only real money and guard against dividing by zero', () => {
    const m: OpportunityModel = {
      id: 'x', findingId: 'f', version: 1, type: 'CAPACITY', impactCategory: '', baselinePeriod: '', overlapKey: null, measurementPlan: '', history: [],
      variables: [
        { key: 'tasksPerMonth', label: '', unit: '', low: 100, base: 100, high: 100, quality: 'MEASURED', source: '' },
        { key: 'minutesSavedPerTask', label: '', unit: '', low: 6, base: 6, high: 6, quality: 'MEASURED', source: '' },
        { key: 'realizedSavings', label: '', unit: '', low: 100, base: 100, high: 100, quality: 'MEASURED', source: 'payroll record' },
        { key: 'upfrontDirectCosts', label: '', unit: '', low: 600, base: 600, high: 600, quality: 'SOURCED', source: '' },
        { key: 'ongoingMonthlyCosts', label: '', unit: '', low: 15, base: 15, high: 15, quality: 'SOURCED', source: '' },
      ],
    };
    const r = compute(m, 'base', 12);
    expect(r.hoursPerMonth).toBe(10);
    expect(r.capacityValuePerMonth).toBeNull(); // no hourly cost given → no invented value
    expect(r.realizedCostSavingsPerMonth).toBe(100);
    expect(r.netMonthlyCashBenefit).toBe(85);
    expect(r.paybackMonths).toBeCloseTo(600 / 85, 5);
    expect(r.roiPct).toBeCloseTo(((1200 - (600 + 180)) / (600 + 180)) * 100, 5); // costs = upfront + 12 × running
    // no cash costs at all → no ROI, no divide-by-zero
    const free = clone(m); free.variables = free.variables.filter((v) => !['upfrontDirectCosts', 'ongoingMonthlyCosts'].includes(v.key));
    const r2 = compute(free);
    expect(r2.roiPct).toBeNull(); expect(r2.paybackMonths).toBeNull();
    expect(Number.isNaN(r2.netMonthlyCashBenefit)).toBe(false);
  });

  it('a missing baseline stops the number and says what is missing instead of guessing', () => {
    const empty: OpportunityModel = { id: 'e', findingId: 'f', version: 1, type: 'CAPACITY', impactCategory: '', baselinePeriod: '', overlapKey: null, measurementPlan: '', history: [], variables: [] };
    const r = compute(empty);
    expect(r.hoursPerMonth).toBeNull();
    expect(r.missing.join(' ')).toMatch(/How many times the task happens/);
    expect(r.lines).toHaveLength(0);
    expect(confidenceOf(empty)).toBe('LOW');
  });

  it('confidence follows evidence quality: guesses are low, measured data is high', async () => {
    const { m } = await model();
    expect(['LOW', 'MEDIUM_LOW']).toContain(confidenceOf(m));
    const measured = clone(m); measured.variables.forEach((v) => (v.quality = 'MEASURED'));
    expect(confidenceOf(measured)).toBe('HIGH');
  });

  it('two ideas that improve the same output are never added together', () => {
    const r = combineBenefits([
      { id: 'A', monthlyBenefit: 300, overlapKey: 'listing-prep-time' },
      { id: 'B', monthlyBenefit: 200, overlapKey: 'listing-prep-time' },
      { id: 'C', monthlyBenefit: 50, overlapKey: null },
      { id: 'D', monthlyBenefit: null, overlapKey: null },
    ]);
    expect(r.total).toBe(350);
    expect(r.counted.sort()).toEqual(['A', 'C']);
    expect(r.excluded.find((x) => x.id === 'B')!.reason).toMatch(/Overlaps with A/);
    expect(r.excluded.find((x) => x.id === 'D')!.reason).toMatch(/No number/);
  });

  it('blocks money and strategy words from worker-facing text', () => {
    expect(findOwnerOnlyTerms('Run the helper on 5 products.')).toEqual([]);
    expect(findOwnerOnlyTerms('This could add $333 a month')).toContain('a money amount');
    expect(findOwnerOnlyTerms('Expected ROI and profit margin')).toEqual(expect.arrayContaining(['“roi”', '“profit”', '“margin”']));
    expect(findOwnerOnlyTerms('Wages and payroll savings')).toEqual(expect.arrayContaining(['“payroll”', '“savings”']));
  });

  it('old public pages are not presented as new changes; dates are kept', () => {
    const retrieved = '2026-10-17T12:00:00.000Z';
    expect(classifyWebSource({ publishedAt: '2026-03-02T10:00:00Z', retrievedAt: retrieved }).label).toBe('OLD_NOT_NEW');
    expect(classifyWebSource({ publishedAt: '2026-10-09T10:00:00Z', retrievedAt: retrieved }).label).toBe('NEW');
    expect(classifyWebSource({ publishedAt: '2026-10-09T10:00:00Z', effectiveDate: '2026-11-15T00:00:00Z', retrievedAt: retrieved }).label).toBe('EFFECTIVE_LATER');
    expect(classifyWebSource({ retrievedAt: retrieved }).label).toBe('DATE_UNKNOWN');
  });
});
void key;
