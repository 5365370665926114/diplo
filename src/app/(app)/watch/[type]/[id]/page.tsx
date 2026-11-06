"use client";
import Link from "next/link";
import { use, useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useApp } from "@/components/AppProvider";
import { Icon } from "@/components/Icon";
import { ErrorBox, Img, Skeleton, Spinner } from "@/components/ui";
import { api, img, useFetch } from "@/lib/client/api";

type Server = { id: string; name: string; state: "available" | "unknown"; message: string; url: string; features: { resume: boolean; events: boolean; episodes: boolean }; origin: string; latencyMs: number };
type Resolve = { servers: Server[]; checked: number; configured: number; startTime: number };
type Title = { id: number; type: string; kind: string; title: string; poster: string | null; backdrop: string | null; seasons: { number: number; episodes: number }[]; where: { flatrate: { id: number; name: string; logo: string }[]; rent: { id: number; name: string; logo: string }[]; buy: { id: number; name: string; logo: string }[]; link: string | null } };

/** PlayerProviderManager (UI side): resolved + availability-confirmed servers, switching preserves context, telemetry only from validated origins. */
export default function Page({ params }: { params: Promise<{ type: string; id: string }> }) {
  const { type, id } = use(params);
  const sp = useSearchParams();
  const router = useRouter();
  const { me } = useApp();
  const season = Number(sp.get("season") || 1);
  const episode = Number(sp.get("episode") || 1);
  const title = useFetch<Title>(`/api/title/${type}/${id}`);
  const eps = useFetch<{ episodes: { number: number; name: string }[] }>(type === "tv" ? `/api/title/tv/${id}?season=${season}` : null, [season]);
  const kind = title.data?.kind ?? "";
  const rs = useFetch<Resolve>(title.data ? `/api/watch?type=${type}&id=${id}&season=${season}&episode=${episode}&kind=${kind}` : null, [title.data?.id, season, episode]);
  const [sel, setSel] = useState(0);
  const [frameLoaded, setFrameLoaded] = useState(false);
  const frame = useRef<HTMLIFrameElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const sess = useRef<string | null>(null);
  const tele = useRef({ pos: 0, dur: 0, seen: false });
  const servers = rs.data?.servers ?? [];
  const server = servers[sel];

  const send = useCallback((action: string, extra: Record<string, unknown> = {}) => {
    const t = title.data; if (!t) return Promise.resolve(null);
    return api<{ sessionId?: string }>("/api/playback", { body: { action, sessionId: sess.current, tmdbId: Number(id), type, season, episode, title: t.title, poster: t.poster, backdrop: t.backdrop, position: tele.current.pos, duration: tele.current.dur, telemetry: tele.current.seen, ...extra } }).catch(() => null);
  }, [title.data, id, type, season, episode]);

  // session lifecycle + heartbeat (server credits time; client claims nothing)
  useEffect(() => {
    if (!server || !title.data) return;
    tele.current = { pos: 0, dur: 0, seen: false }; sess.current = null; setFrameLoaded(false);
    let dead = false;
    send("start", { provider: server.id, telemetry: server.features.events }).then((r) => { if (!dead && r?.sessionId) sess.current = r.sessionId; });
    const hb = setInterval(() => { if (sess.current && document.visibilityState === "visible") send("beat"); }, 15000);
    return () => { dead = true; clearInterval(hb); if (sess.current) send("beat"); };
  }, [server?.id, server?.url, title.data?.id, season, episode]); // eslint-disable-line react-hooks/exhaustive-deps

  const nextEp = eps.data?.episodes.find((e) => e.number === episode + 1);
  const goNext = useCallback(() => { if (nextEp) router.replace(`/watch/tv/${id}?season=${season}&episode=${nextEp.number}`); else { const ns = title.data?.seasons.find((s) => s.number === season + 1); if (ns) router.replace(`/watch/tv/${id}?season=${ns.number}&episode=1`); } }, [nextEp, id, season, router, title.data]);

  // postMessage telemetry — strict origin + source-window + shape validation
  useEffect(() => {
    const h = (e: MessageEvent) => {
      if (!server || !server.features.events) return;
      if (e.origin !== server.origin || e.source !== frame.current?.contentWindow) return;
      let m: unknown = e.data; if (typeof m === "string") { try { m = JSON.parse(m); } catch { return; } }
      if (!m || typeof m !== "object") return;
      const o = m as Record<string, unknown>; const d = (o.data && typeof o.data === "object" ? o.data : o) as Record<string, unknown>;
      const ev = String(d.event ?? o.event ?? d.type ?? o.type ?? "");
      const ct = Number(d.currentTime ?? d.time ?? o.currentTime), du = Number(d.duration ?? o.duration);
      if (Number.isFinite(ct) && ct >= 0 && ["timeupdate", "play", "pause", "seeked", "ended", "playerstatus", "MEDIA_DATA"].includes(ev)) {
        tele.current.pos = ct; if (Number.isFinite(du) && du > 0) tele.current.dur = du; if (ev === "timeupdate") tele.current.seen = true;
      }
      if (ev === "ended") { send("beat"); goNext(); }
    };
    window.addEventListener("message", h); return () => window.removeEventListener("message", h);
  }, [server, send, goNext]);

  const url = server ? (server.id === "cinemaos" && tele.current.pos > 5 && !server.url.includes("startTime") ? `${server.url}&startTime=${Math.floor(tele.current.pos)}` : server.url) : "";
  const full = () => box.current?.requestFullscreen?.().catch(() => {});
  const legal = [...(title.data?.where.flatrate ?? []), ...(title.data?.where.rent ?? [])];

  if (title.error) return <div className="p-6 pt-24"><ErrorBox message={title.error.message} onRetry={title.reload} /></div>;
  return (
    <div className="px-4 sm:px-8 lg:px-10 pt-5 pb-20 max-w-[1500px] mx-auto">
      <div className="flex items-center gap-3 mb-4">
        <Link href={`/title/${type}/${id}`} className="btn btn-ghost btn-icon" aria-label="Voltar aos detalhes"><Icon name="chevL" /></Link>
        <div className="min-w-0"><h1 className="font-bold text-lg sm:text-xl truncate">{title.data?.title ?? "…"}</h1>{type === "tv" && <div className="text-xs text-[var(--muted)]">Temporada {season} · Episódio {episode}</div>}</div>
        <span className="flex-1" />
        {type === "tv" && nextEp && <button className="btn btn-ghost btn-sm" onClick={goNext}>Próximo episódio<Icon name="next" size={14} /></button>}
      </div>

      <div ref={box} className="relative rounded-2xl overflow-hidden bg-black border border-white/10" style={{ aspectRatio: "16/9", boxShadow: "0 30px 80px -20px rgba(229,9,20,.25)" }}>
        {(rs.loading || title.loading) && <div className="absolute inset-0 grid place-items-center"><div className="text-center"><Spinner size={32} /><p className="text-sm text-[var(--muted)] mt-3">Verificando servidores…</p></div></div>}
        {server && <>
          {!frameLoaded && <div className="absolute inset-0 grid place-items-center z-10 bg-black"><Spinner size={32} /></div>}
          <iframe key={server.id + url} ref={frame} src={url} title={title.data?.title} className="absolute inset-0 w-full h-full border-0" allow="autoplay; fullscreen; encrypted-media; picture-in-picture" allowFullScreen referrerPolicy="origin" sandbox="allow-scripts allow-same-origin allow-presentation allow-forms" onLoad={() => setFrameLoaded(true)} />
        </>}
        {rs.data && !server && (
          <div className="absolute inset-0 grid place-items-center p-6 text-center overflow-y-auto" style={{ background: `linear-gradient(rgba(5,5,5,.9),rgba(5,5,5,.96)), url(${img(title.data?.backdrop ?? null, "w780")}) center/cover` }}>
            <div className="max-w-md">
              <Icon name="alert" size={32} className="mx-auto text-[var(--red2)]" /><h2 className="font-bold text-lg mt-3">Nenhum servidor com disponibilidade confirmada</h2>
              <p className="text-sm text-[var(--muted)] mt-2">{rs.data.configured === 0 ? "Nenhum provedor de reprodução está habilitado. Um administrador precisa confirmar os direitos de incorporação e ativar um provedor no Control Center." : `Consultamos ${rs.data.checked} provedor(es) e nenhum confirmou este conteúdo${type === "tv" ? " (temporada/episódio)" : ""}.`}</p>
              {legal.length > 0 && <><div className="eyebrow justify-center mt-5 mb-2">Assista legalmente em</div><div className="flex flex-wrap justify-center gap-2">{legal.slice(0, 8).map((p) => <span key={p.id} className="panel p-1.5 pr-3 flex items-center gap-2 text-xs"><span className="w-7 h-7 rounded-lg overflow-hidden"><Img src={img(p.logo, "w92")} alt="" className="w-full h-full" /></span>{p.name}</span>)}</div></>}
              {me?.user.isAdmin && <Link href="/admin?tab=servers" className="btn btn-primary btn-sm mt-5">Gerenciar servidores</Link>}
            </div>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2 mt-4">
        <span className="eyebrow mr-2">Servidores</span>
        {servers.map((s, n) => <button key={s.id} className={`chip !text-sm !px-4 !py-2 ${sel === n ? "on" : ""}`} onClick={() => setSel(n)} title={s.message}>{s.name}{s.state === "unknown" && <span className="text-[9px] opacity-70">não verificado</span>}{s.features.resume && <Icon name="clock" size={12} />}</button>)}
        {rs.error && <span className="text-sm text-[var(--red2)]">{rs.error.message}</span>}
        <span className="flex-1" />
        <button className="btn btn-ghost btn-sm" onClick={full}><Icon name="expand" size={14} />Tela cheia</button>
        <button className="btn btn-ghost btn-sm" onClick={() => rs.reload()}><Icon name="refresh" size={14} />Reverificar</button>
      </div>
      {server && <p className="text-xs text-[var(--muted)] mt-2">{server.message}{server.features.resume ? " · Retomada e progresso via telemetria do player." : " · Este servidor não informa progresso; o tempo não conta para o ranking."}</p>}

      {type === "tv" && title.data && (
        <div className="mt-8">
          <div className="flex gap-2 overflow-x-auto no-scrollbar">{title.data.seasons.map((s) => <Link key={s.number} replace href={`/watch/tv/${id}?season=${s.number}&episode=1`} className={`chip flex-none ${s.number === season ? "on" : ""}`}>Temporada {s.number}</Link>)}</div>
          <div className="grid gap-2 mt-3 grid-cols-[repeat(auto-fill,minmax(220px,1fr))]">{eps.loading ? Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-14" />) : eps.data?.episodes.map((e) => (
            <Link key={e.number} replace href={`/watch/tv/${id}?season=${season}&episode=${e.number}`} className={`panel px-4 py-3 text-sm flex items-center gap-3 hover:bg-white/5 ${e.number === episode ? "!border-[var(--red)] bg-red-600/10" : ""}`}><span className="text-[var(--muted)] w-6">{e.number}</span><span className="truncate flex-1">{e.name}</span>{e.number === episode && <span className="eq"><i /><i /><i /></span>}</Link>))}</div>
        </div>
      )}
      {rs.loading && !rs.data && <div className="mt-6"><Skeleton className="h-10 w-80" /></div>}
    </div>
  );
}
