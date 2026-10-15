-- =====================================================================
-- Banco próprio do inventário (independente do msf).
-- Executar como superusuário no servidor do inventário, conectado ao banco postgres:
--   psql -h <host-inv> -U postgres -d postgres -v app_pass="'SENHA'" -f sql/02-inventario-db.sql
-- Depois rode as migrations (npm run db:migrate), que criam o schema `inventario`.
-- =====================================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'inv_app') THEN
    CREATE ROLE inv_app LOGIN;
  END IF;
END $$;
ALTER ROLE inv_app WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD :app_pass;

SELECT 'CREATE DATABASE inventario OWNER inv_app ENCODING ''UTF8'' TEMPLATE template0'
WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = 'inventario')\gexec

\connect inventario
REVOKE ALL ON DATABASE inventario FROM PUBLIC;
GRANT CONNECT, TEMP ON DATABASE inventario TO inv_app;
CREATE SCHEMA IF NOT EXISTS inventario AUTHORIZATION inv_app;
ALTER ROLE inv_app IN DATABASE inventario SET search_path = inventario, public;
