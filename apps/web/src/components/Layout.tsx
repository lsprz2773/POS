import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { useAuth } from '../auth/AuthContext';
import { es } from '../i18n/es';

export function Layout({ children }: { children: ReactNode }) {
  const { state, logout } = useAuth();
  const storeName = state.status === 'authenticated' ? state.me.tenant.name : es.appName;

  return (
    <div className="mx-auto flex min-h-dvh max-w-2xl flex-col">
      <header className="flex items-center justify-between gap-3 border-b border-gray-200 p-4">
        <Link to="/" className="truncate text-lg font-semibold">
          {storeName}
        </Link>
        <button type="button" className="btn-secondary" onClick={() => void logout()}>
          {es.auth.logout}
        </button>
      </header>
      <main className="flex flex-1 flex-col gap-4 p-4">{children}</main>
    </div>
  );
}
