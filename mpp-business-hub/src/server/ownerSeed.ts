import type { BusinessGoal, FindingEvidence, IntelligenceSource, OpportunityModel, OwnerFinding, PlanStepDraft } from '../domain/types';
import { chicagoToUtc } from '../domain/time';

// SYNTHETIC. Owner-only. Nothing in this file is ever shown to an employee.
const T = (day: string, hhmm: string) => chicagoToUtc(day, hhmm);
export const OWNER_SECRET_MARKER = 'OWNER-ONLY-NOTE-7731';

const ev = (id: string, o: Partial<FindingEvidence> & Pick<FindingEvidence, 'label' | 'sourceType' | 'sourceName' | 'observedAt' | 'quality'>): FindingEvidence => ({ id, url: null, ...o });

export function ownerSeed(): { findings: OwnerFinding[]; models: OpportunityModel[]; goals: BusinessGoal[]; sources: IntelligenceSource[] } {
  const now = T('2026-10-16', '15:00');
  const base = { discoveredAt: T('2026-10-16', '09:00'), lastEvidenceAt: T('2026-10-16', '14:55'), analyzedAt: now, occurrences: [] as OwnerFinding['occurrences'], decisions: [] as OwnerFinding['decisions'], linkedProjectId: null, approvedProjectId: null, seenByOwner: false, goalIds: [] as string[], ownerNotes: '', followUpAt: undefined };

  const step = (title: string, instructions: string, whyForGoal: string, deliverable: string, tools: string[], evidenceDescription: string, estimateHours?: number): PlanStepDraft => ({ title, instructions, whyForGoal, deliverable, tools, evidenceDescription, estimateHours });
  const plan = {
    title: 'Faster Shopify listing prep',
    employeeObjective: 'Build a small helper that fills in the repeated parts of Shopify listing prep, so listings are prepared the same way every time and with fewer mistakes.',
    deliverables: ['A tested helper script', 'A short how-to written into the listing SOP'],
    steps: [
      step('Look at how listing prep is done today', 'Watch or walk through one listing from start to finish. Write down each manual step and where it happens.', 'So the helper matches the real steps.', 'A list of the manual steps and where each one happens', ['Shopify admin', '“SEO Master” sheet'], 'The list is saved in the project folder', 1),
      step('List the fields and where each one comes from', 'For each field in a Shopify listing, note which column or file supplies it.', 'So nothing is typed by hand twice.', 'A field-by-field table', ['“SEO Master” sheet'], 'The table is saved in the project folder', 1),
      step('Prepare a test sheet and images', 'Pick 5 products. Put their rows and images in a new test sheet.', 'A small test finds problems cheaply.', 'A test sheet with 5 rows', ['Google Sheets', 'Image folder'], 'The sheet shows 5 rows with images', 1),
      step('Run the helper on the 5 test products', 'Run the helper on the test sheet only. Do not run it on anything else.', 'To see if it works before using it widely.', 'Five test drafts in Shopify', ['“MPP Shopify Lister” script'], 'Five drafts exist in Shopify', 2),
      step('Check the test results in Shopify', 'Open each draft. Check title, price, options and images.', 'To confirm the results are right.', 'A list of what was right and wrong', ['Shopify admin'], 'The list is added to the step notes', 1),
      step('Fix errors and test again if needed', 'Fix anything that was wrong. Repeat the small test.', 'So the full run starts clean.', 'A second small test with no errors', ['“MPP Shopify Lister” script'], 'The second test shows no errors', 3),
      step('Run the full batch (only after Dalia approves)', 'Wait for Dalia to approve the full batch. Then run the helper on the full sheet.', 'Everything uses the same tested method.', 'Drafts for all products', ['“MPP Shopify Lister” script'], 'Drafts exist for every row', 2),
      step('Check the live results', 'Check that listings are live and correct in Shopify.', 'A finished upload is not proof the listing is correct.', 'A check of the live listings', ['Shopify admin'], 'Each listing was opened and checked', 2),
      step('Update the listing SOP', 'Write how to use the helper into the listing SOP.', 'So everyone can use it.', 'An updated SOP', ['Listing SOP'], 'The SOP shows the new section', 1),
    ],
    suggestedAssignees: [{ uid: 'u-erika', caveat: 'Knows the Shopify Lister script. Already has P-012 and P-070 open.' }, { uid: 'u-arantza', caveat: 'Strong with SOPs. Less experience with the script.' }],
    risks: ['The helper could create wrong listings if the sheet has mistakes. The small test is there to catch that.'],
  };

  const findings: OwnerFinding[] = [
    {
      ...base, id: 'af-1', code: 'AF-001', kind: 'Automation idea', area: 'Shopify', title: 'Repeated manual Shopify listing prep',
      summary: 'The same listing-prep clicks are repeated for many products. A small helper could remove a lot of repeat work. It is not urgent, but it looks worth doing before the next large batch.',
      urgency: 'NORMAL', factLabel: 'LIKELY_INFERENCE', status: 'NEW', projectMatch: { type: 'POSSIBLE_DUPLICATE', projectKey: 'P-070' }, modelId: 'om-1', dedupeKey: 'shopify-listing-prep', plan,
      recommendedAction: 'Approve as a project, start with a small test, and time one real listing first.',
      uncertainties: ['The number of repeats per month is a guess until someone times it.', 'It may overlap with P-070 (listing automation).'],
      evidence: [
        ev('e1', { label: '“Make 1 draft” was clicked many times this week', sourceType: 'MT_LOG', sourceName: 'MT Log — ERIKAPC (made-up sample)', observedAt: T('2026-10-16', '14:55'), quality: 'MEASURED', excerpt: 'Repeated clicks on the same Shopify action during listing work.' }),
        ev('e2', { label: 'Listing prep steps are described in the project plan', sourceType: 'PROJECT_RECORD', sourceName: 'P-012 Step 3 instructions', observedAt: T('2026-10-16', '09:00'), quality: 'SOURCED' }),
        ev('e3', { label: 'Time saved per listing has not been measured', sourceType: 'OWNER_INPUT', sourceName: 'Assumption from the owner', observedAt: T('2026-10-16', '09:00'), quality: 'ASSUMPTION' }),
      ],
      ownerNotes: `${OWNER_SECRET_MARKER} Considering margin target of 42% for the fall range. Do not share.`,
    },
    {
      ...base, id: 'af-2', code: 'AF-002', kind: 'Open follow-up', area: 'Amazon', title: 'Variation move for “FBA_TY001” may not be finished',
      summary: 'Two upload numbers were seen. The first said “Action required”. A second upload number appeared later. We do not know if the move to “PC107” worked. This is already covered by P-081.',
      urgency: 'NORMAL', factLabel: 'LIKELY_INFERENCE', status: 'NEW', projectMatch: { type: 'ALREADY_COVERED', projectKey: 'P-081' }, modelId: null, dedupeKey: 'fba-ty001-move', plan: null,
      recommendedAction: 'Link to P-081 and ask Erika for an update. The result is not checked yet.',
      uncertainties: ['No Amazon report for the second upload number has been seen.', 'We cannot tell who was at the computer.'],
      evidence: [
        ev('e1', { label: 'First upload number 99104020742 ended with “Action required”', sourceType: 'MT_LOG', sourceName: 'MT Log — ERIKAPC (made-up sample)', observedAt: T('2026-10-16', '15:09'), quality: 'MEASURED' }),
        ev('e2', { label: 'A different upload number 99105020742 appeared later', sourceType: 'MT_LOG', sourceName: 'MT Log — ERIKAPC (made-up sample)', observedAt: T('2026-10-16', '15:31'), quality: 'MEASURED' }),
      ],
    },
    {
      ...base, id: 'af-3', code: 'AF-003', kind: 'Quality risk', area: 'Production', title: 'Printer “PRN-C” was low on toner for over an hour on Wednesday',
      summary: 'One toner problem on “PRN-C” lasted 65 minutes. The printer repeated its message many times, but it was one problem. Checking toner levels before a shift could prevent a repeat.',
      urgency: 'NORMAL', factLabel: 'CONFIRMED_SOURCE_FACT', status: 'NEW', projectMatch: { type: 'CANDIDATE_NEW' }, modelId: null, dedupeKey: 'prn-c-toner', plan: null,
      recommendedAction: 'Add a toner check to the start-of-shift list. Review in the weekly printing page.',
      uncertainties: ['We do not know if toner was replaced during the 65 minutes.'],
      evidence: [ev('e1', { label: 'One “toner” problem from 1:05 PM to 2:10 PM Wednesday', sourceType: 'PRINT_LOG', sourceName: 'Print log (made-up sample)', observedAt: T('2026-10-14', '14:10'), quality: 'MEASURED' })],
    },
    {
      ...base, id: 'af-4', code: 'AF-004', kind: 'Compliance/policy change', area: 'Amazon', title: 'A marketplace page about listing rules was updated',
      summary: 'A seller-rules page changed. It starts on Nov 15. We have not checked whether it applies to MPP listings.',
      urgency: 'STRATEGIC', factLabel: 'LIKELY_INFERENCE', status: 'NEW', projectMatch: { type: 'UNASSIGNED_INSIGHT' }, modelId: null, dedupeKey: 'policy-listing-rules', plan: null,
      recommendedAction: 'Investigate more before deciding. Do not assume it applies to any MPP listing yet.',
      uncertainties: ['We have not matched the rule to MPP listings.'],
      evidence: [ev('e1', { label: 'Seller rules page (example, simulated source)', sourceType: 'WEB', sourceName: 'Example marketplace seller help (simulated)', url: 'https://example.com/seller-rules-update', publishedAt: T('2026-10-09', '10:00'), effectiveDate: T('2026-11-15', '00:00'), retrievedAt: T('2026-10-16', '08:00'), observedAt: T('2026-10-16', '08:00'), quality: 'SOURCED', excerpt: 'Simulated excerpt: listing titles must follow the updated format starting Nov 15.' })],
    },
    {
      ...base, id: 'af-5', code: 'AF-005', kind: 'Revenue opportunity', area: 'Etsy', title: 'Add seasonal search words to the top listings',
      summary: 'Adding seasonal words to the best-selling listings could bring more shoppers. We do not have profit numbers for these products, so only a revenue guess is shown.',
      urgency: 'STRATEGIC', factLabel: 'HYPOTHESIS', status: 'NEW', projectMatch: { type: 'CANDIDATE_NEW' }, modelId: 'om-2', dedupeKey: 'seasonal-keywords', plan: null,
      recommendedAction: 'Request more evidence: add the profit margin and last year’s seasonal traffic first.',
      uncertainties: ['How many more shoppers this brings is a hypothesis.', 'Profit margin is missing.'],
      evidence: [ev('e1', { label: 'Seasonal traffic estimate', sourceType: 'OWNER_INPUT', sourceName: 'Assumption from the owner', observedAt: T('2026-10-16', '09:30'), quality: 'HYPOTHESIS' })],
    },
    {
      ...base, id: 'af-6', code: 'AF-006', kind: 'Documentation gap', area: 'Documentation', title: 'The “MPP Shopify Lister” script is used but its code is not linked',
      summary: 'The script is used for listing work, but its code and version are not linked in the app. We cannot say what it does or how a run ended.',
      urgency: 'NORMAL', factLabel: 'CONFIRMED_SOURCE_FACT', status: 'NEW', projectMatch: { type: 'NONE' }, modelId: null, dedupeKey: 'lister-source-missing', plan: null,
      recommendedAction: 'Link the script source and note its version.',
      uncertainties: [],
      evidence: [ev('e1', { label: 'Script is used in P-012 Step 3, but “code is not linked”', sourceType: 'PROJECT_RECORD', sourceName: 'File library', observedAt: T('2026-10-16', '14:55'), quality: 'MEASURED' })],
    },
  ];

  const mv = (key: string, label: string, unit: string, low: number | null, base: number | null, high: number | null, quality: OpportunityModel['variables'][0]['quality'], source: string) => ({ key, label, unit, low, base, high, quality, source, retrievedAt: T('2026-10-16', '09:00') });
  const models: OpportunityModel[] = [
    {
      id: 'om-1', findingId: 'af-1', version: 1, type: 'CAPACITY', impactCategory: 'Released worker capacity (not cash savings)', baselinePeriod: 'Estimate. No timed baseline yet.', overlapKey: 'listing-prep-time',
      variables: [
        mv('tasksPerMonth', 'Times the task happens each month', 'tasks', 150, 200, 250, 'ASSUMPTION', 'Owner estimate. Check against real listing counts.'),
        mv('minutesSavedPerTask', 'Minutes saved each time', 'minutes', 3, 5, 7, 'ASSUMPTION', 'Guess until someone times one real listing.'),
        mv('loadedHourlyCost', 'Cost of one hour of work (wages and extras)', '$ per hour', 20, 20, 20, 'ASSUMPTION', 'Example value entered by the owner.'),
        mv('implementationHours', 'Hours to build it', 'hours', 16, 12, 8, 'ASSUMPTION', 'Plan estimate.'),
        mv('ongoingMonthlyCosts', 'Running cost (tools, fees)', '$ per month', 15, 15, 15, 'ASSUMPTION', 'Example API fee.'),
      ],
      measurementPlan: 'Time 10 real listings before and 10 after. Compare minutes per listing. Check that errors did not go up.',
      history: [{ version: 1, at: now, changed: 'Created from the scan.' }],
    },
    {
      id: 'om-2', findingId: 'af-5', version: 1, type: 'REVENUE', impactCategory: 'Extra revenue (profit not known)', baselinePeriod: 'Last 30 days, top 10 listings (not yet loaded).', overlapKey: null,
      variables: [
        mv('incrementalSessions', 'Extra shoppers per month who could see it', 'shoppers', 200, 500, 900, 'HYPOTHESIS', 'AI hypothesis. No traffic data connected.'),
        mv('conversionRate', 'Share of shoppers who buy', 'decimal', 0.01, 0.02, 0.03, 'ASSUMPTION', 'Example value.'),
        mv('averageOrderValue', 'Average order amount', '$', 28, 32, 36, 'ASSUMPTION', 'Example value.'),
      ],
      measurementPlan: 'Compare orders and views on the 10 listings for 28 days before and after. Note ads and holidays.',
      history: [{ version: 1, at: now, changed: 'Created from the scan.' }],
    },
  ];

  const goalTitles: [string, string, BusinessGoal['priority']][] = [
    ['Grow profitable revenue', 'Find ways to earn more profit, not just more sales, across Amazon, Etsy and Shopify.', 'HIGH'],
    ['Prevent listing mistakes', 'Catch failed uploads, wrong variations, stale search words and unpublished drafts.', 'HIGH'],
    ['Reduce repeated work', 'Find repeated tasks that a script, SOP or checklist could handle. Keep freed time separate from cash savings.', 'NORMAL'],
    ['Improve printing flow', 'Use print logs to find slow spots. Compare people only on the same kind of work.', 'NORMAL'],
    ['Catch missed deadlines and follow-ups', 'Find unanswered requests, stuck projects and forgotten follow-ups.', 'NORMAL'],
    ['Keep documents current', 'Find old SOPs, missing script links and unclear file locations.', 'LOW'],
    ['Watch marketplace rule changes', 'Look at official public pages for rule or fee changes. Always show the date and source.', 'NORMAL'],
    ['Support the team', 'Spot training needs and unclear instructions. Never judge anyone from computer idle time.', 'NORMAL'],
  ];
  const goals: BusinessGoal[] = goalTitles.map(([title, description, priority], i) => ({ id: `g-${i + 1}`, title, description, priority, enabled: true, area: 'All', createdAt: now }));

  const sources: IntelligenceSource[] = [
    { id: 'src-1', name: 'MT Log hourly files', type: 'Computer activity', allowed: 'Company PCs, work apps only', sensitivity: 'TEAM', demoEnabled: true, health: 'OK', lastCheckedAt: now, note: 'Made-up sample files.', cadence: 'About every 5 minutes' },
    { id: 'src-2', name: 'Project trackers (Google Sheets)', type: 'Tracker', allowed: 'Team tracker; private tracker kept apart', sensitivity: 'OWNER_ONLY', demoEnabled: false, health: 'NOT_CONNECTED', lastCheckedAt: null, note: 'Not connected. Needs your OK.', cadence: 'Daily (later)' },
    { id: 'src-3', name: 'Google Drive project folders', type: 'Files', allowed: 'Only the folders you approve', sensitivity: 'TEAM', demoEnabled: false, health: 'NOT_CONNECTED', lastCheckedAt: null, note: 'Pretend folders only.', cadence: 'When files change (later)' },
    { id: 'src-4', name: 'Print logs', type: 'Production', allowed: 'Printer job logs', sensitivity: 'TEAM', demoEnabled: true, health: 'GAP', lastCheckedAt: now, note: 'One logger has a data gap on Wednesday.', cadence: 'Daily' },
    { id: 'src-5', name: 'Amazon, Etsy, Shopify (read-only)', type: 'Marketplaces', allowed: 'Listings, orders, fees (read-only)', sensitivity: 'OWNER_ONLY', demoEnabled: false, health: 'NOT_CONNECTED', lastCheckedAt: null, note: 'Not connected. Pretend checks only.', cadence: 'Daily (later)' },
    { id: 'src-6', name: 'Official public pages', type: 'Web research', allowed: 'Marketplace help and policy pages', sensitivity: 'PUBLIC', demoEnabled: false, health: 'NOT_CONNECTED', lastCheckedAt: null, note: 'Simulated only in this practice copy.', cadence: 'Weekly (later)' },
  ];
  return { findings, models, goals, sources };
}
