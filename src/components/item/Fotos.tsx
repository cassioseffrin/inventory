'use client';

import { ActionIcon, Alert, Button, Card, Center, Group, Image, Loader, Modal, Progress, SimpleGrid, Stack, Text } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { modals } from '@mantine/modals';
import { notifications } from '@mantine/notifications';
import { IconCamera, IconChevronLeft, IconChevronRight, IconPhoto, IconPhotoPlus, IconTrash } from '@tabler/icons-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef, useState, type ChangeEvent } from 'react';
import { api, mensagemErro } from '@/lib/api';
import { fmtDataHora } from '@/lib/format';
import type { ItemFoto } from '@/lib/types';

/** Lado máximo gravado no banco (a imagem não precisa ser quadrada). */
const MAX_LADO = 1024;
const QUALIDADE_JPEG = 0.85;

/**
 * Reduz proporcionalmente para caber em MAX_LADO x MAX_LADO e converte para JPEG.
 * O <img> já aplica a orientação EXIF, então fotos do celular saem na posição certa.
 */
async function reduzirImagem(arquivo: File): Promise<string> {
  const url = URL.createObjectURL(arquivo);
  try {
    const img = new window.Image();
    img.src = url;
    await img.decode();
    const escala = Math.min(1, MAX_LADO / img.naturalWidth, MAX_LADO / img.naturalHeight);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(img.naturalWidth * escala));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * escala));
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Navegador sem suporte a canvas');
    ctx.fillStyle = '#fff'; // PNG com transparência não fica preto no JPEG
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', QUALIDADE_JPEG);
  } finally {
    URL.revokeObjectURL(url);
  }
}

