import type { ModelVar, OpportunityModel } from '../domain/types';

export type Scenario = 'low' | 'base' | 'high';

export interface CalcLine { label: string; formula: string; inputs: string; result: string }
export interface CalcResult {
  scenario: Scenario;
  /** null means "cannot be calculated from the data we have". We never invent a number. */
  hoursPerMonth: number | null;
  capacityValuePerMonth: number | null; // theoretical, NOT cash savings
  incrementalOrdersPerMonth: number | null;
  incrementalRevenuePerMonth: number | null;
  contributionProfitPerMonth: number | null;
  realizedCostSavingsPerMonth: number | null;
  netMonthlyCashBenefit: number | null;
  upfrontCashCost: number;
  implementationLaborValue: number | null; // worker time, not money leaving the business
  roiPct: number | null;
  paybackMonths: number | null;
  missing: string[];
  notes: string[];
  lines: CalcLine[];
}

const money = (n: number) => `$${n.toLocaleString('en-US', { maximumFractionDigits: 2, minimumFractionDigits: n % 1 ? 2 : 0 })}`;
const num = (n: number) => (Math.round(n * 100) / 100).toString();

export function v(model: OpportunityModel, key: string, sc: Scenario): number | null {
  const x = model.variables.find((a) => a.key === key);
  if (!x) return null;
  const val = x[sc] ?? x.base;
  return val === undefined ? null : val;
}
export function varOf(model: OpportunityModel, key: string): ModelVar | undefined { return model.variables.find((a) => a.key === key); }

/**
 * Deterministic math from stored inputs. The language model never does arithmetic.
 * Revenue is not profit. Freed time is not cash. Missing inputs stop a number instead of guessing it.
 */
