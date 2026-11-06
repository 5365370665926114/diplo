"use client";
import { useCallback, useEffect, useRef, useState } from "react";

export class ApiErr extends Error {
  constructor(public status: number, message: string, public code?: string) {
    super(message);
  }
}

export async function api<T = any>(path: string, opts: { method?: string; body?: unknown } = {}): Promise<T> { // eslint-disable-line @typescript-eslint/no-explicit-any
  let r: Response;
  try {
    r = await fetch(path, { method: opts.method ?? (opts.body ? "POST" : "GET"), headers: opts.body ? { "content-type": "application/json" } : undefined, body: opts.body ? JSON.stringify(opts.body) : undefined, credentials: "same-origin" });
  } catch {
    throw new ApiErr(0, "Sem conexão. Verifique sua internet e tente novamente.", "offline");
  }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    if (typeof window !== "undefined") {
      if (j.code === "unauthenticated" && !location.pathname.startsWith("/welcome")) location.href = "/welcome";
      if (j.code === "no_profile" && location.pathname !== "/profiles") location.href = "/profiles";
    }
    throw new ApiErr(r.status, j.error || "Algo deu errado.", j.code);
  }
  return j as T;
}

export function useFetch<T = any>(path: string | null, deps: unknown[] = []) { // eslint-disable-line @typescript-eslint/no-explicit-any
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<ApiErr | null>(null);
  const [loading, setLoading] = useState(!!path);
  const n = useRef(0);
  const load = useCallback(async () => {
    if (!path) return;
    const id = ++n.current;
    setLoading(true);
    try {
      const d = await api<T>(path);
      if (id === n.current) { setData(d); setError(null); }
    } catch (e) {
      if (id === n.current) setError(e as ApiErr);
    } finally {
      if (id === n.current) setLoading(false);
    }
  }, [path]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setData(null); load(); }, [load, ...deps]); // eslint-disable-line react-hooks/exhaustive-deps
  return { data, error, loading, reload: load, setData };
}

export const img = (p: string | null | undefined, size = "w500") => (p ? `https://image.tmdb.org/t/p/${size}${p}` : null);

export function fmtDur(sec?: number | null) {
  if (!sec || sec < 0) return "";
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = Math.floor(sec % 60);
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
}
export const brl = (cents: number) => (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function reportError(message: string, stack?: string) {
  fetch("/api/misc/client-error", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ message, stack, url: location.pathname }) }).catch(() => {});
}
