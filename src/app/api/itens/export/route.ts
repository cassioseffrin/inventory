import { itensFiltroSchema } from '@/lib/schemas';
import { STATUS_LABEL, TIPO_LABEL } from '@/lib/constants';
import { listarCampos } from '@/server/cadastros-service';
import { db } from '@/db/inv';
import { itensCamposValores } from '@/db/schema';
import { query, rota } from '@/server/http';
import { todosItens } from '@/server/itens-service';
import { gerarCsv } from '@/server/util';

const data = (d: Date | string | null) => (d ? new Date(d).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '');

/** Exporta em CSV os itens do filtro atual (inclusive grupo) com os campos customizados. */
export const GET = rota(async ({ req }) => {
  const f = itensFiltroSchema.partial().parse(Object.fromEntries(req.nextUrl.searchParams));
  const lista = await todosItens(f);
  const campos = await listarCampos(true);
  const valores = await db().select().from(itensCamposValores);
  const mapa = new Map(valores.map((v) => [`${v.itemId}:${v.campoId}`, v.valor]));

  const cab = [
    'Patrimônio', 'Provisório', 'TAG', 'Tipo', 'Status', 'Responsável', 'Matrícula', 'Setor', 'Localização',
    'Hostname', 'IP', 'MAC', 'SO', 'SO variante', 'Arquitetura', 'Fabricante', 'Modelo', 'Nº série',
    'Data aquisição', 'Nota fiscal', 'Fornecedor', 'Último visto msf', 'Última sincronização', 'Observações',
    ...campos.map((c) => c.nome),
  ];
  const linhas = lista.map((i) => [
    i.numeroPatrimonio, i.patrimonioProvisorio ? 'sim' : 'não', i.tag, TIPO_LABEL[i.tipo], STATUS_LABEL[i.status],
    i.funcionarioNome, i.funcionarioMatricula, i.setor, i.localizacao, i.hostname, i.ip, i.mac, i.osName, i.osFlavor,
    i.arch, i.fabricante, i.modelo, i.numeroSerie, i.dataAquisicao, i.notaFiscal, i.fornecedor,
    data(i.ultimoVistoMsf), data(i.ultimaSincronizacao), i.observacoes,
    ...campos.map((c) => mapa.get(`${i.id}:${c.id}`) ?? ''),
  ]);
  const nome = `inventario-${new Date().toISOString().slice(0, 10)}.csv`;
  return new Response(gerarCsv(cab, linhas), {
    headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="${nome}"` },
  });
});
