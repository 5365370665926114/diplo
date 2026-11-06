import { db } from "@/db";
import { musicPlaylists, musicPlaylistItems } from "@/db/schema";
import { requireProfile } from "@/lib/server/auth";
import { ApiError, body, handle, rateLimit, str } from "@/lib/server/http";
import { cleanTracks } from "@/lib/server/playlists";

export const dynamic = "force-dynamic";

export const POST = handle(async (req) => {
  const s = await requireProfile();
  await rateLimit(`pl:${s.profile.id}`, 30, 600);
  const b = await body(req);
  const name = str(b.name, 80);
  if (name.length < 1) throw new ApiError(400, "Dê um nome à playlist.");
  const [pl] = await db
    .insert(musicPlaylists)
    .values({ profileId: s.profile.id, name, description: str(b.description, 300), isPublic: false })
    .returning();
  const tracks = cleanTracks(b.tracks);
  if (tracks.length) await db.insert(musicPlaylistItems).values(tracks.map((t, i) => ({ playlistId: pl.id, ...t, artist: t.artist ?? "", position: i }))).onConflictDoNothing();
  return { playlist: pl, added: tracks.length };
});
