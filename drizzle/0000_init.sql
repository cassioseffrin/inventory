CREATE SCHEMA IF NOT EXISTS "inventario";
--> statement-breakpoint
CREATE TYPE "inventario"."acao_historico" AS ENUM('criacao', 'alteracao', 'troca_responsavel', 'sincronizacao', 'importacao', 'mesclagem', 'exclusao');--> statement-breakpoint
CREATE TYPE "inventario"."categoria_software" AS ENUM('navegador', 'office', 'seguranca', 'desenvolvimento', 'sistema', 'comunicacao', 'utilitario', 'proibido', 'outro');--> statement-breakpoint
CREATE TYPE "inventario"."classificacao_dispositivo" AS ENUM('conhecido', 'ignorado');--> statement-breakpoint
CREATE TYPE "inventario"."origem_dado" AS ENUM('msf', 'manual', 'importacao');--> statement-breakpoint
CREATE TYPE "inventario"."papel_usuario" AS ENUM('admin', 'operador');--> statement-breakpoint
CREATE TYPE "inventario"."status_item" AS ENUM('em_uso', 'estoque', 'manutencao', 'baixado');--> statement-breakpoint
CREATE TYPE "inventario"."tipo_campo" AS ENUM('texto', 'numero', 'data', 'lista');--> statement-breakpoint
CREATE TYPE "inventario"."tipo_equipamento" AS ENUM('desktop', 'notebook', 'servidor', 'impressora', 'switch', 'outro');--> statement-breakpoint
CREATE TYPE "inventario"."tipo_grupo" AS ENUM('estatico', 'dinamico');--> statement-breakpoint
CREATE TABLE "inventario"."campos_customizados" (
	"id" serial PRIMARY KEY NOT NULL,
	"chave" varchar(60) NOT NULL,
	"nome" varchar(100) NOT NULL,
	"tipo" "inventario"."tipo_campo" DEFAULT 'texto' NOT NULL,
	"opcoes" jsonb,
	"obrigatorio" boolean DEFAULT false NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	"ordem" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "campos_customizados_chave_unique" UNIQUE("chave")
);
--> statement-breakpoint
CREATE TABLE "inventario"."dispositivos_identificados" (
	"id" serial PRIMARY KEY NOT NULL,
	"mac" varchar(17),
	"ip" "inet",
	"classificacao" "inventario"."classificacao_dispositivo" NOT NULL,
	"tipo" varchar(60),
	"descricao" text,
	"usuario" varchar(64) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inventario"."funcionarios" (
	"id" serial PRIMARY KEY NOT NULL,
	"nome" varchar(150) NOT NULL,
	"matricula" varchar(40) NOT NULL,
	"email" varchar(150),
	"setor" varchar(100),
	"ativo" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "funcionarios_matricula_unique" UNIQUE("matricula")
);
--> statement-breakpoint
CREATE TABLE "inventario"."grupos" (
	"id" serial PRIMARY KEY NOT NULL,
	"nome" varchar(120) NOT NULL,
	"descricao" text,
	"tipo" "inventario"."tipo_grupo" NOT NULL,
	"criterios" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "grupos_nome_unique" UNIQUE("nome")
);
--> statement-breakpoint
CREATE TABLE "inventario"."grupos_itens" (
	"grupo_id" integer NOT NULL,
	"item_id" integer NOT NULL,
	CONSTRAINT "grupos_itens_grupo_id_item_id_pk" PRIMARY KEY("grupo_id","item_id")
);
--> statement-breakpoint
CREATE TABLE "inventario"."itens" (
	"id" serial PRIMARY KEY NOT NULL,
	"numero_patrimonio" varchar(50) NOT NULL,
	"tag" varchar(100),
	"msf_host_id" integer,
	"msf_workspace_id" integer,
	"msf_workspace_nome" varchar(255),
	"ip" "inet",
	"mac" varchar(17),
	"hostname" varchar(255),
	"os_name" varchar(255),
	"os_flavor" varchar(255),
	"os_sp" varchar(255),
	"os_family" varchar(255),
	"arch" varchar(50),
	"tipo" "inventario"."tipo_equipamento" DEFAULT 'desktop' NOT NULL,
	"status" "inventario"."status_item" DEFAULT 'em_uso' NOT NULL,
	"funcionario_id" integer,
	"setor" varchar(100),
	"localizacao" varchar(150),
	"fabricante" varchar(100),
	"modelo" varchar(150),
	"numero_serie" varchar(100),
	"data_aquisicao" date,
	"nota_fiscal" varchar(60),
	"fornecedor" varchar(150),
	"observacoes" text,
	"ultima_sincronizacao" timestamp with time zone,
	"ultimo_visto_msf" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "itens_numero_patrimonio_unique" UNIQUE("numero_patrimonio")
);
--> statement-breakpoint
CREATE TABLE "inventario"."itens_campos_valores" (
	"item_id" integer NOT NULL,
	"campo_id" integer NOT NULL,
	"valor" text,
	CONSTRAINT "itens_campos_valores_item_id_campo_id_pk" PRIMARY KEY("item_id","campo_id")
);
--> statement-breakpoint
CREATE TABLE "inventario"."itens_discos" (
	"id" serial PRIMARY KEY NOT NULL,
	"item_id" integer NOT NULL,
	"nome" varchar(150),
	"tipo" varchar(50),
	"tamanho_gb" numeric(12, 2),
	"fabricante" varchar(150),
	"modelo" varchar(150),
	"numero_serie" varchar(100),
	"origem" "inventario"."origem_dado" DEFAULT 'manual' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inventario"."itens_hardware" (
	"item_id" integer PRIMARY KEY NOT NULL,
	"cpu" varchar(255),
	"cpu_nucleos" integer,
	"ram_mb" integer,
	"placa_mae" varchar(255),
	"bios_fabricante" varchar(150),
	"bios_versao" varchar(150),
	"bios_data" varchar(30),
	"origem" "inventario"."origem_dado" DEFAULT 'manual' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inventario"."itens_historico" (
	"id" serial PRIMARY KEY NOT NULL,
	"item_id" integer,
	"numero_patrimonio" varchar(50),
	"acao" "inventario"."acao_historico" NOT NULL,
	"campo" varchar(100),
	"valor_antigo" text,
	"valor_novo" text,
	"usuario" varchar(64) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inventario"."itens_interfaces" (
	"id" serial PRIMARY KEY NOT NULL,
	"item_id" integer NOT NULL,
	"nome" varchar(150),
	"ip" "inet",
	"mascara" varchar(45),
	"mac" varchar(17),
	"vlan" integer,
	"gateway" "inet",
	"origem" "inventario"."origem_dado" DEFAULT 'manual' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inventario"."itens_softwares" (
	"id" serial PRIMARY KEY NOT NULL,
	"item_id" integer NOT NULL,
	"nome" varchar(255) NOT NULL,
	"versao" varchar(100),
	"editor" varchar(255),
	"data_instalacao" varchar(30),
	"dicionario_id" integer,
	"origem" "inventario"."origem_dado" DEFAULT 'importacao' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inventario"."software_dicionario" (
	"id" serial PRIMARY KEY NOT NULL,
	"nome_canonico" varchar(255) NOT NULL,
	"categoria" "inventario"."categoria_software" DEFAULT 'outro' NOT NULL,
	"editor" varchar(255),
	"observacao" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "software_dicionario_nome_canonico_unique" UNIQUE("nome_canonico")
);
--> statement-breakpoint
CREATE TABLE "inventario"."software_variacoes" (
	"id" serial PRIMARY KEY NOT NULL,
	"dicionario_id" integer NOT NULL,
	"padrao" varchar(255) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inventario"."usuarios" (
	"id" serial PRIMARY KEY NOT NULL,
	"username" varchar(64) NOT NULL,
	"senha_hash" varchar(100) NOT NULL,
	"nome" varchar(150) NOT NULL,
	"papel" "inventario"."papel_usuario" DEFAULT 'operador' NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "usuarios_username_unique" UNIQUE("username")
);
--> statement-breakpoint
ALTER TABLE "inventario"."grupos_itens" ADD CONSTRAINT "grupos_itens_grupo_id_grupos_id_fk" FOREIGN KEY ("grupo_id") REFERENCES "inventario"."grupos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventario"."grupos_itens" ADD CONSTRAINT "grupos_itens_item_id_itens_id_fk" FOREIGN KEY ("item_id") REFERENCES "inventario"."itens"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventario"."itens" ADD CONSTRAINT "itens_funcionario_id_funcionarios_id_fk" FOREIGN KEY ("funcionario_id") REFERENCES "inventario"."funcionarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventario"."itens_campos_valores" ADD CONSTRAINT "itens_campos_valores_item_id_itens_id_fk" FOREIGN KEY ("item_id") REFERENCES "inventario"."itens"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventario"."itens_campos_valores" ADD CONSTRAINT "itens_campos_valores_campo_id_campos_customizados_id_fk" FOREIGN KEY ("campo_id") REFERENCES "inventario"."campos_customizados"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventario"."itens_discos" ADD CONSTRAINT "itens_discos_item_id_itens_id_fk" FOREIGN KEY ("item_id") REFERENCES "inventario"."itens"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventario"."itens_hardware" ADD CONSTRAINT "itens_hardware_item_id_itens_id_fk" FOREIGN KEY ("item_id") REFERENCES "inventario"."itens"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventario"."itens_historico" ADD CONSTRAINT "itens_historico_item_id_itens_id_fk" FOREIGN KEY ("item_id") REFERENCES "inventario"."itens"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventario"."itens_interfaces" ADD CONSTRAINT "itens_interfaces_item_id_itens_id_fk" FOREIGN KEY ("item_id") REFERENCES "inventario"."itens"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventario"."itens_softwares" ADD CONSTRAINT "itens_softwares_item_id_itens_id_fk" FOREIGN KEY ("item_id") REFERENCES "inventario"."itens"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventario"."itens_softwares" ADD CONSTRAINT "itens_softwares_dicionario_id_software_dicionario_id_fk" FOREIGN KEY ("dicionario_id") REFERENCES "inventario"."software_dicionario"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventario"."software_variacoes" ADD CONSTRAINT "software_variacoes_dicionario_id_software_dicionario_id_fk" FOREIGN KEY ("dicionario_id") REFERENCES "inventario"."software_dicionario"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "dispositivos_mac_uq" ON "inventario"."dispositivos_identificados" USING btree ("mac") WHERE "inventario"."dispositivos_identificados"."mac" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "dispositivos_ip_sem_mac_uq" ON "inventario"."dispositivos_identificados" USING btree ("ip") WHERE "inventario"."dispositivos_identificados"."mac" is null;--> statement-breakpoint
CREATE INDEX "funcionarios_nome_idx" ON "inventario"."funcionarios" USING btree ("nome");--> statement-breakpoint
CREATE INDEX "itens_mac_idx" ON "inventario"."itens" USING btree ("mac");--> statement-breakpoint
CREATE INDEX "itens_ip_idx" ON "inventario"."itens" USING btree ("ip");--> statement-breakpoint
CREATE INDEX "itens_hostname_idx" ON "inventario"."itens" USING btree (lower("hostname"));--> statement-breakpoint
CREATE INDEX "itens_serie_idx" ON "inventario"."itens" USING btree ("numero_serie");--> statement-breakpoint
CREATE INDEX "itens_funcionario_idx" ON "inventario"."itens" USING btree ("funcionario_id");--> statement-breakpoint
CREATE INDEX "itens_status_idx" ON "inventario"."itens" USING btree ("status");--> statement-breakpoint
CREATE INDEX "itens_tipo_idx" ON "inventario"."itens" USING btree ("tipo");--> statement-breakpoint
CREATE INDEX "itens_setor_idx" ON "inventario"."itens" USING btree ("setor");--> statement-breakpoint
CREATE INDEX "itens_tag_idx" ON "inventario"."itens" USING btree ("tag");--> statement-breakpoint
CREATE INDEX "itens_discos_item_idx" ON "inventario"."itens_discos" USING btree ("item_id");--> statement-breakpoint
CREATE INDEX "itens_historico_item_idx" ON "inventario"."itens_historico" USING btree ("item_id","created_at");--> statement-breakpoint
CREATE INDEX "itens_interfaces_item_idx" ON "inventario"."itens_interfaces" USING btree ("item_id");--> statement-breakpoint
CREATE INDEX "itens_interfaces_mac_idx" ON "inventario"."itens_interfaces" USING btree ("mac");--> statement-breakpoint
CREATE INDEX "itens_softwares_item_idx" ON "inventario"."itens_softwares" USING btree ("item_id");--> statement-breakpoint
CREATE INDEX "itens_softwares_nome_idx" ON "inventario"."itens_softwares" USING btree (lower("nome"));--> statement-breakpoint
CREATE INDEX "itens_softwares_dic_idx" ON "inventario"."itens_softwares" USING btree ("dicionario_id");--> statement-breakpoint
CREATE UNIQUE INDEX "software_variacoes_padrao_uq" ON "inventario"."software_variacoes" USING btree (lower("padrao"));