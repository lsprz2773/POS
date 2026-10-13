import { useIsFetching, useIsMutating } from '@tanstack/react-query';

/** Barra fina superior mientras hay solicitudes en curso. */
export function TopProgress() {
  const busy = useIsFetching() + useIsMutating() > 0;
  if (!busy) return null;
  return <div aria-hidden="true" className="topbar" />;
}
