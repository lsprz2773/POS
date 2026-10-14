-- Up Migration

-- Fase 10b (T105): la disponibilidad del día es por persona. La jornada (`workdays`) sigue siendo única
-- por tienda y fecha; cada usuario prepara su propio día dentro de ella.
ALTER TABLE daily_offers ADD COLUMN user_id uuid;

-- Lo que hay hoy lo preparó el propietario de cada tienda.
UPDATE daily_offers o
SET user_id = (
  SELECT m.user_id FROM memberships m WHERE m.tenant_id = o.tenant_id AND m.role = 'owner'
);

ALTER TABLE daily_offers
  ALTER COLUMN user_id SET NOT NULL,
  ADD CONSTRAINT daily_offers_member_fkey FOREIGN KEY (tenant_id, user_id)
    REFERENCES memberships (tenant_id, user_id),
  DROP CONSTRAINT daily_offers_workday_product_key,
  ADD CONSTRAINT daily_offers_workday_user_product_key UNIQUE (workday_id, user_id, product_id);

-- Compatibilidad hacia atrás: el código anterior no conoce `user_id`; mientras la tienda solo tenga a su
-- propietario, sus inserciones siguen funcionando y quedan a su nombre.
CREATE FUNCTION daily_offers_default_user() RETURNS trigger AS $$
BEGIN
  IF NEW.user_id IS NULL THEN
    SELECT m.user_id INTO NEW.user_id
    FROM memberships m WHERE m.tenant_id = NEW.tenant_id AND m.role = 'owner';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER daily_offers_default_user BEFORE INSERT ON daily_offers
  FOR EACH ROW EXECUTE FUNCTION daily_offers_default_user();
