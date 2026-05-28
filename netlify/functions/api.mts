import { eq, and, desc, like, or, sql, gte, lte, asc } from "drizzle-orm";
import { db } from "../../db/index.js";
import {
  users, sessions, units, suppliers, barbers,
  accountsPayable, accountsReceivable, cashFlow,
  commissions, commissionBonuses, assets
} from "../../db/schema.js";
import { randomBytes, pbkdf2Sync } from "crypto";

function hashPassword(password: string, salt: string): string {
  return pbkdf2Sync(password, salt, 100000, 64, "sha512").toString("hex");
}

function generateToken(): string {
  return randomBytes(48).toString("hex");
}

function json(data: unknown, status = 200) {
  return Response.json(data, { status });
}

function err(message: string, status = 400) {
  return Response.json({ error: message }, { status });
}

async function getUser(req: Request) {
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  const token = auth.slice(7);
  const [session] = await db.select().from(sessions).where(eq(sessions.token, token)).limit(1);
  if (!session || new Date(session.expiresAt) < new Date()) return null;
  const [user] = await db.select().from(users).where(eq(users.id, session.userId)).limit(1);
  return user || null;
}

async function seedDefaults() {
  const [existingAdmin] = await db.select().from(users).where(eq(users.login, "admin")).limit(1);
  if (!existingAdmin) {
    const salt = randomBytes(16).toString("hex");
    const password = hashPassword("casa77@admin", salt);
    await db.insert(users).values({ name: "Administrador", login: "admin", password, salt, role: "Admin" });
  }
  const [existingUnit] = await db.select().from(units).limit(1);
  if (!existingUnit) {
    await db.insert(units).values([
      { name: "Barreirinhas", abbreviation: "BA", status: "Ativo" },
      { name: "Renato Goncalves", abbreviation: "RG", status: "Ativo" },
      { name: "Avenida", abbreviation: "AV", status: "Ativo" },
      { name: "Pessoa Fisica", abbreviation: "PF", status: "Ativo" },
    ]);
  }
}

let seeded = false;

async function ensureSeeded() {
  if (seeded) return;
  // Only mark as seeded after a successful run so a transient failure retries
  // on the next request instead of permanently disabling seeding for this instance.
  await seedDefaults();
  seeded = true;
}

