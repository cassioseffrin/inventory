ALTER TABLE "inventario"."funcionarios" ADD COLUMN "cpf" varchar(11);--> statement-breakpoint
ALTER TABLE "inventario"."funcionarios" ADD COLUMN "ramal" varchar(20);--> statement-breakpoint
ALTER TABLE "inventario"."funcionarios" ADD COLUMN "celular" varchar(20);--> statement-breakpoint
ALTER TABLE "inventario"."funcionarios" ADD CONSTRAINT "funcionarios_cpf_unique" UNIQUE("cpf");