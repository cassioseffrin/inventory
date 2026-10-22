'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Alert, Button, Center, Paper, PasswordInput, Stack, Text, TextInput, Title } from '@mantine/core';
import { IconLock } from '@tabler/icons-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { useForm } from 'react-hook-form';
import type { z } from 'zod';
import { api, mensagemErro } from '@/lib/api';
import { loginSchema } from '@/lib/schemas';
import { LogoArpa } from './LogoArpa';

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [erro, setErro] = useState<string | null>(null);
  const { register, handleSubmit, formState } = useForm<z.infer<typeof loginSchema>>({ resolver: zodResolver(loginSchema) });

  const onSubmit = handleSubmit(async (d) => {
    setErro(null);
    try {
      await api('/api/auth/login', { method: 'POST', json: d });
      const next = params.get('next');
      router.replace(next && next.startsWith('/') && !next.startsWith('//') ? next : '/');
      router.refresh();
    } catch (e) {
      setErro(mensagemErro(e));
    }
  });

  return (
    <Center mih="100vh" p="md">
      <Paper withBorder shadow="sm" p="xl" w={380} maw="100%">
        <form onSubmit={onSubmit}>
          <Stack>
            <Stack gap={4} align="center">
              <LogoArpa width={220} style={{ maxWidth: '100%', height: 'auto', color: 'var(--mantine-color-text)' }} />
              <Title order={3}>Inventário de TI</Title>
              <Text size="sm" c="dimmed">
                Acesso restrito
              </Text>
            </Stack>
            {erro && (
              <Alert color="red" icon={<IconLock size={16} />}>
                {erro}
              </Alert>
            )}
            <TextInput label="Usuário" autoComplete="username" autoFocus {...register('username')} error={formState.errors.username?.message} />
            <PasswordInput label="Senha" autoComplete="current-password" {...register('senha')} error={formState.errors.senha?.message} />
            <Button type="submit" loading={formState.isSubmitting} fullWidth>
              Entrar
            </Button>
          </Stack>
        </form>
      </Paper>
    </Center>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