export default async (req: Request) => {
  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/api/, "").replace(/\/$/, "") || "/";
  const method = req.method;

  try { await ensureSeeded(); } catch (_e) { /* will retry on next request */ }

  // AUTH
  if (path === "/auth/login" && method === "POST") {
    const { login, password } = await req.json();
    if (!login || !password) return err("Login e senha obrigatorios");
    // Defensive: guarantee the default admin exists before checking credentials,
    // so the very first login can never fail due to an empty users table.
    try { await seedDefaults(); } catch (_e) { /* ignore */ }
    const [user] = await db.select().from(users).where(eq(users.login, login)).limit(1);
    if (!user) return err("Credenciais invalidas", 401);
    const hashed = hashPassword(password, user.salt);
    if (hashed !== user.password) return err("Credenciais invalidas", 401);
    const token = generateToken();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await db.insert(sessions).values({ userId: user.id, token, expiresAt });
    return json({ token, user: { id: user.id, name: user.name, login: user.login, role: user.role } });
  }

  if (path === "/auth/me" && method === "GET") {
    const user = await getUser(req);
    if (!user) return err("Nao autenticado", 401);
    return json({ id: user.id, name: user.name, login: user.login, role: user.role });
  }

  if (path === "/auth/logout" && method === "POST") {
    const auth = req.headers.get("authorization");
    if (auth?.startsWith("Bearer ")) {
      await db.delete(sessions).where(eq(sessions.token, auth.slice(7)));
    }
    return json({ ok: true });
  }

  // PROTECTED ROUTES
  const user = await getUser(req);
  if (!user) return err("Nao autenticado", 401);

  // USERS CRUD (Admin only)
  if (path.startsWith("/users")) {
    if (user.role !== "Admin") return err("Sem permissao", 403);
    const idMatch = path.match(/^\/users\/(\d+)$/);

    if (path === "/users" && method === "GET") {
      const all = await db.select({ id: users.id, name: users.name, login: users.login, role: users.role, createdAt: users.createdAt }).from(users).orderBy(asc(users.name));
      return json(all);
    }
    if (path === "/users" && method === "POST") {
      const body = await req.json();
      const [existing] = await db.select().from(users).where(eq(users.login, body.login)).limit(1);
      if (existing) return err("Login ja existe");
      const salt = randomBytes(16).toString("hex");
      const password = hashPassword(body.password || "123456", salt);
      const [created] = await db.insert(users).values({ name: body.name, login: body.login, password, salt, role: body.role || "Assistente" }).returning();
      return json({ id: created.id, name: created.name, login: created.login, role: created.role }, 201);
    }
    if (idMatch && method === "PUT") {
      const id = parseInt(idMatch[1]);
      const body = await req.json();
      const updateData: Record<string, unknown> = { name: body.name, role: body.role, updatedAt: new Date() };
      if (body.login) {
        const [existing] = await db.select().from(users).where(and(eq(users.login, body.login), sql`${users.id} != ${id}`)).limit(1);
        if (existing) return err("Login ja existe");
        updateData.login = body.login;
      }
      if (body.password) {
        const salt = randomBytes(16).toString("hex");
        updateData.password = hashPassword(body.password, salt);
        updateData.salt = salt;
      }
      await db.update(users).set(updateData).where(eq(users.id, id));
      return json({ ok: true });
    }
    if (idMatch && method === "DELETE") {
      const id = parseInt(idMatch[1]);
      await db.delete(sessions).where(eq(sessions.userId, id));
      await db.delete(users).where(eq(users.id, id));
      return json({ ok: true });
    }
  }

  // UNITS CRUD
  if (path.startsWith("/units")) {
    const idMatch = path.match(/^\/units\/(\d+)$/);
    if (path === "/units" && method === "GET") {
      const all = await db.select().from(units).orderBy(asc(units.name));
      return json(all);
    }
    if (path === "/units" && method === "POST") {
      if (user.role === "Assistente") return err("Sem permissao", 403);
      const body = await req.json();
      const [created] = await db.insert(units).values(body).returning();
      return json(created, 201);
    }
    if (idMatch && method === "PUT") {
      if (user.role === "Assistente") return err("Sem permissao", 403);
      const id = parseInt(idMatch[1]);
      const body = await req.json();
      await db.update(units).set(body).where(eq(units.id, id));
      return json({ ok: true });
    }
    if (idMatch && method === "DELETE") {
      if (user.role !== "Admin") return err("Sem permissao", 403);
      await db.delete(units).where(eq(units.id, parseInt(idMatch[1])));
      return json({ ok: true });
    }
  }

  // SUPPLIERS CRUD
  if (path.startsWith("/suppliers")) {
    const idMatch = path.match(/^\/suppliers\/(\d+)$/);
    if (path === "/suppliers" && method === "GET") {
      const all = await db.select().from(suppliers).orderBy(asc(suppliers.name));
      return json(all);
    }
    if (path === "/suppliers/import-from-payable" && method === "POST") {
      if (user.role === "Assistente") return err("Sem permissao", 403);
      const payables = await db.select({ supplierName: accountsPayable.supplierName }).from(accountsPayable).where(sql`${accountsPayable.supplierName} IS NOT NULL AND ${accountsPayable.supplierName} != ''`);
      const existingSuppliers = await db.select({ name: suppliers.name }).from(suppliers);
      const existingNames = new Set(existingSuppliers.map(s => s.name?.toLowerCase()));
      const uniqueNames = [...new Set(payables.map(p => p.supplierName).filter(Boolean))];
      const toImport = uniqueNames.filter(n => n && !existingNames.has(n.toLowerCase()));
      let imported = 0;
      for (const name of toImport) {
        if (name) {
          await db.insert(suppliers).values({ name, status: "Ativo" });
          imported++;
        }
      }
      return json({ imported });
    }
    if (path === "/suppliers" && method === "POST") {
      if (user.role === "Assistente") return err("Sem permissao", 403);
      const body = await req.json();
      const [created] = await db.insert(suppliers).values(body).returning();
      return json(created, 201);
    }
    if (idMatch && method === "PUT") {
      if (user.role === "Assistente") return err("Sem permissao", 403);
      const id = parseInt(idMatch[1]);
      const body = await req.json();
      await db.update(suppliers).set(body).where(eq(suppliers.id, id));
      return json({ ok: true });
    }
    if (idMatch && method === "DELETE") {
      if (user.role !== "Admin") return err("Sem permissao", 403);
      await db.delete(suppliers).where(eq(suppliers.id, parseInt(idMatch[1])));
      return json({ ok: true });
    }
  }

  // BARBERS CRUD
  if (path.startsWith("/barbers")) {
    const idMatch = path.match(/^\/barbers\/(\d+)$/);
    if (path === "/barbers" && method === "GET") {
      const all = await db.select().from(barbers).orderBy(asc(barbers.name));
      return json(all);
    }
    if (path === "/barbers" && method === "POST") {
      if (user.role === "Assistente") return err("Sem permissao", 403);
      const body = await req.json();
      const [created] = await db.insert(barbers).values(body).returning();
      return json(created, 201);
    }
    if (idMatch && method === "PUT") {
      if (user.role === "Assistente") return err("Sem permissao", 403);
      const id = parseInt(idMatch[1]);
      const body = await req.json();
      await db.update(barbers).set(body).where(eq(barbers.id, id));
      return json({ ok: true });
    }
    if (idMatch && method === "DELETE") {
      if (user.role !== "Admin") return err("Sem permissao", 403);
      await db.delete(barbers).where(eq(barbers.id, parseInt(idMatch[1])));
      return json({ ok: true });
    }
  }

  // ACCOUNTS PAYABLE CRUD
  if (path.startsWith("/payable")) {
    const idMatch = path.match(/^\/payable\/(\d+)$/);
    const payMatch = path.match(/^\/payable\/(\d+)\/pay$/);
    const batchMatch = path === "/payable/batch-pay";

    if (path === "/payable" && method === "GET") {
      const q = url.searchParams;
      let query = db.select().from(accountsPayable);
      const conditions = [];
      if (q.get("unitId")) conditions.push(eq(accountsPayable.unitId, parseInt(q.get("unitId")!)));
      if (q.get("status")) conditions.push(eq(accountsPayable.status, q.get("status")!));
      if (q.get("category")) conditions.push(eq(accountsPayable.category, q.get("category")!));
      if (q.get("from")) conditions.push(gte(accountsPayable.dueDate, q.get("from")!));
      if (q.get("to")) conditions.push(lte(accountsPayable.dueDate, q.get("to")!));
      if (q.get("search")) {
        const s = `%${q.get("search")}%`;
        conditions.push(or(
          like(accountsPayable.supplierName, s),
          like(accountsPayable.description, s),
          like(accountsPayable.category, s),
          like(accountsPayable.contractNumber, s)
        ));
      }
      if (conditions.length > 0) query = query.where(and(...conditions)) as typeof query;
      const all = await query.orderBy(asc(accountsPayable.dueDate));
      return json(all);
    }
    if (path === "/payable" && method === "POST") {
      const body = await req.json();
      if (Array.isArray(body)) {
        if (user.role === "Assistente") return err("Sem permissao para importar", 403);
        const created = await db.insert(accountsPayable).values(body).returning();
        return json(created, 201);
      }
      const [created] = await db.insert(accountsPayable).values(body).returning();
      return json(created, 201);
    }
    if (payMatch && method === "POST") {
      const id = parseInt(payMatch[1]);
      const body = await req.json();
      await db.update(accountsPayable).set({
        status: "Pago",
        paidDate: body.paidDate || new Date().toISOString().split("T")[0],
        paidAmount: body.paidAmount,
        paidMethod: body.paidMethod,
        receipt: body.receipt,
        paidObservation: body.paidObservation,
        updatedAt: new Date(),
      }).where(eq(accountsPayable.id, id));
      return json({ ok: true });
    }
    if (batchMatch && method === "POST") {
      if (user.role !== "Admin") return err("Somente Admin pode baixar em lote", 403);
      const body = await req.json();
      const { ids, paidDate, paidMethod, paidObservation } = body;
      for (const id of ids) {
        const [item] = await db.select().from(accountsPayable).where(eq(accountsPayable.id, id)).limit(1);
        if (item) {
          await db.update(accountsPayable).set({
            status: "Pago",
            paidDate: paidDate || new Date().toISOString().split("T")[0],
            paidAmount: item.amount,
            paidMethod: paidMethod || "",
            paidObservation: paidObservation || "",
            updatedAt: new Date(),
          }).where(eq(accountsPayable.id, id));
        }
      }
      return json({ ok: true, count: ids.length });
    }
    if (idMatch && method === "PUT") {
      const id = parseInt(idMatch[1]);
      const body = await req.json();
      body.updatedAt = new Date();
      await db.update(accountsPayable).set(body).where(eq(accountsPayable.id, id));
      return json({ ok: true });
    }
    if (idMatch && method === "DELETE") {
      if (user.role !== "Admin") return err("Sem permissao", 403);
      await db.delete(accountsPayable).where(eq(accountsPayable.id, parseInt(idMatch[1])));
      return json({ ok: true });
    }
  }

  // ACCOUNTS RECEIVABLE CRUD
  if (path.startsWith("/receivable")) {
    const idMatch = path.match(/^\/receivable\/(\d+)$/);
    if (path === "/receivable" && method === "GET") {
      const q = url.searchParams;
      let query = db.select().from(accountsReceivable);
      const conditions = [];
      if (q.get("unitId")) conditions.push(eq(accountsReceivable.unitId, parseInt(q.get("unitId")!)));
      if (q.get("status")) conditions.push(eq(accountsReceivable.status, q.get("status")!));
      if (q.get("from")) conditions.push(gte(accountsReceivable.expectedDate, q.get("from")!));
      if (q.get("to")) conditions.push(lte(accountsReceivable.expectedDate, q.get("to")!));
      if (conditions.length > 0) query = query.where(and(...conditions)) as typeof query;
      const all = await query.orderBy(desc(accountsReceivable.expectedDate));
      return json(all);
    }
    if (path === "/receivable" && method === "POST") {
      const body = await req.json();
      if (Array.isArray(body)) {
        if (user.role === "Assistente") return err("Sem permissao para importar", 403);
        const created = await db.insert(accountsReceivable).values(body).returning();
        return json(created, 201);
      }
      const [created] = await db.insert(accountsReceivable).values(body).returning();
      return json(created, 201);
    }
    if (idMatch && method === "PUT") {
      const id = parseInt(idMatch[1]);
      const body = await req.json();
      body.updatedAt = new Date();
      await db.update(accountsReceivable).set(body).where(eq(accountsReceivable.id, id));
      return json({ ok: true });
    }
    if (idMatch && method === "DELETE") {
      if (user.role !== "Admin") return err("Sem permissao", 403);
      await db.delete(accountsReceivable).where(eq(accountsReceivable.id, parseInt(idMatch[1])));
      return json({ ok: true });
    }
  }

  // CASH FLOW CRUD
  if (path.startsWith("/cashflow")) {
    const idMatch = path.match(/^\/cashflow\/(\d+)$/);
    if (path === "/cashflow" && method === "GET") {
      const q = url.searchParams;
      let query = db.select().from(cashFlow);
      const conditions = [];
      if (q.get("unitId")) conditions.push(eq(cashFlow.unitId, parseInt(q.get("unitId")!)));
      if (q.get("from")) conditions.push(gte(cashFlow.date, q.get("from")!));
      if (q.get("to")) conditions.push(lte(cashFlow.date, q.get("to")!));
      if (conditions.length > 0) query = query.where(and(...conditions)) as typeof query;
      const all = await query.orderBy(desc(cashFlow.date));
      return json(all);
    }
    if (path === "/cashflow" && method === "POST") {
      const body = await req.json();
      const [created] = await db.insert(cashFlow).values(body).returning();
      return json(created, 201);
    }
    if (idMatch && method === "PUT") {
      const id = parseInt(idMatch[1]);
      const body = await req.json();
      await db.update(cashFlow).set(body).where(eq(cashFlow.id, id));
      return json({ ok: true });
    }
    if (idMatch && method === "DELETE") {
      if (user.role !== "Admin") return err("Sem permissao", 403);
      await db.delete(cashFlow).where(eq(cashFlow.id, parseInt(idMatch[1])));
      return json({ ok: true });
    }
  }

  // COMMISSIONS CRUD
  if (path.startsWith("/commissions")) {
    const idMatch = path.match(/^\/commissions\/(\d+)$/);
    if (path === "/commissions" && method === "GET") {
      const q = url.searchParams;
      let query = db.select().from(commissions);
      const conditions = [];
      if (q.get("unitId")) conditions.push(eq(commissions.unitId, parseInt(q.get("unitId")!)));
      if (q.get("referenceMonth")) conditions.push(eq(commissions.referenceMonth, q.get("referenceMonth")!));
      if (q.get("barberId")) conditions.push(eq(commissions.barberId, parseInt(q.get("barberId")!)));
      if (conditions.length > 0) query = query.where(and(...conditions)) as typeof query;
      const all = await query.orderBy(desc(commissions.referenceMonth));
      return json(all);
    }
    if (path === "/commissions" && method === "POST") {
      const body = await req.json();
      if (Array.isArray(body)) {
        if (user.role === "Assistente") return err("Sem permissao para importar", 403);
        const created = await db.insert(commissions).values(body).returning();
        return json(created, 201);
      }
      body.total = String(Number(body.commissionAvulso || 0) + Number(body.commissionAssinatura || 0) + Number(body.commissionProduto || 0) + Number(body.otherBonuses || 0));
      const [created] = await db.insert(commissions).values(body).returning();
      return json(created, 201);
    }
    if (idMatch && method === "PUT") {
      const id = parseInt(idMatch[1]);
      const body = await req.json();
      body.total = String(Number(body.commissionAvulso || 0) + Number(body.commissionAssinatura || 0) + Number(body.commissionProduto || 0) + Number(body.otherBonuses || 0));
      body.updatedAt = new Date();
      await db.update(commissions).set(body).where(eq(commissions.id, id));
      return json({ ok: true });
    }
    if (idMatch && method === "DELETE") {
      if (user.role !== "Admin") return err("Sem permissao", 403);
      await db.delete(commissions).where(eq(commissions.id, parseInt(idMatch[1])));
      return json({ ok: true });
    }
  }

  // COMMISSION BONUSES
  if (path.startsWith("/bonuses")) {
    const idMatch = path.match(/^\/bonuses\/(\d+)$/);
    if (path === "/bonuses" && method === "GET") {
      const all = await db.select().from(commissionBonuses).orderBy(desc(commissionBonuses.createdAt));
      return json(all);
    }
    if (path === "/bonuses" && method === "POST") {
      const body = await req.json();
      const [created] = await db.insert(commissionBonuses).values(body).returning();
      return json(created, 201);
    }
    if (idMatch && method === "PUT") {
      const id = parseInt(idMatch[1]);
      const body = await req.json();
      await db.update(commissionBonuses).set(body).where(eq(commissionBonuses.id, id));
      return json({ ok: true });
    }
    if (idMatch && method === "DELETE") {
      if (user.role !== "Admin") return err("Sem permissao", 403);
      await db.delete(commissionBonuses).where(eq(commissionBonuses.id, parseInt(idMatch[1])));
      return json({ ok: true });
    }
  }

  // ASSETS CRUD
  if (path.startsWith("/assets")) {
    const idMatch = path.match(/^\/assets\/(\d+)$/);
    if (path === "/assets" && method === "GET") {
      const all = await db.select().from(assets).orderBy(asc(assets.name));
      return json(all);
    }
    if (path === "/assets" && method === "POST") {
      const body = await req.json();
      const [created] = await db.insert(assets).values(body).returning();
      return json(created, 201);
    }
    if (idMatch && method === "PUT") {
      const id = parseInt(idMatch[1]);
      const body = await req.json();
      await db.update(assets).set(body).where(eq(assets.id, id));
      return json({ ok: true });
    }
    if (idMatch && method === "DELETE") {
      if (user.role !== "Admin") return err("Sem permissao", 403);
      await db.delete(assets).where(eq(assets.id, parseInt(idMatch[1])));
      return json({ ok: true });
    }
  }

  // DASHBOARD
  if (path === "/dashboard" && method === "GET") {
    const q = url.searchParams;
    const conditions = [];
    const recConditions = [];
    const cfConditions = [];
    if (q.get("unitId")) {
      const uid = parseInt(q.get("unitId")!);
      conditions.push(eq(accountsPayable.unitId, uid));
      recConditions.push(eq(accountsReceivable.unitId, uid));
      cfConditions.push(eq(cashFlow.unitId, uid));
    }
    if (q.get("from")) {
      conditions.push(gte(accountsPayable.dueDate, q.get("from")!));
      recConditions.push(gte(accountsReceivable.expectedDate, q.get("from")!));
      cfConditions.push(gte(cashFlow.date, q.get("from")!));
    }
    if (q.get("to")) {
      conditions.push(lte(accountsPayable.dueDate, q.get("to")!));
      recConditions.push(lte(accountsReceivable.expectedDate, q.get("to")!));
      cfConditions.push(lte(cashFlow.date, q.get("to")!));
    }

    let payQuery = db.select().from(accountsPayable);
    if (conditions.length > 0) payQuery = payQuery.where(and(...conditions)) as typeof payQuery;
    const payables = await payQuery;

    let recQuery = db.select().from(accountsReceivable);
    if (recConditions.length > 0) recQuery = recQuery.where(and(...recConditions)) as typeof recQuery;
    const receivables = await recQuery;

    let cfQuery = db.select().from(cashFlow);
    if (cfConditions.length > 0) cfQuery = cfQuery.where(and(...cfConditions)) as typeof cfQuery;
    const flows = await cfQuery;

    const today = new Date().toISOString().split("T")[0];
    const in7 = new Date(Date.now() + 7 * 86400000).toISOString().split("T")[0];

    const totalPagar = payables.reduce((s, p) => s + Number(p.amount), 0);
    const totalPago = payables.filter(p => p.status === "Pago").reduce((s, p) => s + Number(p.paidAmount || p.amount), 0);
    const emAberto = payables.filter(p => p.status === "Em aberto").reduce((s, p) => s + Number(p.amount), 0);
    const vencido = payables.filter(p => p.status !== "Pago" && p.status !== "Cancelado" && p.dueDate < today).reduce((s, p) => s + Number(p.amount), 0);
    const venceHoje = payables.filter(p => p.status !== "Pago" && p.status !== "Cancelado" && p.dueDate === today).reduce((s, p) => s + Number(p.amount), 0);
    const prox7 = payables.filter(p => p.status !== "Pago" && p.status !== "Cancelado" && p.dueDate > today && p.dueDate <= in7).reduce((s, p) => s + Number(p.amount), 0);

    const previstoAssinatura = receivables.filter(r => r.type === "Assinatura").reduce((s, r) => s + Number(r.amount), 0);
    const jaRecebido = receivables.filter(r => r.status === "Recebido").reduce((s, r) => s + Number(r.amount), 0);
    const faltaAvulso = totalPagar - previstoAssinatura - jaRecebido;

    const custoFixo = payables.filter(p => p.costType === "Fixo").reduce((s, p) => s + Number(p.amount), 0);
    const custoVariavel = payables.filter(p => p.costType === "Variavel").reduce((s, p) => s + Number(p.amount), 0);

    const catMap: Record<string, number> = {};
    payables.forEach(p => { catMap[p.category] = (catMap[p.category] || 0) + Number(p.amount); });
    const top5 = Object.entries(catMap).sort((a, b) => b[1] - a[1]).slice(0, 5);

    const vencidas = payables.filter(p => p.status !== "Pago" && p.status !== "Cancelado" && p.dueDate < today).length;
    const vencem_hoje = payables.filter(p => p.status !== "Pago" && p.status !== "Cancelado" && p.dueDate === today).length;

    const allUnits = await db.select().from(units);
    const unitResults = allUnits.map(u => {
      const uPay = payables.filter(p => p.unitId === u.id);
      const uRec = receivables.filter(r => r.unitId === u.id);
      return {
        unit: u.name, abbreviation: u.abbreviation,
        aPagar: uPay.reduce((s, p) => s + Number(p.amount), 0),
        pago: uPay.filter(p => p.status === "Pago").reduce((s, p) => s + Number(p.paidAmount || p.amount), 0),
        emAberto: uPay.filter(p => p.status === "Em aberto").reduce((s, p) => s + Number(p.amount), 0),
        aReceber: uRec.reduce((s, r) => s + Number(r.amount), 0),
        recebido: uRec.filter(r => r.status === "Recebido").reduce((s, r) => s + Number(r.amount), 0),
      };
    });

    return json({
      totalPagar, totalPago, emAberto, vencido, venceHoje, prox7,
      previstoAssinatura, jaRecebido, faltaAvulso,
      custoFixo, custoVariavel, top5, vencidas, vencem_hoje,
      unitResults,
      cfEntradas: flows.filter(f => f.type === "Entrada").reduce((s, f) => s + Number(f.amount), 0),
      cfSaidas: flows.filter(f => f.type === "Saida").reduce((s, f) => s + Number(f.amount), 0),
    });
  }

  // REPORTS
  if (path === "/reports" && method === "GET") {
    const q = url.searchParams;
    const conditions = [];
    const recConditions = [];
    const cfConditions = [];
    if (q.get("unitId")) {
      const uid = parseInt(q.get("unitId")!);
      conditions.push(eq(accountsPayable.unitId, uid));
      recConditions.push(eq(accountsReceivable.unitId, uid));
      cfConditions.push(eq(cashFlow.unitId, uid));
    }
    if (q.get("category")) conditions.push(eq(accountsPayable.category, q.get("category")!));
    if (q.get("costType")) conditions.push(eq(accountsPayable.costType, q.get("costType")!));
    if (q.get("from")) {
      conditions.push(gte(accountsPayable.dueDate, q.get("from")!));
      recConditions.push(gte(accountsReceivable.expectedDate, q.get("from")!));
      cfConditions.push(gte(cashFlow.date, q.get("from")!));
    }
    if (q.get("to")) {
      conditions.push(lte(accountsPayable.dueDate, q.get("to")!));
      recConditions.push(lte(accountsReceivable.expectedDate, q.get("to")!));
      cfConditions.push(lte(cashFlow.date, q.get("to")!));
    }

    let payQuery = db.select().from(accountsPayable);
    if (conditions.length > 0) payQuery = payQuery.where(and(...conditions)) as typeof payQuery;
    const payables = await payQuery;

    let recQuery = db.select().from(accountsReceivable);
    if (recConditions.length > 0) recQuery = recQuery.where(and(...recConditions)) as typeof recQuery;
    const receivables = await recQuery;

    let cfQuery = db.select().from(cashFlow);
    if (cfConditions.length > 0) cfQuery = cfQuery.where(and(...cfConditions)) as typeof cfQuery;
    const flows = await cfQuery;

    const today = new Date().toISOString().split("T")[0];
    const totalPagar = payables.reduce((s, p) => s + Number(p.amount), 0);
    const totalPago = payables.filter(p => p.status === "Pago").reduce((s, p) => s + Number(p.paidAmount || p.amount), 0);
    const emAberto = payables.filter(p => p.status === "Em aberto").reduce((s, p) => s + Number(p.amount), 0);
    const vencido = payables.filter(p => p.status !== "Pago" && p.status !== "Cancelado" && p.dueDate < today).reduce((s, p) => s + Number(p.amount), 0);
    const previstoAssinatura = receivables.filter(r => r.type === "Assinatura").reduce((s, r) => s + Number(r.amount), 0);
    const jaRecebido = receivables.filter(r => r.status === "Recebido").reduce((s, r) => s + Number(r.amount), 0);
    const faltaAvulso = totalPagar - previstoAssinatura - jaRecebido;

    const byCategory: Record<string, number> = {};
    payables.forEach(p => { byCategory[p.category] = (byCategory[p.category] || 0) + Number(p.amount); });

    const bySupplier: Record<string, number> = {};
    payables.forEach(p => { const n = p.supplierName || "Sem fornecedor"; bySupplier[n] = (bySupplier[n] || 0) + Number(p.amount); });
    const top10Suppliers = Object.entries(bySupplier).sort((a, b) => b[1] - a[1]).slice(0, 10);

    const allUnits = await db.select().from(units);
    const byUnit = allUnits.map(u => ({
      unit: u.name,
      total: payables.filter(p => p.unitId === u.id).reduce((s, p) => s + Number(p.amount), 0),
    }));

    const custoFixo = payables.filter(p => p.costType === "Fixo").reduce((s, p) => s + Number(p.amount), 0);
    const custoVariavel = payables.filter(p => p.costType === "Variavel").reduce((s, p) => s + Number(p.amount), 0);

    const faturamento = receivables.filter(r => r.status === "Recebido").reduce((s, r) => s + Number(r.amount), 0) + flows.filter(f => f.type === "Entrada").reduce((s, f) => s + Number(f.amount), 0);
    const totalDespesas = custoFixo + custoVariavel;
    const resultado = faturamento - totalDespesas;

    return json({
      totalPagar, totalPago, emAberto, vencido, previstoAssinatura, jaRecebido, faltaAvulso,
      byCategory, top10Suppliers, byUnit, custoFixo, custoVariavel,
      dre: { faturamento, custoFixo, custoVariavel, totalDespesas, resultado },
    });
  }

  return err("Rota nao encontrada", 404);
};

export const config = { path: "/api/*" };
