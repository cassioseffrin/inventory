import 'server-only';
import { msfQuery } from '@/db/msf';

/**
 * Acesso SOMENTE LEITURA às tabelas do Metasploit.
 * Toda consulta é parametrizada; nomes de coluna para ordenação vêm de whitelist.
 */

export type MsfHost = {
  id: number;
  address: string;
  mac: string | null;
  name: string | null;
  state: string | null;
  os_name: string | null;
  os_flavor: string | null;
  os_sp: string | null;
  os_family: string | null;
  arch: string | null;
  purpose: string | null;
  info: string | null;
  comments: string | null;
  workspace_id: number;
  workspace: string | null;
  servicos: number;
  vulns: number;
  notas: number;
  created_at: Date | null;
  updated_at: Date | null;
};

const COLS = `
  h.id, host(h.address) AS address, lower(h.mac) AS mac, h.name, h.state,
  h.os_name, h.os_flavor, h.os_sp, h.os_family, COALESCE(h.arch, h.detected_arch) AS arch,
  h.purpose, h.info, h.comments, h.workspace_id, w.name AS workspace,
  (SELECT count(*)::int FROM services s WHERE s.host_id = h.id) AS servicos,
  COALESCE(h.vuln_count, 0)::int AS vulns,
  (SELECT count(*)::int FROM notes n WHERE n.host_id = h.id) AS notas,
  h.created_at AT TIME ZONE 'UTC' AS created_at, h.updated_at AT TIME ZONE 'UTC' AS updated_at`;

export const ORDENACAO_HOSTS: Record<string, string> = {
  address: 'h.address',
  mac: 'h.mac',
  name: 'h.name',
  os_name: 'h.os_name',
  state: 'h.state',
  workspace: 'w.name',
  updated_at: 'h.updated_at',
  created_at: 'h.created_at',
};

export async function listarWorkspaces() {
  return msfQuery<{ id: number; name: string; hosts: number }>(
    `SELECT w.id, w.name, (SELECT count(*)::int FROM hosts h WHERE h.workspace_id = w.id) AS hosts
     FROM workspaces w ORDER BY w.name`,
  );
}

/** Lista hosts filtrados e ordenados (sem paginar — a classificação contra o inventário é feita depois). */
export async function listarHosts(f: { workspaceId?: number; q?: string; sort?: string; dir?: 'asc' | 'desc' }) {
  const where: string[] = [];
  const params: unknown[] = [];
  if (f.workspaceId) {
    params.push(f.workspaceId);
    where.push(`h.workspace_id = $${params.length}`);
  }
  if (f.q) {
    params.push(`%${f.q.replace(/[\\%_]/g, (c) => '\\' + c)}%`);
    const p = `$${params.length}`;
    where.push(
      `(host(h.address) ILIKE ${p} OR h.mac ILIKE ${p} OR h.name ILIKE ${p} OR h.os_name ILIKE ${p} OR h.os_flavor ILIKE ${p})`,
    );
  }
  const col = ORDENACAO_HOSTS[f.sort ?? 'address'] ?? 'h.address';
  const dir = f.dir === 'desc' ? 'DESC' : 'ASC';
  return msfQuery<MsfHost>(
    `SELECT ${COLS} FROM hosts h LEFT JOIN workspaces w ON w.id = h.workspace_id
     ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
     ORDER BY ${col} ${dir} NULLS LAST, h.id`,
    params,
  );
}

export async function obterHost(id: number): Promise<MsfHost | null> {
  const r = await msfQuery<MsfHost>(
    `SELECT ${COLS} FROM hosts h LEFT JOIN workspaces w ON w.id = h.workspace_id WHERE h.id = $1`,
    [id],
  );
  return r[0] ?? null;
}

export async function obterHosts(ids: number[]): Promise<MsfHost[]> {
  if (!ids.length) return [];
  return msfQuery<MsfHost>(
    `SELECT ${COLS} FROM hosts h LEFT JOIN workspaces w ON w.id = h.workspace_id WHERE h.id = ANY($1::int[])`,
    [ids],
  );
}

