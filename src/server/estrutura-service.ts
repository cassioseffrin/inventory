import 'server-only';
import { sql } from 'drizzle-orm';
import { db } from '@/db/inv';
import { hostsComPortas, type HostComPortas, type PortaServico } from './msf-repo';
import { ipSemMascara, normalizarMac } from './util';

/**
 * Mapa de estrutura de servidores e infraestrutura:
 * Lê os hosts do msf e cruza com a tabela de inventário de TI (inventario.itens e interfaces),
 * permitindo agrupar tanto por funções de rede (portas abertas) quanto por dados reais
 * do inventário (tipo de equipamento, setor, localização física e patrimônio).
 */

export const CATEGORIAS_SERVIDOR = ['ad', 'banco', 'web'] as const;
export type CategoriaServidor = (typeof CATEGORIAS_SERVIDOR)[number];

export const CATEGORIA_SERVIDOR_LABEL: Record<CategoriaServidor, string> = {
  ad: 'Active Directory & Controladores',
  banco: 'Bancos de dados (PostgreSQL, MSSQL, MySQL)',
  web: 'Servidores Web & Aplicações',
};

const PORTAS_AD = new Set([88, 389, 636, 3268, 3269]);
const PORTAS_BANCO = new Set([1433, 1521, 3306, 5432, 27017]);

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
  origem: 'msf' | 'inventario';
  inventario: InfoInventario | null;
};

export type GrupoEstrutura = {
  categoria: CategoriaServidor;
  label: string;
  servidores: Servidor[];
};

export type GrupoPersonalizado = {
  chave: string;
  label: string;
  icone: string;
  cor: string;
  servidores: Servidor[];
};

export type ResumoInventario = {
  total: number;
  inventariados: number;
  shadowIt: number;
  totalApenasInventario: number;
};

