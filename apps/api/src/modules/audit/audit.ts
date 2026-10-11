import type { Database } from '../../db/client';

export interface AuditEventInput {
  tenantId: string;
  actorUserId: string | null;
  entity: string;
  entityId: string | null;
  action: string;
  /** Datos de negocio; nunca secretos, tokens ni contraseñas (RF-121). */
  data?: Record<string, unknown>;
}

/**
 * Registra un evento de negocio. Debe llamarse con la misma transacción que el cambio auditado,
 * de modo que si el evento no se guarda, el cambio tampoco se confirma (sección 6.12).
 */
export async function recordAudit(executor: Database, event: AuditEventInput): Promise<void> {
  await executor
    .insertInto('audit_events')
    .values({
      tenant_id: event.tenantId,
      actor_user_id: event.actorUserId,
      entity: event.entity,
      entity_id: event.entityId,
      action: event.action,
      data: JSON.stringify(event.data ?? {}),
    })
    .execute();
}
