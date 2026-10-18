import type {
  ActivityBin, AuditEvent, Notification, Opportunity, PrintJob, PrinterProblemEvent, PrintStation, Project, ProjectEvent,
  Resource, ResourceLink, Settings, Shift, Step, User, WorkAssignment,
} from '../domain/types';
import { addMinutes, chicagoToUtc } from '../domain/time';
import type { HubState } from './state';
import { ownerSeed } from './ownerSeed';

// ALL DATA BELOW IS SYNTHETIC DEMO DATA. No real staff PII, customer data, or production records.

const T = (day: string, hhmm: string) => chicagoToUtc(day, hhmm);
export const NOW = T('2026-10-16', '15:00');
const MON = '2026-10-12';
const DAYS = ['2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16'];

export const USER_IDS = {
  dalia: 'u-dalia', erika: 'u-erika', arantza: 'u-arantza', carolina: 'u-carolina',
  printA: 'u-print-a', printB: 'u-print-b', printC: 'u-print-c', extra: 'u-extra',
};

function users(): User[] {
  return [
    { id: USER_IDS.dalia, name: 'Dalia', role: 'OWNER', area: 'PROJECT', active: true, capabilities: ['owner', 'project work'], primaryDeviceId: null },
    { id: USER_IDS.erika, name: 'Erika', role: 'EMPLOYEE', area: 'PROJECT', active: true, capabilities: ['listings', 'Amazon/Shopify scripts'], primaryDeviceId: 'ERIKAPC' },
    { id: USER_IDS.arantza, name: 'Arantza', role: 'EMPLOYEE', area: 'PROJECT', active: true, capabilities: ['SOP writing', 'Etsy'], primaryDeviceId: 'PC-04' },
    { id: USER_IDS.carolina, name: 'Carolina', role: 'EMPLOYEE', area: 'MIXED', active: true, capabilities: ['print production', 'project work (some days)'], primaryDeviceId: 'PRINT-4' },
    { id: USER_IDS.printA, name: 'Print Employee A', role: 'EMPLOYEE', area: 'PRINT', active: true, capabilities: ['envelope printing'], primaryDeviceId: 'PRINT-1', rosterNote: 'Generic placeholder — confirm real name from the roster.' },
    { id: USER_IDS.printB, name: 'Print Employee B', role: 'EMPLOYEE', area: 'PRINT', active: true, capabilities: ['invitation printing'], primaryDeviceId: 'PRINT-2', rosterNote: 'Generic placeholder — confirm real name from the roster.' },
    { id: USER_IDS.printC, name: 'Print Employee C', role: 'EMPLOYEE', area: 'PRINT', active: true, capabilities: ['label printing'], primaryDeviceId: 'PRINT-3', rosterNote: 'Generic placeholder — confirm real name from the roster.' },
    { id: USER_IDS.extra, name: 'Additional Employee (role TBD)', role: 'EMPLOYEE', area: 'UNASSIGNED', active: true, capabilities: [], primaryDeviceId: null, rosterNote: 'Role to be confirmed from the real roster. Safe defaults: no project or print duties assumed.' },
  ];
}

function assignments(): WorkAssignment[] {
  return [
    { id: 'wa-1', uid: USER_IDS.carolina, area: 'PRINT', validFrom: T(MON, '00:00'), validTo: T('2026-10-16', '00:00'), note: 'Print production Mon–Thu' },
    { id: 'wa-2', uid: USER_IDS.carolina, area: 'PROJECT', validFrom: T('2026-10-16', '00:00'), validTo: T('2026-10-17', '00:00'), note: 'Project work on P-070 (Friday)' },
  ];
}

export const settings = (): Settings => ({
  aiOutage: false, logSyncOutage: false, monthlyBudgetUsd: 100, budgetWarnPct: 80, budgetCircuitBreakerPct: 100,
  emailUrgentOptIn: false, reviewReadyTargetMinutes: 20, backupReadyLocalTime: '07:30', retentionDays: { raw: 90, business: 1825 }, statusRunLocalTime: '06:00',
});

const base = () => ({ ownerUid: USER_IDS.dalia, sharedWithUids: [] as string[], closedAt: null as string | null, createdAt: T('2026-09-28', '09:00'), lastVerifiedAt: null as string | null, currentRisk: null as string | null, impactPlan: null as Project['impactPlan'], pause: null as Project['pause'], pilot: null as Project['pilot'], managerUids: [] as string[], pinned: false, canceledAt: null as string | null, origin: 'MANUAL' as const, category: null as string | null, employeeBrief: null as string | null });

