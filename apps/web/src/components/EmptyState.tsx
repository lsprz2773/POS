import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

export function EmptyState({
  icon: Icon,
  title,
  text,
  action,
}: {
  icon: LucideIcon;
  title: string;
  text?: string;
  action?: ReactNode;
}) {
  return (
    <div className="glass card flex flex-col items-center gap-3 px-6 py-10 text-center">
      <Icon className="h-12 w-12" style={{ color: 'var(--prim)' }} aria-hidden="true" />
      <h2 className="h2">{title}</h2>
      {text ? <p className="sub max-w-sm">{text}</p> : null}
      {action}
    </div>
  );
}
