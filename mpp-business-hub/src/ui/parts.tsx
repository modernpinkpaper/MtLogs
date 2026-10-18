import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { JournalType, ProjectEvent, Resource, ResourceLink } from '../domain/types';
import { chicagoDate, formatDate, formatDateTime } from '../domain/time';
import { Chip, Copy, LinkChip, Modal, VerifyBadge } from './common';
import { useAct, useMe } from './hubContext';
import { resourceActions, resourceApproval } from '../domain/resourceView';
import { ProjectInfo } from './projectRef';

const JT_ICON: Partial<Record<JournalType, string>> = { STATUS_CHANGE: '⇄', UPDATE_REQUESTED: '❓', UPDATE_RESPONSE: '💬', PROACTIVE_UPDATE: '📣', AI_OBSERVATION: '✦', EMPLOYEE_REVIEW: '☑', RESOURCE: '⧉', VERIFICATION: '✔', BLOCKER: '⛔', LATE_EVIDENCE: '⏱', ACK: '👁', PLAN_CHANGE: '✎', ACCESS: '🔑', DECISION: '⚖', NOTE: '•' };

export function JournalList({ events, showProject, grouped }: { events: (ProjectEvent & { projectKey: string })[]; showProject?: boolean; grouped?: boolean }) {
  const { hub, uid } = useMe();
  const [raw, setRaw] = useState<string | null>(null);
  if (!events.length) return <div className="muted">No journal entries match.</div>;
  let lastDay = '';
  return (
    <div>
      {events.map((e) => {
        const day = chicagoDate(e.occurredAt);
        const head = grouped && day !== lastDay ? <div className="dayhead">{formatDate(e.occurredAt)}</div> : null;
        lastDay = day;
        const kind = e.actorType === 'AI' ? 'ai' : e.verificationState === 'INDEPENDENTLY_VERIFIED' ? 'verified' : 'human';
        const step = e.stepIds[0] ? hub.state.steps.find((s) => s.id === e.stepIds[0]) : null;
        return (
          <div key={e.id}>{head}<div className={`journal-item ${kind}`}>
            <div><strong><span aria-hidden="true" className="jicon">{JT_ICON[e.type] ?? '•'}</span>{e.title}</strong></div>
            <div className="small" style={{ color: 'var(--text-2)' }}>{e.summary}</div>
            <div className="row small muted" style={{ gap: '.2rem .75rem', marginTop: 2 }}><span>{formatDateTime(e.occurredAt)}</span>
              {showProject && <span><Link to={`/projects/${e.projectId}`}>{e.projectKey}</Link><ProjectInfo projectId={e.projectId} label={e.projectKey} /></span>}
              {step && <Link to={`/projects/${e.projectId}/steps/${step.id}`}>Step {step.sortOrder}</Link>}
              <VerifyBadge state={e.verificationState} />
              {e.confidenceBand !== 'N_A' && <Chip tone="gray">confidence {e.confidenceBand.toLowerCase()}</Chip>}
              <span>{plainActor(e.actorLabel)}</span>{e.sourceRefs.length ? <button className="link" onClick={() => setRaw(e.id)}>Show proof ({e.sourceRefs.length})</button> : null}</div>
            {raw === e.id && (
              <ul className="small" style={{ margin: '.2rem 0 0 1rem' }}>
                {hub.state.events.filter((x) => e.sourceRefs.includes(x.id)).map((x) => <li key={x.id}>{formatDateTime(x.occurredAt)} — {x.allowedSummary} <span className="muted">[{x.id}]</span></li>)}
                {!hub.state.events.some((x) => e.sourceRefs.includes(x.id)) && <li>{e.sourceRefs.join(', ')}</li>}
              </ul>
            )}
          </div></div>
        );
      })}
      <span hidden>{uid}</span>
    </div>
  );
}

