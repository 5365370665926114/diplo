import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { providerLogs, providerSettings } from "@/db/schema";
import { fetchJson } from "./http";

export type Avail = "available" | "unavailable" | "unknown";
export type MediaCtx = { type: "movie" | "tv"; tmdbId: number; season?: number; episode?: number; kind?: string; title?: string; poster?: string; startTime?: number };
type Check = { state: Avail; message: string };

export type ProviderDef = {
  id: string;
  name: string;
  domain: string;
  media: ("movie" | "tv")[];
  features: { resume: boolean; events: boolean; episodes: boolean };
  defaultPriority: number;
  note: string;
  check(ctx: MediaCtx, timeoutMs: number): Promise<Check>;
  embedUrl(ctx: MediaCtx): string;
};

const RED = "E50914";

/* ── Superflix ── catalog lists exist but do NOT prove a specific video is playable, so a catalog hit is only "unknown". */
const superCache = new Map<string, { ids: Set<number> | null; at: number }>();
function superCategory(ctx: MediaCtx) {
  if (ctx.type === "movie") return "filme";
  if (ctx.kind === "animes") return "animes";
  if (ctx.kind === "doramas") return "dorama";
  return "serie";
}
function extractIds(data: unknown): Set<number> | null {
  const ids = new Set<number>();
  const walk = (v: unknown) => {
    if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object") {
      const o = v as Record<string, unknown>;
      const cand = o.tmdb_id ?? o.tmdb ?? o.id;
      if (cand !== undefined && Number.isFinite(Number(cand))) ids.add(Number(cand));
      else Object.values(o).forEach(walk);
    } else if (typeof v === "number" || (typeof v === "string" && /^\d+$/.test(v))) ids.add(Number(v));
  };
  walk(data);
  return ids.size ? ids : null;
}

const superflix: ProviderDef = {
  id: "superflix",
  name: "Servidor 1 · Superflix",
  domain: "https://superflixapi.boats",
  media: ["movie", "tv"],
  features: { resume: false, events: false, episodes: true },
  defaultPriority: 1,
  note: "Catálogo listado; não há endpoint de disponibilidade por vídeo.",
  async check(ctx, timeoutMs) {
    const cat = superCategory(ctx);
    let entry = superCache.get(cat);
    if (!entry || Date.now() - entry.at > 3600_000) {
      const r = await fetchJson(`${this.domain}/lista?category=${cat}&type=tmdb&format=json`, { headers: { accept: "application/json" } }, Math.max(timeoutMs, 10000)).catch(() => null);
      entry = { ids: r && r.data ? extractIds(r.data) : null, at: Date.now() };
      superCache.set(cat, entry);
    }
    if (!entry.ids) return { state: "unknown", message: "Lista do catálogo inacessível (resposta não-JSON ou bloqueada)." };
    return entry.ids.has(ctx.tmdbId)
      ? { state: "unknown", message: "Presente no catálogo — disponibilidade do vídeo não comprovada." }
      : { state: "unavailable", message: "Não consta no catálogo do provedor." };
  },
  embedUrl(ctx) {
    const hash = `#color:${RED}#noLink`;
    return ctx.type === "movie"
      ? `${this.domain}/filme/${ctx.tmdbId}${hash}`
      : `${this.domain}/serie/${ctx.tmdbId}/${ctx.season ?? 1}/${ctx.episode ?? 1}${hash}`;
  },
};

/* ── EmbedPlay ── real status endpoint: {status:"success"|"failed", msg} */
const embedplay: ProviderDef = {
  id: "embedplay",
  name: "Servidor 2 · EmbedPlay",
  domain: "https://embedplayapi.top",
  media: ["movie", "tv"],
  features: { resume: false, events: false, episodes: true },
  defaultPriority: 2,
  note: "Verificação por /api/status (por filme ou episódio).",
  async check(ctx, timeoutMs) {
    const q =
      ctx.type === "movie"
        ? `tmdb=${ctx.tmdbId}&type=movie`
        : `tmdb=${ctx.tmdbId}&sea=${ctx.season ?? 1}&epi=${ctx.episode ?? 1}&type=tv`;
    const r = await fetchJson<{ status?: string; msg?: string }>(`${this.domain}/api/status?${q}`, {}, timeoutMs);
    if (r.status !== 200 || !r.data) return { state: "unknown", message: `Resposta inesperada (HTTP ${r.status}).` };
    if (r.data.status === "success") return { state: "available", message: r.data.msg || "Confirmado pelo provedor." };
    if (r.data.status === "failed") return { state: "unavailable", message: r.data.msg || "Não consta no provedor." };
    return { state: "unknown", message: "Estado não reconhecido." };
  },
  embedUrl(ctx) {
    return ctx.type === "movie" ? `${this.domain}/embed/${ctx.tmdbId}` : `${this.domain}/embed/${ctx.tmdbId}/${ctx.season ?? 1}/${ctx.episode ?? 1}`;
  },
};

