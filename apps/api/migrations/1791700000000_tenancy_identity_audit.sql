-- Up Migration

-- Tienda (tenant). El estado "disabled" impide operar sin borrar datos.
CREATE TABLE tenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 100),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER tenants_set_updated_at BEFORE UPDATE ON tenants
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Configuración de la tienda (1 a 1). days: 1 = lunes ... 7 = domingo.
CREATE TABLE store_settings (
  tenant_id uuid PRIMARY KEY REFERENCES tenants (id),
  currency char(3) NOT NULL DEFAULT 'MXN' CHECK (currency ~ '^[A-Z]{3}$'),
  timezone text NOT NULL DEFAULT 'America/Mexico_City' CHECK (char_length(timezone) BETWEEN 1 AND 64),
  workday_start time NOT NULL DEFAULT '08:00',
  workday_end time NOT NULL DEFAULT '16:00',
  operating_days smallint[] NOT NULL DEFAULT '{1,2,3,4,5}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT store_settings_workday_order CHECK (workday_end > workday_start),
  CONSTRAINT store_settings_operating_days CHECK (
    cardinality(operating_days) BETWEEN 1 AND 7
    AND operating_days <@ ARRAY[1, 2, 3, 4, 5, 6, 7]::smallint[]
  )
);
CREATE TRIGGER store_settings_set_updated_at BEFORE UPDATE ON store_settings
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Usuario. La contraseña vive en el proveedor de identidad, nunca aquí (RNF-018).
CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL CHECK (char_length(email) BETWEEN 3 AND 254),
  identity_subject text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX users_email_lower_key ON users (lower(email));
CREATE TRIGGER users_set_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Pertenencia usuario-tienda. En el MVP un usuario pertenece a una sola tienda (RF-009);
-- para permitir varias, se elimina memberships_user_id_key y se agrega selección de tienda.
CREATE TABLE memberships (
  tenant_id uuid NOT NULL REFERENCES tenants (id),
  user_id uuid NOT NULL REFERENCES users (id),
  role text NOT NULL CHECK (role IN ('owner')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, user_id),
  CONSTRAINT memberships_user_id_key UNIQUE (user_id)
);

-- Historial de negocio (distinto de los logs técnicos, RF-122). Solo se agrega, nunca se edita.
CREATE TABLE audit_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants (id),
  actor_user_id uuid REFERENCES users (id),
  entity text NOT NULL,
  entity_id text,
  action text NOT NULL,
  data jsonb NOT NULL DEFAULT '{}',
  occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_events_tenant_time_idx ON audit_events (tenant_id, occurred_at DESC);
