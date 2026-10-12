import { BarChart3, ChevronRight, History, Package, Settings, UserRound } from 'lucide-react';
import { Link } from 'react-router';
import { PageHeader } from '../components/PageHeader';
import { copy } from '../copy/es';

const LINKS = [
  { to: '/catalogo', label: copy.more.catalog, Icon: Package },
  { to: '/historial', label: copy.more.history, Icon: History },
  { to: '/reportes', label: copy.more.reports, Icon: BarChart3 },
  { to: '/configuracion', label: copy.more.settings, Icon: Settings },
  { to: '/perfil', label: copy.more.profile, Icon: UserRound },
] as const;

export function MorePage() {
  return (
    <>
      <PageHeader title={copy.more.title} />
      <nav aria-label={copy.more.title} className="glass overflow-hidden p-0">
        {LINKS.map(({ to, label, Icon }) => (
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
