import type { SalesList } from '@pos/shared';
import { useInfiniteQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';

export type HistoryFilter = 'all' | 'paid' | 'pending' | 'cancelled';

export interface HistoryQuery {
  q: string;
  filter: HistoryFilter;
  from?: string;
  to?: string;
  sellerId?: string;
}

const PAGE = 50;

/** Cada opción del filtro es un par (estado, cobro) del API; "Pendientes" agrupa las que tienen saldo. */
const PARAMS: Record<HistoryFilter, Record<string, string>> = {
  all: {},
  paid: { status: 'active', collection: 'paid' },
  pending: { collection: 'unpaid' },
  cancelled: { status: 'cancelled' },
};

export function useSalesList(query: HistoryQuery) {
  return useInfiniteQuery({
    queryKey: ['sales', query],
    initialPageParam: 0,
    queryFn: ({ pageParam, signal }) => {
      const params = new URLSearchParams({
        limit: String(PAGE),
        offset: String(pageParam),
        ...PARAMS[query.filter],
      });
      if (query.q) params.set('q', query.q);
      if (query.from) params.set('from', query.from);
      if (query.to) params.set('to', query.to);
      if (query.sellerId) params.set('sellerId', query.sellerId);
      return api.get<SalesList>(`/sales?${params}`, signal);
    },
    getNextPageParam: (last) => {
      const next = last.offset + last.items.length;
      return next < last.total ? next : undefined;
    },
  });
}
