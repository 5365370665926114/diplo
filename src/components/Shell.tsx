"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { api, img, useFetch } from "@/lib/client/api";
import { useApp } from "./AppProvider";
import { Icon } from "./Icon";
import { MusicProvider } from "./MusicProvider";
import { Avatar, Img, Modal, Spinner, type CardT } from "./ui";
import { Tutorial } from "./Tutorial";

type NavItem = { key: string; href: string; icon: string; admin?: boolean };
const GROUPS: { label: string; items: NavItem[] }[] = [
  { label: "Descobrir", items: [
    { key: "home", href: "/", icon: "home" }, { key: "movies", href: "/c/movies", icon: "film" }, { key: "series", href: "/c/series", icon: "tv" },
    { key: "animes", href: "/c/animes", icon: "anime" }, { key: "doramas", href: "/c/doramas", icon: "flower" }, { key: "explore", href: "/explore", icon: "compass" } ] },
  { label: "Inteligente", items: [{ key: "ai", href: "/ai", icon: "ai" }, { key: "music", href: "/music", icon: "music" }] },
  { label: "Você", items: [
    { key: "library", href: "/library", icon: "library" }, { key: "rankings", href: "/rankings", icon: "trophy" }, { key: "donate", href: "/donate", icon: "gift" }, { key: "settings", href: "/settings", icon: "settings" } ] },
];
const active = (path: string, href: string) => (href === "/" ? path === "/" : path === href || path.startsWith(href + "/"));