export function ResourceCard({ resource, links }: { resource: Resource; links: (ResourceLink & { projectKey?: string; stepTitle?: string | null })[] }) {
  const { hub, uid, me } = useMe();
  const act = useAct();
  const [viewer, setViewer] = useState(false);
  const cs = resource.checklistSummary;
  return (
    <div className="card">
      <div className="row between">
        <div><strong>{resource.label}</strong> <span className="chip gray">{resource.type.replace(/_/g, ' ').toLowerCase()}</span></div>
        <div className="row"><LinkChip state={resource.linkState} />{resource.provenance === 'AI_SUGGESTED' && <Chip tone="violet" glyph="✦">AI idea</Chip>}{resource.provenance === 'EMPLOYEE_CONFIRMED' && <Chip tone="info" glyph="☑">Person confirmed</Chip>}{resource.provenance === 'OWNER_APPROVED' && <Chip tone="ok" glyph="★">Owner approved</Chip>}
          {resource.visibility === 'OWNER_PRIVATE' && <Chip tone="violet" glyph="🔒">Only Dalia</Chip>}</div>
      </div>
      <p className="small">{resource.purpose}</p>
      <dl className="kv">
        <dt>Who uses it</dt><dd>{resource.usedBy}</dd>
        {resource.sourceId && <><dt>File ID</dt><dd><code>{resource.sourceId}</code></dd></>}
        {resource.version && <><dt>Version</dt><dd>{resource.version}{resource.approvedVersion ? <> · chosen: <strong>{resource.approvedVersion}</strong></> : <> · <em>no version chosen yet</em></>}</dd></>}
        {resource.lastModifiedAt && <><dt>Last changed</dt><dd>{formatDateTime(resource.lastModifiedAt)}</dd></>}
        {resource.normalizedPath && <><dt>Where it is</dt><dd><code style={{ wordBreak: 'break-all' }}>{resource.normalizedPath}</code></dd></>}
        {resource.type === 'SCRIPT' && <><dt>Code</dt><dd>{resource.sourceLinked ? 'Code is linked' : 'We saw this tool, but its code is not linked yet'}</dd></>}
        {links.length > 0 && <><dt>Used in</dt><dd>{links.map((l) => <div key={l.id} className="small"><Chip tone={l.associationState === 'CONFIRMED' ? 'ok' : 'warn'}>{l.role.replace(/_/g, ' ').toLowerCase()}</Chip> {l.projectKey} · {l.stepTitle ?? 'whole project'}{l.associationState === 'SUGGESTED' ? ' (suggested)' : ''}</div>)}</dd></>}
      </dl>
      {cs && <div className="small card flat" style={{ marginTop: 6 }}><strong>{cs.yes} of {cs.total} marked “Yes”</strong>{cs.fix ? `, ${cs.fix} marked Fix` : ''}, {cs.blank} empty <span className="muted">(from: {cs.sourceNote}). A checked box does not prove the listing is live.</span></div>}
      {resource.notes && <p className="small muted">{resource.notes}</p>}
      {resource.suggestedVersion && (
        <div className="card warn small" style={{ marginTop: 6 }}><strong>A newer version was found: {resource.suggestedVersion.version}.</strong> {resource.suggestedVersion.note} It is not approved.
          {me.role === 'OWNER' && <div className="row" style={{ marginTop: 6 }}><button onClick={() => act(() => hub.keepApprovedDismissSuggestion(uid, resource.id), 'Kept current version')}>Keep the old one</button></div>}</div>
      )}
      {links.length > 0 && <div className="row" style={{ marginTop: 6 }}><VersionActions resource={resource} /></div>}
      {links.filter((l) => l.associationState === 'SUGGESTED').map((l) => (
        <div key={l.id} className="card violet small" style={{ marginTop: 6 }}><strong>The AI thinks:</strong> {l.role.replace(/_/g, ' ').toLowerCase()} for “{l.stepTitle}”. {l.explanation}
          <div className="row" style={{ marginTop: 6 }}><button className="primary" onClick={() => act(() => hub.reviewResourceLink(uid, l.id, 'CONFIRM'), 'Linked to step')}>Add to this step</button><button onClick={() => act(() => hub.reviewResourceLink(uid, l.id, 'NOT_RELATED'), 'Marked not related')}>Not related</button></div></div>
      ))}
      <div className="row" style={{ marginTop: 8 }}>
        {resource.canonicalUrl && resource.linkState === 'VERIFIED' && <button onClick={() => setViewer(true)}>Open (pretend)</button>}
        {resource.normalizedPath && <Copy text={resource.normalizedPath} />}
        {!resource.canonicalUrl && !resource.normalizedPath && <span className="small muted">No working link. We do not make one up.</span>}
        {resource.normalizedPath && <span className="small muted">You need a company computer to open this.</span>}
      </div>
      {viewer && <Modal title={resource.label} onClose={() => setViewer(false)}><div className="card violet">This is a pretend preview. In the real app this would open your Google Drive file (<code>{resource.canonicalUrl}</code>). This practice copy never talks to Google.</div></Modal>}
    </div>
  );
}

