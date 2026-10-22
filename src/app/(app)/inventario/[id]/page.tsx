'use client';

import { Alert, Anchor, Badge, Button, Card, Center, Group, Loader, Modal, SimpleGrid, Stack, Tabs, Text, Title } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { modals } from '@mantine/modals';
import { notifications } from '@mantine/notifications';
import { IconArrowLeft, IconCamera, IconCoin, IconEdit, IconRefresh, IconTrash } from '@tabler/icons-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { ItemForm, itemParaForm } from '@/components/ItemForm';
import { AbaCusto } from '@/components/item/Custo';
import { AbaFotos } from '@/components/item/Fotos';
import { AbaHardware, AbaHistorico, AbaRede, AbaServicos, AbaSoftware } from '@/components/item/Secoes';
import { SyncModal } from '@/components/item/SyncModal';
import { api, mensagemErro } from '@/lib/api';
import { STATUS_COLOR, STATUS_LABEL, TIPO_LABEL } from '@/lib/constants';
import { diasDesde, fmtData, fmtDataHora, fmtRelativo } from '@/lib/format';
import type { CampoCustom, ItemDetalhe, ItemFoto } from '@/lib/types';

function Campo({ label, children, mono }: { label: string; children: ReactNode; mono?: boolean }) {
  return (
    <div>
      <Text size="xs" c="dimmed">
        {label}
      </Text>
      <Text size="sm" className={mono ? 'mono' : undefined}>
        {children === null || children === undefined || children === '' ? '—' : children}
      </Text>
    </div>
  );
}