const fmtTamanho = (b: number) => (b >= 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${Math.round(b / 1024)} KB`);

export function AbaFotos({ itemId }: { itemId: number }) {
  const qc = useQueryClient();
  const mobile = useMediaQuery('(max-width: 48em)');
  const cameraRef = useRef<HTMLInputElement>(null);
  const galeriaRef = useRef<HTMLInputElement>(null);
  const [envio, setEnvio] = useState<{ feitas: number; total: number } | null>(null);
  const [aberta, setAberta] = useState<number | null>(null);
  const { data: fotos = [], isLoading } = useQuery({
    queryKey: ['fotos', itemId],
    queryFn: () => api<ItemFoto[]>(`/api/itens/${itemId}/fotos`),
  });
  const src = (f: ItemFoto) => `/api/itens/${itemId}/fotos/${f.id}`;

  const enviar = async (e: ChangeEvent<HTMLInputElement>) => {
    const arquivos = Array.from(e.target.files ?? []).filter((f) => f.type.startsWith('image/'));
    e.target.value = ''; // permite escolher o mesmo arquivo de novo
    if (!arquivos.length) return;
    setEnvio({ feitas: 0, total: arquivos.length });
    let falhas = 0;
    // uma por vez: mantém o corpo da requisição pequeno e não estoura memória do celular
    for (const [i, arquivo] of arquivos.entries()) {
      try {
        await api(`/api/itens/${itemId}/fotos`, { method: 'POST', json: { dados: await reduzirImagem(arquivo) } });
      } catch (err) {
        falhas++;
        notifications.show({ color: 'red', title: arquivo.name, message: mensagemErro(err) });
      }
      setEnvio({ feitas: i + 1, total: arquivos.length });
    }
    setEnvio(null);
    qc.invalidateQueries({ queryKey: ['fotos', itemId] });
    qc.invalidateQueries({ queryKey: ['historico', itemId] });
    const ok = arquivos.length - falhas;
    if (ok) notifications.show({ color: 'green', message: ok === 1 ? 'Foto adicionada' : `${ok} fotos adicionadas` });
  };

  const atual = aberta === null ? null : fotos[aberta];

  const excluir = (f: ItemFoto) =>
    modals.openConfirmModal({
      title: 'Excluir foto?',
      children: <Text size="sm">Adicionada em {fmtDataHora(f.createdAt)} por {f.usuario}.</Text>,
      labels: { confirm: 'Excluir', cancel: 'Cancelar' },
      confirmProps: { color: 'red' },
      onConfirm: async () => {
        try {
          await api(`/api/itens/${itemId}/fotos/${f.id}`, { method: 'DELETE' });
          setAberta(null);
          qc.invalidateQueries({ queryKey: ['fotos', itemId] });
          qc.invalidateQueries({ queryKey: ['historico', itemId] });
        } catch (err) {
          notifications.show({ color: 'red', message: mensagemErro(err) });
        }
      },
    });

  const navegar = (passo: number) => setAberta((a) => (a === null ? a : (a + passo + fotos.length) % fotos.length));

  return (
    <Stack>
      {/* capture="environment" abre direto a câmera traseira no celular; no desktop vira seletor de arquivo */}
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" hidden onChange={enviar} />
      <input ref={galeriaRef} type="file" accept="image/*" multiple hidden onChange={enviar} />
      <Group grow={mobile} gap="xs">
        <Button size={mobile ? 'lg' : 'sm'} leftSection={<IconCamera size={20} />} onClick={() => cameraRef.current?.click()} disabled={!!envio}>
          Tirar foto
        </Button>
        <Button
          size={mobile ? 'lg' : 'sm'}
          variant="default"
          leftSection={<IconPhotoPlus size={20} />}
          onClick={() => galeriaRef.current?.click()}
          disabled={!!envio}
        >
          Galeria
        </Button>
      </Group>

      {envio && (
        <Stack gap={4}>
          <Text size="sm">
            Enviando {Math.min(envio.feitas + 1, envio.total)} de {envio.total}…
          </Text>
          <Progress value={(envio.feitas / envio.total) * 100} animated />
        </Stack>
      )}

      {isLoading ? (
        <Center p="xl">
          <Loader />
        </Center>
      ) : !fotos.length ? (
        <Alert variant="light" icon={<IconPhoto size={18} />}>
          Nenhuma foto. Use “Tirar foto” para registrar o item (cadeira, suporte, etiqueta de patrimônio…).
        </Alert>
      ) : (
        <SimpleGrid cols={{ base: 2, xs: 3, sm: 4, lg: 6 }} spacing="xs">
          {fotos.map((f, i) => (
            <Card key={f.id} withBorder p={0} style={{ cursor: 'pointer', overflow: 'hidden' }} onClick={() => setAberta(i)}>
              <Image src={src(f)} alt={`Foto ${f.id}`} loading="lazy" style={{ aspectRatio: '1', objectFit: 'cover' }} />
              <Text size="xs" c="dimmed" px={6} py={4}>
                {fmtDataHora(f.createdAt)}
              </Text>
            </Card>
          ))}
        </SimpleGrid>
      )}

      <Modal
        opened={!!atual}
        onClose={() => setAberta(null)}
        fullScreen={mobile}
        size="xl"
        title={atual ? `Foto ${aberta! + 1} de ${fotos.length}` : ''}
        padding={mobile ? 'xs' : 'md'}
      >
        {atual && (
          <Stack gap="xs">
            <div style={{ position: 'relative' }}>
              <Image src={src(atual)} alt={`Foto ${atual.id}`} fit="contain" mah={mobile ? 'calc(100dvh - 190px)' : '70vh'} />
              {fotos.length > 1 && (
                <>
                  <ActionIcon
                    variant="filled"
                    color="dark"
                    size="xl"
                    radius="xl"
                    style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', opacity: 0.7 }}
                    onClick={() => navegar(-1)}
                    aria-label="Anterior"
                  >
                    <IconChevronLeft />
                  </ActionIcon>
                  <ActionIcon
                    variant="filled"
                    color="dark"
                    size="xl"
                    radius="xl"
                    style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', opacity: 0.7 }}
                    onClick={() => navegar(1)}
                    aria-label="Próxima"
                  >
                    <IconChevronRight />
                  </ActionIcon>
                </>
              )}
            </div>
            <Group justify="space-between" wrap="nowrap" align="flex-end">
              <div>
                <Text size="sm">Adicionada em {fmtDataHora(atual.createdAt)}</Text>
                <Text size="xs" c="dimmed">
                  {atual.usuario} · {atual.largura}×{atual.altura} · {fmtTamanho(atual.tamanhoBytes)}
                </Text>
              </div>
              <Button variant="subtle" color="red" leftSection={<IconTrash size={16} />} onClick={() => excluir(atual)}>
                Excluir
              </Button>
            </Group>
          </Stack>
        )}
      </Modal>
    </Stack>
  );
}
