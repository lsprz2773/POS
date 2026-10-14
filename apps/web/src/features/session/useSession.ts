import type { MeResponse } from '@pos/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { api, ApiError } from '../../lib/api';
import { clearDraft } from '../../lib/draft';

export const ME_KEY = ['me'] as const;

/** Cuenta sin tienda, tienda desactivada o vendedor dado de baja (RF-009, RF-135). */
export type BlockedReason = 'store_not_configured' | 'tenant_disabled' | 'membership_disabled';

const BLOCKED: readonly string[] = [
  'store_not_configured',
  'tenant_disabled',
  'membership_disabled',
];

export type SessionState =
  | { status: 'loading' }
  | { status: 'authenticated'; me: MeResponse }
  /** La cuenta existe pero no puede usar la app: sin tienda o tienda desactivada (RF-009). */
  | { status: 'blocked'; reason: BlockedReason }
  | { status: 'anonymous' }
  | { status: 'error'; error: unknown; retry: () => void };

export function useSession(): SessionState {
  const query = useQuery({
    queryKey: ME_KEY,
    queryFn: ({ signal }) => api.get<MeResponse>('/me', signal),
    retry: false,
    staleTime: 60_000,
  });

  const error = query.error;
  // Una cuenta dada de baja en pleno uso: aunque haya datos de antes, ya no puede seguir (RF-135).
  if (error instanceof ApiError && BLOCKED.includes(error.code)) {
    return { status: 'blocked', reason: error.code as BlockedReason };
  }
  if (query.isPending) return { status: 'loading' };
  if (query.data) return { status: 'authenticated', me: query.data };
  if (error instanceof ApiError && error.code === 'unauthenticated') return { status: 'anonymous' };
  return { status: 'error', error, retry: () => void query.refetch() };
}

/** Cierra la sesión en el servidor y deja la caché limpia: ningún dato de la tienda se queda en memoria. */
export function useSignOut() {
  const client = useQueryClient();
  const navigate = useNavigate();
  return async () => {
    try {
      await api.post('/auth/logout');
    } finally {
      client.clear();
      clearDraft();
      void navigate('/login', { replace: true, state: { loggedOut: true } });
    }
  };
}
