import type { CreateSellerInput, TeamList, TeamMember, UpdateSellerInput } from '@pos/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';

export const TEAM_KEY = ['team'] as const;

/** El equipo de la tienda (solo el propietario); `enabled` evita pedirlo a un vendedor. */
export function useTeam(enabled = true) {
  return useQuery({
    queryKey: TEAM_KEY,
    enabled,
    queryFn: ({ signal }) => api.get<TeamList>('/team', signal),
    staleTime: 30_000,
  });
}

/** Lo que cambia al sumar, dar de baja o reactivar a alguien: el equipo y las cifras por vendedor. */
function refreshTeam(client: ReturnType<typeof useQueryClient>) {
  void client.invalidateQueries({ queryKey: TEAM_KEY });
  void client.invalidateQueries({ queryKey: ['sellers-report'] });
  void client.invalidateQueries({ queryKey: ['dashboard'] });
  void client.invalidateQueries({ queryKey: ['pending'] });
}

export function useCreateSeller() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateSellerInput) => api.post<TeamMember>('/team/sellers', input),
    onSuccess: () => refreshTeam(client),
  });
}

export function useUpdateSeller() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, changes }: { userId: string; changes: UpdateSellerInput }) =>
      api.patch<TeamMember>(`/team/${userId}`, changes),
    onSuccess: () => refreshTeam(client),
  });
}
