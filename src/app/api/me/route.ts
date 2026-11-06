import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { onboardingProgress, profiles, users, notifications } from "@/db/schema";
import { destroySession, getSession, publicProfile, publicUser, requireUser, verifySecret } from "@/lib/server/auth";
import { ApiError, body, handle, str } from "@/lib/server/http";
import { getFlags, getSetting } from "@/lib/server/settings";

export const dynamic = "force-dynamic";

export const GET = handle(async () => {
  const s = await getSession();
  if (!s) return Response.json({ user: null }, { status: 401 });
  const [p, steps, notes, flags, notice, site] = await Promise.all([
    s.activeProfileId ? db.select().from(profiles).where(and(eq(profiles.id, s.activeProfileId), eq(profiles.userId, s.user.id))).limit(1) : Promise.resolve([]),
    db.select().from(onboardingProgress).where(eq(onboardingProgress.userId, s.user.id)),
    db.select().from(notifications).where(eq(notifications.userId, s.user.id)).orderBy(notifications.createdAt).limit(30),
    getFlags(),
    getSetting("GLOBAL_NOTICE"),
    getSetting("SITE_NAME"),
  ]);
  const profile = p[0] ? publicProfile(p[0]) : null;
  const done = steps.filter((x) => x.scope === "account" || x.scope === p[0]?.id).map((x) => `${x.scope === "account" ? "account" : "profile"}:${x.step}`);
  return {
    user: publicUser(s.user, s.isAdmin),
    profile,
    flags,
    notice,
    siteName: site || "DiploCine",
    onboarding: done,
    notifications: notes.reverse().map((n) => ({ id: n.id, title: n.title, body: n.body, read: !!n.readAt, at: n.createdAt })),
  };
});

export const PATCH = handle(async (req) => {
  const s = await requireUser();
  const b = await body(req);
  const set: Partial<typeof users.$inferInsert> = {};
  if (typeof b.name === "string" && str(b.name, 60).length >= 2) set.name = str(b.name, 60);
  if (["pt-BR", "en", "es"].includes(str(b.lang))) set.lang = str(b.lang);
  if (Object.keys(set).length) await db.update(users).set(set).where(eq(users.id, s.user.id));
  return { ok: true };
});

/** LGPD: account + all personal data deletion (requires password). */
export const DELETE = handle(async (req) => {
  const s = await requireUser();
  const b = await body(req);
  if (!verifySecret(typeof b.password === "string" ? b.password : "", s.user.passwordHash)) throw new ApiError(400, "Senha incorreta.");
  await db.delete(users).where(eq(users.id, s.user.id));
  await destroySession();
  return { ok: true };
});
