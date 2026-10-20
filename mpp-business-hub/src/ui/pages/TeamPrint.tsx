import { useSearchParams } from 'react-router-dom';
import { Tabs } from '../common';
import { OwnerTeam } from './OwnerTeam';
import { OwnerPrintWeekly } from './OwnerPrintWeekly';
import { OwnerOtherWork } from './OwnerOtherWork';
import { OwnerInsights } from './OwnerInsights';
import { useMe } from '../hubContext';
import { Errors } from './Errors';
import { PrintTeam } from './PrintTeam';
import { PrintVerification } from './PrintVerification';

type Tab = 'team' | 'printteam' | 'verify' | 'errors' | 'print' | 'other' | 'ideas';

/** Team, weekly printing, work that may not belong to a project, and print ideas: one place, four tabs. */
export function TeamPrint() {
  const [sp, setSp] = useSearchParams();
  const { hub, uid } = useMe();
  const tab = (sp.get('tab') as Tab) || 'team';
  const waiting = hub.otherWork(uid).waiting.length;
  return (
    <div className="stack">
      <div><h1>Team &amp; Print</h1><p className="muted" style={{ margin: 0 }}>Who does what, how printing went this week, and work that may not belong to a project.</p></div>
      <Tabs<Tab> tabs={[{ id: 'team', label: 'Team' }, { id: 'printteam', label: 'Print team' }, { id: 'verify', label: 'Print verification' }, { id: 'errors', label: 'Customer service errors' }, { id: 'print', label: 'Weekly printing' }, { id: 'other', label: `Work that may not belong to a project${waiting ? ` (${waiting})` : ''}` }, { id: 'ideas', label: 'Print ideas' }]} value={tab} onChange={(t) => setSp({ tab: t })} />
      {tab === 'team' && <OwnerTeam embedded />}
      {tab === 'printteam' && <PrintTeam />}
      {tab === 'verify' && <PrintVerification embedded />}
      {tab === 'errors' && <Errors embedded />}
      {tab === 'print' && <OwnerPrintWeekly embedded />}
      {tab === 'other' && <OwnerOtherWork embedded />}
      {tab === 'ideas' && <OwnerInsights embedded />}
    </div>
  );
}
