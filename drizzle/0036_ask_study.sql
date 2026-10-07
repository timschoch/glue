ALTER TABLE "concepts" ADD COLUMN "ask_id" integer;--> statement-breakpoint
ALTER TABLE "concepts" ADD CONSTRAINT "concepts_ask_id_asks_id_fk" FOREIGN KEY ("ask_id") REFERENCES "public"."asks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "concepts" ADD CONSTRAINT "concepts_ask_id_unique" UNIQUE("ask_id");