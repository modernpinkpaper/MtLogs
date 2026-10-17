import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAct, useMe } from '../hubContext';
import { Chip } from '../common';

export function OwnerInsights() {
  const { hub, uid } = useMe();
  const act = useAct();
  const [notes, setNotes] = useState<Record<string, string>>({});
  return (
    <div className="stack">
      <div><h1>Insights & opportunities <Chip tone="violet" glyph="◆">Synthetic examples</Chip></h1>
        <p className="muted">AI-proposed improvements. Nothing is created or changed until you approve. Expected value is shown separately from realized value.</p></div>
      {hub.state.opportunities.map((o) => {
        const hours = (o.estMinutesSavedPerUnit * o.unitsPerMonth) / 60;
        return (
          <article key={o.id} className="card stack">
            <div className="row between"><h2>{o.title}</h2><div className="row"><Chip tone="gray">confidence {o.confidence.toLowerCase()}</Chip><Chip tone={o.state === 'PROPOSED' ? 'violet' : 'info'}>{o.state.replace(/_/g, ' ').toLowerCase()}</Chip></div></div>
            <p><strong>Problem:</strong> {o.problem}</p>
            <div className="small"><strong>Evidence:</strong><ul style={{ margin: '.2rem 0 0 1.1rem' }}>{o.evidence.map((e) => <li key={e}>{e}</li>)}</ul></div>
            <p className="small"><strong>Root cause:</strong> {o.rootCauseHypothesis}</p>
            <p><strong>Proposal:</strong> {o.proposal}</p>
            <div className="statrow">
              <div className="stat"><div className="v">{hours.toFixed(1)} h</div><div className="l">Expected capacity / month ({o.estMinutesSavedPerUnit} min × {o.unitsPerMonth})</div></div>
              <div className="stat"><div className="v">{o.realizedValue}</div><div className="l">Realized value</div></div>
            </div>
            <p className="small muted">Expected capacity is time that could be freed. It is <strong>not</strong> payroll savings or profit unless labor and outcome data show it. Risk: {o.risk}</p>
            <p className="small"><strong>Measurement plan:</strong> {o.measurementPlan}</p>
            {o.createdProjectId ? <p>Created project: <Link to={`/projects/${o.createdProjectId}`}>open</Link></p> : o.state === 'PROPOSED' || o.state === 'MORE_EVIDENCE_REQUESTED' || o.state === 'DEFERRED' ? (
              <div className="stack"><input type="text" aria-label="Decision note" placeholder="Decision note (optional, kept with the reasoning)" value={notes[o.id] ?? ''} onChange={(e) => setNotes({ ...notes, [o.id]: e.target.value })} />
                <div className="row">
                  <button className="primary" onClick={() => act(() => hub.decideOpportunity(uid, o.id, 'APPROVED', notes[o.id] ?? ''), 'Project created from the proposal')}>Approve project</button>
                  <button onClick={() => act(() => hub.decideOpportunity(uid, o.id, 'DEFERRED', notes[o.id] ?? ''), 'Deferred')}>Defer</button>
                  <button onClick={() => act(() => hub.decideOpportunity(uid, o.id, 'REJECTED', notes[o.id] ?? ''), 'Rejected')}>Reject</button>
                  <button onClick={() => act(() => hub.decideOpportunity(uid, o.id, 'MORE_EVIDENCE_REQUESTED', notes[o.id] ?? ''), 'Requested more evidence')}>Request more evidence</button></div></div>
            ) : <p className="small muted">Decision: {o.state.toLowerCase()} {o.decisionNote ? `— ${o.decisionNote}` : ''}</p>}
          </article>);
      })}
    </div>
  );
}
