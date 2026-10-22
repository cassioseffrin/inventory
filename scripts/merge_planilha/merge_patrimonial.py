#!/usr/bin/env python3
"""
Merge da planilha patrimonial (patrimonio-nesi.xlsx) no banco `inventario`.

Cada aba é um setor/local com as colunas PATRIMONIO | DESCRIÇÃO | DATA | SETOR [| OBSERVAÇÃO]
(na aba "SEM SETOR" a coluna de setor chama "ULTIMO SETOR CADASTRADO").

Regras (idempotente — pode ser reexecutado):
  - chave = nº de patrimônio sem zeros à esquerda ("0027" → "27"), como no restante do banco.
  - patrimônio repetido na planilha: vale a primeira ocorrência (ordem das abas).
  - aba SEM SETOR: a coluna "ULTIMO SETOR CADASTRADO" é histórica → vai para as observações, não para o setor.
  - item existente → descrição = a da planilha; observação da planilha é acrescentada às observações;
    setor e data de aquisição só preenchem quando vazios (o inventário de 17/10 é mais recente —
    diferenças de setor vão para o relatório); tipo só sai de "outro" quando a descrição indica o tipo.
  - item novo → criado com descrição, setor, data de aquisição, tipo inferido e status:
      aba BAIXADO → baixado | ALMOXARIFADO / SEM SETOR → estoque | demais → em_uso.
  - baixa de item que tem responsável não é aplicada (conflito no relatório).
  Alterações vão para itens_historico com usuario = 'planilha-patrimonial'.

Uso:
  .venv/bin/python scripts/merge_planilha/merge_patrimonial.py data_merge/patrimonio-nesi.xlsx            # simulação
  .venv/bin/python scripts/merge_planilha/merge_patrimonial.py data_merge/patrimonio-nesi.xlsx --aplicar  # grava
"""
from __future__ import annotations

import argparse
import datetime as dt
import re

import openpyxl
import psycopg2
import psycopg2.extras

from merge_colaboradores import ascii_upper, database_url, texto

USUARIO = 'planilha-patrimonial'
SETORES_VAZIOS = {'', 'SEM SETOR', 'PATRIMONIO BAIXADO'}
ABAS_ESTOQUE = {'ALMOXARIFADO', 'SEM SETOR'}

# primeira regra que casar com a descrição define o tipo
TIPOS = [
    (r'\bNOTE?BO+K|\bNETBOOK|^NOT\b', 'notebook'),
    (r'\bIMPRESSORA', 'impressora'),
    (r'\bSERVIDOR', 'servidor'),
    (r'\bSWITCH', 'switch'),
    (r'\bMAQ(UINA|UININHA)? (DE )?(PAGAMENTO|CARTAO)|\bSMART ?POS', 'smart_pos'),
    (r'\bCPU\b|\bDESKTOP|\bCOMPUTADOR|\bTHIN ?CLIENT|\bMINI ?PC|^PC\b', 'desktop'),
]


def inferir_tipo(desc: str | None) -> str:
    d = ascii_upper(desc)
    return next((t for padrao, t in TIPOS if re.search(padrao, d)), 'outro')


def normalizar_patrimonio(v) -> str | None:
    if isinstance(v, float) and v.is_integer():
        v = int(v)
    s = texto(v)
    return str(int(s)) if s and re.fullmatch(r'\d+', s) else None


def ler_data(v) -> dt.date | None:
    if isinstance(v, dt.datetime):
        return v.date()
    if isinstance(v, dt.date):
        return v
    m = re.fullmatch(r'(\d{1,2})/(\d{1,2})/(\d{4})', texto(v) or '')
    if not m:
        return None
    try:
        return dt.date(int(m[3]), int(m[2]), int(m[1]))
    except ValueError:
        return None


def ler_linhas(caminho: str) -> list[dict]:
    wb = openpyxl.load_workbook(caminho, data_only=True)
    out = []
    for ws in wb:
        aba = ws.title.strip()
        col = None
        for r, row in enumerate(ws.iter_rows(values_only=True), 1):
            cels = [ascii_upper(c) for c in row]
            if col is None:
                if 'PATRIMONIO' in cels:
                    col = {
                        'pat': cels.index('PATRIMONIO'),
                        'desc': next((i for i, c in enumerate(cels) if c.startswith('DESCRI')), None),
                        'data': next((i for i, c in enumerate(cels) if c == 'DATA'), None),
                        'setor': next((i for i, c in enumerate(cels) if 'SETOR' in c), None),
                        'obs': next((i for i, c in enumerate(cels) if c.startswith('OBSERVA')), None),
                    }
                continue
            get = lambda k: row[col[k]] if col[k] is not None and col[k] < len(row) else None  # noqa: E731
            if all(texto(c) is None for c in row) or cels[col['pat']] == 'PATRIMONIO':
                continue
            out.append({
                'ref': f'{aba}!{r}',
                'aba': aba,
                'pat_bruto': texto(get('pat')),
                'descricao': texto(get('desc')),
                'data': ler_data(get('data')),
                'setor_bruto': texto(get('setor')),
                'obs': texto(get('obs')),
            })
    return out


