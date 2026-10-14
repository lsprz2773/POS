import type { PaymentLinesInput, PendingList, Sale } from '@pos/shared';
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';
import { api, request } from '../../lib/api';

export const saleKey = (id: string) => ['sale', id] as const;

/** Tras cualquier cambio de ventas o pagos se refrescan todas las cifras que dependen de ellas. */
export function refreshSales(client: QueryClient, sale?: Sale) {
  if (sale) client.setQueryData(saleKey(sale.id), sale);
  void client.invalidateQueries({ queryKey: ['pending'] });
  void client.invalidateQueries({ queryKey: ['workday'] });
  void client.invalidateQueries({ queryKey: ['workdays'] });
  void client.invalidateQueries({ queryKey: ['sales'] });
  void client.invalidateQueries({ queryKey: ['dashboard'] });
}

export function useSale(id: string | undefined) {
  return useQuery({
    queryKey: saleKey(id ?? ''),
    enabled: id !== undefined,
    queryFn: ({ signal }) => api.get<Sale>(`/sales/${id}`, signal),
    // El estado de cobro lo decide el servidor: siempre se vuelve a pedir al abrir.
    staleTime: 0,
  });
}

export interface CreateSaleRequest {
  key: string;
  body: {
    items: { productId: string; quantity: string }[];
    customerReference?: string;
    note?: string;
    payments?: PaymentLinesInput;
  };
}

/** Crea la venta con su llave de idempotencia: reintentar con la misma llave no la duplica. */
export function useCreateSale() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ key, body }: CreateSaleRequest) =>
      request<Sale>('/sales', { method: 'POST', body, headers: { 'idempotency-key': key } }),
    onSuccess: (sale) => refreshSales(client, sale),
  });
}

export function useRegisterPayment(saleId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ key, lines }: { key: string; lines: PaymentLinesInput }) =>
      request<Sale>(`/sales/${saleId}/payments`, {
        method: 'POST',
        body: { lines },
        headers: { 'idempotency-key': key },
      }),
    onSuccess: (sale) => refreshSales(client, sale),
  });
}

export function useVoidPayment(saleId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ paymentId, reason }: { paymentId: string; reason: string }) =>
      api.post<Sale>(`/payments/${paymentId}/void`, { reason }),
    onSuccess: (sale) => refreshSales(client, sale),
    onError: () => void client.invalidateQueries({ queryKey: saleKey(saleId) }),
  });
}

export function useCancelSale(saleId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ reason }: { reason: string }) =>
      api.post<Sale>(`/sales/${saleId}/cancel`, { reason }),
    onSuccess: (sale) => refreshSales(client, sale),
    onError: () => void client.invalidateQueries({ queryKey: saleKey(saleId) }),
  });
}

export interface PendingFilter {
  from?: string;
  to?: string;
  /** Solo el propietario: pendientes de una persona. */
  sellerId?: string;
}

const PAGE = 50;

/** Ventas con saldo de cualquier día, con su total pendiente; "Cargar más" de 50 en 50. */
export function usePending(filter: PendingFilter) {
  return useInfiniteQuery({
    queryKey: ['pending', filter],
    initialPageParam: 0,
    queryFn: ({ pageParam, signal }) => {
      const params = new URLSearchParams({ limit: String(PAGE), offset: String(pageParam) });
      if (filter.from) params.set('from', filter.from);
      if (filter.to) params.set('to', filter.to);
      if (filter.sellerId) params.set('sellerId', filter.sellerId);
      return api.get<PendingList>(`/sales/pending?${params}`, signal);
    },
    getNextPageParam: (last) => {
      const next = last.offset + last.items.length;
      return next < last.total ? next : undefined;
    },
  });
}
