import crypto from "node:crypto";
import { ApiError } from "./http";
import { getSetting } from "./settings";

const BASE = process.env.NEXUSPAG_API_BASE || "https://nexuspag.com";

export type GatewayPix = {
  gatewayId: string | null;
  status: string;
  qrCode: string | null; // image (data URL / url) when provided
  copyPaste: string | null;
  expiresAt: Date | null;
  amountCents: number | null;
  externalId: string | null;
  raw: unknown;
};

function pick(o: Record<string, unknown>, ...keys: string[]): string | null {
  for (const k of keys) {
    const v = o[k];
    if (typeof v === "string" && v) return v;
  }
  return null;
}

/** Tolerant parser: NexusPag nests data in different envelopes and spells fields differently. */
export function parseGateway(json: unknown): GatewayPix {
  const root = (json ?? {}) as Record<string, unknown>;
  const o = ((root.data as Record<string, unknown>) || (root.transaction as Record<string, unknown>) || root) as Record<string, unknown>;
  const pix = (o.pix as Record<string, unknown>) || {};
  const amt = o.amount ?? o.value;
  const exp = pick(o, "expires_at", "expiresAt", "expiration") || pick(pix, "expires_at");
  const cents = typeof amt === "number" ? Math.round(amt * 100) : typeof amt === "string" && amt ? Math.round(Number(amt) * 100) : null;
  return {
    gatewayId: pick(o, "id", "transaction_id", "txid") ,
    status: (pick(o, "status") || "pending").toLowerCase(),
    qrCode: pick(o, "qr_code_base64", "qrcode_base64", "qr_code_image", "qrcode_image", "qr_image") || pick(pix, "qr_code_base64", "qr_code_image"),
    copyPaste: pick(o, "pix_copy_paste", "copy_paste", "copia_e_cola", "brcode", "pix_code", "qr_code", "qrcode", "emv") || pick(pix, "copy_paste", "emv", "qr_code"),
    expiresAt: exp && !isNaN(Date.parse(exp)) ? new Date(exp) : null,
    amountCents: cents !== null && Number.isFinite(cents) ? cents : null,
    externalId: pick(o, "external_id", "externalId"),
    raw: json,
  };
}

async function gw(path: string, init: RequestInit & { retries?: number } = {}) {
  const apiKey = await getSetting("NEXUSPAG_API_KEY");
  if (!apiKey) throw new ApiError(503, "NexusPag não configurado. Um administrador precisa informar a NEXUSPAG_API_KEY.", "nexuspag_not_configured");
  const attempts = (init.retries ?? 2) + 1;
  let last: Response | null = null;
  for (let i = 0; i < attempts; i++) {
    try {
      const r = await fetch(BASE + path, {
        ...init,
        headers: { "x-api-key": apiKey, "content-type": "application/json", accept: "application/json", ...(init.headers || {}) },
        signal: AbortSignal.timeout(12000),
        cache: "no-store",
      });
      last = r;
      // retry only on transient errors; create is idempotent through external_id
      if ([429, 500, 502].includes(r.status) && i < attempts - 1) {
        await new Promise((res) => setTimeout(res, 600 * (i + 1)));
        continue;
      }
      break;
    } catch {
      if (i === attempts - 1) throw new ApiError(502, "Gateway de pagamento indisponível.");
    }
  }
  if (!last) throw new ApiError(502, "Gateway de pagamento indisponível.");
  const json = await last.json().catch(() => ({}));
  return { status: last.status, json };
}

export function gatewayError(status: number, json: unknown): ApiError {
  const msg = pick((json ?? {}) as Record<string, unknown>, "error", "message") || "";
  switch (status) {
    case 400:
      return new ApiError(400, `Dados da cobrança inválidos. ${msg}`.trim());
    case 401:
      return new ApiError(502, "Credencial do gateway recusada. Avise o administrador.", "gateway_auth");
    case 409:
      return new ApiError(409, "Cobrança já existente para este pedido.");
    case 429:
      return new ApiError(429, "Gateway com muitas requisições. Tente novamente em instantes.");
    case 500:
    case 502:
      return new ApiError(502, "Gateway de pagamento instável. Tente novamente.");
    default:
      return new ApiError(502, `Gateway respondeu ${status}. ${msg}`.trim());
  }
}

export async function createPix(args: { amount: number; description: string; externalId: string; webhookUrl?: string }) {
  const { status, json } = await gw("/api/pix/create", {
    method: "POST",
    body: JSON.stringify({
      amount: args.amount,
      description: args.description,
      external_id: args.externalId,
      ...(args.webhookUrl ? { webhook_url: args.webhookUrl } : {}),
    }),
  });
  if (status === 409) {
    // idempotent replay → fetch the existing charge instead of failing
    const existing = await getPix(args.externalId);
    return existing;
  }
  if (status < 200 || status >= 300) throw gatewayError(status, json);
  return parseGateway(json);
}

export async function getPix(idOrExternal: string) {
  const { status, json } = await gw(`/api/pix/${encodeURIComponent(idOrExternal)}`, { method: "GET" });
  if (status < 200 || status >= 300) throw gatewayError(status, json);
  return parseGateway(json);
}

export function isPaid(status: string) {
  return ["confirmed", "paid", "approved", "completed", "success"].includes(status);
}

/** Header x-webhook-signature: t=<unix>,v1=<hmac>. HMAC-SHA256 over `${t}.${rawBody}` (also accepts raw-body-only for compatibility). */
export function verifySignature(rawBody: string, header: string | null, secret: string, toleranceSec = 600) {
  if (!header) return { ok: false, reason: "assinatura ausente" };
  const parts = Object.fromEntries(
    header.split(",").map((p) => {
      const i = p.indexOf("=");
      return [p.slice(0, i).trim(), p.slice(i + 1).trim()];
    }),
  );
  const t = Number(parts.t);
  const v1 = parts.v1;
  if (!v1 || !Number.isFinite(t)) return { ok: false, reason: "formato inválido" };
  if (Math.abs(Date.now() / 1000 - t) > toleranceSec) return { ok: false, reason: "timestamp fora da tolerância" };
  const candidates = [`${t}.${rawBody}`, `${t}${rawBody}`];
  for (const c of candidates) {
    const mac = crypto.createHmac("sha256", secret).update(c).digest("hex");
    const a = Buffer.from(mac);
    const b = Buffer.from(v1);
    if (a.length === b.length && crypto.timingSafeEqual(a, b)) return { ok: true, reason: "ok" };
  }
  return { ok: false, reason: "HMAC não confere" };
}
