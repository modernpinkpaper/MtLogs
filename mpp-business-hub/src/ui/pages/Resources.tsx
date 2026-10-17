import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMe } from '../hubContext';
import { Empty } from '../common';
import { ResourceCard } from '../parts';

export function Resources() {
  const { hub, uid } = useMe();
  const [sp] = useSearchParams();
  const [q, setQ] = useState(sp.get('q') ?? '');
  const list = hub.listResources(uid, q);
  return (
    <div className="stack">
      <div><h1>Resources</h1><p className="muted">Documents, sheets, scripts and paths you’re authorized to see. One record per file, linked to many steps.</p></div>
      <input type="search" aria-label="Search resources" placeholder="Search by name, purpose, path or SKU family…" value={q} onChange={(e) => setQ(e.target.value)} style={{ maxWidth: 420 }} />
      {list.length === 0 && <Empty>No resources match.</Empty>}
      <div className="grid cols-2">{list.map(({ resource, links }) => <ResourceCard key={resource.id} resource={resource} links={links} />)}</div>
    </div>
  );
}
