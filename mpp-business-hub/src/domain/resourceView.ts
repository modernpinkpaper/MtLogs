import type { Resource } from './types';

export type ApprovalView = { tone: 'ok' | 'warn' | 'gray'; label: string; hint?: string } | null;

/** Approval is only ever what a person set. A name like FINAL2.xlsx never counts. */
export function resourceApproval(r: Resource): ApprovalView {
  if (r.isDraft) return { tone: 'warn', label: 'Draft — Still being edited', hint: 'Someone marked this copy as still being edited.' };
  if (r.suggestedVersion) return { tone: 'warn', label: 'New version — Awaiting approval', hint: `${r.suggestedVersion.version} was found. It is not approved yet.` };
  if (r.approvedVersion) return { tone: 'ok', label: 'Approved — Use this version', hint: `Approved version: ${r.approvedVersion}` };
  if (r.version && !['SCRIPT', 'SOURCE_REPOSITORY'].includes(r.type)) return { tone: 'gray', label: 'No approved version yet', hint: 'A file name is not an approval, even if it says FINAL.' };
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
