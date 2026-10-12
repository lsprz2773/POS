import type { Workday, WorkdayList } from '@pos/shared';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../../lib/api';

export const workdayKey = (date: string) => ['workday', date] as const;

/** La jornada de una fecha; `null` si ese día todavía no está preparado (no es un error). */
export function useWorkday(date: string | undefined) {
  return useQuery({
    queryKey: workdayKey(date ?? ''),
    enabled: date !== undefined,
    queryFn: async ({ signal }) => {
      try {
        return await api.get<Workday>(`/workdays/${date}`, signal);
      } catch (error) {
        if (error instanceof ApiError && error.status === 404) return null;
        throw error;
      }
    },
  });
}

/** Cada cambio devuelve la jornada completa ya recalculada por el servidor. */
function useWorkdayMutation<V>(date: string, request: (variables: V) => Promise<Workday>) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: request,
    onSuccess: (workday) => client.setQueryData(workdayKey(date), workday),
    onSettled: () => void client.invalidateQueries({ queryKey: workdayKey(date) }),
  });
}

export const useAddOffer = (date: string) =>
  useWorkdayMutation(date, (v: { productId: string; quantity: string }) =>
    api.post<Workday>(`/workdays/${date}/offers`, v),
  );

export const useAdjustOffer = (date: string) =>
  useWorkdayMutation(date, (v: { offerId: string; increment: string; reason: string }) =>
    api.post<Workday>(`/workdays/${date}/offers/${v.offerId}/adjustments`, {
      increment: v.increment,
      reason: v.reason,
    }),
  );

export const useRemoveOffer = (date: string) =>
  useWorkdayMutation(date, (v: { offerId: string }) =>
    api.delete<Workday>(`/workdays/${date}/offers/${v.offerId}`),
  );

const PAGE = 30;

/** Jornadas hasta la fecha `to` inclusive (AAAA-MM-DD), de la más reciente a la más antigua. */
export function usePastWorkdays(to: string | undefined) {
  return useInfiniteQuery({
    queryKey: ['workdays', 'past', to ?? ''],
    enabled: to !== undefined,
    initialPageParam: 0,
    queryFn: ({ pageParam, signal }) =>
      api.get<WorkdayList>(`/workdays?to=${to}&limit=${PAGE}&offset=${pageParam}`, signal),
    getNextPageParam: (last) => {
      const next = last.offset + last.items.length;
      return next < last.total ? next : undefined;
    },
  });
}
