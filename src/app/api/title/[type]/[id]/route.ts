import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { listItems, watchProgress } from "@/db/schema";
import { requireProfile } from "@/lib/server/auth";
import { ApiError, handle, int } from "@/lib/server/http";
import { card, LANG_MAP, tmdb } from "@/lib/server/tmdb";

export const dynamic = "force-dynamic";
type Any = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

export const GET = handle<{ params: Promise<{ type: string; id: string }> }>(async (req, ctx) => {
  const s = await requireProfile();
  const { type, id } = await ctx.params;
  if (type !== "movie" && type !== "tv") throw new ApiError(404, "Tipo inválido.");
  const tid = int(id);
  if (!tid) throw new ApiError(404, "Conteúdo não encontrado.");
  const language = LANG_MAP[s.user.lang] || "pt-BR";
  const sp = new URL(req.url).searchParams;

  const season = int(sp.get("season"), 0);
  if (type === "tv" && season > 0) {
    const d = await tmdb<Any>(`/tv/${tid}/season/${season}`, { language }, 1800);
    const prog = await db.select().from(watchProgress).where(and(eq(watchProgress.profileId, s.profile.id), eq(watchProgress.tmdbId, tid), eq(watchProgress.mediaType, "tv"), eq(watchProgress.season, season)));
    return {
      episodes: (d.episodes as Any[]).map((e) => {
        const p = prog.find((x) => x.episode === e.episode_number);
        return { number: e.episode_number, name: e.name, overview: e.overview, still: e.still_path, runtime: e.runtime, airDate: e.air_date, progress: p && p.durationSec ? Math.min(1, p.positionSec / p.durationSec) : 0, completed: !!p?.completed };
      }),
    };
  }

  const d = await tmdb<Any>(`/${type}/${tid}`, { language, append_to_response: "credits,videos,recommendations,external_ids,watch/providers", include_video_language: `${language.slice(0, 2)},en,null` }, 1800);
  const crew = (d.credits?.crew ?? []) as Any[];
  const videos = ((d.videos?.results ?? []) as Any[]).filter((v) => v.site === "YouTube");
  const trailer = videos.find((v) => v.type === "Trailer" && v.official) ?? videos.find((v) => v.type === "Trailer") ?? videos[0];
  const wp = (d["watch/providers"]?.results?.BR ?? d["watch/providers"]?.results?.US ?? {}) as Any;
  const lists = await db.select().from(listItems).where(and(eq(listItems.profileId, s.profile.id), eq(listItems.tmdbId, tid), eq(listItems.mediaType, type)));
  const [last] = await db.select().from(watchProgress).where(and(eq(watchProgress.profileId, s.profile.id), eq(watchProgress.tmdbId, tid), eq(watchProgress.mediaType, type))).orderBy(watchProgress.updatedAt).limit(1);
  const isAnime = type === "tv" && (d.genres as Any[]).some((g) => g.id === 16) && d.original_language === "ja";
  const isDorama = type === "tv" && d.original_language === "ko" && !(d.genres as Any[]).some((g) => g.id === 16);
  return {
    id: tid,
    type,
    kind: type === "movie" ? "movies" : isAnime ? "animes" : isDorama ? "doramas" : "series",
    title: d.title || d.name,
    tagline: d.tagline,
    overview: d.overview,
    poster: d.poster_path,
    backdrop: d.backdrop_path,
    rating: Math.round((d.vote_average ?? 0) * 10) / 10,
    votes: d.vote_count,
    year: (d.release_date || d.first_air_date || "").slice(0, 4),
    runtime: type === "movie" ? d.runtime : (d.episode_run_time?.[0] ?? null),
    status: d.status,
    genres: (d.genres as Any[]).map((g) => ({ id: g.id, name: g.name })),
    imdbId: d.external_ids?.imdb_id ?? d.imdb_id ?? null,
    seasons: type === "tv" ? (d.seasons as Any[]).filter((x) => x.season_number > 0).map((x) => ({ number: x.season_number, name: x.name, episodes: x.episode_count })) : [],
    cast: ((d.credits?.cast ?? []) as Any[]).slice(0, 14).map((c) => ({ id: c.id, name: c.name, character: c.character, photo: c.profile_path })),
    directors: type === "movie" ? crew.filter((c) => c.job === "Director").map((c) => c.name) : ((d.created_by ?? []) as Any[]).map((c) => c.name),
    trailer: trailer ? { key: trailer.key, name: trailer.name } : null,
    recommendations: ((d.recommendations?.results ?? []) as Any[]).filter((r) => r.poster_path).slice(0, 14).map((r) => card(r as never, type)),
    where: {
      link: wp.link ?? null,
      flatrate: ((wp.flatrate ?? []) as Any[]).map((p) => ({ id: p.provider_id, name: p.provider_name, logo: p.logo_path })),
      rent: ((wp.rent ?? []) as Any[]).map((p) => ({ id: p.provider_id, name: p.provider_name, logo: p.logo_path })),
      buy: ((wp.buy ?? []) as Any[]).map((p) => ({ id: p.provider_id, name: p.provider_name, logo: p.logo_path })),
    },
    state: { favorite: lists.some((l) => l.list === "favorites"), watchlist: lists.some((l) => l.list === "watchlist") },
    resume: last ? { season: last.season, episode: last.episode, position: last.positionSec, duration: last.durationSec, completed: last.completed } : null,
  };
});
