import { useEffect, useRef, useState } from 'react';
import { REAL_MODE } from '../server/realLoader';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useMe, useSession } from './hubContext';
import { formatDateTime, formatTime } from '../domain/time';
import { Chip } from './common';

interface Item { to: string; label: string; icon: string; badge?: number; match?: string[] }

export function Layout() {
  const { hub, uid, me } = useMe();
  const { setUid } = useSession();
  const nav = useNavigate();
  const loc = useLocation();
  const [moreOpen, setMoreOpen] = useState(false);
  const [q, setQ] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);
  const owner = me.role === 'OWNER';
  const counts = hub.counts(uid);
  const shift = hub.openShift(uid);
  const area = hub.areaOn(uid);
  const hits = q.trim().length > 1 ? hub.searchAll(uid, q) : [];
  const urgentAi = owner ? hub.inboxSummary(uid).needsDecision : 0;

  useEffect(() => { setMoreOpen(false); }, [loc.pathname]);

  // Five main places per role. Everything else lives under "More" (two taps at most).
  const primary: Item[] = owner
    ? [
        { to: '/home', label: 'Home', icon: '⌂' },
        { to: '/projects', label: 'Projects', icon: '▤', match: ['/projects'] },
        { to: '/owner/ai', label: 'AI Recommendations', icon: '✦', badge: urgentAi, match: ['/owner/ai'] },
        { to: '/owner/team', label: 'Team & Print', icon: '☺', match: ['/owner/team', '/owner/print-weekly', '/owner/other-work', '/owner/insights'] },
        { to: '/notifications', label: 'Notifications', icon: '🔔', badge: counts.unreadNotifications },
      ]
    : [
        { to: '/home', label: 'Home', icon: '⌂', badge: counts.pendingCards + counts.unreadNotifications },
        { to: '/projects', label: 'Projects', icon: '▤', match: ['/projects'] },
        { to: '/clock', label: 'Clock', icon: '⏱' },
        ...(area === 'PRINT' || area === 'MIXED' ? [{ to: '/print/my-stats', label: 'My printing', icon: '🖨' }] : []),
      ];
  const more: Item[] = [
    { to: '/review', label: 'Review my work', icon: '✓', badge: counts.pendingCards },
    ...(owner ? [] : [{ to: '/notifications', label: 'Notifications', icon: '🔔', badge: counts.unreadNotifications }]),
    { to: '/journal', label: 'History', icon: '✎' },
    { to: '/resources', label: 'Files', icon: '⧉' },
    ...(owner ? [{ to: '/owner/data-intake', label: 'Computer activity & AI cost', icon: '⇩' }] : []),
    { to: '/settings', label: 'Settings', icon: '⚙' },
    { to: '/status', label: 'What works in this practice copy', icon: '☰' },
    { to: '/demo/operations', label: 'Demo controls', icon: '▶' },
  ];
  const isActive = (it: Item) => (it.match ? it.match.some((m) => loc.pathname.startsWith(m)) : loc.pathname === it.to);

  return (
    <div className="app">
      <aside className="side" aria-label="Main navigation">
        <div className="brand">MPP Business Hub<small>{REAL_MODE ? 'Private copy · real tracker data' : 'Practice copy · made-up data'}</small></div>
        <nav className="nav">
          {primary.map((it) => (
            <Link key={it.to} to={it.to} className={isActive(it) ? 'active' : ''} aria-current={isActive(it) ? 'page' : undefined}>
              <span aria-hidden="true">{it.icon}</span> {it.label} {it.badge ? <span className="badge" aria-label={`${it.badge} waiting`}>{it.badge}</span> : null}
            </Link>
          ))}
          <details className="more" open={more.some((m) => loc.pathname.startsWith(m.to))}>
            <summary className="group">More</summary>
            {more.map((it) => (
              <NavLink key={it.to} to={it.to} className={({ isActive: a }) => (a ? 'active' : '')}><span aria-hidden="true">{it.icon}</span> {it.label} {it.badge ? <span className="badge">{it.badge}</span> : null}</NavLink>
            ))}
          </details>
        </nav>
      </aside>
      <div className="main">
        <div className="demo-banner" role="note">
          {REAL_MODE ? <><strong>Private copy</strong> · real tracker data from Oct 18 · read-only snapshot, nothing is sent back · for Dalia only</> : <><strong>Practice copy</strong> · made-up data · not connected to anything real</>} · {REAL_MODE ? 'snapshot time' : 'pretend time'} {formatDateTime(hub.now)}
        </div>
        <header className="topbar">
          <div className="searchbox">
            <input ref={searchRef} type="search" placeholder="Search projects, steps, files, SKUs…" aria-label="Search" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === 'Escape') setQ(''); }} />
            {q.trim().length > 1 && (
              <div className="card results" role="listbox" aria-label="Search results">
                {!hits.length && <span className="muted">Nothing matches “{q}”. Try a project number like P-012, a SKU, or a file name.</span>}
                {hits.map((h) => (
                  <Link key={`${h.kind}${h.id}`} to={h.link} onClick={() => setQ('')} className="hit">
                    <span className="hit-kind">{h.kind}</span>
                    <span><strong>{h.title}</strong><br /><span className="small muted">{h.why}</span></span>
                  </Link>
                ))}
              </div>
            )}
          </div>
          <span className="spacer" />
          {!owner && <Chip tone={shift ? 'ok' : 'gray'} glyph={shift ? '●' : '○'}>{shift ? `Clocked in ${formatTime(shift.clockInAt)}` : 'Clocked out'}</Chip>}
          <button className="bell ghost" onClick={() => nav('/notifications')} aria-label={`Notifications, ${counts.unreadNotifications} unread`}>
            🔔{counts.unreadNotifications > 0 && <span className="badge" aria-hidden="true">{counts.unreadNotifications}</span>}
          </button>
          <label className="row" style={{ margin: 0, fontWeight: 500 }}>
                        <select aria-label="Switch demo user" style={{ width: 'auto' }} value={uid} onChange={(e) => { setUid(e.target.value); nav('/home'); }}>
              {hub.state.users.filter((u) => u.active).map((u) => <option key={u.id} value={u.id}>{u.name}{u.role === 'OWNER' ? ' (owner)' : ''}</option>)}
            </select>
          </label>
          <button className="hide-sm" onClick={() => { setUid(null); nav('/login'); }}>Sign out</button>
        </header>
        <main id="main" className="content" tabIndex={-1}>
          <Outlet />
        </main>
      </div>

      <nav className="bottomnav" aria-label="Main navigation (phone)">
        {primary.slice(0, 5).map((it) => (
          <Link key={it.to} to={it.to} className={isActive(it) ? 'active' : ''}>
            <span aria-hidden="true" className="ic">{it.icon}{it.badge ? <span className="badge">{it.badge}</span> : null}</span>
            <span className="lb">{it.label.replace('AI Recommendations', 'AI').replace('Review my work', 'Review').replace('Notifications', 'Alerts')}</span>
          </Link>
        ))}
        <button className={moreOpen ? 'active' : ''} onClick={() => setMoreOpen((o) => !o)} aria-expanded={moreOpen}><span aria-hidden="true" className="ic">☰</span><span className="lb">More</span></button>
      </nav>
      {moreOpen && (
        <div className="sheet" role="dialog" aria-label="More">
          {primary.slice(5).map((it) => <Link key={it.to} to={it.to}>{it.icon} {it.label}</Link>)}
          {more.map((it) => <Link key={it.to} to={it.to}>{it.icon} {it.label}</Link>)}
          <button onClick={() => { setUid(null); nav('/login'); }}>Sign out</button>
        </div>
      )}
    </div>
  );
}
