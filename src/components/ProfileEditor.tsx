"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { api, img, useFetch } from "@/lib/client/api";
import { GENRES } from "@/lib/genres";
import { useApp, type Profile } from "./AppProvider";
import { Icon } from "./Icon";
import { Avatar, Img, Spinner, type CardT } from "./ui";

type AvatarSel = { avatarId: string | null; avatarUrl: string | null; avatarGradient: string | null; name?: string };
type Col = { id: string; name: string; avatars: { id: string; name: string; imageUrl: string | null; gradient: string }[] };

export function AvatarPicker({ value, onChange, profile }: { value: AvatarSel; onChange: (v: AvatarSel) => void; profile?: Profile | null }) {
  const { data } = useFetch<{ collections: Col[] }>("/api/profiles?avatars=1");
  const [q, setQ] = useState("");
  const [favs, setFavs] = useState<string[]>(profile?.favoriteAvatarIds ?? []);
  const [crop, setCrop] = useState<string | null>(null);
  const cols = useMemo(() => {
    const n = q.trim().toLowerCase();
    if (!data) return [];
    const base = !n ? data.collections : data.collections.map((c) => (c.name.toLowerCase().includes(n) ? c : { ...c, avatars: c.avatars.filter((a) => a.name.toLowerCase().includes(n)) })).filter((c) => c.avatars.length);
    const all = data.collections.flatMap((c) => c.avatars);
    const fv = all.filter((a) => favs.includes(a.id));
    return !n && fv.length ? [{ id: "fav", name: "★ Favoritos", avatars: fv }, ...base] : base;
  }, [data, q, favs]);
  const toggleFav = (id: string) => {
    const n = favs.includes(id) ? favs.filter((x) => x !== id) : [...favs, id];
    setFavs(n);
    if (profile) api(`/api/profiles/${profile.id}`, { method: "PATCH", body: { favoriteAvatarIds: n } }).catch(() => {});
  };
  return (
    <div>
      <div className="flex items-center gap-4 mb-4">
        <div className="scale-in" key={(value.avatarId ?? "") + (value.avatarUrl ?? "")}><Avatar p={{ name: value.name || "?", avatarUrl: value.avatarUrl, avatarGradient: value.avatarGradient }} size={84} ring /></div>
        <div className="flex-1 min-w-0">
          <div className="text-xs text-[var(--muted)] mb-1.5">Prévia do avatar</div>
          <div className="relative"><Icon name="search" size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--muted)]" /><input className="input !h-10 !pl-9 !text-sm" placeholder="Buscar obra ou personagem…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        </div>
        <label className="btn btn-ghost btn-sm cursor-pointer"><Icon name="upload" size={14} />Foto<input type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => { const f = e.target.files?.[0]; if (!f) return; if (f.size > 5_000_000) return alert("Arquivo muito grande (máx. 5 MB)."); const r = new FileReader(); r.onload = () => setCrop(r.result as string); r.readAsDataURL(f); e.target.value = ""; }} /></label>
      </div>
      {!data ? <div className="grid place-items-center p-8"><Spinner /></div> : (
        <div className="max-h-[300px] overflow-y-auto pr-1 -mr-1">
          {cols.map((c) => (
            <div key={c.id} className="mb-3">
              <div className="eyebrow !text-[10px] mb-2">{c.name}</div>
              <div className="flex gap-3 overflow-x-auto no-scrollbar pb-1">
                {c.avatars.map((a) => {
                  const on = value.avatarId === a.id;
                  return (
                    <div key={a.id} className="relative flex-none group/av">
                      <button type="button" onClick={() => onChange({ avatarId: a.id, avatarUrl: a.imageUrl, avatarGradient: a.gradient, name: value.name })} className="flex flex-col items-center gap-1.5 w-16" aria-label={a.name} aria-pressed={on}>
                        <span className="transition-transform group-hover/av:scale-110" style={{ transform: on ? "scale(1.1)" : undefined }}><Avatar p={{ name: a.name, avatarUrl: a.imageUrl, avatarGradient: a.gradient }} size={56} ring={on} /></span>
                        <span className="text-[10px] text-[var(--muted)] truncate w-full text-center">{a.name}</span>
                      </button>
                      <button type="button" onClick={() => toggleFav(a.id)} aria-label="Favoritar avatar" className="absolute -top-1 -right-0 w-5 h-5 rounded-full bg-black/70 grid place-items-center"><Icon name="star" size={11} fill={favs.includes(a.id)} style={{ color: favs.includes(a.id) ? "#facc15" : "#888" }} /></button>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
          {!cols.length && <p className="text-sm text-[var(--muted)] p-4 text-center">Nada encontrado. Envie sua própria foto ou use as iniciais.</p>}
        </div>
      )}
      {profile && profile.avatarUrl === null && null}
      {crop && <Cropper src={crop} onCancel={() => setCrop(null)} onDone={(url) => { onChange({ avatarId: null, avatarUrl: url, avatarGradient: null, name: value.name }); setCrop(null); }} />}
    </div>
  );
}

function Cropper({ src, onCancel, onDone }: { src: string; onCancel: () => void; onDone: (url: string) => void }) {
  const [zoom, setZoom] = useState(1);
  const [ox, setOx] = useState(0);
  const [oy, setOy] = useState(0);
  const im = useRef<HTMLImageElement | null>(null);
  const cv = useRef<HTMLCanvasElement>(null);
  const draw = () => {
    const c = cv.current, i = im.current; if (!c || !i) return;
    const S = 256, ctx = c.getContext("2d")!; c.width = c.height = S;
    const base = Math.max(S / i.width, S / i.height) * zoom;
    const w = i.width * base, h = i.height * base;
    ctx.fillStyle = "#000"; ctx.fillRect(0, 0, S, S);
    ctx.drawImage(i, (S - w) / 2 + ox * (w - S) / 2, (S - h) / 2 + oy * (h - S) / 2, w, h);
  };
  useEffect(() => { const i = new Image(); i.onload = () => { im.current = i; draw(); }; i.src = src; }, [src]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(draw); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="modal-back !z-[110]"><div className="modal panel !bg-[#101015] p-5 !max-w-[360px]">
      <div className="font-bold mb-3">Enquadrar foto</div>
      <canvas ref={cv} className="w-48 h-48 rounded-full mx-auto block" style={{ boxShadow: "0 0 0 2px #E50914, 0 0 30px rgba(229,9,20,.5)" }} />
      <div className="mt-4 space-y-3 text-xs text-[var(--muted)]">
        <label className="block">Zoom<input type="range" min={1} max={3} step={0.01} value={zoom} onChange={(e) => setZoom(+e.target.value)} className="w-full mt-1" /></label>
        <label className="block">Horizontal<input type="range" min={-1} max={1} step={0.01} value={ox} onChange={(e) => setOx(+e.target.value)} className="w-full mt-1" /></label>
        <label className="block">Vertical<input type="range" min={-1} max={1} step={0.01} value={oy} onChange={(e) => setOy(+e.target.value)} className="w-full mt-1" /></label>
      </div>
      <div className="flex gap-2 mt-5"><button className="btn btn-ghost flex-1" onClick={onCancel}>Cancelar</button><button className="btn btn-primary flex-1" onClick={() => onDone(cv.current!.toDataURL("image/jpeg", 0.85))}>Usar foto</button></div>
    </div></div>
  );
}

export function GenrePicker({ value, onChange }: { value: number[]; onChange: (v: number[]) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {GENRES.map((g) => (
        <button type="button" key={g.id} className={`chip !text-sm !px-4 !py-2 ${value.includes(g.id) ? "on" : ""}`} onClick={() => onChange(value.includes(g.id) ? value.filter((x) => x !== g.id) : [...value, g.id])} aria-pressed={value.includes(g.id)}>{value.includes(g.id) && <Icon name="check" size={13} />}{g.pt}</button>
      ))}
    </div>
  );
}

type Fav = { id: number; type: string; title: string; poster: string | null };
export function TitlePicker({ value, onChange }: { value: Fav[]; onChange: (v: Fav[]) => void }) {
  const [q, setQ] = useState("");
  const [res, setRes] = useState<CardT[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  useEffect(() => {
    if (q.trim().length < 2) { setRes([]); setErr(""); return; }
    setBusy(true);
    const id = setTimeout(() => api<{ items: CardT[] }>(`/api/discover?q=${encodeURIComponent(q.trim())}`).then((d) => { setRes(d.items.slice(0, 12)); setErr(""); }).catch((e) => setErr(e.message)).finally(() => setBusy(false)), 300);
    return () => clearTimeout(id);
  }, [q]);
  return (
    <div>
      <div className="relative"><Icon name="search" size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--muted)]" /><input className="input !pl-10" placeholder="Pesquise filmes ou séries favoritos…" value={q} onChange={(e) => setQ(e.target.value)} />{busy && <span className="absolute right-4 top-1/2 -translate-y-1/2"><Spinner size={16} /></span>}</div>
      {err && <p className="text-xs text-[var(--red2)] mt-2">{err}</p>}
      {res.length > 0 && <div className="flex gap-2.5 overflow-x-auto no-scrollbar mt-3 pb-1">{res.map((r) => { const on = value.some((v) => v.id === r.id && v.type === r.type); return (
        <button type="button" key={r.type + r.id} onClick={() => onChange(on ? value.filter((v) => !(v.id === r.id && v.type === r.type)) : [...value, { id: r.id, type: r.type, title: r.title, poster: r.poster }].slice(0, 12))} className="flex-none w-24 relative" aria-pressed={on}>
          <div className="card" style={{ aspectRatio: "2/3", outline: on ? "2px solid #E50914" : undefined }}><Img src={img(r.poster, "w185")} alt={r.title} className="w-full h-full object-cover" />{on && <span className="absolute inset-0 bg-red-600/40 grid place-items-center"><Icon name="check" /></span>}</div>
          <div className="text-[11px] mt-1 truncate text-left">{r.title}</div></button>); })}</div>}
      {value.length > 0 && <div className="flex flex-wrap gap-2 mt-3">{value.map((v) => <span key={v.type + v.id} className="chip on">{v.title}<button type="button" onClick={() => onChange(value.filter((x) => x !== v))} aria-label="Remover"><Icon name="x" size={12} /></button></span>)}</div>}
    </div>
  );
}

/** Profile form used for creation (first-run wizard) and editing. */
export function ProfileForm({ initial, onSaved, onCancel, wizard = false, submitLabel = "Salvar" }: { initial?: Profile | null; onSaved: (p: Profile) => void; onCancel?: () => void; wizard?: boolean; submitLabel?: string }) {
  const { toast } = useApp();
  const [step, setStep] = useState(0);
  const [name, setName] = useState(initial?.name ?? "");
  const [av, setAv] = useState<AvatarSel>({ avatarId: initial?.avatarId ?? null, avatarUrl: initial?.avatarUrl ?? null, avatarGradient: initial?.avatarGradient ?? null });
  const [pin, setPin] = useState("");
  const [curPin, setCurPin] = useState("");
  const [removePin, setRemovePin] = useState(false);
  const [genres, setGenres] = useState<number[]>(initial?.favoriteGenres ?? []);
  const [titles, setTitles] = useState<Fav[]>(initial?.favoriteTitles ?? []);
  const [busy, setBusy] = useState(false);
  const steps = wizard ? 2 : 1;

  const save = async () => {
    if (name.trim().length < 2) { setStep(0); return toast("Informe um nome de exibição.", "err"); }
    if (pin && !/^\d{4}$/.test(pin)) { setStep(0); return toast("O PIN deve ter 4 dígitos.", "err"); }
    setBusy(true);
    try {
      const payload: Record<string, unknown> = { name, ...av, favoriteGenres: genres, favoriteTitles: titles };
      let r: { profile: Profile };
      if (initial) {
        if (pin) { payload.pin = pin; payload.currentPin = curPin; } else if (removePin) { payload.pin = null; payload.currentPin = curPin; }
        r = await api(`/api/profiles/${initial.id}`, { method: "PATCH", body: payload });
      } else { if (pin) payload.pin = pin; r = await api("/api/profiles", { body: payload }); }
      onSaved(r.profile);
    } catch (e) { toast((e as Error).message, "err"); } finally { setBusy(false); }
  };

  return (
    <div className="fade-in">
      {steps > 1 && <div className="flex gap-1.5 mb-5">{Array.from({ length: steps }).map((_, i) => <i key={i} className="flex-1 h-1 rounded-full" style={{ background: i <= step ? "#E50914" : "rgba(255,255,255,.14)", transition: "background .4s" }} />)}</div>}
      {step === 0 && (
        <div className="space-y-5">
          <label className="block"><span className="text-xs font-semibold text-[var(--muted)]">Nome de exibição</span><input className="input mt-1.5" maxLength={24} value={name} onChange={(e) => { setName(e.target.value); setAv((a) => ({ ...a, name: e.target.value })); }} placeholder="Ex.: Ana" autoFocus /></label>
          <AvatarPicker value={{ ...av, name }} onChange={setAv} profile={initial} />
          <div>
            <span className="text-xs font-semibold text-[var(--muted)] flex items-center gap-1.5"><Icon name="lock" size={13} />PIN opcional (4 dígitos){initial?.hasPin && " — este perfil já tem PIN"}</span>
            <div className="flex gap-2 mt-1.5">
              {initial?.hasPin && <input className="input !w-32 tracking-[.4em] text-center" inputMode="numeric" maxLength={4} placeholder="Atual" type="password" value={curPin} onChange={(e) => setCurPin(e.target.value.replace(/\D/g, ""))} />}
              <input className="input !w-32 tracking-[.4em] text-center" inputMode="numeric" maxLength={4} placeholder={initial?.hasPin ? "Novo" : "••••"} type="password" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} />
              {initial?.hasPin && <label className="flex items-center gap-2 text-xs text-[var(--muted)]"><input type="checkbox" checked={removePin} onChange={(e) => setRemovePin(e.target.checked)} />Remover PIN</label>}
            </div>
          </div>
        </div>
      )}
      {step === 1 && wizard && (
        <div className="space-y-6">
          <div><div className="font-bold mb-1">Do que você gosta?</div><p className="text-xs text-[var(--muted)] mb-3">Usamos isso para personalizar seu catálogo.</p><GenrePicker value={genres} onChange={setGenres} /></div>
          <div><div className="font-bold mb-3">Filmes ou séries favoritos <span className="text-[var(--muted)] font-normal text-xs">(opcional)</span></div><TitlePicker value={titles} onChange={setTitles} /></div>
        </div>
      )}
      {!wizard && (
        <div className="space-y-5 mt-5">
          <div><div className="text-xs font-semibold text-[var(--muted)] mb-2">Gêneros favoritos</div><GenrePicker value={genres} onChange={setGenres} /></div>
        </div>
      )}
      <div className="flex items-center gap-2 mt-7">
        {onCancel && step === 0 && <button className="btn btn-ghost" onClick={onCancel}>Cancelar</button>}
        {step > 0 && <button className="btn btn-ghost" onClick={() => setStep(step - 1)}>Voltar</button>}
        <span className="flex-1" />
        {wizard && step === 0 ? <button className="btn btn-primary" onClick={() => (name.trim().length < 2 ? toast("Informe um nome de exibição.", "err") : setStep(1))}>Continuar<Icon name="chevR" size={16} /></button>
          : <button className="btn btn-primary" disabled={busy} onClick={save}>{busy ? <Spinner size={16} /> : submitLabel}</button>}
      </div>
    </div>
  );
}
