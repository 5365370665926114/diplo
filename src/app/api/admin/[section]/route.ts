import { desc, eq, ilike, or, sql } from "drizzle-orm";
import { db } from "@/db";
import * as t from "@/db/schema";
import { requireAdmin, hashSecret } from "@/lib/server/auth";
import { ApiError, audit, body, fetchJson, handle, int, str } from "@/lib/server/http";
import { PROVIDERS, loadConfigs, providerMetrics, testProvider } from "@/lib/server/providers";
import { DEFAULT_FLAGS, SETTING_DEFS, deleteSetting, ensureSeed, getSetting, setSetting } from "@/lib/server/settings";
import { seedAvatars, validAvatarUrl } from "@/lib/server/avatars";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ section: string }> };

const count = async (q: string) => Number(((await db.execute(sql.raw(q))).rows[0] as { c: number }).c);

export const GET = handle<Ctx>(async (req, ctx) => {
  await requireAdmin();
  const { section } = await ctx.params;
  const sp = new URL(req.url).searchParams;

  if (section === "stats") {
    const [users, active, newUsers, profiles, sessions, hours, donations, raised, fails] = await Promise.all([
      count("select count(*)::int c from users"),
      count("select count(*)::int c from users where last_seen_at > now() - interval '7 days'"),
      count("select count(*)::int c from users where created_at > now() - interval '7 days'"),
      count("select count(*)::int c from profiles"),
      count("select count(*)::int c from playback_sessions"),
      count("select coalesce(sum(verified_seconds) filter (where telemetry and not flagged),0)::int/3600.0 c from playback_sessions"),
      count("select count(*)::int c from payment_transactions where status='confirmed'"),
      count("select coalesce(sum(amount_cents),0)::int c from payment_transactions where status='confirmed'"),
      count("select count(*)::int c from provider_logs where not ok and created_at > now() - interval '7 days'"),
    ]);
    const growth = (await db.execute(sql`select to_char(d, 'DD/MM') as day, (select count(*)::int from users where created_at::date = d) as signups, (select count(*)::int from playback_sessions where started_at::date = d) as plays from generate_series(current_date - 13, current_date, '1 day') d`)).rows;
    const popular = (await db.execute(sql`select tmdb_id, media_type, max(title) as title, count(*)::int as sessions from playback_sessions s join watch_progress w using (tmdb_id, media_type) group by tmdb_id, media_type order by sessions desc limit 8`).catch(() => ({ rows: [] }))).rows;
    return { users, active, newUsers, profiles, sessions, hours: Math.round(hours * 10) / 10, donations, raisedCents: raised, apiFailures: fails, growth, popular };
  }
  if (section === "users") {
    const q = str(sp.get("q"), 80);
    const rows = await db.select().from(t.users).where(q ? or(ilike(t.users.email, `%${q}%`), ilike(t.users.name, `%${q}%`)) : undefined).orderBy(desc(t.users.createdAt)).limit(100);
    const ids = rows.map((r) => r.id);
    const profs = ids.length ? await db.select({ id: t.profiles.id, userId: t.profiles.userId, name: t.profiles.name, bio: t.profiles.bio }).from(t.profiles) : [];
    return { users: rows.map((u) => ({ id: u.id, email: u.email, name: u.name, role: u.role, status: u.status, maxProfiles: u.maxProfiles, createdAt: u.createdAt, lastSeenAt: u.lastSeenAt, profiles: profs.filter((p) => p.userId === u.id) })) };
  }
  if (section === "settings") {
    const out = [];
    for (const d of SETTING_DEFS) {
      const [row] = await db.select().from(t.appSettings).where(eq(t.appSettings.key, d.key)).limit(1);
      const env = !!process.env[d.key];
      out.push({ ...d, configured: env || !!row, source: env ? "env" : row ? "admin" : null, value: d.secret ? null : row?.value ?? "" });
    }
    const flags = await db.select().from(t.featureFlags);
    await ensureSeed();
    return { settings: out, flags: DEFAULT_FLAGS.map((f) => ({ ...f, enabled: flags.find((x) => x.key === f.key)?.enabled ?? f.enabled })) };
  }
  if (section === "providers") {
    const cfgs = await loadConfigs();
    const metrics = await providerMetrics();
    const logs = await db.select().from(t.providerLogs).orderBy(desc(t.providerLogs.createdAt)).limit(40);
    return { providers: PROVIDERS.map((p) => ({ id: p.id, name: p.name, domain: p.domain, note: p.note, media: p.media, features: p.features, config: cfgs.get(p.id), metrics: metrics.find((m) => m.provider_id === p.id) ?? null })), logs };
  }
  if (section === "audit") return { logs: await db.select().from(t.adminAuditLogs).orderBy(desc(t.adminAuditLogs.id)).limit(100) };
  if (section === "payments") {
    const rows = await db.select({ id: t.paymentTransactions.id, externalId: t.paymentTransactions.externalId, amountCents: t.paymentTransactions.amountCents, status: t.paymentTransactions.status, anonymous: t.paymentTransactions.anonymous, createdAt: t.paymentTransactions.createdAt, confirmedAt: t.paymentTransactions.confirmedAt }).from(t.paymentTransactions).orderBy(desc(t.paymentTransactions.createdAt)).limit(100);
    const hooks = await db.select({ id: t.webhookEvents.id, type: t.webhookEvents.type, signatureValid: t.webhookEvents.signatureValid, result: t.webhookEvents.result, createdAt: t.webhookEvents.createdAt }).from(t.webhookEvents).orderBy(desc(t.webhookEvents.id)).limit(50);
    return { payments: rows, webhooks: hooks };
  }
  if (section === "content") {
    await seedAvatars();
    return {
      featured: await db.select().from(t.featuredItems).orderBy(t.featuredItems.sortOrder),
      collections: await db.select().from(t.avatarCollections).orderBy(t.avatarCollections.sortOrder),
      avatars: await db.select().from(t.avatars).orderBy(desc(t.avatars.createdAt)).limit(200),
    };
  }
  if (section === "music") {
    const pls = await db.select({ id: t.musicPlaylists.id, name: t.musicPlaylists.name, isPublic: t.musicPlaylists.isPublic, hidden: t.musicPlaylists.hiddenByAdmin, slug: t.musicPlaylists.shareSlug }).from(t.musicPlaylists).where(eq(t.musicPlaylists.isPublic, true)).limit(100);
    const errors = await db.select().from(t.clientErrors).orderBy(desc(t.clientErrors.id)).limit(30);
    return { playlists: pls, errors, youtube: !!(await getSetting("YOUTUBE_API_KEY")), spotify: !!(await getSetting("SPOTIFY_CLIENT_ID")) };
  }
  if (section === "rankings") {
    const flagged = await db.select({ id: t.playbackSessions.id, profileId: t.playbackSessions.profileId, seconds: t.playbackSessions.verifiedSeconds, flagged: t.playbackSessions.flagged, telemetry: t.playbackSessions.telemetry, startedAt: t.playbackSessions.startedAt }).from(t.playbackSessions).orderBy(desc(t.playbackSessions.verifiedSeconds)).limit(50);
    return { sessions: flagged };
  }
  if (section === "ai") {
    const logs = (await db.execute(sql`select count(*)::int total, count(*) filter (where not ok)::int failures, coalesce(avg(latency_ms),0)::int avg_ms from provider_logs where provider_id='ai'`)).rows[0];
    return { metrics: logs };
  }
  throw new ApiError(404, "Seção desconhecida.");
});

