import { Hammer } from 'lucide-react';
import { EmptyState } from '../components/EmptyState';
import { PageHeader } from '../components/PageHeader';
import { copy } from '../copy/es';

/** Marcador de las pantallas que se construyen en las siguientes entregas de la fase 8. */
export function ComingSoonPage({ title }: { title: string }) {
  return (
    <>
      <PageHeader title={title} />
      <EmptyState icon={Hammer} title={copy.states.comingTitle} text={copy.states.comingText} />
    </>
  );
}
