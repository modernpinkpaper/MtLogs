import { Component } from 'react';
import type { ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useMe } from './hubContext';
import { PermissionDeniedView } from './pages/permissionView';

/** Pages only Dalia may open. Everyone else gets the same “permission denied” page, so nothing is revealed. */
export function OwnerOnly({ children }: { children: ReactNode }) {
  const { me } = useMe();
  return me.role === 'OWNER' ? <>{children}</> : <PermissionDeniedView />;
}

interface State { error: Error | null }
/** If a page breaks, show a plain message with a way out instead of a white screen. It resets when you go to another page. */
class Boundary extends Component<{ children: ReactNode; path: string }, State> {
  state: State = { error: null };
  static getDerivedStateFromError(error: Error): State { return { error }; }
  componentDidUpdate(prev: { path: string }) { if (prev.path !== this.props.path && this.state.error) this.setState({ error: null }); }
  render() {
    if (!this.state.error) return this.props.children;
    const denied = /permission denied/i.test(this.state.error.message);
    return (
      <div className="card bad" role="alert">
        <h1>{denied ? 'Permission denied' : 'Something went wrong on this page'}</h1>
        <p>{denied ? 'You cannot open this page.' : 'Your work is saved. Nothing was lost. Go back to Home and try again.'}</p>
        <Link to="/home"><button className="primary">Back to Home</button></Link>
      </div>
    );
  }
}
export function PageBoundary({ children }: { children: ReactNode }) {
  const loc = useLocation();
  return <Boundary path={loc.pathname + loc.search}>{children}</Boundary>;
}
