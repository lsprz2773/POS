-- Up Migration

-- Catálogo de productos (F-03). Nada se borra: desactivar (active = false) conserva el historial
-- de ventas (RF-025). El tenant lo fija siempre el backend desde la identidad autenticada.
-- price y cost son decimales exactos de 2 posiciones (RF-021); el costo es obligatorio y puede ser 0 (B6).
-- allows_fractions queda en falso: hoy solo se venden unidades enteras (B1).
CREATE TABLE products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants (id),
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 100),
  description text CHECK (description IS NULL OR char_length(description) BETWEEN 1 AND 500),
  category text CHECK (category IS NULL OR char_length(category) BETWEEN 1 AND 60),
  code text CHECK (code IS NULL OR char_length(code) BETWEEN 1 AND 40),
  unit text NOT NULL DEFAULT 'pieza' CHECK (char_length(unit) BETWEEN 1 AND 20),
  allows_fractions boolean NOT NULL DEFAULT false,
  price numeric(12, 2) NOT NULL CHECK (price >= 0),
  cost numeric(12, 2) NOT NULL CHECK (cost >= 0),
  notes text CHECK (notes IS NULL OR char_length(notes) BETWEEN 1 AND 500),
  active boolean NOT NULL DEFAULT true,
  -- Control de edición simultánea: sube en cada cambio y evita sobrescrituras silenciosas.
  version integer NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- Permite que las tablas de fases siguientes (disponibilidad diaria, renglones de venta)
  -- referencien (tenant_id, id) y la base garantice que no se mezclan tiendas.
  CONSTRAINT products_tenant_id_id_key UNIQUE (tenant_id, id)
);
CREATE TRIGGER products_set_updated_at BEFORE UPDATE ON products
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- El código interno, si existe, no se repite dentro de la tienda (sin distinguir mayúsculas).
CREATE UNIQUE INDEX products_tenant_code_key ON products (tenant_id, lower(code))
  WHERE code IS NOT NULL;
-- Listado y búsqueda por nombre dentro de la tienda.
CREATE INDEX products_tenant_name_idx ON products (tenant_id, lower(name), id);
