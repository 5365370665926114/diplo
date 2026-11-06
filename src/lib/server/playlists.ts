import { int, str } from "./http";

export type TrackIn = { videoId: string; title: string; artist?: string; thumbnail?: string | null; durationSec?: number | null };

/** Validates + de-duplicates incoming tracks (from search, YouTube import or JSON files). */
export function cleanTracks(raw: unknown): TrackIn[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: TrackIn[] = [];
  for (const t of raw.slice(0, 500) as Record<string, unknown>[]) {
    const videoId = str(t?.videoId, 20);
    if (!/^[A-Za-z0-9_-]{6,20}$/.test(videoId) || seen.has(videoId)) continue;
    seen.add(videoId);
    const th = str(t.thumbnail, 400);
    out.push({ videoId, title: str(t.title, 300) || "Sem título", artist: str(t.artist, 200), thumbnail: /^https:\/\//.test(th) ? th : null, durationSec: t.durationSec ? int(t.durationSec) : null });
  }
  return out;
}
