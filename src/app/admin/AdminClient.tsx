"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */
import Link from "next/link";
import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AppProvider, useApp } from "@/components/AppProvider";
import { Icon } from "@/components/Icon";
import { ErrorBox, Skeleton, Spinner } from "@/components/ui";
import { api, brl, useFetch } from "@/lib/client/api";

const TABS: [string, string, string][] = [["dashboard", "Dashboard", "chart"], ["users", "Usuários", "users"], ["rankings", "Rankings", "trophy"], ["servers", "Servidores", "server"], ["music", "DiploMusic", "music"], ["content", "Conteúdo", "film"], ["ai", "IA", "ai"], ["payments", "NexusPag", "gift"], ["settings", "Configurações", "settings"], ["audit", "Auditoria", "shield"]];

export default function AdminClient() { return <AppProvider><Suspense><Admin /></Suspense></AppProvider>; }

function Table({ head, rows }: { head: string[]; rows: React.ReactNode[][] }) {
  return <div className="panel overflow-x-auto"><table className="w-full text-sm"><thead><tr className="text-left text-[11px] uppercase tracking-wider text-[var(--muted)]">{head.map((h) => <th key={h} className="px-4 py-3 font-bold">{h}</th>)}</tr></thead><tbody>{rows.map((r, i) => <tr key={i} className="border-t border-white/5 hover:bg-white/[.03]">{r.map((c, k) => <td key={k} className="px-4 py-2.5 align-middle">{c}</td>)}</tr>)}{!rows.length && <tr><td colSpan={head.length} className="px-4 py-8 text-center text-[var(--muted)]">Sem registros.</td></tr>}</tbody></table></div>;
}
function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label?: string }) {
  return <button role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)} className="w-11 h-6 rounded-full relative transition flex-none" style={{ background: on ? "#E50914" : "rgba(255,255,255,.15)" }}><span className="absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all" style={{ left: on ? 22 : 2 }} /></button>;
}
const Stat = ({ l, v, i }: { l: string; v: string | number; i: string }) => <div className="panel p-4"><Icon name={i} size={18} className="text-[var(--red2)]" /><div className="text-2xl font-extrabold mt-2">{v}</div><div className="text-xs text-[var(--muted)]">{l}</div></div>;

function Admin() {
  const sp = useSearchParams();
  const [tab, setTab] = useState(sp.get("tab") || "dashboard");
  return (
    <div className="min-h-dvh lg:flex">
      <aside className="lg:w-64 lg:fixed lg:inset-y-0 glass !border-y-0 !border-l-0 p-3 lg:p-4 flex lg:flex-col gap-1 overflow-x-auto no-scrollbar z-40 sticky top-0 lg:static">
        <Link href="/" className="hidden lg:flex items-center gap-3 px-2 mb-4 h-12"><span className="w-10 h-10 rounded-xl bg-[var(--red)] grid place-items-center font-black">D</span><span><span className="block logo-word !text-xs">Diplo<b>Cine</b></span><span className="text-[10px] text-[var(--muted)]">Control Center</span></span></Link>
        {TABS.map(([k, l, ic]) => <button key={k} onClick={() => setTab(k)} className={`nav-item flex-none !px-3 ${tab === k ? "active" : ""}`}><Icon name={ic} size={19} /><span className="text-sm font-semibold">{l}</span></button>)}
        <Link href="/" className="nav-item flex-none !px-3 lg:mt-auto"><Icon name="chevL" size={19} /><span className="text-sm font-semibold">Voltar ao app</span></Link>
      </aside>
      <main className="flex-1 lg:ml-64 p-4 sm:p-8 pb-20 min-w-0 page-enter" key={tab}>
        <h1 className="text-3xl h-display mb-6">{TABS.find((t) => t[0] === tab)?.[1]}</h1>
        {tab === "dashboard" && <Dashboard />}{tab === "users" && <Users />}{tab === "rankings" && <Rankings />}{tab === "servers" && <Servers />}{tab === "music" && <MusicAdmin />}{tab === "content" && <Content />}{tab === "ai" && <AI />}{tab === "payments" && <Payments />}{tab === "settings" && <Settings />}{tab === "audit" && <Audit />}
      </main>
    </div>
  );
}

