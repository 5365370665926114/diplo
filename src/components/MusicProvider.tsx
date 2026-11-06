"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { api, fmtDur, useFetch } from "@/lib/client/api";
import { useApp } from "./AppProvider";
import { Icon } from "./Icon";
import { Img, Spinner } from "./ui";

export type Track = { videoId: string; title: string; artist: string; thumbnail: string | null; durationSec: number | null };
type Repeat = "off" | "all" | "one";
type Ctx = {
  queue: Track[]; index: number; current: Track | null; playing: boolean; time: number; duration: number; volume: number;
  shuffle: boolean; repeat: Repeat; liked: Set<string>; loading: boolean;
  play: (tracks: Track[], index?: number) => void; enqueue: (t: Track) => void; playNext: (t: Track) => void;
  toggle: () => void; next: () => void; prev: () => void; seek: (s: number) => void; setVolume: (v: number) => void;
  setShuffle: (b: boolean) => void; setRepeat: (r: Repeat) => void; toggleLike: (t: Track) => Promise<void>;
  setExpanded: (b: boolean) => void; close: () => void; reloadLikes: () => void;
};
const M = createContext<Ctx>(null as never);
export const useMusic = () => useContext(M);

let ytPromise: Promise<any> | null = null;
function loadYT(): Promise<any> {
  if (ytPromise) return ytPromise;
  ytPromise = new Promise((res) => {
    const w = window as any;
    if (w.YT?.Player) return res(w.YT);
    const prev = w.onYouTubeIframeAPIReady;
    w.onYouTubeIframeAPIReady = () => { prev?.(); res(w.YT); };
    const s = document.createElement("script"); s.src = "https://www.youtube.com/iframe_api"; s.async = true; document.head.appendChild(s);
  });
  return ytPromise;
}

