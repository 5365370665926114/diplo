import { ApiError } from "./http";
import { getSetting } from "./settings";

const BASE = "https://api.themoviedb.org/3";

export async function tmdbConfigured() {
  return !!(await getSetting("TMDB_API_KEY"));
}

export async function tmdb<T = Record<string, unknown>>(path: string, params: Record<string, string | number | undefined> = {}, revalidate = 600): Promise<T> {
  const key = await getSetting("TMDB_API_KEY");
  if (!key) throw new ApiError(503, "TMDB não configurado. Um administrador precisa informar a TMDB_API_KEY.", "tmdb_not_configured");
  const url = new URL(BASE + path);
  const headers: Record<string, string> = { accept: "application/json" };
  if (key.length > 60) headers.authorization = `Bearer ${key}`;
  else url.searchParams.set("api_key", key);
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== "") url.searchParams.set(k, String(v));
  const r = await fetch(url, { headers, next: { revalidate }, signal: AbortSignal.timeout(9000) });
  if (r.status === 401) throw new ApiError(502, "Chave TMDB inválida.", "tmdb_invalid_key");
  if (r.status === 404) throw new ApiError(404, "Conteúdo não encontrado.");
  if (!r.ok) throw new ApiError(502, `TMDB respondeu ${r.status}.`);
  return (await r.json()) as T;
}

export const LANG_MAP: Record<string, string> = { "pt-BR": "pt-BR", en: "en-US", es: "es-ES" };

type Item = {
  id: number;
  media_type?: string;
  title?: string;
  name?: string;
  poster_path?: string | null;
  backdrop_path?: string | null;
  overview?: string;
  vote_average?: number;
  release_date?: string;
  first_air_date?: string;
  genre_ids?: number[];
  original_language?: string;
  origin_country?: string[];
};

/** Slim card shape used by the UI. */
export function card(i: Item, forced?: "movie" | "tv") {
  const type = forced || (i.media_type === "tv" || (!i.media_type && i.name) ? "tv" : "movie");
  return {
    id: i.id,
    type,
    title: i.title || i.name || "",
    poster: i.poster_path ?? null,
    backdrop: i.backdrop_path ?? null,
    overview: i.overview ?? "",
    rating: Math.round((i.vote_average ?? 0) * 10) / 10,
    year: (i.release_date || i.first_air_date || "").slice(0, 4),
    genres: i.genre_ids ?? [],
  };
}
export type Card = ReturnType<typeof card>;

/** Pull the media "kind" filters (anime = JP animation, dorama = KR drama). */
export function kindParams(kind: string): { type: "movie" | "tv"; params: Record<string, string> } {
  switch (kind) {
    case "movies":
      return { type: "movie", params: {} };
    case "series":
      return { type: "tv", params: {} };
    case "animes":
      return { type: "tv", params: { with_genres: "16", with_original_language: "ja" } };
    case "doramas":
      return { type: "tv", params: { with_original_language: "ko", with_origin_country: "KR", without_genres: "16" } };
    default:
      return { type: "movie", params: {} };
  }
}