function Load<T>({ path, children }: { path: string; children: (d: T, reload: () => void) => React.ReactNode }) {
  const { data, error, reload } = useFetch<T>(path);
  if (error) return <ErrorBox message={error.message} onRetry={reload} />;
  if (!data) return <Skeleton className="h-48" />;
  return <>{children(data, reload)}</>;
}

function Dashboard() {
  return <Load<any> path="/api/admin/stats">{(d) => {
    const mx = Math.max(1, ...d.growth.map((g: any) => g.signups + g.plays));
    return <>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 stagger"><Stat l="Usuários" v={d.users} i="users" /><Stat l="Ativos (7d)" v={d.active} i="clock" /><Stat l="Novos (7d)" v={d.newUsers} i="plus" /><Stat l="Perfis" v={d.profiles} i="user" /><Stat l="Sessões de reprodução" v={d.sessions} i="play" /><Stat l="Horas verificadas" v={d.hours} i="clock" /><Stat l="Doações confirmadas" v={d.donations} i="gift" /><Stat l="Arrecadado" v={brl(d.raisedCents)} i="crown" /></div>
      <div className="panel p-5 mt-5"><div className="flex justify-between mb-4"><div className="eyebrow">Crescimento · 14 dias</div><div className="text-xs text-[var(--muted)]">Falhas de API (7d): <b className={d.apiFailures ? "text-[var(--red2)]" : ""}>{d.apiFailures}</b></div></div>
        <div className="flex items-end gap-2 h-40">{d.growth.map((g: any, i: number) => <div key={i} className="flex-1 flex flex-col items-center gap-1.5"><div className="w-full flex flex-col justify-end h-full gap-0.5"><div className="rounded-t bg-[var(--red2)]" style={{ height: `${(g.plays / mx) * 100}%`, minHeight: g.plays ? 3 : 0 }} title={`${g.plays} sessões`} /><div className="rounded-b bg-white/40" style={{ height: `${(g.signups / mx) * 100}%`, minHeight: g.signups ? 3 : 0 }} title={`${g.signups} cadastros`} /></div><span className="text-[9px] text-[var(--muted)]">{g.day}</span></div>)}</div><div className="flex gap-4 text-[11px] text-[var(--muted)] mt-3"><span><i className="inline-block w-2 h-2 bg-[var(--red2)] rounded-sm mr-1" />Sessões</span><span><i className="inline-block w-2 h-2 bg-white/40 rounded-sm mr-1" />Cadastros</span></div></div>
      <div className="mt-5"><div className="eyebrow mb-2">Conteúdos mais assistidos</div><Table head={["Título", "Tipo", "Sessões"]} rows={d.popular.map((p: any) => [p.title, p.media_type, p.sessions])} /></div></>;
  }}</Load>;
}

function Users() {
  const { toast } = useApp();
  const [q, setQ] = useState("");
  const path = `/api/admin/users?q=${encodeURIComponent(q)}`;
  const act = async (b: any, reload: () => void) => { try { await api("/api/admin/user", { body: b }); toast("Atualizado.", "ok"); reload(); } catch (e) { toast((e as Error).message, "err"); } };
  return <><input className="input max-w-sm mb-4" placeholder="Buscar por nome ou e-mail" value={q} onChange={(e) => setQ(e.target.value)} />
    <Load<any> path={path}>{(d, reload) => <Table head={["Conta", "Perfis", "Status", "Papel", "Ações"]} rows={d.users.map((u: any) => [<div key="a"><div className="font-semibold">{u.name}</div><div className="text-xs text-[var(--muted)]">{u.email}</div></div>, u.profiles.map((p: any) => p.name).join(", ") || "—", <span key="s" className={u.status === "active" ? "text-emerald-400" : "text-[var(--red2)]"}>{u.status === "active" ? "Ativa" : "Suspensa"}</span>, u.role, <div key="x" className="flex gap-1.5 flex-wrap"><button className="btn btn-ghost btn-sm" onClick={() => act({ id: u.id, status: u.status === "active" ? "suspended" : "active" }, reload)}>{u.status === "active" ? "Suspender" : "Reativar"}</button><button className="btn btn-ghost btn-sm" onClick={() => act({ id: u.id, role: u.role === "admin" ? "user" : "admin" }, reload)}>{u.role === "admin" ? "Remover admin" : "Tornar admin"}</button></div>])} />}</Load></>;
}