export function MusicProvider({ children }: { children: ReactNode }) {
  const { toast, me } = useApp();
  const [queue, setQueue] = useState<Track[]>([]);
  const [index, setIndex] = useState(-1);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVol] = useState(80);
  const [shuffle, setShuffle] = useState(false);
  const [repeat, setRepeat] = useState<Repeat>("off");
  const [liked, setLiked] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const player = useRef<any>(null);
  const ready = useRef(false);
  const pending = useRef<string | null>(null);
  const st = useRef({ queue, index, shuffle, repeat });
  st.current = { queue, index, shuffle, repeat };
  const current = index >= 0 ? queue[index] ?? null : null;

  const reloadLikes = useCallback(() => {
    api<{ likes: { videoId: string }[] }>("/api/music/library").then((d) => setLiked(new Set(d.likes.map((l) => l.videoId)))).catch(() => {});
  }, []);
  useEffect(() => { if (me?.profile) reloadLikes(); }, [me?.profile?.id, reloadLikes]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadTrack = useCallback((t: Track) => {
    setTime(0); setDuration(t.durationSec || 0);
    api("/api/music/history", { body: t }).catch(() => {});
    if (ready.current && player.current) { player.current.loadVideoById(t.videoId); setLoading(true); }
    else pending.current = t.videoId;
  }, []);

  const goTo = useCallback((i: number) => { const q = st.current.queue; if (!q[i]) return; setIndex(i); loadTrack(q[i]); }, [loadTrack]);

  const next = useCallback((auto = false) => {
    const { queue: q, index: i, shuffle: sh, repeat: rp } = st.current;
    if (!q.length) return;
    if (auto && rp === "one") { player.current?.seekTo(0); player.current?.playVideo(); return; }
    if (sh && q.length > 1) { let r = i; while (r === i) r = Math.floor(Math.random() * q.length); return goTo(r); }
    if (i + 1 < q.length) return goTo(i + 1);
    if (rp === "all") return goTo(0);
    setPlaying(false);
  }, [goTo]);
  const nextRef = useRef(next); nextRef.current = next;

  useEffect(() => {
    let dead = false;
    loadYT().then((YT) => {
      if (dead || player.current) return;
      player.current = new YT.Player("dc-yt", {
        width: "100%", height: "100%",
        playerVars: { playsinline: 1, rel: 0, modestbranding: 1, origin: location.origin, controls: 1, fs: 1 },
        events: {
          onReady: () => { ready.current = true; player.current.setVolume(80); if (pending.current) { player.current.loadVideoById(pending.current); pending.current = null; } },
          onStateChange: (e: any) => {
            const S = YT.PlayerState;
            setPlaying(e.data === S.PLAYING || e.data === S.BUFFERING);
            setLoading(e.data === S.BUFFERING || e.data === S.UNSTARTED);
            if (e.data === S.PLAYING) { const d = player.current.getDuration(); if (d) setDuration(d); }
            if (e.data === S.ENDED) nextRef.current(true);
          },
          onError: (e: any) => {
            const msg = [101, 150].includes(e.data) ? "O dono do vídeo bloqueou a reprodução incorporada." : e.data === 100 ? "Vídeo indisponível ou removido." : "Não foi possível reproduzir esta faixa.";
            toast(`${msg} Pulando…`, "err"); setLoading(false); setTimeout(() => nextRef.current(false), 900);
          },
        },
      });
    });
    return () => { dead = true; };
  }, [toast]);

  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => { const p = player.current; if (p?.getCurrentTime) setTime(p.getCurrentTime()); }, 500);
    return () => clearInterval(id);
  }, [playing]);

  // Media Session metadata (lock-screen / hardware keys; playback itself stays in the visible YouTube player)
  useEffect(() => {
    if (!current || !("mediaSession" in navigator)) return;
    navigator.mediaSession.metadata = new MediaMetadata({ title: current.title, artist: current.artist, artwork: current.thumbnail ? [{ src: current.thumbnail }] : [] });
    navigator.mediaSession.setActionHandler("nexttrack", () => nextRef.current(false));
    navigator.mediaSession.setActionHandler("previoustrack", () => prev());
  }); // eslint-disable-line react-hooks/exhaustive-deps

  const play = useCallback((tracks: Track[], i = 0) => { if (!tracks.length) return; setQueue(tracks); st.current.queue = tracks; setIndex(i); loadTrack(tracks[i]); }, [loadTrack]);
  const enqueue = useCallback((t: Track) => { if (!st.current.queue.length) return play([t], 0); setQueue((q) => (q.some((x) => x.videoId === t.videoId) ? q : [...q, t])); toast("Adicionada à fila", "ok"); }, [play, toast]);
  const playNext = useCallback((t: Track) => { if (!st.current.queue.length) return play([t], 0); setQueue((q) => { const c = [...q.filter((x) => x.videoId !== t.videoId)]; c.splice(st.current.index + 1, 0, t); return c; }); toast("Tocará a seguir", "ok"); }, [play, toast]);
  const toggle = useCallback(() => { const p = player.current; if (!p) return; const s = p.getPlayerState(); s === 1 ? p.pauseVideo() : p.playVideo(); }, []);
  function prev() { const { index: i } = st.current; if (player.current?.getCurrentTime?.() > 4 || i <= 0) { player.current?.seekTo(0); return; } goTo(i - 1); }
  const seek = useCallback((s: number) => { player.current?.seekTo(s, true); setTime(s); }, []);
  const setVolume = useCallback((v: number) => { setVol(v); player.current?.setVolume(v); }, []);
  const toggleLike = useCallback(async (t: Track) => {
    const r = await api<{ liked: boolean }>("/api/music/like", { body: t }).catch(() => null);
    if (!r) return toast("Não foi possível curtir agora.", "err");
    setLiked((s) => { const n = new Set(s); r.liked ? n.add(t.videoId) : n.delete(t.videoId); return n; });
  }, [toast]);
  const close = useCallback(() => { player.current?.stopVideo(); setQueue([]); setIndex(-1); setPlaying(false); setExpanded(false); }, []);

  const value = useMemo<Ctx>(() => ({ queue, index, current, playing, time, duration, volume, shuffle, repeat, liked, loading, play, enqueue, playNext, toggle, next: () => next(false), prev, seek, setVolume, setShuffle, setRepeat, toggleLike, setExpanded, close, reloadLikes }),
    [queue, index, current, playing, time, duration, volume, shuffle, repeat, liked, loading, play, enqueue, playNext, toggle, next, seek, setVolume, toggleLike, close, reloadLikes]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <M.Provider value={value}>
      {children}
      <div id="dc-yt-wrap" className={`${current ? (expanded ? "exp" : "mini") : "off"}`}>
        <div className="yt-frame"><div id="dc-yt" /></div>
        {current && !expanded && <MiniBar onExpand={() => setExpanded(true)} />}
      </div>
      {current && expanded && <Expanded onClose={() => setExpanded(false)} />}
      <style>{`
        #dc-yt-wrap.off { position: fixed; left: -9999px; width: 200px; height: 200px; }
        #dc-yt-wrap.mini { position: fixed; z-index: 70; right: 12px; bottom: calc(86px + var(--safe-b)); width: min(300px, calc(100vw - 24px)); border-radius: 18px; overflow: hidden; background: #0b0b0f; border: 1px solid var(--line); box-shadow: 0 24px 60px -10px rgba(0,0,0,.8), 0 0 0 1px rgba(229,9,20,.2); animation: scaleIn .4s var(--ease) both; }
        #dc-yt-wrap.mini .yt-frame { aspect-ratio: 16/9; }
        #dc-yt-wrap.exp { position: fixed; z-index: 92; top: 72px; left: 50%; transform: translateX(-50%); width: min(92vw, 640px); border-radius: 18px; overflow: hidden; box-shadow: 0 30px 80px -10px rgba(229,9,20,.35); }
        #dc-yt-wrap.exp .yt-frame { aspect-ratio: 16/9; }
        #dc-yt-wrap iframe { width: 100%; height: 100%; display: block; }
        @media (min-width: 1024px) { #dc-yt-wrap.mini { bottom: 20px; right: 20px; } }
      `}</style>
    </M.Provider>
  );
}