// ---------------------------------------------------------------- step files: name, purpose, how it relates, approval, and one real action
const OPEN_LABEL: Partial<Record<string, string>> = { INSTRUCTIONS: 'Open instructions', CHECKLIST: 'Open checklist', REFERENCE: 'Open reference' };
const TYPE_LABEL: Record<string, string> = {
  GOOGLE_SHEET: 'Spreadsheet', EXCEL: 'Spreadsheet', GOOGLE_DOC: 'Document', PDF: 'Document', SOP: 'Instructions', SCRIPT: 'Automation tool', SOURCE_REPOSITORY: 'Source code',
  IMAGE_FOLDER: 'Image folder', IMAGE_ASSET: 'Images', NETWORK_SHARE: 'Shared folder', DRIVE_FOLDER: 'Folder', WINDOWS_FILE_PATH: 'File on a company computer', ARCHIVE: 'Archive',
};

/**
 * Choosing which version to use. Dalia or anyone on the project can do it. It is recorded (who, when, old and new),
 * and the file name, version and last-modified time stay visible so nobody mixes up copies.
 */
export function VersionActions({ resource, siblings = [] }: { resource: Resource; siblings?: Resource[] }) {
  const { hub, uid } = useMe();
  const act = useAct();
  const [confirm, setConfirm] = useState(false);
  const [replaces, setReplaces] = useState('');
  const ap = resourceApproval(resource, hub.approverUids(resource));
  const version = resource.suggestedVersion?.version ?? resource.version ?? 'current';
  const can = hub.canChooseVersion(uid, resource.id);
  const eligible = !!resource.version && !['SCRIPT', 'SOURCE_REPOSITORY'].includes(resource.type) && ap?.state !== 'APPROVED' && ap?.state !== 'SUPERSEDED';
  if (!can || !eligible) return null;
  return (
    <>
      <button onClick={() => setConfirm(true)}>Use this version for the project</button>
      {confirm && (
        <Modal title="Use this version for the project?" onClose={() => setConfirm(false)}>
          <div className="stack">
            <p style={{ margin: 0 }}>Make <strong>{version}</strong> of <strong>{resource.label}</strong> the version everyone on the project should use.{resource.lastModifiedAt ? ` It was last changed ${formatDateTime(resource.lastModifiedAt)}.` : ''} The history records who chose it and when.</p>
            {siblings.filter((x) => x.id !== resource.id).length > 0 && (
              <div><label htmlFor={`rp-${resource.id}`}>Does this replace another copy? (optional)</label>
                <select id={`rp-${resource.id}`} value={replaces} onChange={(e) => setReplaces(e.target.value)}><option value="">No, keep the other copies as they are</option>{siblings.filter((x) => x.id !== resource.id).map((x) => <option key={x.id} value={x.id}>Yes, replace “{x.label}”</option>)}</select></div>
            )}
            <div className="row"><button className="primary" onClick={async () => { const r = await act(() => hub.approveVersion(uid, resource.id, version, { supersedesResourceId: replaces || null }), 'Saved. This is now the version to use.'); if (r) setConfirm(false); }}>Yes, use this one</button><button className="quiet" onClick={() => setConfirm(false)}>Cancel</button></div>
          </div>
        </Modal>
      )}
    </>
  );
}

