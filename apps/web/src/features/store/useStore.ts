import { todayIn, type StoreSettings, type StoreSettingsUpdate } from '@pos/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { ME_KEY } from '../session/useSession';

export const STORE_KEY = ['store'] as const;

/** Configuración de la tienda: moneda, zona horaria y horario salen de aquí, no de constantes. */
export function useStore() {
  return useQuery({
    queryKey: STORE_KEY,
    queryFn: ({ signal }) => api.get<StoreSettings>('/store', signal),
    staleTime: 5 * 60_000,
  });
}

export function useUpdateStore() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (changes: StoreSettingsUpdate) => api.patch<StoreSettings>('/store', changes),
    onSuccess: (settings) => {
      client.setQueryData(STORE_KEY, settings);
      // El nombre de la tienda también se muestra en el perfil.
      void client.invalidateQueries({ queryKey: ME_KEY });
    },
  });
}

/** Moneda de la tienda, con MXN mientras carga (la única admitida hoy). */
export function useCurrency(): string {
  return useStore().data?.currency ?? 'MXN';
}

/** Fecha de hoy en la zona horaria de la tienda (AAAA-MM-DD); nula mientras carga la configuración. */
export function useToday(): string | undefined {
  const timezone = useStore().data?.timezone;
  return timezone ? todayIn(timezone, new Date()) : undefined;
}
