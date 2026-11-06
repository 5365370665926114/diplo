import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { avatarCollections, avatars, profiles } from "@/db/schema";
import { publicProfile, requireUser, hashSecret } from "@/lib/server/auth";
import { ApiError, body, handle, str } from "@/lib/server/http";
import { seedAvatars, validAvatarUrl } from "@/lib/server/avatars";

export const dynamic = "force-dynamic";

export const GET = handle(async (req) => {
  const s = await requireUser();
  const list = await db.select().from(profiles).where(eq(profiles.userId, s.user.id)).orderBy(profiles.createdAt);
  const url = new URL(req.url);
  if (url.searchParams.get("avatars")) {
    await seedAvatars();
    const cols = await db.select().from(avatarCollections).where(eq(avatarCollections.active, true)).orderBy(avatarCollections.sortOrder);
    const av = await db.select().from(avatars).where(eq(avatars.active, true));
    return { collections: cols.map((c) => ({ id: c.id, name: c.name, avatars: av.filter((a) => a.collectionId === c.id).map((a) => ({ id: a.id, name: a.name, imageUrl: a.imageUrl, gradient: a.gradient })) })) };
  }
  return { profiles: list.map(publicProfile), activeId: s.activeProfileId, max: s.user.maxProfiles };
});

export const POST = handle(async (req) => {
  const s = await requireUser();
  const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(profiles).where(eq(profiles.userId, s.user.id));
  if (count >= s.user.maxProfiles) throw new ApiError(400, `Limite de ${s.user.maxProfiles} perfis atingido.`);
  const b = await body(req);
  const name = str(b.name, 24);
  if (name.length < 2) throw new ApiError(400, "Informe um nome de exibição (mín. 2 caracteres).");
  const pin = typeof b.pin === "string" && b.pin ? b.pin : null;
  if (pin && !/^\d{4}$/.test(pin)) throw new ApiError(400, "O PIN deve ter 4 dígitos.");
  const gradient = str(b.avatarGradient, 200);
  const [p] = await db
    .insert(profiles)
    .values({
      userId: s.user.id,
      name,
      avatarId: typeof b.avatarId === "string" && /^[0-9a-f-]{36}$/.test(b.avatarId) ? b.avatarId : null,
      avatarUrl: validAvatarUrl(b.avatarUrl),
      avatarGradient: /^linear-gradient\([#a-zA-Z0-9(),.% -]+\)$/.test(gradient) ? gradient : null,
      pinHash: pin ? hashSecret(pin) : null,
      favoriteGenres: Array.isArray(b.favoriteGenres) ? b.favoriteGenres.map(Number).filter(Number.isFinite).slice(0, 12) : [],
      favoriteTitles: Array.isArray(b.favoriteTitles)
        ? (b.favoriteTitles as { id: number; type: string; title: string; poster: string | null }[]).slice(0, 12).map((t) => ({ id: Number(t.id), type: t.type === "tv" ? "tv" : "movie", title: str(t.title, 150), poster: typeof t.poster === "string" ? t.poster.slice(0, 80) : null }))
        : [],
    })
    .returning();
  return { profile: publicProfile(p) };
});
