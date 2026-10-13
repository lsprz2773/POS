-- Up Migration

-- Cancelación de una venta (F-08, B13, B14). Una venta se cancela una sola vez, con motivo, y nada
-- se borra: la venta conserva folio, renglones y pagos. Aquí queda quién, cuándo, por qué y si el
-- inventario se restituyó (solo cuando la venta es del día de hoy).
CREATE TABLE sale_cancellations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  sale_id uuid NOT NULL,
  reason text NOT NULL CHECK (char_length(btrim(reason)) BETWEEN 1 AND 200),
  inventory_restored boolean NOT NULL,
  cancelled_by uuid NOT NULL REFERENCES users (id),
  cancelled_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sale_cancellations_sale_fkey FOREIGN KEY (tenant_id, sale_id)
    REFERENCES sales (tenant_id, id),
  CONSTRAINT sale_cancellations_sale_key UNIQUE (sale_id)
);
CREATE INDEX sale_cancellations_tenant_idx ON sale_cancellations (tenant_id, cancelled_at);

-- El registro de una cancelación nunca se edita ni se borra.
CREATE FUNCTION sale_cancellations_protect() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'El registro de una cancelación no se edita ni se borra' USING ERRCODE = 'P0001';
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER sale_cancellations_protect BEFORE UPDATE OR DELETE ON sale_cancellations
  FOR EACH ROW EXECUTE FUNCTION sale_cancellations_protect();

-- Una venta cancelada no vuelve a estar vigente. Se amplía el disparador de ventas con esa regla.
CREATE OR REPLACE FUNCTION sales_protect_confirmed() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Una venta confirmada no se borra' USING ERRCODE = 'P0001';
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
     OR NEW.workday_id IS DISTINCT FROM OLD.workday_id
     OR NEW.folio IS DISTINCT FROM OLD.folio
     OR NEW.customer_reference IS DISTINCT FROM OLD.customer_reference
     OR NEW.note IS DISTINCT FROM OLD.note
     OR NEW.total IS DISTINCT FROM OLD.total
     OR NEW.created_by IS DISTINCT FROM OLD.created_by
     OR NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key
     OR NEW.request_hash IS DISTINCT FROM OLD.request_hash
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Una venta confirmada no se edita' USING ERRCODE = 'P0001';
  END IF;
  IF OLD.status = 'cancelled' AND NEW.status IS DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION 'Una venta cancelada no se reactiva' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
