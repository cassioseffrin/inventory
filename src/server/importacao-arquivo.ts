import 'server-only';
import { and, eq } from 'drizzle-orm';
import { XMLParser } from 'fast-xml-parser';
import Papa from 'papaparse';
import { db } from '@/db/inv';
import { itens, itensDiscos, itensHardware, itensInterfaces, itensSoftwares } from '@/db/schema';
import { reclassificarSoftwares } from './dicionario-service';
import { registrar } from './historico';
import { HttpError, naoEncontrado } from './http';
import { normalizarMac } from './util';

/**
 * Importa inventário de software/hardware de um item a partir de arquivo:
 *  - JSON gerado pelos scripts de coleta (scripts/coleta) — { softwares, hardware, discos, interfaces } ou um array de softwares;
 *  - CSV de softwares (colunas nome/name/DisplayName, versao/version/DisplayVersion, editor/publisher/Publisher);
 *  - XML do agente OCS Inventory NG ou GLPI Agent (`glpi-inventory --local` / `ocsinventory-agent --local`).
 */

export type Coleta = {
  softwares: { nome: string; versao?: string | null; editor?: string | null; dataInstalacao?: string | null }[];
  hardware?: Partial<{ cpu: string; cpuNucleos: number; ramMb: number; placaMae: string; biosFabricante: string; biosVersao: string; biosData: string }>;
  item?: Partial<{ fabricante: string; modelo: string; numeroSerie: string; hostname: string; osName: string }>;
  discos?: { nome?: string; tipo?: string; tamanhoGb?: number | null; fabricante?: string; modelo?: string; numeroSerie?: string }[];
  interfaces?: { nome?: string; ip?: string | null; mascara?: string | null; mac?: string | null; gateway?: string | null }[];
};

const s = (v: unknown) => {
  if (v === null || v === undefined) return null;
  const t = String(typeof v === 'object' && v && '#text' in v ? (v as Record<string, unknown>)['#text'] : v).trim();
  return t === '' ? null : t.slice(0, 250);
};
const n = (v: unknown) => {
  const x = Number(String(v ?? '').replace(',', '.'));
  return Number.isFinite(x) && x > 0 ? x : null;
};
const arr = <T,>(v: T | T[] | undefined): T[] => (v === undefined || v === null ? [] : Array.isArray(v) ? v : [v]);
const pick = (o: Record<string, unknown>, ...keys: string[]) => {
  for (const k of keys) {
    const hit = Object.keys(o).find((x) => x.toLowerCase() === k.toLowerCase());
    if (hit && o[hit] !== undefined && o[hit] !== '') return o[hit];
  }
  return undefined;
};
const ipValido = (v: string | null) => (v && /^(\d{1,3}\.){3}\d{1,3}$/.test(v) ? v : null);

function softwareDeObjeto(o: Record<string, unknown>) {
  const nome = s(pick(o, 'nome', 'name', 'DisplayName', 'Package', 'NAME'));
  if (!nome) return null;
  return {
    nome,
    versao: s(pick(o, 'versao', 'version', 'DisplayVersion', 'VERSION')),
    editor: s(pick(o, 'editor', 'publisher', 'Publisher', 'vendor', 'Maintainer', 'PUBLISHER')),
    dataInstalacao: s(pick(o, 'dataInstalacao', 'data_instalacao', 'InstallDate', 'install_date', 'INSTALLDATE')),
  };
}

