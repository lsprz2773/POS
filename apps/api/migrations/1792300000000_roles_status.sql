-- Up Migration

-- Fase 10a (T101, T106): rol de vendedor y estado de la cuenta. Solo se amplía: el código anterior
-- sigue funcionando mientras la tienda tenga únicamente a su propietario.
ALTER TABLE memberships DROP CONSTRAINT memberships_role_check;
ALTER TABLE memberships
  ADD CONSTRAINT memberships_role_check CHECK (role IN ('owner', 'seller')),
  ADD COLUMN status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  ADD COLUMN invited_by uuid REFERENCES users (id);

-- Una tienda tiene exactamente un propietario; los demás son vendedores.
CREATE UNIQUE INDEX memberships_one_owner_idx ON memberships (tenant_id) WHERE role = 'owner';

-- Nombre para mostrar (reportes del equipo); la contraseña sigue en el proveedor de identidad.
ALTER TABLE users ADD COLUMN display_name text CHECK (char_length(btrim(display_name)) BETWEEN 1 AND 80);

-- Alcance por fila del vendedor: ventas de una persona dentro de la tienda.
CREATE INDEX sales_tenant_created_by_idx ON sales (tenant_id, created_by, folio DESC);
