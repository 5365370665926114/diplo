import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { notifications, paymentTransactions } from "@/db/schema";

/** Atomic + idempotent: the WHERE status<>'confirmed' guarantees a single confirmation even with concurrent webhook/polling. */
export async function confirmTransaction(txId: string) {
  const rows = await db
    .update(paymentTransactions)
    .set({ status: "confirmed", confirmedAt: new Date() })
    .where(and(eq(paymentTransactions.id, txId), eq(paymentTransactions.status, "pending")))
    .returning();
  const tx = rows[0];
  if (tx?.userId) {
    await db.insert(notifications).values({ userId: tx.userId, title: "Obrigado pelo apoio! 💛", body: `Recebemos seu PIX de R$ ${(tx.amountCents / 100).toFixed(2).replace(".", ",")}.` });
  }
  return !!tx;
}