function projects(): Project[] {
  return [
    { ...base(), id: 'prj-012', key: 'P-012', shortName: 'Shopify listings', description: 'Put the new fall and Halloween products on Shopify. First the search text (SEO) is written and checked. Then the Shopify Lister script makes each listing, and we look at the first one before running the rest.', title: 'ADD LISTINGS — fall/Halloween invitation & announcement products on Shopify', objective: 'List the new fall/Halloween SKUs on Shopify with approved SEO.', businessGoal: 'Have the seasonal range live before peak ordering.', memberUids: [USER_IDS.erika], visibility: 'ASSIGNED_ONLY', priority: 'HIGH', deadlineAt: T('2026-10-21', '17:00'), updatedAt: NOW, lastVerifiedAt: T('2026-10-16', '14:51'), currentRisk: 'Two copies of “SEO Master” do not match. Neither is marked as approved.', impactPlan: { target: 'All 154 SKUs live and correct on Shopify', observed: null } },
    { ...base(), id: 'prj-070', key: 'P-070', shortName: 'Listing automation', description: 'Collect the changes we asked for, build and test the Amazon listing helper, update the Etsy and Shopify scripts, and write the final instructions (SOP).', title: 'Update Listing Process + Listing Automation', objective: 'Compile changes, build/test Amazon listing automation, update Etsy & Shopify scripts, finalize the SOP.', businessGoal: 'Cut manual listing time and errors.', memberUids: [USER_IDS.erika, USER_IDS.carolina], visibility: 'ASSIGNED_ONLY', priority: 'NORMAL', deadlineAt: T('2026-11-06', '17:00'), updatedAt: NOW, impactPlan: { target: 'Listing time per SKU reduced (baseline to be measured)', observed: null } },
    { ...base(), id: 'prj-081', key: 'P-081', shortName: 'Amazon variation change', description: 'Move the FBA_TY001 product from its old family (PC078) to its new family (PC107) on Amazon, then check in Seller Central that Amazon really made the change.', title: 'Amazon variation family moves (FBA_TY001: PC078 → PC107)', objective: 'Move FBA_TY001 from old parent PC078 to new parent PC107 and confirm family membership.', businessGoal: 'Correct the variation family so the listing displays properly.', memberUids: [USER_IDS.erika], visibility: 'ASSIGNED_ONLY', priority: 'HIGH', deadlineAt: null, updatedAt: NOW, currentRisk: 'We have not checked the final result yet.' },
    { ...base(), id: 'prj-044', key: 'P-044', shortName: 'Etsy SOP refresh', description: 'Check that our Etsy instructions match how the Etsy script really works, and fix anything that is out of date.', title: 'Etsy SOP refresh', objective: 'Refresh the Etsy listing SOP to match current scripts.', businessGoal: 'Accurate, current SOPs.', memberUids: [USER_IDS.arantza], visibility: 'ASSIGNED_ONLY', priority: 'NORMAL', deadlineAt: T('2026-10-30', '17:00'), updatedAt: NOW },
    { ...base(), id: 'prj-priv', key: 'P-D01', shortName: 'Private planning', description: 'Private planning notes. Only Dalia can see this.', title: 'Owner Private Planning', objective: 'Owner-only planning workspace.', businessGoal: 'Private.', memberUids: [], visibility: 'OWNER_PRIVATE', priority: 'NORMAL', deadlineAt: null, updatedAt: NOW },
  ];
}

const stepBase = (): Omit<Step, 'id' | 'projectId' | 'sortOrder' | 'title' | 'instructions' | 'status' | 'assignedUids' | 'impact'> => ({
  parentStepId: null as string | null, phase: null as string | null, blockerReason: null as string | null, dependencyIds: [] as string[], evidenceHints: [] as string[], checklist: [] as Step['checklist'],
  verificationSource: 'NONE' as Step['verificationSource'], observedLevel: 'NO_EVIDENCE' as Step['observedLevel'], observedReview: 'NONE' as Step['observedReview'], observedNote: null as string | null,
  lastActivityAt: null as string | null, lastConfirmedAt: null as string | null, lastVerifiedAt: null as string | null, humanReported: null as Step['humanReported'], verifications: [] as Step['verifications'], newActivityAt: null as string | null, onHold: null as Step['onHold'],
  dueAt: null as string | null, acceptance: '', objective: '',
});

