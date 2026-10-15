import 'server-only';

/** Normaliza MAC para `aa:bb:cc:dd:ee:ff` (ou null). */
export function normalizarMac(mac: string | null | undefined): string | null {
  if (!mac) return null;
  const hex = mac.toLowerCase().replace(/[^0-9a-f]/g, '');
  if (hex.length !== 12) return null;
  return hex.match(/.{2}/g)!.join(':');
}

/** Remove a máscara (/32) que o tipo inet pode trazer. */
export function ipSemMascara(ip: string | null | undefined): string | null {
  if (!ip) return null;
  return ip.replace(/\/(32|128)$/, '');
}

export const igualCI = (a: string | null | undefined, b: string | null | undefined) =>
  (a ?? '').trim().toLowerCase() === (b ?? '').trim().toLowerCase();

/** Sub-rede de um IPv4 com o prefixo dado (ex.: 192.168.50.0/24). IPv6 → /64 aproximado. */
export function subredeDe(ip: string, prefixo: number): string {
  const v4 = ip.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (!v4) {
    const partes = ip.split(':').slice(0, 4).join(':');
    return `${partes}::/64`;
  }
  const n = v4.slice(1).reduce((acc, o) => (acc << 8) + Number(o), 0) >>> 0;
  const mask = prefixo === 0 ? 0 : (0xffffffff << (32 - prefixo)) >>> 0;
  const net = (n & mask) >>> 0;
  return `${[24, 16, 8, 0].map((s) => (net >>> s) & 255).join('.')}/${prefixo}`;
}

/** Gera CSV (separador `;`, com BOM) que abre corretamente no Excel em pt-BR. */
export function gerarCsv(cabecalho: string[], linhas: (string | number | null | undefined)[][]): string {
  const esc = (v: string | number | null | undefined) => {
    if (v === null || v === undefined) return '';
    const s = String(v);
    // neutraliza injeção de fórmula ao abrir no Excel
    const seguro = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
    return /[;"\n\r]/.test(seguro) ? `"${seguro.replace(/"/g, '""')}"` : seguro;
  };
  return '﻿' + [cabecalho, ...linhas].map((l) => l.map(esc).join(';')).join('\r\n');
}

export function texto(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v.toISOString();
  const s = String(v).trim();
  return s === '' ? null : s;
}

/** IPv4 dentro de um CIDR (ex.: 10.0.0.0/8). IPv6 compara por prefixo textual. */
export function ipNaSubrede(ip: string, cidr: string): boolean {
  const [rede, pref] = cidr.split('/');
  const p = Number(pref ?? (rede.includes(':') ? 128 : 32));
  if (!/^\d+\.\d+\.\d+\.\d+$/.test(ip) || !/^\d+\.\d+\.\d+\.\d+$/.test(rede)) {
    return ip.toLowerCase().startsWith(rede.toLowerCase().replace(/::$/, ''));
  }
  const n = (s: string) => s.split('.').reduce((a, o) => (a << 8) + Number(o), 0) >>> 0;
  const mask = p === 0 ? 0 : (0xffffffff << (32 - p)) >>> 0;
  return (n(ip) & mask) >>> 0 === (n(rede) & mask) >>> 0;
}

export const CIDR_RE = /^(\d{1,3}\.){3}\d{1,3}(\/([0-9]|[12]\d|3[0-2]))?$/;
