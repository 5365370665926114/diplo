import crypto from "node:crypto";
import { cookies } from "next/headers";
import { requireProfile } from "@/lib/server/auth";
import { ApiError, fetchJson, handle, int, str } from "@/lib/server/http";
import { decrypt, encrypt, getSetting } from "@/lib/server/settings";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ action: string }> };

async function cfg(req: Request) {
  const id = await getSetting("SPOTIFY_CLIENT_ID");
  const secret = await getSetting("SPOTIFY_CLIENT_SECRET");
  if (!id || !secret) throw new ApiError(503, "Spotify não configurado. Use a importação do YouTube, de arquivo JSON ou crie manualmente.", "spotify_not_configured");
  const base = ((await getSetting("PUBLIC_BASE_URL")) || new URL(req.url).origin).replace(/\/$/, "");
  return { id, secret, redirect: `${base}/api/music/spotify/callback` };
}

async function token() {
  const raw = (await cookies()).get("dc_spotify")?.value;
  if (!raw) throw new ApiError(401, "Conecte sua conta Spotify primeiro.", "spotify_not_connected");
  try {
    return decrypt(raw);
  } catch {
    throw new ApiError(401, "Sessão Spotify inválida. Reconecte.", "spotify_not_connected");
  }
}

/** Official OAuth 2.0 (authorization code). Only metadata the API authorizes is returned — no cross-service syncing. */
export const GET = handle<Ctx>(async (req, ctx) => {
  const { action } = await ctx.params;
  await requireProfile();
  const jar = await cookies();
  const secure = (req.headers.get("x-forwarded-proto") || "").includes("https");

  if (action === "login") {
    const c = await cfg(req);
    const state = crypto.randomBytes(16).toString("hex");
    jar.set("dc_spotify_state", state, { httpOnly: true, sameSite: "lax", secure, path: "/", maxAge: 600 });
    const u = new URL("https://accounts.spotify.com/authorize");
    u.search = new URLSearchParams({ client_id: c.id, response_type: "code", redirect_uri: c.redirect, scope: "playlist-read-private playlist-read-collaborative", state }).toString();
    return Response.redirect(u.toString(), 302);
  }
  if (action === "callback") {
    const c = await cfg(req);
    const sp = new URL(req.url).searchParams;
    if (!sp.get("code") || sp.get("state") !== jar.get("dc_spotify_state")?.value) return Response.redirect(new URL("/music?spotify=error", req.url).toString(), 302);
    const r = await fetchJson<{ access_token?: string; expires_in?: number }>("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", authorization: `Basic ${Buffer.from(`${c.id}:${c.secret}`).toString("base64")}` },
      body: new URLSearchParams({ grant_type: "authorization_code", code: sp.get("code")!, redirect_uri: c.redirect }).toString(),
    });
    if (!r.data?.access_token) return Response.redirect(new URL("/music?spotify=error", req.url).toString(), 302);
    jar.set("dc_spotify", encrypt(r.data.access_token), { httpOnly: true, sameSite: "lax", secure, path: "/", maxAge: Math.min(r.data.expires_in ?? 3600, 3600) });
    jar.delete("dc_spotify_state");
    return Response.redirect(new URL("/music?spotify=connected", req.url).toString(), 302);
  }
  if (action === "status") {
    const c = !!(await getSetting("SPOTIFY_CLIENT_ID")) && !!(await getSetting("SPOTIFY_CLIENT_SECRET"));
    return { configured: c, connected: !!jar.get("dc_spotify")?.value };
  }
  if (action === "playlists") {
    const t = await token();
    const r = await fetchJson<{ items?: { id: string; name: string; tracks?: { total: number }; images?: { url: string }[] }[]; error?: { message?: string } }>("https://api.spotify.com/v1/me/playlists?limit=50", { headers: { authorization: `Bearer ${t}` } });
    if (r.status === 401) throw new ApiError(401, "Sessão Spotify expirada. Reconecte.", "spotify_not_connected");
    if (r.status !== 200) throw new ApiError(502, `Spotify respondeu ${r.status}: ${r.data?.error?.message ?? "acesso não permitido"}`);
    return { playlists: (r.data?.items ?? []).filter(Boolean).map((p) => ({ id: p.id, name: p.name, total: p.tracks?.total ?? 0, image: p.images?.[0]?.url ?? null })) };
  }
  if (action === "tracks") {
    const t = await token();
    const id = str(new URL(req.url).searchParams.get("id"), 40);
    if (!/^[A-Za-z0-9]+$/.test(id)) throw new ApiError(400, "Playlist inválida.");
    const r = await fetchJson<{ items?: { track?: { name: string; duration_ms: number; artists: { name: string }[]; album?: { images?: { url: string }[] } } | null }[] }>(`https://api.spotify.com/v1/playlists/${id}/tracks?limit=100&offset=${int(new URL(req.url).searchParams.get("offset"))}`, { headers: { authorization: `Bearer ${t}` } });
    if (r.status === 403) throw new ApiError(403, "O Spotify não autoriza o acesso às faixas desta playlist para este aplicativo (restrição do modo de desenvolvimento/aprovação). Use importação por arquivo JSON ou crie manualmente.", "spotify_forbidden");
    if (r.status !== 200) throw new ApiError(502, `Spotify respondeu ${r.status}.`);
    return { tracks: (r.data?.items ?? []).filter((i) => i.track).map((i) => ({ title: i.track!.name, artist: i.track!.artists.map((a) => a.name).join(", "), durationSec: Math.round(i.track!.duration_ms / 1000), cover: i.track!.album?.images?.[1]?.url ?? null })) };
  }
  throw new ApiError(404, "Não encontrado.");
});
