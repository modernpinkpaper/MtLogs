import type { HubServer } from './hub';
import type { Project, ProjectWorkspace, Resource, ResourceLink } from '../domain/types';
import { HubError, PermissionDenied } from './errors';

// SIMULATED Google Drive provider. It never makes a network call. It exists so the real folder workflow can be
// shown and tested: one folder per project, five subfolders, shortcuts instead of copies, no duplicates on retry.

export const ROOT_SHARED = 'demo-root-MPP-Projects';
export const ROOT_PRIVATE = 'demo-root-owner-private';
export const SUBFOLDERS = ['01 Instructions & SOPs', '02 Working Documents & Checklists', '03 Images & Input Files', '04 Final Deliverables', '05 Reports & Archive'];
const SHARED_SOP_RESOURCE = 'r-sop-shopify';
const SCRIPT_RESOURCE = 'r-lister';

function drive(hub: HubServer) { return hub.state.drive; }
function stamp(hub: HubServer, ws: ProjectWorkspace, op: string, detail: string) {
  ws.log.push({ at: hub.state.now, op, detail: `${detail} (simulated)` });
}
/** Every simulated API call goes through here so an outage can be injected at any step. */
function api<T>(hub: HubServer, ws: ProjectWorkspace, op: string, detail: string, fn: () => T): T {
  const d = drive(hub);
  d.opCount++;
  if (d.failAfterOps !== null) {
    if (d.failAfterOps <= 0) { d.failAfterOps = null; stamp(hub, ws, op, `FAILED: ${detail}`); throw new Error('Google Drive said: too many requests. Try again in a minute (simulated).'); }
    d.failAfterOps -= 1;
  }
  const out = fn();
  stamp(hub, ws, op, detail);
  return out;
}

export function provisionWorkspace(hub: HubServer, uid: string, projectId: string, idempotencyKey: string): ProjectWorkspace {
  hub.requireOwner(uid);
  const project = hub.projectFor(uid, projectId);
  const d = drive(hub);
  const rootId = project.visibility === 'OWNER_PRIVATE' ? ROOT_PRIVATE : ROOT_SHARED; // private projects never go in a shared root
  let ws = hub.state.workspaces[projectId];
  if (!ws) ws = hub.state.workspaces[projectId] = { projectId, state: 'PLANNED', rootId, folderId: null, subfolderIds: {}, shortcuts: [], pointers: [], sheetResourceIds: [], attempts: 0, lastError: null, idempotencyKey, completedAt: null, log: [] };
  if (ws.state === 'READY') return ws; // same request again: nothing is created twice
  ws.attempts += 1; ws.state = 'CREATING'; ws.lastError = null;
  const wasPartial = !!ws.folderId;
  try {
    const name = `${project.key} — ${project.title}`.slice(0, 90);
    if (!ws.folderId) {
      // Reconcile first: a folder from an earlier half-finished try is reused, never duplicated.
      const existing = d.folders.find((f) => f.name === name && f.parentId === rootId);
      if (existing) { ws.folderId = existing.id; stamp(hub, ws, 'files.list', `Found the existing folder “${name}”`); }
      else {
        const f = api(hub, ws, 'files.create', `Created folder “${name}”`, () => {
          const id = `demo-folder-${d.folders.length + 1}`;
          const rec = { id, name, parentId: rootId, webViewLink: `demo://drive/folder/${id}` };
          d.folders.push(rec); return rec;
        });
        ws.folderId = f.id;
      }
    }
    for (const sub of SUBFOLDERS) {
      if (ws.subfolderIds[sub]) continue;
      const existing = d.folders.find((f) => f.name === sub && f.parentId === ws.folderId);
      if (existing) { ws.subfolderIds[sub] = existing.id; continue; }
      const f = api(hub, ws, 'files.create', `Created subfolder “${sub}”`, () => {
        const id = `demo-folder-${d.folders.length + 1}`;
        const rec = { id, name: sub, parentId: ws!.folderId, webViewLink: `demo://drive/folder/${id}` };
        d.folders.push(rec as never); return rec;
      });
      ws.subfolderIds[sub] = f.id;
    }
    const sop = hub.state.resources.find((r) => r.id === SHARED_SOP_RESOURCE);
    if (sop && !ws.shortcuts.some((s) => s.targetResourceId === sop.id)) {
      // A shortcut points at the original. The original is never copied or moved.
      const sc = api(hub, ws, 'files.create (shortcut)', `Created a shortcut to “${sop.label}” (the original stays where it is)`, () => {
        const id = `demo-shortcut-${d.shortcuts.length + 1}`;
        const rec = { id, name: `${sop.label} (shortcut)`, parentId: ws!.subfolderIds[SUBFOLDERS[0]], targetId: sop.sourceId ?? sop.id, targetResourceId: sop.id };
        d.shortcuts.push(rec); return rec;
      });
      ws.shortcuts.push(sc);
    }
    const script = hub.state.resources.find((r) => r.id === SCRIPT_RESOURCE);
    if (script && !ws.pointers.some((p) => p.resourceId === script.id)) {
      // Scripts stay in the folder they must run from. We only record where they live.
      ws.pointers.push({ id: `ptr-${projectId}-1`, label: script.label, path: 'C:\\Users\\Shared\\Tampermonkey\\MPP Shopify Lister.user.js', purpose: 'Creates Shopify products. Stays in its install folder.', version: script.version, resourceId: script.id });
      stamp(hub, ws, 'pointer', `Saved the location of “${script.label}” (not moved)`);
    }
    // Real, canonical resource records for what was created (deterministic ids so a retry cannot duplicate them).
    ensureResources(hub, project, ws);
    ws.state = 'READY'; ws.completedAt = hub.state.now; ws.idempotencyKey = idempotencyKey;
    hub.audit({ entityType: 'workspace', entityId: projectId, action: 'WORKSPACE_READY', before: null, after: { folderId: ws.folderId, attempts: ws.attempts, simulated: true }, actorUid: uid, actorLabel: hub.userName(uid), reason: wasPartial ? 'Finished a half-created workspace (simulated)' : 'Created the project folder (simulated)', evidenceRefs: [], projectId });
    hub.addJournal({ projectId, type: 'RESOURCE', actorUid: uid, title: 'Project folder created', summary: `Folder “${project.key}” with 5 subfolders is ready (practice copy: simulated).`, verificationState: 'OFFICIAL' });
  } catch (e) {
    ws.lastError = (e as Error).message;
    ws.state = ws.folderId ? 'PARTIALLY_CREATED' : 'ERROR';
    hub.audit({ entityType: 'workspace', entityId: projectId, action: 'WORKSPACE_ERROR', before: null, after: { state: ws.state, error: ws.lastError }, actorUid: uid, actorLabel: hub.userName(uid), reason: 'Folder creation hit an error (simulated)', evidenceRefs: [], projectId });
  }
  hub.emit();
  return ws;
}

