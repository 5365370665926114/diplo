import { ApiError, fetchJson } from "./http";
import { getSetting } from "./settings";

const API = "https://www.googleapis.com/youtube/v3";

export type Track = { videoId: string; title: string; artist: string; thumbnail: string | null; durationSec: number | null };

async function key() {
  const k = await getSetting("YOUTUBE_API_KEY");
  if (!k) throw new ApiError(503, "YouTube Data API não configurada. Um administrador precisa informar a YOUTUBE_API_KEY.", "youtube_not_configured");
  return k;
}

export function parseDuration(iso: string): number {
  const m = /^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(iso || "");
  if (!m) return 0;
  return (+(m[1] || 0)) * 86400 + (+(m[2] || 0)) * 3600 + (+(m[3] || 0)) * 60 + +(m[4] || 0);
}

function cleanArtist(channel: string) {
  return channel.replace(/\s*-\s*Topic$/i, "").replace(/VEVO$/i, "").trim();
}

async function yt<T>(path: string, params: Record<string, string>): Promise<T> {
  const url = new URL(API + path);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.set("key", await key());
  const r = await fetchJson<T & { error?: { message?: string; errors?: { reason?: string }[] } }>(url.toString(), {}, 9000);
  if (r.status !== 200 || !r.data) {
    const reason = (r.data as { error?: { errors?: { reason?: string }[] } } | null)?.error?.errors?.[0]?.reason;
    if (reason === "quotaExceeded") throw new ApiError(429, "Cota diária da YouTube API esgotada.", "yt_quota");
    if (r.status === 404) throw new ApiError(404, "Não encontrado no YouTube (playlist privada ou inexistente).");
    throw new ApiError(502, `YouTube API respondeu ${r.status}${reason ? ` (${reason})` : ""}.`);
  }
  return r.data;
}

type VideoItem = {
  id: string;
  snippet: { title: string; channelTitle: string; thumbnails?: Record<string, { url: string }> };
  contentDetails?: { duration: string };
  status?: { embeddable?: boolean };
};

export async function videoDetails(ids: string[]): Promise<Track[]> {
  if (!ids.length) return [];
  const d = await yt<{ items: VideoItem[] }>("/videos", { part: "snippet,contentDetails,status", id: ids.join(","), maxResults: "50" });
  return d.items
    .filter((v) => v.status?.embeddable !== false)
    .map((v) => ({
      videoId: v.id,
      title: v.snippet.title,
      artist: cleanArtist(v.snippet.channelTitle),
      thumbnail: v.snippet.thumbnails?.medium?.url ?? v.snippet.thumbnails?.default?.url ?? null,
      durationSec: parseDuration(v.contentDetails?.duration || ""),
    }));
}

export async function searchTracks(q: string, pageToken?: string) {
  const d = await yt<{ items: { id: { videoId: string } }[]; nextPageToken?: string }>("/search", {
    part: "snippet",
    q,
    type: "video",
    videoCategoryId: "10",
    videoEmbeddable: "true",
    maxResults: "20",
    safeSearch: "moderate",
    ...(pageToken ? { pageToken } : {}),
  });
  const tracks = await videoDetails(d.items.map((i) => i.id.videoId).filter(Boolean));
  return { tracks, nextPageToken: d.nextPageToken ?? null };
}

export function parsePlaylistId(input: string): string | null {
  try {
    const u = new URL(input.trim());
    return u.searchParams.get("list");
  } catch {
    return /^[A-Za-z0-9_-]{10,}$/.test(input.trim()) ? input.trim() : null;
  }
}

export async function playlistPage(playlistId: string, pageToken?: string) {
  const d = await yt<{
    items: { snippet: { title: string; resourceId: { videoId: string } }; status?: { privacyStatus?: string } }[];
    nextPageToken?: string;
    pageInfo?: { totalResults?: number };
  }>("/playlistItems", { part: "snippet,status", playlistId, maxResults: "50", ...(pageToken ? { pageToken } : {}) });
  const ids = d.items
    .filter((i) => i.status?.privacyStatus !== "private" && i.snippet.title !== "Deleted video" && i.snippet.title !== "Private video")
    .map((i) => i.snippet.resourceId.videoId);
  const tracks = await videoDetails(ids);
  return { tracks, skipped: d.items.length - tracks.length, total: d.pageInfo?.totalResults ?? null, nextPageToken: d.nextPageToken ?? null };
}
