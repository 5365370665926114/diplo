"use client";
import Link from "next/link";
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { img } from "@/lib/client/api";
import { Icon } from "./Icon";

export type CardT = { id: number; type: "movie" | "tv"; title: string; poster: string | null; backdrop: string | null; overview: string; rating: number; year: string; genres: number[]; progress?: number; season?: number; episode?: number };

/** Progressive image: fades in when loaded, skeleton underneath. */
export function Img({ src, alt, className = "", style }: { src: string | null; alt: string; className?: string; style?: CSSProperties }) {
  const [ok, setOk] = useState(false);
  const ref = useRef<HTMLImageElement>(null);
  useEffect(() => { if (ref.current?.complete && ref.current.naturalWidth) setOk(true); }, [src]);
  if (!src) return <div className={`grid place-items-center bg-[#16161c] text-[#444] ${className}`} style={style}><Icon name="film" size={28} /></div>;
  // eslint-disable-next-line @next/next/no-img-element
  return <img ref={ref} src={src} alt={alt} loading="lazy" decoding="async" onLoad={() => setOk(true)} onError={() => setOk(true)} className={`img-fade ${ok ? "loaded" : ""} ${className}`} style={style} />;
}

export function Skeleton({ className = "", style }: { className?: string; style?: CSSProperties }) {
  return <div className={`skeleton ${className}`} style={style} />;
}
export function RailSkeleton({ wide = true, n = 6 }: { wide?: boolean; n?: number }) {
  return (
    <div className="flex gap-3.5 overflow-hidden py-4">
      {Array.from({ length: n }).map((_, i) => <Skeleton key={i} className="flex-none" style={{ width: wide ? 300 : 170, aspectRatio: wide ? "16/9" : "2/3" }} />)}
    </div>
  );
}

export function useReveal<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    if (typeof IntersectionObserver === "undefined") { el.classList.add("in"); return; }
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { el.classList.add("in"); io.disconnect(); } }, { rootMargin: "0px 0px -8% 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return ref;
}
export function Reveal({ children, className = "" }: { children: ReactNode; className?: string }) {
  const ref = useReveal<HTMLDivElement>();
  return <div ref={ref} className={`reveal ${className}`}>{children}</div>;
}

/** Horizontal carousel: drag with mouse, touch/trackpad native, arrows, keyboard focusable. */
export function Rail({ children, className = "" }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const st = useRef({ down: false, x: 0, left: 0, moved: false });
  const [edge, setEdge] = useState({ l: false, r: true });
  const upd = () => { const el = ref.current; if (el) setEdge({ l: el.scrollLeft > 8, r: el.scrollLeft + el.clientWidth < el.scrollWidth - 8 }); };
  useEffect(() => { upd(); }, [children]);
  const go = (d: number) => ref.current?.scrollBy({ left: d * (ref.current.clientWidth * 0.85), behavior: "smooth" });
  return (
    <div className="relative group/rail">
      <div
        ref={ref} tabIndex={0} role="group"
        className={`rail no-scrollbar ${className}`}
        onScroll={upd}
        onKeyDown={(e) => { if (e.key === "ArrowRight") go(1); if (e.key === "ArrowLeft") go(-1); }}
        onPointerDown={(e) => { if (e.pointerType !== "mouse") return; const el = ref.current!; st.current = { down: true, x: e.clientX, left: el.scrollLeft, moved: false }; }}
        onPointerMove={(e) => { const s = st.current; if (!s.down) return; const dx = e.clientX - s.x; if (Math.abs(dx) > 6) { s.moved = true; ref.current!.classList.add("drag"); } if (s.moved) ref.current!.scrollLeft = s.left - dx; }}
        onPointerUp={() => { st.current.down = false; ref.current?.classList.remove("drag"); }}
        onPointerLeave={() => { st.current.down = false; ref.current?.classList.remove("drag"); }}
        onClickCapture={(e) => { if (st.current.moved) { e.preventDefault(); e.stopPropagation(); st.current.moved = false; } }}
        onDragStart={(e) => e.preventDefault()}
      >{children}</div>
      {edge.l && <button aria-label="Anterior" onClick={() => go(-1)} className="hidden lg:grid absolute left-1 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full glass place-items-center opacity-0 group-hover/rail:opacity-100 transition hover:bg-red-600 z-10"><Icon name="chevL" size={18} /></button>}
      {edge.r && <button aria-label="Próximo" onClick={() => go(1)} className="hidden lg:grid absolute right-1 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full glass place-items-center opacity-0 group-hover/rail:opacity-100 transition hover:bg-red-600 z-10"><Icon name="chevR" size={18} /></button>}
    </div>
  );
}

