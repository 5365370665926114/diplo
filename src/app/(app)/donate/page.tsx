"use client";
import { useEffect, useRef, useState } from "react";
import { useApp } from "@/components/AppProvider";
import { Icon } from "@/components/Icon";
import { ErrorBox, PageTitle, Skeleton, Spinner } from "@/components/ui";
import { api, brl, useFetch } from "@/lib/client/api";

type Info = { minAmount: number; configured: boolean; totalCents: number; supporters: number; mine: { id: string; amountCents: number; status: string; createdAt: string }[] };
type Tx = { id: string; status: string; amountCents: number; qrCode: string | null; copyPaste: string | null; expiresAt: string | null };
const SUG = [5, 10, 25, 50, 100];
const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}-${Math.random().toString(16).slice(2)}`);

export default function Page() {
  const { toast, me } = useApp();
  const { data, error, reload } = useFetch<Info>("/api/donations");
  const [amount, setAmount] = useState(10);
  const [custom, setCustom] = useState("");
  const [anon, setAnon] = useState(false);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [tx, setTx] = useState<Tx | null>(null);
  const [left, setLeft] = useState(0);
  const key = useRef(uuid());

  const value = custom ? Number(custom.replace(",", ".")) : amount;
  const create = async () => {
    if (!Number.isFinite(value) || value < (data?.minAmount ?? 5)) return toast(`Valor mínimo: R$ ${(data?.minAmount ?? 5).toFixed(2).replace(".", ",")}`, "err");
    setBusy(true);
    try { setTx(await api<Tx>("/api/donations", { body: { amount: value, anonymous: anon, message: msg, key: key.current } })); }
    catch (e) { toast((e as Error).message, "err"); } finally { setBusy(false); }
  };
  // poll for confirmation (webhook updates DB; this reflects it live) + reconciliation on the server
  useEffect(() => {
    if (!tx || tx.status !== "pending") return;
    const id = setInterval(async () => { try { const t = await api<Tx>(`/api/donations?id=${tx.id}`); if (t.status !== "pending") { setTx(t); reload(); if (t.status === "confirmed") key.current = uuid(); } } catch { /* retry */ } }, 3500);
    return () => clearInterval(id);
  }, [tx, reload]);
  useEffect(() => { if (!tx?.expiresAt) return; const f = () => setLeft(Math.max(0, Math.floor((new Date(tx.expiresAt!).getTime() - Date.now()) / 1000))); f(); const id = setInterval(f, 1000); return () => clearInterval(id); }, [tx?.expiresAt]);
  const qrSrc = tx?.qrCode ? (/^(https?:|data:)/.test(tx.qrCode) ? tx.qrCode : `data:image/png;base64,${tx.qrCode}`) : null;

  return (
    <div className="px-4 sm:px-8 lg:px-10 pb-16 max-w-3xl">
      <PageTitle title="Apoie o DiploCine" sub="Doações via PIX ajudam a manter a plataforma no ar" icon="gift" />
      {error ? <div className="mt-8"><ErrorBox message={error.message} onRetry={reload} /></div> : !data ? <Skeleton className="h-80 mt-8" /> : (
        <>
          <div className="grid grid-cols-2 gap-3 mt-8"><div className="panel p-4"><div className="text-xs text-[var(--muted)]">Arrecadado (confirmado)</div><div className="text-2xl font-extrabold mt-1">{brl(data.totalCents)}</div></div><div className="panel p-4"><div className="text-xs text-[var(--muted)]">Apoios confirmados</div><div className="text-2xl font-extrabold mt-1">{data.supporters}</div></div></div>
          {tx?.status === "confirmed" ? (
            <div className="panel p-10 text-center mt-6 scale-in"><div className="mx-auto w-20 h-20 rounded-full bg-emerald-500/20 text-emerald-400 grid place-items-center" style={{ animation: "pop .6s var(--ease)" }}><Icon name="check" size={40} /></div><h2 className="text-2xl font-extrabold mt-5">Obrigado pelo apoio! 💛</h2><p className="text-[var(--muted)] mt-2">Seu PIX de {brl(tx.amountCents)} foi confirmado.</p><button className="btn btn-primary mt-6" onClick={() => setTx(null)}>Fazer outra doação</button></div>
          ) : tx ? (
            <div className="panel p-6 mt-6 text-center scale-in">
              <div className="eyebrow justify-center">PIX · {brl(tx.amountCents)}</div>
              {tx.status === "pending" ? <>
                {qrSrc && /* eslint-disable-next-line @next/next/no-img-element */ <img src={qrSrc} alt="QR Code PIX" className="mx-auto mt-5 w-56 h-56 rounded-2xl bg-white p-3" />}
                {tx.copyPaste && <div className="mt-5 text-left"><div className="text-xs text-[var(--muted)] mb-1.5">PIX copia e cola</div><div className="flex gap-2"><input readOnly className="input !h-11 !text-xs font-mono" value={tx.copyPaste} onFocus={(e) => e.target.select()} /><button className="btn btn-primary btn-sm !h-11" onClick={() => { navigator.clipboard.writeText(tx.copyPaste!); toast("Código copiado", "ok"); }}><Icon name="copy" size={14} />Copiar</button></div></div>}
                <div className="flex items-center justify-center gap-2 mt-5 text-sm text-[var(--muted)]"><Spinner size={14} />Aguardando pagamento{left > 0 && ` · expira em ${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`}</div>
              </> : <><p className="mt-5 text-[var(--muted)]">Esta cobrança {tx.status === "expired" ? "expirou" : "falhou"}.</p><button className="btn btn-primary mt-4" onClick={() => { key.current = uuid(); setTx(null); }}>Criar nova cobrança</button></>}
              {tx.status === "pending" && <button className="text-xs text-[var(--muted)] mt-4 underline" onClick={() => { key.current = uuid(); setTx(null); }}>Cancelar</button>}
            </div>
          ) : (
            <div className="panel p-5 sm:p-6 mt-6 space-y-5">
              {!data.configured && <div className="rounded-xl bg-amber-500/15 text-amber-300 text-sm p-3.5">As doações estão indisponíveis até que o administrador configure o NexusPag (API key e webhook secret).{me?.user.isAdmin && " Abra Control Center → Configurações."}</div>}
              <div className="flex flex-wrap gap-2">{SUG.map((v) => <button key={v} className={`chip !text-base !px-5 !py-2.5 ${!custom && amount === v ? "on" : ""}`} onClick={() => { setAmount(v); setCustom(""); }}>R$ {v}</button>)}</div>
              <label className="block"><span className="text-xs font-semibold text-[var(--muted)]">Outro valor (mín. R$ {data.minAmount.toFixed(2).replace(".", ",")})</span><input className="input mt-1.5" inputMode="decimal" placeholder="0,00" value={custom} onChange={(e) => setCustom(e.target.value.replace(/[^\d.,]/g, ""))} /></label>
              <label className="block"><span className="text-xs font-semibold text-[var(--muted)]">Mensagem (opcional)</span><input className="input mt-1.5" maxLength={140} value={msg} onChange={(e) => setMsg(e.target.value)} /></label>
              <label className="flex items-center gap-3 text-sm"><input type="checkbox" checked={anon} onChange={(e) => setAnon(e.target.checked)} className="w-4 h-4 accent-[#E50914]" />Doar anonimamente (oculta nome e avatar nos rankings)</label>
              <button className="btn btn-primary w-full !h-13 !text-base" disabled={busy || !data.configured} onClick={create}>{busy ? <Spinner size={18} /> : <>Gerar PIX de {Number.isFinite(value) ? brl(Math.round(value * 100)) : "—"}</>}</button>
              <p className="text-[11px] text-[var(--muted)]">Pagamento processado pela NexusPag. Não coletamos CPF nem dados bancários. Somente pagamentos confirmados entram nos rankings.</p>
            </div>
          )}
          {data.mine.length > 0 && <section className="mt-10"><div className="eyebrow mb-3">Suas doações</div><div className="panel divide-y divide-white/5">{data.mine.map((m) => <div key={m.id} className="flex justify-between px-4 py-3 text-sm"><span>{new Date(m.createdAt).toLocaleDateString("pt-BR")}</span><span className="font-semibold">{brl(m.amountCents)}</span><span className={m.status === "confirmed" ? "text-emerald-400" : "text-[var(--muted)]"}>{{ confirmed: "Confirmada", pending: "Pendente", expired: "Expirada", failed: "Falhou" }[m.status] ?? m.status}</span></div>)}</div></section>}
        </>
      )}
    </div>
  );
}
