-- Up Migration

-- Fecha y hora en que la venta quedó pagada por completo (RF-068). Se calcula al registrar o anular
-- pagos; el disparador de ventas ya permite cambiarla porque solo protege las columnas que nombra.
ALTER TABLE sales ADD COLUMN settled_at timestamptz;

-- Pagos de una venta (F-07). Cada renglón es un método y un importe; un pago mixto son varios
-- renglones con la misma operation_id. El método es solo informativo (B16): no hay pasarelas.
-- Nada se borra: un pago erróneo se anula con motivo y se conserva (B4).
CREATE TABLE payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  sale_id uuid NOT NULL,
  operation_id uuid NOT NULL,
  method text NOT NULL CHECK (method IN ('cash', 'transfer')),
  amount numeric(12, 2) NOT NULL CHECK (amount > 0),
  status text NOT NULL DEFAULT 'valid' CHECK (status IN ('valid', 'voided')),
  created_by uuid NOT NULL REFERENCES users (id),
  idempotency_key text NOT NULL CHECK (char_length(idempotency_key) BETWEEN 8 AND 128),
  request_hash text NOT NULL CHECK (char_length(request_hash) = 64),
  void_reason text,
  voided_at timestamptz,
  voided_by uuid REFERENCES users (id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT payments_sale_fkey FOREIGN KEY (tenant_id, sale_id)
    REFERENCES sales (tenant_id, id),
  CONSTRAINT payments_void_consistency CHECK (
    (status = 'valid' AND void_reason IS NULL AND voided_at IS NULL AND voided_by IS NULL)
    OR (status = 'voided' AND voided_at IS NOT NULL AND voided_by IS NOT NULL
        AND char_length(btrim(void_reason)) BETWEEN 1 AND 200)
  ),
  -- Una operación tiene como máximo un renglón por método.
  CONSTRAINT payments_operation_method_key UNIQUE (operation_id, method),
  -- La llave de idempotencia identifica la operación; sus renglones se distinguen por método.
  CONSTRAINT payments_tenant_idempotency_key UNIQUE (tenant_id, idempotency_key, method),
  CONSTRAINT payments_tenant_id_id_key UNIQUE (tenant_id, id)
);
CREATE INDEX payments_sale_idx ON payments (sale_id);
-- Cobrado por periodo y método (fase 7).
CREATE INDEX payments_tenant_created_idx ON payments (tenant_id, created_at);

-- Un pago confirmado nunca se borra ni se edita; solo puede pasar de vigente a anulado, una vez.
CREATE FUNCTION payments_protect() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Un pago no se borra' USING ERRCODE = 'P0001';
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
     OR NEW.sale_id IS DISTINCT FROM OLD.sale_id
     OR NEW.operation_id IS DISTINCT FROM OLD.operation_id
     OR NEW.method IS DISTINCT FROM OLD.method
     OR NEW.amount IS DISTINCT FROM OLD.amount
     OR NEW.created_by IS DISTINCT FROM OLD.created_by
     OR NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key
     OR NEW.request_hash IS DISTINCT FROM OLD.request_hash
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Un pago no se edita' USING ERRCODE = 'P0001';
  END IF;
  IF OLD.status = 'voided' AND (
       NEW.status IS DISTINCT FROM OLD.status
       OR NEW.void_reason IS DISTINCT FROM OLD.void_reason
       OR NEW.voided_at IS DISTINCT FROM OLD.voided_at
       OR NEW.voided_by IS DISTINCT FROM OLD.voided_by) THEN
    RAISE EXCEPTION 'Un pago anulado no se modifica' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER payments_protect BEFORE UPDATE OR DELETE ON payments
  FOR EACH ROW EXECUTE FUNCTION payments_protect();