function steps(): Step[] {
  const S = (o: Partial<Step> & Pick<Step, 'id' | 'projectId' | 'sortOrder' | 'title' | 'instructions' | 'status' | 'assignedUids' | 'impact'>): Step => ({ ...stepBase(), ...o });
  const E = [USER_IDS.erika];
  return [
    // ---- P-012 ----
    S({ id: 's-012-1', projectId: 'prj-012', sortOrder: 1, title: 'Shopify — use AI to generate all SEO', instructions: 'Run the SEO prompt over the new SKU list and paste results into the SEO Master sheet. One row per SKU (154 rows).', objective: 'SEO text exists for every new SKU.', acceptance: 'SEO Master has title, description and tags for each SKU.', status: 'REPORTED_COMPLETE', verificationSource: 'EMPLOYEE_CONFIRMED', assignedUids: E, impact: 'ROUTINE', lastConfirmedAt: T('2026-10-16', '08:41'), lastActivityAt: T('2026-10-16', '08:41') }),
    S({ id: 's-012-2', projectId: 'prj-012', sortOrder: 2, title: 'Review SEO Master Sheet and make edits', instructions: 'Read every row; fix tone and errors; mark each SKU Yes/Fix in the Done column. Record which sheet copy is the approved final.', objective: 'Reviewed SEO ready to publish.', acceptance: 'All SKUs marked Yes; one sheet version designated approved.', status: 'REPORTED_COMPLETE', verificationSource: 'EMPLOYEE_CONFIRMED', assignedUids: E, impact: 'ROUTINE', lastConfirmedAt: T('2026-10-16', '14:51'), lastActivityAt: T('2026-10-16', '14:51'),
      checklist: [{ id: 'c1', text: 'Review all 154 SKU rows', done: true }, { id: 'c2', text: 'Designate approved SEO Master version', done: false }] }),
    S({ id: 's-012-3', projectId: 'prj-012', sortOrder: 3, title: 'Use Shopify Lister Tampermonkey script to list the new SKUs', instructions: 'Open the approved SEO Master, select the image folder, run “MPP Shopify Lister”. Start with “Make 1 draft” as a test, check the draft in Shopify, then run the batch. See Shopify Listing SOP.', objective: 'All new SKUs created as Shopify products.', acceptance: 'Each SKU exists in Shopify with correct options and published status.', status: 'NOT_STARTED', assignedUids: E, impact: 'HIGH', dependencyIds: ['s-012-2'], dueAt: T('2026-10-19', '17:00'),
      evidenceHints: ['action:make 1 draft', 'automation:MPP Shopify Lister', 'sku:MA041', 'doc:demo-sheet-seo-a'],
      checklist: [{ id: 'c1', text: 'Choose the approved SEO Master version', done: false }, { id: 'c2', text: 'Run “Make 1 draft” test and check the draft in Shopify', done: false }, { id: 'c3', text: 'Run the batch for all SKUs', done: false }] }),
    S({ id: 's-012-4', projectId: 'prj-012', sortOrder: 4, title: 'Double-check all new listings', instructions: 'Open each new product; check title, price, options, images, and that it is published.', objective: 'Every listing verified live and correct.', acceptance: 'Spot-check plus automated lookup agree for all 154 SKUs.', status: 'NOT_STARTED', assignedUids: E, impact: 'HIGH', dependencyIds: ['s-012-3'] }),
    // ---- P-070 ----
    S({ id: 's-070-1', projectId: 'prj-070', sortOrder: 1, title: 'Compile all requested changes', instructions: 'Gather change requests into one list.', status: 'REPORTED_COMPLETE', verificationSource: 'EMPLOYEE_CONFIRMED', assignedUids: E, impact: 'ROUTINE', lastConfirmedAt: T('2026-10-09', '16:00') }),
    S({ id: 's-070-2', projectId: 'prj-070', sortOrder: 2, title: 'Build Amazon listing automation', instructions: 'Build the Amazon flat-file helper script; log structured run outcomes.', status: 'IN_PROGRESS', assignedUids: E, impact: 'HIGH' }),
    S({ id: 's-070-3', projectId: 'prj-070', sortOrder: 3, title: 'Test and fix Amazon automation', instructions: 'Test on a small SKU set; fix failures.', status: 'NOT_STARTED', assignedUids: E, impact: 'HIGH', dependencyIds: ['s-070-2'] }),
    S({ id: 's-070-4', projectId: 'prj-070', sortOrder: 4, title: 'Update Etsy script', instructions: 'Apply the compiled changes to the Etsy script.', status: 'NOT_STARTED', assignedUids: E, impact: 'ROUTINE' }),
    S({ id: 's-070-5', projectId: 'prj-070', sortOrder: 5, title: 'Update Shopify script', instructions: 'Apply the compiled changes to the Shopify Lister script.', status: 'NOT_STARTED', assignedUids: E, impact: 'ROUTINE' }),
    S({ id: 's-070-6', projectId: 'prj-070', sortOrder: 6, title: 'Apply changes requested by Dalia', instructions: 'Work through the owner change list.', status: 'IN_PROGRESS', assignedUids: [USER_IDS.carolina], impact: 'ROUTINE' }),
    S({ id: 's-070-7', projectId: 'prj-070', sortOrder: 7, title: 'Finalize the SOP', instructions: 'Update the Listing SOP to match the finished automation.', status: 'NOT_STARTED', assignedUids: E, impact: 'ROUTINE' }),
    // ---- P-081 (FBA_TY001) ----
    S({ id: 's-081-1', projectId: 'prj-081', sortOrder: 1, title: 'Prepare the variation-move file (FBA_TY001 PC078 → PC107)', instructions: 'Prepare the Amazon flat file that moves FBA_TY001 from parent PC078 to parent PC107.', status: 'REPORTED_COMPLETE', verificationSource: 'EMPLOYEE_CONFIRMED', assignedUids: E, impact: 'ROUTINE', lastConfirmedAt: T('2026-10-16', '15:00') }),
    S({ id: 's-081-2', projectId: 'prj-081', sortOrder: 2, title: 'Submit the file in Seller Central and resolve any errors', instructions: 'Upload the file under Add products via upload; read the processing report; fix errors and resubmit.', objective: 'A submission that processes without errors.', acceptance: 'Processing report shows success for FBA_TY001.', status: 'IN_PROGRESS', assignedUids: E, impact: 'HIGH', dependencyIds: ['s-081-1'], evidenceHints: ['sku:FBA_TY001', 'submission:true'] }),
    S({ id: 's-081-3', projectId: 'prj-081', sortOrder: 3, title: 'Confirm FBA_TY001 is a child of PC107 (family membership)', instructions: 'Open the PC107 parent and confirm FBA_TY001 appears as a child and is gone from PC078.', objective: 'Final family state is correct.', acceptance: 'Independent lookup confirms membership.', status: 'NOT_STARTED', assignedUids: E, impact: 'HIGH', dependencyIds: ['s-081-2'] }),
    // ---- P-044 (Arantza only) ----
    S({ id: 's-044-1', projectId: 'prj-044', sortOrder: 1, title: 'Audit current Etsy SOP against the script', instructions: 'List where the SOP and script disagree.', status: 'IN_PROGRESS', assignedUids: [USER_IDS.arantza], impact: 'ROUTINE', evidenceHints: ['doc:demo-doc-etsy-sop'] }),
    S({ id: 's-044-2', projectId: 'prj-044', sortOrder: 2, title: 'Rewrite SOP sections', instructions: 'Rewrite outdated sections.', status: 'NOT_STARTED', assignedUids: [USER_IDS.arantza], impact: 'ROUTINE' }),
    S({ id: 's-044-3', projectId: 'prj-044', sortOrder: 3, title: 'Owner review of rewritten SOP', instructions: 'Dalia reviews the new SOP (subjective: owner approval is the verification).', status: 'NOT_STARTED', assignedUids: [USER_IDS.arantza], impact: 'ROUTINE' }),
    // ---- Private ----
    S({ id: 's-priv-1', projectId: 'prj-priv', sortOrder: 1, title: 'Draft next-quarter planning notes', instructions: 'Private planning (owner-only).', status: 'IN_PROGRESS', assignedUids: [USER_IDS.dalia], impact: 'ROUTINE' }),
    S({ id: 's-priv-2', projectId: 'prj-priv', sortOrder: 2, title: 'Review private financial scenarios', instructions: 'Private (owner-only).', status: 'NOT_STARTED', assignedUids: [USER_IDS.dalia], impact: 'ROUTINE' }),
  ];
}

