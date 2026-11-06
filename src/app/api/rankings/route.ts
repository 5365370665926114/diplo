import { requireProfile } from "@/lib/server/auth";
import { handle } from "@/lib/server/http";
import { ACHIEVEMENTS, LEVELS, donationsRanking, hoursRanking, levelFor, syncAchievements } from "@/lib/server/rankings";
import { getFlags } from "@/lib/server/settings";

export const dynamic = "force-dynamic";

export const GET = handle(async (req) => {
  const s = await requireProfile();
  const sp = new URL(req.url).searchParams;
  const type = sp.get("type") === "donations" ? "donations" : "hours";
  const period = ["week", "month", "all"].includes(sp.get("period") || "") ? (sp.get("period") as string) : "week";
  const limit = [10, 50, 100].includes(Number(sp.get("limit"))) ? Number(sp.get("limit")) : 10;
  const flags = await getFlags();
  const achievements = await syncAchievements(s.profile.id, s.user.id);
  const meta = { levels: LEVELS, achievements: ACHIEVEMENTS, mine: achievements };
  if (type === "hours") {
    if (!flags.ranking_hours) return { enabled: false, rows: [], ...meta };
    const rows = await hoursRanking(period, limit);
    return {
      enabled: true,
      rows: rows.map((r, i) => ({ rank: i + 1, id: r.id, name: r.name, avatarUrl: r.avatar_url, gradient: r.avatar_gradient, hours: r.hours, level: levelFor(r.hours).name, me: r.id === s.profile.id })),
      ...meta,
    };
  }
  if (!flags.ranking_donations) return { enabled: false, rows: [], ...meta };
  const rows = await donationsRanking(period === "month" ? "month" : "all", limit);
  return {
    enabled: true,
    rows: rows.map((r, i) => ({ rank: i + 1, name: r.name, avatarUrl: r.avatar_url, gradient: r.avatar_gradient, cents: r.cents, count: r.count, me: r.profile_id === s.profile.id })),
    ...meta,
  };
});
