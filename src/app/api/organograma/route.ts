import { rota } from '@/server/http';
import { organograma } from '@/server/organograma-service';

/** Todos os perfis veem o organograma (só campos públicos, sem CPF). */
export const GET = rota(async ({ sessao, equipe }) => organograma(sessao.papel === 'admin' ? null : sessao.papel === 'gerente' ? (equipe ?? []) : []), {
  restrito: true,
});