/** Hosts candidatos por MAC ou IP (usado na sincronização e no "último visto"). */
export async function hostsPorMacOuIp(macs: string[], ips: string[]): Promise<MsfHost[]> {
  if (!macs.length && !ips.length) return [];
  return msfQuery<MsfHost>(
    `SELECT ${COLS} FROM hosts h LEFT JOIN workspaces w ON w.id = h.workspace_id
     WHERE lower(h.mac) = ANY($1::text[]) OR host(h.address) = ANY($2::text[])
     ORDER BY h.updated_at DESC NULLS LAST`,
    [macs, ips],
  );
}

export type PortaServico = { port: number; proto: string; name: string | null };

export type HostComPortas = {
  id: number;
  address: string;
  mac: string | null;
  name: string | null;
  os_name: string | null;
  os_flavor: string | null;
  workspace: string | null;
  state: string | null;
  updated_at: Date | null;
  portas: PortaServico[];
};

/**
 * Hosts que expõem ao menos um serviço (servidores) com a lista de portas abertas.
 * Base do mapa de estrutura: a leitura é feita direto do msf a cada atualização.
 */
export async function hostsComPortas(workspaceId?: number): Promise<HostComPortas[]> {
  const params: unknown[] = [];
  let filtro = '';
  if (workspaceId) {
    params.push(workspaceId);
    filtro = `AND h.workspace_id = $${params.length}`;
  }
  return msfQuery<HostComPortas>(
    `SELECT h.id, host(h.address) AS address, lower(h.mac) AS mac, h.name, h.os_name, h.os_flavor,
            w.name AS workspace, h.state, h.updated_at AT TIME ZONE 'UTC' AS updated_at,
            COALESCE(
              (SELECT json_agg(json_build_object('port', s.port, 'proto', s.proto, 'name', s.name) ORDER BY s.port, s.proto)
               FROM services s
               WHERE s.host_id = h.id AND (s.state IS NULL OR s.state = 'open')),
              '[]'::json
            ) AS portas
     FROM hosts h
     LEFT JOIN workspaces w ON w.id = h.workspace_id
     WHERE EXISTS (SELECT 1 FROM services s WHERE s.host_id = h.id AND (s.state IS NULL OR s.state = 'open'))
       ${filtro}
     ORDER BY h.address`,
    params,
  );
}

/** Portas abertas por host (para inferir o tipo de equipamento na importação em massa). */
export async function portasPorHost(ids: number[]): Promise<Map<number, number[]>> {
  const m = new Map<number, number[]>();
  if (!ids.length) return m;
  const r = await msfQuery<{ host_id: number; portas: number[] }>(
    `SELECT host_id, array_agg(DISTINCT port) AS portas FROM services
     WHERE host_id = ANY($1::int[]) AND (state IS NULL OR state = 'open') GROUP BY host_id`,
    [ids],
  );
  r.forEach((x) => m.set(x.host_id, x.portas));
  return m;
}

export async function servicosDoHost(hostId: number) {
  return msfQuery<{
    id: number;
    port: number;
    proto: string;
    state: string | null;
    name: string | null;
    info: string | null;
    updated_at: Date | null;
  }>(`SELECT id, port, proto, state, name, info, updated_at AT TIME ZONE 'UTC' AS updated_at FROM services WHERE host_id = $1 ORDER BY port, proto`, [
    hostId,
  ]);
}

export async function detalhesDoHost(hostId: number) {
  return msfQuery<Record<string, unknown>>(
    `SELECT id, src, nx_console_id, nx_device_id, nx_site_name, nx_site_importance, nx_scan_template, nx_risk_score
     FROM host_details WHERE host_id = $1 ORDER BY id`,
    [hostId],
  );
}

export async function notasDoHost(hostId: number, limite = 100) {
  return msfQuery<{ id: number; ntype: string | null; data: string | null; critical: boolean | null; created_at: Date | null }>(
    `SELECT id, ntype, left(data, 2000) AS data, critical, created_at AT TIME ZONE 'UTC' AS created_at FROM notes
     WHERE host_id = $1 ORDER BY created_at DESC NULLS LAST LIMIT $2`,
    [hostId, limite],
  );
}
