import { useEffect, useState } from 'react';
import { readyResponseSchema } from '@pos/shared';
import { apiGet } from '../api/client';
import { es } from '../i18n/es';

type State = 'checking' | 'ok' | 'unavailable';

export function ApiStatus() {
  const [state, setState] = useState<State>('checking');

  useEffect(() => {
    let active = true;
    apiGet('/api/health/ready', readyResponseSchema)
      .then(() => active && setState('ok'))
      .catch(() => active && setState('unavailable'));
    return () => {
      active = false;
    };
  }, []);

  const tone =
    state === 'ok'
      ? 'bg-green-100 text-green-900'
      : state === 'unavailable'
        ? 'bg-red-100 text-red-900'
        : 'bg-gray-100 text-gray-800';

  return (
    <p role="status" className={`rounded-md px-3 py-2 text-sm ${tone}`}>
      {es.status[state]}
    </p>
  );
}
