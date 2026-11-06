"use client";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { api } from "@/lib/client/api";
import { LANGS, tr, type Lang } from "@/lib/client/i18n";
import { Icon } from "@/components/Icon";
import { Spinner } from "@/components/ui";

type Mode = "login" | "register" | "recover" | "reset";

export default function WelcomeFlow({ registrations }: { registrations: boolean }) {
  const sp = useSearchParams();
  const resetToken = sp.get("reset");
  const [step, setStep] = useState<0 | 1 | 2>(resetToken ? 2 : 0);
  const [lang, setLang] = useState<Lang>("pt-BR");
  const [mode, setMode] = useState<Mode>(resetToken ? "reset" : "register");
  const [f, setF] = useState({ name: "", email: "", password: "", confirm: "" });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ t: "err" | "ok"; m: string } | null>(null);
  const t = (k: string) => tr(lang, k);

  useEffect(() => {
    const seen = localStorage.getItem("dc_lang");
    if (seen && !resetToken) { setLang(seen as Lang); setStep(2); setMode("login"); }
  }, [resetToken]);

  const pickLang = (l: Lang) => { setLang(l); localStorage.setItem("dc_lang", l); };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setMsg(null);
    const email = f.email.trim();
    if (mode !== "recover" && mode !== "reset" && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return setMsg({ t: "err", m: "Informe um e-mail válido." });
    if ((mode === "register" || mode === "reset") && f.password.length < 8) return setMsg({ t: "err", m: "A senha deve ter ao menos 8 caracteres." });
    if ((mode === "register" || mode === "reset") && f.password !== f.confirm) return setMsg({ t: "err", m: "As senhas não coincidem." });
    if (mode === "register" && f.name.trim().length < 2) return setMsg({ t: "err", m: "Informe seu nome." });
    setBusy(true);
    try {
      if (mode === "recover") { const r = await api<{ message: string }>("/api/auth/recover", { body: { email } }); setMsg({ t: "ok", m: r.message }); }
      else if (mode === "reset") { await api("/api/auth/reset", { body: { token: resetToken, password: f.password } }); setMsg({ t: "ok", m: "Senha atualizada. Entre com a nova senha." }); setMode("login"); }
      else { await api(`/api/auth/${mode}`, { body: { name: f.name, email, password: f.password, lang } }); localStorage.setItem("dc_lang", lang); location.href = "/profiles"; return; }
    } catch (err) { setMsg({ t: "err", m: (err as Error).message }); }
    setBusy(false);
  };

  return (
    <div className="min-h-dvh relative overflow-hidden grid place-items-center px-5 py-10">
      <div className="absolute inset-0 pointer-events-none" style={{ background: "radial-gradient(circle at 50% 38%, rgba(229,9,20,.22), transparent 55%)" }} />
      <div className="absolute inset-x-0 top-1/2 h-px opacity-30" style={{ background: "linear-gradient(90deg,transparent,#E50914,transparent)", animation: "lineGrow 1.6s var(--ease) both" }} />
      <div className="relative w-full max-w-md text-center">
        {step === 0 && (
          <div key="s0" className="fade-in">
            <div className="logo-word text-3xl sm:text-5xl" style={{ animation: "logoIn 1.8s var(--ease) both" }}>DIPLO<b>CINE</b></div>
            <p className="mt-8 text-lg sm:text-xl text-white/85 max-w-sm mx-auto" style={{ animation: "fadeUp 1s .9s var(--ease) both" }}>{t("welcome")}</p>
            <button className="btn btn-primary mt-10 !h-14 !px-9 !text-base" style={{ animation: "fadeUp 1s 1.4s var(--ease) both, glow 3s 2.4s infinite" }} onClick={() => setStep(1)}>{t("start")}<Icon name="chevR" size={18} /></button>
          </div>
        )}
        {step === 1 && (
          <div key="s1" className="page-enter">
            <div className="eyebrow justify-center mb-3">1 / 2</div>
            <h1 className="text-3xl h-display">{t("chooseLang")}</h1>
            <div className="mt-8 grid gap-3 stagger">
              {LANGS.map((l) => (
                <button key={l.id} onClick={() => pickLang(l.id)} className={`panel flex items-center gap-4 px-5 h-16 text-left transition ${lang === l.id ? "!border-[var(--red)] bg-red-600/10" : "hover:bg-white/5"}`} aria-pressed={lang === l.id}>
                  <span className="text-2xl">{l.flag}</span><span className="font-semibold flex-1">{l.label}</span>{lang === l.id && <Icon name="check" className="text-[var(--red2)]" />}
                </button>
              ))}
            </div>
            <button className="btn btn-primary w-full mt-8 !h-14" onClick={() => { setStep(2); setMode(registrations ? "register" : "login"); }}>{t("next")}<Icon name="chevR" size={18} /></button>
          </div>
        )}
        {step === 2 && (
          <div key="s2" className="page-enter text-left">
            <div className="text-center mb-7"><div className="logo-word text-xl">DIPLO<b>CINE</b></div>
              <h1 className="text-2xl h-display mt-5">{mode === "register" ? "Crie sua conta" : mode === "login" ? "Entrar" : mode === "recover" ? "Recuperar senha" : "Nova senha"}</h1></div>
            <form onSubmit={submit} className="panel p-5 sm:p-6 space-y-3.5" noValidate>
              {mode === "register" && <input className="input" placeholder="Nome" autoComplete="name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />}
              {mode !== "reset" && <input className="input" type="email" placeholder="E-mail" autoComplete="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />}
              {mode !== "recover" && <input className="input" type="password" placeholder={mode === "reset" ? "Nova senha" : "Senha (mín. 8 caracteres)"} autoComplete={mode === "login" ? "current-password" : "new-password"} value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} />}
              {(mode === "register" || mode === "reset") && <input className="input" type="password" placeholder="Confirmar senha" autoComplete="new-password" value={f.confirm} onChange={(e) => setF({ ...f, confirm: e.target.value })} />}
              {msg && <div className={`text-sm rounded-xl px-3.5 py-2.5 fade-in ${msg.t === "err" ? "bg-red-600/15 text-red-300" : "bg-emerald-500/15 text-emerald-300"}`} role="alert">{msg.m}</div>}
              <button className="btn btn-primary w-full !h-12" disabled={busy}>{busy ? <Spinner size={18} /> : mode === "register" ? "Criar conta" : mode === "login" ? "Entrar" : mode === "recover" ? "Enviar instruções" : "Salvar senha"}</button>
            </form>
            <div className="mt-5 text-center text-sm text-[var(--muted)] space-y-2">
              {mode === "login" && <><button className="hover:text-white" onClick={() => { setMode("recover"); setMsg(null); }}>Esqueci minha senha</button><div>Novo por aqui? {registrations ? <button className="text-white font-semibold" onClick={() => { setMode("register"); setMsg(null); }}>Criar conta</button> : "Cadastros desativados."}</div></>}
              {mode === "register" && <div>Já tem conta? <button className="text-white font-semibold" onClick={() => { setMode("login"); setMsg(null); }}>Entrar</button></div>}
              {(mode === "recover") && <button className="text-white font-semibold" onClick={() => { setMode("login"); setMsg(null); }}>Voltar</button>}
              <p className="text-[11px] pt-3">Ao continuar você concorda com o tratamento dos dados conforme a LGPD. Você pode exportar ou excluir tudo em Configurações.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
