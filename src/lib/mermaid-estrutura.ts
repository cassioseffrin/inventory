// Gera o código Mermaid para a infraestrutura de servidores e inventário completo,
// com links interativos diretos para o Inventário de TI (/inventario/[id]),
// agrupamento dinâmico por Função (MSF), Tipo de Equipamento (Inventário) ou Setor,
// e detecção visual de Shadow IT.

export type Porta = { port: number; proto: string; name: string | null };
export type Categoria = 'ad' | 'banco' | 'web';

export type InfoInventario = {
  itemId: number;
  numeroPatrimonio: string;
  patrimonioProvisorio?: boolean;
  tipo?: string;
  status?: string;
  setor?: string | null;
  localizacao?: string | null;
  responsavel?: string | null;
  modelo?: string | null;
  fabricante?: string | null;
};

export type Servidor = {
  id: number;
  address: string;
  mac?: string | null;
  name: string | null;
  os: string | null;
  workspace: string | null;
  state: string | null;
  updatedAt: string | null;
  categoria: Categoria;
  portas: Porta[];
  origem?: 'msf' | 'inventario';
  inventario?: InfoInventario | null;
};

export type Grupo = { categoria: Categoria; label: string; servidores: Servidor[] };

export type GrupoPersonalizado = {
  chave: string;
  label: string;
  icone: string;
  cor: string;
  servidores: Servidor[];
};

export type ResumoInventario = {
  total: number;
  inventariados: number;
  shadowIt: number;
  totalApenasInventario?: number;
};

export type Estrutura = {
  grupos: Grupo[];
  gruposTipo?: GrupoPersonalizado[];
  gruposSetor?: GrupoPersonalizado[];
  total: number;
  geradoEm: string;
  resumoInventario?: ResumoInventario;
};

export type TipoVisao = 'topologia' | 'grade' | 'subrede';
export type DensidadeNo = 'compacto' | 'detalhado';
export type DirecaoLayout = 'TB' | 'LR';
export type FiltroInventario = 'todos' | 'inventariados' | 'shadow_it';
export type CriterioAgrupamento = 'funcao' | 'tipo_inventario' | 'setor';

export type OpcoesMermaid = {
  visao?: TipoVisao;
  densidade?: DensidadeNo;
  direcao?: DirecaoLayout;
  categoriaFiltro?: string;
  criterioAgrupamento?: CriterioAgrupamento;
  filtroInventario?: FiltroInventario;
  filtroTexto?: string;
  isDark?: boolean;
};

const CORES_CATEGORIA: Record<
  string,
  {
    nome: string;
    icone: string;
    accent: string;
    border: string;
    pillBgDark: string;
    pillBgLight: string;
    pillTextDark: string;
    pillTextLight: string;
  }
> = {
  ad: {
    nome: 'Active Directory & Identidade',
    icone: '🏢',
    accent: '#f59e0b',
    border: '#d97706',
    pillBgDark: 'rgba(245, 158, 11, 0.25)',
    pillBgLight: '#fef3c7',
    pillTextDark: '#fbbf24',
    pillTextLight: '#b45309',
  },
  banco: {
    nome: 'Bancos de Dados & Storage',
    icone: '🗄️',
    accent: '#10b981',
    border: '#059669',
    pillBgDark: 'rgba(16, 185, 129, 0.25)',
    pillBgLight: '#d1fae5',
    pillTextDark: '#34d399',
    pillTextLight: '#047857',
  },
  web: {
    nome: 'Aplicações & Web Services',
    icone: '🚀',
    accent: '#0ea5e9',
    border: '#0284c7',
    pillBgDark: 'rgba(14, 165, 233, 0.25)',
    pillBgLight: '#e0f2fe',
    pillTextDark: '#38bdf8',
    pillTextLight: '#0369a1',
  },
  servidor: {
    nome: 'Servidores',
    icone: '🖥️',
    accent: '#0ea5e9',
    border: '#0284c7',
    pillBgDark: 'rgba(14, 165, 233, 0.25)',
    pillBgLight: '#e0f2fe',
    pillTextDark: '#38bdf8',
    pillTextLight: '#0369a1',
  },
  desktop: {
    nome: 'Desktops / Estações',
    icone: '💻',
    accent: '#6366f1',
    border: '#4f46e5',
    pillBgDark: 'rgba(99, 102, 241, 0.25)',
    pillBgLight: '#eef2ff',
    pillTextDark: '#818cf8',
    pillTextLight: '#4338ca',
  },
  impressora: {
    nome: 'Impressoras',
    icone: '🖨️',
    accent: '#06b6d4',
    border: '#0891b2',
    pillBgDark: 'rgba(6, 182, 212, 0.25)',
    pillBgLight: '#ecfeff',
    pillTextDark: '#22d3ee',
    pillTextLight: '#0e7490',
  },
  switch: {
    nome: 'Switches e Roteadores',
    icone: '🔀',
    accent: '#a855f7',
    border: '#7e22ce',
    pillBgDark: 'rgba(168, 85, 247, 0.25)',
    pillBgLight: '#faf5ff',
    pillTextDark: '#c084fc',
    pillTextLight: '#6b21a8',
  },
  outro: {
    nome: 'Outros Dispositivos',
    icone: '📱',
    accent: '#64748b',
    border: '#475569',
    pillBgDark: 'rgba(100, 116, 139, 0.25)',
    pillBgLight: '#f1f5f9',
    pillTextDark: '#94a3b8',
    pillTextLight: '#334155',
  },
};