export function Shell({ children }: { children: ReactNode }) {
  const { me, t, cmdOpen, setCmdOpen, tour, setTour, markStep } = useApp();
  const path = usePathname();
  const router = useRouter();
  const [more, setMore] = useState(false);
  const [menu, setMenu] = useState(false);
  const [bell, setBell] = useState(false);
  const [progress, setProgress] = useState(0);
  const isAdmin = me?.user.isAdmin;

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setCmdOpen(true); }
      if (e.key === "/" && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) { e.preventDefault(); setCmdOpen(true); }
    };
    window.addEventListener("keydown", k);
    const sc = () => { const h = document.documentElement; setProgress(h.scrollHeight - h.clientHeight > 600 ? h.scrollTop / (h.scrollHeight - h.clientHeight) : 0); };
    window.addEventListener("scroll", sc, { passive: true });
    return () => { window.removeEventListener("keydown", k); window.removeEventListener("scroll", sc); };
  }, [setCmdOpen]);
  useEffect(() => { setMore(false); setMenu(false); setBell(false); }, [path]);

  // first-run tour (saved per profile in the database)
  useEffect(() => {
    if (me?.profile && path === "/" && !me.onboarding.includes("profile:tutorial") && !tour) {
      const id = setTimeout(() => setTour(true), 1400);
      return () => clearTimeout(id);
    }
  }, [me?.profile?.id, me?.onboarding.length, path]); // eslint-disable-line react-hooks/exhaustive-deps

  const logout = async () => { await api("/api/auth/logout", { method: "POST", body: {} }).catch(() => {}); location.href = "/welcome"; };
  const unread = me?.notifications.filter((n) => !n.read).length ?? 0;
  const maintenance = me?.flags.maintenance && isAdmin;

  return (
    <MusicProvider>
      <div className="fixed top-0 left-0 right-0 h-[2px] z-[100] pointer-events-none"><div className="h-full bg-gradient-to-r from-[var(--red)] to-[var(--red2)] origin-left" style={{ transform: `scaleX(${progress})`, boxShadow: "0 0 10px var(--red2)" }} /></div>

      {/* Desktop sidebar */}
      <aside data-tour="nav" className="sidebar hidden lg:flex fixed left-0 top-0 bottom-0 z-50 flex-col py-5 px-3 glass !border-y-0 !border-l-0 overflow-hidden" style={{ width: 76, transition: "width .4s var(--ease)" }}
        onMouseEnter={(e) => (e.currentTarget.style.width = "232px")} onMouseLeave={(e) => (e.currentTarget.style.width = "76px")}>
        <Link href="/" className="flex items-center gap-3 h-12 px-2 mb-3" aria-label="DiploCine">
          <span className="w-10 h-10 rounded-xl bg-[var(--red)] grid place-items-center flex-none font-black text-lg" style={{ boxShadow: "0 8px 24px -6px rgba(229,9,20,.8)" }}>D</span>
          <span className="nav-label logo-word !text-sm">Diplo<b>Cine</b></span>
        </Link>
        <nav className="flex-1 overflow-y-auto no-scrollbar -mx-1 px-1" aria-label="Principal">
          {GROUPS.map((g) => (
            <div key={g.label} className="mb-3">
              <div className="nav-label eyebrow !text-[9px] px-3 mb-1.5 !before:hidden">{g.label}</div>
              {g.items.map((it) => (
                <Link key={it.key} href={it.href} data-tour={`d-${it.key}`} aria-label={t(it.key)} aria-current={active(path, it.href) ? "page" : undefined} className={`nav-item ${active(path, it.href) ? "active" : ""}`}>
                  <Icon name={it.icon} /><span className="nav-label">{t(it.key)}</span>
                </Link>
              ))}
            </div>
          ))}
          {isAdmin && <Link href="/admin" className={`nav-item ${path.startsWith("/admin") ? "active" : ""}`} aria-label="Admin"><Icon name="shield" /><span className="nav-label">{t("admin")}</span></Link>}
        </nav>
        <div className="relative">
          <button onClick={() => setMenu(!menu)} className="nav-item w-full !px-1.5" aria-label="Perfil"><Avatar p={me!.profile} size={34} ring /><span className="nav-label text-left min-w-0"><span className="block text-white truncate max-w-[140px]">{me!.profile?.name}</span></span></button>
          {menu && <ProfileMenu onLogout={logout} onClose={() => setMenu(false)} className="absolute bottom-14 left-0 w-56" />}
        </div>
      </aside>

      {/* Mobile header */}
      <header className="lg:hidden sticky top-0 z-40 glass !border-x-0 !border-t-0 flex items-center justify-between px-4 h-14" style={{ paddingTop: "env(safe-area-inset-top)" }}>
        <Link href="/" className="logo-word text-[13px]">Diplo<b>Cine</b></Link>
        <div className="flex items-center gap-1">
          <button className="btn btn-icon btn-sm !w-10 !h-10 relative" onClick={() => setBell(!bell)} aria-label="Notificações"><Icon name="bell" size={20} />{unread > 0 && <span className="absolute top-1.5 right-2 w-2 h-2 rounded-full bg-[var(--red2)]" />}</button>
          <button data-tour="m-more" className="btn btn-icon btn-sm !w-10 !h-10" onClick={() => setMore(true)} aria-label={t("more")}><Icon name="grid" size={20} /></button>
        </div>
      </header>

      <div className="main-pad relative z-[1]">
        {/* Desktop topbar */}
        <div className="hidden lg:flex fixed top-4 right-6 z-40 items-center gap-2">
          <button onClick={() => setCmdOpen(true)} className="glass rounded-full h-11 pl-4 pr-3 flex items-center gap-3 text-sm text-[var(--muted)] hover:text-white transition w-72" aria-label={t("search")}>
            <Icon name="search" size={17} /><span className="flex-1 text-left">{t("search_ph")}</span><kbd className="text-[10px] border border-white/15 rounded px-1.5 py-0.5">Ctrl K</kbd>
          </button>
          <button className="glass rounded-full w-11 h-11 grid place-items-center relative" onClick={() => setBell(!bell)} aria-label="Notificações"><Icon name="bell" size={18} />{unread > 0 && <span className="absolute top-2.5 right-3 w-2 h-2 rounded-full bg-[var(--red2)]" />}</button>
        </div>
        {bell && <Notifications onClose={() => setBell(false)} />}
        {me?.notice && <div className="relative z-30 bg-gradient-to-r from-red-700/80 to-red-900/40 text-sm text-center py-2 px-4 font-medium">{me.notice}</div>}
        {maintenance && <div className="bg-amber-500 text-black text-xs font-bold text-center py-1">Modo de manutenção ativo — somente administradores acessam.</div>}
        <main key={path} className="page-enter min-h-dvh">{children}</main>
      </div>

      {/* Mobile bottom nav */}
      <nav data-tour="m-nav" className="bottom-nav lg:hidden fixed bottom-0 inset-x-0 z-50 glass !border-x-0 !border-b-0 flex" aria-label="Principal">
        {[{ key: "home", href: "/", icon: "home" }, { key: "explore", href: "/explore", icon: "compass" }].map((it) => (
          <Link key={it.key} href={it.href} data-tour={`m-${it.key}`} className={`bn-item ${active(path, it.href) ? "active" : ""}`}><Icon name={it.icon} size={22} />{t(it.key)}</Link>
        ))}
        <button onClick={() => setCmdOpen(true)} className="bn-item" data-tour="m-search"><Icon name="search" size={22} />{t("search")}</button>
        <Link href="/music" data-tour="m-music" className={`bn-item ${active(path, "/music") ? "active" : ""}`}><Icon name="music" size={22} />{t("music")}</Link>
        <Link href="/profile" data-tour="m-profile" className={`bn-item ${active(path, "/profile") ? "active" : ""}`}><Icon name="user" size={22} />{t("profile")}</Link>
      </nav>

      {more && (
        <Modal onClose={() => setMore(false)}>
          <h3 className="font-bold text-lg mb-4">Menu</h3>
          <div className="grid grid-cols-3 gap-2.5 stagger">
            {[...GROUPS.flatMap((g) => g.items), ...(isAdmin ? [{ key: "admin", href: "/admin", icon: "shield" }] : [])].map((it) => (
              <Link key={it.key} href={it.href} className={`panel p-3 flex flex-col items-center gap-2 text-xs font-semibold ${active(path, it.href) ? "!border-red-600" : ""}`}><Icon name={it.icon} className={active(path, it.href) ? "text-[var(--red2)]" : ""} />{t(it.key)}</Link>
            ))}
          </div>
          <div className="flex gap-2 mt-4"><Link href="/profiles" className="btn btn-ghost flex-1"><Icon name="users" size={16} />{t("switchProfile")}</Link><button onClick={logout} className="btn btn-ghost flex-1"><Icon name="logout" size={16} />{t("logout")}</button></div>
        </Modal>
      )}
      {cmdOpen && <Command onClose={() => setCmdOpen(false)} navigate={(h) => { setCmdOpen(false); router.push(h); }} isAdmin={!!isAdmin} />}
      {tour && <Tutorial onDone={async (completed) => { setTour(false); await markStep("tutorial", "profile"); if (!completed) router.refresh(); }} />}
    </MusicProvider>
  );
}

