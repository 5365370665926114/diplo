import crypto from "node:crypto";
import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { notifications, paymentTransactions } from "@/db/schema";
import { requireProfile, requireUser } from "@/lib/server/auth";
import { ApiError, body, clientIp, handle, rateLimit, str } from "@/lib/server/http";
import { createPix, getPix, isPaid } from "@/lib/server/nexuspag";
import { getFlags, getSetting } from "@/lib/server/settings";
import { confirmTransaction } from "@/lib/server/donations";

export const dynamic = "force-dynamic";

export const GET = handle(async (req) => {
  const s = await requireUser();
  const id = new URL(req.url).searchParams.get("id");
  if (id) {
    if (!/^[0-9a-f-]{36}$/.test(id)) throw new ApiError(404, "Cobrança não encontrada.");
    let [tx] = await db.select().from(paymentTransactions).where(and(eq(paymentTransactions.id, id), eq(paymentTransactions.userId, s.user.id))).limit(1);
    if (!tx) throw new ApiError(404, "Cobrança não encontrada.");
    // reconciliation: ask the gateway when still pending
    if (tx.status === "pending") {
      try {
        const g = await getPix(tx.gatewayId || tx.externalId);
        if (isPaid(g.status) && (g.amountCents === null || g.amountCents === tx.amountCents)) {
          await confirmTransaction(tx.id);
        } else if (["expired", "cancelled", "canceled", "failed"].includes(g.status)) {
          await db.update(paymentTransactions).set({ status: g.status === "expired" ? "expired" : "failed" }).where(and(eq(paymentTransactions.id, tx.id), eq(paymentTransactions.status, "pending")));
        } else if (tx.expiresAt && tx.expiresAt < new Date()) {
          await db.update(paymentTransactions).set({ status: "expired" }).where(and(eq(paymentTransactions.id, tx.id), eq(paymentTransactions.status, "pending")));
        }
      } catch {
        /* keep pending; webhook may still arrive */
      }
      [tx] = await db.select().from(paymentTransactions).where(eq(paymentTransactions.id, id)).limit(1);
    }
    return { id: tx.id, status: tx.status, amountCents: tx.amountCents, qrCode: tx.qrCode, copyPaste: tx.copyPaste, expiresAt: tx.expiresAt, confirmedAt: tx.confirmedAt };
  }
  const mine = await db.select().from(paymentTransactions).where(eq(paymentTransactions.userId, s.user.id)).orderBy(desc(paymentTransactions.createdAt)).limit(20);
  const minAmount = Number((await getSetting("NEXUSPAG_MIN_AMOUNT")) || 5);
  const [t] = await db.select({ total: sql<number>`coalesce(sum(amount_cents),0)::int`, count: sql<number>`count(*)::int` }).from(paymentTransactions).where(eq(paymentTransactions.status, "confirmed"));
  const configured = !!(await getSetting("NEXUSPAG_API_KEY")) && !!(await getSetting("NEXUSPAG_WEBHOOK_SECRET"));
  return { minAmount, configured, totalCents: t.total, supporters: t.count, mine: mine.map((m) => ({ id: m.id, amountCents: m.amountCents, status: m.status, createdAt: m.createdAt })) };
});

export const POST = handle(async (req) => {
  const s = await requireProfile();
  if (!(await getFlags()).donations) throw new ApiError(403, "Doações desativadas no momento.");
  await rateLimit(`don:${s.user.id}`, 10, 3600);
  await rateLimit(`donip:${clientIp(req)}`, 30, 3600);
  const b = await body(req);
  const min = Number((await getSetting("NEXUSPAG_MIN_AMOUNT")) || 5);
  const amount = Math.round(Number(b.amount) * 100) / 100;
  if (!Number.isFinite(amount) || amount < min) throw new ApiError(400, `Valor mínimo: R$ ${min.toFixed(2).replace(".", ",")}.`);
  if (amount > 5000) throw new ApiError(400, "Valor máximo por doação: R$ 5.000,00.");
  if (!(await getSetting("NEXUSPAG_WEBHOOK_SECRET"))) throw new ApiError(503, "Webhook secret do NexusPag não configurado; doações ficam bloqueadas até a configuração segura.", "nexuspag_not_configured");
  const key = str(b.key, 64);
  if (!/^[A-Za-z0-9-]{16,64}$/.test(key)) throw new ApiError(400, "Chave de idempotência inválida.");
  const externalId = `dc-${s.user.id.slice(0, 8)}-${crypto.createHash("sha1").update(key).digest("hex").slice(0, 20)}`;
  const cents = Math.round(amount * 100);

  const [existing] = await db.select().from(paymentTransactions).where(eq(paymentTransactions.externalId, externalId)).limit(1);
  if (existing) {
    if (existing.userId !== s.user.id || existing.amountCents !== cents) throw new ApiError(409, "Chave de idempotência já usada com outro valor.");
    return { id: existing.id, status: existing.status, amountCents: existing.amountCents, qrCode: existing.qrCode, copyPaste: existing.copyPaste, expiresAt: existing.expiresAt };
  }
  const base = ((await getSetting("PUBLIC_BASE_URL")) || new URL(req.url).origin).replace(/\/$/, "");
  const g = await createPix({ amount, description: "Apoio ao DiploCine", externalId, webhookUrl: `${base}/api/donations/webhook` });
  if (!g.copyPaste && !g.qrCode) throw new ApiError(502, "O gateway não retornou o código PIX. Tente novamente.");
  const [tx] = await db
    .insert(paymentTransactions)
    .values({
      userId: s.user.id,
      profileId: s.profile.id,
      externalId,
      gatewayId: g.gatewayId,
      amountCents: cents,
      status: isPaid(g.status) ? "pending" : "pending",
      qrCode: g.qrCode,
      copyPaste: g.copyPaste,
      expiresAt: g.expiresAt ?? new Date(Date.now() + 30 * 60_000),
      anonymous: b.anonymous === true,
      message: str(b.message, 140) || null,
      gatewayResponse: g.raw as never,
    })
    .onConflictDoNothing()
    .returning();
  if (!tx) throw new ApiError(409, "Cobrança já criada. Atualize a página.");
  await db.insert(notifications).values({ userId: s.user.id, title: "Cobrança PIX criada", body: `R$ ${amount.toFixed(2).replace(".", ",")} aguardando pagamento.` });
  return { id: tx.id, status: tx.status, amountCents: tx.amountCents, qrCode: tx.qrCode, copyPaste: tx.copyPaste, expiresAt: tx.expiresAt };
});
