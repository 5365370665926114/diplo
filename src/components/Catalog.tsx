"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { api, img, useFetch } from "@/lib/client/api";
import { genreName } from "@/lib/genres";
import { useApp } from "./AppProvider";
import { Icon } from "./Icon";
import { Empty, ErrorBox, Img, Rail, RailSkeleton, Reveal, Section, Skeleton, TitleCard, type CardT } from "./ui";

type Sec = { id: string; title: string; variant?: "top10" | "wide" | "poster"; items: CardT[] };
type Home = { configured: boolean; hero: CardT[]; sections: Sec[]; providers?: { id: number; name: string; logo: string }[] };

export function WatchlistButton({ item, className = "" }: { item: CardT; className?: string }) {
  const { toast } = useApp();
  const [on, setOn] = useState<boolean | null>(null);
  useEffect(() => { api<{ lists: Record<string, { tmdbId: number; mediaType: string }[]> }>("/api/lists").then((d) => setOn(!!d.lists.watchlist?.some((x) => x.tmdbId === item.id && x.mediaType === item.type))).catch(() => {}); }, [item.id, item.type]);
  return (
    <button aria-label="Minha lista" aria-pressed={!!on} className={`btn btn-ghost btn-icon ${on ? "!bg-red-600 !border-red-600" : ""} ${className}`} onClick={async () => {
      try { const r = await api<{ active: boolean }>("/api/lists", { body: { list: "watchlist", tmdbId: item.id, type: item.type, title: item.title, poster: item.poster, backdrop: item.backdrop } }); setOn(r.active); toast(r.active ? "Adicionado à sua lista" : "Removido da lista", "ok"); } catch (e) { toast((e as Error).message, "err"); }
    }}><Icon name={on ? "check" : "bookmark"} size={18} /></button>
  );
}

function Hero({ items }: { items: CardT[] }) {
  const { lang } = useApp();
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  const touch = useRef(0);
  useEffect(() => { if (paused || items.length < 2) return; const id = setTimeout(() => setI((x) => (x + 1) % items.length), 8000); return () => clearTimeout(id); }, [i, paused, items.length]);
  const cur = items[i];
  if (!cur) return null;
  const up = [1, 2, 3].map((k) => items[(i + k) % items.length]).filter((x, idx, a) => x && x.id !== cur.id && a.indexOf(x) === idx);
  return (
    <div className="relative -mx-4 sm:-mx-8 lg:-mx-10 h-[74vh] min-h-[480px] max-h-[820px] overflow-hidden" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}
      onTouchStart={(e) => (touch.current = e.touches[0].clientX)} onTouchEnd={(e) => { const dx = e.changedTouches[0].clientX - touch.current; if (Math.abs(dx) > 60) setI((x) => (x + (dx < 0 ? 1 : -1) + items.length) % items.length); }}>
      {items.map((it, k) => (
        <div key={it.type + it.id} className="absolute inset-0" style={{ opacity: k === i ? 1 : 0, transition: "opacity 1s var(--ease)", pointerEvents: "none" }}>
          <Img src={img(it.backdrop, "w1280")} alt="" className="w-full h-full object-cover" style={{ transform: k === i ? "scale(1.06)" : "scale(1.0)", transition: "transform 9s linear, opacity .8s" }} />
        </div>
      ))}
      <div className="absolute inset-0" style={{ background: "linear-gradient(90deg,rgba(5,5,5,.92) 0%,rgba(5,5,5,.5) 45%,rgba(5,5,5,.1) 75%), linear-gradient(0deg,#050505 2%,transparent 45%)" }} />
      <div className="absolute inset-x-0 bottom-0 px-4 sm:px-8 lg:px-10 pb-16 sm:pb-20 flex items-end justify-between gap-8">
        <div key={cur.id} className="max-w-2xl stagger">
          <div className="flex items-center gap-2 text-[11px] font-bold tracking-widest uppercase text-white/80"><span className="chip glass !py-1">{cur.type === "tv" ? "Série" : "Filme"}</span><span>#{i + 1} em alta · {cur.year}</span></div>
          <h1 className="h-display text-4xl sm:text-6xl mt-3 drop-shadow-[0_6px_30px_rgba(0,0,0,.7)]">{cur.title}</h1>
          <div className="flex flex-wrap items-center gap-2 mt-4 text-sm"><span className="flex items-center gap-1 font-bold"><Icon name="star" size={14} fill style={{ color: "#facc15" }} />{cur.rating}</span>{cur.genres.slice(0, 3).map((g) => <span key={g} className="chip">{genreName(g, lang)}</span>)}</div>
          <p className="mt-4 text-white/80 text-sm sm:text-base line-clamp-3 max-w-xl">{cur.overview}</p>
          <div className="flex items-center gap-2.5 mt-6">
            <Link href={`/watch/${cur.type}/${cur.id}`} className="btn btn-light !h-12 !px-7"><Icon name="play" size={16} fill />Assistir</Link>
            <Link href={`/title/${cur.type}/${cur.id}`} className="btn btn-ghost !h-12"><Icon name="info" size={17} />Mais info</Link>
            <WatchlistButton item={cur} className="!h-12 !w-12" />
          </div>
        </div>
        <div className="hidden xl:block flex-none w-[560px]"><div className="eyebrow mb-2">A seguir</div><div className="flex gap-3">
          {up.map((u) => <button key={u.id} onClick={() => setI(items.indexOf(u))} className="w-44 text-left group"><div className="card" style={{ aspectRatio: "16/9" }}><Img src={img(u.backdrop, "w300")} alt={u.title} className="w-full h-full object-cover" /></div><div className="text-xs font-semibold mt-1.5 truncate text-white/70 group-hover:text-white">{u.title}</div></button>)}</div></div>
      </div>
      <div className="absolute bottom-6 left-4 sm:left-8 lg:left-10 flex items-center gap-1.5">
        {items.map((_, k) => <button key={k} onClick={() => setI(k)} aria-label={`Slide ${k + 1}`} className="h-[3px] w-8 sm:w-11 rounded-full bg-white/25 overflow-hidden"><span className="block h-full bg-white origin-left" style={{ transform: k < i ? "scaleX(1)" : "scaleX(0)", animation: k === i && !paused ? "lineGrow 8s linear both" : undefined, ...(k === i && paused ? { transform: "scaleX(1)" } : {}) }} /></button>)}
        <button className="btn btn-ghost btn-icon !w-8 !h-8 ml-3 hidden sm:inline-flex" onClick={() => setI((i - 1 + items.length) % items.length)} aria-label="Anterior"><Icon name="chevL" size={14} /></button>
        <button className="btn btn-ghost btn-icon !w-8 !h-8 hidden sm:inline-flex" onClick={() => setI((i + 1) % items.length)} aria-label="Próximo"><Icon name="chevR" size={14} /></button>
      </div>
    </div>
  );
}