function ProfileMenu({ onLogout, onClose, className = "" }: { onLogout: () => void; onClose: () => void; className?: string }) {
  const { t } = useApp();
  return (
    <>
      <div className="fixed inset-0 z-[60]" onClick={onClose} />
      <div className={`${className} z-[61] glass rounded-2xl p-1.5 scale-in`}>
        {[{ h: "/profile", i: "user", l: t("profile") }, { h: "/profiles", i: "users", l: t("switchProfile") }, { h: "/settings", i: "settings", l: t("settings") }].map((x) => (
          <Link key={x.h} href={x.h} className="flex items-center gap-3 px-3 h-10 rounded-xl text-sm font-medium hover:bg-white/10"><Icon name={x.i} size={17} />{x.l}</Link>
        ))}
        <button onClick={onLogout} className="flex w-full items-center gap-3 px-3 h-10 rounded-xl text-sm font-medium hover:bg-white/10 text-[var(--red2)]"><Icon name="logout" size={17} />{t("logout")}</button>
      </div>
    </>
  );
}

function Notifications({ onClose }: { onClose: () => void }) {
  const { me, refresh } = useApp();
  useEffect(() => { if (me?.notifications.some((n) => !n.read)) api("/api/misc/notifications-read", { body: {} }).then(refresh).catch(() => {}); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <>
      <div className="fixed inset-0 z-[60]" onClick={onClose} />
      <div className="fixed z-[61] right-3 lg:right-6 top-16 lg:top-[68px] w-[min(92vw,360px)] glass rounded-2xl p-3 scale-in max-h-[60vh] overflow-y-auto">
        <div className="eyebrow mb-2">Notificações</div>
        {me?.notifications.length ? me.notifications.map((n) => (
          <div key={n.id} className="p-3 rounded-xl hover:bg-white/5"><div className="text-sm font-semibold">{n.title}</div><div className="text-xs text-[var(--muted)] mt-0.5">{n.body}</div></div>
        )) : <div className="text-sm text-[var(--muted)] p-3">Nada por aqui ainda.</div>}
      </div>
    </>
  );
}

function Command({ onClose, navigate, isAdmin }: { onClose: () => void; navigate: (h: string) => void; isAdmin: boolean }) {
  const { t } = useApp();
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const [results, setResults] = useState<CardT[]>([]);
  const [busy, setBusy] = useState(false);
  const hist = useFetch<{ items: string[] }>("/api/misc/search-history");
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { ref.current?.focus(); }, []);
  const navs = [...GROUPS.flatMap((g) => g.items), ...(isAdmin ? [{ key: "admin", href: "/admin", icon: "shield" }] : []), { key: "profile", href: "/profile", icon: "user" }];
  const nq = q.trim().toLowerCase();
  const navMatch = navs.filter((n) => !nq || t(n.key).toLowerCase().includes(nq)).slice(0, nq ? 4 : 12);
  useEffect(() => {
    if (nq.length < 2) { setResults([]); return; }
    setBusy(true);
    const id = setTimeout(() => api<{ items: CardT[] }>(`/api/discover?q=${encodeURIComponent(q.trim())}&save=1`).then((d) => setResults(d.items.slice(0, 6))).catch(() => setResults([])).finally(() => setBusy(false)), 280);
    return () => clearTimeout(id);
  }, [q]); // eslint-disable-line react-hooks/exhaustive-deps
  const actions: { label: string; sub?: string; icon: string; href: string; thumb?: string | null }[] = [
    ...navMatch.map((n) => ({ label: t(n.key), icon: n.icon, href: n.href, sub: "Ir para" })),
    ...results.map((r) => ({ label: r.title, icon: "film", href: `/title/${r.type}/${r.id}`, sub: `${r.type === "tv" ? "Série" : "Filme"} · ${r.year}`, thumb: img(r.poster, "w92") })),
    ...(nq.length >= 3 ? [{ label: `Perguntar à IA: “${q.trim()}”`, icon: "ai", href: `/ai?q=${encodeURIComponent(q.trim())}`, sub: "AI Search" }, { label: `Buscar música: “${q.trim()}”`, icon: "music", href: `/music?q=${encodeURIComponent(q.trim())}`, sub: "DiploMusic" }] : []),
    ...(!nq && hist.data ? hist.data.items.slice(0, 5).map((h) => ({ label: h, icon: "clock", href: `/explore?q=${encodeURIComponent(h)}`, sub: "Recente" })) : []),
  ];
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setSel((s) => Math.min(s + 1, actions.length - 1)); }
    if (e.key === "ArrowUp") { e.preventDefault(); setSel((s) => Math.max(s - 1, 0)); }
    if (e.key === "Enter") { e.preventDefault(); if (actions[sel]) navigate(actions[sel].href); else if (nq) navigate(`/explore?q=${encodeURIComponent(q.trim())}`); }
  };
  return (
    <div className="modal-back !place-items-start !pt-[10vh]" onMouseDown={(e) => e.target === e.currentTarget && onClose()} role="dialog" aria-label="Command palette">
      <div className="modal panel !bg-[#0e0e13] overflow-hidden !max-w-[600px]" onKeyDown={onKey}>
        <div className="flex items-center gap-3 px-4 h-14 border-b border-white/10">
          <Icon name="search" size={18} className="text-[var(--muted)]" />
          <input ref={ref} value={q} onChange={(e) => { setQ(e.target.value); setSel(0); }} placeholder={t("search_ph")} className="flex-1 bg-transparent outline-none text-base" aria-label="Buscar" />
          {busy ? <Spinner size={16} /> : <kbd className="text-[10px] border border-white/15 rounded px-1.5 py-0.5 text-[var(--muted)]">ESC</kbd>}
        </div>
        <div className="max-h-[56vh] overflow-y-auto p-2">
          {actions.map((a, i) => (
            <button key={a.href + a.label + i} onMouseEnter={() => setSel(i)} onClick={() => navigate(a.href)} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left ${i === sel ? "bg-red-600/20" : ""}`}>
              {a.thumb ? <Img src={a.thumb} alt="" className="w-8 h-11 rounded-md object-cover" /> : <span className="w-8 h-8 rounded-lg bg-white/8 grid place-items-center"><Icon name={a.icon} size={16} /></span>}
              <span className="min-w-0 flex-1"><span className="block text-sm font-semibold truncate">{a.label}</span>{a.sub && <span className="block text-[11px] text-[var(--muted)]">{a.sub}</span>}</span>
              {i === sel && <Icon name="chevR" size={14} className="text-[var(--muted)]" />}
            </button>
          ))}
          {!actions.length && <div className="p-6 text-center text-sm text-[var(--muted)]">Nenhum resultado. Pressione Enter para buscar no catálogo.</div>}
        </div>
      </div>
    </div>
  );
}

export const useStableCallback = useCallback;