function MiniBar({ onExpand }: { onExpand: () => void }) {
  const m = useMusic();
  const c = m.current!;
  return (
    <div className="p-2.5 flex items-center gap-2">
      <button onClick={onExpand} className="min-w-0 flex-1 text-left" aria-label="Abrir player">
        <div className="text-[13px] font-semibold truncate flex items-center gap-2">{m.playing && <span className="eq"><i /><i /><i /></span>}{c.title}</div>
        <div className="text-[11px] text-[var(--muted)] truncate">{c.artist}</div>
      </button>
      <button className="btn btn-ghost btn-icon btn-sm !w-9 !h-9" onClick={m.prev} aria-label="Anterior"><Icon name="prev" size={15} /></button>
      <button className="btn btn-light btn-icon !w-9 !h-9" onClick={m.toggle} aria-label={m.playing ? "Pausar" : "Tocar"}>{m.loading ? <Spinner size={16} /> : <Icon name={m.playing ? "pause" : "play"} size={15} fill />}</button>
      <button className="btn btn-ghost btn-icon !w-9 !h-9" onClick={m.next} aria-label="Próxima"><Icon name="next" size={15} /></button>
      <button className="btn btn-ghost btn-icon !w-9 !h-9" onClick={m.close} aria-label="Fechar"><Icon name="x" size={15} /></button>
    </div>
  );
}

