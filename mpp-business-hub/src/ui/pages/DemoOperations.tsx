import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAct, useMe, newKey } from '../hubContext';
import { Chip } from '../common';
import { formatDateTime } from '../../domain/time';

const OWNER = 'u-dalia';
const SKUS = Array.from({ length: 20 }, (_, i) => `MA${String(41 + i).padStart(3, '0')}`);

/** Buttons to play out a pretend day. They change only the practice data. */
export function DemoOperations() {
  const { hub, uid, me } = useMe();
  const act = useAct();
  const nav = useNavigate();
  const [denied, setDenied] = useState<string | null>(null);
  const s = hub.state.settings;
  const B = ({ children, fn, ok, tip }: { children: string; fn: () => unknown; ok: string; tip?: string }) => <button title={tip} onClick={() => act(fn, ok)}>{children}</button>;
  const pause = (id: string, input: Parameters<typeof hub.pauseProject>[2]) => hub.pauseProject(OWNER, id, input);

  return (
    <div className="stack">
      <div><h1>Demo controls <Chip tone="violet" glyph="◆">Demo only</Chip></h1><p className="muted" style={{ margin: 0 }}>Buttons to play out a pretend day. They only change the practice data. Pretend time now: <strong>{formatDateTime(hub.now)}</strong>.</p></div>

      <section className="card stack"><h2>Pausing a project</h2>
        <p className="small muted" style={{ margin: 0 }}>These act as Dalia. After each one, open the project to see the result, then switch to Erika to see her side.</p>
        <div className="row">
          <B fn={() => pause('prj-070', { reasonCode: 'HIGHER_PRIORITY', idempotencyKey: newKey('d') })} ok="P-070 is paused until you resume it">1. Pause “P-070” until I resume</B>
          <B fn={() => pause('prj-044', { reasonCode: 'SEASONAL', mode: 'AUTOMATIC_ON_DATE', resumeDateLocal: '2026-10-30', idempotencyKey: newKey('d') })} ok="P-044 will resume by itself on Oct 30">2. Pause “P-044” and resume it by itself on Oct 30</B>
          <B fn={() => pause('prj-012', { reasonCode: 'TESTING_SMALLER_BATCH', reasonNote: 'Testing 20 listings before expanding', mode: 'REMIND_ON_DATE', resumeDateLocal: '2026-10-30', idempotencyKey: newKey('d') })} ok="P-012 is paused. You will be reminded on Oct 30">3. Pause “P-012” and remind me to decide on Oct 30</B>
        </div>
        <div className="row">
          <B fn={() => hub.demoAdvanceToDate('2026-10-30')} ok="It is now Oct 30. The morning status check ran.">Skip to Oct 30</B>
          <B fn={() => hub.processSchedules()} ok="The status check ran again. Nothing happens twice.">Run the status check again</B>
          <B fn={() => pause('prj-081', { reasonCode: 'WAITING', idempotencyKey: newKey('d') })} ok="P-081 is paused">Pause “P-081”</B>
          <B fn={() => hub.demoReleaseFbaHour()} ok="Computer activity arrived (see Erika’s review)">Add computer activity on the paused “P-081”</B>
        </div>
      </section>

      <section className="card stack"><h2>A limited test (20 listings)</h2>
        <div className="row">
          <B fn={() => hub.configurePilot(OWNER, 'prj-012', { stepId: 's-012-3', metricType: 'VERIFIED_LISTINGS', metricLabel: 'verified listings', targetCount: 20, scopeLabel: '“SEO Master” copy A, rows MA041 to MA060.', skus: SKUS, idempotencyKey: newKey('d') })} ok="Test set up on P-012">1. Set up the 20-listing test on “P-012”</B>
          <B fn={() => { for (const k of SKUS) hub.recordPilotRow(OWNER, 'prj-012', k, 'UPLOADED'); hub.verifyPilotRows(OWNER, 'prj-012', SKUS.slice(0, 19), 'Found live in Shopify with correct options'); }} ok="19 of 20 are checked. The 20th is uploaded but not checked.">2. Show 19 of 20 checked</B>
          <B fn={() => hub.verifyPilotRows(OWNER, 'prj-012', [SKUS[19]], 'Result page confirms the listing')} ok="20 of 20 checked. You have a notification.">3. Check the 20th item</B>
        </div>
        <p className="small muted" style={{ margin: 0 }}>After step 3, open P-012 as Dalia: review the results, then “Approve next batch”.</p>
      </section>

      <section className="card stack"><h2>AI recommendations</h2>
        <div className="row">
          <B fn={() => hub.runAiScan(OWNER)} ok="A practice scan ran. Repeats were not made twice.">Run a scan (practice)</B>
          <B fn={() => hub.demoDriveFailAfter(2)} ok="The next project folder will fail after 2 steps (practice)">Make the next folder fail halfway</B>
          <B fn={() => hub.demoDriveFailAfter(null)} ok="Folder failures are off">Stop the folder failures</B>
        </div>
      </section>

      <section className="card stack"><h2>Time</h2>
        <div className="row"><B fn={() => hub.demoAdvance(30)} ok="Skipped ahead 30 minutes">Skip ahead 30 minutes</B><B fn={() => hub.demoAdvance(90)} ok="Skipped ahead 90 minutes. Hourly files are now final.">Skip ahead 90 minutes</B><B fn={() => hub.demoAdvanceToNextMorning()} ok="It is the next work morning, 7:30 AM">Skip to the next work morning</B></div></section>

      <section className="card stack"><h2>Pretend computer activity</h2>
        <div className="row">
          <B fn={() => hub.demoReleaseFbaHour()} ok="The “FBA_TY001” upload events arrived">Add the “FBA_TY001” upload events (3 PM)</B>
          <B fn={() => hub.demoLateEvent()} ok="A late event arrived">Add a late event</B>
          <B fn={() => hub.demoPartialWrite()} ok="A half-saved file arrived. The unfinished end was held back.">Add a half-saved file</B>
          <B fn={() => hub.demoHostileFile()} ok="The file name tried to give orders. We treated it as plain text.">Add a file whose name tries to give orders</B></div></section>

      <section className="card stack"><h2>Shortcuts</h2>
        <div className="row">
          <B fn={() => hub.demoSimulateReviewResponse()} ok="Erika answered “Still working on it”">Pretend Erika answers “Still working on it”</B>
          <button onClick={() => act(async () => { hub.clockOut('u-erika', newKey('demo-out')); }, 'Erika clocked out. Her cards are saved.')}>Pretend Erika clocks out</button>
          <button disabled={me.role !== 'OWNER'} onClick={() => act(() => hub.demoDiscoverSheet(uid), 'A new file was found, with suggested links')}>Find a new file (owner)</button>
          <B fn={() => hub.demoNewResourceVersion('r-seo-a')} ok="A newer “SEO Master” version was found. It is only a suggestion.">New version of “SEO Master”</B></div></section>

      <section className="card stack"><h2>Pretend problems</h2>
        <label style={{ fontWeight: 500 }}><input type="checkbox" checked={s.aiOutage} onChange={(e) => hub.demoToggle('aiOutage', e.target.checked)} /> The AI helper stops working</label>
        <label style={{ fontWeight: 500 }}><input type="checkbox" checked={s.logSyncOutage} onChange={(e) => hub.demoToggle('logSyncOutage', e.target.checked)} /> Computer activity arrives late (Drive is down)</label>
        <p className="small muted" style={{ margin: 0 }}>With either on, clocking in and out, requests and notifications still work. The screens say activity may be missing. They never say “no work”.</p>
        <div className="row"><button onClick={() => {
          const tries = ['project', 'history', 'step', 'AI recommendations'] as const;
          const out = tries.map((t) => { try { if (t === 'project') hub.getProject('u-erika', 'prj-priv'); if (t === 'history') hub.getJournal('u-erika', { projectId: 'prj-priv' }); if (t === 'step') hub.getStep('u-erika', 's-priv-1'); if (t === 'AI recommendations') hub.listFindings('u-erika'); return `${t}: allowed (BUG)`; } catch (e) { return `${t}: ${(e as Error).message}`; } });
          setDenied(`As Erika, trying private and owner-only things → ${out.join(' · ')}`);
        }}>Try owner-only things as Erika</button></div>
        {denied && <div className="card bad small" role="status">{denied}</div>}</section>

      <section className="card stack"><h2>Start over</h2>
        <button className="danger" onClick={async () => { await hub.reset(); try { localStorage.removeItem('mpp-hub-session'); } catch { /* ignore */ } nav('/login'); window.location.reload(); }}>Reset all practice data</button></section>
    </div>
  );
}
