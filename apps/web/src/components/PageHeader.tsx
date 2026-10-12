import type { ReactNode } from 'react';

export function PageHeader({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <header className="flex items-center justify-between gap-3">
      <h1 className="h1" tabIndex={-1}>
        {title}
      </h1>
      {action}
    </header>
  );
}
