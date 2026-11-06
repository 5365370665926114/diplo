"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { api, reportError } from "@/lib/client/api";
import { tr, type Lang } from "@/lib/client/i18n";

export type Profile = {
  id: string; name: string; avatarUrl: string | null; avatarGradient: string | null; hasPin: boolean; bio: string;
  favoriteGenres: number[]; favoriteTitles: { id: number; type: string; title: string; poster: string | null }[];
  privacy: string; showInRankings: boolean; settings: Record<string, unknown>; favoriteAvatarIds: string[]; avatarId: string | null;
};
export type Me = {
  user: { id: string; email: string; name: string; lang: Lang; maxProfiles: number; isAdmin: boolean };
  profile: Profile | null; flags: Record<string, boolean>; notice: string | null; siteName: string; onboarding: string[];
  notifications: { id: string; title: string; body: string; read: boolean; at: string }[];
};
type Toast = { id: number; msg: string; kind: "ok" | "err" | "info" };
type Ctx = {
  me: Me | null; refresh: () => Promise<void>; lang: Lang; t: (k: string) => string;
  toast: (msg: string, kind?: Toast["kind"]) => void;
  cmdOpen: boolean; setCmdOpen: (v: boolean) => void;
  tour: boolean; setTour: (v: boolean) => void;
  markStep: (step: string, scope?: "account" | "profile", reset?: boolean) => Promise<void>;
};
const C = createContext<Ctx>(null as never);
export const useApp = () => useContext(C);

export function AppProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [cmdOpen, setCmdOpen] = useState(false);
  const [tour, setTour] = useState(false);
  const [offline, setOffline] = useState(false);
  const n = useRef(0);

  const refresh = useCallback(async () => {
    try { setMe(await api<Me>("/api/me")); } catch { /* redirects handled in api() */ }
  }, []);
  useEffect(() => { refresh(); }, [refresh]);

  useEffect(() => {
    const on = () => setOffline(false), off = () => setOffline(true);
    setOffline(!navigator.onLine);
    window.addEventListener("online", on); window.addEventListener("offline", off);
    const err = (e: ErrorEvent) => reportError(e.message, e.error?.stack);
    window.addEventListener("error", err);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); window.removeEventListener("error", err); };
  }, []);

  const toast = useCallback((msg: string, kind: Toast["kind"] = "info") => {
    const id = ++n.current;
    setToasts((t) => [...t, { id, msg, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4200);
  }, []);

  const markStep = useCallback(async (step: string, scope: "account" | "profile" = "account", reset = false) => {
    await api("/api/misc/onboarding", { body: { step, scope, reset } }).catch(() => {});
    await refresh();
  }, [refresh]);

  const lang: Lang = me?.user.lang ?? "pt-BR";
  const value = useMemo<Ctx>(() => ({ me, refresh, lang, t: (k) => tr(lang, k), toast, cmdOpen, setCmdOpen, tour, setTour, markStep }), [me, refresh, lang, toast, cmdOpen, tour, markStep]);

  return (
    <C.Provider value={value}>
      {offline && <div className="fixed top-0 inset-x-0 z-[120] bg-amber-500 text-black text-center text-xs font-bold py-1.5 fade-in">Você está offline — mostrando apenas o que já foi carregado.</div>}
      {me ? children : (
        <div className="min-h-dvh grid place-items-center">
          <div className="logo-word text-xl" style={{ animation: "logoIn 1.2s var(--ease) both" }}>DIPLO<b>CINE</b></div>
        </div>
      )}
      <div className="fixed z-[130] left-1/2 -translate-x-1/2 bottom-[calc(96px+var(--safe-b))] lg:bottom-8 flex flex-col gap-2 items-center pointer-events-none">
        {toasts.map((t) => (
          <div key={t.id} className="scale-in glass rounded-2xl px-4 py-3 text-sm font-medium max-w-[92vw] flex items-center gap-2 pointer-events-auto" style={{ borderColor: t.kind === "err" ? "rgba(255,24,56,.6)" : t.kind === "ok" ? "rgba(52,211,153,.5)" : undefined }}>
            <span style={{ color: t.kind === "err" ? "#ff1838" : t.kind === "ok" ? "#34d399" : "#fff" }}>●</span>{t.msg}
          </div>
        ))}
      </div>
    </C.Provider>
  );
}
