import 'server-only';
import { hostsComPortas, type HostComPortas, type PortaServico } from './msf-repo';

/**
 * Mapa de estrutura de servidores: lê os hosts do msf (somente leitura) e os
 * classifica por função a partir das portas abertas, como no diagrama de rede.
 * A categoria é inferida a cada atualização — nada é persistido aqui.
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

export type Servidor = {
  id: number;
  address: string;
  name: string | null;
  os: string | null;
  workspace: string | null;
  state: string | null;
  updatedAt: Date | null;
  categoria: CategoriaServidor;
  portas: PortaServico[];
};

export type GrupoEstrutura = {
  categoria: CategoriaServidor;
  label: string;
  servidores: Servidor[];
};

export type Estrutura = {
  grupos: GrupoEstrutura[];
  total: number;
  geradoEm: string;
};

function paraServidor(h: HostComPortas): Servidor {
  const portas = Array.isArray(h.portas) ? h.portas : [];
  return {
    id: h.id,
    address: h.address,
    name: h.name,
    os: [h.os_name, h.os_flavor].filter(Boolean).join(' ') || null,
    workspace: h.workspace,
    state: h.state,
    updatedAt: h.updated_at,
    categoria: classificar(portas),
    portas,
  };
}

/** Monta o mapa agrupado lendo o estado atual do msf. */
export async function montarEstrutura(workspaceId?: number): Promise<Estrutura> {
  const hosts = await hostsComPortas(workspaceId);
  const servidores = hosts.map(paraServidor);

  const grupos: GrupoEstrutura[] = CATEGORIAS_SERVIDOR.map((categoria) => ({
    categoria,
    label: CATEGORIA_SERVIDOR_LABEL[categoria],
    servidores: servidores.filter((s) => s.categoria === categoria),
  })).filter((g) => g.servidores.length > 0);

  return { grupos, total: servidores.length, geradoEm: new Date().toISOString() };
}
