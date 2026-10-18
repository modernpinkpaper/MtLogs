import type { BusinessGoal, IntelligenceSource } from './types';

// The investigation catalog. It lists what the AI Manager COULD look at. Nothing here is connected.
// Source of truth for the wording: "MPP AI Manager — Investigation Sources & Project Ideas".
// The owner can edit every field in the app. New sources and goals can be added without code.

export interface CatalogSource {
  id: string; name: string; type: string; tier: 'A' | 'B' | 'C'; sensitivity: IntelligenceSource['sensitivity']; visibility: 'OWNER_ONLY' | 'WORKER_SAFE';
  purpose: string; reads: string; excluded: string; retention: string; cadence: string; cost: string; safety: string;
  examples: string[]; priority: 'HIGH' | 'NORMAL' | 'LOW'; missing: string;
}

export const SOURCE_CATALOG: CatalogSource[] = [
  { id: 'A1', name: 'Project tracker, statuses and commitments', type: 'Tracker', tier: 'A', sensitivity: 'OWNER_ONLY', visibility: 'OWNER_ONLY',
    purpose: 'Find stale, blocked, overdue or forgotten work, and gaps between a status and its evidence.',
    reads: 'Project, step and sub-step titles, status history, priorities, due dates, dependencies, blockers, update requests and answers, pause reasons, resume dates, pilot sizes and approval gates.',
    excluded: 'Owner-private projects unless you include them. Anything you mark private.', retention: 'Kept while the project is open, then summaries only.', cadence: 'Daily', cost: 'Very low. No AI cost for the plain checks.',
    safety: '“Not started” is not proof of no activity when computer logs are incomplete. The AI never changes a status. A paused pilot never grows without your approval.',
    examples: ['Which projects have no clear next step?', 'Which deadlines are likely to slip?', 'Is any paused test still being worked on?'], priority: 'HIGH',
    missing: 'Needs a read-only copy of the tracker (a Google Sheet export or a connector you approve).' },
  { id: 'A2', name: 'MT Log computer activity', type: 'Computer activity', tier: 'A', sensitivity: 'TEAM', visibility: 'OWNER_ONLY',
    purpose: 'Spot repeated manual work, work with no matching step, repeated errors and process differences.',
    reads: 'Hourly computer activity files: times, apps, websites you allow, file events, and automation start/finish/fail events only if they are confirmed to work.',
    excluded: 'Typed text, passwords, private messages, anything the logger marks sensitive.', retention: 'Raw files 90 days. Business summaries about 5 years.', cadence: 'About every hour', cost: 'Low for counts. Some AI cost for pattern reading.',
    safety: 'Logs can arrive late and have gaps. “Idle” is not a verdict on a person. Physical work is invisible. Never guess motives or conversation content.',
    examples: ['Where is the same manual work repeated?', 'Which step is the team working on that the tracker does not show?'], priority: 'HIGH',
    missing: 'Needs the hourly log files in a place the app may read.' },
  { id: 'A3', name: 'Google Drive project files, SOPs and scripts', type: 'Files', tier: 'A', sensitivity: 'TEAM', visibility: 'OWNER_ONLY',
    purpose: 'Find missing or conflicting instructions, several “FINAL” files with no approval, broken links and checklists that could be templates.',
    reads: 'Only the folders you approve: names, versions, modified dates, links, and text of approved SOPs and checklists.',
    excluded: 'Owner-only folders and anything outside the approved folders. A shortcut never grants access.', retention: 'Metadata kept with the project.', cadence: 'When files change (daily check)', cost: 'Low to medium.',
    safety: 'A file name does not prove approval. Nothing is moved or changed. Original Drive permissions are respected.',
    examples: ['Which files are called FINAL but nobody approved?', 'Which steps are missing the file people actually use?'], priority: 'NORMAL',
    missing: 'Needs the list of Drive folders you approve, read-only.' },
  { id: 'A4', name: 'Print production and job quality', type: 'Production', tier: 'A', sensitivity: 'TEAM', visibility: 'OWNER_ONLY',
    purpose: 'Find printer problems, reprints, slow setups, batching chances and bottlenecks.',
    reads: 'Print jobs by printer and time, page counts, errors, cancellations, retries, printer warnings.',
    excluded: 'Customer names and document names.', retention: 'Raw 90 days. Summaries about 5 years.', cadence: 'Daily', cost: 'Low.',
    safety: 'A print job is not an order. Compare like with like. Never rank people or suggest punishment from log data.',
    examples: ['Which printer has the most problems?', 'Which job type is reprinted the most?'], priority: 'HIGH',
    missing: 'Needs print-job records from the print computers.' },
  { id: 'A5', name: 'Hub workflow quality and outcomes', type: 'Hub results', tier: 'A', sensitivity: 'OWNER_ONLY', visibility: 'OWNER_ONLY',
    purpose: 'Find unclear instructions, repeated corrections, duplicate alerts and recommendations that did not pay off.',
    reads: 'Employee answers and corrections, your decisions, finished project results, how healthy each source is.',
    excluded: 'Nothing leaves the app.', retention: 'Kept with the decision record.', cadence: 'Daily', cost: 'Very low.',
    safety: 'A correction improves the AI. One confirmation is never proof that something worked outside the app.',
    examples: ['Which review cards are corrected most often?', 'Which step instructions confuse people?'], priority: 'NORMAL',
    missing: 'Needs real use of the app first. There are no real answers to read yet.' },
  { id: 'B1', name: 'Amazon catalog, listings and account health', type: 'Marketplaces', tier: 'B', sensitivity: 'OWNER_ONLY', visibility: 'OWNER_ONLY',
    purpose: 'Check that listings, variation families and uploads really ended up live and correct.',
    reads: 'Read-only: SKUs and ASINs, parents and children, listing status, upload results, price, buyability, content.',
    excluded: 'Customer data. Anything that can change a listing.', retention: 'Summaries with the project.', cadence: 'Daily', cost: 'Medium. Real connector and AI cost.',
    safety: 'An upload attempt is not an accepted upload, and neither proves the live catalog is right. Check the final state.',
    examples: ['Did the FBA_TY001 family move finish?', 'Which listings are suppressed or not buyable?'], priority: 'HIGH',
    missing: 'Needs read-only Amazon access (API or a report export) approved by you. No credentials are in this app.' },
  { id: 'B2', name: 'Amazon sales, traffic and conversion', type: 'Marketplaces', tier: 'B', sensitivity: 'OWNER_ONLY', visibility: 'OWNER_ONLY',
    purpose: 'Find high-traffic low-sales products, declines, seasonal winners and bundle chances.',
    reads: 'Per product: units, sales, sessions, conversion, inventory context, history.', excluded: 'Customer data.', retention: 'Summaries.', cadence: 'Daily or weekly', cost: 'Medium.',
    safety: 'Check season, price, stock, ads and Buy Box before blaming anything. Correlation is not cause.',
    examples: ['Which listing gets many visits but few sales?', 'Which seasonal product lost sales this year?'], priority: 'NORMAL',
    missing: 'Needs an Amazon Business Report export or read-only API you approve.' },
  { id: 'B3', name: 'Amazon advertising', type: 'Marketplaces', tier: 'B', sensitivity: 'OWNER_ONLY', visibility: 'OWNER_ONLY',
    purpose: 'Find ad spend that does not pay off and search terms worth testing in listings.',
    reads: 'Campaign reports: spend, attributed sales, conversion, search terms, product.', excluded: 'Anything that can change a campaign.', retention: 'Summaries.', cadence: 'Weekly', cost: 'Medium.',
    safety: 'Do not say “pause ads” from a simple ad-cost percentage. Attribution is delayed and margins matter.',
    examples: ['Which campaigns spend the most with the weakest margin?'], priority: 'LOW', missing: 'Needs read-only Amazon Ads reports you approve.' },
  { id: 'B4', name: 'Inventory, FBA and fulfillment', type: 'Marketplaces', tier: 'B', sensitivity: 'OWNER_ONLY', visibility: 'OWNER_ONLY',
    purpose: 'Find stockouts before peak, stranded stock and costly fulfillment patterns.',
    reads: 'Stock by state (available, transfer, processing, inbound, reserved, unfulfillable), fees, returns reasons.', excluded: 'Customer data.', retention: 'Summaries.', cadence: 'Daily', cost: 'Medium.',
    safety: 'Do not call stock in transfer “missing”. Keep each stock state separate.',
    examples: ['Which products may run out before Christmas?'], priority: 'HIGH', missing: 'Needs read-only FBA inventory reports you approve.' },
  { id: 'B5', name: 'Etsy listings and shop performance', type: 'Marketplaces', tier: 'B', sensitivity: 'OWNER_ONLY', visibility: 'OWNER_ONLY',
    purpose: 'Find listings with interest but few orders, and designs worth a controlled test.',
    reads: 'Per listing: views, favorites, orders, revenue, ad spend, variations, reviews.', excluded: 'Customer data.', retention: 'Summaries.', cadence: 'Weekly', cost: 'Medium.',
    safety: 'Etsy reports have limits and different time windows. Say so.', examples: ['Which listings have many favorites but few orders?'], priority: 'NORMAL', missing: 'Needs read-only Etsy access you approve.' },
  { id: 'B6', name: 'Shopify storefront performance', type: 'Marketplaces', tier: 'B', sensitivity: 'OWNER_ONLY', visibility: 'OWNER_ONLY',
    purpose: 'Find popular pages that do not convert, missing cross-sells and personalization friction.',
    reads: 'Products, collections, traffic, add-to-cart and checkout rates, discounts, site search.', excluded: 'Individual customers. Aggregates only.', retention: 'Summaries.', cadence: 'Weekly', cost: 'Medium.',
    safety: 'No profiling of individual customers.', examples: ['Which product pages lose people before checkout?'], priority: 'NORMAL', missing: 'Needs read-only Shopify access you approve.' },
  { id: 'B7', name: 'Unit economics, expenses and profit', type: 'Finance', tier: 'B', sensitivity: 'OWNER_ONLY', visibility: 'OWNER_ONLY',
    purpose: 'Find products that sell well but earn little, wasteful reprints and costly repeated tasks.',
    reads: 'Costs you approve: materials, packaging, fees, shipping, ads, returns, prices, revenue, time estimates.', excluded: 'Payroll unless you add it.', retention: 'Owner only.', cadence: 'Monthly', cost: 'Low.',
    safety: 'Owner-only. Keep revenue, profit, cash savings and freed hours separate. Never invent a cost.',
    examples: ['Which best-sellers have the lowest profit per order?'], priority: 'NORMAL', missing: 'Needs the cost numbers from you. None are stored here.' },
  { id: 'B8', name: 'Seasonal demand, assortment and bundles', type: 'Research', tier: 'B', sensitivity: 'OWNER_ONLY', visibility: 'OWNER_ONLY',
    purpose: 'Find product sets, seasonal repeats and gaps in a product family.',
    reads: 'Your catalog, seasonal sales windows, margins, stock capacity, public trends and competitor listings.', excluded: 'Private competitor data.', retention: 'Owner only.', cadence: 'Monthly', cost: 'Medium.',
    safety: 'A competitor listing is a lead, not proof of their sales. Watch for brand and trademark problems.',
    examples: ['Which seasonal bundles could raise profit without extra production work?'], priority: 'LOW', missing: 'Needs catalog and sales data first (B2, B7).' },
  { id: 'B9', name: 'Public marketplace policies, fees and tools', type: 'Web research', tier: 'B', sensitivity: 'PUBLIC', visibility: 'WORKER_SAFE',
    purpose: 'Watch official policy and fee changes that touch personalization, variations, ads or fulfillment.',
    reads: 'Official Amazon, Etsy and Shopify help pages and release notes, with their dates and links.', excluded: 'Private accounts.', retention: 'Links and dates kept.', cadence: 'Weekly', cost: 'Low to medium.',
    safety: 'Keep official policy apart from rumor. Publication date is not the effective date.',
    examples: ['Did any marketplace change a rule that touches our listings?'], priority: 'NORMAL', missing: 'Needs a web research connector you approve. None is built into this copy.' },
  { id: 'C1', name: 'Customer service and reviews', type: 'Customer', tier: 'C', sensitivity: 'OWNER_ONLY', visibility: 'OWNER_ONLY',
    purpose: 'Find repeated confusion, damage and disputes that point to a fixable cause.',
    reads: 'Only what you approve, with customer names removed: complaint types, return reasons, review themes.', excluded: 'Names, addresses, full messages.', retention: 'De-identified summaries.', cadence: 'Weekly', cost: 'Medium.',
    safety: 'Off by default. Complaints can be unrepresentative. Customer details are never shown to staff.',
    examples: ['What do customers misunderstand about personalization?'], priority: 'LOW', missing: 'Needs your explicit opt-in and a de-identified export.' },
  { id: 'C2', name: 'Teams, email and communications', type: 'Communications', tier: 'C', sensitivity: 'OWNER_ONLY', visibility: 'OWNER_ONLY',
    purpose: 'Find unanswered requests, commitments and blockers.', reads: 'Only channels or threads you name.', excluded: 'Private messages by default.', retention: 'You set it.', cadence: 'You set it', cost: 'Medium.',
    safety: 'Off by default. Never rebuild a message from fragments and call it verified.', examples: ['Which explicit requests are still unanswered?'], priority: 'LOW', missing: 'Needs your explicit opt-in and a supported connector.' },
  { id: 'C3', name: 'Security, access and software upkeep', type: 'Security', tier: 'C', sensitivity: 'OWNER_ONLY', visibility: 'OWNER_ONLY',
    purpose: 'Find failed syncs, expired connections, overly broad access and old script versions.', reads: 'Health and expiry information only. No secrets.', excluded: 'Passwords and keys.', retention: 'Short.', cadence: 'Daily', cost: 'Low.',
    safety: 'No secret ever goes into an AI prompt. Nothing is changed or deployed automatically.', examples: ['Which connections are stale or about to expire?'], priority: 'NORMAL', missing: 'Needs connection health data from the real system.' },
];

