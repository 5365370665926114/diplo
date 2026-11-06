"use client";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useApp } from "@/components/AppProvider";
import { Icon } from "@/components/Icon";
import { useMusic, type Track } from "@/components/MusicProvider";
import { Empty, ErrorBox, Img, Modal, Rail, Skeleton, Spinner } from "@/components/ui";
import { api, fmtDur, useFetch } from "@/lib/client/api";
import { MUSIC_GENRES, MUSIC_MOODS } from "@/lib/genres";

type Artist = { id: number; name: string; picture: string | null };
type Prefs = { artists: Artist[]; genres: string[]; moods: string[]; mode: "youtube" | "spotify-inspired"; completed: boolean };
type PL = { id: string; name: string; description: string; cover_url: string | null; is_public: boolean; favorite: boolean; share_slug: string | null; tracks: number; duration: number; thumb: string | null };
type Lib = { likes: (Track & { videoId: string })[]; history: Track[]; playlists: PL[] };

function Onboarding({ initial, onDone }: { initial: Prefs; onDone: (p: Prefs) => void }) {
  const { toast } = useApp();
  const [step, setStep] = useState(0);
  const [p, setP] = useState<Prefs>(initial);
  const [q, setQ] = useState("");
  const [arts, setArts] = useState<Artist[] | null>(null);
  const [err, setErr] = useState("");
  const [related, setRelated] = useState<Artist[]>([]);
  useEffect(() => { if (step !== 1) return; const id = setTimeout(() => api<{ artists: Artist[] }>(`/api/music/artists?q=${encodeURIComponent(q)}`).then((d) => { setArts(d.artists); setErr(""); }).catch((e) => setErr(e.message)), q ? 300 : 0); return () => clearTimeout(id); }, [q, step]);
  const pickArtist = (a: Artist) => {
    const on = p.artists.some((x) => x.id === a.id);
    setP({ ...p, artists: on ? p.artists.filter((x) => x.id !== a.id) : [...p.artists, a] });
    if (!on) api<{ artists: Artist[] }>(`/api/music/related?id=${a.id}`).then((d) => setRelated((r) => [...d.artists.filter((x) => !r.some((y) => y.id === x.id))].slice(0, 12))).catch(() => {});
  };
  const tog = (k: "genres" | "moods", v: string) => setP({ ...p, [k]: p[k].includes(v) ? p[k].filter((x) => x !== v) : [...p[k], v] });
  const finish = async () => { try { await api("/api/music/prefs", { body: { ...p, completed: true } }); onDone({ ...p, completed: true }); } catch (e) { toast((e as Error).message, "err"); } };
  const list = [...p.artists, ...(arts ?? []).filter((a) => !p.artists.some((x) => x.id === a.id))];
  return (
    <div className="min-h-[88dvh] grid place-items-center px-4 py-10 relative">
      <div className="absolute inset-0 pointer-events-none" style={{ background: "radial-gradient(circle at 50% 30%, rgba(229,9,20,.18), transparent 60%)" }} />
      <div className="relative w-full max-w-3xl text-center" key={step}>
        {step > 0 && step < 5 && <div className="flex gap-1.5 max-w-xs mx-auto mb-8">{[1, 2, 3, 4].map((i) => <i key={i} className="flex-1 h-1 rounded-full transition-all duration-500" style={{ background: i <= step ? "#E50914" : "rgba(255,255,255,.14)" }} />)}</div>}
        {step === 0 && <div className="page-enter"><div className="logo-word text-3xl sm:text-5xl" style={{ animation: "logoIn 1.6s var(--ease) both" }}>DIPLO<b>MUSIC</b></div><div className="flex justify-center items-end gap-1 h-10 mt-6">{Array.from({ length: 9 }).map((_, i) => <i key={i} className="w-1.5 h-full rounded bg-[var(--red)]" style={{ transformOrigin: "bottom", animation: `bars ${0.8 + (i % 4) * 0.15}s ${i * 0.08}s ease-in-out infinite` }} />)}</div><h1 className="text-3xl sm:text-4xl h-display mt-8">Sua música. Seu universo.</h1><p className="text-[var(--muted)] mt-3">Vamos descobrir o que faz parte da sua trilha sonora.</p><button className="btn btn-primary !h-14 !px-8 mt-9" onClick={() => setStep(1)}>Personalizar minha música<Icon name="chevR" size={18} /></button></div>}
        {step === 1 && <div className="page-enter"><h2 className="text-3xl h-display">Quais artistas você mais gosta?</h2><p className="text-sm text-[var(--muted)] mt-2">Escolha pelo menos 3 ({p.artists.length} selecionados). Fonte: Deezer.</p>
          <div className="relative max-w-md mx-auto mt-5"><Icon name="search" size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--muted)]" /><input className="input !pl-10" placeholder="Pesquisar artista…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
          {err ? <div className="mt-6 text-left"><ErrorBox message={err} /></div> : !arts ? <div className="grid place-items-center p-10"><Spinner /></div> : <div className="grid gap-x-3 gap-y-5 mt-6 max-h-[44vh] overflow-y-auto p-2" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(92px,1fr))" }}>{list.map((a) => { const on = p.artists.some((x) => x.id === a.id); return <button key={a.id} onClick={() => pickArtist(a)} className="group" aria-pressed={on}><span className="relative block w-20 h-20 mx-auto rounded-full overflow-hidden transition group-hover:scale-105" style={{ boxShadow: on ? "0 0 0 3px #E50914, 0 0 24px rgba(255,24,56,.6)" : undefined }}><Img src={a.picture} alt={a.name} className="w-full h-full object-cover" />{on && <span className="absolute inset-0 bg-red-600/50 grid place-items-center" style={{ animation: "pop .35s var(--ease)" }}><Icon name="check" /></span>}</span><span className="block text-xs mt-2 truncate font-medium">{a.name}</span></button>; })}</div>}
          {related.length > 0 && <div className="mt-4"><div className="eyebrow justify-center mb-2">Sugestões relacionadas</div><div className="flex flex-wrap justify-center gap-2">{related.filter((r) => !p.artists.some((x) => x.id === r.id)).slice(0, 8).map((r) => <button key={r.id} className="chip" onClick={() => pickArtist(r)}>+ {r.name}</button>)}</div></div>}
        </div>}
        {step === 2 && <div className="page-enter"><h2 className="text-3xl h-display">Escolha seus gêneros</h2><div className="flex flex-wrap justify-center gap-3 mt-8 stagger">{MUSIC_GENRES.map((g) => <button key={g} onClick={() => tog("genres", g)} className={`chip !text-base !px-6 !py-3 ${p.genres.includes(g) ? "on" : ""}`} aria-pressed={p.genres.includes(g)}>{g}</button>)}</div></div>}
        {step === 3 && <div className="page-enter"><h2 className="text-3xl h-display">Seu estilo musical</h2><div className="grid sm:grid-cols-2 gap-3 mt-8 stagger">{MUSIC_MOODS.map((m) => <button key={m.id} onClick={() => tog("moods", m.id)} className={`panel p-4 text-left font-semibold flex items-center justify-between transition ${p.moods.includes(m.id) ? "!border-[var(--red)] bg-red-600/15" : "hover:bg-white/5"}`}>{m.label}{p.moods.includes(m.id) && <Icon name="check" className="text-[var(--red2)]" />}</button>)}</div></div>}
        {step === 4 && <div className="page-enter"><h2 className="text-3xl h-display">Experiência visual</h2><p className="text-sm text-[var(--muted)] mt-2">Apenas a apresentação muda — a reprodução é sempre pelo player oficial do YouTube.</p><div className="grid sm:grid-cols-2 gap-4 mt-8">{([["youtube", "YouTube Experience", "Thumbnails em 16:9 e organização orientada à pesquisa."], ["spotify-inspired", "Spotify-Inspired Experience", "Capas quadradas, biblioteca e cards focados em playlists."]] as const).map(([k, t, d]) => <button key={k} onClick={() => setP({ ...p, mode: k })} className={`panel p-5 text-left transition ${p.mode === k ? "!border-[var(--red)] bg-red-600/10" : "hover:bg-white/5"}`}><div className="flex gap-2 mb-4">{[0, 1, 2].map((i) => <span key={i} className="flex-1 bg-gradient-to-br from-[#2a2a33] to-[#16161c] rounded-lg" style={{ aspectRatio: k === "youtube" ? "16/9" : "1" }} />)}</div><div className="font-bold">{t}</div><div className="text-xs text-[var(--muted)] mt-1">{d}</div></button>)}</div></div>}
        {step === 5 && <div className="page-enter"><div className="mx-auto w-24 h-24 rounded-full bg-red-600/20 grid place-items-center text-[var(--red2)]" style={{ animation: "pop .7s var(--ease), glow 3s infinite" }}><Icon name="check" size={44} /></div><h2 className="text-3xl h-display mt-8">Sua biblioteca está pronta</h2><p className="text-[var(--muted)] mt-3">Personalizamos o DiploMusic com {p.artists.length} artistas, {p.genres.length} gêneros e {p.moods.length} estilos.</p></div>}
        <div className="flex justify-center gap-3 mt-9">
          {step > 0 && step < 5 && <button className="btn btn-ghost" onClick={() => setStep(step - 1)}>Voltar</button>}
          {step === 1 && p.artists.length < 3 && <button className="btn btn-ghost" onClick={() => setStep(2)}>Pular</button>}
          {step > 0 && step < 4 && <button className="btn btn-primary" disabled={step === 1 && p.artists.length > 0 && p.artists.length < 3} onClick={() => setStep(step + 1)}>Continuar</button>}
          {step === 4 && <button className="btn btn-primary" onClick={async () => { await finish(); setStep(5); }}>Concluir</button>}
          {step === 5 && <button className="btn btn-primary !h-13 !px-8" onClick={() => onDone({ ...p, completed: true })}>Abrir DiploMusic</button>}
        </div>
      </div>
    </div>
  );
}

