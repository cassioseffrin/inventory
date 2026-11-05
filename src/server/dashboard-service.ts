import 'server-only';
import { sql } from 'drizzle-orm';
import { db } from '@/db/inv';
import { contarDuplicados } from './grupos-duplicados-service';
import { hostsClassificados } from './hosts-service';
import { contarHosts } from './msf-repo';

type Contagem = { chave: string | null; total: number };

async function contarPor(expr: string, where = 'true'): Promise<Contagem[]> {
  const r = await db().execute<Contagem>(
    sql.raw(`SELECT ${expr} AS chave, count(*)::int AS total FROM inventario.itens i
             LEFT JOIN inventario.funcionarios f ON f.id = i.funcionario_id
             WHERE ${where} GROUP BY 1 ORDER BY 2 DESC, 1 LIMIT 15`),
  );
  return r.rows;
}

export async function dashboard() {
  const [porTipo, porStatus, porSetor, porSo, porFuncionario, totais, duplicados, proibidos] = await Promise.all([
    contarPor('i.tipo::text'),
    contarPor('i.status::text'),
    contarPor(`coalesce(nullif(i.setor, ''), '(sem setor)')`),
    contarPor(`coalesce(nullif(i.os_name, ''), '(desconhecido)')`),
    contarPor('f.nome', 'i.funcionario_id IS NOT NULL'),
    db().execute<Record<string, number>>(sql`
      SELECT count(*)::int AS itens,
        count(*) FILTER (WHERE funcionario_id IS NULL AND status <> 'baixado')::int AS "semResponsavel",
        count(*) FILTER (WHERE patrimonio_provisorio)::int AS "semPatrimonio",
        count(*) FILTER (WHERE status <> 'baixado' AND (ultimo_visto_msf IS NULL OR ultimo_visto_msf < now() - interval '30 days'))::int AS "naoVistos30",
        (SELECT count(*)::int FROM inventario.funcionarios WHERE ativo) AS funcionarios
      FROM inventario.itens`),
    contarDuplicados(),
    db().execute<{ n: number }>(sql`
      SELECT count(DISTINCT s.item_id)::int AS n FROM inventario.itens_softwares s
      JOIN inventario.software_dicionario d ON d.id = s.dicionario_id AND d.categoria = 'proibido'`),
  ]);

  // hosts desconhecidos dependem do msf; se ele estiver fora do ar o dashboard continua funcionando
  let hosts: { total: number; desconhecidos: number; erro?: string } = { total: 0, desconhecidos: 0 };
  try {
    const hs = await hostsClassificados({});
    hosts = { total: hs.length, desconhecidos: hs.filter((h) => h.situacao === 'desconhecido').length };
  } catch (e) {
    hosts.erro = 'msf indisponível: ' + (e as Error).message;
  }

  return {
    totais: { ...totais.rows[0], duplicados, comSoftwareProibido: proibidos.rows[0].n, hostsMsf: hosts.total, hostsDesconhecidos: hosts.desconhecidos },
    msfErro: hosts.erro,
    porTipo,
    porStatus,
    porSetor,
    porSo,
    porFuncionario,
  };
}

/** Totais exibidos como badge ao lado de cada entrada do menu lateral. */
export async function contadoresMenu() {
  const [r, duplicados] = await Promise.all([
    db().execute<Record<string, number>>(sql`
      SELECT (SELECT count(*)::int FROM inventario.itens) AS inventario,
        (SELECT count(*)::int FROM inventario.funcionarios WHERE ativo) AS funcionarios,
        (SELECT count(*)::int FROM inventario.grupos) AS grupos,
        (SELECT count(*)::int FROM inventario.software_dicionario) AS software,
        (SELECT count(*)::int FROM inventario.campos_customizados) AS campos`),
    contarDuplicados(),
  ]);

  // msf fora do ar não deve derrubar o menu
  let hosts: number | null = null;
  try {
    hosts = await contarHosts();
  } catch {
    /* sem badge para hosts */
  }

  return { ...r.rows[0], duplicados, hosts } as Record<string, number | null>;
}

/** `i.funcionario_id` dentro do escopo; ids são inteiros vindos do banco, mas filtrados de novo por garantia. */
const condEscopo = (escopo: number[]) => {
  const ids = escopo.filter((n) => Number.isInteger(n));
  return ids.length ? `i.funcionario_id IN (${ids.join(',')})` : 'false';
};

/**
 * Dashboard dos perfis gerente/comum: só os itens do escopo (a própria pessoa e, para gerente,
 * a equipe). Nada de msf, duplicados ou totais globais.
 */
export async function dashboardPessoal(escopo: number[]) {
  const w = condEscopo(escopo);
  const [porTipo, porStatus, porFuncionario, totais] = await Promise.all([
    contarPor('i.tipo::text', w),
    contarPor('i.status::text', w),
    contarPor('f.nome', w),
    db().execute<{ itens: number; comSoftwareProibido: number }>(
      sql.raw(`SELECT count(*)::int AS itens,
        count(*) FILTER (WHERE EXISTS (
          SELECT 1 FROM inventario.itens_softwares s
          JOIN inventario.software_dicionario d ON d.id = s.dicionario_id AND d.categoria = 'proibido'
          WHERE s.item_id = i.id))::int AS "comSoftwareProibido"
        FROM inventario.itens i WHERE ${w}`),
    ),
  ]);
  return { pessoal: true as const, totais: { ...totais.rows[0], equipe: escopo.length - 1 }, porTipo, porStatus, porFuncionario };
}

/** Badges do menu para gerente/comum: só o que está no escopo. */
export async function contadoresMenuPessoal(escopo: number[]) {
  const w = condEscopo(escopo);
  const r = await db().execute<Record<string, number>>(
    sql.raw(`SELECT (SELECT count(*)::int FROM inventario.itens i WHERE ${w}) AS inventario,
      (SELECT count(DISTINCT lower(s.nome))::int FROM inventario.itens_softwares s
         JOIN inventario.itens i ON i.id = s.item_id WHERE ${w}) AS software`),
  );
  return r.rows[0] as Record<string, number | null>;
}