export interface CheckDef { id: string; name: string; sourceCatalogIds: string[]; what: string; params: Record<string, { label: string; value: number }> }
/** Checks the app can really run. Each one reads only the sources listed. A goal picks checks from this list. */
export const CHECK_LIBRARY: CheckDef[] = [
  { id: 'stale-steps', name: 'Work with no recent update', sourceCatalogIds: ['A1'], what: 'Steps marked In progress with no update for a number of days.', params: { staleDays: { label: 'Days with no update', value: 7 } } },
  { id: 'overdue-projects', name: 'Projects past their deadline', sourceCatalogIds: ['A1'], what: 'Open projects whose deadline has passed and that still have steps left.', params: {} },
  { id: 'blocked-work', name: 'Blocked work', sourceCatalogIds: ['A1'], what: 'Projects with blocked steps that are not paused or canceled.', params: { minBlocked: { label: 'Blocked steps to report', value: 1 } } },
  { id: 'no-next-step', name: 'No step in motion', sourceCatalogIds: ['A1'], what: 'Open projects with steps left but nothing in progress.', params: {} },
  { id: 'paused-gate', name: 'Paused test waiting for you', sourceCatalogIds: ['A1'], what: 'A limited test that reached its target and waits for your decision.', params: {} },
  { id: 'activity-vs-tracker', name: 'Activity that the tracker does not show', sourceCatalogIds: ['A1', 'A2'], what: 'Computer activity matched to a step that is not marked started.', params: {} },
  { id: 'printer-warnings', name: 'Printers with repeated problems', sourceCatalogIds: ['A4'], what: 'Printers with several separate jam, ink or pause problems.', params: { minEpisodes: { label: 'Separate problems to report', value: 3 } } },
  { id: 'unapproved-finals', name: 'Files with no recorded approval', sourceCatalogIds: ['A3'], what: 'Files used on steps that have a newer version or a request waiting, with no recorded choice.', params: {} },
  { id: 'repeat-corrections', name: 'The same correction again and again', sourceCatalogIds: ['A5'], what: 'The same kind of correction made on several review cards.', params: { minCount: { label: 'Corrections to report', value: 3 } } },
  { id: 'unverified-outcomes', name: 'Uploads or changes with no checked result', sourceCatalogIds: ['B1'], what: 'Items in a source whose final result was never checked.', params: {} },
];

