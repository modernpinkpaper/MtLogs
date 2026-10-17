import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { JournalType, ProjectEvent, Resource, ResourceLink } from '../domain/types';
import { formatDateTime } from '../domain/time';
import { Chip, Copy, LinkChip, Modal, VerifyBadge } from './common';
import { useAct, useMe } from './hubContext';

const JT_ICON: Partial<Record<JournalType, string>> = { STATUS_CHANGE: '⇄', UPDATE_REQUESTED: '❓', UPDATE_RESPONSE: '💬', PROACTIVE_UPDATE: '📣', AI_OBSERVATION: '✦', EMPLOYEE_REVIEW: '☑', RESOURCE: '⧉', VERIFICATION: '✔', BLOCKER: '⛔', LATE_EVIDENCE: '⏱', ACK: '👁', PLAN_CHANGE: '✎', ACCESS: '🔑', DECISION: '⚖', NOTE: '•' };

export function JournalList({ events, showProject }: { events: (ProjectEvent & { projectKey: string })[]; showProject?: boolean }) {
  const { hub, uid } = useMe();
  const [raw, setRaw] = useState<string | null>(null);
  if (!events.length) return <div className="muted">No journal entries match.</div>;
  return (
    <div>
      {events.map((e) => {
        const kind = e.actorType === 'AI' ? 'ai' : e.verificationState === 'INDEPENDENTLY_VERIFIED' ? 'verified' : 'human';
        const step = e.stepIds[0] ? hub.state.steps.find((s) => s.id === e.stepIds[0]) : null;
        return (
          <div key={e.id} className={`journal-item ${kind}`}>
            <div className="row small muted"><span aria-hidden="true">{JT_ICON[e.type] ?? '•'}</span><span>{formatDateTime(e.occurredAt)}</span>
              {showProject && <Link to={`/projects/${e.projectId}`}>{e.projectKey}</Link>}
              {step && <Link to={`/projects/${e.projectId}/steps/${step.id}`}>Step {step.sortOrder}</Link>}
              <VerifyBadge state={e.verificationState} />
              {e.confidenceBand !== 'N_A' && <Chip tone="gray">confidence {e.confidenceBand.toLowerCase()}</Chip>}</div>
            <div><strong>{e.title}</strong></div>
            <div className="small">{e.summary}</div>
            <div className="small muted">{e.actorLabel}{e.sourceRefs.length ? <> · <button className="link" onClick={() => setRaw(e.id)}>Show proof ({e.sourceRefs.length})</button></> : null}</div>
            {raw === e.id && (
              <ul className="small" style={{ margin: '.2rem 0 0 1rem' }}>
                {hub.state.events.filter((x) => e.sourceRefs.includes(x.id)).map((x) => <li key={x.id}>{formatDateTime(x.occurredAt)} — {x.allowedSummary} <span className="muted">[{x.id}]</span></li>)}
                {!hub.state.events.some((x) => e.sourceRefs.includes(x.id)) && <li>{e.sourceRefs.join(', ')}</li>}
              </ul>
            )}
          </div>
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
  const canApprove = me.role === 'OWNER' || links.some((l) => hub.listProjects(uid).some((p) => p.id === l.projectId && p.memberUids.includes(uid)));
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
        {resource.version && <><dt>Version</dt><dd>{resource.version}{resource.approvedVersion ? <> · approved: <strong>{resource.approvedVersion}</strong></> : <> · <em>no approved version yet</em></>}</dd></>}
        {resource.lastModifiedAt && <><dt>Last changed</dt><dd>{formatDateTime(resource.lastModifiedAt)}</dd></>}
        {resource.normalizedPath && <><dt>Where it is</dt><dd><code style={{ wordBreak: 'break-all' }}>{resource.normalizedPath}</code></dd></>}
        {resource.type === 'SCRIPT' && <><dt>Code</dt><dd>{resource.sourceLinked ? 'Code is linked' : 'We saw this tool, but its code is not linked yet'}</dd></>}
        {links.length > 0 && <><dt>Used in</dt><dd>{links.map((l) => <div key={l.id} className="small"><Chip tone={l.associationState === 'CONFIRMED' ? 'ok' : 'warn'}>{l.role.replace(/_/g, ' ').toLowerCase()}</Chip> {l.projectKey} · {l.stepTitle ?? 'whole project'}{l.associationState === 'SUGGESTED' ? ' (suggested)' : ''}</div>)}</dd></>}
      </dl>
      {cs && <div className="small card flat" style={{ marginTop: 6 }}><strong>{cs.yes} of {cs.total} marked “Yes”</strong>{cs.fix ? `, ${cs.fix} marked Fix` : ''}, {cs.blank} empty <span className="muted">(from: {cs.sourceNote}). A checked box does not prove the listing is live.</span></div>}
      {resource.notes && <p className="small muted">{resource.notes}</p>}
      {resource.suggestedVersion && (
        <div className="card warn small" style={{ marginTop: 6 }}><strong>A newer version was found: {resource.suggestedVersion.version}.</strong> {resource.suggestedVersion.note}
          {canApprove && <div className="row" style={{ marginTop: 6 }}><button onClick={() => act(() => hub.setApprovedVersion(uid, resource.id, resource.suggestedVersion!.version), 'Approved version set')}>Use {resource.suggestedVersion.version} as the approved one</button>
            <button onClick={() => act(() => hub.keepApprovedDismissSuggestion(uid, resource.id), 'Kept current version')}>Keep the old one</button></div>}</div>
      )}
      {!resource.suggestedVersion && !resource.approvedVersion && resource.version && canApprove && links.length > 0 && resource.type !== 'SCRIPT' && (
        <div style={{ marginTop: 6 }}><button onClick={() => act(() => hub.setApprovedVersion(uid, resource.id, resource.version!), 'Approved version set')}>Use {resource.version} as the approved one</button></div>
      )}
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
