// Constantes e rótulos compartilhados entre servidor e cliente.

export const TIPOS = ['desktop', 'notebook', 'servidor', 'impressora', 'switch', 'smart_pos', 'outro'] as const;
export const STATUS = ['em_uso', 'estoque', 'manutencao', 'baixado'] as const;
export const TIPOS_CAMPO = ['texto', 'numero', 'data', 'lista'] as const;
export const CATEGORIAS_SOFTWARE = [
  'navegador',
  'office',
  'seguranca',
  'desenvolvimento',
  'sistema',
  'comunicacao',
  'utilitario',
  'proibido',
  'outro',
] as const;
export const CLASSIFICACOES = ['conhecido', 'ignorado'] as const;

export type Tipo = (typeof TIPOS)[number];
export type Status = (typeof STATUS)[number];

export const TIPO_LABEL: Record<Tipo, string> = {
  desktop: 'Desktop',
  notebook: 'Notebook',
  servidor: 'Servidor',
  impressora: 'Impressora',
  switch: 'Switch',
  smart_pos: 'Smart POS',
  outro: 'Outro',
};

export const STATUS_LABEL: Record<Status, string> = {
  em_uso: 'Em uso',
  estoque: 'Estoque',
  manutencao: 'Manutenção',
  baixado: 'Baixado',
};

export const STATUS_COLOR: Record<Status, string> = {
  em_uso: 'teal',
  estoque: 'blue',
  manutencao: 'yellow',
  baixado: 'gray',
};

export const CATEGORIA_LABEL: Record<(typeof CATEGORIAS_SOFTWARE)[number], string> = {
  navegador: 'Navegador',
  office: 'Office',
  seguranca: 'Segurança',
  desenvolvimento: 'Desenvolvimento',
  sistema: 'Sistema',
  comunicacao: 'Comunicação',
  utilitario: 'Utilitário',
  proibido: 'Proibido',
  outro: 'Outro',
};

export const ACAO_LABEL: Record<string, string> = {
  criacao: 'Criação',
  alteracao: 'Alteração',
  troca_responsavel: 'Troca de responsável',
  sincronizacao: 'Sincronização msf',
  importacao: 'Importação',
  mesclagem: 'Mesclagem',
  exclusao: 'Exclusão',
};

/** Classificação de um host do msf em relação ao inventário. */
export type HostSituacao = 'inventariado' | 'provavel' | 'conhecido' | 'ignorado' | 'desconhecido';

export const SITUACAO_LABEL: Record<HostSituacao, string> = {
  inventariado: 'Inventariado',
  provavel: 'Provável (só IP)',
  conhecido: 'Dispositivo conhecido',
  ignorado: 'Ignorado',
  desconhecido: 'Não identificado',
};

export const SITUACAO_COLOR: Record<HostSituacao, string> = {
  inventariado: 'teal',
  provavel: 'lime',
  conhecido: 'blue',
  ignorado: 'gray',
  desconhecido: 'orange',
};

/** Campos que a sincronização com o msf pode atualizar. Campos manuais nunca são tocados. */
export const CAMPOS_SYNC = ['ip', 'mac', 'hostname', 'osName', 'osFlavor', 'osSp', 'osFamily', 'arch'] as const;
export type CampoSync = (typeof CAMPOS_SYNC)[number];

export const CAMPO_LABEL: Record<string, string> = {
  numeroPatrimonio: 'Patrimônio',
  foto: 'Foto',
  tag: 'TAG',
  ip: 'IP',
  mac: 'MAC',
  hostname: 'Hostname',
  osName: 'SO',
  osFlavor: 'SO (variante)',
  osSp: 'SO (SP)',
  osFamily: 'SO (família)',
  arch: 'Arquitetura',
  tipo: 'Tipo',
  status: 'Status',
  funcionarioId: 'Responsável',
  setor: 'Setor',
  localizacao: 'Localização',
  fabricante: 'Fabricante',
  modelo: 'Modelo',
  numeroSerie: 'Nº de série',
  dataAquisicao: 'Data de aquisição',
  notaFiscal: 'Nota fiscal',
  fornecedor: 'Fornecedor',
  observacoes: 'Observações',
  descricao: 'Descrição',
  valorAquisicao: 'Valor de aquisição',
  custosAdicionais: 'Custos adicionais',
  valorResidual: 'Valor residual',
  dataInicioUso: 'Início de uso',
  taxaAnual: 'Taxa de depreciação (% a.a.)',
  turnos: 'Turnos de uso',
  dataBaixa: 'Data de baixa',
  observacao: 'Observação (custo)',
  custo: 'Custo',
  msfHostId: 'Host msf (id)',
  msfWorkspaceId: 'Workspace msf (id)',
};