/* ── CinemaOS ── no documented availability endpoint → always "unknown". Emits postMessage telemetry. */
const cinemaos: ProviderDef = {
  id: "cinemaos",
  name: "Servidor 3 · CinemaOS",
  domain: "https://cinemaos.tech",
  media: ["movie", "tv"],
  features: { resume: true, events: true, episodes: true },
  defaultPriority: 3,
  note: "Sem endpoint de disponibilidade; suporta telemetria via postMessage e retomada (startTime).",
  async check() {
    return { state: "unknown", message: "Provedor não expõe verificação de disponibilidade." };
  },
  embedUrl(ctx) {
    const p = new URLSearchParams({ theme: RED, autoPlay: "true", nextButton: "true", autoNext: "true" });
    if (ctx.startTime && ctx.startTime > 5) p.set("startTime", String(Math.floor(ctx.startTime)));
    const base = ctx.type === "movie" ? `${this.domain}/player/${ctx.tmdbId}` : `${this.domain}/player/${ctx.tmdbId}/${ctx.season ?? 1}/${ctx.episode ?? 1}`;
    return `${base}?${p}`;
  },
};

export const PROVIDERS: ProviderDef[] = [superflix, embedplay, cinemaos];

export type ProviderConfig = typeof providerSettings.$inferSelect;

export async function loadConfigs(): Promise<Map<string, ProviderConfig>> {
  await db
    .insert(providerSettings)
    .values(PROVIDERS.map((p) => ({ id: p.id, priority: p.defaultPriority })))
    .onConflictDoNothing();
  const rows = await db.select().from(providerSettings);
  return new Map(rows.map((r) => [r.id, r]));
}

const availCache = new Map<string, { v: Check & { ms: number }; at: number }>();

async function runCheck(p: ProviderDef, cfg: ProviderConfig, ctx: MediaCtx) {
  const key = `${p.id}:${ctx.type}:${ctx.tmdbId}:${ctx.season ?? 0}:${ctx.episode ?? 0}:${ctx.kind ?? ""}`;
  const hit = availCache.get(key);
  if (hit && Date.now() - hit.at < cfg.cacheTtlSec * 1000) return hit.v;
  const t0 = Date.now();
  let res: Check;
  let ok = true;
  try {
    res = await p.check(ctx, cfg.timeoutMs);
  } catch (e) {
    ok = false;
    res = { state: "unknown", message: e instanceof Error && e.name === "TimeoutError" ? "Tempo esgotado." : "Falha ao consultar o provedor." };
  }
  const v = { ...res, ms: Date.now() - t0 };
  availCache.set(key, { v, at: Date.now() });
  db.insert(providerLogs).values({ providerId: p.id, ok, state: v.state, latencyMs: v.ms, message: v.message }).catch(() => {});
  return v;
}

export type Resolved = {
  id: string;
  name: string;
  state: Avail;
  message: string;
  url: string;
  features: ProviderDef["features"];
  origin: string;
  latencyMs: number;
};

/** Independent, fault-tolerant checks. Only enabled + rights-confirmed providers are queried or shown. */
export async function resolveProviders(ctx: MediaCtx) {
  const configs = await loadConfigs();
  const active = PROVIDERS.filter((p) => {
    const c = configs.get(p.id);
    return c && c.enabled && c.rightsConfirmed && p.media.includes(ctx.type);
  }).sort((a, b) => configs.get(a.id)!.priority - configs.get(b.id)!.priority);
  const settled = await Promise.all(
    active.map(async (p) => {
      const cfg = configs.get(p.id)!;
      const r = await runCheck(p, cfg, ctx);
      return { p, cfg, r };
    }),
  );
  const servers: Resolved[] = settled
    .filter(({ cfg, r }) => r.state === "available" || (r.state === "unknown" && cfg.showWhenUnknown))
    .map(({ p, r }) => ({
      id: p.id,
      name: p.name,
      state: r.state,
      message: r.message,
      url: p.embedUrl(ctx),
      features: p.features,
      origin: p.domain,
      latencyMs: r.ms,
    }));
  return { servers, checked: settled.length, configured: active.length };
}

export async function providerMetrics() {
  const res = await db.execute(sql`
    select provider_id, count(*)::int as total,
      count(*) filter (where not ok)::int as failures,
      count(*) filter (where state='available')::int as available,
      coalesce(avg(latency_ms),0)::int as avg_ms
    from provider_logs where created_at > now() - interval '7 days' group by provider_id`);
  return res.rows as { provider_id: string; total: number; failures: number; available: number; avg_ms: number }[];
}

export async function testProvider(id: string) {
  const p = PROVIDERS.find((x) => x.id === id);
  if (!p) return null;
  const [cfg] = await db.select().from(providerSettings).where(eq(providerSettings.id, id)).limit(1);
  availCache.clear();
  return runCheck(p, cfg ?? ({ cacheTtlSec: 0, timeoutMs: 8000 } as ProviderConfig), { type: "movie", tmdbId: 550 });
}

export function allowedOrigins() {
  return PROVIDERS.map((p) => p.domain);
}
