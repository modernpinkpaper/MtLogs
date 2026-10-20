import { Link, useLocation } from 'react-router-dom';
import { useMe } from './hubContext';

interface Crumb { label: string; to?: string }

/** Where you are, like a folder path. Every step is a link, and "Back" goes up one level. Top-level pages show nothing. */
function useTrail(): Crumb[] {
  const { hub, uid } = useMe();
  const loc = useLocation();
  const path = loc.pathname; const q = new URLSearchParams(loc.search); const tab = q.get('tab');
  const safe = <T,>(fn: () => T, d: T): T => { try { return fn(); } catch { return d; } };

  let m = /^\/projects\/([^/]+)(?:\/steps\/([^/]+))?$/.exec(path);
  if (m) {
    const key = safe(() => hub.getProject(uid, m![1]).key, 'Project');
    const t: Crumb[] = [{ label: 'Projects', to: '/projects' }, { label: key, to: `/projects/${m[1]}` }];
    if (m[2]) t.push({ label: `Step ${safe(() => hub.stepLabelsFor(uid, m![1]).get(m![2]!) ?? '', '')}`, to: `/projects/${m[1]}/steps/${m[2]}` });
    if (tab === 'files') t.push({ label: 'All files' }); else if (tab === 'history') t.push({ label: 'History' }); else if (tab === 'more') t.push({ label: 'More' });
    t[t.length - 1] = { label: t[t.length - 1].label };
    return t;
  }
  m = /^\/owner\/ai\/([^/]+)$/.exec(path);
  if (m) return [{ label: 'Home', to: '/home' }, { label: 'AI recommendations', to: '/owner/ai' }, { label: safe(() => hub.state.ownerFindings.find((f) => f.id === m![1])?.code ?? 'Recommendation', 'Recommendation') }];
  if (path === '/owner/ai') {
    if (tab === 'priorities' || tab === 'goals' || tab === 'sources') return [{ label: 'Settings', to: '/settings' }, { label: 'Priorities and sources' }];
    if (tab === 'results') return [{ label: 'Settings', to: '/settings' }, { label: 'Results tracker' }];
    return [{ label: 'Home', to: '/home' }, { label: 'AI recommendations' }];
  }
  if (path === '/owner/data-intake') return [{ label: 'Settings', to: '/settings' }, { label: 'Computer activity & AI cost' }];
  if (path === '/review') return [{ label: 'Home', to: '/home' }, { label: 'Answer and confirm' }];
  if (path === '/owner/team' && tab && tab !== 'team') return [{ label: 'Team & Print', to: '/owner/team' }, { label: ({ printteam: 'Print team', verify: 'Print verification', errors: 'Customer service errors', print: 'Weekly printing', other: 'Work that may not belong to a project', ideas: 'Print ideas' } as Record<string, string>)[tab] ?? tab }];
  if (path === '/status' || path === '/demo/operations') return [{ label: 'Settings', to: '/settings' }, { label: path === '/status' ? 'What works in this practice copy' : 'Demo controls' }];
  return [];
}

export function Breadcrumbs() {
  const trail = useTrail();
  if (trail.length === 0) return null;
  const parent = [...trail].reverse().find((c, i) => i > 0 && c.to) ?? trail.find((c) => c.to);
  return (
    <nav className="crumbs" aria-label="Breadcrumb">
      {parent?.to && <Link className="crumb-back" to={parent.to} aria-label={`Back to ${parent.label}`}>← Back</Link>}
      <ol>
        {trail.map((c, i) => (
          <li key={i} aria-current={i === trail.length - 1 ? 'page' : undefined}>{c.to && i < trail.length - 1 ? <Link to={c.to}>{c.label}</Link> : <span>{c.label}</span>}{i < trail.length - 1 && <span aria-hidden="true" className="sep"> › </span>}</li>
        ))}
      </ol>
    </nav>
  );
}
