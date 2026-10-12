import { CheckCircle2, Info, XCircle } from 'lucide-react';
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { Tone } from './Banner';

interface ToastItem {
  id: number;
  tone: Tone;
  text: string;
}

const ToastContext = createContext<{ show: (tone: Tone, text: string) => void } | null>(null);

const ICON = { ok: CheckCircle2, info: Info, warn: Info, bad: XCircle } as const;
const DURATION = { ok: 4000, info: 5000, warn: 7000, bad: 9000 } as const;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const next = useRef(1);

  const show = useCallback((tone: Tone, text: string) => {
    const id = next.current++;
    setItems((current) => [...current.slice(-2), { id, tone, text }]);
    window.setTimeout(
      () => setItems((current) => current.filter((t) => t.id !== id)),
      DURATION[tone],
    );
  }, []);
  const value = useMemo(() => ({ show }), [show]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      {/* La región existe siempre para que los lectores de pantalla anuncien lo que aparezca. */}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-3 top-3 z-50 flex flex-col items-center gap-2"
      >
        {items.map((item) => {
          const Icon = ICON[item.tone];
          return (
            <div key={item.id} className={`toast glass2 ban-${item.tone} pointer-events-auto`}>
              <Icon className="ic" aria-hidden="true" />
              {item.text}
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast requiere ToastProvider');
  return context;
}
