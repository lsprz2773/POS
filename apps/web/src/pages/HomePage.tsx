import { Link } from 'react-router';
import { useAuth } from '../auth/AuthContext';
import { ApiStatus } from '../components/ApiStatus';
import { es } from '../i18n/es';

export function HomePage() {
  const { state } = useAuth();
  const email = state.status === 'authenticated' ? state.me.user.email : '';
  return (
    <>
      <h1 className="text-2xl font-semibold">{es.home.welcome}</h1>
      <p className="text-gray-700">{email}</p>
      <ApiStatus />
      <Link to="/tienda" className="btn-secondary text-center">
        {es.home.storeSettings}
      </Link>
    </>
  );
}
