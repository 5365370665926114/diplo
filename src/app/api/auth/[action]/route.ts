import crypto from "node:crypto";
import { and, eq, gt, isNull } from "drizzle-orm";
import { db } from "@/db";
import { passwordResets, sessions, users } from "@/db/schema";
import { createSession, destroySession, hashSecret, publicUser, verifySecret, adminEmails, getSession } from "@/lib/server/auth";
import { ApiError, body, clientIp, handle, rateLimit, str } from "@/lib/server/http";
import { getFlags, getSetting } from "@/lib/server/settings";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const sha = (s: string) => crypto.createHash("sha256").update(s).digest("hex");

export const POST = handle<{ params: Promise<{ action: string }> }>(async (req, ctx) => {
  const { action } = await ctx.params;
  const ip = clientIp(req);

  if (action === "register") {
    await rateLimit(`reg:${ip}`, 8, 3600);
    if (!(await getFlags()).registrations) throw new ApiError(403, "Novos cadastros estão temporariamente desativados.");
    const b = await body(req);
    const name = str(b.name, 60);
    const email = str(b.email, 200).toLowerCase();
    const password = typeof b.password === "string" ? b.password : "";
    if (name.length < 2) throw new ApiError(400, "Informe seu nome.");
    if (!EMAIL.test(email)) throw new ApiError(400, "E-mail inválido.");
    if (password.length < 8 || password.length > 128) throw new ApiError(400, "A senha deve ter de 8 a 128 caracteres.");
    const lang = ["pt-BR", "en", "es"].includes(str(b.lang)) ? str(b.lang) : "pt-BR";
    const [exists] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
    if (exists) throw new ApiError(409, "Este e-mail já está cadastrado.");
    const [u] = await db.insert(users).values({ name, email, passwordHash: hashSecret(password), lang }).returning();
    await createSession(u.id);
    return { user: publicUser(u, adminEmails().includes(email)) };
  }

  if (action === "login") {
    const b = await body(req);
    const email = str(b.email, 200).toLowerCase();
    await rateLimit(`login:${ip}:${email}`, 8, 900);
    const password = typeof b.password === "string" ? b.password : "";
    const [u] = await db.select().from(users).where(eq(users.email, email)).limit(1);
    // constant-ish time: always run a verify
    const ok = u ? verifySecret(password, u.passwordHash) : verifySecret(password, "s1$AAAAAAAAAAAAAAAAAAAAAA==$" + Buffer.alloc(64).toString("base64"));
    if (!u || !ok) throw new ApiError(401, "E-mail ou senha incorretos.");
    if (u.status !== "active") throw new ApiError(403, "Conta suspensa. Entre em contato com o suporte.");
    await db.update(users).set({ lastSeenAt: new Date() }).where(eq(users.id, u.id));
    await createSession(u.id);
    return { user: publicUser(u, u.role === "admin" || adminEmails().includes(email)) };
  }

  if (action === "logout") {
    await destroySession();
    return { ok: true };
  }

  if (action === "recover") {
    await rateLimit(`rec:${ip}`, 5, 3600);
    const b = await body(req);
    const email = str(b.email, 200).toLowerCase();
    const generic = { ok: true, message: "Se o e-mail existir, enviaremos instruções de recuperação." };
    const [u] = await db.select().from(users).where(eq(users.email, email)).limit(1);
    if (!u) return generic;
    const token = crypto.randomBytes(32).toString("base64url");
    await db.insert(passwordResets).values({ id: sha(token), userId: u.id, expiresAt: new Date(Date.now() + 3600_000) });
    const resend = await getSetting("RESEND_API_KEY");
    if (!resend) {
      console.warn("[recover] RESEND_API_KEY ausente — e-mail de recuperação não enviado.");
      throw new ApiError(503, "Envio de e-mail não configurado. Peça a um administrador para redefinir sua senha.", "mail_not_configured");
    }
    const base = (await getSetting("PUBLIC_BASE_URL")) || new URL(req.url).origin;
    const from = (await getSetting("MAIL_FROM")) || "DiploCine <onboarding@resend.dev>";
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${resend}`, "content-type": "application/json" },
      body: JSON.stringify({ from, to: [u.email], subject: "Recuperação de senha — DiploCine", html: `<p>Olá, ${u.name.replace(/[<>&]/g, "")}.</p><p><a href="${base}/welcome?reset=${token}">Redefinir minha senha</a> (válido por 1 hora).</p>` }),
    });
    if (!r.ok) throw new ApiError(502, "Falha ao enviar o e-mail de recuperação.");
    return generic;
  }

  if (action === "reset") {
    await rateLimit(`reset:${ip}`, 10, 3600);
    const b = await body(req);
    const token = str(b.token, 100);
    const password = typeof b.password === "string" ? b.password : "";
    if (password.length < 8 || password.length > 128) throw new ApiError(400, "A senha deve ter de 8 a 128 caracteres.");
    const [r] = await db
      .select()
      .from(passwordResets)
      .where(and(eq(passwordResets.id, sha(token)), gt(passwordResets.expiresAt, new Date()), isNull(passwordResets.usedAt)))
      .limit(1);
    if (!r) throw new ApiError(400, "Link inválido ou expirado.");
    await db.update(users).set({ passwordHash: hashSecret(password) }).where(eq(users.id, r.userId));
    await db.update(passwordResets).set({ usedAt: new Date() }).where(eq(passwordResets.id, r.id));
    await db.delete(sessions).where(eq(sessions.userId, r.userId));
    return { ok: true };
  }

  if (action === "password") {
    const s = await getSession();
    if (!s) throw new ApiError(401, "Faça login.");
    const b = await body(req);
    const cur = typeof b.current === "string" ? b.current : "";
    const next = typeof b.next === "string" ? b.next : "";
    if (!verifySecret(cur, s.user.passwordHash)) throw new ApiError(400, "Senha atual incorreta.");
    if (next.length < 8 || next.length > 128) throw new ApiError(400, "A nova senha deve ter de 8 a 128 caracteres.");
    await db.update(users).set({ passwordHash: hashSecret(next) }).where(eq(users.id, s.user.id));
    return { ok: true };
  }

  throw new ApiError(404, "Ação desconhecida.");
});
