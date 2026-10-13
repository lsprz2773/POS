-- Up Migration

-- Folio consecutivo por tienda (RF-049). Se incrementa dentro de la transacción de la venta: si la
-- venta se revierte, el número no se pierde, y las ventas de una misma tienda se numeran una a la vez.
CREATE TABLE sale_counters (
  tenant_id uuid PRIMARY KEY REFERENCES tenants (id),
  last_folio integer NOT NULL DEFAULT 0 CHECK (last_folio >= 0)
);

-- Venta (F-06). Pertenece a la jornada de su día. Nada se borra ni se edita: se cancela (fase 6).
-- idempotency_key + request_hash permiten reintentar sin duplicar (RF-062, T7).
CREATE TABLE sales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants (id),
  workday_id uuid NOT NULL,
  folio integer NOT NULL CHECK (folio >= 1),
  customer_reference text CHECK (customer_reference IS NULL OR char_length(customer_reference) BETWEEN 1 AND 100),
  note text CHECK (note IS NULL OR char_length(note) BETWEEN 1 AND 500),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'cancelled')),
  total numeric(12, 2) NOT NULL CHECK (total >= 0),
  created_by uuid NOT NULL REFERENCES users (id),
  idempotency_key text NOT NULL CHECK (char_length(idempotency_key) BETWEEN 8 AND 128),
  request_hash text NOT NULL CHECK (char_length(request_hash) = 64),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sales_workday_fkey FOREIGN KEY (tenant_id, workday_id)
    REFERENCES workdays (tenant_id, id),
  CONSTRAINT sales_tenant_folio_key UNIQUE (tenant_id, folio),
  CONSTRAINT sales_tenant_idempotency_key UNIQUE (tenant_id, idempotency_key),
  CONSTRAINT sales_tenant_id_id_key UNIQUE (tenant_id, id)
);
CREATE TRIGGER sales_set_updated_at BEFORE UPDATE ON sales
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE INDEX sales_workday_idx ON sales (workday_id);
CREATE INDEX sales_tenant_created_idx ON sales (tenant_id, created_at DESC);

-- Renglones. Congelan nombre, precio y costo al vender (RF-044, RF-045, invariante 6).
CREATE TABLE sale_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  sale_id uuid NOT NULL,
  position smallint NOT NULL CHECK (position >= 1),
  daily_offer_id uuid NOT NULL,
  product_id uuid NOT NULL,
  product_name text NOT NULL CHECK (char_length(product_name) BETWEEN 1 AND 100),
  quantity numeric(12, 3) NOT NULL CHECK (quantity > 0),
  unit_price numeric(12, 2) NOT NULL CHECK (unit_price >= 0),
  unit_cost numeric(12, 2) NOT NULL CHECK (unit_cost >= 0),
  subtotal numeric(12, 2) NOT NULL CHECK (subtotal >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sale_items_sale_fkey FOREIGN KEY (tenant_id, sale_id)
    REFERENCES sales (tenant_id, id),
  CONSTRAINT sale_items_offer_fkey FOREIGN KEY (tenant_id, daily_offer_id)
    REFERENCES daily_offers (tenant_id, id),
  CONSTRAINT sale_items_product_fkey FOREIGN KEY (tenant_id, product_id)
    REFERENCES products (tenant_id, id),
  CONSTRAINT sale_items_sale_offer_key UNIQUE (sale_id, daily_offer_id),
  CONSTRAINT sale_items_sale_position_key UNIQUE (sale_id, position)
);
CREATE INDEX sale_items_offer_idx ON sale_items (daily_offer_id);

-- Invariante 7: una venta confirmada nunca se borra ni se edita. La base lo hace cumplir aunque
-- falle la aplicación. Solo puede cambiar el estado (cancelación) y su fecha de modificación.
CREATE FUNCTION sales_protect_confirmed() RETURNS trigger AS $$
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
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER sales_protect_confirmed BEFORE UPDATE OR DELETE ON sales
  FOR EACH ROW EXECUTE FUNCTION sales_protect_confirmed();

CREATE FUNCTION sale_items_protect() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Los renglones de una venta no se editan ni se borran' USING ERRCODE = 'P0001';
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER sale_items_protect BEFORE UPDATE OR DELETE ON sale_items
  FOR EACH ROW EXECUTE FUNCTION sale_items_protect();