function Flags({ keys }: { keys: string[] }) {
  const { toast } = useApp();
  return <Load<any> path="/api/admin/settings">{(d, reload) => <div className="panel divide-y divide-white/5">{d.flags.filter((f: any) => keys.includes(f.key)).map((f: any) => <div key={f.key} className="flex items-center gap-4 p-4"><div className="flex-1"><div className="font-semibold text-sm">{f.description}</div><div className="text-xs text-[var(--muted)]">{f.key}</div></div><Toggle on={f.enabled} label={f.description} onChange={async (v) => { try { await api("/api/admin/flag", { body: { key: f.key, enabled: v } }); toast(v ? "Ativado" : "Desativado", "ok"); reload(); } catch (e) { toast((e as Error).message, "err"); } }} /></div>)}</div>}</Load>;
}

function Rankings() {
  const { toast } = useApp();
  return <><Flags keys={["ranking_hours", "ranking_donations"]} /><p className="text-xs text-[var(--muted)] mt-3">Desativar apenas oculta o ranking — nenhum histórico é apagado. Regras (sessão mínima, telemetria, teto diário) em Configurações → Rankings.</p>
    <div className="eyebrow mt-8 mb-2">Moderação de sessões (maiores tempos)</div><Load<any> path="/api/admin/rankings">{(d, reload) => <Table head={["Sessão", "Perfil", "Segundos", "Telemetria", "Sinalizada", ""]} rows={d.sessions.map((s: any) => [s.id.slice(0, 8), s.profileId.slice(0, 8), s.seconds, s.telemetry ? "sim" : "não", s.flagged ? "sim" : "não", <button key="b" className="btn btn-ghost btn-sm" onClick={async () => { await api("/api/admin/session", { body: { id: s.id, flagged: !s.flagged } }); toast("Atualizado.", "ok"); reload(); }}>{s.flagged ? "Liberar" : "Sinalizar fraude"}</button>])} />}</Load></>;
}

function Servers() {
  const { toast } = useApp();
  const [testing, setTesting] = useState<string | null>(null);
  return <Load<any> path="/api/admin/providers">{(d, reload) => {
    const set = async (id: string, b: any) => { try { await api("/api/admin/provider", { body: { id, ...b } }); reload(); } catch (e) { toast((e as Error).message, "err"); } };
    return <>
      <div className="rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-200 text-sm p-4 mb-5">Ative apenas provedores para os quais você possui <b>direitos de incorporação e distribuição</b>. O DiploCine não contorna DRM, autenticação ou bloqueios. Confirmar os direitos fica registrado na auditoria.</div>
      <div className="grid gap-4 lg:grid-cols-2">{d.providers.map((p: any) => { const c = p.config ?? {}; return (
        <div key={p.id} className="panel p-5 space-y-3">
          <div className="flex items-start gap-3"><div className="flex-1"><div className="font-bold">{p.name}</div><div className="text-xs text-[var(--muted)]">{p.domain}</div></div><span className={`chip ${c.enabled ? "on" : ""}`}>{c.enabled ? "ativo" : "inativo"}</span></div>
          <p className="text-xs text-[var(--muted)]">{p.note}</p>
          <label className="flex items-center gap-3 text-sm"><input type="checkbox" className="accent-[#E50914] w-4 h-4" checked={!!c.rightsConfirmed} onChange={(e) => set(p.id, { rightsConfirmed: e.target.checked })} />Confirmo possuir direitos de incorporação/distribuição</label>
          <div className="flex items-center gap-3 text-sm"><Toggle on={!!c.enabled} onChange={(v) => set(p.id, { enabled: v })} label="Ativar" />Ativado</div>
          <div className="flex items-center gap-3 text-sm"><Toggle on={!!c.showWhenUnknown} onChange={(v) => set(p.id, { showWhenUnknown: v })} label="Mostrar não verificado" />Exibir quando a disponibilidade for “desconhecida”</div>
          <div className="grid grid-cols-3 gap-2 text-xs">{([["priority", "Prioridade"], ["timeoutMs", "Timeout (ms)"], ["cacheTtlSec", "Cache (s)"]] as const).map(([k, l]) => <label key={k}>{l}<input className="input !h-9 !text-sm mt-1" type="number" defaultValue={c[k]} onBlur={(e) => +e.target.value !== c[k] && set(p.id, { [k]: +e.target.value })} /></label>)}</div>
          <div className="flex items-center gap-3 text-xs text-[var(--muted)]"><span>7d: {p.metrics ? `${p.metrics.total} checagens · ${p.metrics.failures} falhas · ${p.metrics.avg_ms}ms` : "sem métricas"}</span><span className="flex-1" /><button className="btn btn-ghost btn-sm" disabled={testing === p.id} onClick={async () => { setTesting(p.id); try { const r = await api<any>("/api/admin/provider", { body: { id: p.id, action: "test" } }); toast(`${r.result?.state}: ${r.result?.message}`, r.result?.state === "available" ? "ok" : "info"); reload(); } catch (e) { toast((e as Error).message, "err"); } setTesting(null); }}>{testing === p.id ? <Spinner size={14} /> : "Verificar status"}</button></div>
        </div>); })}</div>
      <div className="eyebrow mt-8 mb-2">Logs recentes</div><Table head={["Quando", "Provedor", "Estado", "ms", "Mensagem"]} rows={d.logs.map((l: any) => [new Date(l.createdAt).toLocaleString("pt-BR"), l.providerId, l.ok ? l.state : <span key="e" className="text-[var(--red2)]">falha</span>, l.latencyMs, l.message])} /></>;
  }}</Load>;
}

