import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { featuredItems, watchProgress } from "@/db/schema";
import { requireProfile } from "@/lib/server/auth";
import { handle } from "@/lib/server/http";
import { card, kindParams, LANG_MAP, tmdb, tmdbConfigured, type Card } from "@/lib/server/tmdb";
import { GENRES } from "@/lib/genres";

export const dynamic = "force-dynamic";

type Res = { results: never[] };
type Section = { id: string; title: string; variant?: "top10" | "wide" | "poster"; items: Card[]; href?: string };

export const GET = handle(async (req) => {
  const s = await requireProfile();
  if (!(await tmdbConfigured())) return { configured: false, sections: [], hero: [] };
  const kind = new URL(req.url).searchParams.get("kind") || "home";
  const language = LANG_MAP[s.user.lang] || "pt-BR";
  const favGenres = s.profile.favoriteGenres;
  const sections: Section[] = [];
  const list = (r: Res, forced?: "movie" | "tv") => r.results.filter((i: { poster_path?: string; backdrop_path?: string }) => i.poster_path || i.backdrop_path).map((i) => card(i, forced));
  const safe = <T,>(p: Promise<T>, fallback: T) => p.catch(() => fallback);
  const empty: Res = { results: [] };
  const today = new Date().toISOString().slice(0, 10);

  let hero: Card[] = [];
  if (kind === "home") {
    const [trendDay, trendWeek, nowPlaying, onAir, popular, top, rec] = await Promise.all([
      safe(tmdb<Res>("/trending/all/day", { language }, 900), empty),
      safe(tmdb<Res>("/trending/all/week", { language }, 1800), empty),
      safe(tmdb<Res>("/movie/now_playing", { language, region: "BR" }, 1800), empty),
      safe(tmdb<Res>("/tv/on_the_air", { language }, 1800), empty),
      safe(tmdb<Res>("/movie/popular", { language }, 1800), empty),
      safe(tmdb<Res>("/movie/top_rated", { language }, 3600), empty),
      favGenres.length ? safe(tmdb<Res>("/discover/movie", { language, with_genres: favGenres.slice(0, 3).join("|"), sort_by: "popularity.desc", "vote_count.gte": 200 }, 1800), empty) : Promise.resolve(empty),
    ]);
    const feat = await db.select().from(featuredItems).where(eq(featuredItems.active, true)).orderBy(featuredItems.sortOrder).limit(5);
    const featCards: Card[] = [];
    for (const f of feat) {
      const d = await safe(tmdb<never>(`/${f.mediaType}/${f.tmdbId}`, { language }, 3600), null);
      if (d) featCards.push({ ...card(d, f.mediaType === "tv" ? "tv" : "movie"), ...(f.tagline ? { overview: f.tagline } : {}) });
    }
    const td = list(trendDay);
    hero = [...featCards, ...td.filter((c) => c.backdrop && !featCards.some((f) => f.id === c.id))].slice(0, 8);

    const prog = await db.select().from(watchProgress).where(eq(watchProgress.profileId, s.profile.id)).orderBy(desc(watchProgress.updatedAt)).limit(40);
    const cont = prog.filter((p) => !p.completed && p.positionSec > 30).slice(0, 12);
    if (cont.length)
      sections.push({
        id: "continue",
        title: "Continuar assistindo",
        variant: "wide",
        items: cont.map((p) => ({ id: p.tmdbId, type: p.mediaType === "tv" ? "tv" : "movie", title: p.title + (p.mediaType === "tv" ? ` · T${p.season}E${p.episode}` : ""), poster: p.posterPath, backdrop: p.backdropPath, overview: "", rating: 0, year: "", genres: [], progress: p.durationSec ? Math.min(1, p.positionSec / p.durationSec) : 0, season: p.season, episode: p.episode } as Card)),
      });
    sections.push({ id: "top10", title: "Top 10 hoje", variant: "top10", items: td.slice(0, 10) });
    if (rec.results.length) sections.push({ id: "rec", title: "Recomendados para você", variant: "wide", items: list(rec, "movie") });
    sections.push({ id: "new", title: "Lançamentos nos cinemas", variant: "wide", items: list(nowPlaying, "movie") });
    sections.push({ id: "newep", title: "Novos episódios", variant: "wide", items: list(onAir, "tv") });
    sections.push({ id: "week", title: "Tendências da semana", variant: "wide", items: list(trendWeek) });
    sections.push({ id: "popular", title: "Mais populares", variant: "poster", items: list(popular, "movie") });
    sections.push({ id: "top", title: "Melhores avaliados", variant: "poster", items: list(top, "movie") });
    const gids = favGenres.length ? favGenres.slice(0, 3) : [28, 35, 878];
    const rails = await Promise.all(gids.map((g) => safe(tmdb<Res>("/discover/movie", { language, with_genres: g, sort_by: "popularity.desc", "vote_count.gte": 300 }, 1800), empty)));
    rails.forEach((r, i) => sections.push({ id: `g${gids[i]}`, title: `Descobertas em ${GENRES.find((g) => g.id === gids[i])?.pt ?? "gênero"}`, variant: "wide", items: list(r, "movie") }));
  } else {
    const { type, params } = kindParams(kind);
    const base = { language, ...params };
    const [pop, newer, top] = await Promise.all([
      safe(tmdb<Res>(`/discover/${type}`, { ...base, sort_by: "popularity.desc", "vote_count.gte": 50 }, 1800), empty),
      safe(tmdb<Res>(`/discover/${type}`, { ...base, sort_by: type === "movie" ? "primary_release_date.desc" : "first_air_date.desc", [type === "movie" ? "primary_release_date.lte" : "first_air_date.lte"]: today, "vote_count.gte": 20 }, 1800), empty),
      safe(tmdb<Res>(`/discover/${type}`, { ...base, sort_by: "vote_average.desc", "vote_count.gte": 300 }, 3600), empty),
    ]);
    hero = list(pop, type).filter((c) => c.backdrop).slice(0, 6);
    sections.push({ id: "pop", title: "Em alta", variant: "wide", items: list(pop, type) });
    sections.push({ id: "new", title: "Lançamentos", variant: "wide", items: list(newer, type) });
    sections.push({ id: "top", title: "Melhores avaliados", variant: "poster", items: list(top, type) });
    if (kind === "movies" || kind === "series") {
      const gids = (favGenres.length ? favGenres : [28, 18, 35]).slice(0, 3);
      const rails = await Promise.all(gids.map((g) => safe(tmdb<Res>(`/discover/${type}`, { ...base, with_genres: type === "tv" ? ({ 28: 10759, 12: 10759, 878: 10765, 14: 10765 } as Record<number, number>)[g] ?? g : g, sort_by: "popularity.desc", "vote_count.gte": 100 }, 1800), empty)));
      rails.forEach((r, i) => sections.push({ id: `g${gids[i]}`, title: GENRES.find((g) => g.id === gids[i])?.pt ?? "Gênero", variant: "wide", items: list(r, type) }));
    }
  }

  // Streaming providers ("onde assistir") — real TMDB provider list for the user's region
  let providers: { id: number; name: string; logo: string }[] = [];
  if (kind === "home") {
    const pr = await safe(tmdb<{ results: { provider_id: number; provider_name: string; logo_path: string; display_priorities?: Record<string, number> }[] }>("/watch/providers/movie", { language, watch_region: "BR" }, 86400), { results: [] });
    providers = pr.results.sort((a, b) => (a.display_priorities?.BR ?? 99) - (b.display_priorities?.BR ?? 99)).slice(0, 16).map((p) => ({ id: p.provider_id, name: p.provider_name, logo: p.logo_path }));
  }
  return { configured: true, hero, sections: sections.filter((x) => x.items.length), providers };
});
