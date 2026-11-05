ALTER TABLE "inventario"."funcionarios" ADD COLUMN "senha_hash" varchar(100);--> statement-breakpoint
ALTER TABLE "inventario"."funcionarios" ADD COLUMN "admin" boolean DEFAULT false NOT NULL;