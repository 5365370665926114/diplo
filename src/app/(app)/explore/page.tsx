"use client";
import { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useApp } from "@/components/AppProvider";
import { Icon } from "@/components/Icon";
import { Empty, ErrorBox, PageTitle, Skeleton, Spinner, TitleCard, type CardT } from "@/components/ui";
import { api, useFetch } from "@/lib/client/api";
import { GENRES } from "@/lib/genres";

const KINDS = [["movies", "Filmes"], ["series", "Séries"], ["animes", "Animes"], ["doramas", "Doramas"]];
const SORTS = [["popularity.desc", "Populares"], ["vote_average.desc", "Melhor avaliados"], ["primary_release_date.desc", "Mais recentes"]];

function Explore() {
  const sp = useSearchParams();
  const router = useRouter();
  const { me } = useApp();
  const [q, setQ] = useState(sp.get("q") ?? "");
  const [kind, setKind] = useState("movies");
  const [genre, setGenre] = useState("");
  const [sort, setSort] = useState("popularity.desc");
  const [year, setYear] = useState("");
  const provider = sp.get("provider") ?? "";
  const [items, setItems] = useState<CardT[]>([]);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [busy, setBusy] = useState(true);
  const [err, setErr] = useState<{ message: string; code?: string } | null>(null);
  const hist = useFetch<{ items: string[] }>("/api/misc/search-history");

  const load = useCallback(async (p: number, replace: boolean) => {
    setBusy(true); setErr(null);
    try {
      const qs = q.trim() ? `q=${encodeURIComponent(q.trim())}&save=1` : `kind=${kind}&genre=${genre}&sort=${kind === "movies" ? sort : sort.replace("primary_release_date", "first_air_date")}&year=${year}&provider=${provider}`;
      const d = await api<{ items: CardT[]; totalPages: number }>(`/api/discover?${qs}&page=${p}`);
      setItems((x) => (replace ? d.items : [...x, ...d.items])); setPage(p); setPages(d.totalPages);
    } catch (e) { setErr(e as Error & { code?: string }); } finally { setBusy(false); }
  }, [q, kind, genre, sort, year, provider]);
  useEffect(() => { const id = setTimeout(() => load(1, true), q ? 350 : 0); return () => clearTimeout(id); }, [load, q]);

  return (
    <div className="px-4 sm:px-8 lg:px-10 pb-16">
      <PageTitle title="Explorar" sub="Filtre o catálogo completo do TMDB" icon="compass" />
      <div className="mt-6 relative max-w-2xl"><Icon name="search" size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--muted)]" /><input className="input !h-12 !pl-11" placeholder="Buscar por título…" value={q} onChange={(e) => setQ(e.target.value)} />{q && <button className="absolute right-3 top-1/2 -translate-y-1/2" onClick={() => setQ("")} aria-label="Limpar"><Icon name="x" size={16} /></button>}</div>
      {!q && hist.data && hist.data.items.length > 0 && <div className="flex flex-wrap gap-2 mt-3 items-center"><span className="text-xs text-[var(--muted)]">Recentes:</span>{hist.data.items.slice(0, 6).map((h) => <button key={h} className="chip" onClick={() => setQ(h)}>{h}</button>)}<button className="text-xs text-[var(--muted)] underline" onClick={async () => { await api("/api/discover", { method: "DELETE" }); hist.reload(); }}>limpar</button></div>}
      {!q && (
        <div className="mt-5 space-y-3">
          <div className="flex flex-wrap gap-2">{KINDS.map(([k, l]) => <button key={k} className={`chip !text-sm !px-4 !py-2 ${kind === k ? "on" : ""}`} onClick={() => { setKind(k); setGenre(""); }}>{l}</button>)}
            {provider && <button className="chip on" onClick={() => router.replace("/explore")}>Plataforma #{provider}<Icon name="x" size={12} /></button>}</div>
          <div className="flex flex-wrap gap-2 items-center">
            <button className={`chip ${genre === "" ? "on" : ""}`} onClick={() => setGenre("")}>Todos</button>
            {GENRES.map((g) => <button key={g.id} className={`chip ${genre === String(g.id) ? "on" : ""}`} onClick={() => setGenre(String(g.id))}>{g.pt}</button>)}
          </div>
          <div className="flex gap-2 flex-wrap"><select className="input !w-auto !h-10 !text-sm" value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Ordenar">{SORTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
            <input className="input !w-28 !h-10 !text-sm" placeholder="Ano" inputMode="numeric" maxLength={4} value={year} onChange={(e) => setYear(e.target.value.replace(/\D/g, ""))} /></div>
        </div>
      )}
      <div className="mt-8">
        {err ? <ErrorBox message={err.message} onRetry={() => load(1, true)} admin={me?.user.isAdmin && err.code === "tmdb_not_configured"} /> : (
          <>
            <div className="grid gap-x-4 gap-y-6 stagger" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(140px,1fr))" }}>
              {items.map((it, n) => <div key={it.type + it.id + n} className="[&>a]:!w-full"><TitleCard item={it} variant="poster" /></div>)}
              {busy && page === 1 && Array.from({ length: 12 }).map((_, i) => <Skeleton key={i} style={{ aspectRatio: "2/3" }} />)}
            </div>
            {!busy && items.length === 0 && <Empty icon="search" title="Nada encontrado" text="Ajuste os filtros ou tente outro termo." />}
            {items.length > 0 && page < pages && <div className="flex justify-center mt-10"><button className="btn btn-ghost" disabled={busy} onClick={() => load(page + 1, false)}>{busy ? <Spinner size={16} /> : "Carregar mais"}</button></div>}
          </>
        )}
      </div>
    </div>
  );
}
export default function Page() { return <Suspense><Explore /></Suspense>; }