export interface CatalogGoal { id: string; sourceId: string; title: string; question: string; priority: 'HIGH' | 'NORMAL' | 'LOW'; checks: string[]; evidence: string; projects: string[]; safety: string; sample?: boolean }
export const GOAL_CATALOG: CatalogGoal[] = [
  { id: 'IG-A1a', sourceId: 'A1', title: 'Stale, blocked and late work', question: 'Which projects are stuck, late or without a next step, and what is the plain reason?', priority: 'HIGH', checks: ['stale-steps', 'overdue-projects', 'blocked-work', 'no-next-step'],
    evidence: 'Step status, dates, blockers and dependencies from the tracker.', projects: ['Unblock the product-image dependency', 'Standardize checks for FBA variation changes'], safety: 'Does not treat “not started” as proof of no activity.' },
  { id: 'IG-A1b', sourceId: 'A1', title: 'Paused tests waiting for me', question: 'Is any limited test finished and waiting for my decision?', priority: 'HIGH', checks: ['paused-gate'],
    evidence: 'The test’s checklist, results and pause reason.', projects: ['Review the 20-listing test'], safety: 'Never grows a test or resumes work by itself.' },
  { id: 'IG-A2a', sourceId: 'A2', title: 'Work the tracker does not show', question: 'Is the team working on something the tracker says has not started?', priority: 'NORMAL', checks: ['activity-vs-tracker'],
    evidence: 'Computer activity that matches a step, plus how complete the logs are.', projects: ['Update the tracker with what is really in progress'], safety: 'Activity is not proof of progress.' },
  { id: 'IG-A2b', sourceId: 'A2', title: 'Repeated manual work', question: 'Where is the same manual work done again and again, and could a script help?', priority: 'NORMAL', checks: [],
    evidence: 'Repeated sessions and app switching, with log coverage.', projects: ['Batch repeated InDesign setup', 'Link the SEO sheet prep to a documented script'], safety: 'No automatic check exists for this yet. Saved as a brief.' },
  { id: 'IG-A3a', sourceId: 'A3', title: 'Files with no approved version', question: 'Which files have several versions or a request waiting, with no recorded choice?', priority: 'NORMAL', checks: ['unapproved-finals'],
    evidence: 'File names, versions, modified dates and the recorded choice.', projects: ['Pick one SEO Master sheet', 'Update the printing SOP'], safety: 'A file name does not prove approval.' },
  { id: 'IG-A4a', sourceId: 'A4', title: 'Printer problems and reprints', question: 'Which printers have repeated problems, and which job types are reprinted?', priority: 'HIGH', checks: ['printer-warnings'],
    evidence: 'Separate problem episodes by printer, with dates and counts.', projects: ['Make a printer troubleshooting checklist', 'Fix repeated envelope alignment reprints'], safety: 'Never ranks people. Job counts are not order counts.' },
  { id: 'IG-A5a', sourceId: 'A5', title: 'Unclear instructions and repeated corrections', question: 'Which instructions confuse people, shown by repeated corrections?', priority: 'NORMAL', checks: ['repeat-corrections'],
    evidence: 'Corrections grouped by review type.', projects: ['Reword the Amazon family update step'], safety: 'About the instructions, not about people.' },
  { id: 'IG-B1a', sourceId: 'B1', title: 'Check that Amazon changes really finished', question: 'Did each upload or family move end up live and correct?', priority: 'HIGH', checks: ['unverified-outcomes'],
    evidence: 'The upload record and the final listing state. If the final state was not read, the answer is “not checked”.', projects: ['Verify the FBA_TY001 family move on PC107'], safety: 'An upload attempt is not proof.', sample: true },
  { id: 'IG-B2a', sourceId: 'B2', title: 'Visits but few sales', question: 'Which products get many visits but sell less than similar products?', priority: 'NORMAL', checks: [], evidence: 'Visits, orders, conversion, dates and the comparison set.', projects: ['Test new photos on the top viewed low-converting listing'], safety: 'Check price, stock and season first.' },
  { id: 'IG-B3a', sourceId: 'B3', title: 'Ad spend that does not pay', question: 'Which campaigns spend a lot with weak margins?', priority: 'LOW', checks: [], evidence: 'Spend, sales, margin and the measurement window.', projects: ['Audit high-spend low-margin campaigns'], safety: 'No “pause ads” advice from ad-cost alone.' },
  { id: 'IG-B4a', sourceId: 'B4', title: 'Stockouts before the holidays', question: 'Which products could run out before peak season?', priority: 'HIGH', checks: [], evidence: 'Available, inbound and sales pace by product.', projects: ['Set a reorder alert before Christmas'], safety: 'Keep stock states separate.' },
  { id: 'IG-B5a', sourceId: 'B5', title: 'Etsy interest without orders', question: 'Which Etsy listings have many favorites but few orders?', priority: 'NORMAL', checks: [], evidence: 'Views, favorites, orders by listing.', projects: ['Refresh images for high-favorite low-order listings'], safety: 'State the report limits.' },
  { id: 'IG-B6a', sourceId: 'B6', title: 'Shopify pages that lose shoppers', question: 'Which product pages lose people before checkout?', priority: 'NORMAL', checks: [], evidence: 'Page views, add-to-cart and checkout rates.', projects: ['Improve personalization instructions on product pages'], safety: 'Aggregates only.' },
  { id: 'IG-B7a', sourceId: 'B7', title: 'Best-sellers with low profit', question: 'Which products sell well but earn little after costs?', priority: 'NORMAL', checks: [], evidence: 'Your cost numbers and actual prices.', projects: ['Reprice a low-margin insert set'], safety: 'Owner only. Never invent a cost.' },
  { id: 'IG-B8a', sourceId: 'B8', title: 'Seasonal bundles', question: 'Which seasonal bundles could increase contribution profit without extra production complexity?', priority: 'LOW', checks: [], evidence: 'Sales windows, margins and capacity.', projects: ['Pilot a holiday add-on pairing'], safety: 'You approve any catalog addition.' },
  { id: 'IG-B9a', sourceId: 'B9', title: 'Policy and fee changes', question: 'Did a marketplace change a rule that touches our listings?', priority: 'NORMAL', checks: [], evidence: 'Official page, publication date, effective date and link.', projects: ['Audit variation families before the new rule date'], safety: 'Official policy only.' },
  { id: 'IG-C1a', sourceId: 'C1', title: 'Repeated customer confusion', question: 'What do customers repeatedly misunderstand or complain about?', priority: 'LOW', checks: [], evidence: 'De-identified complaint types.', projects: ['Rewrite quantity and contents information'], safety: 'Opt-in only.' },
  { id: 'IG-C3a', sourceId: 'C3', title: 'Stale connections and old scripts', question: 'Which connections are stale or about to expire, and which scripts are old?', priority: 'NORMAL', checks: [], evidence: 'Connection health and script versions.', projects: ['Restore the read-only metrics sync'], safety: 'No secrets. Nothing deployed automatically.' },
];

