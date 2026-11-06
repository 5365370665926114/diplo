import crypto from "node:crypto";
import { cookies, headers } from "next/headers";
import { and, eq, gt } from "drizzle-orm";
import { db } from "@/db";
import { profiles, sessions, users } from "@/db/schema";
import { ApiError } from "./http";
import { getFlags } from "./settings";

const COOKIE = "dc_session";
const TTL_DAYS = 30;

export function hashSecret(plain: string): string {
  const salt = crypto.randomBytes(16);
  const h = crypto.scryptSync(plain, salt, 64, { N: 16384, r: 8, p: 1 });
  return `s1$${salt.toString("base64")}$${h.toString("base64")}`;
}

export function verifySecret(plain: string, stored: string): boolean {
  const [v, saltB, hashB] = stored.split("$");
  if (v !== "s1" || !saltB || !hashB) return false;
  const expected = Buffer.from(hashB, "base64");
  const h = crypto.scryptSync(plain, Buffer.from(saltB, "base64"), expected.length, { N: 16384, r: 8, p: 1 });
  return crypto.timingSafeEqual(h, expected);
}

const sha = (s: string) => crypto.createHash("sha256").update(s).digest("hex");

export function adminEmails(): string[] {
  return (process.env.ADMIN_EMAILS || "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
}

export async function createSession(userId: string) {
  const token = crypto.randomBytes(32).toString("base64url");
  const ua = (await headers()).get("user-agent")?.slice(0, 200) ?? null;
  const expiresAt = new Date(Date.now() + TTL_DAYS * 86400_000);
  await db.insert(sessions).values({ id: sha(token), userId, expiresAt, userAgent: ua });
  const h = await headers();
  const secure = (h.get("x-forwarded-proto") || "").includes("https");
  (await cookies()).set(COOKIE, token, { httpOnly: true, sameSite: "lax", secure, path: "/", expires: expiresAt });
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (token) await db.delete(sessions).where(eq(sessions.id, sha(token)));
  jar.delete(COOKIE);
}

export type SessionCtx = {
  sessionId: string;
  user: typeof users.$inferSelect;
  activeProfileId: string | null;
  isAdmin: boolean;
};

export async function getSession(): Promise<SessionCtx | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  const id = sha(token);
  const [row] = await db
    .select({ s: sessions, u: users })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.id, id), gt(sessions.expiresAt, new Date())))
    .limit(1);
  if (!row || row.u.status !== "active") return null;
  const isAdmin = row.u.role === "admin" || adminEmails().includes(row.u.email.toLowerCase());
  return { sessionId: id, user: row.u, activeProfileId: row.s.activeProfileId, isAdmin };
}

export async function requireUser(): Promise<SessionCtx> {
  const s = await getSession();
  if (!s) throw new ApiError(401, "Faça login para continuar.", "unauthenticated");
  const flags = await getFlags();
  if (flags.maintenance && !s.isAdmin) throw new ApiError(503, "Plataforma em manutenção.", "maintenance");
  return s;
}

/** Profile selection is enforced server-side: the profile must belong to the user AND be active in the session (PIN verified on select). */
export async function requireProfile() {
  const s = await requireUser();
  if (!s.activeProfileId) throw new ApiError(403, "Selecione um perfil.", "no_profile");
  const [p] = await db
    .select()
    .from(profiles)
    .where(and(eq(profiles.id, s.activeProfileId), eq(profiles.userId, s.user.id)))
    .limit(1);
  if (!p) throw new ApiError(403, "Perfil inválido.", "no_profile");
  return { ...s, profile: p };
}

export async function requireAdmin(): Promise<SessionCtx> {
  const s = await getSession();
  if (!s) throw new ApiError(401, "Faça login para continuar.");
  if (!s.isAdmin) throw new ApiError(403, "Acesso restrito a administradores.");
  return s;
}

export async function setActiveProfile(sessionId: string, profileId: string | null) {
  await db.update(sessions).set({ activeProfileId: profileId }).where(eq(sessions.id, sessionId));
}

export function publicUser(u: typeof users.$inferSelect, isAdmin: boolean) {
  return { id: u.id, email: u.email, name: u.name, lang: u.lang, maxProfiles: u.maxProfiles, isAdmin };
}

export function publicProfile(p: typeof profiles.$inferSelect) {
  return {
    id: p.id,
    name: p.name,
    avatarUrl: p.avatarUrl,
    avatarGradient: p.avatarGradient,
    hasPin: !!p.pinHash,
    bio: p.bio,
    favoriteGenres: p.favoriteGenres,
    favoriteTitles: p.favoriteTitles,
    privacy: p.privacy,
    showInRankings: p.showInRankings,
    settings: p.settings,
    favoriteAvatarIds: p.favoriteAvatarIds,
    avatarId: p.avatarId,
  };
}
