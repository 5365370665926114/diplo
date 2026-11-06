"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useApp } from "@/components/AppProvider";
import { Icon } from "@/components/Icon";
import { ProfileForm } from "@/components/ProfileEditor";
import { Modal, PageTitle } from "@/components/ui";
import { api } from "@/lib/client/api";
import { LANGS, type Lang } from "@/lib/client/i18n";

function Card({ title, icon, children }: { title: string; icon: string; children: React.ReactNode }) {
  return <section className="panel p-5 sm:p-6 mt-5"><div className="flex items-center gap-3 mb-4"><span className="w-9 h-9 rounded-xl bg-red-600/15 text-[var(--red2)] grid place-items-center"><Icon name={icon} size={18} /></span><h2 className="font-bold text-lg">{title}</h2></div>{children}</section>;
}

export default function Page() {
  const { me, refresh, toast, setTour, markStep, lang } = useApp();
  const router = useRouter();
  const p = me!.profile!;
  const [edit, setEdit] = useState(false);
  const [pw, setPw] = useState({ current: "", next: "" });
  const [del, setDel] = useState(false);
  const [delPw, setDelPw] = useState("");
  const patchProfile = async (b: Record<string, unknown>) => { try { await api(`/api/profiles/${p.id}`, { method: "PATCH", body: b }); await refresh(); toast("Salvo.", "ok"); } catch (e) { toast((e as Error).message, "err"); } };
  const Toggle = ({ on, onChange, label, sub }: { on: boolean; onChange: (v: boolean) => void; label: string; sub?: string }) => (
    <div className="flex items-center gap-4 py-2"><div className="flex-1"><div className="text-sm font-semibold">{label}</div>{sub && <div className="text-xs text-[var(--muted)]">{sub}</div>}</div>
      <button role="switch" aria-checked={on} onClick={() => onChange(!on)} className="w-12 h-7 rounded-full relative transition" style={{ background: on ? "#E50914" : "rgba(255,255,255,.15)" }}><span className="absolute top-1 w-5 h-5 rounded-full bg-white transition-all" style={{ left: on ? 24 : 4 }} /></button></div>
  );
  return (
    <div className="px-4 sm:px-8 lg:px-10 pb-20 max-w-3xl">
      <PageTitle title="Configurações" icon="settings" />
      <Card title="Perfil" icon="user"><div className="flex flex-wrap gap-2"><button className="btn btn-ghost" onClick={() => setEdit(true)}><Icon name="edit" size={16} />Editar perfil, avatar e PIN</button><button className="btn btn-ghost" onClick={() => router.push("/profiles")}><Icon name="users" size={16} />Trocar de perfil</button></div></Card>
      <Card title="Idioma" icon="globe"><div className="flex flex-wrap gap-2">{LANGS.map((l) => <button key={l.id} className={`chip !text-sm !px-4 !py-2 ${lang === l.id ? "on" : ""}`} onClick={async () => { await api("/api/me", { method: "PATCH", body: { lang: l.id as Lang } }); await refresh(); toast("Idioma atualizado.", "ok"); }}>{l.flag} {l.label}</button>)}</div><p className="text-xs text-[var(--muted)] mt-2">Também define o idioma dos metadados do catálogo.</p></Card>
      <Card title="Privacidade" icon="lock">
        <Toggle on={p.privacy === "public"} onChange={(v) => patchProfile({ privacy: v ? "public" : "private" })} label="Perfil público" sub="Perfis privados não aparecem em rankings." />
        <Toggle on={p.showInRankings} onChange={(v) => patchProfile({ showInRankings: v })} label="Aparecer no ranking de horas" />
      </Card>
      <Card title="Ajuda" icon="help"><button className="btn btn-ghost" onClick={async () => { await markStep("tutorial", "profile", true); router.push("/"); setTimeout(() => setTour(true), 600); }}><Icon name="refresh" size={16} />Fazer tour novamente</button>
        <p className="text-xs text-[var(--muted)] mt-3">Atalhos: <kbd className="border border-white/15 rounded px-1.5">Ctrl</kbd>+<kbd className="border border-white/15 rounded px-1.5">K</kbd> busca/comandos · <kbd className="border border-white/15 rounded px-1.5">/</kbd> busca · setas navegam carrosséis.</p></Card>
      <Card title="Conta" icon="shield">
        <div className="text-sm text-[var(--muted)] mb-3">{me!.user.name} · {me!.user.email}</div>
        <div className="grid sm:grid-cols-2 gap-2.5"><input className="input" type="password" placeholder="Senha atual" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} /><input className="input" type="password" placeholder="Nova senha (mín. 8)" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} /></div>
        <button className="btn btn-ghost mt-3" onClick={async () => { try { await api("/api/auth/password", { body: pw }); setPw({ current: "", next: "" }); toast("Senha alterada.", "ok"); } catch (e) { toast((e as Error).message, "err"); } }}>Alterar senha</button>
      </Card>
      <Card title="Seus dados (LGPD)" icon="download">
        <div className="flex flex-wrap gap-2"><a href="/api/me/export" className="btn btn-ghost"><Icon name="download" size={16} />Exportar meus dados</a><button className="btn btn-ghost !text-[var(--red2)]" onClick={() => setDel(true)}><Icon name="trash" size={16} />Excluir conta e dados</button></div>
      </Card>
      {edit && <Modal onClose={() => setEdit(false)} wide><h2 className="font-bold text-xl mb-4">Editar perfil</h2><ProfileForm initial={p} onCancel={() => setEdit(false)} onSaved={async () => { setEdit(false); await refresh(); toast("Perfil atualizado.", "ok"); }} />
        <label className="block mt-5"><span className="text-xs font-semibold text-[var(--muted)]">Biografia</span><textarea className="input mt-1.5" rows={2} maxLength={240} defaultValue={p.bio} onBlur={(e) => e.target.value !== p.bio && patchProfile({ bio: e.target.value })} /></label></Modal>}
      {del && <Modal onClose={() => setDel(false)}><h3 className="font-bold text-lg">Excluir conta</h3><p className="text-sm text-[var(--muted)] mt-2">Isso apaga permanentemente sua conta, perfis, listas, playlists e histórico. Digite sua senha para confirmar.</p><input className="input mt-4" type="password" placeholder="Senha" value={delPw} onChange={(e) => setDelPw(e.target.value)} /><button className="btn btn-primary w-full mt-4" onClick={async () => { try { await api("/api/me", { method: "DELETE", body: { password: delPw } }); location.href = "/welcome"; } catch (e) { toast((e as Error).message, "err"); } }}>Excluir definitivamente</button></Modal>}
    </div>
  );
}
