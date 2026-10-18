import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAct, useMe } from '../hubContext';
import { Chip, Empty } from '../common';
import { formatDateTime } from '../../domain/time';
import { chicagoDate } from '../../domain/time';
import type { Notification, NotificationType } from '../../domain/types';

const LABEL: Record<NotificationType, string> = {
  OWNER_UPDATE_REQUEST: 'Request for an update', FOLLOW_UP: 'Follow-up request', EMPLOYEE_RESPONSE: 'Answer from an employee', NEEDS_VERIFICATION: 'Needs a check in the source system', BLOCKER: 'Needs help',
  MISSING_COVERAGE: 'Some activity is missing', DAILY_DIGEST: 'Daily summary', WEEKLY_PRINT_INSIGHT: 'Weekly printing', DIRECT_MENTION: 'Project note', PROJECT_PAUSED: 'Project paused', PROJECT_RESUMED: 'Project active again',
  RESUME_REMINDER: 'Time to decide', PAUSE_SUGGESTION: 'Suggestion', PILOT_REACHED: 'Test finished', AI_FINDING: 'AI recommendation', PROJECT_ASSIGNED: 'New project',
};
const OPEN_LABEL: Partial<Record<NotificationType, string>> = {
  OWNER_UPDATE_REQUEST: 'Answer', FOLLOW_UP: 'Answer', EMPLOYEE_RESPONSE: 'Open update', BLOCKER: 'Open', RESUME_REMINDER: 'Decide', PILOT_REACHED: 'Review results', PROJECT_PAUSED: 'Open project', PROJECT_RESUMED: 'Open project',
  AI_FINDING: 'Open recommendation', PAUSE_SUGGESTION: 'Open project', PROJECT_ASSIGNED: 'Open project', DAILY_DIGEST: 'Open', NEEDS_VERIFICATION: 'Open',
};
const NEEDS_ACTION: NotificationType[] = ['OWNER_UPDATE_REQUEST', 'FOLLOW_UP', 'RESUME_REMINDER', 'PAUSE_SUGGESTION', 'PILOT_REACHED', 'EMPLOYEE_RESPONSE', 'AI_FINDING', 'BLOCKER', 'NEEDS_VERIFICATION'];
const ACK_TYPES: NotificationType[] = ['EMPLOYEE_RESPONSE', 'BLOCKER', 'NEEDS_VERIFICATION', 'PAUSE_SUGGESTION'];

export function Notifications() {
  const { hub, uid } = useMe();
  const act = useAct();
  const nav = useNavigate();
  const [filter, setFilter] = useState<'all' | 'unread' | 'action'>('all');
  const [type, setType] = useState('');
  const all = hub.listNotifications(uid).filter((n) => (!n.snoozedUntil || n.snoozedUntil <= hub.now) && (!type || n.type === type)
    && (filter === 'all' || (filter === 'unread' ? !n.readAt : NEEDS_ACTION.includes(n.type) && !n.acknowledgedAt && !n.readAt)));
  // Urgent first, then newest. Repeated items about the same thing on the same day are grouped.
  const urgent = (n: Notification) => (n.type === 'BLOCKER' || n.title.startsWith('Urgent') ? 0 : 1);
  const sorted = [...all].sort((a, b) => urgent(a) - urgent(b) || b.createdAt.localeCompare(a.createdAt));
  const groups = new Map<string, Notification[]>();
  for (const n of sorted) {
    const k = `${n.type}|${n.projectId}|${n.stepId}|${chicagoDate(n.createdAt)}`;
    groups.set(k, [...(groups.get(k) ?? []), n]);
  }
  const unread = hub.unreadCount(uid);

  return (
    <div className="stack">
      <div className="row between">
        <div><h1>Notifications</h1><p className="muted" style={{ margin: 0 }}>{unread ? `${unread} unread.` : 'You are all caught up.'} These are saved in the app. Email and phone alerts are not part of this practice copy.</p></div>
        <button onClick={() => act(() => hub.markAllRead(uid))} disabled={!unread}>Mark all as read</button>
      </div>
      <div className="row" role="group" aria-label="Show">
        <button className="pill-btn" aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>All</button>
        <button className="pill-btn" aria-pressed={filter === 'unread'} onClick={() => setFilter('unread')}>Unread</button>
        <button className="pill-btn" aria-pressed={filter === 'action'} onClick={() => setFilter('action')}>Needs an answer or a decision</button>
        <details className="small"><summary>More filters</summary>
          <select aria-label="Type" style={{ width: 'auto', marginTop: 6 }} value={type} onChange={(e) => setType(e.target.value)}><option value="">All kinds</option>{Object.entries(LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></details>
      </div>
      {groups.size === 0 && <Empty>Nothing here.</Empty>}
      {[...groups.values()].map((g) => g.length === 1 ? <Item key={g[0].id} n={g[0]} /> : <Group key={g[0].id} items={g} />)}
    </div>
  );

  function Item({ n, inGroup }: { n: Notification; inGroup?: boolean }) {
    return (
      <div className={`card ${!n.readAt ? 'pink' : ''} ${inGroup ? 'flat' : ''}`}>
        <div className="row between">
          <div className="row"><Chip tone={n.readAt ? 'gray' : 'pink'} glyph={n.readAt ? '○' : '●'}>{n.readAt ? 'Read' : 'New'}</Chip><Chip tone="gray">{LABEL[n.type]}</Chip>{n.acknowledgedAt && <Chip tone="ok" glyph="✔">Seen</Chip>}</div>
          <span className="small muted">{formatDateTime(n.createdAt)}</span>
        </div>
        <h3 style={{ marginTop: 6 }}>{n.title}</h3>
        <p className="small" style={{ margin: '0 0 .5rem' }}>{n.preview}</p>
        <div className="row">
          <button className="primary" onClick={async () => { await act(() => hub.markRead(uid, n.id)); nav(n.deepLink); }}>{OPEN_LABEL[n.type] ?? 'Open'}</button>
          {!n.acknowledgedAt && ACK_TYPES.includes(n.type) && <button onClick={() => act(() => hub.acknowledge(uid, n.id), 'Marked as seen')}>I saw this</button>}
          {!n.readAt && <button className="link" onClick={() => act(() => hub.markRead(uid, n.id))}>Mark as read</button>}
          <button className="link" onClick={() => act(() => hub.snoozeNotification(uid, n.id, 60), 'We will remind you in 1 hour')}>Remind me in 1 hour</button>
          <button className="link" onClick={() => act(() => hub.dismissNotification(uid, n.id))}>Dismiss</button>
        </div>
      </div>
    );
  }
  function Group({ items }: { items: Notification[] }) {
    const first = items[0];
    return (
      <div className="card">
        <details>
          <summary style={{ cursor: 'pointer' }}><strong>{items.length} notifications:</strong> {LABEL[first.type]} · {first.title.split('—')[0].trim()} {items.some((i) => !i.readAt) && <Chip tone="pink" glyph="●">{items.filter((i) => !i.readAt).length} new</Chip>}</summary>
          <div className="stack" style={{ marginTop: 8 }}>{items.map((n) => <Item key={n.id} n={n} inGroup />)}</div>
        </details>
      </div>
    );
  }
}
