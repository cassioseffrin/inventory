// Formatos JSON devolvidos pela API (datas chegam como string ISO).
import type { HostSituacao, Status, Tipo } from './constants';

export type Item = {
  id: number;
  numeroPatrimonio: string;
  patrimonioProvisorio: boolean;
  tag: string | null;
  msfHostId: number | null;
  msfWorkspaceId: number | null;
  msfWorkspaceNome: string | null;
  ip: string | null;
  mac: string | null;
  hostname: string | null;
  osName: string | null;
  osFlavor: string | null;
  osSp: string | null;
  osFamily: string | null;
  arch: string | null;
  tipo: Tipo;
  status: Status;
  funcionarioId: number | null;
  funcionarioNome: string | null;
  funcionarioMatricula: string | null;
  setor: string | null;
  localizacao: string | null;
  fabricante: string | null;
  modelo: string | null;
  numeroSerie: string | null;
  dataAquisicao: string | null;
  notaFiscal: string | null;
  fornecedor: string | null;
  observacoes: string | null;
  descricao: string | null;
  ultimaSincronizacao: string | null;
  ultimoVistoMsf: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ItemDetalhe = Item & {
  camposCustomizados: Record<string, string | null>;
  gruposEstaticos: { id: number; nome: string }[];
};

export type ItemFoto = {
  id: number;
  itemId: number;
  mime: string;
  largura: number;
  altura: number;
  tamanhoBytes: number;
  usuario: string;
  createdAt: string;
};

export type Host = {
  id: number;
  address: string;
  mac: string | null;
  name: string | null;
  state: string | null;
  os_name: string | null;
  os_flavor: string | null;
  os_sp: string | null;
  os_family: string | null;
  arch: string | null;
  purpose: string | null;
  info: string | null;
  comments: string | null;
  workspace_id: number;
  workspace: string | null;
  servicos: number;
  vulns: number;
  notas: number;
  created_at: string | null;
  updated_at: string | null;
  situacao: HostSituacao;
  itemId?: number;
  patrimonio?: string;
  subrede: string;
  dispositivo?: { id: number; classificacao: string; tipo: string | null; descricao: string | null };
};

export type Funcionario = {
  id: number;
  nome: string;
  matricula: string;
  email: string | null;
  setor: string | null;
  cpf: string | null;
  ramal: string | null;
  celular: string | null;
  gerenteId: number | null;
  /** nome do gerente (listagem/detalhe) */
  gerenteNome?: string | null;
  ativo: boolean;
  itens?: number;
};

export type CampoCustom = {
  id: number;
  chave: string;
  nome: string;
  tipo: 'texto' | 'numero' | 'data' | 'lista';
  opcoes: string[] | null;
  obrigatorio: boolean;
  ativo: boolean;
  ordem: number;
  /** só vem na listagem de /api/campos */
  emUso?: number;
};

export type Historico = {
  id: number;
  itemId: number | null;
  acao: string;
  campo: string | null;
  valorAntigo: string | null;
  valorNovo: string | null;
  usuario: string;
  createdAt: string;
};

export type Grupo = {
  id: number;
  nome: string;
  descricao: string | null;
  tipo: 'estatico' | 'dinamico';
  criterios: { combinacao: 'E' | 'OU'; regras: { campo: string; operador: string; valor: string }[] } | null;
  total?: number;
};

export type Sessao = { id: number; username: string; nome: string; papel: 'admin' | 'operador' };
