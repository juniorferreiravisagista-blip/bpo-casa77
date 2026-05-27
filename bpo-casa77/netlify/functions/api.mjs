import { getStore } from "@netlify/blobs";
import crypto from "crypto";

const STORE_USERS    = "bpo-users";
const STORE_SESSIONS = "bpo-sessions";
const STORE_DATA     = "bpo-data";

function hashPwd(password, salt) {
  return crypto.pbkdf2Sync(password, salt, 100000, 64, "sha512").toString("hex");
}
function genToken() {
  return crypto.randomBytes(32).toString("hex");
}

async function ensureAdmin() {
  const store = getStore({ name: STORE_USERS, consistency: "strong" });
  const users = await store.get("users", { type: "json" });
  if (!users || users.length === 0) {
    const salt = crypto.randomBytes(16).toString("hex");
    await store.setJSON("users", [{
      id: "1", username: "admin", name: "Administrador",
      role: "admin", salt, hash: hashPwd("casa77@admin", salt),
      createdAt: new Date().toISOString(),
    }]);
  }
}

async function getSession(token) {
  if (!token) return null;
  try {
    const store = getStore({ name: STORE_SESSIONS, consistency: "strong" });
    const s = await store.get(token, { type: "json" });
    if (!s) return null;
    if (new Date(s.expiresAt) < new Date()) { await store.delete(token); return null; }
    return s;
  } catch { return null; }
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export default async (request) => {
  const url  = new URL(request.url);
  const path = url.pathname.replace(/^\/api\//, "").replace(/^\.netlify\/functions\/api\//, "");
  const method = request.method;

  try {
    await ensureAdmin();

    // ── LOGIN ──────────────────────────────────────────────────────────────
    if (path === "auth/login" && method === "POST") {
      const { username, password } = await request.json();
      const store = getStore({ name: STORE_USERS, consistency: "strong" });
      const users = await store.get("users", { type: "json" }) || [];
      const user  = users.find(u => u.username === username);
      if (!user || hashPwd(password, user.salt) !== user.hash) {
        return json({ error: "Usuário ou senha incorretos." }, 401);
      }
      const token = genToken();
      const sessStore = getStore({ name: STORE_SESSIONS, consistency: "strong" });
      await sessStore.setJSON(token, {
        userId: user.id, username: user.username,
        name: user.name, role: user.role,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      });
      return json({ token, user: { id: user.id, username: user.username, name: user.name, role: user.role } });
    }

    // ── GET SESSION ────────────────────────────────────────────────────────
    const token   = request.headers.get("Authorization")?.replace("Bearer ", "") || "";
    const session = await getSession(token);

    // ── ME ─────────────────────────────────────────────────────────────────
    if (path === "auth/me" && method === "GET") {
      if (!session) return json({ error: "Não autenticado." }, 401);
      return json({ user: { userId: session.userId, username: session.username, name: session.name, role: session.role } });
    }

    // ── LOGOUT ─────────────────────────────────────────────────────────────
    if (path === "auth/logout" && method === "POST") {
      if (token) {
        const s = getStore({ name: STORE_SESSIONS, consistency: "strong" });
        await s.delete(token);
      }
      return json({ ok: true });
    }

    if (!session) return json({ error: "Não autenticado." }, 401);

    // ── DATA GET ───────────────────────────────────────────────────────────
    if (path === "data" && method === "GET") {
      const store = getStore({ name: STORE_DATA, consistency: "strong" });
      const data  = await store.get("financeiro", { type: "json" }) || {};
      return json(data);
    }

    // ── DATA SAVE ──────────────────────────────────────────────────────────
    if (path === "data" && method === "POST") {
      const store = getStore({ name: STORE_DATA, consistency: "strong" });
      const body  = await request.json();

      // Assistente só pode atualizar baixas (contasPagar)
      if (session.role === "assistente") {
        const current = await store.get("financeiro", { type: "json" }) || {};
        if (body.contasPagar) current.contasPagar = body.contasPagar;
        await store.setJSON("financeiro", current);
      } else {
        await store.setJSON("financeiro", body);
      }
      return json({ ok: true });
    }

    // ── USERS (admin only) ─────────────────────────────────────────────────
    if (path.startsWith("users")) {
      if (session.role !== "admin") return json({ error: "Acesso negado." }, 403);
      const store = getStore({ name: STORE_USERS, consistency: "strong" });

      if (path === "users" && method === "GET") {
        const users = (await store.get("users", { type: "json" }) || [])
          .map(u => ({ id: u.id, username: u.username, name: u.name, role: u.role, createdAt: u.createdAt }));
        return json(users);
      }

      if (path === "users" && method === "POST") {
        const body  = await request.json();
        const users = await store.get("users", { type: "json" }) || [];
        if (users.find(u => u.username === body.username)) return json({ error: "Login já em uso." }, 400);
        const salt  = crypto.randomBytes(16).toString("hex");
        const newU  = { id: Date.now().toString(), username: body.username, name: body.name, role: body.role || "assistente", salt, hash: hashPwd(body.password, salt), createdAt: new Date().toISOString() };
        users.push(newU);
        await store.setJSON("users", users);
        return json({ id: newU.id, username: newU.username, name: newU.name, role: newU.role, createdAt: newU.createdAt });
      }

      const userId = path.split("/")[1];

      if (method === "PUT") {
        const body  = await request.json();
        let users   = await store.get("users", { type: "json" }) || [];
        const idx   = users.findIndex(u => u.id === userId);
        if (idx < 0) return json({ error: "Usuário não encontrado." }, 404);
        const u = { ...users[idx] };
        if (body.name) u.name = body.name;
        if (body.role) u.role = body.role;
        if (body.password) { const salt = crypto.randomBytes(16).toString("hex"); u.salt = salt; u.hash = hashPwd(body.password, salt); }
        users[idx] = u;
        await store.setJSON("users", users);
        return json({ id: u.id, username: u.username, name: u.name, role: u.role });
      }

      if (method === "DELETE") {
        if (userId === session.userId) return json({ error: "Não é possível excluir seu próprio usuário." }, 400);
        let users = await store.get("users", { type: "json" }) || [];
        users = users.filter(u => u.id !== userId);
        await store.setJSON("users", users);
        return json({ ok: true });
      }
    }

    return json({ error: "Rota não encontrada." }, 404);
  } catch (err) {
    console.error(err);
    return json({ error: err.message || "Erro interno." }, 500);
  }
};

export const config = { path: "/api/*" };
