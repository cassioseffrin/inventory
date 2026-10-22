// Depreciação linear (cotas constantes) segundo as regras brasileiras. Puro: roda no cliente e no servidor.
//
// - RIR/2018 (Decreto 9.580/2018), arts. 311 a 330: a depreciação começa quando o bem é instalado ou
//   posto em serviço (art. 317) e nunca ultrapassa o custo de aquisição (art. 317, §3º).
// - IN RFB 1.700/2017, Anexo III: taxas anuais por NCM (informática 20%, móveis/máquinas 10%...).
// - RIR/2018, art. 323: bens usados em mais de um turno multiplicam a taxa por 1,5 (2 turnos) ou 2,0 (3 turnos).
// - RIR/2018, art. 313: bens de custo unitário até R$ 1.200,00 podem ir direto para despesa.
// - CPC 27 / NBC TG 27: o custo inclui frete, instalação e impostos não recuperáveis; a base depreciável
//   é o custo menos o valor residual. Para fins fiscais o valor residual costuma ser zero.
//
// Convenção de competência: o mês de início de uso conta como mês cheio e a depreciação acumulada é
// apurada até o fim do mês de referência (ou do mês da baixa).

import type { Tipo } from './constants';

export const LIMITE_PEQUENO_VALOR = 1200;

export const COEF_TURNOS: Record<number, number> = { 1: 1, 2: 1.5, 3: 2 };

/** Taxas fiscais sugeridas por tipo de equipamento (IN RFB 1.700/2017, Anexo III). */
export const TAXA_SUGERIDA: Record<Tipo, { taxa: number; fundamento: string }> = {
  desktop: { taxa: 20, fundamento: 'NCM 8471 — máquinas automáticas para processamento de dados' },
  notebook: { taxa: 20, fundamento: 'NCM 8471 — máquinas automáticas para processamento de dados' },
  servidor: { taxa: 20, fundamento: 'NCM 8471 — máquinas automáticas para processamento de dados' },
  impressora: { taxa: 20, fundamento: 'Periférico de informática (NCM 8471/8443) — confirme a NCM da nota' },
  switch: { taxa: 10, fundamento: 'NCM 8517 — aparelhos para comunicação em redes' },
  smart_pos: { taxa: 20, fundamento: 'Equipamento de processamento de dados — confirme a NCM da nota' },
  outro: { taxa: 10, fundamento: 'Móveis, utensílios, máquinas e equipamentos em geral (NCM 94/84)' },
};

export type ParametrosDepreciacao = {
  valorAquisicao: number;
  custosAdicionais: number;
  valorResidual: number;
  dataInicioUso: string; // AAAA-MM-DD
  taxaAnual: number;
  turnos: number;
  dataBaixa: string | null;
};

export type LinhaAnual = {
  ano: number;
  meses: number;
  depreciacao: number;
  acumulada: number;
  valorContabil: number;
  situacao: 'realizado' | 'em_curso' | 'projetado';
};

export type ResultadoDepreciacao = {
  custo: number;
  baseDepreciavel: number;
  taxaEfetiva: number;
  quotaMensal: number;
  vidaUtilMeses: number;
  mesesDecorridos: number;
  acumulada: number;
  valorContabil: number;
  percentual: number;
  fimPrevisto: string; // AAAA-MM (último mês de depreciação)
  totalmenteDepreciado: boolean;
  pequenoValor: boolean;
  anual: LinhaAnual[];
};

const centavos = (v: number) => Math.round(v * 100);
const reais = (c: number) => c / 100;
/** Índice absoluto do mês (ano*12 + mês-1) a partir de AAAA-MM-DD, sem passar por Date/fuso. */
const mesIdx = (iso: string) => Number(iso.slice(0, 4)) * 12 + Number(iso.slice(5, 7)) - 1;
const isoMes = (idx: number) => `${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, '0')}`;

export function calcularDepreciacao(p: ParametrosDepreciacao, referencia = new Date().toISOString().slice(0, 10)): ResultadoDepreciacao {
  const custo = centavos(p.valorAquisicao) + centavos(p.custosAdicionais);
  const base = Math.max(0, custo - centavos(p.valorResidual));
  const taxaEfetiva = Math.min(100, p.taxaAnual * (COEF_TURNOS[p.turnos] ?? 1));
  const vidaUtilMeses = taxaEfetiva > 0 ? Math.ceil(1200 / taxaEfetiva) : Infinity;
  const quota = (base * taxaEfetiva) / 1200;

  const inicio = mesIdx(p.dataInicioUso);
  const ultimoMes = inicio + vidaUtilMeses - 1;
  const baixa = p.dataBaixa ? mesIdx(p.dataBaixa) : null;
  const ref = mesIdx(referencia);

  /** Depreciação acumulada até o fim do mês `idx` (em centavos), respeitando baixa e o teto da base. */
  const acumAte = (idx: number) => {
    const n = Math.max(0, Math.min(idx, baixa ?? idx) - inicio + 1);
    return n >= vidaUtilMeses ? base : Math.min(base, Math.round(quota * n));
  };

  const acumulada = acumAte(ref);
  const anual: LinhaAnual[] = [];
  const anoFim = Math.floor(Math.min(ultimoMes, baixa ?? ultimoMes) / 12);
  const anoRef = Math.floor(ref / 12);
  if (Number.isFinite(anoFim)) {
    for (let ano = Math.floor(inicio / 12); ano <= anoFim; ano++) {
      const de = Math.max(inicio, ano * 12);
      const ate = Math.min(ano * 12 + 11, ultimoMes, baixa ?? Infinity);
      const acum = acumAte(ano * 12 + 11);
      anual.push({
        ano,
        meses: Math.max(0, ate - de + 1),
        depreciacao: reais(acum - acumAte(ano * 12 - 1)),
        acumulada: reais(acum),
        valorContabil: reais(custo - acum),
        situacao: ano < anoRef ? 'realizado' : ano === anoRef ? 'em_curso' : 'projetado',
      });
    }
  }

  return {
    custo: reais(custo),
    baseDepreciavel: reais(base),
    taxaEfetiva,
    quotaMensal: reais(Math.round(quota)),
    vidaUtilMeses,
    mesesDecorridos: Math.max(0, Math.min(ref, baixa ?? ref, ultimoMes) - inicio + 1),
    acumulada: reais(acumulada),
    valorContabil: reais(custo - acumulada),
    percentual: base > 0 ? (acumulada / base) * 100 : 0,
    fimPrevisto: Number.isFinite(ultimoMes) ? isoMes(ultimoMes) : '',
    totalmenteDepreciado: base > 0 && acumulada >= base,
    pequenoValor: custo > 0 && custo <= centavos(LIMITE_PEQUENO_VALOR),
    anual,
  };
}

export const fmtMoeda = (v: number | null | undefined) =>
  v === null || v === undefined ? '—' : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
