"use client";
import { useEffect, useLayoutEffect, useState } from "react";
import { useApp } from "./AppProvider";
import { Icon } from "./Icon";

const STEPS: { title: string; text: string; d: string; m: string }[] = [
  { title: "Menu de navegação", text: "Tudo a um toque: filmes, séries, animes, doramas, música e mais. Passe o mouse para expandir.", d: "nav", m: "m-nav" },
  { title: "Explorar filmes e séries", text: "Filtre por gênero, ano, ordenação e plataforma para descobrir o que assistir.", d: "d-explore", m: "m-explore" },
  { title: "Pesquisa inteligente com IA", text: "Descreva o que você quer em linguagem natural e receba obras reais com justificativas.", d: "d-ai", m: "m-more" },
  { title: "Página de detalhes", text: "Toque em qualquer capa para ver sinopse, elenco, trailer, temporadas e onde assistir.", d: "card", m: "card" },
  { title: "Biblioteca e favoritos", text: "Seus favoritos, listas e progresso ficam sincronizados em todos os dispositivos.", d: "d-library", m: "m-more" },
  { title: "DiploMusic", text: "Descubra artistas, monte playlists, importe do YouTube e acompanhe letras sincronizadas.", d: "d-music", m: "m-music" },
  { title: "Rankings", text: "Horas verificadas e apoiadores: veja quem lidera e desbloqueie conquistas.", d: "d-rankings", m: "m-more" },
  { title: "Configurações do perfil", text: "Ajuste idioma, privacidade, PIN e refaça este tour quando quiser em Ajuda.", d: "d-settings", m: "m-profile" },
];

export function Tutorial({ onDone }: { onDone: (completed: boolean) => void }) {
  const { markStep } = useApp();
  const [i, setI] = useState(0);
  const [rect, setRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const s = STEPS[i];

  useLayoutEffect(() => {
    const measure = () => {
      const mobile = window.innerWidth < 1024;
      const key = mobile ? s.m : s.d;
      const el = key === "card" ? document.querySelector<HTMLElement>(".card") : document.querySelector<HTMLElement>(`[data-tour="${key}"]`);
      if (!el) return setRect(null);
      el.scrollIntoView({ block: "center", behavior: "smooth" });
      const r = el.getBoundingClientRect();
      setRect({ x: r.left - 6, y: r.top - 6, w: r.width + 12, h: r.height + 12 });
    };
    measure();
    const id = setTimeout(measure, 450);
    window.addEventListener("resize", measure);
    return () => { clearTimeout(id); window.removeEventListener("resize", measure); };
  }, [i, s]);
  useEffect(() => { markStep(`tour_${i}`, "profile"); }, [i]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") onDone(false); if (e.key === "ArrowRight") next(); if (e.key === "ArrowLeft") setI((x) => Math.max(0, x - 1)); };
    window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k);
  }); // eslint-disable-line react-hooks/exhaustive-deps
  const next = () => (i === STEPS.length - 1 ? onDone(true) : setI(i + 1));

  const vw = typeof window !== "undefined" ? window.innerWidth : 1200;
  const vh = typeof window !== "undefined" ? window.innerHeight : 800;
  const cardW = Math.min(340, vw - 24);
  let left = rect ? rect.x + rect.w + 16 : vw / 2 - cardW / 2;
  let top = rect ? rect.y : vh / 2 - 100;
  if (rect && left + cardW > vw - 12) { left = Math.max(12, Math.min(rect.x, vw - cardW - 12)); top = rect.y > vh / 2 ? rect.y - 210 : rect.y + rect.h + 14; }
  top = Math.max(12, Math.min(top, vh - 230));

  return (
    <>
      <div className="fixed inset-0 z-[94]" aria-hidden onClick={(e) => e.stopPropagation()} style={{ background: rect ? "transparent" : "rgba(0,0,0,.78)" }} />
      {rect && <div className="spotlight-hole" style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h }} />}
      <div className="fixed z-[96] glass rounded-2xl p-5 scale-in" key={i} style={{ left, top, width: cardW, transition: "left .5s var(--ease), top .5s var(--ease)", background: "rgba(14,14,19,.94)" }} role="dialog" aria-label="Tutorial">
        <div className="flex items-center justify-between mb-2"><span className="eyebrow">Tour · {i + 1}/{STEPS.length}</span>
          <div className="flex gap-1">{STEPS.map((_, k) => <i key={k} className="h-1 rounded-full transition-all" style={{ width: k === i ? 18 : 6, background: k <= i ? "#E50914" : "rgba(255,255,255,.2)" }} />)}</div></div>
        <h3 className="font-bold text-lg">{s.title}</h3>
        <p className="text-sm text-[var(--muted)] mt-1.5 leading-relaxed">{s.text}</p>
        <div className="flex items-center gap-2 mt-4">
          <button className="text-xs text-[var(--muted)] hover:text-white px-2 h-9" onClick={() => onDone(false)}>Pular</button>
          <span className="flex-1" />
          {i > 0 && <button className="btn btn-ghost btn-sm" onClick={() => setI(i - 1)}>Anterior</button>}
          <button className="btn btn-primary btn-sm" onClick={next}>{i === STEPS.length - 1 ? "Concluir" : "Próximo"}<Icon name="chevR" size={14} /></button>
        </div>
      </div>
    </>
  );
}