function MusicAdmin() {
  const { toast } = useApp();
  return <><Flags keys={["diplomusic", "lyrics", "playlist_sharing"]} /><Load<any> path="/api/admin/music">{(d, reload) => <>
    <div className="flex gap-3 mt-5"><span className={`chip ${d.youtube ? "on" : ""}`}>YouTube API {d.youtube ? "configurada" : "ausente"}</span><span className={`chip ${d.spotify ? "on" : ""}`}>Spotify {d.spotify ? "configurado" : "opcional"}</span></div>
    <div className="eyebrow mt-6 mb-2">Playlists públicas (moderação)</div><Table head={["Nome", "Slug", "Estado", ""]} rows={d.playlists.map((p: any) => [p.name, p.slug, p.hidden ? "oculta" : "visível", <button key="b" className="btn btn-ghost btn-sm" onClick={async () => { await api("/api/admin/playlist", { body: { id: p.id, hidden: !p.hidden } }); toast("Atualizado.", "ok"); reload(); }}>{p.hidden ? "Reexibir" : "Ocultar"}</button>])} />
    <div className="eyebrow mt-6 mb-2">Erros reportados pelos clientes</div><Table head={["Quando", "Mensagem", "Rota"]} rows={d.errors.map((e: any) => [new Date(e.createdAt).toLocaleString("pt-BR"), e.message, e.url])} /></>}</Load></>;
}

