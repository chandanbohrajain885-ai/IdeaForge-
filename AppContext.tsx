import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { User } from '@supabase/supabase-js';
import type { HealthStatus } from './Types';
import { fetchHealth } from './AIService';
import { supabase, supabaseConfigured } from './SupabaseClient';
import { setCloudUser, storageMode } from './ProjectService';

type ToastKind = 'success' | 'error' | 'info';
interface Toast {
  id: number;
  kind: ToastKind;
  message: string;
}

interface AppState {
  health: HealthStatus | null;
  aiLive: boolean;
  refreshHealth: () => Promise<void>;
  user: User | null;
  authReady: boolean;
  supabaseConfigured: boolean;
  storage: 'cloud' | 'local' | 'memory';
  signOut: () => Promise<void>;
  toast: (message: string, kind?: ToastKind) => void;
  lastProjectId: string | null;
  setLastProjectId: (id: string | null) => void;
}

const Ctx = createContext<AppState | null>(null);

export function useApp(): AppState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useApp must be used inside <AppProvider>');
  return v;
}

const LAST_KEY = 'ideaforge.lastProject';

function readLast(): string | null {
  try {
    return window.localStorage.getItem(LAST_KEY);
  } catch {
    return null;
  }
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(!supabaseConfigured);
  const [storage, setStorage] = useState<'cloud' | 'local' | 'memory'>(storageMode());
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [lastProjectId, setLastState] = useState<string | null>(readLast());
  const idRef = useRef(0);

  const refreshHealth = useCallback(async () => {
    setHealth(await fetchHealth());
  }, []);

  useEffect(() => {
    void refreshHealth();
  }, [refreshHealth]);

  useEffect(() => {
    if (!supabase) return;
    let active = true;
    const apply = (u: User | null) => {
      setCloudUser(u?.id ?? null);
      setUser(u);
      setStorage(storageMode());
    };
    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (active) apply(data.session?.user ?? null);
      })
      .catch(() => {
        if (active) apply(null);
      })
      .finally(() => {
        if (active) setAuthReady(true);
      });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      apply(session?.user ?? null);
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const toast = useCallback((message: string, kind: ToastKind = 'info') => {
    const id = ++idRef.current;
    setToasts((t) => [...t.slice(-3), { id, kind, message }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === 'error' ? 7000 : 4000);
  }, []);

  const signOut = useCallback(async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
    setCloudUser(null);
    setUser(null);
    setStorage(storageMode());
  }, []);

  const setLastProjectId = useCallback((id: string | null) => {
    setLastState(id);
    try {
      if (id) window.localStorage.setItem(LAST_KEY, id);
      else window.localStorage.removeItem(LAST_KEY);
    } catch {
      /* storage unavailable - ignore */
    }
  }, []);

  const value = useMemo<AppState>(
    () => ({
      health,
      aiLive: Boolean(health?.aiConfigured),
      refreshHealth,
      user,
      authReady,
      supabaseConfigured,
      storage,
      signOut,
      toast,
      lastProjectId,
      setLastProjectId,
    }),
    [health, refreshHealth, user, authReady, storage, signOut, toast, lastProjectId, setLastProjectId],
  );

  return (
    <Ctx.Provider value={value}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.kind}`}>
            <span>{t.message}</span>
            <button type="button" aria-label="Dismiss" onClick={() => setToasts((x) => x.filter((y) => y.id !== t.id))}>
              ×
            </button>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}
