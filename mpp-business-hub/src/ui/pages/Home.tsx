import { useMe } from '../hubContext';
import { OwnerOverview } from './OwnerOverview';
import { EmployeeHome } from './EmployeeHome';

export function Home() {
  const { me } = useMe();
  return me.role === 'OWNER' ? <OwnerOverview /> : <EmployeeHome />;
}
