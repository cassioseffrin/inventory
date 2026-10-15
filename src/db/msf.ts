import 'server-only';
import { Pool, type QueryResultRow } from 'pg';
import { env } from '@/server/env';
import { HttpError } from '@/server/http';

/**
 * Conexão SOMENTE LEITURA com o banco do Metasploit.
 * Três camadas de proteção: o role inv_msf_ro tem só SELECT, o role tem
 * default_transaction_read_only = on e a sessão também é forçada a read-only aqui.
 */
const g = globalThis as unknown as { msfPool?: Pool };

function pool(): Pool {
  if (!g.msfPool) {
    g.msfPool = new Pool({
      connectionString: env().MSF_DATABASE_URL,
      max: 5,
      application_name: 'arpa-inventario-ro',
      options: '-c default_transaction_read_only=on -c statement_timeout=15000',
    });
  }
  return g.msfPool;
}

/** Dicas para as falhas mais comuns de acesso ao banco do msf. */
const DICAS: Record<string, string> = {
  '28000': 'o pg_hba.conf do Kali não libera este usuário/IP — adicione "host msf inv_msf_ro <rede>/24 scram-sha-256" e rode systemctl reload postgresql',
  '28P01': 'senha do usuário read-only incorreta (MSF_DATABASE_URL)',
  '3D000': 'o banco msf não existe (msfdb reinit em andamento?)',
  '42501': 'sem permissão de leitura — após msfdb reinit, reexecute sql/01-msf-readonly.sql',
  '42P01': 'tabelas do msf ausentes — rode msfdb init no Kali',
  ECONNREFUSED: 'o Postgres do Kali recusou a conexão (serviço parado ou listen_addresses)',
  ETIMEDOUT: 'tempo esgotado ao conectar no Kali (rede/firewall)',
  EHOSTUNREACH: 'host do msf inalcançável',
  ENOTFOUND: 'host do msf não encontrado (MSF_DATABASE_URL)',
};

export async function msfQuery<T extends QueryResultRow>(text: string, params: unknown[] = []): Promise<T[]> {
  try {
    const { rows } = await pool().query<T>(text, params);
    return rows;
  } catch (e) {
    const err = e as { code?: string; message?: string };
    const dica = err.code ? DICAS[err.code] : undefined;
    if (dica) {
      console.error('[msf] falha de acesso:', err.code, err.message);
      throw new HttpError(503, `Banco do msf inacessível: ${dica}`, { codigo: err.code, mensagem: err.message });
    }
    throw e;
  }
}
