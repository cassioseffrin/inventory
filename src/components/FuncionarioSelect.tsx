'use client';

import { Select, type SelectProps } from '@mantine/core';
import { useDebouncedValue } from '@mantine/hooks';
import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { api, qs } from '@/lib/api';

type Opcao = { id: number; nome: string; matricula: string; setor: string | null; ativo: boolean };

type Props = Omit<SelectProps, 'data' | 'value' | 'onChange'> & {
  value: number | null | undefined;
  onChange: (id: number | null, f?: Opcao) => void;
  /** nome atual (para exibir antes de a busca carregar) */
  nomeAtual?: string | null;
};

const rotulo = (f: Opcao) => `${f.nome} — ${f.matricula}${f.setor ? ` (${f.setor})` : ''}${f.ativo ? '' : ' [inativo]'}`;

/** Select com busca no servidor (nome ou matrícula). */
export function FuncionarioSelect({ value, onChange, nomeAtual, ...rest }: Props) {
  const [busca, setBusca] = useState('');
  const [selLabel, setSelLabel] = useState<string | null>(null);
  const [debounced] = useDebouncedValue(busca, 250);
  // ao escolher uma opção o Select preenche a busca com o label: não filtrar por ele
  const termo = debounced === selLabel ? '' : debounced;
  const { data = [], isFetching } = useQuery({
    queryKey: ['funcionarios-opcoes', termo],
    queryFn: () => api<Opcao[]>(`/api/funcionarios/opcoes${qs({ q: termo })}`),
  });

  const opcoes = useMemo(() => {
    const list = data.map((f) => ({ value: String(f.id), label: rotulo(f) }));
    if (value && !list.some((o) => o.value === String(value))) {
      list.unshift({ value: String(value), label: selLabel ?? nomeAtual ?? `#${value}` });
    }
    return list;
  }, [data, value, nomeAtual, selLabel]);

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
