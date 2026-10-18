import type { Resource } from './types';

export type ApprovalState = 'APPROVED' | 'PENDING' | 'DRAFT' | 'NEW_VERSION' | 'SUPERSEDED' | 'UNRECORDED' | 'NONE' | 'NOT_APPLICABLE';
export type ApprovalView = { state: ApprovalState; tone: 'ok' | 'warn' | 'gray' | 'bad'; label: string; hint?: string } | null;

/**
 * Approval is only ever what Dalia did, and it needs a matching record.
 * A bare "approved" flag with no record, or a name like FINAL2.xlsx, never counts.
 */
export function resourceApproval(r: Resource, ownerUids: string[]): ApprovalView {
  if (r.supersededById) return { state: 'SUPERSEDED', tone: 'gray', label: 'Superseded — A newer file is official', hint: 'Dalia approved a different file to replace this one.' };
  if (r.pendingApproval) return { state: 'PENDING', tone: 'warn', label: 'Pending approval — Waiting for Dalia', hint: `Version ${r.pendingApproval.version} was submitted. Nothing is approved yet.` };
  if (r.approvedVersion) {
    const recorded = !!r.approval && r.approval.version === r.approvedVersion && ownerUids.includes(r.approval.byUid);
    if (!recorded) return { state: 'UNRECORDED', tone: 'bad', label: 'Approval not recorded — Do not rely on it', hint: 'This says approved, but there is no record of Dalia approving it.' };
    return { state: 'APPROVED', tone: 'ok', label: 'Approved — Use this version', hint: `Approved version: ${r.approvedVersion}` };
  }
  if (r.isDraft) return { state: 'DRAFT', tone: 'warn', label: 'Draft — Still being edited', hint: 'Someone marked this copy as still being edited.' };
  if (r.suggestedVersion) return { state: 'NEW_VERSION', tone: 'warn', label: 'New version — Awaiting approval', hint: `${r.suggestedVersion.version} was found. It is not approved yet.` };
  if (r.version && !['SCRIPT', 'SOURCE_REPOSITORY'].includes(r.type)) return { state: 'NONE', tone: 'gray', label: 'No approved version yet', hint: 'A file name is not an approval, even if it says FINAL.' };
  return null;
}

export interface ResourceActions {
  /** A verified link exists: show "Open file". */
  open: boolean;
  /** A Windows or network path exists: "Copy path" and "Where to find it". It is not an internet link. */
  copyPath: boolean;
  /** An installed tool: "View installation details". It stays where it is installed. */
  installInfo: boolean;
  /** Nothing is known: say "Location not confirmed". Never invent a link. */
  unknown: boolean;
}

export function resourceActions(r: Resource): ResourceActions {
  const open = !!r.canonicalUrl && r.linkState === 'VERIFIED';
  const copyPath = !!r.normalizedPath;
  const installInfo = r.type === 'SCRIPT' && (!!r.installPath || !open);
  return { open, copyPath, installInfo, unknown: !open && !copyPath && !(r.type === 'SCRIPT' && !!r.installPath) };
}
