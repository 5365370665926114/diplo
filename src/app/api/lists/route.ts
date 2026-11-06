import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { listItems } from "@/db/schema";
import { requireProfile } from "@/lib/server/auth";
import { ApiError, body, handle, int, str } from "@/lib/server/http";

export const dynamic = "force-dynamic";

export const GET = handle(async () => {
  const s = await requireProfile();
  const rows = await db.select().from(listItems).where(eq(listItems.profileId, s.profile.id)).orderBy(desc(listItems.createdAt));
  const lists: Record<string, typeof rows> = { favorites: [], watchlist: [] };
  for (const r of rows) (lists[r.list] ||= []).push(r);
  return { lists };
});

/** Toggle an item in a list (favorites | watchlist | custom name). */
export const POST = handle(async (req) => {
  const s = await requireProfile();
  const b = await body(req);
  const list = str(b.list, 40) || "favorites";
  const tmdbId = int(b.tmdbId);
  const mediaType = b.type === "tv" ? "tv" : "movie";
  if (!tmdbId) throw new ApiError(400, "Conteúdo inválido.");
  const where = and(eq(listItems.profileId, s.profile.id), eq(listItems.list, list), eq(listItems.tmdbId, tmdbId), eq(listItems.mediaType, mediaType));
  const [ex] = await db.select({ id: listItems.id }).from(listItems).where(where).limit(1);
  if (ex) {
    await db.delete(listItems).where(where);
    return { active: false };
  }
  await db.insert(listItems).values({ profileId: s.profile.id, list, tmdbId, mediaType, title: str(b.title, 200) || "Sem título", posterPath: str(b.poster, 80) || null, backdropPath: str(b.backdrop, 80) || null });
  return { active: true };
});
