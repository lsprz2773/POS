import { sql } from 'kysely';

/**
 * Una venta cuenta como vendida si está vigente o si se canceló sin restituir el inventario (B13).
 * Se usa sobre el alias `s` de la tabla `sales`.
 */
export const COUNTS_AS_SOLD = sql<boolean>`(s.status = 'active' or exists (select 1
  from sale_cancellations c
  where c.sale_id = s.id and c.tenant_id = s.tenant_id and not c.inventory_restored))`;