export function compute(model: OpportunityModel, sc: Scenario = 'base', horizonMonths = 12): CalcResult {
  const lines: CalcLine[] = [];
  const missing: string[] = [];
  const notes: string[] = [];
  const r: CalcResult = {
    scenario: sc, hoursPerMonth: null, capacityValuePerMonth: null, incrementalOrdersPerMonth: null, incrementalRevenuePerMonth: null, contributionProfitPerMonth: null,
    realizedCostSavingsPerMonth: null, netMonthlyCashBenefit: null, upfrontCashCost: 0, implementationLaborValue: null, roiPct: null, paybackMonths: null, missing, notes, lines,
  };
  const get = (k: string, label: string, required = false): number | null => {
    const x = v(model, k, sc);
    if (x === null && required) missing.push(label);
    return x;
  };

  if (model.type === 'CAPACITY') {
    const tasks = get('tasksPerMonth', 'How many times the task happens each month', true);
    const mins = get('minutesSavedPerTask', 'Minutes saved each time', true);
    if (tasks !== null && mins !== null) {
      r.hoursPerMonth = (tasks * mins) / 60;
      lines.push({ label: 'Time freed each month', formula: 'tasks per month × minutes saved ÷ 60', inputs: `${num(tasks)} × ${num(mins)} ÷ 60`, result: `${num(r.hoursPerMonth)} hours` });
    }
    const wage = get('loadedHourlyCost', 'Cost of one hour of work (wages and extras)');
    if (r.hoursPerMonth !== null && wage !== null) {
      r.capacityValuePerMonth = r.hoursPerMonth * wage;
      lines.push({ label: 'Value of that freed time', formula: 'hours freed × cost of one hour', inputs: `${num(r.hoursPerMonth)} × ${money(wage)}`, result: `${money(r.capacityValuePerMonth)} per month` });
      notes.push('Capacity freed, not cash savings. It only becomes savings if paid hours really go down or the time makes more output.');
    }
    const real = varOf(model, 'realizedSavings');
    if (real && (real.quality === 'MEASURED' || real.quality === 'SOURCED') && v(model, 'realizedSavings', sc) !== null) {
      r.realizedCostSavingsPerMonth = v(model, 'realizedSavings', sc);
      lines.push({ label: 'Cash savings (verified)', formula: 'expense actually removed, from payroll or vendor records', inputs: `${money(r.realizedCostSavingsPerMonth!)}`, result: `${money(r.realizedCostSavingsPerMonth!)} per month` });
    } else {
      notes.push('No verified cash savings yet.');
    }
  } else {
    const sessions = get('incrementalSessions', 'Extra shoppers per month who could see it');
    const conv = get('conversionRate', 'Share of shoppers who buy (as a decimal, like 0.02)');
    const directOrders = get('incrementalOrders', '');
    if (directOrders !== null) r.incrementalOrdersPerMonth = directOrders;
    else if (sessions !== null && conv !== null) {
      r.incrementalOrdersPerMonth = sessions * conv;
      lines.push({ label: 'Extra orders each month', formula: 'extra shoppers × share who buy', inputs: `${num(sessions)} × ${num(conv)}`, result: `${num(r.incrementalOrdersPerMonth)} orders` });
    } else missing.push('Extra shoppers and how many buy (or a measured number of extra orders)');
    const aov = get('averageOrderValue', 'Average order amount', true);
    if (r.incrementalOrdersPerMonth !== null && aov !== null) {
      r.incrementalRevenuePerMonth = r.incrementalOrdersPerMonth * aov;
      lines.push({ label: 'Extra revenue each month', formula: 'extra orders × average order amount', inputs: `${num(r.incrementalOrdersPerMonth)} × ${money(aov)}`, result: `${money(r.incrementalRevenuePerMonth)} per month` });
    }
    const margin = get('contributionMarginPct', '');
    if (r.incrementalRevenuePerMonth !== null && margin !== null) {
      const varCosts = get('variableCostsNotInMargin', '') ?? 0;
      const opCosts = get('operatingCostsPerMonth', '') ?? 0;
      r.contributionProfitPerMonth = r.incrementalRevenuePerMonth * margin - varCosts - opCosts;
      lines.push({ label: 'Extra profit each month', formula: 'extra revenue × margin − other variable costs − running costs', inputs: `${money(r.incrementalRevenuePerMonth)} × ${num(margin)} − ${money(varCosts)} − ${money(opCosts)}`, result: `${money(r.contributionProfitPerMonth)} per month` });
    } else if (r.incrementalRevenuePerMonth !== null) {
      notes.push('Revenue scenario only — profit not calculated. We need the profit margin for these products.');
      missing.push('Profit margin for these products');
    }
  }

  // Costs: cash that leaves the business is kept apart from worker time.
  const upfront = get('upfrontDirectCosts', '') ?? 0;
  const ongoing = get('ongoingMonthlyCosts', '') ?? 0;
  r.upfrontCashCost = upfront;
  const implHours = get('implementationHours', '');
  const wage2 = get('loadedHourlyCost', '');
  if (implHours !== null && wage2 !== null) {
    r.implementationLaborValue = implHours * wage2;
    lines.push({ label: 'Worker time to build it', formula: 'hours to build × cost of one hour', inputs: `${num(implHours)} × ${money(wage2)}`, result: `${money(r.implementationLaborValue)} of worker time (not cash out the door)` });
  }

  // Monthly cash benefit counts only things that are really money, with no double counting.
  const benefits = [r.contributionProfitPerMonth, r.realizedCostSavingsPerMonth].filter((x): x is number => x !== null);
  if (benefits.length) {
    r.netMonthlyCashBenefit = benefits.reduce((a, b) => a + b, 0) - ongoing;
    lines.push({ label: 'Net cash benefit each month', formula: 'extra profit + verified cash savings − running costs', inputs: `${benefits.map(money).join(' + ')} − ${money(ongoing)}`, result: `${money(r.netMonthlyCashBenefit)} per month` });
  } else {
    notes.push('No cash benefit can be calculated yet, so there is no return number.');
  }

  const totalCosts = upfront + ongoing * horizonMonths;
  if (r.netMonthlyCashBenefit !== null && totalCosts > 0) {
    const grossBenefit = (r.netMonthlyCashBenefit + ongoing) * horizonMonths;
    r.roiPct = ((grossBenefit - totalCosts) / totalCosts) * 100;
    lines.push({ label: `Return over ${horizonMonths} months`, formula: '(benefits − costs) ÷ costs', inputs: `(${money(grossBenefit)} − ${money(totalCosts)}) ÷ ${money(totalCosts)}`, result: `${num(r.roiPct)}%` });
  } else if (r.netMonthlyCashBenefit !== null) {
    notes.push('Return is not shown: there are no cash costs to compare against.');
  }
  if (r.netMonthlyCashBenefit !== null && r.netMonthlyCashBenefit > 0 && upfront > 0) {
    r.paybackMonths = upfront / r.netMonthlyCashBenefit;
    lines.push({ label: 'Months to pay back', formula: 'up-front cash cost ÷ net cash benefit each month', inputs: `${money(upfront)} ÷ ${money(r.netMonthlyCashBenefit)}`, result: `${num(r.paybackMonths)} months` });
  }
  return r;
}

