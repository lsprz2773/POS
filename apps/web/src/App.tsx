import type { Permission } from '@pos/shared';
import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { createBrowserRouter, Navigate, RouterProvider, type RouteObject } from 'react-router';
import { AppShell } from './components/AppShell';
import { ErrorState } from './components/ErrorState';
import { RequirePermission } from './components/RequirePermission';
import { LoadingRegion, Skeleton } from './components/Skeleton';
import { ToastProvider } from './components/Toast';
import { copy } from './copy/es';
import { BlockedPage } from './features/session/BlockedPage';
import { LoginPage } from './features/session/LoginPage';
import { ProfilePage } from './features/session/ProfilePage';
import { ME_KEY, useSession } from './features/session/useSession';
import { ApiError } from './lib/api';
import { CatalogPage } from './features/catalog/CatalogPage';
import { ProductFormPage } from './features/catalog/ProductFormPage';
import { TodayPage } from './features/dashboard/TodayPage';
import { HistoryPage } from './features/history/HistoryPage';
import { ReportsPage } from './features/reports/ReportsPage';
import { SellerDetailPage } from './features/reports/SellerDetailPage';
import { TeamReportPage } from './features/reports/TeamReportPage';
import { TeamPage } from './features/team/TeamPage';
import { NewSalePage } from './features/sales/NewSalePage';
import { PendingPage } from './features/sales/PendingPage';
import { SaleDetailPage } from './features/sales/SaleDetailPage';
import { SaleRegisteredPage } from './features/sales/SaleRegisteredPage';
import { InventoryPage } from './features/workday/InventoryPage';
import { PastDaysPage } from './features/workday/PastDaysPage';
import { PrepareDayPage } from './features/workday/PrepareDayPage';
import { SettingsPage } from './features/store/SettingsPage';
import { MorePage } from './pages/MorePage';
import { NotFoundPage } from './pages/NotFoundPage';

/** Deja pasar solo con sesión válida; si no, manda al inicio de sesión o explica el bloqueo. */
function SessionGate() {
  const session = useSession();
  switch (session.status) {
    case 'loading':
      return (
        <LoadingRegion label={copy.states.loading}>
          <div className="mx-auto flex max-w-3xl flex-col gap-4 px-4 py-8">
            <Skeleton className="h-8 w-40" />
            <Skeleton className="h-28 w-full" />
            <Skeleton className="h-28 w-full" />
          </div>
        </LoadingRegion>
      );
    case 'anonymous':
      return <Navigate to="/login" replace />;
    case 'blocked':
      return <BlockedPage reason={session.reason} />;
    case 'error':
      return (
        <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-4">
          <ErrorState error={session.error} onRetry={session.retry} />
        </main>
      );
    case 'authenticated':
      return <AppShell />;
  }
}

/** Pantalla visible solo con el permiso; sin él se vuelve a Hoy con un aviso (el servidor rechaza igual). */
const guarded = (permission: Permission, element: ReactNode) => (
  <RequirePermission permission={permission}>{element}</RequirePermission>
);

function TeamRoute() {
  const session = useSession();
  return session.status === 'authenticated' ? <TeamPage meId={session.me.user.id} /> : null;
}

function ProfileRoute() {
  const session = useSession();
  return session.status === 'authenticated' ? <ProfilePage me={session.me} /> : null;
}

export const routes: RouteObject[] = [
  { path: '/login', element: <LoginPage /> },
  {
    element: <SessionGate />,
    children: [
      { path: '/mas', element: <MorePage /> },
      { path: '/', element: <TodayPage /> },
      { path: '/historial', element: <HistoryPage /> },
      { path: '/reportes', element: <ReportsPage /> },
      { path: '/reportes/equipo', element: guarded('team:report', <TeamReportPage />) },
      { path: '/reportes/equipo/:id', element: guarded('team:report', <SellerDetailPage />) },
      { path: '/equipo', element: guarded('team:manage', <TeamRoute />) },
      { path: '/vender', element: <NewSalePage /> },
      { path: '/vender/listo/:id', element: <SaleRegisteredPage /> },
      { path: '/ventas/:id', element: <SaleDetailPage /> },
      { path: '/pendientes', element: <PendingPage /> },
      { path: '/dia', element: <PrepareDayPage /> },
      { path: '/dia/inventario', element: <InventoryPage /> },
      { path: '/dia/anteriores', element: <PastDaysPage /> },
      { path: '/catalogo', element: guarded('product:write', <CatalogPage />) },
      { path: '/catalogo/nuevo', element: guarded('product:write', <ProductFormPage />) },
      { path: '/catalogo/:id', element: guarded('product:write', <ProductFormPage />) },
      { path: '/configuracion', element: guarded('store:update', <SettingsPage />) },
      { path: '/perfil', element: <ProfileRoute /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
];

/**
 * Si el servidor dice que la cuenta fue dada de baja en pleno uso, se vuelve a pedir la sesión: la puerta de
 * sesión muestra entonces la pantalla de cuenta dada de baja (RF-135) en lugar de un error suelto.
 */
const isMemberDisabled = (error: unknown) =>
  error instanceof ApiError && error.code === 'membership_disabled';

export function createQueryClient(retry: number | false = 1) {
  const client: QueryClient = new QueryClient({
    defaultOptions: { queries: { refetchOnWindowFocus: false, retry } },
    queryCache: new QueryCache({
      onError: (error, query) => {
        if (isMemberDisabled(error) && query.queryKey[0] !== ME_KEY[0]) {
          void client.invalidateQueries({ queryKey: ME_KEY });
        }
      },
    }),
    mutationCache: new MutationCache({
      onError: (error) => {
        if (isMemberDisabled(error)) void client.invalidateQueries({ queryKey: ME_KEY });
      },
    }),
  });
  return client;
}

export function App() {
  const [client] = useState(() => createQueryClient());
  // Router de datos: permite avisar antes de salir de un formulario con cambios sin guardar.
  const [router] = useState(() => createBrowserRouter(routes));
  return (
    <QueryClientProvider client={client}>
      <ToastProvider>
        <RouterProvider router={router} />
      </ToastProvider>
    </QueryClientProvider>
  );
}