function TrackRow({ t, list, i, onAdd, extra }: { t: Track; list: Track[]; i: number; onAdd: (t: Track) => void; extra?: React.ReactNode }) {
  const m = useMusic();
  const cur = m.current?.videoId === t.videoId;
  return (
    <div className={`group flex items-center gap-3 p-2 rounded-xl hover:bg-white/5 ${cur ? "bg-red-600/10" : ""}`}>
      <button className="relative w-12 h-12 rounded-lg overflow-hidden flex-none" onClick={() => m.play(list, i)} aria-label={`Tocar ${t.title}`}><Img src={t.thumbnail} alt="" className="w-full h-full object-cover" /><span className="absolute inset-0 bg-black/50 grid place-items-center opacity-0 group-hover:opacity-100 transition">{cur && m.playing ? <span className="eq"><i /><i /><i /></span> : <Icon name="play" size={16} fill />}</span></button>
      <button className="min-w-0 flex-1 text-left" onClick={() => m.play(list, i)}><span className="block text-sm font-semibold truncate">{t.title}</span><span className="block text-xs text-[var(--muted)] truncate">{t.artist}</span></button>
      <span className="text-xs text-[var(--muted)] hidden sm:block">{fmtDur(t.durationSec)}</span>
      <button className={`btn btn-ghost btn-icon !w-9 !h-9 ${m.liked.has(t.videoId) ? "!text-[var(--red2)]" : ""}`} onClick={() => m.toggleLike(t)} aria-label="Curtir"><Icon name="heart" size={15} fill={m.liked.has(t.videoId)} /></button>
      <button className="btn btn-ghost btn-icon !w-9 !h-9" onClick={() => m.playNext(t)} aria-label="Tocar a seguir"><Icon name="list" size={15} /></button>
      <button className="btn btn-ghost btn-icon !w-9 !h-9" onClick={() => onAdd(t)} aria-label="Adicionar à playlist"><Icon name="plus" size={15} /></button>{extra}
    </div>
  );
}

