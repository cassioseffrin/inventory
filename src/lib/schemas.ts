// Schemas Zod compartilhados: validam formulários no cliente e a entrada da API no servidor.
import { z } from 'zod';
import { cpfValido, soDigitos } from './cpf';
import { telefoneValido } from './telefone';
import { CATEGORIAS_SOFTWARE, CLASSIFICACOES, STATUS, TIPOS, TIPOS_CAMPO } from './constants';

const vazioParaNull = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? null : v);
const strOpt = (max: number) =>
  z.preprocess(vazioParaNull, z.string().trim().max(max).nullable().optional());

const MAC_RE = /^([0-9a-f]{2}[:-]?){5}[0-9a-f]{2}$/i;
const IPV4_RE = /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/;
const ipValido = (v: string) => IPV4_RE.test(v) || (v.includes(':') && /^[0-9a-f:.]+$/i.test(v));

export const macOpt = z.preprocess(
  vazioParaNull,
  z.string().trim().regex(MAC_RE, 'MAC inválido').nullable().optional(),
);
export const ipOpt = z.preprocess(
  vazioParaNull,
  z.string().trim().refine(ipValido, 'IP inválido').nullable().optional(),
);
const dataOpt = z.preprocess(
  vazioParaNull,
  z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida (AAAA-MM-DD)')
    .nullable()
    .optional(),
);
const intOpt = z.preprocess(
  (v) => (v === '' || v === undefined ? null : v),
  z.coerce.number().int().nullable().optional(),
);

// ---------------------------------------------------------------- itens
export const itemBaseSchema = z.object({
  numeroPatrimonio: z.string().trim().min(1, 'Obrigatório').max(50),
  descricao: strOpt(1000),
  tag: strOpt(100),
  ip: ipOpt,
  mac: macOpt,
  hostname: strOpt(255),
  osName: strOpt(255),
  osFlavor: strOpt(255),
  osSp: strOpt(255),
  osFamily: strOpt(255),
  arch: strOpt(50),
  tipo: z.enum(TIPOS),
  status: z.enum(STATUS),
  funcionarioId: intOpt,
  setor: strOpt(100),
  localizacao: strOpt(150),
  fabricante: strOpt(100),
  modelo: strOpt(150),
  numeroSerie: strOpt(100),
  dataAquisicao: dataOpt,
  notaFiscal: strOpt(60),
  fornecedor: strOpt(150),
  observacoes: strOpt(5000),
  msfHostId: intOpt,
  msfWorkspaceId: intOpt,
  msfWorkspaceNome: strOpt(255),
  ultimoVistoMsf: z.preprocess(vazioParaNull, z.string().datetime({ offset: true }).nullable().optional()),
  /** valores de campos customizados: { [campoId]: valor } */
  camposCustomizados: z.record(z.string(), z.string().nullable()).optional(),
});
export type ItemInput = z.infer<typeof itemBaseSchema>;

export const itemUpdateSchema = itemBaseSchema.partial().omit({ ultimoVistoMsf: true });
export type ItemUpdate = z.infer<typeof itemUpdateSchema>;

export const itensFiltroSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(500).default(25),
  sort: z.string().optional(),
  dir: z.enum(['asc', 'desc']).default('asc'),
  q: z.string().trim().optional(),
  funcionarioId: z.coerce.number().int().optional(),
  semResponsavel: z.enum(['true', 'false']).transform((v) => v === 'true').optional(),
  provisorio: z.enum(['true', 'false']).transform((v) => v === 'true').optional(),
  setor: z.string().optional(),
  status: z.enum(STATUS).optional(),
  tipo: z.enum(TIPOS).optional(),
  tag: z.string().optional(),
  grupoId: z.coerce.number().int().optional(),
  naoVistoDias: z.coerce.number().int().min(1).optional(),
});
export type ItensFiltro = z.infer<typeof itensFiltroSchema>;

// ---------------------------------------------------------------- funcionários
export const funcionarioSchema = z.object({
  nome: z.string().trim().min(2, 'Informe o nome').max(150),
  matricula: z.string().trim().min(1, 'Obrigatório').max(40),
  email: z.preprocess(vazioParaNull, z.string().trim().email('E-mail inválido').max(150).nullable().optional()),
  setor: strOpt(100),
  cpf: z.preprocess(
    (v) => (typeof v === 'string' ? soDigitos(v) || null : v),
    z.string().refine(cpfValido, 'CPF inválido').nullable().optional(),
  ),
  ramal: strOpt(20),
  celular: z.preprocess(
    (v) => (typeof v === 'string' ? soDigitos(v).replace(/^0+/, '') || null : v),
    z.string().refine(telefoneValido, 'Celular inválido').nullable().optional(),
  ),
  gerenteId: z.preprocess((v) => (v === '' ? null : v), z.coerce.number().int().positive().nullable().optional()),
  ativo: z.boolean().default(true),
});
export type FuncionarioInput = z.infer<typeof funcionarioSchema>;