export type Estrutura = {
  grupos: GrupoEstrutura[];
  gruposTipo: GrupoPersonalizado[];
  gruposSetor: GrupoPersonalizado[];
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
  os_name: string | null;
  os_flavor: string | null;
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

const ICONES_TIPO: Record<string, { icone: string; cor: string; label: string }> = {
  servidor: { icone: '🖥️', cor: 'blue', label: 'Servidores' },
  desktop: { icone: '💻', cor: 'indigo', label: 'Estações de Trabalho (Desktops)' },
  notebook: { icone: '💻', cor: 'teal', label: 'Notebooks' },
  impressora: { icone: '🖨️', cor: 'cyan', label: 'Impressoras de Rede' },
  switch: { icone: '🔀', cor: 'violet', label: 'Switches e Roteadores' },
  smart_pos: { icone: '💳', cor: 'orange', label: 'Smart POS' },
  outro: { icone: '📱', cor: 'gray', label: 'Outros Equipamentos' },
};

/** Monta o mapa de servidores cruzando em tempo real os hosts do MSF com o Inventário de TI. */
export async function montarEstrutura(
  workspaceId?: number,
  escopo: 'apenas_msf' | 'todos_inventario' = 'todos_inventario'
): Promise<Estrutura> {
  const [hosts, itensRes, ifacesRes] = await Promise.all([
    hostsComPortas(workspaceId),
    db().execute<ItemInventarioDb>(sql`
      SELECT i.id, i.numero_patrimonio, i.patrimonio_provisorio,
             lower(i.mac) AS mac, host(i.ip) AS ip, i.hostname,
             i.os_name, i.os_flavor,
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
  // Primeiro IP/MAC de interface por item, usado quando o item não tem endereço próprio
  const ipIface = new Map<number, string>();
  const macIface = new Map<number, string>();
  for (const iface of ifacesRes.rows) {
    const it = itensMap.get(iface.item_id);
    if (!it) continue;
    const mac = normalizarMac(iface.mac);
    const ip = ipSemMascara(iface.ip);
    if (ip && !ipIface.has(it.id)) ipIface.set(it.id, ip);
    if (mac && !macIface.has(it.id)) macIface.set(it.id, mac);
    if (mac && !porMac.has(mac)) porMac.set(mac, it);
    if (ip && !porIp.has(ip)) porIp.set(ip, it);
  }

  const matchedItemIds = new Set<number>();
  let totalInventariados = 0;

  // 1. Processa os hosts descobertos no Metasploit
  const servidores: Servidor[] = hosts.map((h) => {
    const portas = Array.isArray(h.portas) ? h.portas : [];
    const mac = normalizarMac(h.mac);
    const ip = ipSemMascara(h.address);

    const match = (mac ? porMac.get(mac) : null) || (ip ? porIp.get(ip) : null);
    if (match) {
      totalInventariados++;
      matchedItemIds.add(match.id);
    }

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
      name: h.name || (match ? match.hostname : null),
      os: [h.os_name, h.os_flavor].filter(Boolean).join(' ') || (match ? [match.os_name, match.os_flavor].filter(Boolean).join(' ') : null),
      workspace: h.workspace,
      state: h.state,
      updatedAt: h.updated_at,
      categoria: classificar(portas),
      portas,
      origem: 'msf' as const,
      inventario,
    };
  });

  let totalApenasInventario = 0;

  // 2. Se o escopo permitir, inclui também os itens do inventário que não foram escaneados pelo MSF
  if (escopo === 'todos_inventario') {
    for (const it of itensRes.rows) {
      if (!matchedItemIds.has(it.id)) {
        // Itens sem endereço de rede (mouses, monitores, mobiliário...) não entram nos mapas
        const ip = ipSemMascara(it.ip) || ipIface.get(it.id);
        if (!ip) continue;
        totalApenasInventario++;
        totalInventariados++;

        servidores.push({
          id: 100000 + it.id,
          address: ip,
          mac: it.mac || macIface.get(it.id) || null,
          name: it.hostname,
          os: [it.os_name, it.os_flavor].filter(Boolean).join(' ') || null,
          workspace: null,
          state: 'alive',
          updatedAt: null,
          categoria: 'web', // categoria padrão para layout
          portas: [],
          origem: 'inventario' as const,
          inventario: {
            itemId: it.id,
            numeroPatrimonio: it.numero_patrimonio,
            patrimonioProvisorio: it.patrimonio_provisorio,
            tipo: it.tipo,
            status: it.status,
            setor: it.setor,
            localizacao: it.localizacao,
            responsavel: it.responsavel,
            modelo: it.modelo,
            fabricante: it.fabricante,
          },
        });
      }
    }
  }

  // Grupos por função de portas (AD / Banco / Web)
  const grupos: GrupoEstrutura[] = CATEGORIAS_SERVIDOR.map((categoria) => ({
    categoria,
    label: CATEGORIA_SERVIDOR_LABEL[categoria],
    servidores: servidores.filter((s) => s.categoria === categoria),
  })).filter((g) => g.servidores.length > 0);

  // Grupos por Tipo de Equipamento do Inventário
  const mapaTipos = new Map<string, Servidor[]>();
  for (const s of servidores) {
    const t = s.inventario?.tipo ?? 'outro';
    if (!mapaTipos.has(t)) mapaTipos.set(t, []);
    mapaTipos.get(t)!.push(s);
  }

  const gruposTipo: GrupoPersonalizado[] = Array.from(mapaTipos.entries())
    .map(([tipo, srvs]) => {
      const cfg = ICONES_TIPO[tipo] ?? { icone: '📱', cor: 'gray', label: tipo };
      return {
        chave: tipo,
        label: cfg.label,
        icone: cfg.icone,
        cor: cfg.cor,
        servidores: srvs,
      };
    })
    .sort((a, b) => b.servidores.length - a.servidores.length);

  // Grupos por Setor do Inventário
  const mapaSetores = new Map<string, Servidor[]>();
  for (const s of servidores) {
    const st = s.inventario?.setor?.trim() || 'Geral / Sem Setor';
    if (!mapaSetores.has(st)) mapaSetores.set(st, []);
    mapaSetores.get(st)!.push(s);
  }

  const gruposSetor: GrupoPersonalizado[] = Array.from(mapaSetores.entries())
    .map(([setor, srvs]) => ({
      chave: setor,
      label: setor,
      icone: '📍',
      cor: 'teal',
      servidores: srvs,
    }))
    .sort((a, b) => b.servidores.length - a.servidores.length);

  return {
    grupos,
    gruposTipo,
    gruposSetor,
    total: servidores.length,
    geradoEm: new Date().toISOString(),
    resumoInventario: {
      total: servidores.length,
      inventariados: totalInventariados,
      shadowIt: servidores.filter((s) => !s.inventario).length,
      totalApenasInventario,
    },
  };
}
