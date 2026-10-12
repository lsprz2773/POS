import { describe, expect, it } from 'vitest';
import { createIntentKeys } from './idempotency';

describe('llaves de idempotencia por intento', () => {
  const sequence = () => {
    let n = 0;
    return () => `key-${++n}`;
  };

  it('el mismo contenido reenviado usa la misma llave', () => {
    const keys = createIntentKeys(sequence());
    expect(keys.keyFor('a')).toBe('key-1');
    expect(keys.keyFor('a')).toBe('key-1');
  });

  it('si cambia el contenido se estrena otra llave', () => {
    const keys = createIntentKeys(sequence());
    expect(keys.keyFor('a')).toBe('key-1');
    expect(keys.keyFor('b')).toBe('key-2');
    expect(keys.keyFor('a')).toBe('key-3');
  });

  it('tras la confirmación del servidor, el siguiente intento es nuevo', () => {
    const keys = createIntentKeys(sequence());
    keys.keyFor('a');
    keys.done();
    expect(keys.keyFor('a')).toBe('key-2');
  });

  it('genera llaves válidas para el API por omisión', () => {
    const key = createIntentKeys().keyFor('x');
    expect(key).toMatch(/^[A-Za-z0-9._:-]{8,128}$/);
  });
});
