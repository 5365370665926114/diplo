import crypto from "node:crypto";
import { desc, eq, sql, and } from "drizzle-orm";
import { db } from "@/db";
import { aiCache, musicHistory, musicLikes, musicPrefs } from "@/db/schema";
import { requireProfile } from "@/lib/server/auth";
import { ApiError, body, fetchJson, handle, rateLimit, str, int } from "@/lib/server/http";
import { getFlags } from "@/lib/server/settings";
import { parsePlaylistId, playlistPage, searchTracks, type Track } from "@/lib/server/youtube";
import { MUSIC_MOODS } from "@/lib/genres";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ action: string }> };

async function cached<T>(key: string, ttlSec: number, fn: () => Promise<T>): Promise<T> {
  const [hit] = await db.select().from(aiCache).where(eq(aiCache.key, key)).limit(1);
  if (hit && Date.now() - hit.createdAt.getTime() < ttlSec * 1000) return hit.value as T;
  const v = await fn();
  await db.insert(aiCache).values({ key, value: v as never }).onConflictDoUpdate({ target: aiCache.key, set: { value: v as never, createdAt: new Date() } });
  return v;
}

type Deezer = { id: number; name: string; picture_medium?: string; picture_big?: string; nb_fan?: number };
const dz = (a: Deezer) => ({ id: a.id, name: a.name, picture: a.picture_big || a.picture_medium || null });

function parseLrc(lrc: string) {
  const out: { t: number; line: string }[] = [];
  for (const l of lrc.split("\n")) {
    const m = /^\[(\d+):(\d+(?:\.\d+)?)\](.*)$/.exec(l.trim());
    if (m) out.push({ t: +m[1] * 60 + parseFloat(m[2]), line: m[3].trim() });
  }
  return out;
}
const cleanTitle = (t: string) => t.replace(/\(.*?\)|\[.*?\]|official|video|lyrics|clipe|ft\..*|feat\..*|hd|4k/gi, "").replace(/\s+/g, " ").trim();

