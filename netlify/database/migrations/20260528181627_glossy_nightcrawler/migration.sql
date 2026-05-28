CREATE TABLE "accounts_payable" (
	"id" serial PRIMARY KEY,
	"supplier_name" text,
	"contract_number" text,
	"unit_id" integer NOT NULL,
	"category" text NOT NULL,
	"subcategory" text,
	"cost_type" text NOT NULL,
	"description" text,
	"due_date" date NOT NULL,
	"amount" numeric(12,2) NOT NULL,
	"payment_method" text,
	"status" text DEFAULT 'Em aberto' NOT NULL,
	"observation" text,
	"paid_date" date,
	"paid_amount" numeric(12,2),
	"paid_method" text,
	"receipt" text,
	"paid_observation" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "accounts_receivable" (
	"id" serial PRIMARY KEY,
	"description" text NOT NULL,
	"unit_id" integer NOT NULL,
	"type" text NOT NULL,
	"amount" numeric(12,2) NOT NULL,
	"expected_date" date,
	"received_date" date,
	"status" text DEFAULT 'Previsto' NOT NULL,
	"observation" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "assets" (
	"id" serial PRIMARY KEY,
	"name" text NOT NULL,
	"purchase_value" numeric(12,2) NOT NULL,
	"purchase_year" integer NOT NULL,
	"unit_id" integer NOT NULL,
	"category" text NOT NULL,
	"observation" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "barbers" (
	"id" serial PRIMARY KEY,
	"name" text NOT NULL,
	"unit_id" integer NOT NULL,
	"whatsapp" text,
	"cpf" text,
	"cnpj" text,
	"pix_key" text,
	"bond_type" text,
	"status" text DEFAULT 'Ativo' NOT NULL,
	"observation" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "cash_flow" (
	"id" serial PRIMARY KEY,
	"date" date NOT NULL,
	"unit_id" integer NOT NULL,
	"type" text NOT NULL,
	"payment_method" text,
	"description" text,
	"amount" numeric(12,2) NOT NULL,
	"responsible" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "commission_bonuses" (
	"id" serial PRIMARY KEY,
	"barber_id" integer NOT NULL,
	"unit_id" integer NOT NULL,
	"description" text,
	"amount" numeric(12,2) NOT NULL,
	"month" text,
	"status" text DEFAULT 'Pendente',
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "commissions" (
	"id" serial PRIMARY KEY,
	"barber_id" integer NOT NULL,
	"unit_id" integer NOT NULL,
	"reference_month" text NOT NULL,
	"commission_avulso" numeric(12,2) DEFAULT '0',
	"commission_assinatura" numeric(12,2) DEFAULT '0',
	"commission_produto" numeric(12,2) DEFAULT '0',
	"other_bonuses" numeric(12,2) DEFAULT '0',
	"total" numeric(12,2) DEFAULT '0',
	"nf_status" text DEFAULT 'Pendente',
	"nf_number" text,
	"payment_status" text DEFAULT 'Pendente',
	"status" text DEFAULT 'Previsao',
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" serial PRIMARY KEY,
	"user_id" integer NOT NULL,
	"token" text NOT NULL UNIQUE,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "suppliers" (
	"id" serial PRIMARY KEY,
	"name" text NOT NULL,
	"cnpj_cpf" text,
	"unit_id" integer,
	"category" text,
	"phone" text,
	"email" text,
	"observation" text,
	"status" text DEFAULT 'Ativo' NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "units" (
	"id" serial PRIMARY KEY,
	"name" text NOT NULL,
	"abbreviation" text NOT NULL UNIQUE,
	"cnpj" text,
	"address" text,
	"whatsapp" text,
	"status" text DEFAULT 'Ativo' NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY,
	"name" text NOT NULL,
	"login" text NOT NULL UNIQUE,
	"password" text NOT NULL,
	"salt" text NOT NULL,
	"role" text DEFAULT 'Assistente' NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "accounts_payable" ADD CONSTRAINT "accounts_payable_unit_id_units_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id");--> statement-breakpoint
ALTER TABLE "accounts_receivable" ADD CONSTRAINT "accounts_receivable_unit_id_units_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id");--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_unit_id_units_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id");--> statement-breakpoint
ALTER TABLE "barbers" ADD CONSTRAINT "barbers_unit_id_units_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id");--> statement-breakpoint
ALTER TABLE "cash_flow" ADD CONSTRAINT "cash_flow_unit_id_units_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id");--> statement-breakpoint
ALTER TABLE "commission_bonuses" ADD CONSTRAINT "commission_bonuses_barber_id_barbers_id_fkey" FOREIGN KEY ("barber_id") REFERENCES "barbers"("id");--> statement-breakpoint
ALTER TABLE "commission_bonuses" ADD CONSTRAINT "commission_bonuses_unit_id_units_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id");--> statement-breakpoint
ALTER TABLE "commissions" ADD CONSTRAINT "commissions_barber_id_barbers_id_fkey" FOREIGN KEY ("barber_id") REFERENCES "barbers"("id");--> statement-breakpoint
ALTER TABLE "commissions" ADD CONSTRAINT "commissions_unit_id_units_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id");--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id");--> statement-breakpoint
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_unit_id_units_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id");