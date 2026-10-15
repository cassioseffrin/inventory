-- =====================================================================
-- Usuário SOMENTE LEITURA no banco do Metasploit (msf).
-- Executar como superusuário (postgres) NO SERVIDOR DO MSF, conectado ao banco msf:
--   psql -h <host-msf> -U postgres -d msf -v ro_pass="'SENHA'" -f sql/01-msf-readonly.sql
--
-- IMPORTANTE: `msfdb reinit` apaga e recria o banco msf, e com ele os GRANTs.
-- O role continua existindo (é global ao cluster). Reexecute este script após um reinit.
-- O script é idempotente.
-- =====================================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'inv_msf_ro') THEN
    CREATE ROLE inv_msf_ro LOGIN;
  END IF;
END $$;

ALTER ROLE inv_msf_ro WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT PASSWORD :ro_pass;
-- toda transação deste usuário é read-only por padrão
ALTER ROLE inv_msf_ro SET default_transaction_read_only = on;

GRANT CONNECT ON DATABASE msf TO inv_msf_ro;
GRANT USAGE ON SCHEMA public TO inv_msf_ro;

-- somente as tabelas que o inventário lê
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM inv_msf_ro;
GRANT SELECT ON public.hosts, public.host_details, public.workspaces,
                public.services, public.notes TO inv_msf_ro;
