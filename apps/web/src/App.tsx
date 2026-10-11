import { ApiStatus } from './components/ApiStatus';
import { es } from './i18n/es';

export function App() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-4 p-4">
      <h1 className="text-2xl font-semibold">{es.appName}</h1>
      <ApiStatus />
    </main>
  );
}
