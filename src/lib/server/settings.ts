import crypto from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { appSettings, featureFlags } from "@/db/schema";

/* Secrets set by admins are encrypted with AES-256-GCM. Key derives from APP_SECRET. */
function key(): Buffer {
  const base = process.env.APP_SECRET || process.env.DATABASE_URL || "diplocine-dev-secret";
  return crypto.createHash("sha256").update("diplocine:" + base).digest();
}

export function encrypt(plain: string): string {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return `enc:${iv.toString("base64")}.${c.getAuthTag().toString("base64")}.${enc.toString("base64")}`;
}

export function decrypt(blob: string): string {
  if (!blob.startsWith("enc:")) return blob;
  const [iv, tag, data] = blob.slice(4).split(".");
  const d = crypto.createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64"));
  d.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([d.update(Buffer.from(data, "base64")), d.final()]).toString("utf8");
}

const cache = new Map<string, { v: string | null; at: number }>();

/** Env var first, then admin-configured value (decrypted). Never exposed to the client. */
export async function getSetting(name: string): Promise<string | null> {
  const env = process.env[name];
  if (env) return env;
  const hit = cache.get(name);
  if (hit && Date.now() - hit.at < 15_000) return hit.v;
  let v: string | null = null;
  try {
    const [row] = await db.select().from(appSettings).where(eq(appSettings.key, name)).limit(1);
    if (row) v = row.secret ? decrypt(row.value) : row.value;
  } catch {
    v = null;
  }
  cache.set(name, { v, at: Date.now() });
  return v;
}

export async function setSetting(name: string, value: string, secret: boolean) {
  const stored = secret ? encrypt(value) : value;
  await db
    .insert(appSettings)
    .values({ key: name, value: stored, secret })
    .onConflictDoUpdate({ target: appSettings.key, set: { value: stored, secret, updatedAt: new Date() } });
  cache.delete(name);
}

export async function deleteSetting(name: string) {
  await db.delete(appSettings).where(eq(appSettings.key, name));
  cache.delete(name);
}

/** Settings catalog (admin-editable). `secret` ones are write-only. */
export const SETTING_DEFS: { key: string; label: string; secret: boolean; group: string; hint?: string }[] = [
  { key: "TMDB_API_KEY", label: "TMDB API key / Read Access Token", secret: true, group: "Catálogo" },
  { key: "YOUTUBE_API_KEY", label: "YouTube Data API v3 key", secret: true, group: "DiploMusic" },
  { key: "SPOTIFY_CLIENT_ID", label: "Spotify client ID (opcional)", secret: false, group: "DiploMusic" },
  { key: "SPOTIFY_CLIENT_SECRET", label: "Spotify client secret (opcional)", secret: true, group: "DiploMusic" },
  { key: "NEXUSPAG_API_KEY", label: "NexusPag x-api-key", secret: true, group: "NexusPag" },
  { key: "NEXUSPAG_WEBHOOK_SECRET", label: "NexusPag webhook secret", secret: true, group: "NexusPag" },
  { key: "NEXUSPAG_MIN_AMOUNT", label: "Valor mínimo de doação (R$)", secret: false, group: "NexusPag", hint: "padrão 5" },
  { key: "PUBLIC_BASE_URL", label: "URL pública (webhooks)", secret: false, group: "Geral", hint: "https://seu-dominio.com" },
  { key: "AI_PROVIDER_URL", label: "IA: endpoint compatível com OpenAI", secret: false, group: "IA", hint: "https://api.openai.com/v1" },
  { key: "AI_API_KEY", label: "IA: API key", secret: true, group: "IA" },
  { key: "AI_MODEL", label: "IA: modelo", secret: false, group: "IA", hint: "gpt-4o-mini" },
  { key: "AI_DAILY_LIMIT", label: "IA: limite diário por perfil", secret: false, group: "IA", hint: "40" },
  { key: "AI_SYSTEM_PROMPT", label: "IA: instruções internas", secret: false, group: "IA" },
  { key: "RESEND_API_KEY", label: "Resend API key (e-mail de recuperação)", secret: true, group: "Geral" },
  { key: "MAIL_FROM", label: "Remetente de e-mail", secret: false, group: "Geral", hint: "DiploCine <no-reply@dominio>" },
  { key: "SITE_NAME", label: "Nome do site", secret: false, group: "Identidade" },
  { key: "SITE_LOGO_URL", label: "Logo (URL)", secret: false, group: "Identidade" },
  { key: "SITE_FAVICON_URL", label: "Favicon (URL)", secret: false, group: "Identidade" },
  { key: "GLOBAL_NOTICE", label: "Aviso global", secret: false, group: "Geral" },
  { key: "RANKING_HOURS_MIN_SESSION_SEC", label: "Ranking: sessão mínima (s)", secret: false, group: "Rankings", hint: "60" },
  { key: "RANKING_HOURS_REQUIRE_TELEMETRY", label: "Ranking: exigir telemetria (1/0)", secret: false, group: "Rankings", hint: "1" },
  { key: "RANKING_HOURS_DAILY_CAP_H", label: "Ranking: teto diário (h)", secret: false, group: "Rankings", hint: "20" },
];

export const DEFAULT_FLAGS: { key: string; description: string; enabled: boolean }[] = [
  { key: "ranking_hours", description: "Ranking de horas assistidas", enabled: true },
  { key: "ranking_donations", description: "Ranking de doações", enabled: true },
  { key: "ai_search", description: "Pesquisa com IA", enabled: true },
  { key: "diplomusic", description: "DiploMusic", enabled: true },
  { key: "donations", description: "Doações PIX", enabled: true },
  { key: "registrations", description: "Novos cadastros", enabled: true },
  { key: "maintenance", description: "Modo de manutenção (somente admins)", enabled: false },
  { key: "lyrics", description: "Letras (LRCLIB)", enabled: true },
  { key: "playlist_sharing", description: "Compartilhamento de playlists", enabled: true },
];

let seeded = false;
export async function ensureSeed() {
  if (seeded) return;
  seeded = true;
  try {
    await db.insert(featureFlags).values(DEFAULT_FLAGS).onConflictDoNothing();
  } catch {
    seeded = false;
  }
}

export async function getFlags(): Promise<Record<string, boolean>> {
  await ensureSeed();
  const rows = await db.select().from(featureFlags);
  const out: Record<string, boolean> = {};
  for (const d of DEFAULT_FLAGS) out[d.key] = d.enabled;
  for (const r of rows) out[r.key] = r.enabled;
  return out;
}
