import { sql } from "drizzle-orm";
import { db } from "@/db";
import { getSetting } from "./settings";

export const LEVELS = [
  { level: 1, name: "Espectador", hours: 0 },
  { level: 2, name: "Cinéfilo", hours: 10 },
  { level: 3, name: "Crítico", hours: 50 },
  { level: 4, name: "Curador", hours: 150 },
  { level: 5, name: "Lenda", hours: 500 },
];
export function levelFor(hours: number) {
  return [...LEVELS].reverse().find((l) => hours >= l.hours) ?? LEVELS[0];
}

export const ACHIEVEMENTS: Record<string, { name: string; desc: string }> = {
  first_play: { name: "Primeira sessão", desc: "Assista ao primeiro conteúdo com tempo verificado." },
  hours_10: { name: "Maratonista", desc: "10 horas verificadas." },
  hours_50: { name: "Sessão contínua", desc: "50 horas verificadas." },
  hours_150: { name: "Curador", desc: "150 horas verificadas." },
  fav_5: { name: "Coleção iniciada", desc: "5 favoritos." },
  playlist_1: { name: "DJ de plantão", desc: "Crie uma playlist no DiploMusic." },
  supporter: { name: "Apoiador", desc: "Doação PIX confirmada." },
};

function periodSql(period: string) {
  if (period === "week") return sql`and s.last_beat_at >= date_trunc('week', now())`;
  if (period === "month") return sql`and s.last_beat_at >= date_trunc('month', now())`;
  return sql``;
}

/**
 * Verified hours: only seconds credited by the server from authenticated heartbeats
 * (see /api/playback). By default requires provider telemetry and a minimum session length;
 * flagged sessions (impossible speed / overlap) are excluded.
 */
export async function hoursRanking(period: string, limit: number) {
  const minSession = Number((await getSetting("RANKING_HOURS_MIN_SESSION_SEC")) || 60);
  const requireTel = ((await getSetting("RANKING_HOURS_REQUIRE_TELEMETRY")) ?? "1") !== "0";
  const res = await db.execute(sql`
    select p.id, p.name, p.avatar_url, p.avatar_gradient,
      round(sum(s.verified_seconds)::numeric / 3600, 2)::float as hours
    from playback_sessions s
    join profiles p on p.id = s.profile_id
    where s.flagged = false and s.verified_seconds >= ${minSession}
      and p.show_in_rankings = true and p.privacy = 'public'
      ${requireTel ? sql`and s.telemetry = true` : sql``}
      ${periodSql(period)}
    group by p.id order by hours desc limit ${limit}`);
  return res.rows as { id: string; name: string; avatar_url: string | null; avatar_gradient: string | null; hours: number }[];
}

export async function profileHours(profileId: string): Promise<{ verified: number; unverified: number }> {
  const minSession = Number((await getSetting("RANKING_HOURS_MIN_SESSION_SEC")) || 60);
  const res = await db.execute(sql`
    select
      coalesce(sum(verified_seconds) filter (where telemetry and not flagged and verified_seconds >= ${minSession}),0)::float / 3600 as verified,
      coalesce(sum(verified_seconds) filter (where not telemetry or flagged),0)::float / 3600 as unverified
    from playback_sessions where profile_id = ${profileId}`);
  const r = res.rows[0] as { verified: number; unverified: number };
  return { verified: Math.round(r.verified * 100) / 100, unverified: Math.round(r.unverified * 100) / 100 };
}

export async function donationsRanking(period: string, limit: number) {
  const filter =
    period === "month" ? sql`and t.confirmed_at >= date_trunc('month', now())` : sql``;
  const res = await db.execute(sql`
    select coalesce(case when t.anonymous then null else p.id end, null) as profile_id,
      case when t.anonymous then 'Apoiador anônimo' else coalesce(p.name, 'Apoiador') end as name,
      case when t.anonymous then null else p.avatar_url end as avatar_url,
      case when t.anonymous then null else p.avatar_gradient end as avatar_gradient,
      sum(t.amount_cents)::int as cents, count(*)::int as count
    from payment_transactions t
    left join profiles p on p.id = t.profile_id
    where t.status = 'confirmed' ${filter}
    group by case when t.anonymous then t.id::text else coalesce(p.id::text, t.id::text) end, t.anonymous, p.id, p.name, p.avatar_url, p.avatar_gradient
    order by cents desc limit ${limit}`);
  return res.rows as { profile_id: string | null; name: string; avatar_url: string | null; avatar_gradient: string | null; cents: number; count: number }[];
}

/** Unlock achievements from real data; returns all unlocked codes. */
export async function syncAchievements(profileId: string, userId: string): Promise<{ code: string; unlockedAt: string }[]> {
  const h = await profileHours(profileId);
  const q = await db.execute(sql`
    select
      (select count(*) from list_items where profile_id=${profileId} and list='favorites')::int as favs,
      (select count(*) from music_playlists where profile_id=${profileId})::int as pls,
      (select count(*) from payment_transactions where user_id=${userId} and status='confirmed')::int as dons`);
  const r = q.rows[0] as { favs: number; pls: number; dons: number };
  const earned: string[] = [];
  if (h.verified > 0.01) earned.push("first_play");
  if (h.verified >= 10) earned.push("hours_10");
  if (h.verified >= 50) earned.push("hours_50");
  if (h.verified >= 150) earned.push("hours_150");
  if (r.favs >= 5) earned.push("fav_5");
  if (r.pls >= 1) earned.push("playlist_1");
  if (r.dons >= 1) earned.push("supporter");
  for (const code of earned) {
    await db.execute(sql`insert into achievements (profile_id, code) values (${profileId}, ${code}) on conflict do nothing`);
  }
  const rows = await db.execute(sql`select code, unlocked_at from achievements where profile_id=${profileId} order by unlocked_at`);
  return (rows.rows as { code: string; unlocked_at: string }[]).map((x) => ({ code: x.code, unlockedAt: x.unlocked_at }));
}