function Expanded({ onClose }: { onClose: () => void }) {
  const m = useMusic();
  const c = m.current!;
  const [tab, setTab] = useState<"queue" | "lyrics">("lyrics");
  return (
    <div className="fixed inset-0 z-[91] overflow-y-auto fade-in" style={{ background: "linear-gradient(180deg,#14060a,#050505 60%)" }}>
      {c.thumbnail && <div className="absolute inset-0 opacity-25 blur-3xl scale-125 pointer-events-none" style={{ backgroundImage: `url(${c.thumbnail})`, backgroundSize: "cover" }} />}
      <div className="relative max-w-[640px] mx-auto px-4 pb-10">
        <div className="h-[72px] flex items-center justify-between">
          <button className="btn btn-ghost btn-icon" onClick={onClose} aria-label="Minimizar"><Icon name="chevD" /></button>
          <div className="eyebrow">Tocando agora</div>
          <button className="btn btn-ghost btn-icon" onClick={m.close} aria-label="Fechar"><Icon name="x" size={18} /></button>
        </div>
        <div style={{ aspectRatio: "16/9" }} />
        <div className="mt-5 flex items-start gap-3">
          <div className="min-w-0 flex-1"><h2 className="text-xl font-bold leading-tight">{c.title}</h2><p className="text-[var(--muted)] text-sm mt-0.5">{c.artist}</p></div>
          <button className={`btn btn-ghost btn-icon ${m.liked.has(c.videoId) ? "!text-[var(--red2)]" : ""}`} onClick={() => m.toggleLike(c)} aria-label="Curtir"><Icon name="heart" fill={m.liked.has(c.videoId)} /></button>
        </div>
        <div className="mt-4">
          <input type="range" min={0} max={Math.max(1, m.duration)} step={1} value={Math.min(m.time, m.duration || 1)} onChange={(e) => m.seek(+e.target.value)} className="w-full" aria-label="Progresso" style={{ background: `linear-gradient(90deg,#E50914 ${(m.time / Math.max(1, m.duration)) * 100}%,rgba(255,255,255,.18) 0)` }} />
          <div className="flex justify-between text-[11px] text-[var(--muted)] mt-1.5"><span>{fmtDur(m.time)}</span><span>{fmtDur(m.duration)}</span></div>
        </div>
        <div className="mt-3 flex items-center justify-center gap-3">
          <button className={`btn btn-icon btn-ghost ${m.shuffle ? "!text-[var(--red2)]" : ""}`} onClick={() => m.setShuffle(!m.shuffle)} aria-label="Aleatório"><Icon name="shuffle" size={18} /></button>
          <button className="btn btn-icon btn-ghost" onClick={m.prev} aria-label="Anterior"><Icon name="prev" size={18} /></button>
          <button className="btn btn-icon btn-primary !w-16 !h-16" onClick={m.toggle} aria-label="Tocar/Pausar">{m.loading ? <Spinner /> : <Icon name={m.playing ? "pause" : "play"} size={24} fill />}</button>
          <button className="btn btn-icon btn-ghost" onClick={m.next} aria-label="Próxima"><Icon name="next" size={18} /></button>
          <button className={`btn btn-icon btn-ghost ${m.repeat !== "off" ? "!text-[var(--red2)]" : ""} relative`} onClick={() => m.setRepeat(m.repeat === "off" ? "all" : m.repeat === "all" ? "one" : "off")} aria-label="Repetir"><Icon name="repeat" size={18} />{m.repeat === "one" && <span className="absolute text-[9px] font-black">1</span>}</button>
        </div>
        <div className="mt-3 flex items-center gap-3 justify-center"><Icon name="volume" size={16} className="text-[var(--muted)]" /><input type="range" min={0} max={100} value={m.volume} onChange={(e) => m.setVolume(+e.target.value)} className="w-40" aria-label="Volume" /></div>
        <div className="mt-6 flex gap-2 justify-center">
          <button className={`chip ${tab === "lyrics" ? "on" : ""}`} onClick={() => setTab("lyrics")}><Icon name="mic" size={13} />Letras</button>
          <button className={`chip ${tab === "queue" ? "on" : ""}`} onClick={() => setTab("queue")}><Icon name="list" size={13} />Fila ({m.queue.length})</button>
        </div>
        <div className="mt-4">{tab === "lyrics" ? <Lyrics track={c} time={m.time} /> : <QueueList />}</div>
      </div>
    </div>
  );
}

