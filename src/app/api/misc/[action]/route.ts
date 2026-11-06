import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { clientErrors, notifications, onboardingProgress, searchHistory } from "@/db/schema";
import { getSession, requireProfile, requireUser } from "@/lib/server/auth";
import { ApiError, body, clientIp, handle, rateLimit, str } from "@/lib/server/http";

export const dynamic = "force-dynamic";

export const GET = handle<{ params: Promise<{ action: string }> }>(async (_req, ctx) => {
  const { action } = await ctx.params;
  if (action === "search-history") {
    const s = await requireProfile();
    const rows = await db.select().from(searchHistory).where(eq(searchHistory.profileId, s.profile.id)).orderBy(desc(searchHistory.createdAt)).limit(10);
    return { items: rows.map((r) => r.query) };
  }
  throw new ApiError(404, "Não encontrado.");
});

export const POST = handle<{ params: Promise<{ action: string }> }>(async (req, ctx) => {
  const { action } = await ctx.params;
  const b = await body(req);
  if (action === "onboarding") {
    const s = await requireUser();
    const step = str(b.step, 40);
    if (!/^[a-z0-9_.-]+$/.test(step)) throw new ApiError(400, "Etapa inválida.");
    const scope = b.scope === "profile" && s.activeProfileId ? s.activeProfileId : "account";
    if (b.reset === true) await db.delete(onboardingProgress).where(and(eq(onboardingProgress.userId, s.user.id), eq(onboardingProgress.scope, scope), eq(onboardingProgress.step, step)));
    else await db.insert(onboardingProgress).values({ userId: s.user.id, scope, step }).onConflictDoNothing();
    return { ok: true };
  }
  if (action === "notifications-read") {
    const s = await requireUser();
    await db.update(notifications).set({ readAt: new Date() }).where(eq(notifications.userId, s.user.id));
    return { ok: true };
  }
  if (action === "client-error") {
    await rateLimit(`err:${clientIp(req)}`, 20, 600);
    const s = await getSession();
    await db.insert(clientErrors).values({ userId: s?.user.id ?? null, message: str(b.message, 500) || "erro", stack: str(b.stack, 2000) || null, url: str(b.url, 300) || null });
    return { ok: true };
  }
  throw new ApiError(404, "Não encontrado.");
});