export function Section({ title, eyebrow, action, children }: { title: string; eyebrow?: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="mt-8 sm:mt-10">
      <div className="flex items-end justify-between gap-3 px-1">
        <div>{eyebrow && <div className="eyebrow mb-1.5">{eyebrow}</div>}<h2 className="text-xl sm:text-2xl font-bold tracking-tight">{title}</h2></div>
        {action}
      </div>
      {children}
    </section>
  );
}

const typeLabel = (t: string) => (t === "tv" ? "SÉRIE" : "FILME");

export function TitleCard({ item, variant = "wide", rank }: { item: CardT; variant?: "wide" | "poster" | "top10"; rank?: number }) {
  const href = item.season ? `/watch/${item.type}/${item.id}?season=${item.season}&episode=${item.episode}` : `/title/${item.type}/${item.id}`;
  if (variant === "top10")
    return (
      <Link href={href} className="flex items-end flex-none group/t10" style={{ width: 290 }}>
        <span className="outline-num text-[9rem] -mr-5 select-none" style={{ fontSize: "9.5rem", marginBottom: -14 }}>{rank}</span>
        <span className="card flex-1" style={{ aspectRatio: "2/3" }}><Img src={img(item.poster || item.backdrop, "w342")} alt={item.title} className="w-full h-full object-cover" /></span>
      </Link>
    );
  if (variant === "poster")
    return (
      <Link href={href} className="flex-none" style={{ width: 168 }}>
        <div className="card" style={{ aspectRatio: "2/3" }}><Img src={img(item.poster || item.backdrop, "w342")} alt={item.title} className="w-full h-full object-cover" />
          {item.rating > 0 && <span className="absolute top-2 right-2 chip glass !py-0.5"><Icon name="star" size={11} fill style={{ color: "#facc15" }} />{item.rating}</span>}
        </div>
        <div className="mt-2 px-0.5 text-sm font-semibold truncate">{item.title}</div>
        <div className="px-0.5 text-xs text-[var(--muted)]">{item.year}</div>
      </Link>
    );
  return (
    <Link href={href} className="flex-none" style={{ width: "min(72vw, 330px)" }}>
      <div className="card" style={{ aspectRatio: "16/9" }}>
        <Img src={img(item.backdrop || item.poster, "w500")} alt={item.title} className="w-full h-full object-cover" />
        {typeof item.progress === "number" && <div className="absolute bottom-0 inset-x-0 h-1 bg-white/20"><div className="h-full bg-[var(--red)]" style={{ width: `${Math.round(item.progress * 100)}%` }} /></div>}
      </div>
      <div className="mt-2 px-0.5 text-sm font-semibold truncate">{item.title}</div>
      <div className="px-0.5 mt-1 flex items-center gap-2 text-xs text-[var(--muted)]">
        <span className="chip !py-0 !px-2 !text-[10px]">{typeLabel(item.type)}</span><span>{item.year}</span>
        {item.rating > 0 && <span className="ml-auto flex items-center gap-1"><Icon name="star" size={11} fill style={{ color: "#facc15" }} />{item.rating}</span>}
      </div>
    </Link>
  );
}

