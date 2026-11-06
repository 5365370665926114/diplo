import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { profileLocks, profiles } from "@/db/schema";
import { requireUser, setActiveProfile, verifySecret } from "@/lib/server/auth";
import { ApiError, body, handle, str } from "@/lib/server/http";

/** PIN is validated here, server-side. Without a valid selection the session has no active profile and profile APIs return 403. */
export const POST = handle<{ params: Promise<{ id: string }> }>(async (req, ctx) => {
  const s = await requireUser();
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/.test(id)) throw new ApiError(404, "Perfil não encontrado.");
  const [p] = await db.select().from(profiles).where(and(eq(profiles.id, id), eq(profiles.userId, s.user.id))).limit(1);
  if (!p) throw new ApiError(404, "Perfil não encontrado.");
  if (p.pinHash) {
    const [lock] = await db.select().from(profileLocks).where(eq(profileLocks.profileId, p.id)).limit(1);
    if (lock?.lockedUntil && lock.lockedUntil > new Date()) {
      const mins = Math.ceil((lock.lockedUntil.getTime() - Date.now()) / 60000);
      throw new ApiError(429, `Perfil bloqueado por tentativas incorretas. Tente em ${mins} min.`, "locked");
    }
    const b = await body(req).catch(() => ({}) as Record<string, unknown>);
    const pin = str(b.pin, 8);
    if (!pin) throw new ApiError(401, "Este perfil exige PIN.", "pin_required");
    if (!verifySecret(pin, p.pinHash)) {
      const attempts = (lock?.failedAttempts ?? 0) + 1;
      const lockedUntil = attempts >= 5 ? new Date(Date.now() + 5 * 60_000) : null;
      await db
        .insert(profileLocks)
        .values({ profileId: p.id, failedAttempts: lockedUntil ? 0 : attempts, lockedUntil })
        .onConflictDoUpdate({ target: profileLocks.profileId, set: { failedAttempts: lockedUntil ? 0 : attempts, lockedUntil } });
      throw new ApiError(401, "PIN incorreto.", "pin_invalid");
    }
    await db.delete(profileLocks).where(eq(profileLocks.profileId, p.id));
  }
  await setActiveProfile(s.sessionId, p.id);
  return { ok: true };
});
