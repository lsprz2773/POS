import { Navigate, Outlet } from 'react-router';
import { es } from '../i18n/es';
import { useAuth } from './AuthContext';
import { Layout } from '../components/Layout';

export function RequireAuth() {
  const { state, logout, reload } = useAuth();

  if (state.status === 'loading') {
    return (
      <main className="mx-auto max-w-md p-4">
        <p role="status">{es.common.loading}</p>
      </main>
    );
  }
  if (state.status === 'unauthenticated') return <Navigate to="/login" replace />;
  if (state.status === 'error') {
    return (
      <main className="mx-auto flex max-w-md flex-col gap-4 p-4">
        <p role="alert">{es.auth.serverUnavailable}</p>
        <button type="button" className="btn-primary" onClick={() => void reload()}>
          {es.common.retry}
        </button>
      </main>
    );
  }
  if (state.status === 'blocked') {
    const text = es.auth.blocked[state.code];
    return (
      <main className="mx-auto flex max-w-md flex-col gap-4 p-4">
        <h1 className="text-xl font-semibold">{text.title}</h1>
        <p role="alert">{text.message}</p>
        <button type="button" className="btn-secondary" onClick={() => void logout()}>
          {es.auth.logout}
        </button>
      </main>
    );
  }
  return (
    <Layout>
      <Outlet />
    </Layout>
  );
}
