"use client";
import Link from "next/link";
import { use, useEffect, useState } from "react";
import { WatchlistButton } from "@/components/Catalog";
import { useApp } from "@/components/AppProvider";
import { Icon } from "@/components/Icon";
import { ErrorBox, Img, Modal, Rail, Reveal, Section, Skeleton, TitleCard, type CardT } from "@/components/ui";
import { api, img, useFetch } from "@/lib/client/api";

type Title = {
  id: number; type: "movie" | "tv"; kind: string; title: string; tagline: string; overview: string; poster: string | null; backdrop: string | null; rating: number; votes: number; year: string; runtime: number | null; status: string;
  genres: { id: number; name: string }[]; seasons: { number: number; name: string; episodes: number }[]; cast: { id: number; name: string; character: string; photo: string | null }[]; directors: string[];
  trailer: { key: string; name: string } | null; recommendations: CardT[];
  where: { link: string | null; flatrate: P[]; rent: P[]; buy: P[] }; state: { favorite: boolean; watchlist: boolean };
  resume: { season: number; episode: number; position: number; duration: number; completed: boolean } | null;
};
type P = { id: number; name: string; logo: string };
type Eps = { episodes: { number: number; name: string; overview: string; still: string | null; runtime: number | null; progress: number; completed: boolean }[] };

