import { resetarSenhaFuncionario } from '@/server/auth-service';
import { garantirNaEquipe } from '@/server/cadastros-service';
import { idParam, rota } from '@/server/http';

/** Volta a senha do funcionário para a provisória (o próprio CPF). Gerente: só da equipe. */
export const DELETE = rota<{ id: string }>(
  async ({ params, equipe }) => {
    const id = idParam(params.id);
    await garantirNaEquipe(id, equipe, true);
    await resetarSenhaFuncionario(id);
  },
  { gerente: true },
);
