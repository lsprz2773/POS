import { SearchX } from 'lucide-react';
import { Link } from 'react-router';
import { EmptyState } from '../components/EmptyState';
import { copy } from '../copy/es';

export function NotFoundPage() {
  return (
    <EmptyState
      icon={SearchX}
      title={copy.states.notFoundTitle}
      text={copy.states.notFoundText}
      action={
        <Link to="/" className="btn btn-p">
          {copy.states.goHome}
        </Link>
      }
    />
  );
}
