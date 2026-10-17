import { createContext, useCallback, useContext, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react';
import type { HubServer } from '../server/hub';
import { HubError } from '../server/errors';
import type { User } from '../domain/types';

const SESSION_KEY = 'mpp-hub-session';

interface Ctx {
  hub: HubServer;
  uid: string | null;
  setUid: (uid: string | null) => void;
  toast: (msg: string, kind?: 'ok' | 'error') => void;
  toasts: { id: number; msg: string; kind: 'ok' | 'error' }[];
}
const HubCtx = createContext<Ctx | null>(null);

export function HubProvider({ hub, children }: { hub: HubServer; children: ReactNode }) {
  const [uid, setUidState] = useState<string | null>(() => {
    try { return localStorage.getItem(SESSION_KEY); } catch { return null; }
  });
  const [toasts, setToasts] = useState<Ctx['toasts']>([]);
  const setUid = useCallback((u: string | null) => {
    setUidState(u);
    try { u ? localStorage.setItem(SESSION_KEY, u) : localStorage.removeItem(SESSION_KEY); } catch { /* ignore */ }
  }, []);
  const toast = useCallback((msg: string, kind: 'ok' | 'error' = 'ok') => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, msg, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 5000);
  }, []);
  const value = useMemo(() => ({ hub, uid, setUid, toast, toasts }), [hub, uid, setUid, toast, toasts]);
  return <HubCtx.Provider value={value}>{children}</HubCtx.Provider>;
}

/** Re-renders on every committed server change. */
export function useHub(): HubServer {
  const c = useContext(HubCtx)!;
  useSyncExternalStore(c.hub.subscribe, c.hub.getVersion);
  return c.hub;
}
export function useSession() {
  const c = useContext(HubCtx)!;
  return { uid: c.uid, setUid: c.setUid, toast: c.toast, toasts: c.toasts };
}
/** The signed-in demo persona. Throws only if used outside a signed-in route. */
export function useMe(): { hub: HubServer; uid: string; me: User; toast: Ctx['toast'] } {
  const hub = useHub();
  const { uid, toast } = useSession();
  const me = hub.state.users.find((u) => u.id === uid);
  if (!uid || !me) throw new Error('not signed in');
  return { hub, uid, me, toast };
}

/** Wrap an action: shows a friendly message on failure instead of crashing the page. */
export function useAct() {
  const { toast } = useSession();
  return useCallback(async <T,>(fn: () => T | Promise<T>, ok?: string): Promise<T | undefined> => {
    try {
      const r = await fn();
      if (ok) toast(ok);
      return r;
    } catch (e) {
      const msg = e instanceof HubError ? e.message : (e as Error).message || 'Something went wrong';
      toast(msg, 'error');
      return undefined;
    }
  }, [toast]);
}

let counter = 0;
export function newKey(prefix = 'ui'): string {
  counter++;
  return `${prefix}-${Date.now().toString(36)}-${counter}-${Math.random().toString(36).slice(2, 8)}`;
}
