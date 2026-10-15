'use client';

import { Button, Card, Code, Group, Stack, Text, Title } from '@mantine/core';
import { IconArrowRight } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import type { CampoCustom } from '@/lib/types';

export default function ConfiguracoesPage() {
  const { data: campos = [] } = useQuery({ queryKey: ['campos', 'todos'], queryFn: () => api<CampoCustom[]>('/api/campos') });
  const [origem, setOrigem] = useState('http://<servidor>:3000');
  useEffect(() => setOrigem(window.location.origin), []);

  return (
    <Stack>
      <Title order={3}>Configurações</Title>

      <Card withBorder>
        <Group justify="space-between">
          <div>
            <Title order={5}>Dados administrativos (campos customizados)</Title>
            <Text size="sm" c="dimmed">
              {campos.length} {campos.length === 1 ? 'campo cadastrado' : 'campos cadastrados'}, exibidos no formulário de item e incluídos no CSV.
            </Text>
          </div>
          <Button component={Link} href="/campos" variant="light" rightSection={<IconArrowRight size={16} />}>
            Gerenciar campos
          </Button>
        </Group>
      </Card>

      <Card withBorder>
        <Title order={5} mb="xs">
          Exportar do Kali para o inventário
        </Title>
        <Text size="sm" mb="xs">
          Depois de escanear as faixas com <Code>db_nmap</Code>, o Kali pode chamar a importação em massa com o token <Code>IMPORT_API_TOKEN</Code>{' '}
          (definido no <Code>.env</Code> do servidor). O script <Code>scripts/kali/scan-e-exporta.sh</Code> faz o scan e a exportação de uma vez:
        </Text>
        <Code block>
          {`INV_URL=${origem} INV_TOKEN=<token> \\
  ./scan-e-exporta.sh -w filial-sp 10.10.0.0/24 10.10.1.0/24 192.168.50.0/24

# só exportar o que já está no msf (sem escanear):
curl -X POST ${origem}/api/msf/importar \\
  -H "Authorization: Bearer $INV_TOKEN" -H 'content-type: application/json' \\
  -d '{"workspaceNome":"filial-sp","subredes":["10.10.0.0/24"],"simular":true}'`}
        </Code>
      </Card>

    </Stack>
  );
}