export const POST = handle<Ctx>(async (req, ctx) => {
  const admin = await requireAdmin();
  const { section } = await ctx.params;
  const b = await body(req);

  if (section === "user") {
    const id = str(b.id, 40);
    if (!/^[0-9a-f-]{36}$/.test(id)) throw new ApiError(400, "Usuário inválido.");
    if (id === admin.user.id && (b.status === "suspended" || b.role === "user")) throw new ApiError(400, "Você não pode suspender ou rebaixar a si mesmo.");
    const set: Partial<typeof t.users.$inferInsert> = {};
    if (b.status === "active" || b.status === "suspended") set.status = b.status;
    if (b.role === "user" || b.role === "admin") set.role = b.role;
    if (b.maxProfiles) set.maxProfiles = Math.min(10, Math.max(1, int(b.maxProfiles)));
    if (typeof b.newPassword === "string" && b.newPassword.length >= 8) set.passwordHash = hashSecret(b.newPassword);
    await db.update(t.users).set(set).where(eq(t.users.id, id));
    if (set.status === "suspended") await db.delete(t.sessions).where(eq(t.sessions.userId, id));
    await audit(admin.user.id, "user.update", id, { ...set, passwordHash: set.passwordHash ? "[changed]" : undefined });
    return { ok: true };
  }
  if (section === "setting") {
    const key = str(b.key, 60);
    const def = SETTING_DEFS.find((d) => d.key === key);
    if (!def) throw new ApiError(400, "Configuração desconhecida.");
    if (b.clear === true) await deleteSetting(key);
    else {
      const v = str(b.value, 4000);
      if (!v) throw new ApiError(400, "Valor vazio.");
      await setSetting(key, v, def.secret);
    }
    await audit(admin.user.id, "setting.update", key, { secret: def.secret, cleared: b.clear === true });
    return { ok: true };
  }
  if (section === "flag") {
    const key = str(b.key, 40);
    if (!DEFAULT_FLAGS.some((f) => f.key === key)) throw new ApiError(400, "Recurso desconhecido.");
    await db.insert(t.featureFlags).values({ key, enabled: b.enabled === true }).onConflictDoUpdate({ target: t.featureFlags.key, set: { enabled: b.enabled === true } });
    await audit(admin.user.id, "flag.update", key, { enabled: b.enabled === true });
    return { ok: true };
  }
  if (section === "provider") {
    const id = str(b.id, 30);
    if (!PROVIDERS.some((p) => p.id === id)) throw new ApiError(400, "Provedor inválido.");
    await loadConfigs();
    if (b.action === "test") return { result: await testProvider(id) };
    const set: Partial<typeof t.providerSettings.$inferInsert> = {};
    if (typeof b.rightsConfirmed === "boolean") {
      set.rightsConfirmed = b.rightsConfirmed;
      set.rightsConfirmedBy = b.rightsConfirmed ? admin.user.id : null;
      if (!b.rightsConfirmed) set.enabled = false;
    }
    if (typeof b.enabled === "boolean") {
      const [cur] = await db.select().from(t.providerSettings).where(eq(t.providerSettings.id, id)).limit(1);
      if (b.enabled && !(set.rightsConfirmed ?? cur?.rightsConfirmed)) throw new ApiError(400, "Confirme que você possui direitos de incorporação/distribuição antes de ativar este provedor.");
      set.enabled = b.enabled;
    }
    if (typeof b.showWhenUnknown === "boolean") set.showWhenUnknown = b.showWhenUnknown;
    if (b.priority !== undefined) set.priority = Math.min(99, Math.max(1, int(b.priority, 10)));
    if (b.timeoutMs !== undefined) set.timeoutMs = Math.min(20000, Math.max(1000, int(b.timeoutMs, 6000)));
    if (b.cacheTtlSec !== undefined) set.cacheTtlSec = Math.min(86400, Math.max(0, int(b.cacheTtlSec, 600)));
    await db.update(t.providerSettings).set(set).where(eq(t.providerSettings.id, id));
    await audit(admin.user.id, "provider.update", id, set);
    return { ok: true };
  }
  if (section === "featured") {
    if (b.delete) await db.delete(t.featuredItems).where(eq(t.featuredItems.id, str(b.delete, 40)));
    else await db.insert(t.featuredItems).values({ tmdbId: int(b.tmdbId), mediaType: b.mediaType === "tv" ? "tv" : "movie", title: str(b.title, 200) || "Destaque", tagline: str(b.tagline, 300) || null, sortOrder: int(b.sortOrder) });
    await audit(admin.user.id, "featured.update", String(b.tmdbId ?? b.delete));
    return { ok: true };
  }
  if (section === "avatar") {
    if (b.delete) await db.delete(t.avatars).where(eq(t.avatars.id, str(b.delete, 40)));
    else if (b.collectionName) {
      const slug = str(b.collectionName, 40).toLowerCase().replace(/[^a-z0-9]+/g, "-");
      await db.insert(t.avatarCollections).values({ slug, name: str(b.collectionName, 60), sortOrder: 99 }).onConflictDoNothing();
    } else {
      await db.insert(t.avatars).values({ collectionId: str(b.collectionId, 40), name: str(b.name, 80), imageUrl: validAvatarUrl(b.imageUrl) });
    }
    await audit(admin.user.id, "avatar.update", str(b.name, 80));
    return { ok: true };
  }
  if (section === "playlist") {
    await db.update(t.musicPlaylists).set({ hiddenByAdmin: b.hidden === true }).where(eq(t.musicPlaylists.id, str(b.id, 40)));
    await audit(admin.user.id, "playlist.moderate", str(b.id, 40), { hidden: b.hidden === true });
    return { ok: true };
  }
  if (section === "session") {
    await db.update(t.playbackSessions).set({ flagged: b.flagged === true }).where(eq(t.playbackSessions.id, str(b.id, 40)));
    await audit(admin.user.id, "ranking.moderate", str(b.id, 40), { flagged: b.flagged === true });
    return { ok: true };
  }
  if (section === "test") {
    const target = str(b.target, 20);
    if (target === "ai") {
      const url = await getSetting("AI_PROVIDER_URL");
      const key = await getSetting("AI_API_KEY");
      if (!url || !key) throw new ApiError(400, "Informe AI_PROVIDER_URL e AI_API_KEY.");
      const r = await fetchJson(`${url.replace(/\/$/, "")}/models`, { headers: { authorization: `Bearer ${key}` } }, 8000).catch(() => null);
      return { ok: r?.status === 200, status: r?.status ?? 0 };
    }
    if (target === "tmdb") {
      const k = await getSetting("TMDB_API_KEY");
      if (!k) throw new ApiError(400, "TMDB_API_KEY ausente.");
      const r = await fetchJson(`https://api.themoviedb.org/3/configuration${k.length > 60 ? "" : `?api_key=${k}`}`, k.length > 60 ? { headers: { authorization: `Bearer ${k}` } } : {}, 8000).catch(() => null);
      return { ok: r?.status === 200, status: r?.status ?? 0 };
    }
    if (target === "youtube") {
      const k = await getSetting("YOUTUBE_API_KEY");
      if (!k) throw new ApiError(400, "YOUTUBE_API_KEY ausente.");
      const r = await fetchJson(`https://www.googleapis.com/youtube/v3/videos?part=id&id=dQw4w9WgXcQ&key=${k}`, {}, 8000).catch(() => null);
      return { ok: r?.status === 200, status: r?.status ?? 0 };
    }
    throw new ApiError(400, "Alvo inválido.");
  }
  throw new ApiError(404, "Seção desconhecida.");
});
