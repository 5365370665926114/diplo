"use client";
import { useEffect, useState } from "react";
import { Icon } from "@/components/Icon";
import { Avatar, Empty, ErrorBox, PageTitle, Skeleton } from "@/components/ui";
import { brl, useFetch } from "@/lib/client/api";

type Row = { rank: number; name: string; avatarUrl: string | null; gradient: string | null; hours?: number; level?: string; cents?: number; count?: number; me: boolean };
type R = { enabled: boolean; rows: Row[]; levels: { level: number; name: string; hours: number }[]; achievements: Record<string, { name: string; desc: string }>; mine: { code: string }[] };

export default function Page() {
  const [type, setType] = useState<"hours" | "donations">("hours");
  const [period, setPeriod] = useState("week");
  const [limit, setLimit] = useState(10);
  const { data, error, loading, reload } = useFetch<R>(`/api/rankings?type=${type}&period=${period}&limit=${limit}`, [type, period, limit]);
  // Realtime substitute: lightweight polling keeps the board fresh without a socket dependency
  useEffect(() => { const id = setInterval(() => { if (document.visibilityState === "visible") reload(); }, 20000); return () => clearInterval(id); }, [reload]);
  const val = (r: Row) => (type === "hours" ? `${r.hours?.toFixed(1)} h` : brl(r.cents ?? 0));
  const top = data?.rows.slice(0, 3) ?? [];
  const order = [top[1], top[0], top[2]];
  const heights = [120, 160, 96];
  const medal = ["🥈", "🥇", "🥉"];
  return (
    <div className="px-4 sm:px-8 lg:px-10 pb-16 max-w-5xl">
      <PageTitle title="Rankings" sub={type === "hours" ? "Somente tempo validado pelo servidor com telemetria do player" : "Somente pagamentos PIX confirmados"} icon="trophy" />
      <div className="flex flex-wrap gap-2 mt-6">
        <button className={`chip !text-sm !px-4 !py-2 ${type === "hours" ? "on" : ""}`} onClick={() => setType("hours")}><Icon name="clock" size={14} />Horas assistidas</button>
        <button className={`chip !text-sm !px-4 !py-2 ${type === "donations" ? "on" : ""}`} onClick={() => { setType("donations"); if (period === "week") setPeriod("month"); }}><Icon name="gift" size={14} />Apoiadores</button>
        <span className="flex-1" />
        {(type === "hours" ? [["week", "Semana"], ["month", "Mês"], ["all", "Geral"]] : [["month", "Mês"], ["all", "Geral"]]).map(([k, l]) => <button key={k} className={`chip ${period === k ? "on" : ""}`} onClick={() => setPeriod(k)}>{l}</button>)}
        {[10, 50, 100].map((n) => <button key={n} className={`chip ${limit === n ? "on" : ""}`} onClick={() => setLimit(n)}>Top {n}</button>)}
      </div>
      {error ? <div className="mt-8"><ErrorBox message={error.message} onRetry={reload} /></div> : loading && !data ? <Skeleton className="h-72 mt-8" /> : data && !data.enabled ? <div className="mt-8"><Empty icon="trophy" title="Ranking desativado" text="O administrador desativou este ranking temporariamente. O histórico foi preservado." /></div> : data && data.rows.length === 0 ? <div className="mt-8"><Empty icon="trophy" title="Ainda sem classificados" text={type === "hours" ? "Assista a conteúdos em servidores com telemetria para entrar no ranking." : "Seja o primeiro apoiador do DiploCine."} /></div> : data && (
        <>
          <div className="flex items-end justify-center gap-3 sm:gap-6 mt-10 h-[260px]">
            {order.map((r, i) => r && (
              <div key={r.rank} className="flex flex-col items-center w-28 sm:w-40" style={{ animation: `fadeUp .8s ${0.15 * i}s var(--ease) both` }}>
                <Avatar p={{ name: r.name, avatarUrl: r.avatarUrl, avatarGradient: r.gradient }} size={i === 1 ? 84 : 64} ring={i === 1} />
                <div className="text-sm font-bold mt-2 truncate w-full text-center">{r.name}</div><div className="text-xs text-[var(--red2)] font-semibold">{val(r)}</div>
                <div className="w-full mt-2 rounded-t-2xl grid place-items-start justify-center pt-3 text-3xl" style={{ height: heights[i], background: "linear-gradient(180deg,rgba(229,9,20,.4),rgba(229,9,20,.05))", border: "1px solid rgba(229,9,20,.3)", transformOrigin: "bottom", animation: `fadeUp .9s ${0.2 * i}s var(--ease) both` }}>{medal[i]}</div>
              </div>
            ))}
          </div>
          <div className="panel mt-8 divide-y divide-white/5 overflow-hidden">
            {data.rows.map((r) => (
              <div key={r.rank + r.name} className={`flex items-center gap-4 px-4 py-3 ${r.me ? "bg-red-600/10" : ""}`}><span className="w-8 text-center font-extrabold text-[var(--muted)]">{r.rank}</span><Avatar p={{ name: r.name, avatarUrl: r.avatarUrl, avatarGradient: r.gradient }} size={40} /><div className="min-w-0 flex-1"><div className="font-semibold truncate">{r.name}{r.me && <span className="chip on ml-2 !py-0">você</span>}</div>{r.level && <div className="text-xs text-[var(--muted)]">Nível {r.level}</div>}{r.count ? <div className="text-xs text-[var(--muted)]">{r.count} apoio(s)</div> : null}</div><div className="font-bold">{val(r)}</div></div>
            ))}
          </div>
        </>
      )}
      {data && (
        <section className="mt-12"><div className="eyebrow mb-4">Suas conquistas</div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 stagger">{Object.entries(data.achievements).map(([code, a]) => { const got = data.mine.some((m) => m.code === code); return (
            <div key={code} className={`panel p-4 flex gap-3 items-center ${got ? "" : "opacity-45"}`}><span className="w-11 h-11 rounded-xl grid place-items-center" style={{ background: got ? "linear-gradient(135deg,#E50914,#7a050c)" : "rgba(255,255,255,.06)" }}><Icon name={got ? "crown" : "lock"} size={20} /></span><div><div className="font-semibold text-sm">{a.name}</div><div className="text-xs text-[var(--muted)]">{a.desc}</div></div></div>); })}</div>
          <div className="eyebrow mt-8 mb-3">Níveis</div><div className="flex flex-wrap gap-2">{data.levels.map((l) => <span key={l.level} className="chip">Nv {l.level} · {l.name} · {l.hours}h</span>)}</div>
        </section>
      )}
    </div>
  );
}
