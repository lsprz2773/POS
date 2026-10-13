import type { Product, ProductList } from '@pos/shared';
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
} from '@tanstack/react-query';
import { api } from '../../lib/api';

export type StatusFilter = 'active' | 'inactive' | 'all';

const PAGE = 50;

export const productsKey = (q: string, status: StatusFilter) =>
  ['products', { q, status }] as const;
export const productKey = (id: string) => ['product', id] as const;

/** Lista paginada con "Cargar más": no baja todo el catálogo de una vez. */
export function useProducts(q: string, status: StatusFilter) {
  return useInfiniteQuery({
    queryKey: productsKey(q, status),
    initialPageParam: 0,
    queryFn: ({ pageParam, signal }) => {
      const params = new URLSearchParams({
        status,
        limit: String(PAGE),
        offset: String(pageParam),
      });
      if (q) params.set('q', q);
      return api.get<ProductList>(`/products?${params}`, signal);
    },
    getNextPageParam: (last) => {
      const next = last.offset + last.items.length;
      return next < last.total ? next : undefined;
    },
  });
}

export function useProduct(id: string | undefined) {
  return useQuery({
    queryKey: productKey(id ?? ''),
    queryFn: ({ signal }) => api.get<Product>(`/products/${id}`, signal),
    enabled: id !== undefined,
    // Siempre fresco: la versión del producto decide si se puede guardar.
    staleTime: 0,
    gcTime: 0,
  });
}

/** Activa o desactiva un producto con la versión que se vio (control de cambios simultáneos). */
export function useToggleProduct() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (product: Pick<Product, 'id' | 'version'> & { active: boolean }) =>
      api.patch<Product>(`/products/${product.id}`, {
        version: product.version,
        active: product.active,
      }),
    onSuccess: (updated) => {
      // Cada lista (con su filtro) se actualiza y los que ya no cumplen el filtro se refrescan.
      client.setQueriesData<InfiniteData<ProductList>>({ queryKey: ['products'] }, (data) =>
        data
          ? {
              ...data,
              pages: data.pages.map((page) => ({
                ...page,
                items: page.items.map((item) => (item.id === updated.id ? updated : item)),
              })),
            }
          : data,
      );
    },
    onSettled: () => void client.invalidateQueries({ queryKey: ['products'] }),
  });
}
