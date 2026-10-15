'use client';

import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Card,
  Center,
  Code,
  Collapse,
  Group,
  Loader,
  Paper,
  Portal,
  Text,
  Tooltip,
  useMantineColorScheme,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import {
  IconAlertTriangle,
  IconArrowsMove,
  IconCode,
  IconCopy,
  IconDownload,
  IconFocus2,
  IconMaximize,
  IconMinimize,
  IconPhoto,
  IconZoomIn,
  IconZoomOut,
  IconZoomReset,
} from '@tabler/icons-react';
import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react';

type MermaidViewerProps = {
  code: string;
  controlesExtras?: ReactNode;
  titulo?: string;
};

/**
 * Visualizador Mermaid interativo de alta precisão:
 * - Canvas interativo com Pan (arrastar com o mouse) e Wheel Zoom suave
 * - Ajuste automático à tela (Fit to View)
 * - Modo Tela Cheia imersivo para inspeção de grandes diagramas de rede
 * - Exportação de SVG vetorial e PNG em alta definição (2x retina)
 * - Renderização compatível com HTML Labels modernos e tema dark/light
 */
export function MermaidViewer({ code, controlesExtras, titulo }: MermaidViewerProps) {
  const baseId = useId().replace(/[^a-zA-Z0-9]/g, '');
  const { colorScheme } = useMantineColorScheme();
  const isDark = colorScheme === 'dark';

  const [svg, setSvg] = useState<string>('');
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);

  // Estados de visualização do canvas
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 20, y: 20 });
  const [isDragging, setIsDragging] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const [verCodigo, { toggle: toggleCodigo }] = useDisclosure(false);

  const viewportRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const dragStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const panStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const svgRef = useRef<string>('');
  svgRef.current = svg;

  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;

  // Ajusta o diagrama para caber no viewport atual (sem dependência de zoom para evitar loops)
  const ajustarTela = useCallback(() => {
    if (!viewportRef.current || !contentRef.current) return;
    const svgEl = contentRef.current.querySelector('svg');
    if (!svgEl) return;

    const vpW = viewportRef.current.clientWidth;
    const vpH = viewportRef.current.clientHeight;

    // Mede as dimensões reais do SVG a partir do viewBox
    let svgW = 0;
    let svgH = 0;

    const vb = svgEl.viewBox?.baseVal;
    if (vb && vb.width > 0 && vb.height > 0) {
      svgW = vb.width;
      svgH = vb.height;
    } else {
      const vbAttr = svgEl.getAttribute('viewBox');
      if (vbAttr) {
        const parts = vbAttr.split(/[\s,]+/).map(Number);
        if (parts.length === 4 && parts[2] > 0 && parts[3] > 0) {
          svgW = parts[2];
          svgH = parts[3];
        }
      }
    }

    if (svgW <= 0 || svgH <= 0) {
      svgW = svgEl.getBoundingClientRect().width / (zoomRef.current || 1);
      svgH = svgEl.getBoundingClientRect().height / (zoomRef.current || 1);
    }

    if (svgW <= 0 || svgH <= 0 || vpW <= 0 || vpH <= 0) return;

    const padding = 48;
    const scaleX = (vpW - padding) / svgW;
    const scaleY = (vpH - padding) / svgH;
    const fitScale = Math.min(scaleX, scaleY, 1.2);
    const finalZoom = Math.max(fitScale, 0.15);

    setZoom(finalZoom);
    setPan({
      x: Math.max((vpW - svgW * finalZoom) / 2, 20),
      y: Math.max((vpH - svgH * finalZoom) / 2, 20),
    });
  }, []);

  // Zoom centralizado para botões (+ e -)
  const aplicarZoomComCentro = useCallback((fator: number) => {
    if (!viewportRef.current) return;
    const vpW = viewportRef.current.clientWidth;
    const vpH = viewportRef.current.clientHeight;
    const centerX = vpW / 2;
    const centerY = vpH / 2;

    setZoom((prevZoom) => {
      const novoZoom = Math.min(Math.max(prevZoom * fator, 0.15), 4.5);
      setPan((prevPan) => ({
        x: centerX - (centerX - prevPan.x) * (novoZoom / prevZoom),
        y: centerY - (centerY - prevPan.y) * (novoZoom / prevZoom),
      }));
      return novoZoom;
    });
  }, []);

  // Renderiza o diagrama via Mermaid com debounce
  useEffect(() => {
    let cancelado = false;
    setCarregando(true);
    setErro(null);

    (async () => {
      try {
        const mermaid = (await import('mermaid')).default;
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: 'loose', // Permite estilização rica dos cards HTML
          maxTextSize: 1000000, // Permite diagramas com centenas de servidores
          theme: isDark ? 'dark' : 'default',
          flowchart: {
            htmlLabels: true,
            useMaxWidth: false,
            curve: 'basis',
          },
        });

        // Gera ID único para evitar colisão no DOM do Mermaid
        const uniqueId = `m_${baseId}_${Date.now()}`;
        const { svg: svgGerado } = await mermaid.render(uniqueId, code);

        if (!cancelado) {
          setSvg(svgGerado);
          // Auto-ajusta o diagrama na tela apenas no primeiro carregamento do código
          setTimeout(() => {
            if (!cancelado) ajustarTela();
          }, 60);
        }
      } catch (e) {
        if (!cancelado) {
          setErro(e instanceof Error ? e.message : String(e));
        }
      } finally {
        if (!cancelado) setCarregando(false);
      }
    })();

    return () => {
      cancelado = true;
    };
  }, [code, isDark, baseId, ajustarTela]);

  // Manipulação de Pan (arrastar com botão esquerdo)
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return; // Apenas botão esquerdo
    setIsDragging(true);
    dragStartRef.current = { x: e.clientX, y: e.clientY };
    panStartRef.current = { ...pan };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    const dx = e.clientX - dragStartRef.current.x;
    const dy = e.clientY - dragStartRef.current.y;
    setPan({
      x: panStartRef.current.x + dx,
      y: panStartRef.current.y + dy,
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  // Zoom suave com roda do mouse centrado no cursor
  const handleWheel = (e: React.WheelEvent) => {
    if (!viewportRef.current) return;
    e.preventDefault();

    const rect = viewportRef.current.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const fatorZoom = e.deltaY < 0 ? 1.15 : 0.87;
    const novoZoom = Math.min(Math.max(zoom * fatorZoom, 0.15), 4.5);

    // Mantém o ponto sob o mouse estático
    const novoPanX = mouseX - (mouseX - pan.x) * (novoZoom / zoom);
    const novoPanY = mouseY - (mouseY - pan.y) * (novoZoom / zoom);

    setZoom(novoZoom);
    setPan({ x: novoPanX, y: novoPanY });
  };

  // Teclado: ESC sai do modo tela cheia
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isFullscreen) {
        setIsFullscreen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isFullscreen]);

  const copiarCodigo = async () => {
    await navigator.clipboard.writeText(code);
    notifications.show({ color: 'teal', message: 'Código Mermaid copiado com sucesso!' });
  };

  const baixarSvg = () => {
    if (!svgRef.current) return;
    const blob = new Blob([svgRef.current], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `topologia-servidores-${new Date().toISOString().slice(0, 10)}.svg`;
    a.click();
    URL.revokeObjectURL(url);
    notifications.show({ color: 'teal', message: 'Download do SVG iniciado' });
  };

  const baixarPng = () => {
    if (!svgRef.current) return;
    try {
      const svgBlob = new Blob([svgRef.current], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(svgBlob);
      const img = new Image();

      img.onload = () => {
        const escala = 2; // Alta resolução (2x)
        const canvas = document.createElement('canvas');
        canvas.width = img.width * escala;
        canvas.height = img.height * escala;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Fundo com a cor do tema
        ctx.fillStyle = isDark ? '#0b0f19' : '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

        canvas.toBlob((blob) => {
          if (!blob) return;
          const pngUrl = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = pngUrl;
          a.download = `topologia-servidores-${new Date().toISOString().slice(0, 10)}.png`;
          a.click();
          URL.revokeObjectURL(pngUrl);
          URL.revokeObjectURL(url);
          notifications.show({ color: 'teal', message: 'PNG de alta resolução gerado!' });
        }, 'image/png');
      };
      img.src = url;
    } catch {
      notifications.show({ color: 'red', message: 'Não foi possível exportar como PNG' });
    }
  };

  // Barra de ferramentas do visualizador
  const barraFerramentas = (
    <Group justify="space-between" wrap="wrap" gap="xs">
      <Group gap={6}>
        <Tooltip label="Diminuir Zoom (-)">
          <ActionIcon
            variant="default"
            size="md"
            onClick={() => aplicarZoomComCentro(0.82)}
            aria-label="Diminuir zoom"
          >
            <IconZoomOut size={16} />
          </ActionIcon>
        </Tooltip>

        <Badge variant="outline" color="gray" size="sm" style={{ fontFamily: 'monospace', minWidth: 46 }}>
          {Math.round(zoom * 100)}%
        </Badge>

        <Tooltip label="Aumentar Zoom (+)">
          <ActionIcon
            variant="default"
            size="md"
            onClick={() => aplicarZoomComCentro(1.22)}
            aria-label="Aumentar zoom"
          >
            <IconZoomIn size={16} />
          </ActionIcon>
        </Tooltip>

        <Tooltip label="Zoom 100%">
          <ActionIcon variant="default" size="md" onClick={() => setZoom(1)} aria-label="Zoom 100%">
            <IconZoomReset size={16} />
          </ActionIcon>
        </Tooltip>

        <Tooltip label="Ajustar à Tela (Fit View)">
          <ActionIcon variant="filled" color="blue" size="md" onClick={ajustarTela} aria-label="Ajustar à tela">
            <IconFocus2 size={16} />
          </ActionIcon>
        </Tooltip>

        <Tooltip label="Mover / Arrastar canvas com o mouse">
          <Badge size="xs" variant="light" color="gray" leftSection={<IconArrowsMove size={12} />}>
            Arraste para mover
          </Badge>
        </Tooltip>
      </Group>

      <Group gap="xs">
        {controlesExtras}

        <Button size="compact-sm" variant="default" leftSection={<IconCode size={15} />} onClick={toggleCodigo}>
          Código
        </Button>
        <Button size="compact-sm" variant="default" leftSection={<IconCopy size={15} />} onClick={copiarCodigo}>
          Copiar
        </Button>
        <Button size="compact-sm" variant="default" leftSection={<IconDownload size={15} />} onClick={baixarSvg} disabled={!svg}>
          SVG
        </Button>
        <Button size="compact-sm" variant="default" leftSection={<IconPhoto size={15} />} onClick={baixarPng} disabled={!svg}>
          PNG
        </Button>
        <Tooltip label={isFullscreen ? 'Sair da tela cheia (ESC)' : 'Expandir tela cheia'}>
          <ActionIcon
            variant={isFullscreen ? 'filled' : 'default'}
            color={isFullscreen ? 'blue' : undefined}
            size="md"
            onClick={() => {
              setIsFullscreen((f) => !f);
              setTimeout(ajustarTela, 100);
            }}
            aria-label="Alternar tela cheia"
          >
            {isFullscreen ? <IconMinimize size={16} /> : <IconMaximize size={16} />}
          </ActionIcon>
        </Tooltip>
      </Group>
    </Group>
  );

  const conteudoCanvas = (
    <>
      {barraFerramentas}

      <Collapse in={verCodigo}>
        <Code block my="xs" style={{ maxHeight: 240, overflow: 'auto', fontSize: 11 }}>
          {code}
        </Code>
      </Collapse>

      {erro && (
        <Alert color="red" icon={<IconAlertTriangle size={18} />} title="Falha ao renderizar o diagrama" mt="xs">
          {erro}
        </Alert>
      )}

      {carregando && (
        <Center mih={360}>
          <Group gap="sm">
            <Loader size="sm" />
            <Text size="sm" c="dimmed">
              Renderizando arquitetura com Mermaid...
            </Text>
          </Group>
        </Center>
      )}

      {!erro && (
        <div
          ref={viewportRef}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onWheel={handleWheel}
          style={{
            position: 'relative',
            width: '100%',
            height: isFullscreen ? 'calc(100vh - 100px)' : '72vh',
            minHeight: 480,
            overflow: 'hidden',
            cursor: isDragging ? 'grabbing' : 'grab',
            backgroundColor: isDark ? '#0b0f19' : '#f8fafc',
            backgroundImage: isDark
              ? 'radial-gradient(#1e293b 1px, transparent 1px)'
              : 'radial-gradient(#cbd5e1 1px, transparent 1px)',
            backgroundSize: '24px 24px',
            borderRadius: 8,
            border: `1px solid ${isDark ? '#1e293b' : '#e2e8f0'}`,
            marginTop: 8,
            userSelect: 'none',
          }}
        >
          <div
            ref={contentRef}
            style={{
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
              transformOrigin: '0 0',
              transition: isDragging ? 'none' : 'transform 0.08s ease-out',
              display: 'inline-block',
              filter: isDark ? 'drop-shadow(0 4px 12px rgba(0,0,0,0.5))' : 'drop-shadow(0 2px 8px rgba(0,0,0,0.06))',
            }}
            dangerouslySetInnerHTML={{ __html: svg }}
          />

          {/* Dica de controle no rodapé do canvas */}
          <div
            style={{
              position: 'absolute',
              bottom: 8,
              right: 12,
              pointerEvents: 'none',
              opacity: 0.6,
              fontSize: 10,
              fontFamily: 'monospace',
            }}
          >
            Arraste para mover · Roda do mouse para zoom · Esc sai da tela cheia
          </div>
        </div>
      )}
    </>
  );

  if (isFullscreen) {
    return (
      <Portal>
        <Paper
          p="md"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
            backgroundColor: isDark ? '#080c14' : '#ffffff',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {titulo && (
            <Group justify="space-between" mb="xs">
              <Text fw={700} size="md">
                {titulo}
              </Text>
              <Badge color="blue" variant="light">
                Modo Tela Cheia
              </Badge>
            </Group>
          )}
          {conteudoCanvas}
        </Paper>
      </Portal>
    );
  }

  return (
    <Card withBorder padding="sm" radius="md">
      {conteudoCanvas}
    </Card>
  );
}
