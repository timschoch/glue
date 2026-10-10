CREATE TABLE "webhook_signals" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "webhook_signals_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"integration_id" integer NOT NULL,
	"url" text NOT NULL,
	"title" text NOT NULL,
	"text" text NOT NULL,
	"tool" text NOT NULL,
	"at" timestamp with time zone NOT NULL,
	CONSTRAINT "webhook_signals_integration_id_url_unique" UNIQUE("integration_id","url")
);
--> statement-breakpoint
ALTER TABLE "webhook_signals" ADD CONSTRAINT "webhook_signals_integration_id_integrations_id_fk" FOREIGN KEY ("integration_id") REFERENCES "public"."integrations"("id") ON DELETE cascade ON UPDATE no action;