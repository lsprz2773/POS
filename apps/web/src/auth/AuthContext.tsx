import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { loginRequestSchema, meResponseSchema, type ErrorCode, type MeResponse } from '@pos/shared';
import { ApiError, apiGet, apiPost, onSessionExpired } from '../api/client';

export type AuthState =
  | { status: 'loading' }
  | { status: 'unauthenticated'; expired: boolean }
  | { status: 'authenticated'; me: MeResponse }
  | { status: 'blocked'; code: 'store_not_configured' | 'tenant_disabled' }
  | { status: 'error' };

interface AuthApi {
  state: AuthState;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  reload: () => Promise<void>;
}

const AuthContext = createContext<AuthApi | null>(null);

const BLOCKED: ErrorCode[] = ['store_not_configured', 'tenant_disabled'];

function stateFromError(error: unknown): AuthState {
  if (error instanceof ApiError && error.status === 401) {
    return { status: 'unauthenticated', expired: false };
  }
  if (error instanceof ApiError && error.code && BLOCKED.includes(error.code)) {
    return { status: 'blocked', code: error.code as 'store_not_configured' | 'tenant_disabled' };
  }
  return { status: 'error' };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'loading' });

  const reload = useCallback(async () => {
    try {
      const me = await apiGet('/api/me', meResponseSchema);
      setState({ status: 'authenticated', me });
    } catch (error) {
      setState((current) => {
        const next = stateFromError(error);
        return next.status === 'unauthenticated' && current.status === 'unauthenticated'
          ? current
          : next;
      });
    }
  }, []);

  useEffect(
    () => onSessionExpired(() => setState({ status: 'unauthenticated', expired: true })),
    [],
  );

  // Carga inicial de la sesión: se suscribe a la API (sistema externo); el estado se fija al responder.
  useEffect(() => {
    let active = true;
    apiGet('/api/me', meResponseSchema)
      .then((me) => active && setState({ status: 'authenticated', me }))
      .catch((error: unknown) => active && setState(stateFromError(error)));
    return () => {
      active = false;
    };
  }, []);

  const login = useCallback(
    async (email: string, password: string) => {
      const body = loginRequestSchema.parse({ email, password });
      await apiPost('/api/auth/login', null, body);
      await reload();
    },
    [reload],
  );

  const logout = useCallback(async () => {
    try {
      await apiPost('/api/auth/logout', null);
    } finally {
      setState({ status: 'unauthenticated', expired: false });
    }
  }, []);

  const value = useMemo(() => ({ state, login, logout, reload }), [state, login, logout, reload]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthApi {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth debe usarse dentro de AuthProvider');
  return context;
}