class Merge:
    def __init__(self, cur):
        self.cur = cur
        self.rel = {k: [] for k in ('criados', 'atualizados', 'setor_divergente', 'conflitos', 'ignorados')}
        self.vistos: dict[str, str] = {}

    def one(self, sql, args=()):
        self.cur.execute(sql, args)
        return self.cur.fetchone()

    def historico(self, item_id, pat, acao, mudancas):
        for campo, antigo, novo in mudancas:
            self.cur.execute(
                'INSERT INTO inventario.itens_historico (item_id, numero_patrimonio, acao, campo, valor_antigo, valor_novo, usuario) '
                'VALUES (%s,%s,%s,%s,%s,%s,%s)',
                (item_id, pat, acao, campo, None if antigo is None else str(antigo), None if novo is None else str(novo), USUARIO))

    def linha(self, l):
        pat = normalizar_patrimonio(l['pat_bruto'])
        if not pat:
            self.rel['ignorados'].append(f"{l['ref']}: patrimônio inválido {l['pat_bruto']!r}")
            return
        if pat in self.vistos:
            self.rel['conflitos'].append(f"{l['ref']} {pat} {l['descricao']!r}: já aparece em {self.vistos[pat]} — linha ignorada")
            return
        self.vistos[pat] = f"{l['ref']} ({l['descricao']})"

        aba_up = ascii_upper(l['aba'])
        desc = l['descricao']
        baixado = aba_up == 'BAIXADO' or ascii_upper(l['setor_bruto']) == 'PATRIMONIO BAIXADO'
        if desc and baixado:
            desc = re.sub(r'^\s*BAIXADO\s*-\s*', '', desc, flags=re.I) or desc
        setor = l['setor_bruto'] if ascii_upper(l['setor_bruto']) not in SETORES_VAZIOS else None
        obs = l['obs']
        if aba_up == 'SEM SETOR':
            if setor:
                obs = '\n'.join(filter(None, [obs, f'Último setor cadastrado: {setor}']))
            setor = None
        elif not setor and aba_up not in ABAS_ESTOQUE | {'BAIXADO'}:
            setor = l['aba']
        status = 'baixado' if baixado else 'estoque' if aba_up in ABAS_ESTOQUE else 'em_uso'
        tipo = inferir_tipo(desc)
        desc_ref = f"{l['ref']} {pat} {desc!r}"

        atual = self.one('SELECT * FROM inventario.itens WHERE numero_patrimonio=%s', (pat,))
        if not atual:
            novo = self.one(
                'INSERT INTO inventario.itens (numero_patrimonio, descricao, tipo, status, setor, data_aquisicao, observacoes) '
                'VALUES (%s,%s,%s,%s,%s,%s,%s) RETURNING id',
                (pat, desc, tipo, status, setor, l['data'], obs))
            self.historico(novo['id'], pat, 'importacao', [('origem', None, f"planilha patrimonial {l['ref']}")])
            self.rel['criados'].append(f'{desc_ref} → {tipo}/{status}/{setor or "-"}')
            return

        patch = {}
        if desc and atual['descricao'] != desc:
            patch['descricao'] = desc
        if obs and obs not in (atual['observacoes'] or ''):
            patch['observacoes'] = '\n'.join(filter(None, [atual['observacoes'], obs]))
        if setor and not atual['setor']:
            patch['setor'] = setor
        elif setor and ascii_upper(atual['setor']) != ascii_upper(setor):
            self.rel['setor_divergente'].append(f"{desc_ref}: banco {atual['setor']!r} × planilha {setor!r} — mantido o do banco")
        if l['data'] and not atual['data_aquisicao']:
            patch['data_aquisicao'] = l['data']
        if atual['tipo'] == 'outro' and tipo != 'outro':
            patch['tipo'] = tipo
        if baixado and atual['status'] != 'baixado':
            if atual['funcionario_id']:
                self.rel['conflitos'].append(f'{desc_ref}: baixado na planilha, mas tem responsável no inventário — baixa não aplicada')
            else:
                patch['status'] = 'baixado'
        if not patch:
            return
        sets = ', '.join(f'{k}=%s' for k in patch)
        self.cur.execute(f'UPDATE inventario.itens SET {sets}, updated_at=now() WHERE id=%s', (*patch.values(), atual['id']))
        self.historico(atual['id'], pat, 'alteracao', [(k, atual[k], v) for k, v in patch.items()])
        self.rel['atualizados'].append(f'{desc_ref}: ' + ', '.join(f'{k}: {atual[k]!r} → {v!r}' for k, v in patch.items()))


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('planilha')
    ap.add_argument('--aplicar', action='store_true', help='grava no banco (sem isso, só simula e faz rollback)')
    ap.add_argument('--detalhe', action='store_true', help='lista cada item criado/atualizado')
    a = ap.parse_args()

    linhas = ler_linhas(a.planilha)
    con = psycopg2.connect(database_url(), application_name='merge-planilha-patrimonial')
    try:
        with con:
            m = Merge(con.cursor(cursor_factory=psycopg2.extras.RealDictCursor))
            for l in linhas:
                m.linha(l)
            if not a.aplicar:
                con.rollback()
    finally:
        con.close()

    print(f"{'APLICADO' if a.aplicar else 'SIMULAÇÃO (use --aplicar para gravar)'} — {len(linhas)} linhas lidas de {a.planilha}\n")
    for k, ls in m.rel.items():
        print(f'== {k}: {len(ls)}')
        if a.detalhe or k in ('conflitos', 'ignorados'):
            for x in ls:
                print('  ', x)


if __name__ == '__main__':
    main()