// ---------------------------------------------------------------- campos customizados
export const campoCustomSchema = z
  .object({
    chave: z
      .string()
      .trim()
      .regex(/^[a-z][a-z0-9_]{1,59}$/, 'Use minúsculas, números e _ (começando por letra)'),
    nome: z.string().trim().min(1).max(100),
    tipo: z.enum(TIPOS_CAMPO),
    opcoes: z.array(z.string().trim().min(1)).nullable().optional(),
    obrigatorio: z.boolean().default(false),
    ativo: z.boolean().default(true),
    ordem: z.coerce.number().int().default(0),
  })
  .refine((c) => c.tipo !== 'lista' || (c.opcoes && c.opcoes.length > 0), {
    message: 'Campos do tipo lista precisam de opções',
    path: ['opcoes'],
  });
export type CampoCustomInput = z.infer<typeof campoCustomSchema>;

// ---------------------------------------------------------------- hardware / discos / interfaces / software
export const hardwareSchema = z.object({
  cpu: strOpt(255),
  cpuNucleos: intOpt,
  ramMb: intOpt,
  placaMae: strOpt(255),
  biosFabricante: strOpt(150),
  biosVersao: strOpt(150),
  biosData: strOpt(30),
});

export const discoSchema = z.object({
  nome: strOpt(150),
  tipo: strOpt(50),
  tamanhoGb: z.preprocess((v) => (v === '' ? null : v), z.coerce.number().nonnegative().nullable().optional()),
  fabricante: strOpt(150),
  modelo: strOpt(150),
  numeroSerie: strOpt(100),
});

export const interfaceSchema = z.object({
  nome: strOpt(150),
  ip: ipOpt,
  mascara: strOpt(45),
  mac: macOpt,
  vlan: z.preprocess((v) => (v === '' ? null : v), z.coerce.number().int().min(0).max(4095).nullable().optional()),
  gateway: ipOpt,
});

export const softwareSchema = z.object({
  nome: z.string().trim().min(1).max(255),
  versao: strOpt(100),
  editor: strOpt(255),
  dataInstalacao: strOpt(30),
});

/** Foto já reduzida no navegador: data URL JPEG (máx. 1024x1024). */
export const fotoSchema = z.object({
  dados: z
    .string()
    .regex(/^data:image\/jpeg;base64,[A-Za-z0-9+/]+=*$/, 'Imagem deve ser JPEG em base64')
    .max(3_000_000, 'Imagem muito grande'),
});

// ---------------------------------------------------------------- dicionário
export const dicionarioSchema = z.object({
  nomeCanonico: z.string().trim().min(1).max(255),
  categoria: z.enum(CATEGORIAS_SOFTWARE),
  editor: strOpt(255),
  observacao: strOpt(2000),
  variacoes: z.array(z.string().trim().min(1).max(255)).default([]),
});
export type DicionarioInput = z.infer<typeof dicionarioSchema>;

// ---------------------------------------------------------------- descoberta
export const classificarSchema = z.object({
  mac: macOpt,
  ip: ipOpt,
  classificacao: z.enum(CLASSIFICACOES),
  tipo: strOpt(60),
  descricao: strOpt(2000),
});

// ---------------------------------------------------------------- grupos
export const CAMPOS_CRITERIO = [
  'osName',
  'osFamily',
  'hostname',
  'ip',
  'mac',
  'tipo',
  'status',
  'setor',
  'localizacao',
  'tag',
  'fabricante',
  'modelo',
  'funcionarioId',
  'software',
  'diasSemVisto',
] as const;
export const OPERADORES = [
  'igual',
  'diferente',
  'contem',
  'nao_contem',
  'comeca_com',
  'vazio',
  'nao_vazio',
  'maior',
  'menor',
  'na_subrede',
] as const;

export const criterioSchema = z.object({
  campo: z.enum(CAMPOS_CRITERIO),
  operador: z.enum(OPERADORES),
  valor: z.string().optional().default(''),
});
export const criteriosSchema = z.object({
  combinacao: z.enum(['E', 'OU']).default('E'),
  regras: z.array(criterioSchema).min(1, 'Adicione ao menos uma regra'),
});
export type Criterios = z.infer<typeof criteriosSchema>;

export const grupoSchema = z.discriminatedUnion('tipo', [
  z.object({
    tipo: z.literal('estatico'),
    nome: z.string().trim().min(1).max(120),
    descricao: strOpt(2000),
  }),
  z.object({
    tipo: z.literal('dinamico'),
    nome: z.string().trim().min(1).max(120),
    descricao: strOpt(2000),
    criterios: criteriosSchema,
  }),
]);
export type GrupoInput = z.infer<typeof grupoSchema>;

// ---------------------------------------------------------------- auth
export const loginSchema = z.object({
  username: z.string().trim().min(1, 'Informe o usuário'),
  senha: z.string().min(1, 'Informe a senha'),
});
