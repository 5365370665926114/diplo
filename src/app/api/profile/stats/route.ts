import { sql } from "drizzle-orm";
import { db } from "@/db";
import { requireProfile } from "@/lib/server/auth";
import { handle } from "@/lib/server/http";
import { ACHIEVEMENTS, levelFor, profileHours, syncAchievements } from "@/lib/server/rankings";

export const dynamic = "force-dynamic";

export const GET = handle(async () => {
  const s = await requireProfile();
  const pid = s.profile.id;
  const q = (await db.execute(sql`select
    (select count(*) from watch_progress where profile_id=${pid} and media_type='movie' and completed)::int as movies,
    (select count(distinct tmdb_id) from watch_progress where profile_id=${pid} and media_type='tv')::int as series,
    (select count(*) from watch_progress where profile_id=${pid} and media_type='tv' and completed)::int as episodes,
    (select count(*) from list_items where profile_id=${pid} and list='favorites')::int as favorites,
    (select count(*) from music_playlists where profile_id=${pid})::int as playlists,
    (select count(*) from music_likes where profile_id=${pid})::int as likes`)).rows[0] as Record<string, number>;
  const week = (await db.execute(sql`select to_char(d,'Dy') as day, coalesce((select sum(verified_seconds) from playback_sessions where profile_id=${pid} and telemetry and not flagged and last_beat_at::date = d),0)::int as sec from generate_series(current_date - 6, current_date, '1 day') d`)).rows as { day: string; sec: number }[];
  const hours = await profileHours(pid);
  const ach = await syncAchievements(pid, s.user.id);
  const music = (await db.execute(sql`select genres, moods, artists from music_prefs where profile_id=${pid}`)).rows[0] ?? null;
  return { ...q, hours, level: levelFor(hours.verified), week, achievements: ach.map((a) => ({ ...a, ...(ACHIEVEMENTS[a.code] ?? { name: a.code, desc: "" }) })), music };
});
