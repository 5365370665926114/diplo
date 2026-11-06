"use client";
import Link from "next/link";
import { useApp } from "@/components/AppProvider";
import { Icon } from "@/components/Icon";
import { Avatar, ErrorBox, Skeleton } from "@/components/ui";
import { useFetch } from "@/lib/client/api";
import { genreName } from "@/lib/genres";
import { useEffect, useState } from "react";

function Counter({ to, suffix = "" }: { to: number; suffix?: string }) {
  const [v, setV] = useState(0);
  useEffect(() => { let raf = 0; const t0 = performance.now(); const step = (t: number) => { const p = Math.min(1, (t - t0) / 900); setV(to * (1 - Math.pow(1 - p, 3))); if (p < 1) raf = requestAnimationFrame(step); }; raf = requestAnimationFrame(step); return () => cancelAnimationFrame(raf); }, [to]);
  return <>{Number.isInteger(to) ? Math.round(v) : v.toFixed(1)}{suffix}</>;
}

export default function Page() {
  const { me, lang } = useApp();
  const p = me!.profile!;
  const { data, error, reload } = useFetch<{ movies: number; series: number; episodes: number; favorites: number; playlists: number; likes: number; hours: { verified: number; unverified: number }; level: { name: string; level: number }; week: { day: string; sec: number }[]; achievements: { code: string; name: string; desc: string }[]; music: { genres: string[]; moods: string[]; artists: { name: string }[] } | null }>("/api/profile/stats");
  const max = Math.max(1, ...(data?.week.map((w) => w.sec) ?? [1]));
  return (
    <div className="px-4 sm:px-8 lg:px-10 pb-16 max-w-5xl">
      <div className="pt-10 sm:pt-14 flex flex-col sm:flex-row items-center sm:items-end gap-6 page-enter">
        <Avatar p={p} size={128} ring />
        <div className="text-center sm:text-left"><h1 className="text-4xl h-display">{p.name}</h1>{p.bio && <p className="text-[var(--muted)] mt-1.5 max-w-md">{p.bio}</p>}
          <div className="flex flex-wrap gap-2 mt-3 justify-center sm:justify-start">{data && <span className="chip on">Nível {data.level.level} · {data.level.name}</span>}{p.favoriteGenres.slice(0, 5).map((g) => <span key={g} className="chip">{genreName(g, lang)}</span>)}<span className="chip">{p.privacy === "public" ? "Perfil público" : "Perfil privado"}</span></div></div>
        <span className="flex-1" /><Link href="/settings" className="btn btn-ghost"><Icon name="edit" size={16} />Editar</Link>
      </div>
      {error ? <div className="mt-8"><ErrorBox message={error.message} onRetry={reload} /></div> : !data ? <Skeleton className="h-60 mt-8" /> : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-10 stagger">
            {([["Horas verificadas", data.hours.verified, "h", "clock"], ["Filmes concluídos", data.movies, "", "film"], ["Séries acompanhadas", data.series, "", "tv"], ["Episódios concluídos", data.episodes, "", "check"], ["Favoritos", data.favorites, "", "heart"], ["Playlists", data.playlists, "", "music"], ["Músicas curtidas", data.likes, "", "heart"], ["Horas não verificadas", data.hours.unverified, "h", "alert"]] as [string, number, string, string][]).map(([l, v, s, ic]) => (
              <div key={l} className="panel p-4"><Icon name={ic} size={18} className="text-[var(--red2)]" /><div className="text-3xl font-extrabold mt-2"><Counter to={v} suffix={s} /></div><div className="text-xs text-[var(--muted)] mt-0.5">{l}</div></div>))}
          </div>
          <section className="panel p-5 mt-6"><div className="eyebrow mb-4">Horas verificadas · últimos 7 dias</div>
            <div className="flex items-end gap-3 h-36">{data.week.map((w, i) => <div key={i} className="flex-1 flex flex-col items-center gap-2"><div className="w-full rounded-t-lg" style={{ height: `${Math.max(4, (w.sec / max) * 100)}%`, background: w.sec ? "linear-gradient(180deg,#FF1838,#7a050c)" : "rgba(255,255,255,.06)", transformOrigin: "bottom", animation: `fadeUp .7s ${i * 0.06}s var(--ease) both` }} title={`${(w.sec / 3600).toFixed(2)} h`} /><span className="text-[10px] text-[var(--muted)]">{w.day}</span></div>)}</div></section>
          {data.music && (data.music.genres.length > 0 || data.music.artists.length > 0) && <section className="panel p-5 mt-6"><div className="eyebrow mb-3">Preferências musicais</div><div className="flex flex-wrap gap-2">{data.music.artists.map((a) => <span key={a.name} className="chip on">{a.name}</span>)}{data.music.genres.map((g) => <span key={g} className="chip">{g}</span>)}</div></section>}
          <section className="mt-6"><div className="eyebrow mb-3">Conquistas</div>{data.achievements.length ? <div className="grid gap-3 sm:grid-cols-2 stagger">{data.achievements.map((a) => <div key={a.code} className="panel p-4 flex gap-3 items-center"><span className="w-11 h-11 rounded-xl grid place-items-center bg-gradient-to-br from-[#E50914] to-[#7a050c]"><Icon name="crown" size={20} /></span><div><div className="font-semibold text-sm">{a.name}</div><div className="text-xs text-[var(--muted)]">{a.desc}</div></div></div>)}</div> : <p className="text-sm text-[var(--muted)]">Assista, favorite e crie playlists para desbloquear conquistas.</p>}</section>
          <p className="text-[11px] text-[var(--muted)] mt-8">Somente números reais do seu perfil. Horas “verificadas” exigem telemetria do player validada pelo servidor.</p>
        </>
      )}
    </div>
  );
}