function AddToPlaylist({ track, onClose }: { track: Track; onClose: () => void }) {
  const { toast } = useApp();
  const { data, reload } = useFetch<Lib>("/api/music/library");
  const [name, setName] = useState("");
  const add = async (id: string) => { try { const r = await api<{ added: number; duplicates: number }>(`/api/music/playlists/${id}`, { body: { op: "add", tracks: [track] } }); toast(r.duplicates ? "Já estava na playlist." : "Adicionada!", r.duplicates ? "info" : "ok"); onClose(); } catch (e) { toast((e as Error).message, "err"); } };
  return <Modal onClose={onClose}><h3 className="font-bold text-lg mb-1 pr-8">Adicionar à playlist</h3><p className="text-xs text-[var(--muted)] mb-4 truncate">{track.title}</p>
    <div className="flex gap-2 mb-3"><input className="input !h-11" placeholder="Nova playlist…" value={name} onChange={(e) => setName(e.target.value)} /><button className="btn btn-primary btn-sm !h-11" disabled={!name.trim()} onClick={async () => { try { await api("/api/music/playlists", { body: { name, tracks: [track] } }); toast("Playlist criada!", "ok"); onClose(); } catch (e) { toast((e as Error).message, "err"); } }}>Criar</button></div>
    <div className="max-h-64 overflow-y-auto">{data?.playlists.map((p) => <button key={p.id} className="w-full text-left px-3 py-2.5 rounded-xl hover:bg-white/5 text-sm font-medium flex justify-between" onClick={() => add(p.id)}>{p.name}<span className="text-xs text-[var(--muted)]">{p.tracks}</span></button>)}{!data && <Spinner />}</div><span hidden onClick={reload} /></Modal>;
}

