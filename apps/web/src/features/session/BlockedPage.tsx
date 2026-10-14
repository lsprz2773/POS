import { LockKeyhole } from 'lucide-react';
import { Button } from '../../components/Button';
import { EmptyState } from '../../components/EmptyState';
import { copy } from '../../copy/es';
import { useSignOut, type BlockedReason } from './useSession';

/** Cuenta sin tienda o tienda desactivada: lo único posible es cerrar sesión (RF-009). */
const VIEW: Record<BlockedReason, { title: string; text: string }> = {
  store_not_configured: { title: copy.blocked.noStoreTitle, text: copy.blocked.noStoreText },
  tenant_disabled: { title: copy.blocked.disabledTitle, text: copy.blocked.disabledText },
  membership_disabled: {
    title: copy.blocked.memberDisabledTitle,
    text: copy.blocked.memberDisabledText,
  },
};

export function BlockedPage({ reason }: { reason: BlockedReason }) {
  const signOut = useSignOut();
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-4 py-8">
      <EmptyState
        icon={LockKeyhole}
        title={VIEW[reason].title}
        text={VIEW[reason].text}
        action={
          <Button variant="primary" onClick={() => void signOut()}>
            {copy.blocked.signOut}
          </Button>
        }
      />
    </main>
  );
}
