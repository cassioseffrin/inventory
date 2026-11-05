'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { Sessao } from '@/lib/types';

/** Sessão atual (papel revalidado pelo servidor em /api/auth/me). */
export function useSessao() {
  return useQuery({ queryKey: ['me'], queryFn: () => api<Sessao>('/api/auth/me'), staleTime: 5 * 60_000 });
}

/**
 * Só admin altera dados; gerente/comum só leem. Enquanto a sessão carrega devolve false
 * (esconde as ações em vez de mostrá-las e depois sumir). A API faz a checagem real.
 */
export function useEhAdmin() {
  return useSessao().data?.papel === 'admin';
}
