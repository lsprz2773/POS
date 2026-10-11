-- Up Migration

-- Función reutilizable para mantener `updated_at` en las tablas que lo requieran (RF-118).
CREATE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