export default function Page({ params }: { params: Promise<{ type: string; id: string }> }) {
  const { type, id } = use(params);
  const { toast } = useApp();
  const { data: t, error, reload } = useFetch<Title>(`/api/title/${type}/${id}`);
  const [season, setSeason] = useState(1);
  const eps = useFetch<Eps>(t?.type === "tv" ? `/api/title/tv/${id}?season=${season}` : null, [season, t?.id]);
  const [trailer, setTrailer] = useState(false);
  const [fav, setFav] = useState(false);
  useEffect(() => { if (t) { setFav(t.state.favorite); if (t.resume && t.resume.season) setSeason(t.resume.season); } }, [t?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (error) return <div className="p-6 pt-24"><ErrorBox message={error.message} onRetry={reload} /></div>;
  if (!t) return <div><Skeleton className="!rounded-none h-[60vh]" /><div className="p-8"><Skeleton className="h-10 w-72" /></div></div>;
  const card: CardT = { id: t.id, type: t.type, title: t.title, poster: t.poster, backdrop: t.backdrop, overview: t.overview, rating: t.rating, year: t.year, genres: [] };
  const resumeHref = t.resume && !t.resume.completed ? `/watch/${t.type}/${t.id}?season=${t.resume.season || 1}&episode=${t.resume.episode || 1}` : `/watch/${t.type}/${t.id}`;
  const toggleFav = async () => { try { const r = await api<{ active: boolean }>("/api/lists", { body: { list: "favorites", tmdbId: t.id, type: t.type, title: t.title, poster: t.poster, backdrop: t.backdrop } }); setFav(r.active); toast(r.active ? "Adicionado aos favoritos" : "Removido dos favoritos", "ok"); } catch (e) { toast((e as Error).message, "err"); } };
  const legal = [...t.where.flatrate.map((p) => ({ ...p, k: "Streaming" })), ...t.where.rent.map((p) => ({ ...p, k: "Alugar" })), ...t.where.buy.map((p) => ({ ...p, k: "Comprar" }))];

  return (
    <div className="pb-20">
      <div className="relative h-[68vh] min-h-[460px] overflow-hidden">
        <Img src={img(t.backdrop || t.poster, "w1280")} alt="" className="w-full h-full object-cover" style={{ transform: "scale(1.04)" }} />
        <div className="absolute inset-0" style={{ background: "linear-gradient(90deg,rgba(5,5,5,.94),rgba(5,5,5,.45) 55%,rgba(5,5,5,.1)), linear-gradient(0deg,#050505 3%,transparent 55%)" }} />
        <div className="absolute inset-x-0 bottom-0 px-4 sm:px-8 lg:px-10 pb-10 flex gap-8 items-end">
          <div className="hidden md:block w-52 flex-none card scale-in" style={{ aspectRatio: "2/3" }}><Img src={img(t.poster, "w500")} alt={t.title} className="w-full h-full object-cover" /></div>
          <div className="max-w-3xl stagger">
            <div className="flex flex-wrap items-center gap-2 text-xs"><span className="chip glass">{t.type === "tv" ? "Série" : "Filme"}</span><span>{t.year}</span>{t.runtime ? <span>· {Math.floor(t.runtime / 60) ? `${Math.floor(t.runtime / 60)}h ` : ""}{t.runtime % 60}min</span> : null}<span className="flex items-center gap-1 font-bold"><Icon name="star" size={13} fill style={{ color: "#facc15" }} />{t.rating}<span className="text-[var(--muted)] font-normal">({t.votes})</span></span></div>
            <h1 className="h-display text-4xl sm:text-6xl mt-3">{t.title}</h1>
            {t.tagline && <p className="italic text-white/60 mt-2">{t.tagline}</p>}
            <div className="flex flex-wrap gap-2 mt-4">{t.genres.map((g) => <Link key={g.id} href={`/explore?q=${encodeURIComponent(g.name)}`} className="chip">{g.name}</Link>)}</div>
            <p className="mt-4 text-white/80 max-w-2xl line-clamp-4 sm:line-clamp-none">{t.overview || "Sinopse indisponível."}</p>
            <div className="flex flex-wrap items-center gap-2.5 mt-6">
              <Link href={resumeHref} className="btn btn-light !h-12 !px-7"><Icon name="play" size={16} fill />{t.resume && !t.resume.completed ? "Continuar" : "Assistir"}</Link>
              {t.trailer && <button className="btn btn-ghost !h-12" onClick={() => setTrailer(true)}><Icon name="film" size={17} />Trailer</button>}
              <button className={`btn btn-ghost btn-icon !h-12 !w-12 ${fav ? "!bg-red-600 !border-red-600" : ""}`} onClick={toggleFav} aria-label="Favoritar" aria-pressed={fav}><Icon name="heart" size={18} fill={fav} /></button>
              <WatchlistButton item={card} className="!h-12 !w-12" />
            </div>
            {t.directors.length > 0 && <p className="text-sm text-[var(--muted)] mt-5">{t.type === "tv" ? "Criação" : "Direção"}: <span className="text-white">{t.directors.join(", ")}</span></p>}
          </div>
        </div>
      </div>

      <div className="px-4 sm:px-8 lg:px-10">
        {t.type === "tv" && (
          <Reveal><Section title="Temporadas e episódios" eyebrow="Assista">
            <div className="flex gap-2 overflow-x-auto no-scrollbar mt-4">{t.seasons.map((s) => <button key={s.number} className={`chip !text-sm !px-4 !py-2 flex-none ${season === s.number ? "on" : ""}`} onClick={() => setSeason(s.number)}>{s.name}</button>)}</div>
            <div className="grid gap-3 mt-4 md:grid-cols-2 stagger">
              {eps.loading && Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28" />)}
              {eps.data?.episodes.map((e) => (
                <Link key={e.number} href={`/watch/tv/${t.id}?season=${season}&episode=${e.number}`} className="panel flex gap-3 p-2.5 hover:bg-white/5 transition group">
                  <div className="relative w-40 flex-none rounded-xl overflow-hidden" style={{ aspectRatio: "16/9" }}><Img src={img(e.still || t.backdrop, "w300")} alt="" className="w-full h-full object-cover" /><span className="absolute inset-0 grid place-items-center bg-black/40 opacity-0 group-hover:opacity-100 transition"><Icon name="play" fill /></span>{e.progress > 0 && <div className="absolute bottom-0 inset-x-0 h-1 bg-white/20"><div className="h-full bg-[var(--red)]" style={{ width: `${e.progress * 100}%` }} /></div>}</div>
                  <div className="min-w-0 py-1"><div className="text-sm font-semibold truncate">{e.number}. {e.name}{e.completed && <Icon name="check" size={13} className="inline ml-1.5 text-emerald-400" />}</div><div className="text-[11px] text-[var(--muted)]">{e.runtime ? `${e.runtime} min` : ""}</div><p className="text-xs text-white/60 line-clamp-2 mt-1">{e.overview}</p></div>
                </Link>
              ))}
            </div>
          </Section></Reveal>
        )}
        <Reveal><Section title="Onde assistir legalmente" eyebrow="Disponibilidade (BR)">
          {legal.length ? <div className="flex flex-wrap gap-3 mt-4">{legal.map((p, n) => <span key={p.id + p.k + n} className="panel flex items-center gap-2.5 pr-4 p-2"><span className="w-10 h-10 rounded-xl overflow-hidden"><Img src={img(p.logo, "w92")} alt={p.name} className="w-full h-full object-cover" /></span><span><span className="block text-sm font-semibold">{p.name}</span><span className="block text-[10px] text-[var(--muted)] uppercase tracking-wider">{p.k}</span></span></span>)}</div> : <p className="text-sm text-[var(--muted)] mt-3">Nenhum serviço legal listado para sua região.</p>}
          {t.where.link && <a href={t.where.link} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-xs text-[var(--muted)] mt-3 hover:text-white">Ver no TMDB / JustWatch<Icon name="external" size={12} /></a>}
        </Section></Reveal>
        {t.cast.length > 0 && <Reveal><Section title="Elenco"><Rail>{t.cast.map((c) => (
          <div key={c.id} className="flex-none w-28 text-center"><div className="w-24 h-24 mx-auto rounded-full overflow-hidden bg-[#16161c]"><Img src={img(c.photo, "w185")} alt={c.name} className="w-full h-full object-cover" /></div><div className="text-xs font-semibold mt-2 truncate">{c.name}</div><div className="text-[10px] text-[var(--muted)] truncate">{c.character}</div></div>))}</Rail></Section></Reveal>}
        {t.recommendations.length > 0 && <Reveal><Section title="Recomendações"><Rail>{t.recommendations.map((r) => <TitleCard key={r.id} item={r} variant="poster" />)}</Rail></Section></Reveal>}
      </div>
      {trailer && t.trailer && <Modal onClose={() => setTrailer(false)} wide><div className="font-bold mb-3 pr-10">{t.trailer.name}</div><div className="rounded-xl overflow-hidden" style={{ aspectRatio: "16/9" }}><iframe className="w-full h-full" src={`https://www.youtube.com/embed/${t.trailer.key}?autoplay=1&rel=0`} title="Trailer" allow="autoplay; encrypted-media; fullscreen" allowFullScreen /></div></Modal>}
    </div>
  );
}
