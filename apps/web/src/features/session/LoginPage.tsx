import { loginRequestSchema } from '@pos/shared';
import { useQueryClient } from '@tanstack/react-query';
import { ShoppingBag } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router';
import { Banner } from '../../components/Banner';
import { Button } from '../../components/Button';
import { Field } from '../../components/Field';
import { useOnline } from '../../components/OfflineBanner';
import { copy } from '../../copy/es';
import { api, ApiError } from '../../lib/api';
import { messageOf } from '../../lib/errors';
import { setSessionEnded } from '../../lib/useUnsavedGuard';
import { ME_KEY, useSession } from './useSession';

type FieldErrors = Partial<Record<'email' | 'password', string>>;

export function LoginPage() {
  const session = useSession();
  const client = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();
  const online = useOnline();
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const state = location.state as { loggedOut?: boolean; from?: string } | null;
  const loggedOut = state?.loggedOut === true;
  // Solo se vuelve a rutas internas: nunca a una dirección externa.
  const from = state?.from;
  const returnTo =
    from && from.startsWith('/') && !from.startsWith('//') && from !== '/login' ? from : '/';

  useEffect(() => {
    setSessionEnded(false);
  }, []);

  if (session.status === 'authenticated' || session.status === 'blocked') {
    return <Navigate to={returnTo} replace />;
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    const email = emailRef.current?.value ?? '';
    const password = passwordRef.current?.value ?? '';

    const found: FieldErrors = {};
    if (!loginRequestSchema.shape.email.safeParse(email).success)
      found.email = copy.login.emailRequired;
    if (password.length === 0) found.password = copy.login.passwordRequired;
    setErrors(found);
    setFailure(null);
    if (found.email) return void emailRef.current?.focus();
    if (found.password) return void passwordRef.current?.focus();

    setSubmitting(true);
    try {
      await api.post('/auth/login', { email, password }, { skipRefresh: true });
      await client.invalidateQueries({ queryKey: ME_KEY });
      void navigate(returnTo, { replace: true });
    } catch (error) {
      // Mensaje genérico: no se revela si falló el correo o la contraseña.
      setFailure(
        error instanceof ApiError && error.code === 'invalid_credentials'
          ? copy.login.invalid
          : messageOf(error),
      );
      if (passwordRef.current) passwordRef.current.value = '';
      passwordRef.current?.focus();
    } finally {
      setSubmitting(false);
    }
  }

  const summary = Object.values(errors).filter(Boolean);

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-5 px-4 py-8">
      <div className="flex items-center gap-3">
        <span
          className="flex h-12 w-12 items-center justify-center rounded-2xl"
          style={{ background: 'var(--prim)', color: 'var(--primx)' }}
          aria-hidden="true"
        >
          <ShoppingBag className="ic" />
        </span>
        <span className="h2">{copy.app.name}</span>
      </div>

      <div>
        <h1 className="h1">{copy.login.title}</h1>
        <p className="sub mt-1">{copy.login.subtitle}</p>
      </div>

      {loggedOut ? <Banner tone="ok">{copy.login.loggedOut}</Banner> : null}
      {failure ? <Banner tone="bad">{failure}</Banner> : null}
      {summary.length > 0 ? (
        <Banner tone="bad">
          {copy.login.summary} {summary.join(' ')}
        </Banner>
      ) : null}

      <form onSubmit={onSubmit} noValidate className="glass card flex flex-col gap-4">
        <Field
          ref={emailRef}
          label={copy.login.email}
          type="email"
          name="email"
          autoComplete="username"
          inputMode="email"
          autoCapitalize="none"
          error={errors.email}
        />
        <Field
          ref={passwordRef}
          label={copy.login.password}
          type="password"
          name="password"
          autoComplete="current-password"
          error={errors.password}
        />
        <Button type="submit" variant="primary" large block loading={submitting} disabled={!online}>
          {copy.login.submit}
        </Button>
      </form>
    </main>
  );
}
