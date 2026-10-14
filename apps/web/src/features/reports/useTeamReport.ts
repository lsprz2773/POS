import type { SellerDetail, SellersReport } from '@pos/shared';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import type { PeriodKind } from './periods';

const paramsOf = (kind: PeriodKind, period: { from: string; to: string }) =>
  kind === 'range'
    ? new URLSearchParams({ from: period.from, to: period.to })
    : new URLSearchParams({ period: kind, date: period.from });

/** Reporte por vendedor y periodo (solo el propietario); el servidor calcula todo (RF-142). */
export function useSellersReport(kind: PeriodKind, period: { from: string; to: string } | null) {
  return useQuery({
    queryKey: ['sellers-report', kind, period],
    enabled: period !== null,
    queryFn: ({ signal }) =>
      api.get<SellersReport>(`/reports/sellers?${paramsOf(kind, period!)}`, signal),
    staleTime: 0,
  });
}

export function useSellerDetail(
  userId: string | undefined,
  kind: PeriodKind,
  period: { from: string; to: string } | null,
) {
  return useQuery({
    queryKey: ['sellers-report', 'detail', userId, kind, period],
    enabled: userId !== undefined && period !== null,
    queryFn: ({ signal }) =>
      api.get<SellerDetail>(`/reports/sellers/${userId}?${paramsOf(kind, period!)}`, signal),
    staleTime: 0,
  });
}
