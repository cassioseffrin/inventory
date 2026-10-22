CREATE TABLE "inventario"."itens_custos" (
	"item_id" integer PRIMARY KEY NOT NULL,
	"valor_aquisicao" numeric(14, 2) NOT NULL,
	"custos_adicionais" numeric(14, 2) DEFAULT '0' NOT NULL,
	"valor_residual" numeric(14, 2) DEFAULT '0' NOT NULL,
	"data_inicio_uso" date NOT NULL,
	"taxa_anual" numeric(5, 2) NOT NULL,
	"turnos" integer DEFAULT 1 NOT NULL,
	"data_baixa" date,
	"observacao" text,
	"usuario" varchar(64) NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "itens_custos_valores_ck" CHECK ("inventario"."itens_custos"."valor_aquisicao" >= 0 and "inventario"."itens_custos"."custos_adicionais" >= 0 and "inventario"."itens_custos"."valor_residual" >= 0),
	CONSTRAINT "itens_custos_residual_ck" CHECK ("inventario"."itens_custos"."valor_residual" <= "inventario"."itens_custos"."valor_aquisicao" + "inventario"."itens_custos"."custos_adicionais"),
	CONSTRAINT "itens_custos_taxa_ck" CHECK ("inventario"."itens_custos"."taxa_anual" > 0 and "inventario"."itens_custos"."taxa_anual" <= 100),
	CONSTRAINT "itens_custos_turnos_ck" CHECK ("inventario"."itens_custos"."turnos" between 1 and 3),
	CONSTRAINT "itens_custos_baixa_ck" CHECK ("inventario"."itens_custos"."data_baixa" is null or "inventario"."itens_custos"."data_baixa" >= "inventario"."itens_custos"."data_inicio_uso")
);
--> statement-breakpoint
ALTER TABLE "inventario"."itens_custos" ADD CONSTRAINT "itens_custos_item_id_itens_id_fk" FOREIGN KEY ("item_id") REFERENCES "inventario"."itens"("id") ON DELETE cascade ON UPDATE no action;