/** Builds the starting registry from the catalog. Nothing is approved. Every source starts “Not connected”. */
export function catalogSources(): IntelligenceSource[] {
  return SOURCE_CATALOG.map((c) => ({
    id: `src-${c.id}`, catalogId: c.id, tier: c.tier, name: c.name, type: c.type, allowed: c.reads, sensitivity: c.sensitivity,
    demoEnabled: false, health: 'NOT_CONNECTED', lastCheckedAt: null, note: c.missing, cadence: c.cadence,
    status: 'NOT_CONNECTED', approved: false, dataKind: 'NONE', purpose: c.purpose, scope: 'Not set yet', excluded: c.excluded, retention: c.retention, visibility: c.visibility,
    coverage: 'Nothing read yet', lag: '—', costNote: c.cost, missing: c.missing, safety: c.safety, exampleQuestions: c.examples, suggestedPriority: c.priority,
  }));
}
export function catalogGoals(now: string): BusinessGoal[] {
  return GOAL_CATALOG.map((g) => ({
    id: `ig-${g.id.slice(3)}`, catalogId: g.id, tier: SOURCE_CATALOG.find((s) => s.id === g.sourceId)!.tier, title: g.title, description: g.question, question: g.question, priority: g.priority,
    enabled: false, area: SOURCE_CATALOG.find((s) => s.id === g.sourceId)!.name, createdAt: now, sourceIds: [`src-${g.sourceId}`], checks: g.checks,
    params: Object.fromEntries(g.checks.flatMap((c) => Object.entries(CHECK_LIBRARY.find((x) => x.id === c)?.params ?? {}).map(([k, v]) => [k, v.value]))),
    evidenceNeeded: g.evidence, projectExamples: g.projects, safety: g.safety,
  }));
}
