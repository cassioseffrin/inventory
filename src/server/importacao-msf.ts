import 'server-only';
import { eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/db/inv';
import { gruposItens, itens, itensInterfaces } from '@/db/schema';
import { CAMPOS_SYNC, STATUS, TIPOS, type Tipo } from '@/lib/constants';
import { registrar } from './historico';
import { HttpError } from './http';
import { hostsClassificados } from './hosts-service';
import { listarWorkspaces, portasPorHost, type MsfHost } from './msf-repo';
import { aplicarHostNoItem } from './sync';
import { CIDR_RE, ipNaSubrede, normalizarMac } from './util';

/**
 * Importação em massa msf → inventário.
 * Pensada para o fluxo "escaneia várias faixas no Kali (db_nmap) e empurra para o inventário":
 * pode ser chamada pela tela de hosts ou pelo script do Kali (token de API).
 */
export const importacaoSchema = z.object({
  workspaceId: z.coerce.number().int().optional(),
  workspaceNome: z.string().trim().optional(),
  subredes: z.array(z.string().trim().regex(CIDR_RE, 'CIDR inválido')).optional(),
  hostIds: z.array(z.number().int()).max(5000).optional(),
  /** situações a criar como item novo */
  situacoes: z.array(z.enum(['desconhecido', 'provavel'])).default(['desconhecido']),
  somenteAtivos: z.boolean().default(true),
  /** hosts já inventariados: atualiza IP/hostname/SO + último visto */
  atualizarExistentes: z.boolean().default(true),
  inferirTipo: z.boolean().default(true),
  tipoPadrao: z.enum(TIPOS).default('outro'),
  statusPadrao: z.enum(STATUS).default('em_uso'),
  prefixoPatrimonio: z.string().trim().regex(/^[A-Z0-9-]{1,12}$/i).default('PROV'),
  setor: z.string().trim().max(100).optional(),
  localizacao: z.string().trim().max(150).optional(),
  tag: z.string().trim().max(100).optional(),
  funcionarioId: z.number().int().optional(),
  grupoId: z.number().int().optional(),
  /** dry-run: só calcula o que seria feito */
  simular: z.boolean().default(false),
});
export type ImportacaoOpcoes = z.infer<typeof importacaoSchema>;

/** Heurística simples de tipo a partir do SO e das portas abertas. */
export function inferirTipo(h: Pick<MsfHost, 'os_name' | 'os_family' | 'purpose' | 'info'>, portas: number[]): Tipo | null {
  const os = `${h.os_name ?? ''} ${h.os_family ?? ''} ${h.purpose ?? ''} ${h.info ?? ''}`.toLowerCase();
  const p = new Set(portas);
  const soGeral = /linux|windows|unix|bsd|mac os|macos/.test(os);
  if (/printer|jetdirect|laserjet|ricoh|kyocera|brother|epson|xerox|lexmark/.test(os)) return 'impressora';
  // 9100 em Linux costuma ser o node_exporter do Prometheus, não JetDirect
  if ((p.has(9100) || p.has(515)) && !soGeral) return 'impressora';
  if (/switch|router|ios|junos|routeros|mikrotik|procurve|aruba|fortios|edgeos/.test(os)) return 'switch';
  if (/server/.test(os) || [53, 88, 389, 1433, 1521, 3306, 5432, 25, 110, 143, 2049].some((x) => p.has(x))) return 'servidor';
  if (/windows|mac os|macos/.test(os)) return 'desktop';
  if (/linux|unix|bsd/.test(os) && (p.has(80) || p.has(443) || p.has(22))) return 'servidor';
  return null;
}

type Linha = { hostId: number; ip: string; mac: string | null; hostname: string | null; situacao: string };
export type RelatorioImportacao = {
  simulado: boolean;
  analisados: number;
  criados: (Linha & { itemId?: number; patrimonio?: string; tipo: Tipo })[];
  atualizados: (Linha & { itemId: number; campos: string[] })[];
  ignorados: (Linha & { motivo: string })[];
};

export async function importarHosts(op: ImportacaoOpcoes, usuario: string): Promise<RelatorioImportacao> {
  let workspaceId = op.workspaceId;
  if (!workspaceId && op.workspaceNome) {
    const ws = (await listarWorkspaces()).find((w) => w.name === op.workspaceNome);
    if (!ws) throw new HttpError(404, `Workspace "${op.workspaceNome}" não encontrado no msf`);
    workspaceId = ws.id;
  }

  let hosts = await hostsClassificados({ workspaceId });
  if (op.hostIds?.length) {
    const ids = new Set(op.hostIds);
    hosts = hosts.filter((h) => ids.has(h.id));
  }
  if (op.subredes?.length) hosts = hosts.filter((h) => op.subredes!.some((s) => ipNaSubrede(h.address, s)));

  const portas = op.inferirTipo ? await portasPorHost(hosts.map((h) => h.id)) : new Map<number, number[]>();
  const rel: RelatorioImportacao = { simulado: op.simular, analisados: hosts.length, criados: [], atualizados: [], ignorados: [] };
  /** MAC → item criado neste lote: o mesmo MAC em outro IP vira interface adicional do mesmo item. */
  const macsNoLote = new Map<string, { itemId?: number; patrimonio?: string }>();

  // hosts mais recentes primeiro: se o mesmo MAC aparecer em mais de um workspace, vale o mais novo
  hosts.sort((a, b) => (b.updated_at?.getTime() ?? 0) - (a.updated_at?.getTime() ?? 0));

  for (const h of hosts) {
    const linha: Linha = { hostId: h.id, ip: h.address, mac: h.mac, hostname: h.name, situacao: h.situacao };
    const mac = normalizarMac(h.mac);

    if (h.situacao === 'inventariado') {
      if (!op.atualizarExistentes || !h.itemId) {
        rel.ignorados.push({ ...linha, motivo: `já inventariado (${h.patrimonio})` });
        continue;
      }
      const [item] = await db().select().from(itens).where(eq(itens.id, h.itemId));
      if (!item) continue;
      if (op.simular) {
        rel.atualizados.push({ ...linha, itemId: item.id, campos: [] });
      } else {
        const r = await aplicarHostNoItem(item, h, CAMPOS_SYNC, usuario, 'importacao');
        rel.atualizados.push({ ...linha, itemId: item.id, campos: r.aplicados });
      }
      continue;
    }
    if (h.situacao === 'conhecido' || h.situacao === 'ignorado') {
      rel.ignorados.push({ ...linha, motivo: h.situacao === 'conhecido' ? `dispositivo conhecido (${h.dispositivo?.tipo ?? ''})` : 'marcado como ignorado' });
      continue;
    }
    if (!op.situacoes.includes(h.situacao as 'desconhecido' | 'provavel')) {
      rel.ignorados.push({ ...linha, motivo: h.situacao === 'provavel' ? `provável duplicado de ${h.patrimonio} (só IP)` : 'situação não selecionada' });
      continue;
    }
    if (op.somenteAtivos && h.state && h.state !== 'alive') {
      rel.ignorados.push({ ...linha, motivo: `estado ${h.state}` });
      continue;
    }
    const jaNoLote = mac ? macsNoLote.get(mac) : undefined;
    if (jaNoLote) {
      if (!op.simular && jaNoLote.itemId) {
        await db().insert(itensInterfaces).values({ itemId: jaNoLote.itemId, nome: 'msf (IP adicional)', ip: h.address, mac, origem: 'msf' });
      }
      rel.ignorados.push({ ...linha, motivo: `mesmo MAC de ${jaNoLote.patrimonio ?? 'outro host do lote'}: IP registrado como interface adicional` });
      continue;
    }

    const tipo = (op.inferirTipo ? inferirTipo(h, portas.get(h.id) ?? []) : null) ?? op.tipoPadrao;
    if (op.simular) {
      if (mac) macsNoLote.set(mac, {});
      rel.criados.push({ ...linha, tipo });
      continue;
    }

    const criado = await db().transaction(async (tx) => {
      const seq = await tx.execute<{ n: string }>(sql`SELECT nextval('inventario.patrimonio_provisorio_seq')::text AS n`);
      const patrimonio = `${op.prefixoPatrimonio.toUpperCase()}-${seq.rows[0].n.padStart(6, '0')}`;
      const [novo] = await tx
        .insert(itens)
        .values({
          numeroPatrimonio: patrimonio,
          patrimonioProvisorio: true,
          msfHostId: h.id,
          msfWorkspaceId: h.workspace_id,
          msfWorkspaceNome: h.workspace,
          ip: h.address,
          mac,
          hostname: h.name,
          osName: h.os_name,
          osFlavor: h.os_flavor,
          osSp: h.os_sp,
          osFamily: h.os_family,
          arch: h.arch,
          tipo,
          status: op.statusPadrao,
          setor: op.setor ?? null,
          localizacao: op.localizacao ?? null,
          tag: op.tag ?? null,
          funcionarioId: op.funcionarioId ?? null,
          ultimoVistoMsf: h.updated_at,
          ultimaSincronizacao: new Date(),
        })
        .returning();
      await tx.insert(itensInterfaces).values({ itemId: novo.id, nome: 'msf', ip: h.address, mac, origem: 'msf' });
      if (op.grupoId) await tx.insert(gruposItens).values({ grupoId: op.grupoId, itemId: novo.id }).onConflictDoNothing();
      await registrar(tx, novo, 'importacao', usuario, [
        { campo: 'origem', antigo: null, novo: `importação em massa: msf host #${h.id} (${h.address}) ws ${h.workspace ?? h.workspace_id}` },
      ]);
      return novo;
    });
    if (mac) macsNoLote.set(mac, { itemId: criado.id, patrimonio: criado.numeroPatrimonio });
    rel.criados.push({ ...linha, tipo, itemId: criado.id, patrimonio: criado.numeroPatrimonio });
  }
  return rel;
}
