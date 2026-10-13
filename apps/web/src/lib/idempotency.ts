/**
 * Llave de idempotencia por intento (RF-062): el mismo intento reenviado usa la misma llave, y si
 * cambia el contenido se estrena otra. Así un reintento por red no duplica la venta o el pago.
 */
export function createIntentKeys(newKey: () => string = () => crypto.randomUUID()) {
  let current: { fingerprint: string; key: string } | null = null;
  return {
    keyFor(fingerprint: string): string {
      if (!current || current.fingerprint !== fingerprint) {
        current = { fingerprint, key: newKey() };
      }
      return current.key;
    },
    /** Tras una confirmación del servidor el intento termina: el siguiente es nuevo. */
    done() {
      current = null;
    },
  };
}
