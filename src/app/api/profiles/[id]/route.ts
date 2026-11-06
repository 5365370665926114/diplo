import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { profiles } from "@/db/schema";
import { hashSecret, publicProfile, requireUser, setActiveProfile, verifySecret } from "@/lib/server/auth";
import { validAvatarUrl } from "@/lib/server/avatars";
import { ApiError, body, handle, str } from "@/lib/server/http";

type Ctx = { params: Promise<{ id: string }> };

async function own(userId: string, id: string) {
  if (!/^[0-9a-f-]{36}$/.test(id)) throw new ApiError(404, "Perfil não encontrado.");
  const [p] = await db.select().from(profiles).where(and(eq(profiles.id, id), eq(profiles.userId, userId))).limit(1);
  if (!p) throw new ApiError(404, "Perfil não encontrado.");
  return p;
}

export const PATCH = handle<Ctx>(async (req, ctx) => {
  const s = await requireUser();
  const p = await own(s.user.id, (await ctx.params).id);
  const b = await body(req);
  const set: Partial<typeof profiles.$inferInsert> = {};
  if (typeof b.name === "string") {
    if (str(b.name, 24).length < 2) throw new ApiError(400, "Nome muito curto.");
    set.name = str(b.name, 24);
  }
  if (typeof b.bio === "string") set.bio = str(b.bio, 240);
  if (Array.isArray(b.favoriteGenres)) set.favoriteGenres = b.favoriteGenres.map(Number).filter(Number.isFinite).slice(0, 12);
  if (b.privacy === "public" || b.privacy === "private") set.privacy = b.privacy;
  if (typeof b.showInRankings === "boolean") set.showInRankings = b.showInRankings;
  if (b.settings && typeof b.settings === "object") set.settings = { ...p.settings, ...(b.settings as object) };
  if (Array.isArray(b.favoriteAvatarIds)) set.favoriteAvatarIds = b.favoriteAvatarIds.filter((x): x is string => typeof x === "string").slice(0, 50);
  if ("avatarUrl" in b || "avatarId" in b) {
    const url = validAvatarUrl(b.avatarUrl);
    set.avatarUrl = url;
    set.avatarId = typeof b.avatarId === "string" && /^[0-9a-f-]{36}$/.test(b.avatarId) ? b.avatarId : null;
    const grad = str(b.avatarGradient, 200);
    set.avatarGradient = /^linear-gradient\([#a-zA-Z0-9(),.% -]+\)$/.test(grad) ? grad : null;
    if (p.avatarUrl && p.avatarUrl !== url && !p.avatarUrl.startsWith("data:")) set.avatarHistory = [p.avatarUrl, ...p.avatarHistory.filter((x) => x !== p.avatarUrl)].slice(0, 12);
  }
  if ("pin" in b) {
    if (p.pinHash && !verifySecret(str(b.currentPin, 8), p.pinHash)) throw new ApiError(403, "PIN atual incorreto.");
    if (b.pin === null || b.pin === "") set.pinHash = null;
    else if (typeof b.pin === "string" && /^\d{4}$/.test(b.pin)) set.pinHash = hashSecret(b.pin);
    else throw new ApiError(400, "O PIN deve ter 4 dígitos.");
  }
  if (Object.keys(set).length) await db.update(profiles).set(set).where(eq(profiles.id, p.id));
  const [u] = await db.select().from(profiles).where(eq(profiles.id, p.id)).limit(1);
  return { profile: publicProfile(u) };
});

export const DELETE = handle<Ctx>(async (req, ctx) => {
  const s = await requireUser();
  const p = await own(s.user.id, (await ctx.params).id);
  const b = await body(req).catch(() => ({}) as Record<string, unknown>);
  if (p.pinHash && !verifySecret(str(b.pin, 8), p.pinHash)) throw new ApiError(403, "PIN incorreto.");
  const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(profiles).where(eq(profiles.userId, s.user.id));
  if (count <= 1) throw new ApiError(400, "A conta precisa ter ao menos um perfil.");
  await db.delete(profiles).where(eq(profiles.id, p.id));
  if (s.activeProfileId === p.id) await setActiveProfile(s.sessionId, null);
  return { ok: true };
});
