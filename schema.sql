CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  password TEXT,
  password_hash TEXT,
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'mechanic', 'client')),
  client_id TEXT,
  active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS clients (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  document TEXT NOT NULL UNIQUE,
  phone TEXT NOT NULL,
  email TEXT NOT NULL,
  username TEXT,
  password TEXT
);

CREATE TABLE IF NOT EXISTS inventory (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  price NUMERIC(12, 2) NOT NULL DEFAULT 0,
  stock INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0)
);

CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE RESTRICT,
  mechanic_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  plate TEXT NOT NULL,
  brand TEXT NOT NULL,
  model TEXT NOT NULL,
  mileage TEXT NOT NULL,
  service_type TEXT NOT NULL,
  service_price NUMERIC(12, 2) NOT NULL DEFAULT 0,
  damage TEXT NOT NULL,
  reception_notes TEXT NOT NULL DEFAULT '',
  mechanic_notes TEXT NOT NULL DEFAULT '',
  status INTEGER NOT NULL DEFAULT 0 CHECK (status BETWEEN 0 AND 3),
  paid BOOLEAN NOT NULL DEFAULT FALSE,
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS order_parts (
  id BIGSERIAL PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  inventory_id TEXT,
  name TEXT NOT NULL,
  price NUMERIC(12, 2) NOT NULL DEFAULT 0,
  quantity INTEGER NOT NULL CHECK (quantity > 0)
);

CREATE TABLE IF NOT EXISTS order_photos (
  id BIGSERIAL PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('entry', 'evidence')),
  data TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS orders_client_id_idx ON orders(client_id);
CREATE INDEX IF NOT EXISTS orders_paid_at_idx ON orders(paid_at);
CREATE INDEX IF NOT EXISTS order_parts_order_id_idx ON order_parts(order_id);
CREATE INDEX IF NOT EXISTS order_photos_order_id_idx ON order_photos(order_id);
