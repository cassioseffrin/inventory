DROP INDEX "inventario"."itens_mac_idx";--> statement-breakpoint
ALTER TABLE "inventario"."funcionarios" ADD COLUMN "gerente_id" integer;--> statement-breakpoint
ALTER TABLE "inventario"."funcionarios" ADD CONSTRAINT "funcionarios_gerente_id_funcionarios_id_fk" FOREIGN KEY ("gerente_id") REFERENCES "inventario"."funcionarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "funcionarios_gerente_idx" ON "inventario"."funcionarios" USING btree ("gerente_id");--> statement-breakpoint
CREATE UNIQUE INDEX "itens_mac_uq" ON "inventario"."itens" USING btree ("mac");--> statement-breakpoint
ALTER TABLE "inventario"."funcionarios" ADD CONSTRAINT "funcionarios_gerente_proprio_ck" CHECK ("inventario"."funcionarios"."gerente_id" <> "inventario"."funcionarios"."id");