function QueueList() {
  const m = useMusic();
  return (
    <div className="panel p-2 max-h-[46vh] overflow-y-auto">
      {m.queue.map((t, i) => (
        <button key={t.videoId + i} onClick={() => m.play(m.queue, i)} className={`w-full flex items-center gap-3 p-2 rounded-xl text-left hover:bg-white/5 ${i === m.index ? "bg-red-600/15" : ""}`}>
          <Img src={t.thumbnail} alt="" className="w-12 h-12 rounded-lg object-cover" />
          <span className="min-w-0 flex-1"><span className="block text-sm font-semibold truncate">{t.title}</span><span className="block text-xs text-[var(--muted)] truncate">{t.artist}</span></span>
          {i === m.index ? <span className="eq"><i /><i /><i /></span> : <span className="text-xs text-[var(--muted)]">{fmtDur(t.durationSec)}</span>}
        </button>
      ))}
    </div>
  );
}

function Lyrics({ track, time }: { track: Track; time: number }) {
  const m = useMusic();
  const { data, loading, error } = useFetch<{ found: boolean; synced: { t: number; line: string }[]; plain: string; instrumental: boolean; source: string; match: string }>(`/api/music/lyrics?title=${encodeURIComponent(track.title)}&artist=${encodeURIComponent(track.artist)}&duration=${track.durationSec ?? 0}`, [track.videoId]);
  const [big, setBig] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const manual = useRef(0);
  const active = data?.synced.length ? Math.max(0, data.synced.findLastIndex((l) => l.t <= time + 0.25)) : -1;
  useEffect(() => {
    if (active < 0 || Date.now() - manual.current < 4000) return;
    const el = box.current?.querySelector<HTMLElement>(`[data-i="${active}"]`);
    if (el && box.current) box.current.scrollTo({ top: el.offsetTop - box.current.clientHeight / 2 + el.clientHeight / 2, behavior: "smooth" });
  }, [active]);
  if (loading) return <div className="panel p-8 grid place-items-center"><Spinner /></div>;
  if (error) return <div className="panel p-6 text-sm text-[var(--muted)]">{error.message}</div>;
  if (!data?.found || (!data.synced.length && !data.plain)) return <div className="panel p-6 text-sm text-[var(--muted)]">Letra não encontrada em fonte licenciada (LRCLIB) para esta faixa. Não exibimos letras de fontes não autorizadas.</div>;
  return (
    <div className="panel p-4">
      <div className="flex items-center justify-between mb-2 text-[11px] text-[var(--muted)]"><span>{data.synced.length ? "Sincronizada" : "Texto"} · {data.source}</span><button className="chip !py-0.5" onClick={() => setBig(!big)}><Icon name="expand" size={12} />{big ? "Reduzir" : "Ampliar"}</button></div>
      <div ref={box} onWheel={() => (manual.current = Date.now())} onTouchMove={() => (manual.current = Date.now())} className="overflow-y-auto no-scrollbar" style={{ maxHeight: big ? "62vh" : "34vh" }}>
        {data.synced.length ? data.synced.map((l, i) => (
          <button key={i} data-i={i} onClick={() => m.seek(l.t)} className={`lyric block text-left w-full py-1.5 font-bold ${i === active ? "on" : ""}`} style={{ fontSize: big ? "1.7rem" : "1.2rem", lineHeight: 1.25 }}>{l.line || "♪"}</button>
        )) : <pre className="whitespace-pre-wrap font-sans leading-relaxed" style={{ fontSize: big ? "1.3rem" : "1rem" }}>{data.plain}</pre>}
      </div>
    </div>
  );
}
