import { and, desc, eq, gt, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import { playbackSessions, watchProgress } from "@/db/schema";
import { requireProfile } from "@/lib/server/auth";
import { ApiError, body, handle, int, rateLimit, str } from "@/lib/server/http";
import { getFlags, getSetting } from "@/lib/server/settings";

/**
 * Playback telemetry. Verified time is credited by the SERVER from heartbeats:
 *  - credit ≤ elapsed wall-clock (cap 30s per beat), so a client can't claim more time than passed;
 *  - with provider telemetry, credit ≤ actual media-position advance (pauses & seeks earn nothing; >2.5x speed flagged);
 *  - overlapping sessions (a newer one is alive) earn nothing; daily cap enforced.
 * Without provider telemetry the time is stored as unverified and never ranks.
 */
export const POST = handle(async (req) => {
  const s = await requireProfile();
  await rateLimit(`beat:${s.profile.id}`, 90, 60);
  const b = await body(req);
  const action = str(b.action, 10);
  const tmdbId = int(b.tmdbId);
  const mediaType = b.type === "tv" ? "tv" : "movie";
  const season = mediaType === "tv" ? int(b.season, 1) : 0;
  const episode = mediaType === "tv" ? int(b.episode, 1) : 0;
  const position = Math.max(0, Number(b.position) || 0);
  const duration = Math.max(0, Number(b.duration) || 0);
  const telemetry = b.telemetry === true;

  if (action === "start") {
    if (!tmdbId) throw new ApiError(400, "Conteúdo inválido.");
    const [row] = await db
      .insert(playbackSessions)
      .values({ userId: s.user.id, profileId: s.profile.id, tmdbId, mediaType, season, episode, provider: str(b.provider, 30) || "unknown", telemetry })
      .returning({ id: playbackSessions.id });
    await upsertProgress(s.profile.id, b, { tmdbId, mediaType, season, episode, position: 0, duration: 0, keep: true });
    return { sessionId: row.id };
  }

  const sid = str(b.sessionId, 40);
  if (!/^[0-9a-f-]{36}$/.test(sid)) throw new ApiError(400, "Sessão inválida.");
  const [sess] = await db.select().from(playbackSessions).where(and(eq(playbackSessions.id, sid), eq(playbackSessions.userId, s.user.id))).limit(1);
  if (!sess) throw new ApiError(404, "Sessão não encontrada.");
  const flags = await getFlags();
  const now = Date.now();
  const elapsed = Math.min(30, Math.max(0, (now - sess.lastBeatAt.getTime()) / 1000));
  let credit = 0;
  let flagged = sess.flagged;
  if (b.telemetry === true && flags.ranking_hours !== undefined) {
    const adv = position - sess.lastPosition;
    if (adv > 0 && elapsed > 0) {
      if (adv <= elapsed * 2.5) credit = Math.min(elapsed, adv);
      else if (adv <= 120 * 1) credit = 0; // a seek/jump: ignored
      if (adv > elapsed * 2.5 && adv < 4 && elapsed > 3) flagged = flagged || false;
    }
  } else if (!sess.telemetry) {
    credit = elapsed; // unverified wall-clock only
  }
  if (credit > 0 && sess.telemetry) {
    const [newer] = await db
      .select({ id: playbackSessions.id })
      .from(playbackSessions)
      .where(and(eq(playbackSessions.userId, s.user.id), ne(playbackSessions.id, sid), gt(playbackSessions.startedAt, sess.startedAt), gt(playbackSessions.lastBeatAt, new Date(now - 60_000))))
      .limit(1);
    if (newer) credit = 0;
    const cap = Number((await getSetting("RANKING_HOURS_DAILY_CAP_H")) || 20) * 3600;
    const [{ total }] = await db.select({ total: sql<number>`coalesce(sum(verified_seconds),0)::int` }).from(playbackSessions).where(and(eq(playbackSessions.profileId, s.profile.id), gt(playbackSessions.lastBeatAt, new Date(now - 86400_000))));
    if (total + credit > cap) {
      credit = 0;
      flagged = true;
    }
  }
  // fractional credit accumulates via rounding on position basis
  const add = Math.round(credit);
  await db
    .update(playbackSessions)
    .set({ lastBeatAt: new Date(now), lastPosition: b.telemetry === true ? position : sess.lastPosition, verifiedSeconds: sess.verifiedSeconds + add, flagged, telemetry: sess.telemetry || b.telemetry === true })
    .where(eq(playbackSessions.id, sid));
  if (b.telemetry === true && duration > 0) await upsertProgress(s.profile.id, b, { tmdbId: sess.tmdbId, mediaType: sess.mediaType, season: sess.season, episode: sess.episode, position, duration });
  return { ok: true, credited: add };
});

async function upsertProgress(profileId: string, b: Record<string, unknown>, p: { tmdbId: number; mediaType: string; season: number; episode: number; position: number; duration: number; keep?: boolean }) {
  const title = str(b.title, 200) || "Sem título";
  const completed = p.duration > 0 && p.position / p.duration > 0.92;
  await db
    .insert(watchProgress)
    .values({ profileId, tmdbId: p.tmdbId, mediaType: p.mediaType, season: p.season, episode: p.episode, positionSec: p.position, durationSec: p.duration, title, posterPath: str(b.poster, 80) || null, backdropPath: str(b.backdrop, 80) || null, completed })
    .onConflictDoUpdate({
      target: [watchProgress.profileId, watchProgress.tmdbId, watchProgress.mediaType, watchProgress.season, watchProgress.episode],
      set: p.keep ? { updatedAt: new Date(), title } : { positionSec: p.position, durationSec: p.duration, completed, updatedAt: new Date() },
    });
}

export const GET = handle(async () => {
  const s = await requireProfile();
  const rows = await db.select().from(watchProgress).where(eq(watchProgress.profileId, s.profile.id)).orderBy(desc(watchProgress.updatedAt)).limit(60);
  return { items: rows };
});
