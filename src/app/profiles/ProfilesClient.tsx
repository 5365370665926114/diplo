"use client";
import { useCallback, useEffect, useState } from "react";
import { AppProvider, useApp, type Profile } from "@/components/AppProvider";
import { Icon } from "@/components/Icon";
import { ProfileForm } from "@/components/ProfileEditor";
import { Avatar, Modal, Spinner } from "@/components/ui";
import { api } from "@/lib/client/api";

export default function ProfilesClient() {
  return <AppProvider><Inner /></AppProvider>;
}

function Inner() {
  const { me, t, toast } = useApp();
  const [list, setList] = useState<Profile[] | null>(null);
  const [max, setMax] = useState(5);
  const [manage, setManage] = useState(false);
  const [editing, setEditing] = useState<Profile | "new" | null>(null);
  const [pinFor, setPinFor] = useState<Profile | null>(null);
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [leaving, setLeaving] = useState<string | null>(null);

  const load = useCallback(async () => { const d = await api<{ profiles: Profile[]; max: number }>("/api/profiles"); setList(d.profiles); setMax(d.max); }, []);
  useEffect(() => { load().catch(() => {}); }, [load]);

  const enter = async (p: Profile, pinValue?: string) => {
    setBusy(p.id);
    try {
      await api(`/api/profiles/${p.id}/select`, { body: { pin: pinValue } });
      setLeaving(p.id);
      setTimeout(() => { location.href = "/"; }, 650);
    } catch (e) { toast((e as Error).message, "err"); setPin(""); setBusy(null); }
  };
  const pick = (p: Profile) => (manage ? setEditing(p) : p.hasPin ? (setPinFor(p), setPin("")) : enter(p));
  const logout = async () => { await api("/api/auth/logout", { body: {} }).catch(() => {}); location.href = "/welcome"; };

  if (!list) return <div className="min-h-dvh grid place-items-center"><Spinner size={30} /></div>;

  if (list.length === 0 || editing === "new" && list.length === 0)
    return (
      <div className="min-h-dvh px-4 py-10 grid place-items-center">
        <div className="w-full max-w-xl page-enter">
          <div className="text-center mb-6"><div className="eyebrow justify-center mb-2">Primeiro perfil</div><h1 className="text-3xl h-display">Vamos criar o seu perfil</h1><p className="text-sm text-[var(--muted)] mt-2">Olá, {me?.user.name}! Escolha um nome, avatar e seus gostos.</p></div>
          <div className="panel p-5 sm:p-6"><ProfileForm wizard submitLabel="Concluir e entrar" onSaved={(p) => enter(p)} /></div>
        </div>
      </div>
    );

  return (
    <div className="min-h-dvh relative grid place-items-center px-4 py-10 overflow-hidden">
      <div className="absolute inset-0 pointer-events-none" style={{ background: "radial-gradient(circle at 50% 45%, rgba(229,9,20,.14), transparent 55%)" }} />
      <div className="relative w-full max-w-4xl text-center">
        <h1 className="text-2xl sm:text-4xl font-extrabold tracking-[.14em] uppercase page-enter">{manage ? "Gerenciar perfis" : t("watching")}</h1>
        <div className="mt-10 sm:mt-14 flex flex-wrap justify-center gap-6 sm:gap-10 stagger">
          {list.map((p) => (
            <button key={p.id} onClick={() => pick(p)} className="group w-[110px] sm:w-[150px] text-center" aria-label={p.name} style={leaving && leaving !== p.id ? { opacity: 0, transition: "opacity .5s" } : leaving === p.id ? { transform: "scale(1.25)", transition: "transform .65s var(--ease)" } : undefined}>
              <span className="relative block mx-auto rounded-full transition-all duration-300 group-hover:scale-110 group-focus-visible:scale-110" style={{ width: "100%", aspectRatio: "1" }}>
                <span className="absolute -inset-1 rounded-full opacity-0 group-hover:opacity-100 transition" style={{ boxShadow: "0 0 0 3px #E50914, 0 0 36px rgba(255,24,56,.7)" }} />
                <span className="block w-full h-full rounded-full overflow-hidden"><Avatar p={p} size={150} /></span>
                {busy === p.id && <span className="absolute inset-0 grid place-items-center rounded-full bg-black/60"><Spinner /></span>}
                {manage && <span className="absolute inset-0 rounded-full bg-black/55 grid place-items-center"><Icon name="edit" size={26} /></span>}
                {p.hasPin && !manage && <span className="absolute bottom-1 right-1 w-8 h-8 rounded-full bg-black/80 grid place-items-center border border-white/20"><Icon name="lock" size={14} /></span>}
              </span>
              <span className="block mt-4 text-sm sm:text-base font-semibold text-white/70 group-hover:text-white transition truncate">{p.name}</span>
            </button>
          ))}
          {list.length < max && (
            <button onClick={() => setEditing("new")} className="group w-[110px] sm:w-[150px]" aria-label="Adicionar perfil">
              <span className="block mx-auto rounded-full border-2 border-dashed border-white/25 grid place-items-center transition group-hover:border-[var(--red)] group-hover:scale-110 group-hover:bg-red-600/10" style={{ width: "100%", aspectRatio: "1" }}><Icon name="plus" size={36} /></span>
              <span className="block mt-4 text-sm sm:text-base font-semibold text-white/70 group-hover:text-white">Adicionar</span>
            </button>
          )}
        </div>
        <div className="mt-14 flex justify-center gap-3">
          <button className={`btn ${manage ? "btn-primary" : "btn-ghost"}`} onClick={() => setManage(!manage)}>{manage ? "Concluído" : "Gerenciar perfis"}</button>
          <button className="btn btn-ghost" onClick={logout}><Icon name="logout" size={16} />{t("logout")}</button>
        </div>
      </div>

      {editing && list.length > 0 && (
        <Modal onClose={() => setEditing(null)} wide>
          <h2 className="font-bold text-xl mb-4">{editing === "new" ? "Novo perfil" : "Editar perfil"}</h2>
          <ProfileForm initial={editing === "new" ? null : editing} onCancel={() => setEditing(null)} onSaved={async () => { setEditing(null); await load(); toast("Perfil salvo.", "ok"); }} wizard={editing === "new"} submitLabel={editing === "new" ? "Criar perfil" : "Salvar"} />
          {editing !== "new" && list.length > 1 && <button className="btn btn-ghost btn-sm mt-4 !text-[var(--red2)]" onClick={async () => {
            const e = editing; if (!confirm(`Excluir o perfil “${e.name}” e todos os seus dados?`)) return;
            let pinV: string | undefined; if (e.hasPin) pinV = prompt("PIN do perfil:") ?? undefined;
            try { await api(`/api/profiles/${e.id}`, { method: "DELETE", body: { pin: pinV } }); setEditing(null); await load(); toast("Perfil excluído.", "ok"); } catch (er) { toast((er as Error).message, "err"); }
          }}><Icon name="trash" size={14} />Excluir perfil</button>}
        </Modal>
      )}
      {pinFor && (
        <Modal onClose={() => setPinFor(null)}>
          <div className="text-center py-2">
            <Avatar p={pinFor} size={72} ring /><h3 className="font-bold text-lg mt-3">{pinFor.name}</h3><p className="text-sm text-[var(--muted)] mb-5">Digite o PIN de 4 dígitos</p>
            <div className="flex justify-center gap-3 mb-5">{[0, 1, 2, 3].map((i) => <span key={i} className="w-12 h-14 rounded-xl border grid place-items-center text-2xl" style={{ borderColor: pin.length === i ? "#E50914" : "rgba(255,255,255,.14)", background: "rgba(255,255,255,.04)" }}>{pin[i] ? "•" : ""}</span>)}</div>
            <div className="grid grid-cols-3 gap-2 max-w-[240px] mx-auto">
              {["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "⌫"].map((k, i) => k === "" ? <span key={i} /> : (
                <button key={k} className="btn btn-ghost !h-12" onClick={() => { if (k === "⌫") return setPin(pin.slice(0, -1)); const n = (pin + k).slice(0, 4); setPin(n); if (n.length === 4) enter(pinFor, n); }}>{k}</button>
              ))}
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