function addLink(hub: HubServer, link: Omit<ResourceLink, 'createdAt' | 'lastReviewedAt'>) {
  if (!hub.state.resourceLinks.some((l) => l.id === link.id)) hub.state.resourceLinks.push({ ...link, createdAt: hub.state.now, lastReviewedAt: null });
}
function ensureResources(hub: HubServer, project: Project, ws: ProjectWorkspace) {
  const base: Omit<Resource, 'id' | 'type' | 'label' | 'purpose'> = {
    usedBy: 'Project team', sourceProvider: 'demo-drive', sourceId: null, canonicalUrl: null, normalizedPath: null, linkState: 'VERIFIED', version: null, lastModifiedAt: hub.state.now,
    visibility: project.visibility === 'OWNER_PRIVATE' ? 'OWNER_PRIVATE' : 'PROJECT_SCOPED', ownerUid: project.ownerUid, skuFamilies: [], provenance: 'OWNER_APPROVED', approvedVersion: null, suggestedVersion: null, supersededById: null,
  };
  const fid = `r-ws-${project.id}-folder`;
  if (!hub.state.resources.some((r) => r.id === fid) && ws.folderId) {
    hub.state.resources.push({ ...base, id: fid, type: 'DRIVE_FOLDER', label: `Project folder — ${project.key}`, purpose: 'All files for this project live here.', sourceId: ws.folderId, canonicalUrl: `demo://drive/folder/${ws.folderId}` });
    addLink(hub, { id: `l-ws-${project.id}-folder`, resourceId: fid, projectId: project.id, stepId: null, role: 'REFERENCE', associationState: 'CONFIRMED', suggestedBy: 'RULE', explanation: 'Created with the project.', evidenceRefs: [], approvedBy: project.ownerUid });
  }
  for (const sc of ws.shortcuts) {
    const rid = `r-ws-${project.id}-${sc.id}`;
    if (!hub.state.resources.some((r) => r.id === rid)) {
      hub.state.resources.push({ ...base, id: rid, type: 'SOP', label: sc.name, purpose: 'Shortcut to the shared SOP. Opening it needs access to the original.', sourceId: sc.id, canonicalUrl: `demo://drive/shortcut/${sc.id}` });
      addLink(hub, { id: `l-ws-${project.id}-${sc.id}`, resourceId: rid, projectId: project.id, stepId: null, role: 'INSTRUCTIONS', associationState: 'CONFIRMED', suggestedBy: 'RULE', explanation: 'Shared SOP linked by shortcut, not copied.', evidenceRefs: [], approvedBy: project.ownerUid });
    }
  }
  for (const pt of ws.pointers) {
    addLink(hub, { id: `l-ws-${project.id}-${pt.id}`, resourceId: pt.resourceId, projectId: project.id, stepId: null, role: 'AUTOMATION_TOOL', associationState: 'CONFIRMED', suggestedBy: 'RULE', explanation: 'Tool stays in its install folder; the location is saved here.', evidenceRefs: [], approvedBy: project.ownerUid });
  }
}

