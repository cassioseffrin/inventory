import { soDigitos } from './cpf';

/** Formata progressivamente como (00) 00000-0000 (celular) ou (00) 0000-0000 (fixo). */
export function mascaraTelefone(v: string | null | undefined) {
  const d = soDigitos(v ?? '').replace(/^0+/, '').slice(0, 11);
  if (!d) return '';
  if (d.length <= 2) return `(${d}`;
  const ddd = d.slice(0, 2);
  const resto = d.slice(2);
  // 11 dígitos → celular 5+4; até 10 → fixo 4+4
  const corte = d.length === 11 ? 5 : 4;
  return resto.length <= corte ? `(${ddd}) ${resto}` : `(${ddd}) ${resto.slice(0, corte)}-${resto.slice(corte)}`;
}

/** DDD + 8 (fixo) ou 9 dígitos (celular). */
export const telefoneValido = (v: string) => /^\d{10,11}$/.test(soDigitos(v).replace(/^0+/, ''));
