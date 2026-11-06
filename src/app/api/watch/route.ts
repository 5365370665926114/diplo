import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { watchProgress } from "@/db/schema";
import { requireProfile } from "@/lib/server/auth";
import { ApiError, handle, int } from "@/lib/server/http";
import { resolveProviders } from "@/lib/server/providers";

export const dynamic = "force-dynamic";

/** Resolves ONLY enabled + rights-confirmed providers whose availability was confirmed. */
export const GET = handle(async (req) => {
  const s = await requireProfile();
  const sp = new URL(req.url).searchParams;
  const type = sp.get("type") === "tv" ? "tv" : "movie";
  const tmdbId = int(sp.get("id"));
  if (!tmdbId) throw new ApiError(400, "Conteúdo inválido.");
  const season = type === "tv" ? Math.max(1, int(sp.get("season"), 1)) : undefined;
  const episode = type === "tv" ? Math.max(1, int(sp.get("episode"), 1)) : undefined;
  const [prog] = await db
    .select()
    .from(watchProgress)
    .where(and(eq(watchProgress.profileId, s.profile.id), eq(watchProgress.tmdbId, tmdbId), eq(watchProgress.mediaType, type), eq(watchProgress.season, season ?? 0), eq(watchProgress.episode, episode ?? 0)))
    .orderBy(desc(watchProgress.updatedAt))
    .limit(1);
  const startTime = prog && !prog.completed ? prog.positionSec : 0;
  const r = await resolveProviders({ type, tmdbId, season, episode, kind: sp.get("kind") ?? undefined, startTime });
  return { ...r, startTime, season, episode };
});
