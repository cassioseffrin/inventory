'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Button, Card, Group, PasswordInput, Stack, Text, Title } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { useSessao } from '@/components/useSessao';
import { api, mensagemErro } from '@/lib/api';

const formSchema = z
  .object({
    atual: z.string().min(1, 'Informe a senha atual'),
    nova: z.string().min(8, 'Mínimo de 8 caracteres').max(100),
    confirmar: z.string(),
  })
  .refine((v) => v.nova === v.confirmar, {
    path: ['confirmar'],
    message: 'As senhas não conferem',
  })
  .refine((v) => v.nova !== v.atual, {
    path: ['nova'],
    message: 'A nova senha deve ser diferente da atual',
  });

export default function SenhaPage() {
  const qc = useQueryClient();
  const { data: sessao } = useSessao();
  const { register, handleSubmit, formState, reset } = useForm<z.infer<typeof formSchema>>({ resolver: zodResolver(formSchema) });

  const salvar = handleSubmit(async ({ atual, nova }) => {
    try {
      await api('/api/auth/senha', { method: 'PUT', json: { atual, nova } });
      notifications.show({ color: 'teal', message: 'Senha alterada' });
      reset({ atual: '', nova: '', confirmar: '' });
      qc.invalidateQueries({ queryKey: ['me'] });
    } catch (e) {
      notifications.show({ color: 'red', message: mensagemErro(e) });
    }
  });

  return (
    <Stack maw={420}>
      <Title order={3}>Alterar senha</Title>
      <Card withBorder>
        <form onSubmit={salvar}>
          <Stack>
            {sessao?.senhaProvisoria && (
              <Text size="sm" c="dimmed">
                Sua senha atual é o seu CPF, só os números (sem pontos e traço).
              </Text>
            )}
            <PasswordInput label="Senha atual" autoComplete="current-password" {...register('atual')} error={formState.errors.atual?.message} />
            <PasswordInput
              label="Nova senha"
              autoComplete="new-password"
              description="Mínimo de 8 caracteres; não pode ser o CPF"
              {...register('nova')}
              error={formState.errors.nova?.message}
            />
            <PasswordInput label="Confirmar nova senha" autoComplete="new-password" {...register('confirmar')} error={formState.errors.confirmar?.message} />
            <Group justify="flex-end">
              <Button type="submit" loading={formState.isSubmitting}>
                Salvar
              </Button>
            </Group>
          </Stack>
        </form>
      </Card>
    </Stack>
  );
}
