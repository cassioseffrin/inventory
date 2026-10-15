// Gera o código Mermaid para a infraestrutura de servidores a partir dos dados do Metasploit.
// Suporta múltiplos modos de visualização (Topologia Arquitetural, Grade de Racks em Matriz, Por Sub-rede),
// controle de densidade e alta performance para centenas de hosts.

export type Porta = { port: number; proto: string; name: string | null };
export type Categoria = 'ad' | 'banco' | 'web';
export type Servidor = {
  id: number;
  address: string;
  name: string | null;
  os: string | null;
  workspace: string | null;
  state: string | null;
  updatedAt: string | null;
  categoria: Categoria;
  portas: Porta[];
};
export type Grupo = { categoria: Categoria; label: string; servidores: Servidor[] };
export type Estrutura = { grupos: Grupo[]; total: number; geradoEm: string };

export type TipoVisao = 'topologia' | 'grade' | 'subrede';
export type DensidadeNo = 'compacto' | 'detalhado';
export type DirecaoLayout = 'TB' | 'LR';

export type OpcoesMermaid = {
  visao?: TipoVisao;
  densidade?: DensidadeNo;
  direcao?: DirecaoLayout;
  categoriaFiltro?: Categoria | 'todas';
  filtroTexto?: string;
  isDark?: boolean;
};

const CORES_CATEGORIA: Record<
  Categoria,
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

/** Formata um card de servidor com HTML visual moderno e código enxuto. */
function renderCardServidor(s: Servidor, densidade: DensidadeNo = 'compacto', isDark = true): string {
  const cat = CORES_CATEGORIA[s.categoria] ?? CORES_CATEGORIA.web;
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

  // Badges de portas em linha compacta
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

  const osClean = s.os ? escapeHtml(s.os.slice(0, 20)) : '';
  const nameClean = s.name ? escapeHtml(s.name.slice(0, 18)) : '';
  const desc = nameClean || osClean;
  const minW = densidade === 'compacto' ? '150px' : '190px';
  const maxW = densidade === 'compacto' ? '190px' : '240px';

  return `<div style='text-align:left;min-width:${minW};max-width:${maxW};padding:1px 2px;font:11px system-ui;'>` +
    `<div style='display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid rgba(148,163,184,0.2);padding-bottom:2px;margin-bottom:2px;'>` +
    `<span style='font:700 11px monospace;color:${textColor};'>🖥️ ${escapeHtml(s.address)}</span>` +
    `<span style='background:${statusColor};color:#fff;font:700 7px sans-serif;padding:0 4px;border-radius:6px;'>${statusLabel}</span>` +
    `</div>` +
    (desc ? `<div style='font-size:9px;color:${subTextColor};margin-bottom:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;'>${desc}</div>` : '') +
    `<div style='display:flex;flex-wrap:wrap;gap:2px;'>${pills}${restantePill}</div>` +
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

/** Configuração base do tema Mermaid (com maxTextSize expandido). */
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
    `classDef gateway fill:${isDark ? '#1e1b4b' : '#ede9fe'},stroke:#8b5cf6,stroke-width:2px,color:${isDark ? '#f8fafc' : '#0f172a'};`,
    `classDef summary fill:${isDark ? '#0f172a' : '#f8fafc'},stroke:#64748b,stroke-width:1px,color:${isDark ? '#94a3b8' : '#475569'};`,
  ];
}

/**
 * 1. VISÃO TOPOLOGIA (Padrão Executivo):
 * Mostra o diagrama arquitetural completo com Gateway, Zonas de Segurança/Função,
 * fluxos de tráfego (Ingress, Autenticação, Banco) e servidores de destaque.
 */