const R = (o: Partial<Resource> & Pick<Resource, 'id' | 'type' | 'label' | 'purpose'>): Resource => ({
  usedBy: 'Project workers', sourceProvider: 'none', sourceId: null, canonicalUrl: null, normalizedPath: null, linkState: 'UNKNOWN', version: null,
  lastModifiedAt: null, visibility: 'PROJECT_SCOPED', ownerUid: USER_IDS.dalia, skuFamilies: [], provenance: 'OWNER_APPROVED', approvedVersion: null, suggestedVersion: null, supersededById: null, ...o,
});

function resources(): Resource[] {
  return [
    R({ id: 'r-seo-a', type: 'GOOGLE_SHEET', isDraft: true, label: 'SEO Master — Fall/Halloween 2026 (copy A)', purpose: 'SEO text for the 154 new SKUs; copy edited during review on Oct 16.', sourceProvider: 'demo-drive', sourceId: 'demo-sheet-seo-a', canonicalUrl: 'demo://drive/sheet/demo-sheet-seo-a', linkState: 'VERIFIED', version: 'rev 41', lastModifiedAt: T('2026-10-16', '14:51'), skuFamilies: ['MA', 'MS'], checklistSummary: { total: 154, yes: 61, fix: 11, blank: 82, sourceNote: 'Done column, copy A, rev 41' } }),
    R({ id: 'r-seo-b', type: 'GOOGLE_SHEET', label: 'SEO Master — Fall/Halloween 2026 (copy B “FINAL”)', purpose: 'A different file with a similar name. 132 Yes, 22 blank. Not conflated with copy A (different provider ID).', sourceProvider: 'demo-drive', sourceId: 'demo-sheet-seo-b', canonicalUrl: 'demo://drive/sheet/demo-sheet-seo-b', linkState: 'VERIFIED', version: 'rev 12', lastModifiedAt: T('2026-10-15', '16:20'), skuFamilies: ['MA', 'MS'], provenance: 'EMPLOYEE_CONFIRMED', checklistSummary: { total: 154, yes: 132, fix: 0, blank: 22, sourceNote: 'Done column, copy B, rev 12' } }),
    R({ id: 'r-lister', type: 'SCRIPT', label: 'MPP Shopify Lister (Tampermonkey)', purpose: 'Creates Shopify products from the SEO Master + image folder.', usedBy: 'Listing staff', sourceProvider: 'demo-drive', sourceId: 'demo-script-shopify-lister', linkState: 'UNKNOWN', installPath: 'Installed in the Tampermonkey browser extension on the listing computers. Do not move it.', version: 'illustrative-1.x', sourceLinked: false, notes: 'We saw this tool in the logs. Its code is not linked yet, so we do not know what it does or how it ended.' }),
    R({ id: 'r-images', type: 'NETWORK_SHARE', label: 'Fall/Halloween 2026 product images', purpose: 'Source images by SKU.', sourceProvider: 'demo-network', normalizedPath: '\\\\MPP-SRV\\Shared\\Images\\Halloween2026\\', linkState: 'LOCAL_ONLY', skuFamilies: ['MA', 'MS'], notes: 'You can only open this from a company computer.' }),
    R({ id: 'r-sop-shopify', type: 'SOP', label: 'Shopify Listing SOP (v2)', purpose: 'Step-by-step instructions for listing on Shopify.', sourceProvider: 'demo-drive', sourceId: 'demo-doc-shopify-sop-v2', canonicalUrl: 'demo://drive/doc/demo-doc-shopify-sop-v2', linkState: 'VERIFIED', version: 'v2', approvedVersion: 'v2', approval: { version: 'v2', byUid: USER_IDS.dalia, at: T('2026-10-10', '11:05') }, lastModifiedAt: T('2026-10-10', '11:00') }),
    R({ id: 'r-sop-shopify-v1', type: 'SOP', label: 'Shopify Listing SOP (v1, superseded)', purpose: 'Earlier SOP kept for history.', sourceProvider: 'demo-drive', sourceId: 'demo-doc-shopify-sop-v1', canonicalUrl: 'demo://drive/doc/demo-doc-shopify-sop-v1', linkState: 'VERIFIED', version: 'v1', supersededById: 'r-sop-shopify' }),
    R({ id: 'r-validation', type: 'REPORT', label: 'Shopify Lister validation report', purpose: 'Errors from a Lister run; must be tied to the exact run.', sourceProvider: 'none', linkState: 'MISSING', notes: 'No report exists yet for the October 16 test.' }),
    R({ id: 'r-product-urls', type: 'WEB_LINK', label: 'Published product URLs (Shopify)', purpose: 'Where the finished listings live.', sourceProvider: 'demo-shopify', linkState: 'UNKNOWN', notes: 'No links yet. Nothing is checked as live.' }),
    R({ id: 'r-amazon-flat', type: 'EXCEL', label: 'FBA_TY001 variation move file (PC078 → PC107)', purpose: 'Amazon flat file that moves FBA_TY001 to its new parent.', sourceProvider: 'demo-local', normalizedPath: 'C:\\Users\\Shared\\Amazon\\FBA_TY001_family_move_PC078_to_PC107.xlsx', linkState: 'LOCAL_ONLY', skuFamilies: ['FBA_TY'], version: 'original', suggestedVersion: { version: 'corrected', modifiedAt: T('2026-10-16', '15:20'), note: 'A “_corrected” file was downloaded after the first upload needed action.' } }),
    R({ id: 'r-amazon-script', type: 'SCRIPT', label: 'Amazon listing helper (in development)', purpose: 'Draft automation for P-070.', sourceProvider: 'demo-drive', sourceId: 'demo-script-amazon-helper', linkState: 'VERIFIED', canonicalUrl: 'demo://drive/file/demo-script-amazon-helper', sourceLinked: true, version: 'dev-0.3' }),
    R({ id: 'r-etsy-sop', type: 'GOOGLE_DOC', label: 'Etsy listing SOP (draft)', purpose: 'Being refreshed under P-044.', sourceProvider: 'demo-drive', sourceId: 'demo-doc-etsy-sop', canonicalUrl: 'demo://drive/doc/demo-doc-etsy-sop', linkState: 'VERIFIED', version: 'draft 3', lastModifiedAt: T('2026-10-16', '13:40') }),
    R({ id: 'r-private-plan', type: 'GOOGLE_DOC', label: 'Private planning notes (owner only)', purpose: 'Owner-private planning document.', visibility: 'OWNER_PRIVATE', sourceProvider: 'demo-drive', sourceId: 'demo-doc-private-plan', canonicalUrl: 'demo://drive/doc/demo-doc-private-plan', linkState: 'VERIFIED' }),
  ];
}

