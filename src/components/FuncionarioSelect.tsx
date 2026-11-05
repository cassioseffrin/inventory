'use client';

import { Select, type SelectProps } from '@mantine/core';
import { useDebouncedValue } from '@mantine/hooks';
import { useQuery } from '@tanstack/react-query';
import { useMemo, useRef, useState } from 'react';
import { api, qs } from '@/lib/api';

type Opcao = { id: number; nome: string; matricula: string; setor: string | null; ativo: boolean };

type Props = Omit<SelectProps, 'data' | 'value' | 'onChange'> & {
  value: number | null | undefined;
  onChange: (id: number | null, f?: Opcao) => void;
  /** nome atual (para exibir antes de a busca carregar) */
  nomeAtual?: string | null;
  /** funcionário que não pode ser escolhido (ex.: ele mesmo, ao escolher o gerente) */
  excluirId?: number | null;
};

const rotulo = (f: Opcao) => `${f.nome} — ${f.matricula}${f.setor ? ` (${f.setor})` : ''}${f.ativo ? '' : ' [inativo]'}`;

/** Select com busca no servidor (nome ou matrícula). */
export function FuncionarioSelect({ value, onChange, nomeAtual, excluirId, ...rest }: Props) {
  const [busca, setBusca] = useState('');
  const [selLabel, setSelLabel] = useState<string | null>(null);
  const [debounced] = useDebouncedValue(busca, 250);
  // o Select preenche a busca com o label da opção selecionada (ao escolher ou ao abrir já
  // preenchido): não filtrar por ele, senão a lista mostraria só o próprio selecionado
  const rotulosSel = useRef(new Set<string>());
  if (selLabel) rotulosSel.current.add(selLabel);
  if (nomeAtual) rotulosSel.current.add(nomeAtual);
  if (value) rotulosSel.current.add(`#${value}`);
  const termo = rotulosSel.current.has(debounced) ? '' : debounced;
  const { data = [], isFetching } = useQuery({
    queryKey: ['funcionarios-opcoes', termo],
    queryFn: () => api<Opcao[]>(`/api/funcionarios/opcoes${qs({ q: termo })}`),
  });

  const atual = data.find((f) => f.id === value);
  if (atual) rotulosSel.current.add(rotulo(atual));

  const opcoes = useMemo(() => {
    const list = data.filter((f) => f.id !== excluirId).map((f) => ({ value: String(f.id), label: rotulo(f) }));
    if (value && !list.some((o) => o.value === String(value))) {
      list.unshift({ value: String(value), label: selLabel ?? nomeAtual ?? `#${value}` });
    }
    return list;
  }, [data, value, nomeAtual, selLabel, excluirId]);

  return (
    <Select
      searchable
      clearable
      placeholder="Buscar por nome ou matrícula"
      nothingFoundMessage={isFetching ? 'Buscando…' : 'Nenhum funcionário'}
      {...rest}
      data={opcoes}
      value={value ? String(value) : null}
      onSearchChange={setBusca}
      filter={({ options }) => options}
      onChange={(v, opt) => {
        setSelLabel(opt?.label ?? null);
        onChange(v ? Number(v) : null, data.find((f) => String(f.id) === v));
      }}
    />
  );
}