function parseJson(txt: string): Coleta {
  let j: unknown;
  try {
    j = JSON.parse(txt.replace(/^﻿/, ''));
  } catch {
    throw new HttpError(400, 'JSON inválido');
  }
  if (Array.isArray(j)) return { softwares: j.map((x) => softwareDeObjeto(x as Record<string, unknown>)).filter((x): x is NonNullable<typeof x> => !!x) };
  const o = j as Record<string, unknown>;
  const hw = (o.hardware ?? {}) as Record<string, unknown>;
  return {
    softwares: arr(o.softwares as Record<string, unknown>[]).map(softwareDeObjeto).filter((x): x is NonNullable<typeof x> => !!x),
    hardware: {
      cpu: s(hw.cpu) ?? undefined,
      cpuNucleos: n(hw.cpuNucleos ?? hw.cpu_nucleos) ?? undefined,
      ramMb: n(hw.ramMb ?? hw.ram_mb) ?? undefined,
      placaMae: s(hw.placaMae ?? hw.placa_mae) ?? undefined,
      biosFabricante: s(hw.biosFabricante ?? hw.bios_fabricante) ?? undefined,
      biosVersao: s(hw.biosVersao ?? hw.bios_versao) ?? undefined,
      biosData: s(hw.biosData ?? hw.bios_data) ?? undefined,
    },
    item: {
      fabricante: s(hw.fabricante ?? o.fabricante) ?? undefined,
      modelo: s(hw.modelo ?? o.modelo) ?? undefined,
      numeroSerie: s(hw.numeroSerie ?? hw.numero_serie ?? o.numeroSerie) ?? undefined,
      hostname: s(o.hostname) ?? undefined,
      osName: s(o.osName ?? o.os) ?? undefined,
    },
    discos: arr(o.discos as Record<string, unknown>[]).map((d) => ({
      nome: s(d.nome) ?? undefined,
      tipo: s(d.tipo) ?? undefined,
      tamanhoGb: n(d.tamanhoGb ?? d.tamanho_gb),
      fabricante: s(d.fabricante) ?? undefined,
      modelo: s(d.modelo) ?? undefined,
      numeroSerie: s(d.numeroSerie ?? d.numero_serie) ?? undefined,
    })),
    interfaces: arr(o.interfaces as Record<string, unknown>[]).map((i) => ({
      nome: s(i.nome) ?? undefined,
      ip: ipValido(s(i.ip)),
      mascara: s(i.mascara),
      mac: normalizarMac(s(i.mac)),
      gateway: ipValido(s(i.gateway)),
    })),
  };
}

function parseCsv(txt: string): Coleta {
  const r = Papa.parse<Record<string, string>>(txt.replace(/^﻿/, ''), { header: true, skipEmptyLines: true, delimiter: '' });
  if (!r.data.length) throw new HttpError(400, 'CSV vazio ou sem cabeçalho');
  return { softwares: r.data.map(softwareDeObjeto).filter((x): x is NonNullable<typeof x> => !!x) };
}

/** XML do OCS Inventory NG / GLPI Agent: <REQUEST><CONTENT>...</CONTENT></REQUEST> */
function parseXml(txt: string): Coleta {
  const xml = new XMLParser({ ignoreAttributes: true, parseTagValue: false, trimValues: true, processEntities: false, htmlEntities: false }).parse(txt);
  const c = xml?.REQUEST?.CONTENT;
  if (!c) throw new HttpError(400, 'XML não reconhecido (esperado REQUEST/CONTENT do OCS/GLPI Agent)');
  const bios = (c.BIOS ?? {}) as Record<string, unknown>;
  const hw = (c.HARDWARE ?? {}) as Record<string, unknown>;
  const cpus = arr(c.CPUS as Record<string, unknown>[]);
  const ramMb = n(hw.MEMORY) ?? (arr(c.MEMORIES as Record<string, unknown>[]).reduce((t, m) => t + (n(m.CAPACITY) ?? 0), 0) || null);
  return {
    softwares: arr(c.SOFTWARES as Record<string, unknown>[]).map(softwareDeObjeto).filter((x): x is NonNullable<typeof x> => !!x),
    hardware: {
      cpu: s(cpus[0]?.NAME ?? hw.PROCESSORT) ?? undefined,
      cpuNucleos: n(cpus.reduce((t, x) => t + (n(x.CORE ?? x.CORES) ?? 0), 0)) ?? n(hw.PROCESSORN) ?? undefined,
      ramMb: ramMb ?? undefined,
      placaMae: s(bios.MMODEL) ?? undefined,
      biosFabricante: s(bios.BMANUFACTURER) ?? undefined,
      biosVersao: s(bios.BVERSION) ?? undefined,
      biosData: s(bios.BDATE) ?? undefined,
    },
    item: {
      fabricante: s(bios.SMANUFACTURER) ?? undefined,
      modelo: s(bios.SMODEL) ?? undefined,
      numeroSerie: s(bios.SSN) ?? undefined,
      hostname: s(hw.NAME) ?? undefined,
      osName: s(hw.OSNAME ?? c.OPERATINGSYSTEM?.FULL_NAME) ?? undefined,
    },
    discos: arr(c.STORAGES as Record<string, unknown>[]).map((d) => ({
      nome: s(d.NAME) ?? undefined,
      tipo: s(d.TYPE) ?? undefined,
      tamanhoGb: n(d.DISKSIZE) ? Math.round((n(d.DISKSIZE)! / 1024) * 100) / 100 : null,
      fabricante: s(d.MANUFACTURER) ?? undefined,
      modelo: s(d.MODEL) ?? undefined,
      numeroSerie: s(d.SERIALNUMBER ?? d.SERIAL) ?? undefined,
    })),
    interfaces: arr(c.NETWORKS as Record<string, unknown>[])
      .filter((i) => s(i.MACADDR) || s(i.IPADDRESS))
      .map((i) => ({
        nome: s(i.DESCRIPTION) ?? undefined,
        ip: ipValido(s(i.IPADDRESS)),
        mascara: s(i.IPMASK),
        mac: normalizarMac(s(i.MACADDR)),
        gateway: ipValido(s(i.IPGATEWAY)),
      })),
  };
}