function links(): ResourceLink[] {
  const L = (id: string, resourceId: string, projectId: string, stepId: string | null, role: ResourceLink['role'], explanation: string, state: ResourceLink['associationState'] = 'CONFIRMED'): ResourceLink => ({
    id, resourceId, projectId, stepId, role, associationState: state, suggestedBy: 'HUMAN', explanation, evidenceRefs: [], approvedBy: state === 'CONFIRMED' ? USER_IDS.dalia : null, createdAt: T('2026-10-01', '09:00'), lastReviewedAt: null,
  });
  return [
    L('l-1', 'r-seo-a', 'prj-012', 's-012-1', 'OUTPUT', 'Original generation artifact for Step 1.'),
    L('l-2', 'r-seo-a', 'prj-012', 's-012-2', 'WORKING', 'Edited during review (approval status needs confirmation).'),
    L('l-3', 'r-seo-a', 'prj-012', 's-012-3', 'INPUT', 'Exact approved version must be chosen before bulk listing.'),
    L('l-3b', 'r-seo-b', 'prj-012', 's-012-3', 'INPUT', 'Competing candidate; do not assume either copy is approved.'),
    L('l-3c', 'r-seo-b', 'prj-012', 's-012-2', 'WORKING', 'Earlier copy with 132 Yes.'),
    L('l-4', 'r-lister', 'prj-012', 's-012-3', 'AUTOMATION_TOOL', 'Script used to create Shopify products.'),
    L('l-5', 'r-images', 'prj-012', 's-012-3', 'SOURCE_IMAGES', 'Canonical image location (confirm SKU coverage).'),
    L('l-6', 'r-sop-shopify', 'prj-012', 's-012-3', 'INSTRUCTIONS', 'Current approved SOP.'),
    L('l-6b', 'r-sop-shopify', 'prj-012', 's-012-4', 'INSTRUCTIONS', 'Current approved SOP.'),
    L('l-7', 'r-validation', 'prj-012', 's-012-3', 'VALIDATION', 'To be tied to the exact run.'),
    L('l-8', 'r-product-urls', 'prj-012', 's-012-4', 'OUTPUT', 'Verify actual product status before marking Done.'),
    L('l-9', 'r-amazon-flat', 'prj-081', 's-081-2', 'INPUT', 'File submitted to Seller Central.'),
    L('l-10', 'r-amazon-script', 'prj-070', 's-070-2', 'AUTOMATION_TOOL', 'Script under development.'),
    L('l-11', 'r-sop-shopify', 'prj-070', 's-070-7', 'REFERENCE', 'SOP to be updated.'),
    L('l-12', 'r-etsy-sop', 'prj-044', 's-044-1', 'WORKING', 'SOP being audited.'),
    L('l-13', 'r-private-plan', 'prj-priv', 's-priv-1', 'WORKING', 'Owner-private.'),
  ];
}

