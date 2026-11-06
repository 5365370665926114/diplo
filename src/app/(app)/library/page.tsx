"use client";
import Link from "next/link";
import { useState } from "react";
import { Empty, ErrorBox, PageTitle, Skeleton, TitleCard, type CardT } from "@/components/ui";
import { useFetch } from "@/lib/client/api";

type Item = { tmdbId: number; mediaType: "movie" | "tv"; title: string; posterPath: string | null; backdropPath: string | null };
type Prog = Item & { season: number; episode: number; positionSec: number; durationSec: number; completed: boolean; updatedAt: string };
const toCard = (i: Item): CardT => ({ id: i.tmdbId, type: i.mediaType, title: i.title, poster: i.posterPath, backdrop: i.backdropPath, overview: "", rating: 0, year: "", genres: [] });

export default function Page() {
  const lists = useFetch<{ lists: Record<string, Item[]> }>("/api/lists");
  const prog = useFetch<{ items: (Prog & { tmdbId: number })[] }>("/api/playback");
  const [tab, setTab] = useState("favorites");
  const cont = (prog.data?.items ?? []).filter((p) => !p.completed && p.positionSec > 30);
  const hist = prog.data?.items ?? [];
  const tabs: [string, string, number][] = [["favorites", "Favoritos", lists.data?.lists.favorites?.length ?? 0], ["watchlist", "Minha lista", lists.data?.lists.watchlist?.length ?? 0], ["continue", "Continuar assistindo", cont.length], ["history", "Histórico", hist.length]];
  const err = lists.error || prog.error;
  return (
    <div className="px-4 sm:px-8 lg:px-10 pb-16">
      <PageTitle title="Biblioteca" sub="Sincronizada com sua conta em todos os dispositivos" icon="library" />
      <div className="flex gap-2 mt-6 overflow-x-auto no-scrollbar">{tabs.map(([k, l, n]) => <button key={k} className={`chip !text-sm !px-4 !py-2 flex-none ${tab === k ? "on" : ""}`} onClick={() => setTab(k)}>{l}<span className="opacity-60">{n}</span></button>)}
        <Link href="/music" className="chip !text-sm !px-4 !py-2 flex-none">Playlists musicais →</Link></div>
      <div className="mt-8">
        {err ? <ErrorBox message={err.message} onRetry={() => { lists.reload(); prog.reload(); }} /> : !lists.data || !prog.data ? <div className="grid gap-4 grid-cols-[repeat(auto-fill,minmax(150px,1fr))]">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} style={{ aspectRatio: "2/3" }} />)}</div> : (
          <div className="grid gap-x-4 gap-y-6 stagger" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(150px,1fr))" }} key={tab}>
            {(tab === "favorites" || tab === "watchlist") && (lists.data.lists[tab] ?? []).map((i) => <div key={i.tmdbId + i.mediaType} className="[&>a]:!w-full"><TitleCard item={toCard(i)} variant="poster" /></div>)}
            {tab === "continue" && cont.map((p) => <div key={p.tmdbId + "-" + p.season + p.episode} className="[&>a]:!w-full"><TitleCard item={{ ...toCard(p), title: p.title, progress: p.durationSec ? p.positionSec / p.durationSec : 0, season: p.mediaType === "tv" ? p.season : undefined, episode: p.episode }} variant="wide" /></div>)}
            {tab === "history" && hist.map((p) => <div key={p.tmdbId + "-" + p.season + p.episode} className="[&>a]:!w-full"><TitleCard item={toCard(p)} variant="poster" /></div>)}
          </div>
        )}
        {lists.data && prog.data && ((tab === "favorites" || tab === "watchlist") ? !(lists.data.lists[tab]?.length) : tab === "continue" ? !cont.length : !hist.length) && <Empty icon="library" title="Nada por aqui ainda" text="Favorite títulos e assista conteúdos para preencher sua biblioteca." action={<Link href="/explore" className="btn btn-primary">Explorar catálogo</Link>} />}
      </div>
    </div>
  );
}