export function Modal({ children, onClose, sheet = true, wide = false }: { children: ReactNode; onClose: () => void; sheet?: boolean; wide?: boolean }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    const prev = document.body.style.overflow; document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", k); document.body.style.overflow = prev; };
  }, [onClose]);
  return (
    <div className={`modal-back ${sheet ? "sheet" : ""}`} onMouseDown={(e) => e.target === e.currentTarget && onClose()} role="dialog" aria-modal="true">
      <div className="modal panel !bg-[#101015] p-5 sm:p-6 relative" style={wide ? { maxWidth: 860 } : undefined}>
        <button onClick={onClose} aria-label="Fechar" className="absolute right-4 top-4 w-9 h-9 rounded-full bg-white/10 grid place-items-center hover:bg-white/20 z-10"><Icon name="x" size={16} /></button>
        {children}
      </div>
    </div>
  );
}

export function Avatar({ p, size = 40, ring = false }: { p: { name: string; avatarUrl?: string | null; avatarGradient?: string | null } | null; size?: number; ring?: boolean }) {
  const initials = (p?.name || "?").split(/\s+/).map((x) => x[0]).slice(0, 2).join("").toUpperCase();
  return (
    <span className="rounded-full overflow-hidden grid place-items-center flex-none font-bold select-none" style={{ width: size, height: size, background: p?.avatarGradient || "linear-gradient(135deg,#E50914,#4a0207)", fontSize: size * 0.38, boxShadow: ring ? "0 0 0 2px #E50914, 0 0 24px rgba(229,9,20,.55)" : undefined }}>
      {p?.avatarUrl ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={p.avatarUrl} alt="" className="w-full h-full object-cover" /> : initials}
    </span>
  );
}

export function Spinner({ size = 22 }: { size?: number }) {
  return <span className="inline-block rounded-full border-2 border-white/20 border-t-[var(--red2)]" style={{ width: size, height: size, animation: "spin .8s linear infinite" }} />;
}

export function Empty({ icon = "film", title, text, action }: { icon?: string; title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="panel p-10 text-center fade-in">
      <div className="mx-auto w-14 h-14 rounded-2xl bg-red-600/15 text-[var(--red2)] grid place-items-center mb-4"><Icon name={icon} size={26} /></div>
      <div className="font-bold text-lg">{title}</div>
      {text && <p className="text-sm text-[var(--muted)] mt-1.5 max-w-md mx-auto">{text}</p>}
      {action && <div className="mt-5 flex justify-center">{action}</div>}
    </div>
  );
}

export function ErrorBox({ message, onRetry, admin }: { message: string; onRetry?: () => void; admin?: boolean }) {
  return (
    <div className="panel p-6 flex items-start gap-4 fade-in" style={{ borderColor: "rgba(255,24,56,.35)" }}>
      <Icon name="alert" className="text-[var(--red2)] flex-none mt-0.5" />
      <div className="flex-1 min-w-0">
        <div className="font-semibold">{message}</div>
        <div className="flex gap-2 mt-3">
          {onRetry && <button className="btn btn-ghost btn-sm" onClick={onRetry}><Icon name="refresh" size={14} />Tentar novamente</button>}
          {admin && <Link href="/admin?tab=settings" className="btn btn-primary btn-sm">Configurar</Link>}
        </div>
      </div>
    </div>
  );
}

export function PageTitle({ title, sub, icon }: { title: string; sub?: string; icon?: string }) {
  return (
    <header className="pt-8 sm:pt-12 pb-2 page-enter">
      <div className="flex items-center gap-3">
        {icon && <span className="w-11 h-11 rounded-2xl bg-red-600/15 text-[var(--red2)] grid place-items-center"><Icon name={icon} /></span>}
        <div><h1 className="text-3xl sm:text-4xl h-display">{title}</h1>{sub && <p className="text-[var(--muted)] text-sm mt-1">{sub}</p>}</div>
      </div>
    </header>
  );
}