let evN = 0;
function journal(): ProjectEvent[] {
  const E = (projectId: string, stepIds: string[], type: ProjectEvent['type'], at: string, actor: string | null, actorLabel: string, title: string, summary: string, vs: ProjectEvent['verificationState'], vis: ProjectEvent['visibility'] = 'ASSIGNED_ONLY'): ProjectEvent => ({
    id: `je-seed-${++evN}`, projectId, stepIds, type, occurredAt: at, recordedAt: at, actorUid: actor, actorType: actor ? 'HUMAN' : 'SERVICE', actorLabel, title, summary,
    verificationState: vs, confidenceBand: 'N_A', sourceRefs: [], relatedResourceIds: [], relatedRequestId: null, relatedResponseId: null, visibility: vis,
  });
  return [
    E('prj-012', ['s-012-1'], 'STATUS_CHANGE', T('2026-10-16', '08:41'), USER_IDS.erika, 'Authenticated Erika', 'Step 1 marked done', 'SEO generated for all 154 SKUs (tracker: Done, reported by Erika).', 'EMPLOYEE_CONFIRMED'),
    E('prj-012', ['s-012-2'], 'STATUS_CHANGE', T('2026-10-16', '14:51'), USER_IDS.erika, 'Authenticated Erika', 'Step 2 marked done', 'SEO Master reviewed and edited (tracker: Done, reported by Erika). Approved version not designated.', 'EMPLOYEE_CONFIRMED'),
    E('prj-070', ['s-070-1'], 'STATUS_CHANGE', T('2026-10-09', '16:00'), USER_IDS.erika, 'Authenticated Erika', 'Step 1 marked done', 'Requested changes compiled.', 'EMPLOYEE_CONFIRMED'),
    E('prj-081', ['s-081-1'], 'STATUS_CHANGE', T('2026-10-16', '15:00'), USER_IDS.erika, 'Authenticated Erika', 'Step 1 marked done', 'Variation-move file prepared (tracker).', 'EMPLOYEE_CONFIRMED'),
    E('prj-044', ['s-044-1'], 'NOTE', T('2026-10-16', '13:40'), USER_IDS.arantza, 'Authenticated Arantza', 'Audit started', 'Started comparing the Etsy SOP to the script.', 'OFFICIAL'),
    E('prj-priv', ['s-priv-1'], 'NOTE', T('2026-10-14', '10:00'), USER_IDS.dalia, 'Authenticated Dalia', 'Private note', 'Owner-private planning note.', 'OFFICIAL', 'OWNER_PRIVATE'),
  ];
}

function notifications(): Notification[] {
  return [
    { id: 'n-seed-1', recipientUid: USER_IDS.dalia, senderUid: null, type: 'DAILY_DIGEST', title: 'Your daily summary is ready', preview: 'Yesterday: 2 steps were finished. Some computer data was missing.', projectId: null, stepId: null, sourceEntityId: 'digest-1015', deepLink: '/owner/overview', createdAt: T('2026-10-16', '07:30'), deliveredAt: T('2026-10-16', '07:30'), readAt: null, acknowledgedAt: null, state: 'DELIVERED', snoozedUntil: null, idempotencyKey: 'seed-n1' },
    { id: 'n-seed-2', recipientUid: USER_IDS.dalia, senderUid: null, type: 'MISSING_COVERAGE', title: 'Some data is missing from “PC-04”', preview: 'Some events from 1 to 2 PM did not arrive. Counts may look low. That does not mean no work.', projectId: null, stepId: null, sourceEntityId: 'arch-pc04', deepLink: '/owner/data-intake', createdAt: T('2026-10-16', '14:05'), deliveredAt: T('2026-10-16', '14:05'), readAt: null, acknowledgedAt: null, state: 'DELIVERED', snoozedUntil: null, idempotencyKey: 'seed-n2' },
  ];
}

function shifts(): Shift[] {
  const S = (uid: string, id: string, inAt: string, outAt: string | null): Shift => ({ id, uid, clockInAt: inAt, clockOutAt: outAt, reviewSessions: [], clockInKey: `seed-in-${id}`, clockOutKey: outAt ? `seed-out-${id}` : null });
  return [
    S(USER_IDS.erika, 'sh-erika-1015', T('2026-10-15', '08:00'), T('2026-10-15', '16:30')),
    S(USER_IDS.erika, 'sh-erika-1016', T('2026-10-16', '08:00'), null),
    S(USER_IDS.arantza, 'sh-arantza-1016', T('2026-10-16', '08:30'), null),
    S(USER_IDS.printA, 'sh-printa-1016', T('2026-10-16', '08:00'), null),
    S(USER_IDS.printB, 'sh-printb-1016', T('2026-10-16', '08:00'), null),
    S(USER_IDS.carolina, 'sh-carolina-1016', T('2026-10-16', '08:00'), null),
  ];
}

