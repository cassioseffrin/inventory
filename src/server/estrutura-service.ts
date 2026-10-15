import 'server-only';
import { sql } from 'drizzle-orm';
import { db } from '@/db/inv';
import { hostsComPortas, type HostComPortas, type PortaServico } from './msf-repo';
import { ipSemMascara, normalizarMac } from './util';

/**
 * Mapa de estrutura de servidores: lê os hosts do msf (somente leitura),
 * cruza dinamicamente com o inventário próprio (inventario.itens e interfaces)
 * e classifica por função a partir das portas abertas.
 */

export const CATEGORIAS_SERVIDOR = ['ad', 'banco', 'web'] as const;
export type CategoriaServidor = (typeof CATEGORIAS_SERVIDOR)[number];

export const CATEGORIA_SERVIDOR_LABEL: Record<CategoriaServidor, string> = {
  ad: 'Active Directory & Controladores',
  banco: 'Bancos de dados (PostgreSQL, MSSQL, MySQL)',
  web: 'Servidores Web & Aplicações',
};

// Portas que definem cada função. A ordem de avaliação importa: AD vence banco, banco vence web.
const PORTAS_AD = new Set([88, 389, 636, 3268, 3269]); // kerberos-sec / ldap(s) / global catalog
const PORTAS_BANCO = new Set([1433, 1521, 3306, 5432, 27017]); // mssql / oracle / mysql / postgres / mongo

const NOMES_BANCO = /ms-sql|mssql|mysql|postgres|oracle|mongo/i;
const NOMES_AD = /kerberos|ldap/i;

function classificar(portas: PortaServico[]): CategoriaServidor {
  const casa = (set: Set<number>, re: RegExp) =>
    portas.some((p) => set.has(p.port) || (p.name ? re.test(p.name) : false));
  if (casa(PORTAS_AD, NOMES_AD)) return 'ad';
  if (casa(PORTAS_BANCO, NOMES_BANCO)) return 'banco';
  return 'web';
}

export type InfoInventario = {
  itemId: number;
  numeroPatrimonio: string;
  patrimonioProvisorio: boolean;
  tipo: string;
  status: string;
  setor: string | null;
  localizacao: string | null;
  responsavel: string | null;
  modelo: string | null;
  fabricante: string | null;
};

export type Servidor = {
  id: number;
  address: string;
  mac: string | null;
  name: string | null;
  os: string | null;
  workspace: string | null;
  state: string | null;
  updatedAt: Date | null;
  categoria: CategoriaServidor;
  portas: PortaServico[];
  inventario: InfoInventario | null;
};

export type GrupoEstrutura = {
  categoria: CategoriaServidor;
  label: string;
  servidores: Servidor[];
};

export type ResumoInventario = {
  total: number;
  inventariados: number;
  shadowIt: number;
};

export type Estrutura = {
  grupos: GrupoEstrutura[];
  total: number;
  geradoEm: string;
  resumoInventario: ResumoInventario;
};

type ItemInventarioDb = {
  id: number;
  numero_patrimonio: string;
  patrimonio_provisorio: boolean;
  mac: string | null;
  ip: string | null;
  hostname: string | null;
  tipo: string;
  status: string;
  setor: string | null;
  localizacao: string | null;
  modelo: string | null;
  fabricante: string | null;
  responsavel: string | null;
};

type InterfaceDb = {
  item_id: number;
  mac: string | null;
  ip: string | null;
};

/** Monta o mapa de servidores cruzando em tempo real os hosts do MSF com o Inventário de TI. */
export async function montarEstrutura(workspaceId?: number): Promise<Estrutura> {
  const [hosts, itensRes, ifacesRes] = await Promise.all([
    hostsComPortas(workspaceId),
    db().execute<ItemInventarioDb>(sql`
      SELECT i.id, i.numero_patrimonio, i.patrimonio_provisorio,
             lower(i.mac) AS mac, host(i.ip) AS ip, i.hostname,
             i.tipo, i.status, i.setor, i.localizacao, i.modelo, i.fabricante,
             f.nome AS responsavel
      FROM inventario.itens i
      LEFT JOIN inventario.funcionarios f ON f.id = i.funcionario_id
    `),
    db().execute<InterfaceDb>(sql`
      SELECT item_id, lower(mac) AS mac, host(ip) AS ip
      FROM inventario.itens_interfaces
    `),
  ]);

  const porMac = new Map<string, ItemInventarioDb>();
  const porIp = new Map<string, ItemInventarioDb>();

  for (const it of itensRes.rows) {
    const mac = normalizarMac(it.mac);
    const ip = ipSemMascara(it.ip);
    if (mac && !porMac.has(mac)) porMac.set(mac, it);
    if (ip && !porIp.has(ip)) porIp.set(ip, it);
  }

  const itensMap = new Map<number, ItemInventarioDb>(itensRes.rows.map((x) => [x.id, x]));
  for (const iface of ifacesRes.rows) {
    const it = itensMap.get(iface.item_id);
    if (!it) continue;
    const mac = normalizarMac(iface.mac);
    const ip = ipSemMascara(iface.ip);
    if (mac && !porMac.has(mac)) porMac.set(mac, it);
    if (ip && !porIp.has(ip)) porIp.set(ip, it);
  }

  let totalInventariados = 0;

  const servidores: Servidor[] = hosts.map((h) => {
    const portas = Array.isArray(h.portas) ? h.portas : [];
    const mac = normalizarMac(h.mac);
    const ip = ipSemMascara(h.address);

    const match = (mac ? porMac.get(mac) : null) || (ip ? porIp.get(ip) : null);
    if (match) totalInventariados++;

    const inventario: InfoInventario | null = match
      ? {
          itemId: match.id,
          numeroPatrimonio: match.numero_patrimonio,
          patrimonioProvisorio: match.patrimonio_provisorio,
          tipo: match.tipo,
          status: match.status,
          setor: match.setor,
          localizacao: match.localizacao,
          responsavel: match.responsavel,
          modelo: match.modelo,
          fabricante: match.fabricante,
        }
      : null;

    return {
      id: h.id,
      address: h.address,
      mac: h.mac,
      name: h.name,
      os: [h.os_name, h.os_flavor].filter(Boolean).join(' ') || null,
      workspace: h.workspace,
      state: h.state,
      updatedAt: h.updated_at,
      categoria: classificar(portas),
      portas,
      inventario,
    };
  });

  const grupos: GrupoEstrutura[] = CATEGORIAS_SERVIDOR.map((categoria) => ({
    categoria,
    label: CATEGORIA_SERVIDOR_LABEL[categoria],
    servidores: servidores.filter((s) => s.categoria === categoria),
  })).filter((g) => g.servidores.length > 0);

  return {
    grupos,
    total: servidores.length,
    geradoEm: new Date().toISOString(),
    resumoInventario: {
      total: servidores.length,
      inventariados: totalInventariados,
      shadowIt: servidores.length - totalInventariados,
    },
  };
}
