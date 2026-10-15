import 'server-only';
import { sql } from 'drizzle-orm';
import { db } from '@/db/inv';
import type { HostSituacao } from '@/lib/constants';
import { igualCI, ipSemMascara, normalizarMac } from './util';

type ItemChave = { id: number; numero_patrimonio: string; mac: string | null; ip: string | null; hostname: string | null };
type Dispositivo = { id: number; mac: string | null; ip: string | null; classificacao: 'conhecido' | 'ignorado'; tipo: string | null; descricao: string | null };

export type Classificacao = {
  situacao: HostSituacao;
  itemId?: number;
  patrimonio?: string;
  dispositivo?: Dispositivo;
};

/**
 * Carrega uma vez as chaves do inventário (MACs de itens e interfaces, IPs, hostnames)
 * e devolve uma função que classifica um host do msf.
 *
 * Regra de match:
 *  - host com MAC  → item com o mesmo MAC (item ou qualquer interface) = inventariado;
 *  - host sem MAC  → item com mesmo IP e mesmo hostname (null == null) = inventariado;
 *  - só o IP bate  → "provável" (destacado, mas não conta como inventariado);
 *  - senão         → dispositivo identificado (conhecido/ignorado) por MAC, ou por IP quando não há MAC;
 *  - senão         → desconhecido.
 */
export async function criarClassificador() {
  const itensRes = await db().execute<ItemChave>(sql`
    SELECT id, numero_patrimonio, mac, host(ip) AS ip, hostname FROM inventario.itens
    UNION ALL
    SELECT i.id, i.numero_patrimonio, f.mac, host(f.ip), i.hostname
    FROM inventario.itens_interfaces f JOIN inventario.itens i ON i.id = f.item_id`);
  const dispRes = await db().execute<Dispositivo>(sql`
    SELECT id, mac, host(ip) AS ip, classificacao, tipo, descricao FROM inventario.dispositivos_identificados`);

  const porMac = new Map<string, ItemChave>();
  const porIp = new Map<string, ItemChave[]>();
  for (const it of itensRes.rows) {
    const mac = normalizarMac(it.mac);
    if (mac && !porMac.has(mac)) porMac.set(mac, it);
    if (it.ip) {
      const l = porIp.get(it.ip) ?? [];
      l.push(it);
      porIp.set(it.ip, l);
    }
  }
  const dispMac = new Map<string, Dispositivo>();
  const dispIp = new Map<string, Dispositivo>();
  for (const d of dispRes.rows) {
    const mac = normalizarMac(d.mac);
    if (mac) dispMac.set(mac, d);
    else if (d.ip) dispIp.set(d.ip, d);
  }

  return (h: { address: string; mac: string | null; name: string | null }): Classificacao => {
    const mac = normalizarMac(h.mac);
    const ip = ipSemMascara(h.address);
    const mesmoIp = ip ? porIp.get(ip) ?? [] : [];

    if (mac) {
      const it = porMac.get(mac);
      if (it) return { situacao: 'inventariado', itemId: it.id, patrimonio: it.numero_patrimonio };
    } else {
      const it = mesmoIp.find((i) => igualCI(i.hostname, h.name));
      if (it) return { situacao: 'inventariado', itemId: it.id, patrimonio: it.numero_patrimonio };
    }

    const d = mac ? dispMac.get(mac) : ip ? dispIp.get(ip) : undefined;
    if (d) return { situacao: d.classificacao, dispositivo: d };

    // IP bate com item que não tem MAC conflitante → provável
    const prov = mesmoIp.find((i) => !mac || !normalizarMac(i.mac));
    if (prov) return { situacao: 'provavel', itemId: prov.id, patrimonio: prov.numero_patrimonio };

    return { situacao: 'desconhecido' };
  };
}
