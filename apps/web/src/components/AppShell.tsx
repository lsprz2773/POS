import { CalendarDays, Ellipsis, Home, ReceiptText, ShoppingCart } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router';
import { copy } from '../copy/es';
import { onSessionExpired } from '../lib/api';
import { Button } from './Button';
import { OfflineBanner } from './OfflineBanner';
import { Sheet } from './Sheet';
import { TopProgress } from './TopProgress';

const TODAY = { to: '/', label: copy.nav.today, Icon: Home, end: true } as const;
const SELL = { to: '/vender', label: copy.nav.sell, Icon: ShoppingCart, sell: true } as const;
const PENDING = { to: '/pendientes', label: copy.nav.pending, Icon: ReceiptText } as const;
const DAY = { to: '/dia', label: copy.nav.day, Icon: CalendarDays } as const;
const MORE = { to: '/mas', label: copy.nav.more, Icon: Ellipsis } as const;

/** Barra lateral de escritorio. */
const SIDE_NAV = [TODAY, SELL, PENDING, DAY, MORE] as const;
/** Barra inferior de móvil: Vender queda al centro, como en el diseño. */
const TAB_NAV = [TODAY, PENDING, SELL, DAY, MORE] as const;

/** Marco de la app: barra inferior en móvil, lateral en escritorio, avisos globales y sesión expirada. */
export function AppShell() {
  const location = useLocation();
  const navigate = useNavigate();
  const main = useRef<HTMLElement>(null);
  const [expired, setExpired] = useState(false);
  // Vendiendo o viendo una venta, la barra inferior cede su lugar a la barra de acción (como en el diseño).
  const selling =
    location.pathname.startsWith('/vender') || location.pathname.startsWith('/ventas/');

  useEffect(() => onSessionExpired(() => setExpired(true)), []);

  // Al cambiar de pantalla el foco pasa al contenido: el lector de pantalla lo anuncia (WCAG 2.4.3).
  useEffect(() => {
    main.current?.focus();
  }, [location.pathname]);

  return (
    <>
      <a href="#contenido" className="btn btn-p sr-only-focusable fixed left-3 top-3 z-50">
        {copy.app.skip}
      </a>
      <TopProgress />

      <aside className="side glass2">
        <p className="h2 px-3 pb-3">{copy.app.name}</p>
        <nav aria-label={copy.nav.label} className="flex flex-col gap-2">
          {SIDE_NAV.map(({ to, label, Icon, ...rest }) => (
            <NavLink
              key={to}
              to={to}
              end={'end' in rest}
              className={'sell' in rest ? 'sell' : undefined}
            >
              <Icon className="ic" aria-hidden="true" />
              {label}
            </NavLink>
          ))}
        </nav>
      </aside>

      <div className="lg:pl-[280px]">
        <OfflineBanner />
        <main
          id="contenido"
          ref={main}
          tabIndex={-1}
          className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 pb-32 pt-6 outline-none"
        >
          <Outlet />
        </main>
      </div>

      <nav className="tabbar glass2" aria-label={copy.nav.label} hidden={selling}>
        {TAB_NAV.map(({ to, label, Icon, ...rest }) => (
          <NavLink
            key={to}
            to={to}
            end={'end' in rest}
            className={'sell' in rest ? 'tab tab-v' : 'tab'}
            aria-label={'sell' in rest ? label : undefined}
          >
            <Icon className="ic" aria-hidden="true" />
            {'sell' in rest ? null : label}
          </NavLink>
        ))}
      </nav>

      <Sheet
        open={expired}
        title={copy.session.expiredTitle}
        description={copy.session.expiredText}
        dismissible={false}
      >
        <Button
          variant="primary"
          large
          block
          onClick={() => {
            setExpired(false);
            void navigate('/login', { replace: true });
          }}
        >
          {copy.session.expiredAction}
        </Button>
      </Sheet>
    </>
  );
}