export default function ItemPage() {
  const { id: idStr } = useParams<{ id: string }>();
  const id = Number(idStr);
  const router = useRouter();
  const qc = useQueryClient();
  const [editando, setEditando] = useState(false);
  const [sync, setSync] = useState(false);
  const [aba, setAba] = useState<string | null>('geral');
  const mobile = useMediaQuery('(max-width: 48em)');
  const { data: item, isLoading, error } = useQuery({ queryKey: ['item', id], queryFn: () => api<ItemDetalhe>(`/api/itens/${id}`) });
  const { data: campos = [] } = useQuery({ queryKey: ['campos', 'todos'], queryFn: () => api<CampoCustom[]>('/api/campos') });
  const { data: fotos } = useQuery({ queryKey: ['fotos', id], queryFn: () => api<ItemFoto[]>(`/api/itens/${id}/fotos`) });

  if (isLoading)
    return (
      <Center p="xl">
        <Loader />
      </Center>
    );
  if (error || !item) return <Alert color="red">{error ? mensagemErro(error) : 'Item não encontrado'}</Alert>;

  const excluir = () =>
    modals.openConfirmModal({
      title: `Excluir ${item.numeroPatrimonio}?`,
      children: <Text size="sm">O histórico de auditoria é preservado.</Text>,
      labels: { confirm: 'Excluir', cancel: 'Cancelar' },
      confirmProps: { color: 'red' },
      onConfirm: async () => {
        try {
          await api(`/api/itens/${id}`, { method: 'DELETE' });
          qc.invalidateQueries({ queryKey: ['itens'] });
          router.push('/inventario');
        } catch (e) {
          notifications.show({ color: 'red', message: mensagemErro(e) });
        }
      },
    });

  const dias = diasDesde(item.ultimoVistoMsf);

  return (
    <Stack>
      <Anchor component={Link} href="/inventario" size="sm">
        <Group gap={4}>
          <IconArrowLeft size={14} /> Inventário
        </Group>
      </Anchor>
      <Group justify="space-between">
        <Group gap="xs">
          <Title order={3}>{item.numeroPatrimonio}</Title>
          {item.patrimonioProvisorio && (
            <Badge color="orange" variant="light">
              patrimônio provisório
            </Badge>
          )}
          <Badge variant="light" color={STATUS_COLOR[item.status]}>
            {STATUS_LABEL[item.status]}
          </Badge>
          <Badge variant="outline">{TIPO_LABEL[item.tipo]}</Badge>
          {item.tag && <Badge variant="dot">{item.tag}</Badge>}
        </Group>
        <Group gap="xs">
          <Button hiddenFrom="sm" variant="light" leftSection={<IconCamera size={16} />} onClick={() => setAba('fotos')}>
            Fotos
          </Button>
          <Button variant="default" leftSection={<IconRefresh size={16} />} onClick={() => setSync(true)}>
            <Text span inherit visibleFrom="sm">
              Sincronizar com msf
            </Text>
            <Text span inherit hiddenFrom="sm">
              Sincronizar
            </Text>
          </Button>
          <Button leftSection={<IconEdit size={16} />} onClick={() => setEditando(true)}>
            Editar
          </Button>
          <Button variant="subtle" color="red" leftSection={<IconTrash size={16} />} onClick={excluir}>
            Excluir
          </Button>
        </Group>
      </Group>
      <Text c="dimmed" size="sm">
        {[item.hostname, item.ip, item.osName].filter(Boolean).join(' · ')}
      </Text>

      <Tabs value={aba} onChange={setAba} keepMounted={false}>
        <Tabs.List style={{ flexWrap: 'nowrap', overflowX: 'auto', overflowY: 'hidden', scrollbarWidth: 'none' }}>
          <Tabs.Tab value="geral">Geral</Tabs.Tab>
          <Tabs.Tab value="fotos" leftSection={<IconCamera size={14} />}>
            Fotos{fotos?.length ? ` (${fotos.length})` : ''}
          </Tabs.Tab>
          <Tabs.Tab value="custo" leftSection={<IconCoin size={14} />}>
            Custo e depreciação
          </Tabs.Tab>
          <Tabs.Tab value="hardware">Hardware</Tabs.Tab>
          <Tabs.Tab value="rede">Rede</Tabs.Tab>
          <Tabs.Tab value="software">Software</Tabs.Tab>
          <Tabs.Tab value="servicos">Serviços (msf)</Tabs.Tab>
          <Tabs.Tab value="historico">Histórico</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="geral" pt="md">
          <Stack>
            <Card withBorder>
              <Title order={6} mb="sm">
                Administrativo
              </Title>
              {item.descricao && (
                <Text size="sm" fw={600} mb="sm">
                  {item.descricao}
                </Text>
              )}
              <SimpleGrid cols={{ base: 2, md: 4 }}>
                <Campo label="Responsável">
                  {item.funcionarioId ? (
                    <Anchor component={Link} href={`/funcionarios/${item.funcionarioId}`}>
                      {item.funcionarioNome} ({item.funcionarioMatricula})
                    </Anchor>
                  ) : null}
                </Campo>
                <Campo label="Setor">{item.setor}</Campo>
                <Campo label="Localização">{item.localizacao}</Campo>
                <Campo label="TAG">{item.tag}</Campo>
                <Campo label="Fabricante">{item.fabricante}</Campo>
                <Campo label="Modelo">{item.modelo}</Campo>
                <Campo label="Nº de série" mono>
                  {item.numeroSerie}
                </Campo>
                <Campo label="Data de aquisição">{item.dataAquisicao ? fmtData(item.dataAquisicao) : null}</Campo>
                <Campo label="Nota fiscal">{item.notaFiscal}</Campo>
                <Campo label="Fornecedor">{item.fornecedor}</Campo>
                <Campo label="Grupos estáticos">{item.gruposEstaticos.map((g) => g.nome).join(', ')}</Campo>
                {campos.map((c) => (
                  <Campo key={c.id} label={`${c.nome}${c.ativo ? '' : ' (inativo)'}`}>
                    {item.camposCustomizados[String(c.id)]}
                  </Campo>
                ))}
              </SimpleGrid>
              <Text size="xs" c="dimmed" mt="sm">
                Observações
              </Text>
              <Text size="sm" style={{ whiteSpace: 'pre-wrap' }}>
                {item.observacoes || '—'}
              </Text>
            </Card>
            <Card withBorder>
              <Title order={6} mb="sm">
                Rede / sistema (snapshot do msf)
              </Title>
              <SimpleGrid cols={{ base: 2, md: 4 }}>
                <Campo label="IP" mono>
                  {item.ip}
                </Campo>
                <Campo label="MAC" mono>
                  {item.mac}
                </Campo>
                <Campo label="Hostname">{item.hostname}</Campo>
                <Campo label="Arquitetura">{item.arch}</Campo>
                <Campo label="Sistema operacional">{[item.osName, item.osFlavor, item.osSp].filter(Boolean).join(' ')}</Campo>
                <Campo label="Família">{item.osFamily}</Campo>
                <Campo label="Origem msf">
                  {item.msfHostId ? `host #${item.msfHostId} · ws ${item.msfWorkspaceNome ?? item.msfWorkspaceId}` : null}
                </Campo>
                <Campo label="Última sincronização">{fmtDataHora(item.ultimaSincronizacao)}</Campo>
                <Campo label="Último visto no msf">
                  <Text span c={dias === null || dias > 30 ? 'red' : undefined} size="sm">
                    {fmtDataHora(item.ultimoVistoMsf)} ({fmtRelativo(item.ultimoVistoMsf)})
                  </Text>
                </Campo>
                <Campo label="Criado em">{fmtDataHora(item.createdAt)}</Campo>
                <Campo label="Atualizado em">{fmtDataHora(item.updatedAt)}</Campo>
              </SimpleGrid>
            </Card>
          </Stack>
        </Tabs.Panel>
        <Tabs.Panel value="fotos" pt="md">
          <AbaFotos itemId={id} />
        </Tabs.Panel>
        <Tabs.Panel value="custo" pt="md">
          <AbaCusto itemId={id} tipo={item.tipo} status={item.status} dataAquisicao={item.dataAquisicao} />
        </Tabs.Panel>
        <Tabs.Panel value="hardware" pt="md">
          <AbaHardware itemId={id} />
        </Tabs.Panel>
        <Tabs.Panel value="rede" pt="md">
          <AbaRede itemId={id} />
        </Tabs.Panel>
        <Tabs.Panel value="software" pt="md">
          <AbaSoftware itemId={id} />
        </Tabs.Panel>
        <Tabs.Panel value="servicos" pt="md">
          <AbaServicos itemId={id} />
        </Tabs.Panel>
        <Tabs.Panel value="historico" pt="md">
          <AbaHistorico itemId={id} />
        </Tabs.Panel>
      </Tabs>

      <Modal opened={editando} onClose={() => setEditando(false)} size="xl" fullScreen={mobile} title={`Editar ${item.numeroPatrimonio}`}>
        <ItemForm
          inicial={itemParaForm(item)}
          itemId={id}
          funcionarioNome={item.funcionarioNome}
          onSalvo={() => {
            setEditando(false);
            qc.invalidateQueries({ queryKey: ['historico', id] });
          }}
          onCancelar={() => setEditando(false)}
        />
      </Modal>
      <SyncModal itemId={sync ? id : null} onClose={() => setSync(false)} />
    </Stack>
  );
}