function PlaylistView({ id, onBack, onChanged, onAdd }: { id: string; onBack: () => void; onChanged: () => void; onAdd: (t: Track) => void }) {
  const { toast } = useApp();
  const m = useMusic();
  const { data, reload, error } = useFetch<{ playlist: { id: string; name: string; description: string; isPublic: boolean; shareSlug: string | null; coverUrl: string | null; favorite: boolean }; items: Track[]; owner: boolean }>(`/api/music/playlists/${id}`);
  const [items, setItems] = useState<Track[]>([]);
  const [q, setQ] = useState("");
  const [sort, setSort] = useState("custom");
  const drag = useRef<number | null>(null);
  useEffect(() => { if (data) setItems(data.items); }, [data]);
  if (error) return <ErrorBox message={error.message} onRetry={reload} />;
  if (!data) return <Skeleton className="h-60" />;
  const pl = data.playlist;
  const patch = async (b: Record<string, unknown>) => { try { await api(`/api/music/playlists/${id}`, { method: "PATCH", body: b }); reload(); onChanged(); } catch (e) { toast((e as Error).message, "err"); } };
  const shown = items.filter((t) => !q || (t.title + t.artist).toLowerCase().includes(q.toLowerCase())).sort((a, b) => (sort === "name" ? a.title.localeCompare(b.title) : 0));
  const total = items.reduce((s, t) => s + (t.durationSec || 0), 0);
  const drop = async (to: number) => { const from = drag.current; drag.current = null; if (from === null || from === to || sort !== "custom" || q) return; const n = [...items]; const [x] = n.splice(from, 1); n.splice(to, 0, x); setItems(n); await api(`/api/music/playlists/${id}`, { body: { op: "reorder", order: n.map((t) => t.videoId) } }).catch(() => toast("Falha ao salvar a ordem.", "err")); };
  return (
    <div className="page-enter">
      <button className="btn btn-ghost btn-sm mb-4" onClick={onBack}><Icon name="chevL" size={14} />Biblioteca</button>
      <div className="flex flex-col sm:flex-row gap-5 items-start">
        <div className="w-40 h-40 rounded-2xl overflow-hidden flex-none card"><Img src={pl.coverUrl || items[0]?.thumbnail || null} alt="" className="w-full h-full object-cover" /></div>
        <div className="min-w-0 flex-1"><div className="eyebrow">Playlist {pl.isPublic ? "· pública" : "· privada"}</div>
          {data.owner ? <input className="bg-transparent text-3xl h-display w-full outline-none mt-1 border-b border-transparent focus:border-[var(--red)]" defaultValue={pl.name} onBlur={(e) => e.target.value.trim() && e.target.value !== pl.name && patch({ name: e.target.value })} aria-label="Nome" /> : <h1 className="text-3xl h-display mt-1">{pl.name}</h1>}
          {data.owner ? <input className="bg-transparent text-sm text-[var(--muted)] w-full outline-none mt-1" placeholder="Adicionar descrição…" defaultValue={pl.description} onBlur={(e) => e.target.value !== pl.description && patch({ description: e.target.value })} /> : <p className="text-sm text-[var(--muted)]">{pl.description}</p>}
          <div className="text-xs text-[var(--muted)] mt-2">{items.length} faixas{total ? ` · ${Math.round(total / 60)} min` : ""}</div>
          <div className="flex flex-wrap gap-2 mt-4"><button className="btn btn-primary" disabled={!items.length} onClick={() => m.play(items, 0)}><Icon name="play" size={15} fill />Tocar</button><button className="btn btn-ghost" disabled={!items.length} onClick={() => { m.setShuffle(true); m.play(items, Math.floor(Math.random() * items.length)); }}><Icon name="shuffle" size={15} />Aleatório</button>
            {data.owner && <><button className={`btn btn-ghost btn-icon ${pl.favorite ? "!text-[var(--red2)]" : ""}`} onClick={() => patch({ favorite: !pl.favorite })} aria-label="Favoritar"><Icon name="star" size={16} fill={pl.favorite} /></button>
              <button className="btn btn-ghost" onClick={() => patch({ isPublic: !pl.isPublic })}><Icon name="globe" size={15} />{pl.isPublic ? "Tornar privada" : "Tornar pública"}</button>
              {pl.isPublic && pl.shareSlug && <button className="btn btn-ghost" onClick={() => { navigator.clipboard.writeText(`${location.origin}/music?pl=${pl.shareSlug}`); toast("Link copiado", "ok"); }}><Icon name="share" size={15} />Compartilhar</button>}
              <button className="btn btn-ghost" onClick={async () => { const r = await api<{ playlist: { id: string } }>(`/api/music/playlists/${id}`, { body: { op: "duplicate" } }); toast("Duplicada.", "ok"); onChanged(); onBack(); void r; }}><Icon name="copy" size={15} />Duplicar</button>
              <button className="btn btn-ghost !text-[var(--red2)]" onClick={async () => { if (!confirm("Excluir esta playlist?")) return; await api(`/api/music/playlists/${id}`, { method: "DELETE" }); onChanged(); onBack(); }}><Icon name="trash" size={15} /></button></>}</div></div>
      </div>
      <div className="flex gap-2 mt-6"><div className="relative flex-1"><Icon name="search" size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--muted)]" /><input className="input !h-10 !pl-9 !text-sm" placeholder="Buscar na playlist" value={q} onChange={(e) => setQ(e.target.value)} /></div><select className="input !w-auto !h-10 !text-sm" value={sort} onChange={(e) => setSort(e.target.value)}><option value="custom">Ordem personalizada</option><option value="name">Nome</option></select></div>
      <div className="mt-3">{shown.length === 0 ? <Empty icon="music" title="Playlist vazia" text="Busque músicas e use + para adicionar." /> : shown.map((t, i) => (
        <div key={t.videoId} draggable={data.owner && sort === "custom" && !q} onDragStart={() => (drag.current = items.indexOf(t))} onDragOver={(e) => e.preventDefault()} onDrop={() => drop(items.indexOf(t))}>
          <TrackRow t={t} list={shown} i={i} onAdd={onAdd} extra={data.owner ? <button className="btn btn-ghost btn-icon !w-9 !h-9" aria-label="Remover" onClick={async () => { await api(`/api/music/playlists/${id}`, { body: { op: "remove", videoId: t.videoId } }); setItems(items.filter((x) => x.videoId !== t.videoId)); onChanged(); }}><Icon name="trash" size={14} /></button> : null} />
        </div>))}</div>
      {data.owner && sort === "custom" && !q && items.length > 1 && <p className="text-[11px] text-[var(--muted)] mt-2">Arraste as faixas para reorganizar — salvo automaticamente.</p>}
    </div>
  );
}

function ImportModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const { toast } = useApp();
  const [tab, setTab] = useState<"yt" | "file" | "sp">("yt");
  const [url, setUrl] = useState("");
  const [tracks, setTracks] = useState<Track[]>([]);
  const [next, setNext] = useState<string | null>(null);
  const [skipped, setSkipped] = useState(0);
  const [dups, setDups] = useState(0);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const sp = useFetch<{ configured: boolean; connected: boolean }>(tab === "sp" ? "/api/music/spotify/status" : null, [tab]);
  const [spl, setSpl] = useState<{ id: string; name: string; total: number }[] | null>(null);
  const [spt, setSpt] = useState<{ title: string; artist: string }[]>([]);
  const merge = (add: Track[]) => setTracks((cur) => { const seen = new Set(cur.map((t) => t.videoId)); const fresh = add.filter((t) => !seen.has(t.videoId)); setDups((d) => d + add.length - fresh.length); return [...cur, ...fresh]; });
  const load = async (more: boolean) => { setBusy(true); setMsg(""); try { const r = await api<{ tracks: Track[]; skipped: number; nextPageToken: string | null }>("/api/music/import-youtube", { body: { url, pageToken: more ? next : undefined } }); if (!more) { setTracks([]); setDups(0); setSkipped(0); } merge(r.tracks); setSkipped((s) => s + r.skipped); setNext(r.nextPageToken); } catch (e) { setMsg((e as Error).message); } finally { setBusy(false); } };
  const onFile = (f: File) => { const r = new FileReader(); r.onload = () => { try { const j = JSON.parse(String(r.result)); const arr = Array.isArray(j) ? j : j.tracks; if (!Array.isArray(arr)) throw new Error(); const ok = arr.filter((t: Track) => t && typeof t.videoId === "string" && /^[\w-]{6,20}$/.test(t.videoId) && typeof t.title === "string"); setTracks([]); setDups(0); merge(ok.map((t: Track) => ({ videoId: t.videoId, title: t.title, artist: t.artist ?? "", thumbnail: t.thumbnail ?? null, durationSec: t.durationSec ?? null }))); setSkipped(arr.length - ok.length); setMsg(ok.length ? "" : "Nenhuma faixa válida (esperado: [{videoId,title,artist}])."); if (!name) setName(f.name.replace(/\.json$/i, "")); } catch { setMsg("Arquivo JSON inválido."); } }; r.readAsText(f); };
  const save = async () => { setBusy(true); try { const r = await api<{ added: number }>("/api/music/playlists", { body: { name: name || "Playlist importada", tracks } }); toast(`${r.added} faixas importadas.`, "ok"); onDone(); onClose(); } catch (e) { setMsg((e as Error).message); } finally { setBusy(false); } };
  return (
    <Modal onClose={onClose} wide><h3 className="font-bold text-xl mb-4 pr-10">Importar playlist</h3>
      <div className="flex gap-2 mb-5">{([["yt", "YouTube"], ["file", "Arquivo JSON"], ["sp", "Spotify"]] as const).map(([k, l]) => <button key={k} className={`chip !text-sm !px-4 !py-2 ${tab === k ? "on" : ""}`} onClick={() => setTab(k)}>{l}</button>)}</div>
      {tab === "yt" && <div className="flex gap-2"><input className="input" placeholder="https://www.youtube.com/playlist?list=…" value={url} onChange={(e) => setUrl(e.target.value)} /><button className="btn btn-primary" disabled={busy || !url} onClick={() => load(false)}>{busy ? <Spinner size={16} /> : "Prévia"}</button></div>}
      {tab === "file" && <label className="panel p-6 text-center block cursor-pointer hover:bg-white/5"><Icon name="upload" className="mx-auto mb-2" /><span className="text-sm">Selecionar arquivo .json</span><input type="file" accept="application/json,.json" hidden onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} /></label>}
      {tab === "sp" && <div className="text-sm">{!sp.data ? <Spinner /> : !sp.data.configured ? <p className="text-[var(--muted)]">O Spotify não está configurado (SPOTIFY_CLIENT_ID/SECRET). Alternativas: importe pelo YouTube, por arquivo JSON ou crie manualmente.</p> : !sp.data.connected ? <a href="/api/music/spotify/login" className="btn btn-primary">Conectar com Spotify (OAuth)</a> : <div><p className="text-[var(--muted)] mb-3">Importamos apenas metadados autorizados pela API do Spotify. Não há sincronização automática com o YouTube — use a lista para buscar faixas manualmente.</p>{!spl ? <button className="btn btn-ghost" onClick={() => api<{ playlists: { id: string; name: string; total: number }[] }>("/api/music/spotify/playlists").then((d) => setSpl(d.playlists)).catch((e) => setMsg(e.message))}>Listar minhas playlists</button> : <div className="flex flex-wrap gap-2">{spl.map((p) => <button key={p.id} className="chip" onClick={() => api<{ tracks: { title: string; artist: string }[] }>(`/api/music/spotify/tracks?id=${p.id}`).then((d) => setSpt(d.tracks)).catch((e) => setMsg(e.message))}>{p.name} ({p.total})</button>)}</div>}{spt.length > 0 && <div className="panel mt-3 max-h-56 overflow-y-auto p-2">{spt.map((t, i) => <a key={i} href={`/music?q=${encodeURIComponent(`${t.artist} ${t.title}`)}`} className="flex justify-between gap-3 px-3 py-2 rounded-lg hover:bg-white/5 text-xs"><span className="truncate">{t.title} — {t.artist}</span><span className="text-[var(--red2)] flex-none">Buscar</span></a>)}</div>}</div>}</div>}
      {msg && <div className="mt-4 text-sm rounded-xl bg-red-600/15 text-red-300 p-3" role="alert">{msg}</div>}
      {tab !== "sp" && tracks.length > 0 && <>
        <div className="flex flex-wrap gap-3 text-xs text-[var(--muted)] mt-5"><span>{tracks.length} faixas na prévia</span>{dups > 0 && <span>· {dups} duplicadas ignoradas</span>}{skipped > 0 && <span className="text-amber-400">· {skipped} indisponíveis/privadas/não incorporáveis</span>}</div>
        <div className="panel mt-2 max-h-52 overflow-y-auto p-1.5">{tracks.slice(0, 80).map((t) => <div key={t.videoId} className="flex items-center gap-3 px-2 py-1.5 text-xs"><Img src={t.thumbnail} alt="" className="w-9 h-9 rounded object-cover" /><span className="truncate flex-1">{t.title}</span><span className="text-[var(--muted)]">{t.artist}</span></div>)}</div>
        <div className="flex gap-2 mt-4 flex-wrap">{tab === "yt" && next && <button className="btn btn-ghost" disabled={busy} onClick={() => load(true)}>Carregar mais</button>}<input className="input !w-56 !h-11" placeholder="Nome da playlist" value={name} onChange={(e) => setName(e.target.value)} /><button className="btn btn-primary" disabled={busy} onClick={save}>{busy ? <Spinner size={16} /> : `Importar ${tracks.length} faixas`}</button></div></>}
    </Modal>
  );
}