function Content() {
  const { toast } = useApp();
  const [f, setF] = useState({ tmdbId: "", mediaType: "movie", title: "", tagline: "" });
  const [a, setA] = useState({ collectionId: "", name: "", imageUrl: "", collectionName: "" });
  return <Load<any> path="/api/admin/content">{(d, reload) => <>
    <div className="eyebrow mb-2">Destaques do banner (Início)</div>
    <div className="panel p-4 grid sm:grid-cols-5 gap-2"><input className="input !h-10" placeholder="TMDB ID" value={f.tmdbId} onChange={(e) => setF({ ...f, tmdbId: e.target.value })} /><select className="input !h-10" value={f.mediaType} onChange={(e) => setF({ ...f, mediaType: e.target.value })}><option value="movie">Filme</option><option value="tv">Série</option></select><input className="input !h-10" placeholder="Título" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /><input className="input !h-10" placeholder="Texto do banner" value={f.tagline} onChange={(e) => setF({ ...f, tagline: e.target.value })} /><button className="btn btn-primary btn-sm !h-10" onClick={async () => { try { await api("/api/admin/featured", { body: f }); setF({ ...f, tmdbId: "", title: "", tagline: "" }); reload(); } catch (e) { toast((e as Error).message, "err"); } }}>Adicionar</button></div>
    <div className="mt-3"><Table head={["TMDB", "Tipo", "Título", ""]} rows={d.featured.map((x: any) => [x.tmdbId, x.mediaType, x.title, <button key="d" className="btn btn-ghost btn-sm" onClick={async () => { await api("/api/admin/featured", { body: { delete: x.id } }); reload(); }}>Remover</button>])} /></div>
    <div className="eyebrow mt-8 mb-2">Avatares e coleções (apenas imagens autorizadas)</div>
    <div className="panel p-4 grid sm:grid-cols-4 gap-2"><select className="input !h-10" value={a.collectionId} onChange={(e) => setA({ ...a, collectionId: e.target.value })}><option value="">Coleção…</option>{d.collections.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}</select><input className="input !h-10" placeholder="Personagem" value={a.name} onChange={(e) => setA({ ...a, name: e.target.value })} /><input className="input !h-10" placeholder="URL https da imagem (opcional)" value={a.imageUrl} onChange={(e) => setA({ ...a, imageUrl: e.target.value })} /><button className="btn btn-primary btn-sm !h-10" onClick={async () => { try { await api("/api/admin/avatar", { body: { collectionId: a.collectionId, name: a.name, imageUrl: a.imageUrl || null } }); setA({ ...a, name: "", imageUrl: "" }); toast("Avatar adicionado.", "ok"); reload(); } catch (e) { toast((e as Error).message, "err"); } }}>Adicionar avatar</button></div>
    <div className="flex gap-2 mt-2"><input className="input !h-10 max-w-xs" placeholder="Nova coleção" value={a.collectionName} onChange={(e) => setA({ ...a, collectionName: e.target.value })} /><button className="btn btn-ghost btn-sm !h-10" onClick={async () => { await api("/api/admin/avatar", { body: { collectionName: a.collectionName } }); setA({ ...a, collectionName: "" }); reload(); }}>Criar coleção</button></div>
    <div className="mt-3"><Table head={["Avatar", "Coleção", "Imagem", ""]} rows={d.avatars.slice(0, 60).map((x: any) => [x.name, d.collections.find((c: any) => c.id === x.collectionId)?.name, x.imageUrl ? "sim" : "iniciais", <button key="d" className="btn btn-ghost btn-sm" onClick={async () => { await api("/api/admin/avatar", { body: { delete: x.id } }); reload(); }}>Excluir</button>])} /></div></>}</Load>;
}

function AI() {
  const { toast } = useApp();
  return <><Flags keys={["ai_search"]} /><p className="text-sm text-[var(--muted)] mt-4">Configure provedor (endpoint compatível com OpenAI), chave, modelo, limite diário e instruções internas na aba Configurações → grupo “IA”. Sem provedor, a busca usa o interpretador por regras (fallback).</p><button className="btn btn-ghost mt-4" onClick={async () => { try { const r = await api<any>("/api/admin/test", { body: { target: "ai" } }); toast(r.ok ? "Conexão OK" : `Falhou (HTTP ${r.status})`, r.ok ? "ok" : "err"); } catch (e) { toast((e as Error).message, "err"); } }}>Testar conexão</button>
    <Load<any> path="/api/admin/ai">{(d) => <div className="grid grid-cols-3 gap-3 mt-5"><Stat l="Chamadas" v={d.metrics.total} i="ai" /><Stat l="Falhas" v={d.metrics.failures} i="alert" /><Stat l="Latência média" v={`${d.metrics.avg_ms}ms`} i="clock" /></div>}</Load></>;
}

