import { Search } from 'lucide-react';
import { useId, type ComponentProps } from 'react';

/** Buscador con etiqueta para lectores de pantalla y teclado de búsqueda en móvil. */
export function SearchField({ label, ...input }: { label: string } & ComponentProps<'input'>) {
  const id = useId();
  return (
    <div className="relative">
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <Search
        className="ic pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2"
        style={{ color: 'var(--ink3)' }}
        aria-hidden="true"
      />
      <input
        id={id}
        type="search"
        inputMode="search"
        enterKeyHint="search"
        autoComplete="off"
        className="inp"
        style={{ paddingLeft: 44 }}
        placeholder={label}
        {...input}
      />
    </div>
  );
}