function Music() {
  const sp = useSearchParams();
  const { toast } = useApp();
  const m = useMusic();
  const prefs = useFetch<{ prefs: Prefs }>("/api/music/prefs");
  const [p, setP] = useState<Prefs | null>(null);
  const [tab, setTab] = useState<"home" | "library">(sp.get("pl") ? "library" : "home");
  const [q, setQ] = useState(sp.get("q") ?? "");
  const [res, setRes] = useState<{ tracks: Track[]; nextPageToken: string | null } | null>(null);
  const [sErr, setSErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState<Track | null>(null);
  const [openPl, setOpenPl] = useState<string | null>(sp.get("pl"));
  const [imp, setImp] = useState(false);
  const [newName, setNewName] = useState("");
  useEffect(() => { if (prefs.data) setP(prefs.data.prefs); }, [prefs.data]);
  const disc = useFetch<{ sections: { id: string; title: string; tracks: Track[] }[]; error: string | null }>(p?.completed ? "/api/music/discover" : null, [p?.completed]);
  const lib = useFetch<Lib>(p?.completed ? "/api/music/library" : null, [p?.completed]);
  const search = useCallback(async (text: string, page?: string) => { if (text.trim().length < 2) { setRes(null); setSErr(null); return; } setBusy(true); try { const r = await api<{ tracks: Track[]; nextPageToken: string | null }>(`/api/music/search?q=${encodeURIComponent(text.trim())}${page ? `&page=${page}` : ""}`); setRes((c) => (page && c ? { tracks: [...c.tracks, ...r.tracks], nextPageToken: r.nextPageToken } : r)); setSErr(null); } catch (e) { setSErr((e as Error).message); setRes(null); } finally { setBusy(false); } }, []);
  useEffect(() => { const id = setTimeout(() => search(q), 450); return () => clearTimeout(id); }, [q, search]);

  if (prefs.error) return <div className="p-6 pt-24"><ErrorBox message={prefs.error.message} onRetry={prefs.reload} /></div>;
  if (!p) return <div className="p-8"><Skeleton className="h-64" /></div>;
  if (!p.completed) return <Onboarding initial={p} onDone={(np) => { setP(np); disc.reload(); }} />;
  const sq = p.mode === "spotify-inspired";
  return (
    <div className="px-4 sm:px-8 lg:px-10 pb-32 pt-8">
      <div className="flex flex-wrap items-center gap-3 page-enter"><h1 className="text-3xl sm:text-4xl h-display flex-1 min-w-[200px]">Diplo<span className="text-[var(--red)]">Music</span></h1>
        <div className="relative w-full sm:w-96"><Icon name="search" size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--muted)]" /><input className="input !pl-10" placeholder="Músicas, artistas, álbuns…" value={q} onChange={(e) => setQ(e.target.value)} />{busy && <span className="absolute right-4 top-1/2 -translate-y-1/2"><Spinner size={16} /></span>}</div></div>
      <div className="flex gap-2 mt-5 items-center"><button className={`chip !text-sm !px-4 !py-2 ${tab === "home" ? "on" : ""}`} onClick={() => { setTab("home"); setOpenPl(null); }}>Início</button><button className={`chip !text-sm !px-4 !py-2 ${tab === "library" ? "on" : ""}`} onClick={() => setTab("library")}>Biblioteca</button><span className="flex-1" />
        <button className="chip" onClick={async () => { const mode = sq ? "youtube" : "spotify-inspired"; setP({ ...p, mode }); await api("/api/music/prefs", { body: { ...p, mode } }).catch(() => {}); }}>{sq ? "Visual: Spotify-inspired" : "Visual: YouTube"}</button>
        <button className="chip" onClick={() => setP({ ...p, completed: false })}>Refazer gostos</button></div>

      {sErr && <div className="mt-6"><ErrorBox message={sErr} onRetry={() => search(q)} /></div>}
      {q.trim().length >= 2 && res ? (
        <section className="mt-6"><div className="eyebrow mb-3">Resultados · YouTube</div>{res.tracks.length ? <div className="panel p-1.5">{res.tracks.map((t, i) => <TrackRow key={t.videoId} t={t} list={res.tracks} i={i} onAdd={setAdding} />)}</div> : <Empty icon="music" title="Nada encontrado" />}{res.nextPageToken && <div className="flex justify-center mt-4"><button className="btn btn-ghost" disabled={busy} onClick={() => search(q, res.nextPageToken!)}>Carregar mais</button></div>}</section>
      ) : tab === "home" ? (
        <div className="mt-2">
          {disc.loading && <div className="mt-8"><Skeleton className="h-40" /></div>}
          {disc.data?.error && <div className="mt-6"><ErrorBox message={disc.data.error} onRetry={disc.reload} /></div>}
          {disc.data?.sections.map((s) => (
            <section key={s.id} className="mt-8"><h2 className="text-xl font-bold px-1">{s.title}</h2>
              <Rail>{s.tracks.map((t, i) => <button key={t.videoId} className="flex-none text-left group" style={{ width: sq ? 160 : 260 }} onClick={() => m.play(s.tracks, i)}><span className="card block" style={{ aspectRatio: sq ? "1" : "16/9" }}><Img src={t.thumbnail} alt={t.title} className="w-full h-full object-cover" style={sq ? { objectPosition: "center" } : undefined} /><span className="absolute right-2 bottom-2 w-10 h-10 rounded-full bg-[var(--red)] grid place-items-center opacity-0 translate-y-2 group-hover:opacity-100 group-hover:translate-y-0 transition"><Icon name="play" size={16} fill /></span></span><span className="block text-sm font-semibold mt-2 truncate">{t.title}</span><span className="block text-xs text-[var(--muted)] truncate">{t.artist}</span></button>)}</Rail></section>))}
          {lib.data && lib.data.playlists.length > 0 && <section className="mt-8"><h2 className="text-xl font-bold px-1">Playlists recentes</h2><Rail>{lib.data.playlists.slice(0, 10).map((pl) => <button key={pl.id} className="flex-none w-40 text-left" onClick={() => { setTab("library"); setOpenPl(pl.id); }}><span className="card block" style={{ aspectRatio: "1" }}><Img src={pl.cover_url || pl.thumb} alt="" className="w-full h-full object-cover" /></span><span className="block text-sm font-semibold mt-2 truncate">{pl.name}</span><span className="block text-xs text-[var(--muted)]">{pl.tracks} faixas</span></button>)}</Rail></section>}
          {disc.data && !disc.data.sections.length && !disc.data.error && <Empty icon="music" title="Sem recomendações ainda" text="Pesquise músicas para começar." />}
        </div>
      ) : openPl ? <div className="mt-6"><PlaylistView id={openPl} onBack={() => setOpenPl(null)} onChanged={lib.reload} onAdd={setAdding} /></div> : (
        <div className="mt-6">
          <div className="flex flex-wrap gap-2 mb-5"><input className="input !w-56 !h-11" placeholder="Nova playlist…" value={newName} onChange={(e) => setNewName(e.target.value)} /><button className="btn btn-primary" disabled={!newName.trim()} onClick={async () => { try { const r = await api<{ playlist: { id: string } }>("/api/music/playlists", { body: { name: newName } }); setNewName(""); lib.reload(); setOpenPl(r.playlist.id); } catch (e) { toast((e as Error).message, "err"); } }}><Icon name="plus" size={15} />Criar</button><button className="btn btn-ghost" onClick={() => setImp(true)}><Icon name="download" size={15} />Importar</button></div>
          {lib.loading && <Skeleton className="h-40" />}
          {lib.data && <>
            <div className="grid gap-4 stagger" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(160px,1fr))" }}>{lib.data.playlists.map((pl) => <button key={pl.id} className="text-left" onClick={() => setOpenPl(pl.id)}><span className="card block" style={{ aspectRatio: "1" }}><Img src={pl.cover_url || pl.thumb} alt="" className="w-full h-full object-cover" />{pl.favorite && <Icon name="star" size={14} fill className="absolute top-2 right-2 text-yellow-400" />}</span><span className="block text-sm font-semibold mt-2 truncate">{pl.name}</span><span className="block text-xs text-[var(--muted)]">{pl.tracks} faixas{pl.duration ? ` · ${Math.round(pl.duration / 60)} min` : ""}</span></button>)}</div>
            {!lib.data.playlists.length && <Empty icon="music" title="Nenhuma playlist" text="Crie, importe do YouTube ou de um arquivo JSON." />}
            {lib.data.likes.length > 0 && <section className="mt-10"><div className="eyebrow mb-3">Curtidas</div><div className="panel p-1.5">{lib.data.likes.slice(0, 50).map((t, i) => <TrackRow key={t.videoId} t={t} list={lib.data!.likes} i={i} onAdd={setAdding} />)}</div></section>}
            {lib.data.history.length > 0 && <section className="mt-10"><div className="eyebrow mb-3">Histórico</div><div className="panel p-1.5">{lib.data.history.slice(0, 20).map((t, i) => <TrackRow key={t.videoId + i} t={t} list={lib.data!.history} i={i} onAdd={setAdding} />)}</div></section>}
          </>}
        </div>
      )}
      <p className="text-[10px] text-[var(--muted)] mt-12">Reprodução pelo player oficial do YouTube (IFrame). Letras: LRCLIB. Artistas: Deezer. O DiploMusic não baixa, converte nem oculta mídia.</p>
      {adding && <AddToPlaylist track={adding} onClose={() => { setAdding(null); lib.reload(); }} />}
      {imp && <ImportModal onClose={() => setImp(false)} onDone={lib.reload} />}
    </div>
  );
}
export default function Page() { return <Suspense><Music /></Suspense>; }