function Payments() {
  return <Load<any> path="/api/admin/payments">{(d) => <><div className="grid grid-cols-3 gap-3 mb-5"><Stat l="Confirmadas" v={d.payments.filter((p: any) => p.status === "confirmed").length} i="check" /><Stat l="Pendentes" v={d.payments.filter((p: any) => p.status === "pending").length} i="clock" /><Stat l="Valor confirmado" v={brl(d.payments.filter((p: any) => p.status === "confirmed").reduce((s: number, p: any) => s + p.amountCents, 0))} i="crown" /></div>
    <div className="eyebrow mb-2">Cobranças</div><Table head={["Criada", "External ID", "Valor", "Status", "Anônima"]} rows={d.payments.map((p: any) => [new Date(p.createdAt).toLocaleString("pt-BR"), p.externalId, brl(p.amountCents), p.status, p.anonymous ? "sim" : "não"])} />
    <div className="eyebrow mt-6 mb-2">Webhooks</div><Table head={["Quando", "Evento", "Assinatura", "Resultado"]} rows={d.webhooks.map((w: any) => [new Date(w.createdAt).toLocaleString("pt-BR"), w.type, w.signatureValid ? "válida" : <span key="x" className="text-[var(--red2)]">inválida</span>, w.result])} /></>}</Load>;
}

function Settings() {
  const { toast } = useApp();
  const [vals, setVals] = useState<Record<string, string>>({});
  return <><div className="rounded-xl bg-white/5 text-sm text-[var(--muted)] p-4 mb-5">Segredos são criptografados (AES-256-GCM) e <b>nunca</b> retornam ao navegador. Variáveis de ambiente têm prioridade sobre valores salvos aqui.</div>
    <Load<any> path="/api/admin/settings">{(d, reload) => <>
      <div className="eyebrow mb-2">Recursos</div><div className="panel divide-y divide-white/5 mb-8">{d.flags.map((f: any) => <div key={f.key} className="flex items-center gap-4 p-4"><div className="flex-1 text-sm"><div className="font-semibold">{f.description}</div></div><Toggle on={f.enabled} label={f.description} onChange={async (v) => { await api("/api/admin/flag", { body: { key: f.key, enabled: v } }).catch((e) => toast(e.message, "err")); reload(); }} /></div>)}</div>
      {[...new Set(d.settings.map((s: any) => s.group))].map((g: any) => <div key={g} className="mb-7"><div className="eyebrow mb-2">{g}</div><div className="panel divide-y divide-white/5">{d.settings.filter((s: any) => s.group === g).map((s: any) => (
        <div key={s.key} className="p-4 flex flex-col sm:flex-row sm:items-center gap-3"><div className="sm:w-72"><div className="text-sm font-semibold">{s.label}</div><div className="text-[11px] text-[var(--muted)]">{s.key}{s.configured ? ` · configurado (${s.source})` : " · não configurado"}</div></div>
          <input className="input !h-10 !text-sm flex-1" type={s.secret ? "password" : "text"} autoComplete="off" placeholder={s.secret ? (s.configured ? "•••••• (digite para substituir)" : "colar chave") : s.hint || ""} value={vals[s.key] ?? s.value ?? ""} onChange={(e) => setVals({ ...vals, [s.key]: e.target.value })} />
          <div className="flex gap-2"><button className="btn btn-primary btn-sm" onClick={async () => { const v = vals[s.key]; if (!v) return; try { await api("/api/admin/setting", { body: { key: s.key, value: v } }); setVals({ ...vals, [s.key]: "" }); toast("Salvo.", "ok"); reload(); } catch (e) { toast((e as Error).message, "err"); } }}>Salvar</button>{s.source === "admin" && <button className="btn btn-ghost btn-sm" onClick={async () => { await api("/api/admin/setting", { body: { key: s.key, clear: true } }); reload(); }}>Limpar</button>}</div></div>))}</div></div>)}
      <div className="flex gap-2">{["tmdb", "youtube"].map((t) => <button key={t} className="btn btn-ghost btn-sm" onClick={async () => { try { const r = await api<any>("/api/admin/test", { body: { target: t } }); toast(`${t.toUpperCase()}: ${r.ok ? "OK" : `falhou (HTTP ${r.status})`}`, r.ok ? "ok" : "err"); } catch (e) { toast((e as Error).message, "err"); } }}>Testar {t.toUpperCase()}</button>)}</div></>}</Load></>;
}

function Audit() {
  return <Load<any> path="/api/admin/audit">{(d) => <Table head={["Quando", "Ação", "Alvo", "Detalhes"]} rows={d.logs.map((l: any) => [new Date(l.createdAt).toLocaleString("pt-BR"), l.action, l.target, <code key="m" className="text-[11px] text-[var(--muted)]">{JSON.stringify(l.meta)?.slice(0, 120)}</code>])} />}</Load>;
}