/** One resource, with a button that really does something. No inert controls and no invented links. */
export function StepResourceRow({ resource, role, roleLabel, suggested, siblings }: { resource: Resource; role: string; roleLabel: string; suggested?: boolean; siblings?: Resource[] }) {
  const { hub, uid, me } = useMe();
  const act = useAct();
  const [viewer, setViewer] = useState(false);
  const [where, setWhere] = useState(false);
  const [fix, setFix] = useState(false);
  const [loc, setLoc] = useState('');
  const ap = resourceApproval(resource, hub.approverUids(resource));
  const canEdit = me.role === 'OWNER' || hub.listProjects(uid).some((p) => p.memberUids.includes(uid));
  const isScript = resource.type === 'SCRIPT';
  const isFolder = ['IMAGE_FOLDER', 'DRIVE_FOLDER', 'NETWORK_SHARE'].includes(resource.type);
  const acts = resourceActions(resource);
  const hasUrl = acts.open;
  const hasPath = acts.copyPath;
  const nothing = acts.unknown;
  const openLabel = OPEN_LABEL[role] ?? (isScript ? 'Open source' : isFolder ? 'Open folder' : 'Open file');
  const unverifiedLink = !!resource.canonicalUrl && resource.linkState !== 'VERIFIED';
  return (
    <div className="frow">
      <div className="ft">
        <strong>{resource.label}{suggested && <span className="small muted" style={{ fontWeight: 400 }}> · suggested by the AI</span>}</strong>
        {ap && <span className={`vstate ${ap.tone}`} title={ap.hint}>{ap.label}</span>}
      </div>
      <div className="fs">{TYPE_LABEL[resource.type] ?? 'File'}{resource.purpose ? ` · ${resource.purpose}` : ''}</div>
      <div className="fs"><strong style={{ color: 'var(--text-2)', fontWeight: 600 }}>{resource.version ? `Version ${resource.version}` : 'Version not known'}</strong> · Last modified {resource.lastModifiedAt ? formatDateTime(resource.lastModifiedAt) : 'date not known'}{ap?.state === 'APPROVED' && resource.approval ? ` · Chosen by ${hub.userName(resource.approval.byUid)}, ${formatDateTime(resource.approval.at)}` : ''}</div>
      <div className="fs">{roleLabel} for this step{resource.checklistSummary ? ` · ${resource.checklistSummary.yes} of ${resource.checklistSummary.total} marked “Yes”` : ''}{unverifiedLink ? ' · The link has not been checked' : ''}</div>
      <div className="fa">
        {hasUrl && <button onClick={() => setViewer(true)}>{openLabel}</button>}
        {hasPath && <Copy text={resource.normalizedPath!} label={isFolder ? 'Copy folder path' : 'Copy path'} />}
        {hasPath && <button className="quiet" onClick={() => setWhere(!where)} aria-expanded={where}>Where to find it</button>}
        {isScript && <button className="quiet" onClick={() => setWhere(!where)} aria-expanded={where}>View installation details</button>}
        {nothing && !isScript && <span className="small" style={{ color: 'var(--warn)' }}>Location not confirmed</span>}
        {(nothing || (isScript && !hasUrl)) && canEdit && <button className="quiet" onClick={() => setFix(!fix)}>Add the location</button>}
        <VersionActions resource={resource} siblings={siblings} />
      </div>
      {where && (
        <div className="smallnote">
          {isScript && <p style={{ margin: 0 }}><strong>Where it is installed:</strong> {resource.installPath ?? 'We do not know yet.'}{resource.installPath ? '' : ' Ask whoever set it up, then add the location here.'}</p>}
          {isScript && <p style={{ margin: '.3rem 0 0' }}>{resource.sourceLinked ? 'Its source code is linked.' : 'Its source code is not linked yet, so we cannot open it. We never guess a link.'} Installed tools stay where they are. They are not moved into a project folder.</p>}
          {hasPath && <p style={{ margin: isScript ? '.3rem 0 0' : 0 }}><strong>Where to find it:</strong> <code style={{ wordBreak: 'break-all' }}>{resource.normalizedPath}</code> — you need a company computer to open this. It is not an internet link.</p>}
        </div>
      )}
      {fix && (
        <div className="stack">
          <label htmlFor={`loc-${resource.id}`}>Where is it? (a folder path like C:\Users\… or \\server\…, or a link)</label>
          <input id={`loc-${resource.id}`} type="text" value={loc} onChange={(e) => setLoc(e.target.value)} />
          <div className="row"><button className="primary" disabled={!loc.trim()} onClick={async () => { const r = await act(() => hub.setResourceLocation(uid, resource.id, loc), 'Saved. It is marked “not checked yet”.'); if (r) { setFix(false); setLoc(''); } }}>Save location</button><button className="quiet" onClick={() => setFix(false)}>Cancel</button></div>
          <span className="small muted">We save what you type. We do not check it or make a link out of it.</span>
        </div>
      )}
      {viewer && <Modal title={resource.label} onClose={() => setViewer(false)}><div className="card violet"><strong>SIMULATED PREVIEW.</strong> This is not a real Google Drive file. In a real setup this would open <code>{resource.canonicalUrl}</code>. This practice copy never connects to Google.</div></Modal>}
      <span hidden>{role}</span>
    </div>
  );
}

/** Journal actor text in everyday words. The stored label is kept exactly as it was. */
export function plainActor(label: string): string {
  const m = label.match(/^(\S+) device; actor unverified \(automated AI suggestion\)$/);
  if (m) return `From the computer ${m[1]}. We can’t tell who was using it. (AI guess)`;
  return label;
}
