import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearDraft, loadDraft, saveDraft } from './draft';

afterEach(() => {
  sessionStorage.clear();
  vi.restoreAllMocks();
});

const draft = { tenantId: 't1', cart: { p1: '2' }, customer: 'Ana', note: '' };

describe('borrador de la venta', () => {
  it('se guarda y se recupera para la misma tienda', () => {
    saveDraft(draft);
    expect(loadDraft('t1')).toEqual(draft);
  });

  it('no se entrega a otra tienda', () => {
    saveDraft(draft);
    expect(loadDraft('t2')).toBeNull();
  });

  it('se descarta', () => {
    saveDraft(draft);
    clearDraft();
    expect(loadDraft('t1')).toBeNull();
  });

  it('ignora datos corruptos', () => {
    sessionStorage.setItem('pos.saleDraft', '{no es json');
    expect(loadDraft('t1')).toBeNull();
    sessionStorage.setItem('pos.saleDraft', JSON.stringify({ tenantId: 't1', cart: 5 }));
    expect(loadDraft('t1')).toBeNull();
  });

  it('sin almacenamiento disponible no falla', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('bloqueado');
    });
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('bloqueado');
    });
    expect(() => saveDraft(draft)).not.toThrow();
    expect(loadDraft('t1')).toBeNull();
  });
});
