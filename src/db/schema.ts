import { sql } from 'drizzle-orm';
import {
  pgSchema,
  serial,
  integer,
  varchar,
  text,
  boolean,
  timestamp,
  date,
  inet,
  jsonb,
  numeric,
  primaryKey,
  index,
  uniqueIndex,
  check,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';

/**
 * Schema `inventario` — banco próprio, independente do msf.
 * Referências ao msf (msf_host_id / msf_workspace_id) são apenas informativas, sem FK:
 * `msfdb reinit` recria o banco do msf e os ids mudam.
 */
export const inv = pgSchema('inventario');

/** Numeração dos patrimônios provisórios gerados na importação em massa. */
export const patrimonioProvisorioSeq = inv.sequence('patrimonio_provisorio_seq', { startWith: 1 });

const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
};

export const papelUsuario = inv.enum('papel_usuario', ['admin', 'operador']);
export const tipoEquipamento = inv.enum('tipo_equipamento', [
  'desktop',
  'notebook',
  'servidor',
  'impressora',
  'switch',
  'smart_pos',
  'outro',
]);
export const statusItem = inv.enum('status_item', ['em_uso', 'estoque', 'manutencao', 'baixado']);
export const acaoHistorico = inv.enum('acao_historico', [
  'criacao',
  'alteracao',
  'troca_responsavel',
  'sincronizacao',
  'importacao',
  'mesclagem',
  'exclusao',
]);
export const tipoCampo = inv.enum('tipo_campo', ['texto', 'numero', 'data', 'lista']);
export const origemDado = inv.enum('origem_dado', ['msf', 'manual', 'importacao']);
export const categoriaSoftware = inv.enum('categoria_software', [
  'navegador',
  'office',
  'seguranca',
  'desenvolvimento',
  'sistema',
  'comunicacao',
  'utilitario',
  'proibido',
  'outro',
]);
export const classificacaoDispositivo = inv.enum('classificacao_dispositivo', ['conhecido', 'ignorado']);
export const tipoGrupo = inv.enum('tipo_grupo', ['estatico', 'dinamico']);

// ---------------------------------------------------------------- usuários (login)
export const usuarios = inv.table('usuarios', {
  id: serial('id').primaryKey(),
  username: varchar('username', { length: 64 }).notNull().unique(),
  senhaHash: varchar('senha_hash', { length: 100 }).notNull(),
  nome: varchar('nome', { length: 150 }).notNull(),
  papel: papelUsuario('papel').notNull().default('operador'),
  ativo: boolean('ativo').notNull().default(true),
  ...timestamps,
});

// ---------------------------------------------------------------- funcionários
export const funcionarios = inv.table(
  'funcionarios',
  {
    id: serial('id').primaryKey(),
    nome: varchar('nome', { length: 150 }).notNull(),
    matricula: varchar('matricula', { length: 40 }).notNull().unique(),
    email: varchar('email', { length: 150 }),
    setor: varchar('setor', { length: 100 }),
    cpf: varchar('cpf', { length: 11 }).unique(),
    ramal: varchar('ramal', { length: 20 }),
    celular: varchar('celular', { length: 20 }),
    /** Gestor imediato (outro funcionário). */
    gerenteId: integer('gerente_id').references((): AnyPgColumn => funcionarios.id, { onDelete: 'set null' }),
    ativo: boolean('ativo').notNull().default(true),
    ...timestamps,
  },
  (t) => [
    index('funcionarios_nome_idx').on(t.nome),
    index('funcionarios_gerente_idx').on(t.gerenteId),
    check('funcionarios_gerente_proprio_ck', sql`${t.gerenteId} <> ${t.id}`),
  ],
);