/** Escapa texto para HTML seguro dentro de nós Mermaid. */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Limpa rótulos de nós para sintaxe do Mermaid. */
function limparTexto(str: string): string {
  return str.replace(/["[\]{}|<>]/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Formata um card de servidor interativo com link clicável para abrir no Inventário. */
function renderCardServidor(s: Servidor, densidade: DensidadeNo = 'compacto', isDark = true): string {
  const chaveEstilo = s.inventario?.tipo ?? s.categoria;
  const cat = CORES_CATEGORIA[chaveEstilo] ?? CORES_CATEGORIA.web;
  const isAlive = s.state === 'alive';
  const statusColor = isAlive ? '#10b981' : '#64748b';
  const statusLabel = isAlive ? 'ON' : 'OFF';

  const maxPortas = densidade === 'compacto' ? 4 : 8;
  const portasVisiveis = s.portas.slice(0, maxPortas);
  const portasRestantes = s.portas.length - maxPortas;

  const pillBg = isDark ? cat.pillBgDark : cat.pillBgLight;
  const pillColor = isDark ? cat.pillTextDark : cat.pillTextLight;
  const textColor = isDark ? '#f8fafc' : '#0f172a';
  const subTextColor = isDark ? '#94a3b8' : '#64748b';

  // Badges de portas
  const pills = portasVisiveis
    .map(
      (p) =>
        `<span style='background:${pillBg};color:${pillColor};border:1px solid ${cat.border};font:600 8px monospace;padding:0 3px;border-radius:2px;'>${p.port}/${escapeHtml(
          p.name ? p.name.slice(0, 6) : p.proto
        )}</span>`
    )
    .join('');

  const restantePill =
    portasRestantes > 0
      ? `<span style='background:rgba(148,163,184,0.2);color:${subTextColor};font:8px monospace;padding:0 3px;border-radius:2px;'>+${portasRestantes}</span>`
      : '';

  // Badge do Inventário com link clicável
  const inv = s.inventario;
  let badgeInventario = '';
  if (inv) {
    const pat = escapeHtml(inv.numeroPatrimonio);
    badgeInventario = `<a href='/inventario/${inv.itemId}' target='_blank' style='text-decoration:none;' title='Abrir item ${pat} no inventário'>` +
      `<span style='background:rgba(59,130,246,0.25);border:1px solid #3b82f6;color:${isDark ? '#93c5fd' : '#1d4ed8'};font:700 8.5px monospace;padding:0 4px;border-radius:2px;cursor:pointer;'>🏷️ ${pat} ↗</span>` +
      `</a>`;
  } else {
    badgeInventario = `<span style='background:rgba(239,68,68,0.2);border:1px solid #ef4444;color:${isDark ? '#fca5a5' : '#b91c1c'};font:700 8px sans-serif;padding:0 3px;border-radius:2px;'>🚨 Shadow IT</span>`;
  }

  // Linha descritiva (OS, Setor, Responsável)
  const osClean = s.os ? escapeHtml(s.os.slice(0, 18)) : '';
  const nameClean = s.name ? escapeHtml(s.name.slice(0, 16)) : '';
  const setorClean = inv?.setor ? `📍 ${escapeHtml(inv.setor.slice(0, 14))}` : '';
  const respClean = inv?.responsavel ? `👤 ${escapeHtml(inv.responsavel.slice(0, 14))}` : '';

  const partesDesc = [nameClean || osClean];
  if (setorClean) partesDesc.push(setorClean);
  if (densidade === 'detalhado' && respClean) partesDesc.push(respClean);
  const desc = partesDesc.filter(Boolean).join(' · ');

  const conteudoRodape = pills
    ? `${pills}${restantePill}`
    : `<span style='background:rgba(148,163,184,0.15);font:600 8px sans-serif;padding:0 4px;border-radius:2px;color:${subTextColor};'>${escapeHtml(inv?.tipo ?? 'equipamento')}</span>`;

  const minW = densidade === 'compacto' ? '165px' : '205px';
  const maxW = densidade === 'compacto' ? '215px' : '265px';

  return `<div style='text-align:left;min-width:${minW};max-width:${maxW};padding:1px 2px;font:11px system-ui;'>` +
    `<div style='display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid rgba(148,163,184,0.2);padding-bottom:2px;margin-bottom:2px;gap:4px;'>` +
    `<span style='font:700 11px monospace;color:${textColor};'>🖥️ ${escapeHtml(s.address)}</span>` +
    `<div style='display:flex;align-items:center;gap:3px;'>` +
    badgeInventario +
    `<span style='background:${statusColor};color:#fff;font:700 7px sans-serif;padding:0 3px;border-radius:5px;'>${statusLabel}</span>` +
    `</div>` +
    `</div>` +
    (desc ? `<div style='font-size:9px;color:${subTextColor};margin-bottom:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;'>${desc}</div>` : '') +
    `<div style='display:flex;flex-wrap:wrap;gap:2px;'>${conteudoRodape}</div>` +
    `</div>`;
}

/** Extrai o prefixo de sub-rede /24 do endereço IP. */
function obterSubrede(ip: string): string {
  const partes = ip.split('.');
  if (partes.length === 4) {
    return `${partes[0]}.${partes[1]}.${partes[2]}.0/24`;
  }
  return 'Rede Geral';
}

/** Configuração base do tema Mermaid. */
function gerarDiretivaTema(isDark = true): string {
  return `%%{init: {
  "maxTextSize": 1000000,
  "theme": "base",
  "themeVariables": {
    "primaryColor": "${isDark ? '#1e293b' : '#ffffff'}",
    "primaryTextColor": "${isDark ? '#f8fafc' : '#0f172a'}",
    "primaryBorderColor": "${isDark ? '#475569' : '#cbd5e1'}",
    "lineColor": "${isDark ? '#38bdf8' : '#0284c7'}",
    "secondaryColor": "${isDark ? '#0f172a' : '#f8fafc'}",
    "tertiaryColor": "${isDark ? '#1e293b' : '#f1f5f9'}",
    "mainBkg": "${isDark ? '#0b0f19' : '#ffffff'}",
    "nodeBorder": "${isDark ? '#334155' : '#cbd5e1'}",
    "clusterBkg": "${isDark ? 'rgba(15, 23, 42, 0.7)' : 'rgba(248, 250, 252, 0.8)'}",
    "clusterBorder": "${isDark ? '#334155' : '#cbd5e1'}",
    "titleColor": "${isDark ? '#f8fafc' : '#0f172a'}",
    "edgeLabelBackground": "${isDark ? '#1e293b' : '#ffffff'}",
    "fontFamily": "Inter, system-ui, -apple-system, sans-serif",
    "fontSize": "11px"
  }
}}%%`;
}

/** Gera a classe de estilo para os nós de servidor. */
function gerarClassDefs(isDark = true): string[] {
  return [
    `classDef ad fill:${isDark ? '#1e1c16' : '#fffbeb'},stroke:#f59e0b,stroke-width:1.5px,color:${isDark ? '#f8fafc' : '#0f172a'};`,
    `classDef banco fill:${isDark ? '#0e1f1a' : '#ecfdf5'},stroke:#10b981,stroke-width:1.5px,color:${isDark ? '#f8fafc' : '#0f172a'};`,
    `classDef web fill:${isDark ? '#0f1c2e' : '#f0f9ff'},stroke:#0ea5e9,stroke-width:1.5px,color:${isDark ? '#f8fafc' : '#0f172a'};`,
    `classDef servidor fill:${isDark ? '#0f1c2e' : '#f0f9ff'},stroke:#0ea5e9,stroke-width:1.5px,color:${isDark ? '#f8fafc' : '#0f172a'};`,
    `classDef desktop fill:${isDark ? '#1a1936' : '#eef2ff'},stroke:#6366f1,stroke-width:1.5px,color:${isDark ? '#f8fafc' : '#0f172a'};`,
    `classDef impressora fill:${isDark ? '#0e2329' : '#ecfeff'},stroke:#06b6d4,stroke-width:1.5px,color:${isDark ? '#f8fafc' : '#0f172a'};`,
    `classDef switchEquip fill:${isDark ? '#231530' : '#faf5ff'},stroke:#a855f7,stroke-width:1.5px,color:${isDark ? '#f8fafc' : '#0f172a'};`,
    `classDef outro fill:${isDark ? '#1e293b' : '#f1f5f9'},stroke:#64748b,stroke-width:1.5px,color:${isDark ? '#f8fafc' : '#0f172a'};`,
    `classDef gateway fill:${isDark ? '#1e1b4b' : '#ede9fe'},stroke:#8b5cf6,stroke-width:2px,color:${isDark ? '#f8fafc' : '#0f172a'};`,
    `classDef summary fill:${isDark ? '#0f172a' : '#f8fafc'},stroke:#64748b,stroke-width:1px,color:${isDark ? '#94a3b8' : '#475569'};`,
  ];
}

/** Gera a classe CSS apropriada para o nó. */
function obterClasseNo(s: Servidor, criterio: CriterioAgrupamento): string {
  if (criterio === 'tipo_inventario') {
    const t = s.inventario?.tipo;
    if (t === 'switch') return 'switchEquip';
    if (t === 'desktop' || t === 'notebook') return 'desktop';
    if (t === 'impressora') return 'impressora';
    if (t === 'servidor') return 'servidor';
    return 'outro';
  }
  return s.categoria;
}

/** Filtra servidores com base nos filtros de inventário e busca textual. */
function filtrarServidores(servidores: Servidor[], opcoes: OpcoesMermaid): Servidor[] {
  const { filtroInventario = 'todos', filtroTexto = '' } = opcoes;
  const term = filtroTexto.trim().toLowerCase();

  return servidores.filter((s) => {
    if (filtroInventario === 'inventariados' && !s.inventario) return false;
    if (filtroInventario === 'shadow_it' && s.inventario) return false;

    if (!term) return true;
    return (
      s.address.toLowerCase().includes(term) ||
      (s.name && s.name.toLowerCase().includes(term)) ||
      (s.os && s.os.toLowerCase().includes(term)) ||
      (s.inventario?.numeroPatrimonio && s.inventario.numeroPatrimonio.toLowerCase().includes(term)) ||
      (s.inventario?.setor && s.inventario.setor.toLowerCase().includes(term)) ||
      (s.inventario?.responsavel && s.inventario.responsavel.toLowerCase().includes(term)) ||
      (s.inventario?.tipo && s.inventario.tipo.toLowerCase().includes(term)) ||
      (s.inventario?.modelo && s.inventario.modelo.toLowerCase().includes(term)) ||
      s.portas.some((p) => String(p.port).includes(term) || (p.name && p.name.toLowerCase().includes(term)))
    );
  });
}

/** Adiciona eventos de clique interativos nos nós do Mermaid para abrir o inventário diretamente. */
function adicionarCliquesInterativos(linhas: string[], servidores: Servidor[]) {
  const adicionados = new Set<number>();
  for (const s of servidores) {
    if (s.inventario?.itemId && !adicionados.has(s.id)) {
      adicionados.add(s.id);
      const pat = limparTexto(s.inventario.numeroPatrimonio);
      linhas.push(`  click srv_${s.id} href "/inventario/${s.inventario.itemId}" "Abrir ${pat} no Inventário" _blank`);
    }
  }
}

/**
 * 1. VISÃO TOPOLOGIA (Padrão Executivo):
 * Mostra o diagrama arquitetural completo conectado ao Gateway e Zonas do Inventário.
 */
function gerarVisaoTopologia(estrutura: Estrutura, opcoes: OpcoesMermaid): string {
  const { isDark = true, direcao = 'TB', densidade = 'compacto' } = opcoes;
  const linhas: string[] = [gerarDiretivaTema(isDark), `flowchart ${direcao}`];
  linhas.push(...gerarClassDefs(isDark));

  const todosServidores = estrutura.grupos.flatMap((g) => g.servidores);
  const provavelGateway =
    todosServidores.find((s) => s.address.endsWith('.1')) ?? todosServidores[0];
  const ipGateway = provavelGateway ? provavelGateway.address : '192.168.50.1';

  const subredes = Array.from(new Set(todosServidores.map((s) => obterSubrede(s.address))));
  const subredePrincipal = subredes[0] ?? '192.168.50.0/24';

  const resumo = estrutura.resumoInventario ?? {
    total: estrutura.total,
    inventariados: todosServidores.filter((s) => Boolean(s.inventario)).length,
    shadowIt: todosServidores.filter((s) => !s.inventario).length,
  };

  linhas.push(
    `  GW["<div style='padding:6px 12px;min-width:220px;text-align:center;'>` +
      `<div style='font-size:13px;font-weight:700;'>🌐 Borda de Rede &amp; Gateway</div>` +
      `<div style='font-size:11px;font-family:monospace;color:#a855f7;margin-top:2px;'>${ipGateway} · Segmento ${subredePrincipal}</div>` +
      `<div style='font-size:9.5px;color:#94a3b8;margin-top:3px;'>${resumo.inventariados} Inventariados · ${resumo.shadowIt} Shadow IT</div>` +
      `</div>"]:::gateway`
  );

  linhas.push(`  subgraph INFRA ["🏰 Zonas de Infraestrutura &amp; Inventário"]`);
  linhas.push(`    direction LR`);

  const descricaoPortas: Record<Categoria, string> = {
    ad: 'Kerberos 88 · LDAP 389/636 · SMB 445 · DNS 53',
    banco: 'PostgreSQL 5432 · MSSQL 1433 · MySQL 3306',
    web: 'HTTP 80/443 · SSH 22 · Aplicações Web',
  };

  const servidoresRenderizados: Servidor[] = [];

  for (const grupo of estrutura.grupos) {
    const cat = CORES_CATEGORIA[grupo.categoria];
    const servidoresFiltrados = filtrarServidores(grupo.servidores, opcoes);
    const totalGrupo = servidoresFiltrados.length;
    const sgId = `SG_${grupo.categoria.toUpperCase()}`;
    const hubId = `hub_${grupo.categoria}`;

    linhas.push(`    subgraph ${sgId} ["${cat.icone} ${cat.nome} (${totalGrupo})"]`);
    linhas.push(`      direction TB`);

    linhas.push(
      `      ${hubId}["<div style='padding:4px 8px;text-align:center;min-width:180px;'>` +
        `<div style='font-weight:700;font-size:12px;'>${cat.icone} ${cat.nome}</div>` +
        `<div style='font-size:9px;color:${isDark ? '#94a3b8' : '#64748b'};margin-top:2px;'>${descricaoPortas[grupo.categoria]}</div>` +
        `</div>"]:::${grupo.categoria}`
    );

    const destaques = servidoresFiltrados.slice(0, 3);
    for (const s of destaques) {
      servidoresRenderizados.push(s);
      linhas.push(`      srv_${s.id}["${renderCardServidor(s, densidade, isDark)}"]:::${s.categoria}`);
    }

    if (totalGrupo > 3) {
      const restantes = totalGrupo - 3;
      linhas.push(
        `      res_${grupo.categoria}["<div style='font-size:10px;text-align:center;padding:4px 8px;'>📦 +${restantes} servidores adicionais</div>"]:::summary`
      );
    }

    linhas.push(`    end`);
  }

  linhas.push(`  end`);

  const temWeb = estrutura.grupos.some((g) => g.categoria === 'web');
  const temAd = estrutura.grupos.some((g) => g.categoria === 'ad');
  const temBanco = estrutura.grupos.some((g) => g.categoria === 'banco');

  if (temWeb) linhas.push(`  GW ==>|"Tráfego Ingress e Web"| hub_web`);
  if (temAd) linhas.push(`  GW ==>|"Administração e Políticas"| hub_ad`);
  if (temWeb && temAd) linhas.push(`  hub_web -.->|"Autenticação LDAP e Kerberos"| hub_ad`);
  if (temWeb && temBanco) linhas.push(`  hub_web ==>|"Consultas e Pools SQL"| hub_banco`);

  // Adiciona cliques para abrir o item no inventário
  adicionarCliquesInterativos(linhas, servidoresRenderizados);

  return linhas.join('\n');
}

/**
 * 2. VISÃO GRADE DE RACKS EM MATRIZ LIGADA AO INVENTÁRIO:
 * Permite organizar em matriz tanto por Função de Portas quanto por Tipo de Equipamento (Inventário)
 * ou Setor da Empresa, com links clicáveis diretamente para cada equipamento no inventário.
 */
function gerarVisaoGrade(estrutura: Estrutura, opcoes: OpcoesMermaid): string {
  const {
    isDark = true,
    direcao = 'TB',
    densidade = 'compacto',
    categoriaFiltro = 'todas',
    criterioAgrupamento = 'funcao',
  } = opcoes;

  const linhas: string[] = [gerarDiretivaTema(isDark), `flowchart ${direcao}`];
  linhas.push(...gerarClassDefs(isDark));

  // Seleciona a fonte de grupos conforme o critério (Função, Tipo do Inventário ou Setor)
  type GrupoGenerico = { chave: string; label: string; icone?: string; cor?: string; servidores: Servidor[] };
  let listaGrupos: GrupoGenerico[] = [];

  if (criterioAgrupamento === 'tipo_inventario' && estrutura.gruposTipo) {
    listaGrupos = estrutura.gruposTipo.map((g) => ({
      chave: g.chave,
      label: g.label,
      icone: g.icone,
      cor: g.cor,
      servidores: g.servidores,
    }));
  } else if (criterioAgrupamento === 'setor' && estrutura.gruposSetor) {
    listaGrupos = estrutura.gruposSetor.map((g) => ({
      chave: g.chave,
      label: g.label,
      icone: g.icone,
      cor: g.cor,
      servidores: g.servidores,
    }));
  } else {
    listaGrupos = estrutura.grupos.map((g) => ({
      chave: g.categoria,
      label: g.label,
      icone: CORES_CATEGORIA[g.categoria]?.icone ?? '🖥️',
      cor: g.categoria,
      servidores: g.servidores,
    }));
  }

  const gruposFiltrados = listaGrupos
    .filter((g) => categoriaFiltro === 'todas' || g.chave === categoriaFiltro)
    .map((g) => ({
      ...g,
      servidores: filtrarServidores(g.servidores, opcoes),
    }))
    .filter((g) => g.servidores.length > 0);

  if (gruposFiltrados.length === 0) {
    linhas.push(
      `  VAZIO["🔍 Nenhum equipamento encontrado para os filtros selecionados"]:::summary`
    );
    return linhas.join('\n');
  }

  const SERVIDORES_POR_RACK = 5;
  const RACKS_POR_LINHA = 4;
  const servidoresRenderizados: Servidor[] = [];

  for (const grupo of gruposFiltrados) {
    const icone = grupo.icone ?? '🖥️';
    const sgCatId = `CAT_${limparTexto(grupo.chave).toUpperCase()}`;

    linhas.push(`  subgraph ${sgCatId} ["${icone} ${limparTexto(grupo.label)} (${grupo.servidores.length})"]`);
    linhas.push(`    direction TB`);

    const servidores = grupo.servidores;
    const totalRacks = Math.ceil(servidores.length / SERVIDORES_POR_RACK);
    const totalLinhas = Math.ceil(totalRacks / RACKS_POR_LINHA);

    for (let l = 0; l < totalLinhas; l++) {
      const rowId = `ROW_${limparTexto(grupo.chave)}_${l + 1}`;
      linhas.push(`    subgraph ${rowId} ["Racks ${l * RACKS_POR_LINHA + 1} a ${Math.min((l + 1) * RACKS_POR_LINHA, totalRacks)}"]`);
      linhas.push(`      direction LR`);

      for (let r = l * RACKS_POR_LINHA; r < Math.min((l + 1) * RACKS_POR_LINHA, totalRacks); r++) {
        const rackId = `RACK_${limparTexto(grupo.chave)}_${r + 1}`;
        const faixa = servidores.slice(r * SERVIDORES_POR_RACK, (r + 1) * SERVIDORES_POR_RACK);
        const primeiroIp = faixa[0]?.address.split('.').pop() ?? '0';
        const ultimoIp = faixa[faixa.length - 1]?.address.split('.').pop() ?? '0';

        linhas.push(`      subgraph ${rackId} ["Rack ${r + 1} (.${primeiroIp}-.${ultimoIp})"]`);
        linhas.push(`        direction TB`);

        for (const s of faixa) {
          servidoresRenderizados.push(s);
          const classe = obterClasseNo(s, criterioAgrupamento);
          linhas.push(`        srv_${s.id}["${renderCardServidor(s, densidade, isDark)}"]:::${classe}`);
        }

        linhas.push(`      end`);
      }

      linhas.push(`    end`);
    }

    linhas.push(`  end`);
  }

  // Ativa cliques em cada nó para abrir a ficha no inventário
  adicionarCliquesInterativos(linhas, servidoresRenderizados);

  return linhas.join('\n');
}

/**
 * 3. VISÃO POR SUB-REDE EM MATRIZ:
 * Agrupa os servidores por prefixo IP /24 com links para o Inventário.
 */
function gerarVisaoSubrede(estrutura: Estrutura, opcoes: OpcoesMermaid): string {
  const { isDark = true, direcao = 'TB', densidade = 'compacto', criterioAgrupamento = 'funcao' } = opcoes;
  const linhas: string[] = [gerarDiretivaTema(isDark), `flowchart ${direcao}`];
  linhas.push(...gerarClassDefs(isDark));

  const todosServidores = filtrarServidores(estrutura.grupos.flatMap((g) => g.servidores), opcoes);
  const mapaSubredes = new Map<string, Servidor[]>();

  for (const s of todosServidores) {
    const sub = obterSubrede(s.address);
    if (!mapaSubredes.has(sub)) mapaSubredes.set(sub, []);
    mapaSubredes.get(sub)!.push(s);
  }

  let indexSub = 0;
  const SERVIDORES_POR_BLOCO = 5;
  const BLOCOS_POR_LINHA = 4;
  const servidoresRenderizados: Servidor[] = [];

  for (const [subrede, servidores] of mapaSubredes.entries()) {
    indexSub++;
    const subId = `SUB_${indexSub}`;

    linhas.push(`  subgraph ${subId} ["🖧 Sub-rede ${subrede} (${servidores.length} hosts)"]`);
    linhas.push(`    direction TB`);

    const totalBlocos = Math.ceil(servidores.length / SERVIDORES_POR_BLOCO);
    const totalLinhas = Math.ceil(totalBlocos / BLOCOS_POR_LINHA);

    for (let l = 0; l < totalLinhas; l++) {
      const rowId = `SUBROW_${indexSub}_${l + 1}`;
      linhas.push(`    subgraph ${rowId} ["Blocos ${l * BLOCOS_POR_LINHA + 1} a ${Math.min((l + 1) * BLOCOS_POR_LINHA, totalBlocos)}"]`);
      linhas.push(`      direction LR`);

      for (let b = l * BLOCOS_POR_LINHA; b < Math.min((l + 1) * BLOCOS_POR_LINHA, totalBlocos); b++) {
        const blocoId = `BLOCO_${indexSub}_${b + 1}`;
        const faixa = servidores.slice(b * SERVIDORES_POR_BLOCO, (b + 1) * SERVIDORES_POR_BLOCO);

        linhas.push(`      subgraph ${blocoId} ["Segmento ${b + 1}"]`);
        linhas.push(`        direction TB`);

        for (const s of faixa) {
          servidoresRenderizados.push(s);
          const classe = obterClasseNo(s, criterioAgrupamento);
          linhas.push(`        srv_${s.id}["${renderCardServidor(s, densidade, isDark)}"]:::${classe}`);
        }

        linhas.push(`      end`);
      }

      linhas.push(`    end`);
    }

    linhas.push(`  end`);
  }

  // Ativa cliques em cada nó para abrir a ficha no inventário
  adicionarCliquesInterativos(linhas, servidoresRenderizados);

  return linhas.join('\n');
}

/** Função principal de geração do código Mermaid. */
export function gerarMermaidEstrutura(estrutura: Estrutura, opcoes: OpcoesMermaid = {}): string {
  const visao = opcoes.visao ?? 'topologia';

  switch (visao) {
    case 'grade':
      return gerarVisaoGrade(estrutura, opcoes);
    case 'subrede':
      return gerarVisaoSubrede(estrutura, opcoes);
    case 'topologia':
    default:
      return gerarVisaoTopologia(estrutura, opcoes);
  }
}
