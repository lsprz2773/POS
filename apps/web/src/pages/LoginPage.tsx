import { useState } from 'react';
import type { FormEvent } from 'react';
import { Navigate } from 'react-router';
import { ApiError } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { es } from '../i18n/es';

export function LoginPage() {
  const { state, login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (state.status === 'authenticated' || state.status === 'blocked') {
    return <Navigate to="/" replace />;
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await login(email, password);
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 0) setError(es.common.networkError);
      else if (caught instanceof ApiError && caught.status < 500) setError(caught.message);
      else setError(es.common.unexpectedError);
    } finally {
      setSubmitting(false);
    }
  }

  const expired = state.status === 'unauthenticated' && state.expired;

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 p-4">
      <h1 className="text-2xl font-semibold">{es.auth.loginTitle}</h1>
      {expired && <p role="status">{es.auth.sessionExpired}</p>}
      <form onSubmit={(event) => void onSubmit(event)} className="flex flex-col gap-4" noValidate>
        <label className="flex flex-col gap-1">
          <span>{es.auth.email}</span>
          <input
            type="email"
            autoComplete="username"
            className="field"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
        </label>
        <label className="flex flex-col gap-1">
          <span>{es.auth.password}</span>
          <input
            type="password"
            autoComplete="current-password"
            className="field"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
        </label>
        {error && (
          <p role="alert" className="text-red-800">
            {error}
          </p>
        )}
        <button type="submit" className="btn-primary" disabled={submitting}>
          {submitting ? es.auth.submitting : es.auth.submit}
        </button>
      </form>
    </main>
  );
}
