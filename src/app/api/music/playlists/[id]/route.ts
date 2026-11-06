import crypto from "node:crypto";
import { and, asc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { musicPlaylistItems, musicPlaylists } from "@/db/schema";
import { getSession, requireProfile } from "@/lib/server/auth";
import { ApiError, body, handle, str } from "@/lib/server/http";
import { cleanTracks } from "@/lib/server/playlists";
import { getFlags } from "@/lib/server/settings";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };
const UUID = /^[0-9a-f-]{36}$/;

async function load(id: string) {
  if (!UUID.test(id) && !/^[a-z0-9]{6,20}$/.test(id)) throw new ApiError(404, "Playlist não encontrada.");
  const [pl] = await db.select().from(musicPlaylists).where(UUID.test(id) ? eq(musicPlaylists.id, id) : eq(musicPlaylists.shareSlug, id)).limit(1);
  if (!pl) throw new ApiError(404, "Playlist não encontrada.");
  return pl;
}

export const GET = handle<Ctx>(async (_req, ctx) => {
  const pl = await load((await ctx.params).id);
  const s = await getSession();
  const owner = !!s && s.activeProfileId === pl.profileId;
  if (!owner && (!pl.isPublic || pl.hiddenByAdmin)) throw new ApiError(404, "Playlist não encontrada.");
  const items = await db.select().from(musicPlaylistItems).where(eq(musicPlaylistItems.playlistId, pl.id)).orderBy(asc(musicPlaylistItems.position));
  return { playlist: pl, items, owner };
});

async function mine(id: string) {
  const s = await requireProfile();
  const pl = await load(id);
  if (pl.profileId !== s.profile.id) throw new ApiError(403, "Esta playlist pertence a outro perfil.");
  return { s, pl };
}
const touch = (id: string) => db.update(musicPlaylists).set({ updatedAt: new Date() }).where(eq(musicPlaylists.id, id));

export const PATCH = handle<Ctx>(async (req, ctx) => {
  const { pl } = await mine((await ctx.params).id);
  const b = await body(req);
  const set: Partial<typeof musicPlaylists.$inferInsert> = { updatedAt: new Date() };
  if (typeof b.name === "string" && str(b.name, 80)) set.name = str(b.name, 80);
  if (typeof b.description === "string") set.description = str(b.description, 300);
  if (typeof b.favorite === "boolean") set.favorite = b.favorite;
  if (typeof b.coverUrl === "string") {
    const c = str(b.coverUrl, 400);
    if (c && !/^https:\/\/[^\s"'<>]+$/.test(c)) throw new ApiError(400, "URL de capa inválida (use https).");
    set.coverUrl = c || null;
  }
  if (typeof b.isPublic === "boolean") {
    if (b.isPublic && !(await getFlags()).playlist_sharing) throw new ApiError(403, "Compartilhamento desativado.");
    set.isPublic = b.isPublic;
    if (b.isPublic && !pl.shareSlug) set.shareSlug = crypto.randomBytes(6).toString("hex");
  }
  await db.update(musicPlaylists).set(set).where(eq(musicPlaylists.id, pl.id));
  const [u] = await db.select().from(musicPlaylists).where(eq(musicPlaylists.id, pl.id)).limit(1);
  return { playlist: u };
});

export const DELETE = handle<Ctx>(async (_req, ctx) => {
  const { pl } = await mine((await ctx.params).id);
  await db.delete(musicPlaylists).where(eq(musicPlaylists.id, pl.id));
  return { ok: true };
});

export const POST = handle<Ctx>(async (req, ctx) => {
  const { s, pl } = await mine((await ctx.params).id);
  const b = await body(req);
  const op = str(b.op, 20);
  if (op === "add") {
    const tracks = cleanTracks(b.tracks);
    const [{ max }] = await db.select({ max: sql<number>`coalesce(max(position), -1)::int` }).from(musicPlaylistItems).where(eq(musicPlaylistItems.playlistId, pl.id));
    const rows = await db
      .insert(musicPlaylistItems)
      .values(tracks.map((t, i) => ({ playlistId: pl.id, ...t, artist: t.artist ?? "", position: max + 1 + i })))
      .onConflictDoNothing()
      .returning({ id: musicPlaylistItems.id });
    await touch(pl.id);
    return { added: rows.length, duplicates: tracks.length - rows.length };
  }
  if (op === "remove") {
    await db.delete(musicPlaylistItems).where(and(eq(musicPlaylistItems.playlistId, pl.id), eq(musicPlaylistItems.videoId, str(b.videoId, 20))));
    await touch(pl.id);
    return { ok: true };
  }
  if (op === "reorder") {
    const order = Array.isArray(b.order) ? b.order.filter((x): x is string => typeof x === "string").slice(0, 1000) : [];
    await db.transaction(async (tx) => {
      for (const [i, vid] of order.entries()) await tx.update(musicPlaylistItems).set({ position: i }).where(and(eq(musicPlaylistItems.playlistId, pl.id), eq(musicPlaylistItems.videoId, vid)));
    });
    await touch(pl.id);
    return { ok: true };
  }
  if (op === "duplicate") {
    const items = await db.select().from(musicPlaylistItems).where(eq(musicPlaylistItems.playlistId, pl.id)).orderBy(asc(musicPlaylistItems.position));
    const [copy] = await db.insert(musicPlaylists).values({ profileId: s.profile.id, name: `${pl.name} (cópia)`, description: pl.description, coverUrl: pl.coverUrl }).returning();
    if (items.length) await db.insert(musicPlaylistItems).values(items.map((i, k) => ({ playlistId: copy.id, videoId: i.videoId, title: i.title, artist: i.artist, thumbnail: i.thumbnail, durationSec: i.durationSec, position: k })));
    return { playlist: copy };
  }
  throw new ApiError(400, "Operação inválida.");
});
