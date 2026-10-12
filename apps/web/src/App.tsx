import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { createBrowserRouter, Navigate, RouterProvider, type RouteObject } from 'react-router';
import { AppShell } from './components/AppShell';
import { ErrorState } from './components/ErrorState';
import { LoadingRegion, Skeleton } from './components/Skeleton';
import { ToastProvider } from './components/Toast';
import { copy } from './copy/es';
import { BlockedPage } from './features/session/BlockedPage';
import { LoginPage } from './features/session/LoginPage';
import { ProfilePage } from './features/session/ProfilePage';
import { useSession } from './features/session/useSession';
import { CatalogPage } from './features/catalog/CatalogPage';
import { ProductFormPage } from './features/catalog/ProductFormPage';
import { NewSalePage } from './features/sales/NewSalePage';
import { PendingPage } from './features/sales/PendingPage';
import { SaleDetailPage } from './features/sales/SaleDetailPage';
import { SaleRegisteredPage } from './features/sales/SaleRegisteredPage';
import { InventoryPage } from './features/workday/InventoryPage';
import { PastDaysPage } from './features/workday/PastDaysPage';
import { PrepareDayPage } from './features/workday/PrepareDayPage';
import { SettingsPage } from './features/store/SettingsPage';
import { ComingSoonPage } from './pages/ComingSoonPage';
import { MorePage } from './pages/MorePage';
import { NotFoundPage } from './pages/NotFoundPage';

/** Pantallas que se construyen en la siguiente entrega (8e). */
const PLACEHOLDERS = [
  ['/', copy.nav.today],
  ['/historial', copy.more.history],
  ['/reportes', copy.more.reports],
] as const;

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

function ProfileRoute() {
  const session = useSession();
  return session.status === 'authenticated' ? <ProfilePage me={session.me} /> : null;
}

export const routes: RouteObject[] = [
  { path: '/login', element: <LoginPage /> },
  {
    element: <SessionGate />,
    children: [
      ...PLACEHOLDERS.map(([path, title]) => ({
        path,
        element: <ComingSoonPage title={title} />,
      })),
      { path: '/mas', element: <MorePage /> },
      { path: '/vender', element: <NewSalePage /> },
      { path: '/vender/listo/:id', element: <SaleRegisteredPage /> },
      { path: '/ventas/:id', element: <SaleDetailPage /> },
      { path: '/pendientes', element: <PendingPage /> },
      { path: '/dia', element: <PrepareDayPage /> },
      { path: '/dia/inventario', element: <InventoryPage /> },
      { path: '/dia/anteriores', element: <PastDaysPage /> },
      { path: '/catalogo', element: <CatalogPage /> },
      { path: '/catalogo/nuevo', element: <ProductFormPage /> },
      { path: '/catalogo/:id', element: <ProductFormPage /> },
      { path: '/configuracion', element: <SettingsPage /> },
      { path: '/perfil', element: <ProfileRoute /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
];

export const createQueryClient = (retry: number | false = 1) =>
  new QueryClient({ defaultOptions: { queries: { refetchOnWindowFocus: false, retry } } });

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
