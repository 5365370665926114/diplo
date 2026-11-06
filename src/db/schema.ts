import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  boolean,
  jsonb,
  real,
  uniqueIndex,
  index,
  primaryKey,
  bigserial,
} from "drizzle-orm/pg-core";

const id = () => uuid("id").primaryKey().defaultRandom();
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

/* ───────── Accounts & sessions ───────── */
export const users = pgTable("users", {
  id: id(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  passwordHash: text("password_hash").notNull(),
  role: text("role").notNull().default("user"), // user | admin
  status: text("status").notNull().default("active"), // active | suspended
  lang: text("lang").notNull().default("pt-BR"),
  maxProfiles: integer("max_profiles").notNull().default(5),
  createdAt: createdAt(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
});

export const sessions = pgTable(
  "sessions",
  {
    id: text("id").primaryKey(), // sha256(token)
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    activeProfileId: uuid("active_profile_id"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    userAgent: text("user_agent"),
    createdAt: createdAt(),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

export const passwordResets = pgTable("password_resets", {
  id: text("id").primaryKey(), // sha256(token)
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
});

/* ───────── Profiles & avatars ───────── */
export const avatarCollections = pgTable("avatar_collections", {
  id: id(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  active: boolean("active").notNull().default(true),
});

export const avatars = pgTable(
  "avatars",
  {
    id: id(),
    collectionId: uuid("collection_id").notNull().references(() => avatarCollections.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    imageUrl: text("image_url"),
    gradient: text("gradient").notNull().default("linear-gradient(135deg,#E50914,#4a0207)"),
    active: boolean("active").notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [index("avatars_collection_idx").on(t.collectionId)],
);

export const profiles = pgTable(
  "profiles",
  {
    id: id(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    avatarId: uuid("avatar_id"),
    avatarUrl: text("avatar_url"), // custom upload (validated data URL) or avatar image
    avatarGradient: text("avatar_gradient"),
    pinHash: text("pin_hash"),
    bio: text("bio").notNull().default(""),
    favoriteGenres: jsonb("favorite_genres").$type<number[]>().notNull().default([]),
    favoriteTitles: jsonb("favorite_titles").$type<{ id: number; type: string; title: string; poster: string | null }[]>().notNull().default([]),
    privacy: text("privacy").notNull().default("public"), // public | private
    showInRankings: boolean("show_in_rankings").notNull().default(true),
    avatarHistory: jsonb("avatar_history").$type<string[]>().notNull().default([]),
    favoriteAvatarIds: jsonb("favorite_avatar_ids").$type<string[]>().notNull().default([]),
    settings: jsonb("settings").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: createdAt(),
  },
  (t) => [index("profiles_user_idx").on(t.userId)],
);

export const profileLocks = pgTable("profile_locks", {
  profileId: uuid("profile_id").primaryKey().references(() => profiles.id, { onDelete: "cascade" }),
  failedAttempts: integer("failed_attempts").notNull().default(0),
  lockedUntil: timestamp("locked_until", { withTimezone: true }),
});

/* ───────── Library ───────── */
export const listItems = pgTable(
  "list_items",
  {
    id: id(),
    profileId: uuid("profile_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
    list: text("list").notNull(), // favorites | watchlist | custom name
    tmdbId: integer("tmdb_id").notNull(),
    mediaType: text("media_type").notNull(), // movie | tv
    title: text("title").notNull(),
    posterPath: text("poster_path"),
    backdropPath: text("backdrop_path"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("list_items_uq").on(t.profileId, t.list, t.tmdbId, t.mediaType)],
);

export const watchProgress = pgTable(
  "watch_progress",
  {
    id: id(),
    profileId: uuid("profile_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
    tmdbId: integer("tmdb_id").notNull(),
    mediaType: text("media_type").notNull(),
    season: integer("season").notNull().default(0),
    episode: integer("episode").notNull().default(0),
    positionSec: real("position_sec").notNull().default(0),
    durationSec: real("duration_sec").notNull().default(0),
    title: text("title").notNull(),
    posterPath: text("poster_path"),
    backdropPath: text("backdrop_path"),
    completed: boolean("completed").notNull().default(false),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("watch_progress_uq").on(t.profileId, t.tmdbId, t.mediaType, t.season, t.episode)],
);

export const playbackSessions = pgTable(
  "playback_sessions",
  {
    id: id(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    profileId: uuid("profile_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
    tmdbId: integer("tmdb_id").notNull(),
    mediaType: text("media_type").notNull(),
    season: integer("season").notNull().default(0),
    episode: integer("episode").notNull().default(0),
    provider: text("provider").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    lastBeatAt: timestamp("last_beat_at", { withTimezone: true }).notNull().defaultNow(),
    lastPosition: real("last_position").notNull().default(0),
    verifiedSeconds: integer("verified_seconds").notNull().default(0),
    flagged: boolean("flagged").notNull().default(false),
    // true only when playback time came from provider telemetry (postMessage) rather than wall-clock
    telemetry: boolean("telemetry").notNull().default(false),
  },
  (t) => [index("playback_profile_idx").on(t.profileId), index("playback_last_idx").on(t.lastBeatAt)],
);

export const achievements = pgTable(
  "achievements",
  {
    profileId: uuid("profile_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
    code: text("code").notNull(),
    unlockedAt: timestamp("unlocked_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.profileId, t.code] })],
);

export const searchHistory = pgTable(
  "search_history",
  {
    id: id(),
    profileId: uuid("profile_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
    query: text("query").notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("search_history_uq").on(t.profileId, t.query)],
);

/* ───────── DiploMusic ───────── */
export const musicPrefs = pgTable("music_prefs", {
  profileId: uuid("profile_id").primaryKey().references(() => profiles.id, { onDelete: "cascade" }),
  artists: jsonb("artists").$type<{ id: number; name: string; picture: string | null }[]>().notNull().default([]),
  genres: jsonb("genres").$type<string[]>().notNull().default([]),
  moods: jsonb("moods").$type<string[]>().notNull().default([]),
  mode: text("mode").notNull().default("youtube"), // youtube | spotify-inspired
  completed: boolean("completed").notNull().default(false),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const musicPlaylists = pgTable(
  "music_playlists",
  {
    id: id(),
    profileId: uuid("profile_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    coverUrl: text("cover_url"),
    isPublic: boolean("is_public").notNull().default(false),
    shareSlug: text("share_slug").unique(),
    favorite: boolean("favorite").notNull().default(false),
    hiddenByAdmin: boolean("hidden_by_admin").notNull().default(false),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("music_playlists_profile_idx").on(t.profileId)],
);

export const musicPlaylistItems = pgTable(
  "music_playlist_items",
  {
    id: id(),
    playlistId: uuid("playlist_id").notNull().references(() => musicPlaylists.id, { onDelete: "cascade" }),
    videoId: text("video_id").notNull(),
    title: text("title").notNull(),
    artist: text("artist").notNull().default(""),
    thumbnail: text("thumbnail"),
    durationSec: integer("duration_sec"),
    position: integer("position").notNull().default(0),
    addedAt: timestamp("added_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("music_items_uq").on(t.playlistId, t.videoId)],
);

export const musicLikes = pgTable(
  "music_likes",
  {
    profileId: uuid("profile_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
    videoId: text("video_id").notNull(),
    title: text("title").notNull(),
    artist: text("artist").notNull().default(""),
    thumbnail: text("thumbnail"),
    durationSec: integer("duration_sec"),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.profileId, t.videoId] })],
);

export const musicHistory = pgTable(
  "music_history",
  {
    id: id(),
    profileId: uuid("profile_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
    videoId: text("video_id").notNull(),
    title: text("title").notNull(),
    artist: text("artist").notNull().default(""),
    thumbnail: text("thumbnail"),
    durationSec: integer("duration_sec"),
    playedAt: timestamp("played_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("music_history_profile_idx").on(t.profileId, t.playedAt)],
);

/* ───────── Donations ───────── */
export const paymentTransactions = pgTable(
  "payment_transactions",
  {
    id: id(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    profileId: uuid("profile_id").references(() => profiles.id, { onDelete: "set null" }),
    externalId: text("external_id").notNull().unique(),
    gatewayId: text("gateway_id"),
    amountCents: integer("amount_cents").notNull(),
    status: text("status").notNull().default("pending"), // pending | confirmed | expired | failed
    qrCode: text("qr_code"),
    copyPaste: text("copy_paste"),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    anonymous: boolean("anonymous").notNull().default(false),
    message: text("message"),
    gatewayResponse: jsonb("gateway_response"),
    createdAt: createdAt(),
  },
  (t) => [index("payments_status_idx").on(t.status), index("payments_user_idx").on(t.userId)],
);

export const webhookEvents = pgTable("webhook_events", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  eventKey: text("event_key").unique(),
  type: text("type"),
  signatureValid: boolean("signature_valid").notNull().default(false),
  payload: jsonb("payload"),
  result: text("result"),
  createdAt: createdAt(),
});

/* ───────── Platform configuration ───────── */
export const appSettings = pgTable("app_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  secret: boolean("secret").notNull().default(false), // encrypted at rest when true
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const featureFlags = pgTable("feature_flags", {
  key: text("key").primaryKey(),
  enabled: boolean("enabled").notNull().default(true),
  description: text("description").notNull().default(""),
});

export const providerSettings = pgTable("provider_settings", {
  id: text("id").primaryKey(),
  enabled: boolean("enabled").notNull().default(false),
  rightsConfirmed: boolean("rights_confirmed").notNull().default(false),
  rightsConfirmedBy: uuid("rights_confirmed_by"),
  priority: integer("priority").notNull().default(10),
  timeoutMs: integer("timeout_ms").notNull().default(6000),
  cacheTtlSec: integer("cache_ttl_sec").notNull().default(600),
  showWhenUnknown: boolean("show_when_unknown").notNull().default(false),
});

export const providerLogs = pgTable(
  "provider_logs",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    providerId: text("provider_id").notNull(),
    ok: boolean("ok").notNull(),
    state: text("state"),
    latencyMs: integer("latency_ms"),
    message: text("message"),
    createdAt: createdAt(),
  },
  (t) => [index("provider_logs_idx").on(t.providerId, t.createdAt)],
);

export const featuredItems = pgTable("featured_items", {
  id: id(),
  tmdbId: integer("tmdb_id").notNull(),
  mediaType: text("media_type").notNull(),
  title: text("title").notNull(),
  tagline: text("tagline"),
  sortOrder: integer("sort_order").notNull().default(0),
  active: boolean("active").notNull().default(true),
  createdAt: createdAt(),
});

export const adminAuditLogs = pgTable("admin_audit_logs", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  actorId: uuid("actor_id"),
  action: text("action").notNull(),
  target: text("target"),
  meta: jsonb("meta"),
  createdAt: createdAt(),
});

export const notifications = pgTable(
  "notifications",
  {
    id: id(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    body: text("body").notNull().default(""),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("notifications_user_idx").on(t.userId)],
);

export const onboardingProgress = pgTable(
  "onboarding_progress",
  {
    id: id(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    scope: text("scope").notNull().default("account"), // account | profile uuid
    step: text("step").notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("onboarding_uq").on(t.userId, t.scope, t.step)],
);

export const rateLimits = pgTable("rate_limits", {
  key: text("key").primaryKey(),
  count: integer("count").notNull().default(0),
  windowStart: timestamp("window_start", { withTimezone: true }).notNull().defaultNow(),
});

export const aiCache = pgTable("ai_cache", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  createdAt: createdAt(),
});

export const clientErrors = pgTable("client_errors", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  userId: uuid("user_id"),
  message: text("message").notNull(),
  stack: text("stack"),
  url: text("url"),
  createdAt: createdAt(),
});
