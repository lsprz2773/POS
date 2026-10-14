import type { MeResponse } from '@pos/shared';
import { useState } from 'react';
import { Button } from '../../components/Button';
import { PageHeader } from '../../components/PageHeader';
import { copy } from '../../copy/es';
import { useSignOut } from './useSession';

export function ProfilePage({ me }: { me: MeResponse }) {
  const signOut = useSignOut();
  const [leaving, setLeaving] = useState(false);
  const rows = [
    [copy.profile.email, me.user.email],
    [copy.profile.store, me.tenant.name],
    [copy.profile.role, copy.roles[me.role]],
  ] as const;
  return (
    <>
      <PageHeader title={copy.profile.title} />
      <dl className="glass card m-0 flex flex-col gap-4">
        {rows.map(([label, value]) => (
          <div key={label}>
            <dt className="cap">{label}</dt>
            <dd className="m-0 break-words font-bold">{value}</dd>
          </div>
        ))}
      </dl>
      <Button
        variant="secondary"
        block
        loading={leaving}
        onClick={() => {
          setLeaving(true);
          void signOut().finally(() => setLeaving(false));
        }}
      >
        {copy.profile.signOut}
      </Button>
    </>
  );
}
