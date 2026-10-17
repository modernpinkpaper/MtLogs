import { useMe } from '../hubContext';
import { OwnerOverview } from './OwnerOverview';
import { MyWork } from './MyWork';

export function Home() {
  const { me } = useMe();
  return me.role === 'OWNER' ? <OwnerOverview /> : <MyWork />;
}
