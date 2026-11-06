import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { searchHistory } from "@/db/schema";
import { requireProfile, requireUser } from "@/lib/server/auth";
import { handle, int, rateLimit, str } from "@/lib/server/http";
import { card, kindParams, LANG_MAP, tmdb, type Card } from "@/lib/server/tmdb";

export const dynamic = "force-dynamic";
type Res = { results: never[]; total_pages: number; page: number };

/** Search + discover (Explorar, global search, command palette). */
export const GET = handle(async (req) => {
  const s = await requireUser(); // usable during first-profile onboarding (no active profile yet)
  await rateLimit(`disc:${s.user.id}`, 240, 60);
  const sp = new URL(req.url).searchParams;
  const language = LANG_MAP[s.user.lang] || "pt-BR";
  const page = Math.min(Math.max(int(sp.get("page"), 1), 1), 20);
  const q = str(sp.get("q"), 100);
  const keep = (i: { poster_path?: string | null; backdrop_path?: string | null }) => i.poster_path || i.backdrop_path;

  if (q) {
    const r = await tmdb<Res>("/search/multi", { query: q, language, page, include_adult: "false" }, 300);
    if (page === 1 && sp.get("save") && s.activeProfileId) {
      await db.insert(searchHistory).values({ profileId: s.activeProfileId, query: q }).onConflictDoUpdate({ target: [searchHistory.profileId, searchHistory.query], set: { createdAt: new Date() } });
    }
    const items: Card[] = (r.results as { media_type: string }[]).filter((i) => (i.media_type === "movie" || i.media_type === "tv") && keep(i as never)).map((i) => card(i as never));
    return { items, page, totalPages: r.total_pages };
  }

  const kind = sp.get("kind") || "movies";
  const { type, params } = kindParams(kind);
  const p: Record<string, string | number> = { language, page, ...params, sort_by: str(sp.get("sort"), 40) || "popularity.desc", "vote_count.gte": sp.get("sort") === "vote_average.desc" ? 300 : 30 };
  const genre = str(sp.get("genre"), 10);
  if (genre) {
    const tv: Record<string, string> = { 28: "10759", 12: "10759", 878: "10765", 14: "10765", 10752: "10768" };
    p.with_genres = type === "tv" ? (tv[genre] ?? genre) : genre;
    if (params.with_genres) p.with_genres = `${params.with_genres},${p.with_genres}`;
  }
  const year = int(sp.get("year"), 0);
  if (year > 1900 && year < 2100) p[type === "movie" ? "primary_release_year" : "first_air_date_year"] = year;
  const provider = int(sp.get("provider"), 0);
  if (provider) Object.assign(p, { with_watch_providers: provider, watch_region: "BR" });
  const r = await tmdb<Res>(`/discover/${type}`, p, 900);
  return { items: (r.results as { poster_path?: string }[]).filter(keep as never).map((i) => card(i as never, type)), page, totalPages: Math.min(r.total_pages, 20) };
});

export const DELETE = handle(async (req) => {
  const s = await requireProfile();
  const q = str(new URL(req.url).searchParams.get("q"), 100);
  if (q) await db.delete(searchHistory).where(and(eq(searchHistory.profileId, s.profile.id), eq(searchHistory.query, q)));
  else await db.delete(searchHistory).where(eq(searchHistory.profileId, s.profile.id));
  return { ok: true };
});
