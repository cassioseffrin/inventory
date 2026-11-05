import { resetarSenhaFuncionario } from '@/server/auth-service';
import { idParam, rota } from '@/server/http';

/** Admin: volta a senha do funcionário para a provisória (o próprio CPF). */
export const DELETE = rota<{ id: string }>(async ({ params }) => {
  await resetarSenhaFuncionario(idParam(params.id));
});
