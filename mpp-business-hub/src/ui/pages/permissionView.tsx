import { Link } from 'react-router-dom';

/** The same page for "not found" and "not allowed", so nothing is revealed. */
export function PermissionDeniedView() {
  return <div className="card bad" role="alert"><h1>Permission denied</h1><p>You cannot open this page.</p><Link to="/home">Back to Home</Link></div>;
}
