import { sql } from "drizzle-orm";
import { db } from "@/db";
import { adminAuditLogs } from "@/db/schema";

export class ApiError extends Error {
  constructor(public status: number, message: string, public code?: string) {
    super(message);
  }
}

type Handler<C> = (req: Request, ctx: C) => Promise<Response | unknown>;

export function handle<C = unknown>(fn: Handler<C>) {
  return async (req: Request, ctx: C): Promise<Response> => {
    try {
      const out = await fn(req, ctx);
      if (out instanceof Response) return out;
      return Response.json(out ?? { ok: true });
    } catch (e) {
      if (e instanceof ApiError) return Response.json({ error: e.message, code: e.code }, { status: e.status });
      console.error("[api]", req.method, new URL(req.url).pathname, e);
      return Response.json({ error: "Erro interno. Tente novamente." }, { status: 500 });
    }
  };
}

export async function body<T = Record<string, unknown>>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    throw new ApiError(400, "Corpo da requisição inválido.");
  }
}

export function clientIp(req: Request): string {
  return (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || req.headers.get("x-real-ip") || "local";
}

/** Fixed-window rate limiter backed by Postgres (works across serverless instances). */
export async function rateLimit(key: string, limit: number, windowSec: number) {
  const res = await db.execute(sql`
    insert into rate_limits (key, count, window_start) values (${key}, 1, now())
    on conflict (key) do update set
      count = case when rate_limits.window_start < now() - make_interval(secs => ${windowSec}) then 1 else rate_limits.count + 1 end,
      window_start = case when rate_limits.window_start < now() - make_interval(secs => ${windowSec}) then now() else rate_limits.window_start end
    returning count`);
  const count = Number((res.rows[0] as { count: number }).count);
  if (count > limit) throw new ApiError(429, "Muitas tentativas. Aguarde um instante e tente novamente.", "rate_limited");
}

export async function audit(actorId: string | null, action: string, target?: string, meta?: unknown) {
  await db.insert(adminAuditLogs).values({ actorId, action, target: target ?? null, meta: (meta ?? null) as never });
}

export function str(v: unknown, max = 200): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}
export function int(v: unknown, def = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : def;
}

export async function fetchJson<T = unknown>(url: string, init: RequestInit = {}, timeoutMs = 8000): Promise<{ status: number; data: T | null; ms: number }> {
  const t0 = Date.now();
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const r = await fetch(url, { ...init, signal: ctl.signal });
    const text = await r.text();
    let data: T | null = null;
    try {
      data = JSON.parse(text) as T;
    } catch {
      data = null;
    }
    return { status: r.status, data, ms: Date.now() - t0 };
  } finally {
    clearTimeout(timer);
  }
}
