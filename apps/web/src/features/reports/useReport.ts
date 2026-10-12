import type { Dashboard, Report } from '@pos/shared';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import type { PeriodKind } from './periods';

/** Indicadores de hoy; el servidor calcula todo (RF-079). */
export function useDashboard() {
  return useQuery({
    queryKey: ['dashboard'],
    queryFn: ({ signal }) => api.get<Dashboard>('/dashboard', signal),
    staleTime: 0,
  });
}

export function useReport(kind: PeriodKind, period: { from: string; to: string } | null) {
  return useQuery({
    queryKey: ['report', kind, period],
    enabled: period !== null,
    queryFn: ({ signal }) => {
      const params =
        kind === 'range'
          ? new URLSearchParams({ from: period!.from, to: period!.to })
          : new URLSearchParams({ period: kind, date: period!.from });
      return api.get<Report>(`/reports?${params}`, signal);
    },
    staleTime: 0,
  });
}