// ---------------------------------------------------------------- itens
export const itens = inv.table(
  'itens',
  {
    id: serial('id').primaryKey(),
    numeroPatrimonio: varchar('numero_patrimonio', { length: 50 }).notNull().unique(),
    /** true quando o número foi gerado automaticamente na importação em massa (PROV-xxxxxx). */
    patrimonioProvisorio: boolean('patrimonio_provisorio').notNull().default(false),
    tag: varchar('tag', { length: 100 }),
    // origem no msf (snapshot; sem FK)
    msfHostId: integer('msf_host_id'),
    msfWorkspaceId: integer('msf_workspace_id'),
    msfWorkspaceNome: varchar('msf_workspace_nome', { length: 255 }),
    // dados de rede/SO (snapshot do msf, editáveis)
    ip: inet('ip'),
    mac: varchar('mac', { length: 17 }),
    hostname: varchar('hostname', { length: 255 }),
    osName: varchar('os_name', { length: 255 }),
    osFlavor: varchar('os_flavor', { length: 255 }),
    osSp: varchar('os_sp', { length: 255 }),
    osFamily: varchar('os_family', { length: 255 }),
    arch: varchar('arch', { length: 50 }),
    // administrativos
    tipo: tipoEquipamento('tipo').notNull().default('desktop'),
    status: statusItem('status').notNull().default('em_uso'),
    funcionarioId: integer('funcionario_id').references(() => funcionarios.id, { onDelete: 'set null' }),
    setor: varchar('setor', { length: 100 }),
    localizacao: varchar('localizacao', { length: 150 }),
    fabricante: varchar('fabricante', { length: 100 }),
    modelo: varchar('modelo', { length: 150 }),
    numeroSerie: varchar('numero_serie', { length: 100 }),
    dataAquisicao: date('data_aquisicao'),
    notaFiscal: varchar('nota_fiscal', { length: 60 }),
    fornecedor: varchar('fornecedor', { length: 150 }),
    observacoes: text('observacoes'),
    // atividade (conceito "Last inventory / Last come" do OCS)
    ultimaSincronizacao: timestamp('ultima_sincronizacao', { withTimezone: true }),
    ultimoVistoMsf: timestamp('ultimo_visto_msf', { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('itens_mac_uq').on(t.mac),
    index('itens_ip_idx').on(t.ip),
    index('itens_hostname_idx').on(sql`lower(${t.hostname})`),
    index('itens_serie_idx').on(t.numeroSerie),
    index('itens_funcionario_idx').on(t.funcionarioId),
    index('itens_status_idx').on(t.status),
    index('itens_tipo_idx').on(t.tipo),
    index('itens_setor_idx').on(t.setor),
    index('itens_tag_idx').on(t.tag),
    index('itens_provisorio_idx').on(t.patrimonioProvisorio),
  ],
);

// ---------------------------------------------------------------- histórico / auditoria
export const itensHistorico = inv.table(
  'itens_historico',
  {
    id: serial('id').primaryKey(),
    // SET NULL para que o histórico sobreviva à exclusão/mesclagem do item
    itemId: integer('item_id').references(() => itens.id, { onDelete: 'set null' }),
    numeroPatrimonio: varchar('numero_patrimonio', { length: 50 }),
    acao: acaoHistorico('acao').notNull(),
    campo: varchar('campo', { length: 100 }),
    valorAntigo: text('valor_antigo'),
    valorNovo: text('valor_novo'),
    usuario: varchar('usuario', { length: 64 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('itens_historico_item_idx').on(t.itemId, t.createdAt)],
);

// ---------------------------------------------------------------- campos customizados (Administrative data)
export const camposCustomizados = inv.table('campos_customizados', {
  id: serial('id').primaryKey(),
  chave: varchar('chave', { length: 60 }).notNull().unique(),
  nome: varchar('nome', { length: 100 }).notNull(),
  tipo: tipoCampo('tipo').notNull().default('texto'),
  opcoes: jsonb('opcoes').$type<string[]>(),
  obrigatorio: boolean('obrigatorio').notNull().default(false),
  ativo: boolean('ativo').notNull().default(true),
  ordem: integer('ordem').notNull().default(0),
  ...timestamps,
});

export const itensCamposValores = inv.table(
  'itens_campos_valores',
  {
    itemId: integer('item_id')
      .notNull()
      .references(() => itens.id, { onDelete: 'cascade' }),
    campoId: integer('campo_id')
      .notNull()
      .references(() => camposCustomizados.id, { onDelete: 'cascade' }),
    valor: text('valor'),
  },
  (t) => [primaryKey({ columns: [t.itemId, t.campoId] })],
);

// ---------------------------------------------------------------- hardware
export const itensHardware = inv.table('itens_hardware', {
  itemId: integer('item_id')
    .primaryKey()
    .references(() => itens.id, { onDelete: 'cascade' }),
  cpu: varchar('cpu', { length: 255 }),
  cpuNucleos: integer('cpu_nucleos'),
  ramMb: integer('ram_mb'),
  placaMae: varchar('placa_mae', { length: 255 }),
  biosFabricante: varchar('bios_fabricante', { length: 150 }),
  biosVersao: varchar('bios_versao', { length: 150 }),
  biosData: varchar('bios_data', { length: 30 }),
  origem: origemDado('origem').notNull().default('manual'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const itensDiscos = inv.table(
  'itens_discos',
  {
    id: serial('id').primaryKey(),
    itemId: integer('item_id')
      .notNull()
      .references(() => itens.id, { onDelete: 'cascade' }),
    nome: varchar('nome', { length: 150 }),
    tipo: varchar('tipo', { length: 50 }),
    tamanhoGb: numeric('tamanho_gb', { precision: 12, scale: 2 }),
    fabricante: varchar('fabricante', { length: 150 }),
    modelo: varchar('modelo', { length: 150 }),
    numeroSerie: varchar('numero_serie', { length: 100 }),
    origem: origemDado('origem').notNull().default('manual'),
  },
  (t) => [index('itens_discos_item_idx').on(t.itemId)],
);

export const itensInterfaces = inv.table(
  'itens_interfaces',
  {
    id: serial('id').primaryKey(),
    itemId: integer('item_id')
      .notNull()
      .references(() => itens.id, { onDelete: 'cascade' }),
    nome: varchar('nome', { length: 150 }),
    ip: inet('ip'),
    mascara: varchar('mascara', { length: 45 }),
    mac: varchar('mac', { length: 17 }),
    vlan: integer('vlan'),
    gateway: inet('gateway'),
    origem: origemDado('origem').notNull().default('manual'),
  },
  (t) => [index('itens_interfaces_item_idx').on(t.itemId), index('itens_interfaces_mac_idx').on(t.mac)],
);

// ---------------------------------------------------------------- software + dicionário
export const softwareDicionario = inv.table('software_dicionario', {
  id: serial('id').primaryKey(),
  nomeCanonico: varchar('nome_canonico', { length: 255 }).notNull().unique(),
  categoria: categoriaSoftware('categoria').notNull().default('outro'),
  editor: varchar('editor', { length: 255 }),
  observacao: text('observacao'),
  ...timestamps,
});

/** Variações de nome agrupadas sob o nome canônico. `padrao` aceita curinga `*`. */
export const softwareVariacoes = inv.table(
  'software_variacoes',
  {
    id: serial('id').primaryKey(),
    dicionarioId: integer('dicionario_id')
      .notNull()
      .references(() => softwareDicionario.id, { onDelete: 'cascade' }),
    padrao: varchar('padrao', { length: 255 }).notNull(),
  },
  (t) => [uniqueIndex('software_variacoes_padrao_uq').on(sql`lower(${t.padrao})`)],
);

export const itensSoftwares = inv.table(
  'itens_softwares',
  {
    id: serial('id').primaryKey(),
    itemId: integer('item_id')
      .notNull()
      .references(() => itens.id, { onDelete: 'cascade' }),
    nome: varchar('nome', { length: 255 }).notNull(),
    versao: varchar('versao', { length: 100 }),
    editor: varchar('editor', { length: 255 }),
    dataInstalacao: varchar('data_instalacao', { length: 30 }),
    dicionarioId: integer('dicionario_id').references(() => softwareDicionario.id, { onDelete: 'set null' }),
    origem: origemDado('origem').notNull().default('importacao'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('itens_softwares_item_idx').on(t.itemId),
    index('itens_softwares_nome_idx').on(sql`lower(${t.nome})`),
    index('itens_softwares_dic_idx').on(t.dicionarioId),
  ],
);

// ---------------------------------------------------------------- descoberta (IPDiscover)
export const dispositivosIdentificados = inv.table(
  'dispositivos_identificados',
  {
    id: serial('id').primaryKey(),
    mac: varchar('mac', { length: 17 }),
    ip: inet('ip'),
    classificacao: classificacaoDispositivo('classificacao').notNull(),
    tipo: varchar('tipo', { length: 60 }),
    descricao: text('descricao'),
    usuario: varchar('usuario', { length: 64 }).notNull(),
    ...timestamps,
  },
  (t) => [
    // persistido por MAC; sem MAC, cai para o IP
    uniqueIndex('dispositivos_mac_uq').on(t.mac).where(sql`${t.mac} is not null`),
    uniqueIndex('dispositivos_ip_sem_mac_uq').on(t.ip).where(sql`${t.mac} is null`),
  ],
);

// ---------------------------------------------------------------- grupos
export const grupos = inv.table('grupos', {
  id: serial('id').primaryKey(),
  nome: varchar('nome', { length: 120 }).notNull().unique(),
  descricao: text('descricao'),
  tipo: tipoGrupo('tipo').notNull(),
  criterios: jsonb('criterios'),
  ...timestamps,
});

export const gruposItens = inv.table(
  'grupos_itens',
  {
    grupoId: integer('grupo_id')
      .notNull()
      .references(() => grupos.id, { onDelete: 'cascade' }),
    itemId: integer('item_id')
      .notNull()
      .references(() => itens.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.grupoId, t.itemId] })],
);
