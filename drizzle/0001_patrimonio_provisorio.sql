CREATE SEQUENCE "inventario"."patrimonio_provisorio_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1;--> statement-breakpoint
ALTER TABLE "inventario"."itens" ADD COLUMN "patrimonio_provisorio" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE INDEX "itens_provisorio_idx" ON "inventario"."itens" USING btree ("patrimonio_provisorio");