import { pgTable, serial, text, timestamp, integer, numeric, date } from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: serial().primaryKey(),
  name: text("name").notNull(),
  login: text("login").notNull().unique(),
  password: text("password").notNull(),
  salt: text("salt").notNull(),
  role: text("role").notNull().default("Assistente"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const sessions = pgTable("sessions", {
  id: serial().primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  token: text("token").notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const units = pgTable("units", {
  id: serial().primaryKey(),
  name: text("name").notNull(),
  abbreviation: text("abbreviation").notNull().unique(),
  cnpj: text("cnpj"),
  address: text("address"),
  whatsapp: text("whatsapp"),
  status: text("status").notNull().default("Ativo"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const suppliers = pgTable("suppliers", {
  id: serial().primaryKey(),
  name: text("name").notNull(),
  cnpjCpf: text("cnpj_cpf"),
  unitId: integer("unit_id").references(() => units.id),
  category: text("category"),
  phone: text("phone"),
  email: text("email"),
  observation: text("observation"),
  status: text("status").notNull().default("Ativo"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const barbers = pgTable("barbers", {
  id: serial().primaryKey(),
  name: text("name").notNull(),
  unitId: integer("unit_id").notNull().references(() => units.id),
  whatsapp: text("whatsapp"),
  cpf: text("cpf"),
  cnpj: text("cnpj"),
  pixKey: text("pix_key"),
  bondType: text("bond_type"),
  status: text("status").notNull().default("Ativo"),
  observation: text("observation"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const accountsPayable = pgTable("accounts_payable", {
  id: serial().primaryKey(),
  supplierName: text("supplier_name"),
  contractNumber: text("contract_number"),
  unitId: integer("unit_id").notNull().references(() => units.id),
  category: text("category").notNull(),
  subcategory: text("subcategory"),
  costType: text("cost_type").notNull(),
  description: text("description"),
  dueDate: date("due_date").notNull(),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  paymentMethod: text("payment_method"),
  status: text("status").notNull().default("Em aberto"),
  observation: text("observation"),
  paidDate: date("paid_date"),
  paidAmount: numeric("paid_amount", { precision: 12, scale: 2 }),
  paidMethod: text("paid_method"),
  receipt: text("receipt"),
  paidObservation: text("paid_observation"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const accountsReceivable = pgTable("accounts_receivable", {
  id: serial().primaryKey(),
  description: text("description").notNull(),
  unitId: integer("unit_id").notNull().references(() => units.id),
  type: text("type").notNull(),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  expectedDate: date("expected_date"),
  receivedDate: date("received_date"),
  status: text("status").notNull().default("Previsto"),
  observation: text("observation"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const cashFlow = pgTable("cash_flow", {
  id: serial().primaryKey(),
  date: date("date").notNull(),
  unitId: integer("unit_id").notNull().references(() => units.id),
  type: text("type").notNull(),
  paymentMethod: text("payment_method"),
  description: text("description"),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  responsible: text("responsible"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const commissions = pgTable("commissions", {
  id: serial().primaryKey(),
  barberId: integer("barber_id").notNull().references(() => barbers.id),
  unitId: integer("unit_id").notNull().references(() => units.id),
  referenceMonth: text("reference_month").notNull(),
  commissionAvulso: numeric("commission_avulso", { precision: 12, scale: 2 }).default("0"),
  commissionAssinatura: numeric("commission_assinatura", { precision: 12, scale: 2 }).default("0"),
  commissionProduto: numeric("commission_produto", { precision: 12, scale: 2 }).default("0"),
  otherBonuses: numeric("other_bonuses", { precision: 12, scale: 2 }).default("0"),
  total: numeric("total", { precision: 12, scale: 2 }).default("0"),
  nfStatus: text("nf_status").default("Pendente"),
  nfNumber: text("nf_number"),
  paymentStatus: text("payment_status").default("Pendente"),
  status: text("status").default("Previsao"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const commissionBonuses = pgTable("commission_bonuses", {
  id: serial().primaryKey(),
  barberId: integer("barber_id").notNull().references(() => barbers.id),
  unitId: integer("unit_id").notNull().references(() => units.id),
  description: text("description"),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  month: text("month"),
  status: text("status").default("Pendente"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const assets = pgTable("assets", {
  id: serial().primaryKey(),
  name: text("name").notNull(),
  purchaseValue: numeric("purchase_value", { precision: 12, scale: 2 }).notNull(),
  purchaseYear: integer("purchase_year").notNull(),
  unitId: integer("unit_id").notNull().references(() => units.id),
  category: text("category").notNull(),
  observation: text("observation"),
  createdAt: timestamp("created_at").defaultNow(),
});
