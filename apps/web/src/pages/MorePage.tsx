import type { Permission } from '@pos/shared';
import {
  BarChart3,
  ChevronRight,
  History,
  Package,
  Settings,
  UserRound,
  Users,
} from 'lucide-react';
import { Link } from 'react-router';
import { PageHeader } from '../components/PageHeader';
import { copy } from '../copy/es';
import { useRole } from '../features/session/usePermission';
import { useTeam } from '../features/team/useTeam';
import { can } from '@pos/shared';

interface MoreLink {
  to: string;
  label: string;
  Icon: typeof Package;
  /** Sin permiso, el enlace no se muestra (el servidor rechaza igual). */
  permission?: Permission;
}

/** Para un vendedor Historial y Reportes son solo de lo suyo y se llaman así. */
const links = (seller: boolean): MoreLink[] => [
  { to: '/catalogo', label: copy.more.catalog, Icon: Package, permission: 'product:write' },
  {
    to: '/historial',
    label: seller ? copy.more.myHistory : copy.more.history,
    Icon: History,
  },
  { to: '/reportes', label: seller ? copy.more.myReports : copy.more.reports, Icon: BarChart3 },
  {
    to: '/reportes/equipo',
    label: copy.more.teamReports,
    Icon: BarChart3,
    permission: 'team:report',
  },
  { to: '/equipo', label: copy.more.team, Icon: Users, permission: 'team:manage' },
  { to: '/configuracion', label: copy.more.settings, Icon: Settings, permission: 'store:update' },
  { to: '/perfil', label: copy.more.profile, Icon: UserRound },
];

export function MorePage() {
  const role = useRole();
  // Los reportes por vendedor solo aparecen cuando la tienda ya tiene vendedores.
  const team = useTeam(role === 'owner');
  const hasSellers = team.data?.items.some((member) => member.role === 'seller') ?? false;
  const visible = links(role === 'seller')
    .filter(({ permission }) => !permission || (role !== undefined && can(role, permission)))
    .filter(({ to }) => to !== '/reportes/equipo' || hasSellers);
  return (
    <>
      <PageHeader title={copy.more.title} />
      <nav aria-label={copy.more.title} className="glass overflow-hidden p-0">
        {visible.map(({ to, label, Icon }) => (
          <Link key={to} to={to} className="li">
            <Icon className="ic" aria-hidden="true" />
            <span className="flex-1 font-bold">{label}</span>
            <ChevronRight className="ic" aria-hidden="true" />
          </Link>
        ))}
      </nav>
    </>
  );
}
