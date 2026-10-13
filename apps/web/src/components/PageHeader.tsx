import { ChevronLeft } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router';

/** Encabezado de pantalla. Con `back` muestra el botón "Volver" a la pantalla de origen. */
export function PageHeader({
  title,
  action,
  back,
}: {
  title: string;
  action?: ReactNode;
  back?: { to: string; label: string };
}) {
  return (
    <header className="flex items-center gap-3">
      {back ? (
        <Link to={back.to} className="iconbtn" aria-label={back.label}>
          <ChevronLeft className="ic" aria-hidden="true" />
        </Link>
      ) : null}
      <h1 className="h1 min-w-0 flex-1" tabIndex={-1}>
        {title}
      </h1>
      {action}
    </header>
  );
}