export function interpretarArquivo(nome: string, conteudo: string): Coleta {
  const ext = nome.toLowerCase().split('.').pop();
  const t = conteudo.trimStart().replace(/^﻿/, '');
  if (ext === 'xml' || ext === 'ocs' || t.startsWith('<')) return parseXml(conteudo);
  if (ext === 'json' || t.startsWith('{') || t.startsWith('[')) return parseJson(conteudo);
  if (ext === 'csv' || ext === 'txt') return parseCsv(conteudo);
  throw new HttpError(400, 'Formato não suportado (use .json, .csv ou .xml)');
}

/** Aplica a coleta ao item: substitui softwares/discos importados, atualiza hardware e interfaces importadas. */
export async function aplicarColeta(itemId: number, c: Coleta, usuario: string, opts: { atualizarItem: boolean }) {
  const [item] = await db().select().from(itens).where(eq(itens.id, itemId));
  if (!item) throw naoEncontrado('Item');

  const res = await db().transaction(async (tx) => {
    // softwares: substitui os que vieram de importação anterior; mantém os manuais
    await tx.delete(itensSoftwares).where(and(eq(itensSoftwares.itemId, itemId), eq(itensSoftwares.origem, 'importacao')));
    const vistos = new Set<string>();
    const sw = c.softwares.filter((x) => {
      const k = `${x.nome.toLowerCase()}|${x.versao ?? ''}`;
      if (vistos.has(k)) return false;
      vistos.add(k);
      return true;
    });
    for (let i = 0; i < sw.length; i += 500) {
      await tx.insert(itensSoftwares).values(sw.slice(i, i + 500).map((x) => ({ ...x, itemId, origem: 'importacao' as const })));
    }

    const hw = Object.fromEntries(Object.entries(c.hardware ?? {}).filter(([, v]) => v !== undefined && v !== null));
    if (Object.keys(hw).length) {
      const v = { ...hw, itemId, origem: 'importacao' as const, updatedAt: new Date() };
      await tx.insert(itensHardware).values(v).onConflictDoUpdate({ target: itensHardware.itemId, set: v });
    }
    if (c.discos?.length) {
      await tx.delete(itensDiscos).where(and(eq(itensDiscos.itemId, itemId), eq(itensDiscos.origem, 'importacao')));
      await tx.insert(itensDiscos).values(c.discos.map((d) => ({ ...d, tamanhoGb: d.tamanhoGb == null ? null : String(d.tamanhoGb), itemId, origem: 'importacao' as const })));
    }
    if (c.interfaces?.length) {
      await tx.delete(itensInterfaces).where(and(eq(itensInterfaces.itemId, itemId), eq(itensInterfaces.origem, 'importacao')));
      await tx.insert(itensInterfaces).values(c.interfaces.map((i) => ({ ...i, itemId, origem: 'importacao' as const })));
    }

    // fabricante/modelo/série só preenchem campos vazios (não sobrescrevem dados manuais), salvo se pedido
    const mudancas = [];
    const set: Record<string, string> = {};
    for (const [k, v] of Object.entries(c.item ?? {})) {
      if (!v) continue;
      const atual = (item as Record<string, unknown>)[k];
      if ((opts.atualizarItem || !atual) && atual !== v) {
        set[k] = v;
        mudancas.push({ campo: k, antigo: atual, novo: v });
      }
    }
    if (mudancas.length) await tx.update(itens).set({ ...set, updatedAt: new Date() }).where(eq(itens.id, itemId));
    await registrar(tx, item, 'importacao', usuario, [
      { campo: 'arquivo', antigo: null, novo: `${sw.length} softwares, ${c.discos?.length ?? 0} discos, ${c.interfaces?.length ?? 0} interfaces` },
      ...mudancas,
    ]);
    return { softwares: sw.length, discos: c.discos?.length ?? 0, interfaces: c.interfaces?.length ?? 0, hardware: Object.keys(hw).length > 0, camposItem: mudancas.map((m) => m.campo) };
  });
  await reclassificarSoftwares(itemId);
  return res;
}