// ---- print data (deterministic PRNG) ----
function rng(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const STATIONS: PrintStation[] = [
  { deviceId: 'PRINT-1', printers: ['PRN-A', 'PRN-B'], defaultUid: USER_IDS.printA },
  { deviceId: 'PRINT-2', printers: ['PRN-C'], defaultUid: USER_IDS.printB },
  { deviceId: 'PRINT-3', printers: ['PRN-D'], defaultUid: USER_IDS.printC },
  { deviceId: 'PRINT-4', printers: ['PRN-E'], defaultUid: USER_IDS.carolina },
];
const JOB_TYPE: Record<string, PrintJob['jobType']> = { 'PRINT-1': 'ENVELOPES', 'PRINT-2': 'INVITATIONS', 'PRINT-3': 'LABELS', 'PRINT-4': 'CARDS' };

/** Logger-coverage gap: PRINT-3 on Wednesday 13:00–15:00. */
export const COVERAGE_GAP = { deviceId: 'PRINT-3', day: '2026-10-14', from: '13:00', to: '15:00' };

function printData(): { jobs: PrintJob[]; problems: PrinterProblemEvent[]; bins: ActivityBin[] } {
  const rand = rng(1016);
  const jobs: PrintJob[] = [];
  const problems: PrinterProblemEvent[] = [];
  const bins: ActivityBin[] = [];
  let jn = 0;
  const gapFrom = Date.parse(T(COVERAGE_GAP.day, COVERAGE_GAP.from));
  const gapTo = Date.parse(T(COVERAGE_GAP.day, COVERAGE_GAP.to));
  for (const day of DAYS) {
    const endHHMM = day === '2026-10-16' ? '15:00' : '16:00';
    const dayEnd = Date.parse(T(day, endHHMM));
    for (const st of STATIONS) {
      if (st.deviceId === 'PRINT-4' && day === '2026-10-16') continue; // Carolina on project work Friday
      const intervals: [number, number][] = [];
      let cursor = Date.parse(T(day, '08:20'));
      let idx = 0;
      while (cursor < dayEnd - 20 * 60000) {
        const dur = (8 + rand() * 27) * 60000;
        const start = cursor;
        const end = Math.min(start + dur, dayEnd);
        const printer = st.printers[idx++ % st.printers.length];
        const r = rand();
        const status: PrintJob['status'] = r < 0.07 ? 'FAILED' : r < 0.1 ? 'CANCELLED' : 'COMPLETED';
        const inGap = st.deviceId === COVERAGE_GAP.deviceId && start >= gapFrom && start < gapTo;
        const mkJob = (s: number, e: number, stat: PrintJob['status'], retryOf: string | null): PrintJob => ({
          id: `job-${++jn}`, printer, deviceId: st.deviceId, uid: null, startedAt: new Date(s).toISOString(), endedAt: new Date(e).toISOString(),
          status: stat, sheets: Math.round(40 + rand() * 180), jobType: JOB_TYPE[st.deviceId], retryOf,
        });
        const isLiveTail = day === '2026-10-16' && end >= dayEnd - 1000 && st.deviceId === 'PRINT-1';
        if (!inGap) {
          const job = mkJob(start, end, isLiveTail ? 'IN_PROGRESS' : status, null);
          if (isLiveTail) job.endedAt = null;
          jobs.push(job);
          intervals.push([start, end]);
          if (status === 'FAILED') {
            const rs = end + 3 * 60000, re = rs + dur * 0.8;
            if (re < dayEnd) { jobs.push(mkJob(rs, re, 'COMPLETED', job.id)); intervals.push([rs, re]); cursor = re; }
          }
        }
        cursor = Math.max(cursor, end) + (2 + rand() * 13) * 60000;
      }
      // activity bins 08:00–end in 5 min steps
      for (let ts = Date.parse(T(day, '08:00')); ts < dayEnd; ts += 5 * 60000) {
        const running = intervals.some(([a, b]) => ts >= a && ts < b);
        const covered = !(st.deviceId === COVERAGE_GAP.deviceId && ts >= gapFrom && ts < gapTo);
        // People are often away from the keyboard while machines run (feeding, packing): ~40%.
        const pc = rand() < (running ? 0.4 : 0.55);
        bins.push({ deviceId: st.deviceId, start: new Date(ts).toISOString(), printerRunning: running && covered, pcInputObserved: pc && covered, covered });
      }
    }
  }
  // Printer problem SNAPSHOTS — hundreds of repeats forming just a few real incidents.
  const snap = (printer: string, kind: PrinterProblemEvent['kind'], day: string, from: string, to: string, everySec: number) => {
    const a = Date.parse(T(day, from)), b = Date.parse(T(day, to));
    for (let ts = a; ts <= b; ts += everySec * 1000) problems.push({ id: `pp-${problems.length + 1}`, printer, at: new Date(ts).toISOString(), kind, state: 'problem' });
    problems.push({ id: `pp-${problems.length + 1}`, printer, at: new Date(b + 30000).toISOString(), kind, state: 'cleared' });
  };
  snap('PRN-A', 'JAM', '2026-10-13', '10:12', '10:48', 30);
  snap('PRN-C', 'TONER', '2026-10-14', '13:05', '14:10', 20);
  snap('PRN-B', 'OFFLINE', '2026-10-15', '09:00', '09:20', 15);
  snap('PRN-D', 'PAUSED', '2026-10-12', '11:00', '11:25', 20);
  snap('PRN-A', 'JAM', '2026-10-15', '14:30', '14:41', 30);
  return { jobs, problems, bins };
}

function opportunities(): Opportunity[] {
  return [
    { id: 'op-1', title: 'Batch envelope jobs by size before printing', problem: 'Envelope jobs of different sizes alternate on PRINT-1, requiring feeder changes.', evidence: ['Week of Oct 12: 9 feeder-related FAILED/RETRY jobs on PRN-A/PRN-B (synthetic)', 'Two PRN-A jam incidents (deduplicated episodes)'], rootCauseHypothesis: 'HYPOTHESIS (not a confirmed cause): mixed-size queues increase feeder errors.', proposal: 'Sort the daily envelope queue by size; re-measure retries for two weeks.', steps: ['Draft a queue-sorting checklist', 'Pilot on PRINT-1 for 10 working days', 'Compare retry counts with this week’s baseline'], estMinutesSavedPerUnit: 7, unitsPerMonth: 200, risk: 'May delay urgent orders; needs a rush-order exception.', confidence: 'MEDIUM', measurementPlan: 'Baseline: retries per 100 envelope jobs this week. Measure: same metric for 10 working days. Check quality rejects do not rise.', state: 'PROPOSED', createdProjectId: null, decisionNote: null, decidedAt: null, realizedValue: 'Not yet measured' },
    { id: 'op-2', title: 'Pre-stage the next job while a printer is running', problem: 'MACHINE_ONLY windows are long on PRINT-2 (machine running, no PC input observed).', evidence: ['PRINT-2 shows many MACHINE_ONLY windows (observed digital state; may include physical prep work)'], rootCauseHypothesis: 'HYPOTHESIS: some of that time could be used to stage the next batch. Physical work is not observed, so this is not evidence of idleness.', proposal: 'Trial a “stage next job” routine and compare queue gaps before/after.', steps: ['Observe the current routine with the team', 'Trial staging for one week', 'Compare inter-job gaps'], estMinutesSavedPerUnit: 4, unitsPerMonth: 300, risk: 'Physical constraints (space, feeder capacity) may limit benefit.', confidence: 'LOW', measurementPlan: 'Baseline: average gap between jobs (from print logs). Measure after trial.', state: 'PROPOSED', createdProjectId: null, decisionNote: null, decidedAt: null, realizedValue: 'Not yet measured' },
    { id: 'op-3', title: 'Reuse the listing-validation checks across Amazon, Etsy and Shopify scripts', problem: 'Similar validation logic is being rebuilt in three scripts under P-070.', evidence: ['P-070 steps 2, 4, 5 each describe validation changes'], rootCauseHypothesis: 'HYPOTHESIS: a shared validation module would reduce rework.', proposal: 'Create a shared validation checklist/module and reference it in each step.', steps: ['Inventory the validation rules in each script', 'Extract the shared rules', 'Update the SOP'], estMinutesSavedPerUnit: 10, unitsPerMonth: 60, risk: 'Platform rules differ; a shared module may need per-platform exceptions.', confidence: 'MEDIUM', measurementPlan: 'Baseline: validation-related fixes per release. Measure after.', state: 'PROPOSED', createdProjectId: null, decisionNote: null, decidedAt: null, realizedValue: 'Not yet measured' },
  ];
}

export function buildSeedState(): HubState {
  const p = printData();
  const audit: AuditEvent[] = [];
  const o = ownerSeed();
  return {
    now: NOW,
    lastOwnerLookAt: T('2026-10-15', '17:00'),
    users: users(), assignments: assignments(), projects: projects(), steps: steps(), resources: resources(), resourceLinks: links(),
    projectEvents: journal(), auditEvents: audit, archives: [], rawFileText: {}, events: [], episodes: [], findings: [], reviewCards: [], reviewDecisions: [],
    updateRequests: [], updateResponses: [], notifications: notifications(), shifts: shifts(), intakeRuns: [], aiRuns: [],
    printJobs: p.jobs, printerProblems: p.problems, activityBins: p.bins, stations: STATIONS, opportunities: opportunities(),
    settings: settings(), idempotency: {}, counters: {}, printPendingSync: {}, deviceLastSeen: {}, seenInjection: false, workLog: [], workingVersions: [],
    ownerFindings: o.findings, ownerModels: o.models, outcomes: [], goals: o.goals, sources: o.sources, workspaces: {}, drive: { folders: [], shortcuts: [], failAfterOps: null, opCount: 0 },
    lastFindingsLookAt: T('2026-10-15', '17:00'), lastScanAt: null, scanCount: 0,
  };
}
