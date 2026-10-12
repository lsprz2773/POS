import { LockKeyhole } from 'lucide-react';
import { Button } from '../../components/Button';
import { EmptyState } from '../../components/EmptyState';
import { copy } from '../../copy/es';
import { useSignOut } from './useSession';

/** Cuenta sin tienda o tienda desactivada: lo único posible es cerrar sesión (RF-009). */
export function BlockedPage({ reason }: { reason: 'store_not_configured' | 'tenant_disabled' }) {
  const signOut = useSignOut();
  const noStore = reason === 'store_not_configured';
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-4 py-8">
      <EmptyState
        icon={LockKeyhole}
        title={noStore ? copy.blocked.noStoreTitle : copy.blocked.disabledTitle}
        text={noStore ? copy.blocked.noStoreText : copy.blocked.disabledText}
        action={
          <Button variant="primary" onClick={() => void signOut()}>
            {copy.blocked.signOut}
          </Button>
        }
      />
    </main>
  );
}