function gerarVisaoTopologia(estrutura: Estrutura, opcoes: OpcoesMermaid): string {
  const { isDark = true, direcao = 'TB', densidade = 'compacto' } = opcoes;
  const linhas: string[] = [gerarDiretivaTema(isDark), `flowchart ${direcao}`];

  linhas.push(...gerarClassDefs(isDark));

  // Acha o Gateway / Roteador (ex: .1 ou menor IP)
  const todosServidores = estrutura.grupos.flatMap((g) => g.servidores);
  const provavelGateway =
    todosServidores.find((s) => s.address.endsWith('.1')) ?? todosServidores[0];
  const ipGateway = provavelGateway ? provavelGateway.address : '192.168.50.1';

  // Sub-redes detectadas
  const subredes = Array.from(new Set(todosServidores.map((s) => obterSubrede(s.address))));
  const subredePrincipal = subredes[0] ?? '192.168.50.0/24';

  // Nó Gateway / Perímetro
  linhas.push(
    `  GW["<div style='padding:6px 12px;min-width:220px;text-align:center;'>` +
      `<div style='font-size:13px;font-weight:700;'>🌐 Borda de Rede &amp; Gateway</div>` +
      `<div style='font-size:11px;font-family:monospace;color:#a855f7;margin-top:2px;'>${ipGateway} · Segmento ${subredePrincipal}</div>` +
      `<div style='font-size:9.5px;color:#94a3b8;margin-top:3px;'>${estrutura.total} hosts mapeados no MSF</div>` +
      `</div>"]:::gateway`
  );

  linhas.push(`  subgraph INFRA ["🏰 Zonas de Serviço &amp; Infraestrutura Corporativa"]`);
  linhas.push(`    direction LR`);

  // Descrição das principais portas por zona
  const descricaoPortas: Record<Categoria, string> = {
    ad: 'Kerberos 88 · LDAP 389/636 · SMB 445 · DNS 53',
    banco: 'PostgreSQL 5432 · MSSQL 1433 · MySQL 3306',
    web: 'HTTP 80/443 · SSH 22 · Aplicações Web',
  };

  // Agrupa os servidores por categoria
  for (const grupo of estrutura.grupos) {
    const cat = CORES_CATEGORIA[grupo.categoria];
    const totalGrupo = grupo.servidores.length;
    const sgId = `SG_${grupo.categoria.toUpperCase()}`;
    const hubId = `hub_${grupo.categoria}`;

    linhas.push(`    subgraph ${sgId} ["${cat.icone} ${cat.nome} (${totalGrupo})"]`);
    linhas.push(`      direction TB`);

    // Hub / Cabeçalho da zona como nó concreto
    linhas.push(
      `      ${hubId}["<div style='padding:4px 8px;text-align:center;min-width:180px;'>` +
        `<div style='font-weight:700;font-size:12px;'>${cat.icone} ${cat.nome}</div>` +
        `<div style='font-size:9px;color:${isDark ? '#94a3b8' : '#64748b'};margin-top:2px;'>${descricaoPortas[grupo.categoria]}</div>` +
        `</div>"]:::${grupo.categoria}`
    );

    // Amostragem inteligente: destaca até 3 servidores mais relevantes do grupo
    const destaques = grupo.servidores.slice(0, 3);
    for (const s of destaques) {
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

  // Conexões e fluxos arquiteturais de rede entre nós reais com rótulos entre aspas
  const temWeb = estrutura.grupos.some((g) => g.categoria === 'web');
  const temAd = estrutura.grupos.some((g) => g.categoria === 'ad');
  const temBanco = estrutura.grupos.some((g) => g.categoria === 'banco');

  if (temWeb) {
    linhas.push(`  GW ==>|"Tráfego Ingress e Web"| hub_web`);
  }
  if (temAd) {
    linhas.push(`  GW ==>|"Administração e Políticas"| hub_ad`);
  }
  if (temWeb && temAd) {
    linhas.push(`  hub_web -.->|"Autenticação LDAP e Kerberos"| hub_ad`);
  }
  if (temWeb && temBanco) {
    linhas.push(`  hub_web ==>|"Consultas e Pools SQL"| hub_banco`);
  }

  return linhas.join('\n');
}

/**
 * 2. VISÃO GRADE DE RACKS EM MATRIZ:
 * Organiza centenas de servidores em uma matriz balanceada de Racks (ex: 4 racks por linha,
 * cada rack com 5 servidores), evitando tanto colunas verticais infinitas quanto linhas
 * horizontais gigantescas.
 */
function gerarVisaoGrade(estrutura: Estrutura, opcoes: OpcoesMermaid): string {
  const {
    isDark = true,
    direcao = 'TB',
    densidade = 'compacto',
    categoriaFiltro = 'todas',
    filtroTexto = '',
  } = opcoes;

  const linhas: string[] = [gerarDiretivaTema(isDark), `flowchart ${direcao}`];
  linhas.push(...gerarClassDefs(isDark));

  // Aplica filtro de texto se houver
  const term = filtroTexto.trim().toLowerCase();

  const gruposFiltrados = estrutura.grupos
    .filter((g) => categoriaFiltro === 'todas' || g.categoria === categoriaFiltro)
    .map((g) => ({
      ...g,
      servidores: g.servidores.filter((s) => {
        if (!term) return true;
        return (
          s.address.toLowerCase().includes(term) ||
          (s.name && s.name.toLowerCase().includes(term)) ||
          (s.os && s.os.toLowerCase().includes(term)) ||
          s.portas.some((p) => String(p.port).includes(term) || (p.name && p.name.toLowerCase().includes(term)))
        );
      }),
    }))
    .filter((g) => g.servidores.length > 0);

  if (gruposFiltrados.length === 0) {
    linhas.push(
      `  VAZIO["🔍 Nenhum servidor encontrado para os filtros selecionados"]:::summary`
    );
    return linhas.join('\n');
  }

  const SERVIDORES_POR_RACK = 5;
  const RACKS_POR_LINHA = 4;

  for (const grupo of gruposFiltrados) {
    const cat = CORES_CATEGORIA[grupo.categoria];
    const sgCatId = `CAT_${grupo.categoria.toUpperCase()}`;

    linhas.push(`  subgraph ${sgCatId} ["${cat.icone} ${limparTexto(grupo.label)} (${grupo.servidores.length})"]`);
    linhas.push(`    direction TB`);

    const servidores = grupo.servidores;
    const totalRacks = Math.ceil(servidores.length / SERVIDORES_POR_RACK);
    const totalLinhas = Math.ceil(totalRacks / RACKS_POR_LINHA);

    for (let l = 0; l < totalLinhas; l++) {
      const rowId = `ROW_${grupo.categoria}_${l + 1}`;
      linhas.push(`    subgraph ${rowId} ["Racks ${l * RACKS_POR_LINHA + 1} a ${Math.min((l + 1) * RACKS_POR_LINHA, totalRacks)}"]`);
      linhas.push(`      direction LR`);

      for (let r = l * RACKS_POR_LINHA; r < Math.min((l + 1) * RACKS_POR_LINHA, totalRacks); r++) {
        const rackId = `RACK_${grupo.categoria}_${r + 1}`;
        const faixa = servidores.slice(r * SERVIDORES_POR_RACK, (r + 1) * SERVIDORES_POR_RACK);
        const primeiroIp = faixa[0]?.address.split('.').pop() ?? '0';
        const ultimoIp = faixa[faixa.length - 1]?.address.split('.').pop() ?? '0';

        linhas.push(`      subgraph ${rackId} ["Rack ${r + 1} (.${primeiroIp}-.${ultimoIp})"]`);
        linhas.push(`        direction TB`);

        for (const s of faixa) {
          linhas.push(`        srv_${s.id}["${renderCardServidor(s, densidade, isDark)}"]:::${s.categoria}`);
        }

        linhas.push(`      end`);
      }

      linhas.push(`    end`);
    }

    linhas.push(`  end`);
  }

  return linhas.join('\n');
}

/**
 * 3. VISÃO POR SUB-REDE EM MATRIZ:
 * Agrupa os servidores por prefixo IP /24 em blocos matrizados.
 */
function gerarVisaoSubrede(estrutura: Estrutura, opcoes: OpcoesMermaid): string {
  const { isDark = true, direcao = 'TB', densidade = 'compacto' } = opcoes;
  const linhas: string[] = [gerarDiretivaTema(isDark), `flowchart ${direcao}`];
  linhas.push(...gerarClassDefs(isDark));

  const todosServidores = estrutura.grupos.flatMap((g) => g.servidores);
  const mapaSubredes = new Map<string, Servidor[]>();

  for (const s of todosServidores) {
    const sub = obterSubrede(s.address);
    if (!mapaSubredes.has(sub)) mapaSubredes.set(sub, []);
    mapaSubredes.get(sub)!.push(s);
  }

  let indexSub = 0;
  const SERVIDORES_POR_BLOCO = 5;
  const BLOCOS_POR_LINHA = 4;

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
          linhas.push(`        srv_${s.id}["${renderCardServidor(s, densidade, isDark)}"]:::${s.categoria}`);
        }

        linhas.push(`      end`);
      }

      linhas.push(`    end`);
    }

    linhas.push(`  end`);
  }

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
