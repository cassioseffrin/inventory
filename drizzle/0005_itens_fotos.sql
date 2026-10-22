CREATE TABLE "inventario"."itens_fotos" (
	"id" serial PRIMARY KEY NOT NULL,
	"item_id" integer NOT NULL,
	"mime" varchar(30) DEFAULT 'image/jpeg' NOT NULL,
	"dados" text NOT NULL,
	"largura" integer NOT NULL,
	"altura" integer NOT NULL,
	"tamanho_bytes" integer NOT NULL,
	"usuario" varchar(64) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "itens_fotos_dimensao_ck" CHECK ("inventario"."itens_fotos"."largura" between 1 and 1024 and "inventario"."itens_fotos"."altura" between 1 and 1024)
);
--> statement-breakpoint
ALTER TABLE "inventario"."itens_fotos" ADD CONSTRAINT "itens_fotos_item_id_itens_id_fk" FOREIGN KEY ("item_id") REFERENCES "inventario"."itens"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "itens_fotos_item_idx" ON "inventario"."itens_fotos" USING btree ("item_id","created_at");