export function CatalogView({ kind }: { kind: string }) {
  const { data, error, loading, reload } = useFetch<Home>(`/api/home?kind=${kind}`, [kind]);
  const { me } = useApp();
  if (error) return <div className="pt-24"><ErrorBox message={error.message} onRetry={reload} admin={me?.user.isAdmin && error.code === "tmdb_not_configured"} /></div>;
  if (loading || !data) return <div><Skeleton className="-mx-4 sm:-mx-8 lg:-mx-10 !rounded-none h-[60vh]" /><div className="mt-8"><RailSkeleton /><RailSkeleton /></div></div>;
  if (!data.configured) return <div className="pt-24"><Empty icon="settings" title="Catálogo ainda não configurado" text="O catálogo usa a API oficial do TMDB. Um administrador precisa informar a TMDB_API_KEY em Control Center → Configurações." action={me?.user.isAdmin ? <Link href="/admin?tab=settings" className="btn btn-primary">Abrir Control Center</Link> : undefined} /></div>;
  return (
    <div>
      <Hero items={data.hero} />
      <div className="-mt-10 relative z-10">
        {data.sections.map((s) => (
          <Reveal key={s.id}>
            <Section title={s.title} eyebrow={s.id === "continue" ? "Retome de onde parou" : s.id === "top10" ? "Mais assistidos" : undefined}>
              <Rail>{s.items.map((it, n) => <TitleCard key={it.type + it.id + n} item={it} variant={s.variant} rank={n + 1} />)}</Rail>
            </Section>
            {s.id === "top10" && data.providers && data.providers.length > 0 && (
              <Section title="Provedores de streaming" eyebrow="Onde assistir"><Rail>{data.providers.map((p) => (
                <Link key={p.id} href={`/explore?provider=${p.id}`} className="flex-none w-[84px] text-center group"><span className="block w-16 h-16 mx-auto rounded-2xl overflow-hidden card"><Img src={img(p.logo, "w154")} alt={p.name} className="w-full h-full object-cover" /></span><span className="text-[11px] text-[var(--muted)] mt-1.5 block truncate">{p.name}</span></Link>))}</Rail><p className="text-[10px] text-[var(--muted)] px-1">Dados de provedores: TMDB / JustWatch.</p></Section>
            )}
          </Reveal>
        ))}
      </div>
    </div>
  );
}
