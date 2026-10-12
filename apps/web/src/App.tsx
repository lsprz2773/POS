import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router';
import { AppShell } from './components/AppShell';
import { ErrorState } from './components/ErrorState';
import { LoadingRegion, Skeleton } from './components/Skeleton';
import { ToastProvider } from './components/Toast';
import { copy } from './copy/es';
import { BlockedPage } from './features/session/BlockedPage';
import { LoginPage } from './features/session/LoginPage';
import { ProfilePage } from './features/session/ProfilePage';
import { useSession } from './features/session/useSession';
import { ComingSoonPage } from './pages/ComingSoonPage';
import { MorePage } from './pages/MorePage';
import { NotFoundPage } from './pages/NotFoundPage';

/** Pantallas que se construyen en las siguientes entregas (8b a 8e). */
const PLACEHOLDERS = [
  ['/', copy.nav.today],
  ['/vender', copy.nav.sell],
  ['/pendientes', copy.nav.pending],
  ['/dia', copy.nav.day],
  ['/catalogo', copy.more.catalog],
  ['/historial', copy.more.history],
  ['/reportes', copy.more.reports],
  ['/configuracion', copy.more.settings],
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

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<SessionGate />}>
        {PLACEHOLDERS.map(([path, title]) => (
          <Route key={path} path={path} element={<ComingSoonPage title={title} />} />
        ))}
        <Route path="/mas" element={<MorePage />} />
        <Route path="/perfil" element={<ProfileRoute />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}

export const createQueryClient = () =>
  new QueryClient({ defaultOptions: { queries: { refetchOnWindowFocus: false, retry: 1 } } });

export function App() {
  const [client] = useState(createQueryClient);
  return (
    <QueryClientProvider client={client}>
      <ToastProvider>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </ToastProvider>
    </QueryClientProvider>
  );
}
