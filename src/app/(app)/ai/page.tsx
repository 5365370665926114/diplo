"use client";
import Link from "next/link";
import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useApp } from "@/components/AppProvider";
import { Icon } from "@/components/Icon";
import { useMusic, type Track } from "@/components/MusicProvider";
import { Empty, Img, PageTitle, Spinner, TitleCard, type CardT } from "@/components/ui";
import { api, fmtDur } from "@/lib/client/api";

type Res = { summary: string; mode: string; cached?: boolean; videos: (CardT & { reason: string })[]; music: Track[]; notes: string[]; suggestions: string[] };
const EX = ["Quero uma série adolescente com romance, brigas na escola e muito drama", "Filme de romance emocionante com final inesquecível", "Músicas românticas, tristes e calmas para ouvir à noite", "Anime de ação com viagem no tempo"];

function AI() {
  const sp = useSearchParams();
  const { toast } = useApp();
  const m = useMusic();
  const [q, setQ] = useState(sp.get("q") ?? "");
  const [thread, setThread] = useState<{ q: string; r: Res }[]>([]);
  const [busy, setBusy] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);
  const run = async (text: string) => {
    if (text.trim().length < 3 || busy) return;
    setBusy(true);
    try {
      const r = await api<Res>("/api/ai/search", { body: { q: text, history: thread.map((t) => t.q) } });
      setThread((t) => [...t, { q: text, r }]); setQ("");
      setTimeout(() => bottom.current?.scrollIntoView({ behavior: "smooth" }), 100);
    } catch (e) { toast((e as Error).message, "err"); } finally { setBusy(false); }
  };
  useEffect(() => { if (sp.get("q")) run(sp.get("q")!); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const last = thread[thread.length - 1]?.r;
  return (
    <div className="px-4 sm:px-8 lg:px-10 pb-40 max-w-5xl">
      <PageTitle title="AI Search" sub="Descreva o que você quer assistir ou ouvir — buscamos em catálogos reais" icon="ai" />
      {thread.length === 0 && (
        <div className="mt-10 stagger"><div className="eyebrow mb-3">Experimente</div>
          <div className="grid gap-3 sm:grid-cols-2">{EX.map((e) => <button key={e} onClick={() => run(e)} className="panel p-4 text-left text-sm hover:bg-white/5 hover:!border-red-600/50 transition flex gap-3"><Icon name="ai" size={18} className="text-[var(--red2)] flex-none mt-0.5" />{e}</button>)}</div>
          <p className="text-xs text-[var(--muted)] mt-6">Sem inventar títulos: a IA só interpreta seu pedido; os resultados vêm do TMDB e do YouTube. Sem provedor de IA configurado, usamos um interpretador por regras.</p></div>
      )}
      {thread.map((t, i) => (
        <div key={i} className="mt-8 page-enter">
          <div className="flex justify-end"><div className="bg-red-600/90 rounded-2xl rounded-br-md px-4 py-2.5 text-sm max-w-[85%]">{t.q}</div></div>
          <div className="mt-4 flex items-center gap-2 text-xs text-[var(--muted)]"><Icon name="ai" size={14} className="text-[var(--red2)]" />Entendi: <span className="text-white">{t.r.summary}</span><span className="chip !py-0">{t.r.mode === "ia" ? "IA" : "regras"}{t.r.cached ? " · cache" : ""}</span></div>
          {t.r.notes.map((n) => <div key={n} className="mt-3 text-sm rounded-xl bg-amber-500/15 text-amber-300 p-3">{n}</div>)}
          {t.r.videos.length > 0 && <div className="grid gap-x-4 gap-y-7 mt-4" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(150px,1fr))" }}>{t.r.videos.slice(0, 12).map((v) => <div key={v.type + v.id}><div className="[&>a]:!w-full"><TitleCard item={v} variant="poster" /></div><p className="text-[11px] text-[var(--muted)] mt-1.5 leading-snug">{v.reason}</p></div>)}</div>}
          {t.r.music.length > 0 && <div className="panel mt-5 p-2">{t.r.music.map((tr, k) => <button key={tr.videoId} onClick={() => m.play(t.r.music, k)} className="w-full flex items-center gap-3 p-2 rounded-xl hover:bg-white/5 text-left"><Img src={tr.thumbnail} alt="" className="w-12 h-12 rounded-lg object-cover" /><span className="min-w-0 flex-1"><span className="block text-sm font-semibold truncate">{tr.title}</span><span className="block text-xs text-[var(--muted)] truncate">{tr.artist}</span></span><span className="text-xs text-[var(--muted)]">{fmtDur(tr.durationSec)}</span><Icon name="play" size={16} fill /></button>)}</div>}
          {!t.r.videos.length && !t.r.music.length && !t.r.notes.length && <div className="mt-4"><Empty icon="search" title="Nenhum resultado real encontrado" text="Tente descrever com outras palavras (gêneros, temas, clima)." /></div>}
        </div>
      ))}
      {busy && <div className="mt-8 flex items-center gap-3 text-sm text-[var(--muted)]"><Spinner />Interpretando e consultando catálogos…</div>}
      <div ref={bottom} />
      <div className="fixed left-0 right-0 bottom-[calc(76px+var(--safe-b))] lg:bottom-6 lg:left-[76px] z-30 px-4"><div className="max-w-3xl mx-auto">
        {last && <div className="flex gap-2 mb-2 overflow-x-auto no-scrollbar">{last.suggestions.map((s) => <button key={s} className="chip glass flex-none" onClick={() => run(s)}>{s}</button>)}<Link href="/explore" className="chip glass flex-none">Explorar filtros</Link></div>}
        <form onSubmit={(e) => { e.preventDefault(); run(q); }} className="glass rounded-full flex items-center pl-5 pr-1.5 h-14" style={{ boxShadow: "0 20px 60px -10px rgba(0,0,0,.8)" }}>
          <input className="flex-1 bg-transparent outline-none text-base" placeholder={thread.length ? "Refine: “mais curtos”, “só séries”…" : "O que você quer assistir ou ouvir?"} value={q} onChange={(e) => setQ(e.target.value)} maxLength={300} aria-label="Pergunta" />
          <button className="btn btn-primary btn-icon !w-11 !h-11" disabled={busy || q.trim().length < 3} aria-label="Enviar"><Icon name="chevR" /></button>
        </form></div></div>
    </div>
  );
}
export default function Page() { return <Suspense><AI /></Suspense>; }
