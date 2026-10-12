import { useIsFetching, useIsMutating } from '@tanstack/react-query';

/** Barra fina superior mientras hay solicitudes en curso. */
export function TopProgress() {
  const busy = useIsFetching() + useIsMutating() > 0;
  if (!busy) return null;
  return (
    <div
      aria-hidden="true"
      className="skel fixed inset-x-0 top-0 z-50 h-1"
      style={{ borderRadius: 0, background: 'var(--prim)', opacity: 0.8 }}
    />
  );
}
