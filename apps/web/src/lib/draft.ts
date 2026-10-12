/**
 * Borrador de la venta en curso. Se guarda en `sessionStorage` (solo esta pestaña) para no perderlo si
 * la sesión expira a medio cobro (M7); se descarta al confirmar, al cerrar sesión o si es de otra tienda.
 * Todo acceso está protegido: sin almacenamiento, la app funciona igual.
 */
const KEY = 'pos.saleDraft';

export interface SaleDraft {
  tenantId: string;
  cart: Record<string, string>;
  customer: string;
  note: string;
}

export function saveDraft(draft: SaleDraft): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(draft));
  } catch {
    /* sin almacenamiento disponible */
  }
}

export function loadDraft(tenantId: string): SaleDraft | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const draft = JSON.parse(raw) as Partial<SaleDraft>;
    if (draft.tenantId !== tenantId || typeof draft.cart !== 'object' || draft.cart === null) {
      return null;
    }
    return {
      tenantId,
      cart: draft.cart,
      customer: typeof draft.customer === 'string' ? draft.customer : '',
      note: typeof draft.note === 'string' ? draft.note : '',
    };
  } catch {
    return null;
  }
}

export function clearDraft(): void {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* sin almacenamiento disponible */
  }
}
