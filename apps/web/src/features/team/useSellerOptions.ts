import { useSession } from '../session/useSession';
import { useTeam } from './useTeam';

export interface SellerOption {
  id: string;
  name: string;
}

/**
 * Personas por las que el propietario puede filtrar ventas y pendientes. Para un vendedor, o en una tienda
 * sin vendedores, la lista queda vacía y la interfaz no muestra nada de esto.
 */
export function useSellerOptions(): { options: SellerOption[]; showSeller: boolean } {
  const session = useSession();
  const me = session.status === 'authenticated' ? session.me : undefined;
  const team = useTeam(me?.role === 'owner');
  const items = team.data?.items ?? [];
  if (!me || !items.some((member) => member.role === 'seller')) {
    return { options: [], showSeller: false };
  }
  return {
    options: items.map((member) => ({
      id: member.id,
      name: member.id === me.user.id ? 'Tú' : (member.displayName ?? member.email),
    })),
    showSeller: true,
  };
}
