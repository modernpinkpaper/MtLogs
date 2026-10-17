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
      <div><h1>Demo controls <Chip tone="violet" glyph="◆">Demo only</Chip></h1><p className="muted">Buttons to play out a pretend day. They only change the practice data. Pretend time now: <strong>{formatDateTime(hub.now)}</strong>.</p></div>

      <section className="card stack"><h2>Time</h2>
        <div className="row"><Btn fn={() => hub.demoAdvance(30)} ok="Advanced 30 minutes">Skip ahead 30 minutes</Btn><Btn fn={() => hub.demoAdvance(90)} ok="Advanced 90 minutes (hour files finalize)">Skip ahead 90 minutes</Btn><Btn fn={() => hub.demoAdvanceToNextMorning()} ok="It’s next business morning, 7:30 AM CT">Skip to the next work morning</Btn></div></section>

      <section className="card stack"><h2>Pretend computer activity</h2>
        <div className="row">
          <Btn fn={() => hub.demoReleaseFbaHour()} ok="FBA_TY001 events ingested and analyzed">Add the “FBA_TY001” upload events (Erika’s computer, 3 PM)</Btn>
          <Btn fn={() => hub.demoLateEvent()} ok="Late event ingested">Add a late event</Btn>
          <Btn fn={() => hub.demoPartialWrite()} ok="Partially written file ingested (tail held back)">Add a half-saved file</Btn>
          <Btn fn={() => hub.demoHostileFile()} ok="Hostile file name ingested — treated as data">Add a file whose name tries to give orders</Btn></div>
        <p className="small muted">Tip: after the events arrive, look at Erika’s review (two upload numbers, result not known) and Dalia’s project “P-081”.</p></section>

      <section className="card stack"><h2>Shortcuts</h2>
        <div className="row">
          <Btn fn={() => hub.demoSimulateReviewResponse()} ok="Erika replied “Still working” (pretend)">Pretend Erika answers “Still working”</Btn>
          <button onClick={() => act(async () => { hub.clockOut('u-erika', newKey('demo-out')); }, 'Erika clocked out (cards preserved)')}>Pretend Erika clocks out</button>
          <button onClick={() => act(() => hub.demoDiscoverSheet(uid), 'Discovered sheet added with SUGGESTED links')} disabled={me.role !== 'OWNER'}>Find a new file (owner)</button>
          <Btn fn={() => hub.demoNewResourceVersion('r-seo-a')} ok="Newer SEO Master version found (suggested only)">New version of “SEO Master”</Btn></div></section>

      <section className="card stack"><h2>Pretend problems</h2>
        <label style={{ fontWeight: 500 }}><input type="checkbox" checked={s.aiOutage} onChange={(e) => hub.demoToggle('aiOutage', e.target.checked)} /> The AI helper stops working</label>
        <label style={{ fontWeight: 500 }}><input type="checkbox" checked={s.logSyncOutage} onChange={(e) => hub.demoToggle('logSyncOutage', e.target.checked)} /> Computer data is late (Drive down)</label>
        <p className="small muted">With either one on, clocking in and out, requests and notifications still work. The screens say data may be missing. They never say “0 work.”</p>
        <div className="row"><button onClick={() => {
          // Real data-layer calls as Erika, using a guessed id for the owner-private project.
          const tries = ['getProject', 'getJournal', 'getStep'] as const;
          const out = tries.map((t) => { try { if (t === 'getProject') hub.getProject('u-erika', 'prj-priv'); if (t === 'getJournal') hub.getJournal('u-erika', { projectId: 'prj-priv' }); if (t === 'getStep') hub.getStep('u-erika', 's-priv-1'); return `${t}: allowed (BUG)`; } catch (e) { return `${t}: ${(e as Error).message}`; } });
          setDenied(`As Erika, trying the private project → ${out.join(' · ')}`);
        }}>Try to open the private project as Erika</button></div>
        {denied && <div className="card bad small" role="status">{denied}</div>}</section>

      <section className="card stack"><h2>Start over</h2>
        <button className="danger" onClick={async () => { await hub.reset(); try { localStorage.removeItem('mpp-hub-session'); } catch { /* ignore */ } nav('/login'); window.location.reload(); }}>Reset all practice data</button></section>
    </div>
  );
}
