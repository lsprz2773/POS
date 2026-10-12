import { WifiOff } from 'lucide-react';
import { useEffect, useState } from 'react';
import { copy } from '../copy/es';

export function useOnline(): boolean {
  const [online, setOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  return online;
}

/** La aplicación es solo en línea (B12): avisa y las escrituras deben deshabilitarse mientras dure. */
export function OfflineBanner() {
  const online = useOnline();
  if (online) return null;
  return (
    <div role="status" className="ban ban-warn mx-3 mt-3">
      <WifiOff className="ic" aria-hidden="true" />
      <div>{copy.offline.banner}</div>
    </div>
  );
}