/** Safe view for people on the project: links and names only, with “Request access” where a shortcut target is not theirs. */
export function projectWorkspaceView(hub: HubServer, uid: string, projectId: string) {
  const project = hub.projectFor(uid, projectId);
  const ws = hub.state.workspaces[projectId];
  if (!ws) return null;
  const u = hub.user(uid);
  const visibleRes = new Set(hub.listResources(uid).map((r) => r.resource.id));
  return {
    state: ws.state, folderUrl: ws.folderId ? `demo://drive/folder/${ws.folderId}` : null, rootIsPrivate: ws.rootId === ROOT_PRIVATE && u.role === 'OWNER',
    subfolders: Object.entries(ws.subfolderIds).map(([name, id]) => ({ name, url: `demo://drive/folder/${id}` })),
    shortcuts: ws.shortcuts.map((s) => ({ name: s.name, canOpen: visibleRes.has(s.targetResourceId) || u.role === 'OWNER', note: visibleRes.has(s.targetResourceId) || u.role === 'OWNER' ? null : 'Request access: a shortcut does not give you access to the original file.' })),
    pointers: ws.pointers.map((p) => ({ label: p.label, path: p.path, purpose: p.purpose, version: p.version })),
    // The log and any error text are for the owner only.
    ownerOnly: u.role === 'OWNER' ? { attempts: ws.attempts, lastError: ws.lastError, log: ws.log, rootId: ws.rootId } : null,
    projectKey: project.key,
  };
}

/** Employees can add a checklist sheet to their own step. Created inside the project folder, never loose. */
export function createChecklistSheet(hub: HubServer, uid: string, projectId: string, stepId: string | null, title: string, rows: number): Resource {
  const project = hub.projectFor(uid, projectId);
  const u = hub.user(uid);
  if (!hub.canWorkOnProject(u, project)) throw new PermissionDenied();
  const ws = hub.state.workspaces[projectId];
  if (!ws || ws.state !== 'READY') throw new HubError('NO_WORKSPACE', 'The project folder is not ready yet, so a sheet cannot be added.');
  if (!title.trim()) throw new HubError('VALIDATION', 'Please name the sheet.');
  return hub.commit(() => {
    const n = ws.sheetResourceIds.length + 1;
    const id = `r-ws-${projectId}-sheet-${n}`;
    const res: Resource = {
      id, type: 'GOOGLE_SHEET', label: title.trim(), purpose: 'Row-by-row checklist. A ticked box is not proof that a listing is live.', usedBy: 'Project team', sourceProvider: 'demo-drive', sourceId: `demo-sheet-${projectId}-${n}`,
      canonicalUrl: `demo://drive/sheet/demo-sheet-${projectId}-${n}`, normalizedPath: null, linkState: 'VERIFIED', version: 'rev 1', lastModifiedAt: hub.state.now, visibility: project.visibility === 'OWNER_PRIVATE' ? 'OWNER_PRIVATE' : 'PROJECT_SCOPED',
      ownerUid: project.ownerUid, skuFamilies: [], provenance: u.role === 'OWNER' ? 'OWNER_APPROVED' : 'EMPLOYEE_CONFIRMED', approvedVersion: null, suggestedVersion: null, supersededById: null,
      checklistSummary: { total: rows, yes: 0, fix: 0, blank: rows, sourceNote: 'new checklist, rev 1' },
    };
    hub.state.resources.push(res);
    ws.sheetResourceIds.push(id);
    ws.log.push({ at: hub.state.now, op: 'files.create (sheet)', detail: `Created “${res.label}” in “${SUBFOLDERS[1]}” (simulated)` });
    addLink(hub, { id: `l-ws-${projectId}-sheet-${n}`, resourceId: id, projectId, stepId, role: 'CHECKLIST', associationState: 'CONFIRMED', suggestedBy: 'HUMAN', explanation: 'Created from the project page.', evidenceRefs: [], approvedBy: uid });
    hub.audit({ entityType: 'resource', entityId: id, action: 'CREATE_CHECKLIST_SHEET', before: null, after: { rows, simulated: true }, actorUid: uid, actorLabel: hub.userName(uid), reason: 'Checklist sheet created in the project folder (simulated)', evidenceRefs: [], projectId });
    hub.addJournal({ projectId, stepIds: stepId ? [stepId] : [], type: 'RESOURCE', actorUid: uid, title: 'Checklist sheet created', summary: `“${res.label}” with ${rows} rows was added to the project folder.`, verificationState: 'EMPLOYEE_CONFIRMED', relatedResourceIds: [id] });
    return res;
  });
}