/** Evidence-quality summary so the owner sees which numbers are measured and which are guesses. */
export function confidenceOf(model: OpportunityModel): 'LOW' | 'MEDIUM_LOW' | 'MEDIUM' | 'HIGH' {
  const used = model.variables.filter((x) => x.base !== null);
  if (!used.length) return 'LOW';
  const guessed = used.filter((x) => x.quality === 'ASSUMPTION' || x.quality === 'HYPOTHESIS').length;
  const share = guessed / used.length;
  return share >= 0.8 ? 'LOW' : share >= 0.5 ? 'MEDIUM_LOW' : share > 0.2 ? 'MEDIUM' : 'HIGH';
}

/**
 * Two ideas that improve the same output must not be added together.
 * Within one overlap group only the largest monthly benefit is counted.
 */
export function combineBenefits(items: { id: string; monthlyBenefit: number | null; overlapKey: string | null }[]): { total: number; counted: string[]; excluded: { id: string; reason: string }[] } {
  const counted: string[] = []; const excluded: { id: string; reason: string }[] = []; let total = 0;
  const groups = new Map<string, typeof items>();
  for (const it of items) {
    if (it.monthlyBenefit === null) { excluded.push({ id: it.id, reason: 'No number can be calculated yet.' }); continue; }
    if (!it.overlapKey) { total += it.monthlyBenefit; counted.push(it.id); continue; }
    groups.set(it.overlapKey, [...(groups.get(it.overlapKey) ?? []), it]);
  }
  for (const [key, g] of groups) {
    const best = [...g].sort((a, b) => (b.monthlyBenefit ?? 0) - (a.monthlyBenefit ?? 0))[0];
    total += best.monthlyBenefit ?? 0; counted.push(best.id);
    for (const o of g) if (o !== best) excluded.push({ id: o.id, reason: `Overlaps with ${best.id} (same ${key}). Only the larger benefit is counted.` });
  }
  return { total, counted, excluded };
}

/** Text that is safe to show a worker. Blocks money details so owner strategy cannot leak into the brief. */
export function findOwnerOnlyTerms(text: string): string[] {
  const hits: string[] = [];
  if (/[$€£]\s?\d|\d\s?(dollars|usd)\b/i.test(text)) hits.push('a money amount');
  for (const w of ['roi', 'profit', 'margin', 'revenue', 'payback', 'payroll', 'savings', 'contribution', 'loaded wage', 'hourly cost']) {
    if (new RegExp(`\\b${w}\\b`, 'i').test(text)) hits.push(`“${w}”`);
  }
  return hits;
}

/** Public web items: say whether something is really new before it is called a change. */
export function classifyWebSource(s: { publishedAt?: string; effectiveDate?: string; retrievedAt: string }, staleDays = 45): { label: 'NEW' | 'OLD_NOT_NEW' | 'EFFECTIVE_LATER' | 'DATE_UNKNOWN'; text: string } {
  if (!s.publishedAt) return { label: 'DATE_UNKNOWN', text: 'No publication date found. Treat as unconfirmed.' };
  const ageDays = (new Date(s.retrievedAt).getTime() - new Date(s.publishedAt).getTime()) / 86400000;
  if (ageDays > staleDays) return { label: 'OLD_NOT_NEW', text: `Published ${Math.round(ageDays)} days before we found it. This is probably not a new change.` };
  if (s.effectiveDate && s.effectiveDate > s.retrievedAt) return { label: 'EFFECTIVE_LATER', text: 'It was published recently but starts later. It does not apply yet.' };
  return { label: 'NEW', text: 'Published recently.' };
}
