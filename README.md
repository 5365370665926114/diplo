# DiploCine — The Ultimate Cinematic Universe

Next.js (App Router) + PostgreSQL (Drizzle). Black & red cinematic UI, multi-profile, TMDB catalog, multi-server player manager,
DiploMusic (YouTube IFrame, LRCLIB lyrics, Deezer artists), AI Search, verified rankings, NexusPag PIX donations and an admin Control Center.

## Run
1. Set `DATABASE_URL`, `APP_SECRET`, `ADMIN_EMAILS` (see `.env.example`).
2. `npx drizzle-kit push` (schema in `src/db/schema.ts`) → `npm run build && npm start`.
3. Sign up with an e-mail listed in `ADMIN_EMAILS`, open **/admin → Configurações** and paste `TMDB_API_KEY`, `YOUTUBE_API_KEY`, NexusPag key + webhook secret, AI provider (optional).
4. NexusPag webhook URL: `https://<domain>/api/donations/webhook` (event `payment.confirmed`, header `x-webhook-signature: t=…,v1=…`).

## Architecture decisions (honest notes)
- **Stack adaptation.** The runtime provided is Next.js + Postgres, so auth (scrypt + httpOnly session cookies stored hashed in DB), RLS-equivalent authorization (every API checks session → active profile → ownership) and storage (avatars as validated data URLs ≤ 300 KB) are implemented server-side instead of Supabase Auth/Storage/Realtime. Realtime is replaced by short polling. The same SQL model maps 1:1 to Supabase if you migrate.
- **Profiles/PIN.** PINs are scrypt-hashed, verified on `POST /api/profiles/:id/select`, with lockout after 5 failures. The selected profile is stored in the server session and enforced by every profile API.
- **Players.** `src/lib/server/providers.ts` is the PlayerProviderManager. Providers are **disabled until an admin confirms embed/distribution rights** (audit-logged). Only providers with *confirmed* availability are listed:
  EmbedPlay uses its real `/api/status`; Superflix has no per-video endpoint (catalog hit ⇒ "unknown", and its list endpoint may be Cloudflare-protected — no bypass is attempted); CinemaOS has no availability endpoint (always "unknown"). "Unknown" servers only show if the admin enables *show when unknown*. Watch-time telemetry (postMessage) is accepted only from the exact provider origin and iframe window.
- **Rankings.** Hours are credited by the server from heartbeats (≤ wall clock, ≤ media-position advance, no overlap, daily cap). Without provider telemetry time is stored as *unverified* and never ranks.
- **NexusPag.** HMAC-SHA256 over `t.rawBody` is validated (assumption: the docs state the timestamp is part of the signed content; both `t.body` and `t+body` are tried), tolerance 10 min, payment re-confirmed via `GET /api/pix/{id}`, atomic idempotent confirmation. Webhooks are rejected if no secret is configured. Gateway response fields are parsed tolerantly — verify with a low-value real charge.
- **Lyrics** come from LRCLIB only; **artists** from Deezer's public API; **music playback** only via the visible YouTube IFrame player.
- **Not implemented / external blockers:** e-mail confirmation (needs SMTP/Resend; password recovery works when `RESEND_API_KEY` is set), Spotify track import is limited by Spotify's app-approval rules (metadata only, no auto-matching to YouTube), avatar artwork is not bundled (names + gradients; admins attach authorized images), no Vercel/Supabase deployment files since this build targets the provided Next.js runtime.
