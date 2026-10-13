/** Marcador de carga con la forma del contenido; se oculta a los lectores de pantalla. */
export function Skeleton({
  className = '',
  style,
}: {
  className?: string;
  style?: React.CSSProperties;
}) {
  return <div className={`skel ${className}`} style={style} aria-hidden="true" />;
}

/** Tarjeta de métrica en carga. */
export function MetricSkeleton() {
  return (
    <div className="glass card" aria-hidden="true">
      <Skeleton className="h-4 w-24" />
      <Skeleton className="mt-3 h-8 w-32" />
    </div>
  );
}

/** Fila de lista en carga. */
export function RowSkeleton() {
  return (
    <div className="li" aria-hidden="true">
      <Skeleton className="h-10 w-10" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-4 w-2/3" />
        <Skeleton className="h-3 w-1/3" />
      </div>
    </div>
  );
}

/** Contenedor accesible para un grupo de marcadores: anuncia "Cargando…" una sola vez. */
export function LoadingRegion({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div role="status" aria-busy="true" aria-label={label}>
      {children}
    </div>
  );
}
