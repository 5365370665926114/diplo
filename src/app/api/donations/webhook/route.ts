import { eq, or } from "drizzle-orm";
import { db } from "@/db";
import { paymentTransactions, webhookEvents } from "@/db/schema";
import { confirmTransaction } from "@/lib/server/donations";
import { getPix, isPaid, verifySignature } from "@/lib/server/nexuspag";
import { getSetting } from "@/lib/server/settings";

export const dynamic = "force-dynamic";

async function log(values: { eventKey?: string | null; type?: string | null; signatureValid: boolean; payload: unknown; result: string }) {
  await db
    .insert(webhookEvents)
    .values({ ...values, eventKey: values.eventKey ?? null, payload: values.payload as never })
    .onConflictDoUpdate({ target: webhookEvents.eventKey, set: { result: values.result, signatureValid: values.signatureValid } })
    .catch(() => {});
}

/** NexusPag webhook. Raw body is HMAC-verified (x-webhook-signature: t=…,v1=…); payment is then re-confirmed against GET /api/pix/{id}. */
export async function POST(req: Request) {
  const raw = await req.text();
  const secret = await getSetting("NEXUSPAG_WEBHOOK_SECRET");
  if (!secret) {
    await log({ signatureValid: false, payload: { note: "secret ausente" }, result: "rejeitado: webhook secret não configurado" });
    return Response.json({ error: "webhook secret not configured" }, { status: 503 });
  }
  const sig = verifySignature(raw, req.headers.get("x-webhook-signature"), secret);
  let payload: Record<string, unknown> = {};
  try {
    payload = JSON.parse(raw);
  } catch {
    /* handled below */
  }
  if (!sig.ok) {
    await log({ signatureValid: false, payload: { type: payload.event ?? payload.type }, result: `rejeitado: ${sig.reason}` });
    return Response.json({ error: "invalid signature" }, { status: 401 });
  }
  const type = String(payload.event ?? payload.type ?? "");
  const data = ((payload.data as Record<string, unknown>) || payload) as Record<string, unknown>;
  const gatewayId = String(data.id ?? data.transaction_id ?? data.txid ?? "");
  const externalId = String(data.external_id ?? "");
  const eventKey = `${type}:${gatewayId || externalId || "?"}`;
  if (type !== "payment.confirmed") {
    await log({ eventKey, type, signatureValid: true, payload, result: "ignorado (evento não tratado)" });
    return Response.json({ ok: true, ignored: true });
  }
  const conds = [gatewayId ? eq(paymentTransactions.gatewayId, gatewayId) : undefined, externalId ? eq(paymentTransactions.externalId, externalId) : undefined].filter(Boolean);
  if (!conds.length) {
    await log({ eventKey, type, signatureValid: true, payload, result: "sem identificador" });
    return Response.json({ ok: true, ignored: true });
  }
  const [tx] = await db.select().from(paymentTransactions).where(or(...(conds as never[]))).limit(1);
  if (!tx) {
    await log({ eventKey, type, signatureValid: true, payload, result: "transação desconhecida" });
    return Response.json({ ok: true, ignored: true });
  }
  try {
    // server-side confirmation against the gateway: id, status and amount must match our record
    const g = await getPix(tx.gatewayId || tx.externalId);
    const idOk = !gatewayId || !g.gatewayId || g.gatewayId === gatewayId;
    const amountOk = g.amountCents === null || g.amountCents === tx.amountCents;
    if (!isPaid(g.status) || !idOk || !amountOk) {
      await log({ eventKey, type, signatureValid: true, payload, result: `divergência (status=${g.status}, id=${idOk}, valor=${amountOk})` });
      return Response.json({ ok: true, ignored: true });
    }
    if (!tx.gatewayId && g.gatewayId) await db.update(paymentTransactions).set({ gatewayId: g.gatewayId }).where(eq(paymentTransactions.id, tx.id));
    const changed = await confirmTransaction(tx.id);
    await log({ eventKey, type, signatureValid: true, payload, result: changed ? "confirmado" : "já confirmado (duplicado)" });
    return Response.json({ ok: true });
  } catch {
    await log({ eventKey, type, signatureValid: true, payload, result: "erro ao reconciliar; novo envio esperado" });
    return Response.json({ error: "reconcile failed" }, { status: 502 }); // non-2xx → gateway retries
  }
}
