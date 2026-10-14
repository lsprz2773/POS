import { SELLER_LIMIT, type TeamMember } from '@pos/shared';
import { UserPlus, Users } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { Banner } from '../../components/Banner';
import { Button } from '../../components/Button';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { EmptyState } from '../../components/EmptyState';
import { ErrorState } from '../../components/ErrorState';
import { useOnline } from '../../components/OfflineBanner';
import { PageHeader } from '../../components/PageHeader';
import { LoadingRegion, RowSkeleton } from '../../components/Skeleton';
import { useToast } from '../../components/Toast';
import { copy } from '../../copy/es';
import { messageOf } from '../../lib/errors';
import { AddSellerSheet } from './AddSellerSheet';
import { useTeam, useUpdateSeller } from './useTeam';

const nameOf = (member: TeamMember) => member.displayName ?? member.email;

function MemberCard({
  member,
  isYou,
  canActivate,
  online,
  onAskDisable,
  onEnable,
  busy,
}: {
  member: TeamMember;
  isYou: boolean;
  canActivate: boolean;
  online: boolean;
  onAskDisable: () => void;
  onEnable: () => void;
  busy: boolean;
}) {
  const seller = member.role === 'seller';
  const disabled = member.status === 'disabled';
  return (
    <li className="glass2 card flex flex-col gap-3">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="h2 break-words" style={{ fontSize: 16 }}>
            {nameOf(member)}
            {isYou ? <span className="cap"> · {copy.team.you}</span> : null}
          </div>
          {member.displayName ? <div className="cap break-words">{member.email}</div> : null}
        </div>
        {seller ? (
          <span className={`bdg ${disabled ? 'bdg-can' : 'bdg-ok'}`}>
            {disabled ? copy.team.disabled : copy.team.active}
          </span>
        ) : (
          <span className="bdg bdg-mut">{copy.team.owner}</span>
        )}
      </div>
      {seller ? (
        <div className="flex flex-wrap gap-2">
          <Link to={`/dia/inventario?vendedor=${member.id}`} className="btn btn-g">
            {copy.team.viewDay}
          </Link>
          <Link to={`/reportes/equipo/${member.id}`} className="btn btn-g">
            {copy.team.viewReport}
          </Link>
          {disabled ? (
            <Button
              variant="secondary"
              loading={busy}
              disabled={!online || !canActivate}
              onClick={onEnable}
            >
              {copy.team.enable}
            </Button>
          ) : (
            <Button variant="secondary" disabled={!online || busy} onClick={onAskDisable}>
              {copy.team.disable}
            </Button>
          )}
        </div>
      ) : null}
    </li>
  );
}

/** Equipo de la tienda (RF-134 a RF-136): alta, baja y reactivación de vendedores. Solo el propietario. */
export function TeamPage({ meId }: { meId: string }) {
  const query = useTeam();
  const update = useUpdateSeller();
  const online = useOnline();
  const toast = useToast();
  const [adding, setAdding] = useState(false);
  const [disabling, setDisabling] = useState<TeamMember | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const team = query.data;
  const sellers = team?.items.filter((member) => member.role === 'seller') ?? [];
  const full = team !== undefined && team.activeSellers >= team.sellerLimit;

  function change(member: TeamMember, status: 'active' | 'disabled') {
    setBusyId(member.id);
    update.mutate(
      { userId: member.id, changes: { status } },
      {
        onSuccess: () => {
          setDisabling(null);
          toast.show(
            'ok',
            status === 'disabled'
              ? copy.team.disabledToast(nameOf(member))
              : copy.team.enabledToast(nameOf(member)),
          );
        },
        onError: (error) => {
          setDisabling(null);
          toast.show('bad', messageOf(error));
        },
        onSettled: () => setBusyId(null),
      },
    );
  }

  return (
    <>
      <PageHeader
        title={copy.team.title}
        back={{ to: '/mas', label: copy.team.back }}
        action={
          <Button variant="primary" disabled={!online || full} onClick={() => setAdding(true)}>
            <UserPlus className="ic" aria-hidden="true" />
            {copy.team.add}
          </Button>
        }
      />

      {query.isPending ? (
        <LoadingRegion label={copy.states.loading}>
          <div className="flex flex-col gap-3">
            <RowSkeleton />
            <RowSkeleton />
            <RowSkeleton />
          </div>
        </LoadingRegion>
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : team ? (
        <>
          {sellers.length === 0 ? (
            <EmptyState
              icon={Users}
              title={copy.team.emptyTitle}
              text={copy.team.emptyText}
              action={
                <Button variant="primary" disabled={!online} onClick={() => setAdding(true)}>
                  {copy.team.add}
                </Button>
              }
            />
          ) : (
            <>
              <p className="sub m-0">{copy.team.summary(team.activeSellers, team.sellerLimit)}</p>
              {full ? <Banner tone="warn">{copy.team.limitReached}</Banner> : null}
              <ul
                aria-label={copy.team.listLabel}
                className="stagger m-0 flex list-none flex-col gap-3 p-0"
              >
                {team.items.map((member) => (
                  <MemberCard
                    key={member.id}
                    member={member}
                    isYou={member.id === meId}
                    canActivate={team.activeSellers < SELLER_LIMIT}
                    online={online}
                    busy={busyId === member.id}
                    onAskDisable={() => setDisabling(member)}
                    onEnable={() => change(member, 'active')}
                  />
                ))}
              </ul>
            </>
          )}
        </>
      ) : null}

      {adding ? (
        <AddSellerSheet
          online={online}
          onClose={() => setAdding(false)}
          onDone={(name) => {
            setAdding(false);
            toast.show('ok', copy.team.created(name));
          }}
        />
      ) : null}

      <ConfirmDialog
        open={disabling !== null}
        title={copy.team.disableTitle(disabling ? nameOf(disabling) : '')}
        description={copy.team.disableText}
        safeLabel={copy.team.keepActive}
        onSafe={() => setDisabling(null)}
        riskLabel={copy.team.disableConfirm}
        risking={update.isPending}
        onRisk={() => disabling && change(disabling, 'disabled')}
      />
    </>
  );
}
