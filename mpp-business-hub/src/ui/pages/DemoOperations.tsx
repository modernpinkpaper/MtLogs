import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAct, useMe, newKey } from '../hubContext';
import { Chip } from '../common';
import { formatDateTime } from '../../domain/time';

export function DemoOperations() {
  const { hub, uid, me } = useMe();
  const act = useAct();
  const nav = useNavigate();
  const [denied, setDenied] = useState<string | null>(null);
  const s = hub.state.settings;
  const Btn = ({ children, fn, ok }: { children: string; fn: () => unknown; ok: string }) => <button onClick={() => act(fn, ok)}>{children}</button>;
  return (
    <div className="stack">
      <div><h1>Demo operations <Chip tone="violet" glyph="◆">Demo only</Chip></h1><p className="muted">Playback controls for hands-on review. These exist only in this prototype and change only local demo data. Demo time now: <strong>{formatDateTime(hub.now)}</strong>.</p></div>

      <section className="card stack"><h2>Time</h2>
        <div className="row"><Btn fn={() => hub.demoAdvance(30)} ok="Advanced 30 minutes">Advance 30 min</Btn><Btn fn={() => hub.demoAdvance(90)} ok="Advanced 90 minutes (hour files finalize)">Advance 90 min</Btn><Btn fn={() => hub.demoAdvanceToNextMorning()} ok="It’s next business morning, 7:30 AM CT">Advance to next business morning</Btn></div></section>

      <section className="card stack"><h2>MT Log playback</h2>
        <div className="row">
          <Btn fn={() => hub.demoReleaseFbaHour()} ok="FBA_TY001 events ingested and analyzed">Ingest FBA_TY001 upload events (ERIKAPC 3 PM)</Btn>
          <Btn fn={() => hub.demoLateEvent()} ok="Late event ingested">Simulate late event</Btn>
          <Btn fn={() => hub.demoPartialWrite()} ok="Partially written file ingested (tail held back)">Simulate partially written file</Btn>
          <Btn fn={() => hub.demoHostileFile()} ok="Hostile file name ingested — treated as data">Ingest file name with hostile instructions</Btn></div>
        <p className="small muted">Tip: after the FBA events arrive, check Erika’s review (two upload references, outcome unverified) and Dalia’s project P-081.</p></section>

      <section className="card stack"><h2>Round-trip helpers</h2>
        <div className="row">
          <Btn fn={() => hub.demoSimulateReviewResponse()} ok="Erika replied “Still working” (simulated)">Simulate review response (Erika, “Still working”)</Btn>
          <button onClick={() => act(async () => { hub.clockOut('u-erika', newKey('demo-out')); }, 'Erika clocked out (cards preserved)')}>Simulate clock-out (Erika)</button>
          <button onClick={() => act(() => hub.demoDiscoverSheet(uid), 'Discovered sheet added with SUGGESTED links')} disabled={me.role !== 'OWNER'}>Resource discovery (owner)</button>
          <Btn fn={() => hub.demoNewResourceVersion('r-seo-a')} ok="Newer SEO Master version found (suggested only)">New version of SEO Master</Btn></div></section>

      <section className="card stack"><h2>Failure simulations</h2>
        <label style={{ fontWeight: 500 }}><input type="checkbox" checked={s.aiOutage} onChange={(e) => hub.demoToggle('aiOutage', e.target.checked)} /> AI provider outage</label>
        <label style={{ fontWeight: 500 }}><input type="checkbox" checked={s.logSyncOutage} onChange={(e) => hub.demoToggle('logSyncOutage', e.target.checked)} /> Log sync (Drive) outage</label>
        <p className="small muted">With either on, clock in/out, update requests and notifications still work; readiness text says data may be missing and never shows “0 work”.</p>
        <div className="row"><button onClick={() => {
          // Real data-layer calls as Erika, using a guessed id for the owner-private project.
          const tries = ['getProject', 'getJournal', 'getStep'] as const;
          const out = tries.map((t) => { try { if (t === 'getProject') hub.getProject('u-erika', 'prj-priv'); if (t === 'getJournal') hub.getJournal('u-erika', { projectId: 'prj-priv' }); if (t === 'getStep') hub.getStep('u-erika', 's-priv-1'); return `${t}: allowed (BUG)`; } catch (e) { return `${t}: ${(e as Error).message}`; } });
          setDenied(`As Erika, guessing the private project ids → ${out.join(' · ')}`);
        }}>Simulate permission denial (Erika → private project)</button></div>
        {denied && <div className="card bad small" role="status">{denied}</div>}</section>

      <section className="card stack"><h2>Reset</h2>
        <button className="danger" onClick={async () => { await hub.reset(); try { localStorage.removeItem('mpp-hub-session'); } catch { /* ignore */ } nav('/login'); window.location.reload(); }}>Reset all demo data</button></section>
    </div>
  );
}