const trackOf = (b: Record<string, unknown>) => {
  const videoId = str(b.videoId, 20);
  if (!/^[A-Za-z0-9_-]{6,20}$/.test(videoId)) throw new ApiError(400, "Faixa inválida.");
  return { videoId, title: str(b.title, 300) || "Sem título", artist: str(b.artist, 200), thumbnail: /^https:\/\//.test(str(b.thumbnail, 400)) ? str(b.thumbnail, 400) : null, durationSec: b.durationSec ? int(b.durationSec) : null };
};

export const GET = handle<Ctx>(async (req, ctx) => {
  const { action } = await ctx.params;
  const s = await requireProfile();
  const flags = await getFlags();
  if (!flags.diplomusic) throw new ApiError(403, "DiploMusic desativado pelo administrador.");
  const sp = new URL(req.url).searchParams;
  const pid = s.profile.id;

  if (action === "search") {
    await rateLimit(`msearch:${pid}`, 40, 60);
    const q = str(sp.get("q"), 120);
    if (q.length < 2) throw new ApiError(400, "Digite ao menos 2 caracteres.");
    return cached(`ms:${q.toLowerCase()}:${sp.get("page") || ""}`, 6 * 3600, () => searchTracks(q, sp.get("page") || undefined));
  }

  if (action === "artists") {
    const q = str(sp.get("q"), 80);
    const url = q ? `https://api.deezer.com/search/artist?q=${encodeURIComponent(q)}&limit=24` : `https://api.deezer.com/chart/0/artists?limit=30`;
    const r = await fetchJson<{ data?: Deezer[] }>(url, {}, 8000).catch(() => null);
    if (!r?.data?.data) throw new ApiError(502, "Catálogo de artistas indisponível no momento.");
    return { artists: r.data.data.map(dz), source: "Deezer" };
  }

  if (action === "related") {
    const id = int(sp.get("id"));
    const r = await fetchJson<{ data?: Deezer[] }>(`https://api.deezer.com/artist/${id}/related?limit=10`, {}, 8000).catch(() => null);
    return { artists: (r?.data?.data ?? []).map(dz) };
  }

  if (action === "prefs") {
    const [p] = await db.select().from(musicPrefs).where(eq(musicPrefs.profileId, pid)).limit(1);
    return { prefs: p ?? { artists: [], genres: [], moods: [], mode: "youtube", completed: false } };
  }

  if (action === "discover") {
    const [p] = await db.select().from(musicPrefs).where(eq(musicPrefs.profileId, pid)).limit(1);
    const artists = p?.artists ?? [];
    const genres = p?.genres ?? [];
    const moods = p?.moods ?? [];
    const sections: { id: string; title: string; query: string }[] = [];
    if (artists.length) sections.push({ id: "foryou", title: "Feito para você", query: `${artists.slice(0, 2).map((a) => a.name).join(" ")} ${genres[0] ?? ""} songs`.trim() });
    artists.slice(0, 2).forEach((a, i) => sections.push({ id: `artist${i}`, title: `Seus artistas · ${a.name}`, query: `${a.name} greatest hits` }));
    for (const m of moods.slice(0, 2)) {
      const d = MUSIC_MOODS.find((x) => x.id === m);
      if (d) sections.push({ id: `mood-${m}`, title: d.label, query: `${d.query} ${genres[0] ?? ""}`.trim() });
    }
    if (!sections.length) sections.push({ id: "top", title: "Em alta agora", query: "top hits" }, { id: "relax", title: "Para relaxar", query: "relaxing music" });
    sections.push({ id: "new", title: "Lançamentos disponíveis", query: `new music release ${new Date().getFullYear()} ${genres[0] ?? ""}`.trim() });
    const key = crypto.createHash("sha1").update(sections.map((x) => x.query).join("|")).digest("hex");
    const out: { id: string; title: string; tracks: Track[] }[] = [];
    let error: string | null = null;
    for (const sec of sections.slice(0, 6)) {
      try {
        const r = await cached(`md:${key}:${sec.id}`, 6 * 3600, () => searchTracks(sec.query));
        out.push({ id: sec.id, title: sec.title, tracks: r.tracks.slice(0, 12) });
      } catch (e) {
        error = e instanceof Error ? e.message : "Falha";
        break;
      }
    }
    return { sections: out, error };
  }

  if (action === "library") {
    const [likes, history, playlists] = await Promise.all([
      db.select().from(musicLikes).where(eq(musicLikes.profileId, pid)).orderBy(desc(musicLikes.createdAt)).limit(200),
      db.select().from(musicHistory).where(eq(musicHistory.profileId, pid)).orderBy(desc(musicHistory.playedAt)).limit(40),
      db.execute(sql`select p.id, p.name, p.description, p.cover_url, p.is_public, p.favorite, p.share_slug, p.updated_at, p.hidden_by_admin,
        count(i.id)::int as tracks, coalesce(sum(i.duration_sec),0)::int as duration,
        (array_agg(i.thumbnail order by i.position) filter (where i.thumbnail is not null))[1] as thumb
        from music_playlists p left join music_playlist_items i on i.playlist_id = p.id where p.profile_id = ${pid} group by p.id order by p.favorite desc, p.updated_at desc`),
    ]);
    return { likes, history, playlists: playlists.rows };
  }

  if (action === "lyrics") {
    if (!flags.lyrics) throw new ApiError(403, "Letras desativadas.");
    await rateLimit(`lyr:${pid}`, 60, 60);
    const title = cleanTitle(str(sp.get("title"), 200));
    const artist = str(sp.get("artist"), 120);
    const dur = int(sp.get("duration"));
    const key = `lyr:${title}:${artist}`.toLowerCase();
    return cached(key, 7 * 86400, async () => {
      const mk = (j: { syncedLyrics?: string | null; plainLyrics?: string | null; instrumental?: boolean; artistName?: string; trackName?: string }) => ({
        found: true,
        synced: j.syncedLyrics ? parseLrc(j.syncedLyrics) : [],
        plain: j.plainLyrics ?? "",
        instrumental: !!j.instrumental,
        source: "LRCLIB",
        match: `${j.artistName} — ${j.trackName}`,
      });
      const g = await fetchJson<never>(`https://lrclib.net/api/get?track_name=${encodeURIComponent(title)}&artist_name=${encodeURIComponent(artist)}${dur ? `&duration=${dur}` : ""}`, {}, 8000).catch(() => null);
      if (g?.status === 200 && g.data) return mk(g.data);
      const r = await fetchJson<never[]>(`https://lrclib.net/api/search?q=${encodeURIComponent(`${artist} ${title}`.trim())}`, {}, 8000).catch(() => null);
      const first = r?.data?.find((x: { syncedLyrics?: string }) => x.syncedLyrics) ?? r?.data?.[0];
      return first ? mk(first) : { found: false, synced: [], plain: "", instrumental: false, source: "LRCLIB", match: "" };
    });
  }
  throw new ApiError(404, "Não encontrado.");
});

export const POST = handle<Ctx>(async (req, ctx) => {
  const { action } = await ctx.params;
  const s = await requireProfile();
  const pid = s.profile.id;
  const b = await body(req);

  if (action === "prefs") {
    const artists = Array.isArray(b.artists) ? (b.artists as { id: number; name: string; picture: string | null }[]).slice(0, 30).map((a) => ({ id: int(a.id), name: str(a.name, 120), picture: typeof a.picture === "string" ? a.picture.slice(0, 300) : null })) : [];
    const genres = Array.isArray(b.genres) ? b.genres.map((x) => str(x, 30)).filter(Boolean).slice(0, 20) : [];
    const moods = Array.isArray(b.moods) ? b.moods.map((x) => str(x, 30)).filter(Boolean).slice(0, 8) : [];
    const mode = b.mode === "spotify-inspired" ? "spotify-inspired" : "youtube";
    const completed = b.completed === true;
    await db.insert(musicPrefs).values({ profileId: pid, artists, genres, moods, mode, completed }).onConflictDoUpdate({ target: musicPrefs.profileId, set: { artists, genres, moods, mode, ...(b.completed !== undefined ? { completed } : {}), updatedAt: new Date() } });
    return { ok: true };
  }
  if (action === "like") {
    const t = trackOf(b);
    const [ex] = await db.select().from(musicLikes).where(and(eq(musicLikes.profileId, pid), eq(musicLikes.videoId, t.videoId))).limit(1);
    if (ex) {
      await db.delete(musicLikes).where(and(eq(musicLikes.profileId, pid), eq(musicLikes.videoId, t.videoId)));
      return { liked: false };
    }
    await db.insert(musicLikes).values({ profileId: pid, ...t });
    return { liked: true };
  }
  if (action === "history") {
    const t = trackOf(b);
    await db.insert(musicHistory).values({ profileId: pid, ...t });
    return { ok: true };
  }
  if (action === "import-youtube") {
    await rateLimit(`mimp:${pid}`, 20, 600);
    const id = parsePlaylistId(str(b.url, 300));
    if (!id) throw new ApiError(400, "Link de playlist do YouTube inválido (precisa conter ?list=…).");
    return playlistPage(id, str(b.pageToken, 200) || undefined);
  }
  throw new ApiError(404, "Não encontrado.");
});
