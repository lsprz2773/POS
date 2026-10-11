-- Up Migration

-- Jornada (B8): un día de venta de la tienda. Única por (tienda, fecha de negocio). Copia el horario
-- de la configuración al crearse y puede ajustarse por día; el horario es informativo (B15).
CREATE TABLE workdays (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants (id),
  business_date date NOT NULL,
  start_time time NOT NULL,
  end_time time NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT workdays_hours_order CHECK (end_time > start_time),
  CONSTRAINT workdays_tenant_date_key UNIQUE (tenant_id, business_date),
  CONSTRAINT workdays_tenant_id_id_key UNIQUE (tenant_id, id)
);
CREATE TRIGGER workdays_set_updated_at BEFORE UPDATE ON workdays
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Disponibilidad diaria (RF-028, RF-029): un producto ofrecido en una jornada, con su cantidad inicial.
-- Las llaves compuestas con tenant_id impiden que la base mezcle jornadas o productos de otra tienda.
-- initial_quantity nunca se edita: solo crece mediante stock_adjustments (B9).
CREATE TABLE daily_offers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  workday_id uuid NOT NULL,
  product_id uuid NOT NULL,
  initial_quantity numeric(12, 3) NOT NULL CHECK (initial_quantity >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT daily_offers_workday_fkey FOREIGN KEY (tenant_id, workday_id)
    REFERENCES workdays (tenant_id, id),
  CONSTRAINT daily_offers_product_fkey FOREIGN KEY (tenant_id, product_id)
    REFERENCES products (tenant_id, id),
  CONSTRAINT daily_offers_workday_product_key UNIQUE (workday_id, product_id),
  CONSTRAINT daily_offers_tenant_id_id_key UNIQUE (tenant_id, id)
);
CREATE TRIGGER daily_offers_set_updated_at BEFORE UPDATE ON daily_offers
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Aumentos de la cantidad inicial (B9, RF-038): solo incrementos, con motivo y responsable.
CREATE TABLE stock_adjustments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  daily_offer_id uuid NOT NULL,
  increment numeric(12, 3) NOT NULL CHECK (increment > 0),
  reason text NOT NULL CHECK (char_length(btrim(reason)) BETWEEN 1 AND 200),
  user_id uuid NOT NULL REFERENCES users (id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT stock_adjustments_offer_fkey FOREIGN KEY (tenant_id, daily_offer_id)
    REFERENCES daily_offers (tenant_id, id)
);
CREATE INDEX stock_adjustments_offer_idx ON stock_adjustments (daily_offer_id, created_at);
-- Leer los productos de una jornada.
CREATE INDEX daily_offers_workday_idx ON daily_offers (workday_id);
