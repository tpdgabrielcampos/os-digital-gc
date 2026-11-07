"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { STATUS_LABEL, STATUS_ORDER, StatusPedido } from "@/lib/types";

export default function PainelControle({
  pedidoId,
  statusAtual,
  notasIniciais,
  prazoInicial,
  urgente,
  aguardandoInicial = false,
}: {
  pedidoId: string;
  statusAtual: StatusPedido;
  notasIniciais: string | null;
  prazoInicial?: string | null;
  urgente?: boolean;
  aguardandoInicial?: boolean;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<StatusPedido>(statusAtual);
  const [notas, setNotas] = useState(notasIniciais ?? "");
  const [salvandoStatus, setSalvandoStatus] = useState(false);
  const [salvandoNotas, setSalvandoNotas] = useState(false);
  const [erroStatus, setErroStatus] = useState<string | null>(null);
  const [mensagemNotas, setMensagemNotas] = useState<string | null>(null);
  const [prazo, setPrazo] = useState((prazoInicial ?? "").slice(0, 10));
  const [salvandoPrazo, setSalvandoPrazo] = useState(false);
  const [mensagemPrazo, setMensagemPrazo] = useState<string | null>(null);
  const [aguardando, setAguardando] = useState(aguardandoInicial);
  const [erroAguardando, setErroAguardando] = useState<string | null>(null);

  async function salvar(campos: Partial<{ status: StatusPedido; notas_internas: string; prazo_desejado: string | null; aguardando_arquivos: boolean }>) {
    const res = await fetch(`/api/pedidos/${pedidoId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(campos),
    });

    let corpo: { ok: boolean; erro?: string } | null = null;
    try {
      corpo = await res.json();
    } catch {
      // resposta sem corpo JSON — tratado abaixo pelo res.ok
    }

    if (!res.ok || !corpo?.ok) {
      throw new Error(corpo?.erro || "Não consegui salvar. Tente novamente.");
    }
  }

  async function alterarStatus(novo: StatusPedido) {
    const anterior = status;
    setStatus(novo); // atualização otimista — revertida abaixo se falhar
    setSalvandoStatus(true);
    setErroStatus(null);

    try {
      await salvar({ status: novo });
      router.refresh();
    } catch (err) {
      // Reverte o dropdown pro status real: sem isso, a tela mostra um
      // status que na verdade não foi salvo no banco.
      setStatus(anterior);
      setErroStatus(err instanceof Error ? err.message : "Não consegui salvar. Tente novamente.");
    } finally {
      setSalvandoStatus(false);
    }
  }

  async function alterarAguardando(v: boolean) {
    setAguardando(v);
    setErroAguardando(null);
    try {
      await salvar({ aguardando_arquivos: v });
      router.refresh();
    } catch (err) {
      setAguardando(!v);
      setErroAguardando(err instanceof Error ? err.message : "Não consegui salvar.");
    }
  }

  async function salvarPrazo() {
    setSalvandoPrazo(true);
    setMensagemPrazo(null);
    try {
      await salvar({ prazo_desejado: prazo || null });
      setMensagemPrazo("Prazo salvo.");
      router.refresh();
    } catch (err) {
      setMensagemPrazo(err instanceof Error ? err.message : "Não consegui salvar. Tente novamente.");
    } finally {
      setSalvandoPrazo(false);
    }
  }

  async function salvarNotas() {
    setSalvandoNotas(true);
    setMensagemNotas(null);
    try {
      await salvar({ notas_internas: notas });
      setMensagemNotas("Notas salvas.");
      router.refresh();
    } catch (err) {
      setMensagemNotas(err instanceof Error ? err.message : "Não consegui salvar. Tente novamente.");
    } finally {
      setSalvandoNotas(false);
    }
  }

  return (
    <div className="gc-card flex flex-col gap-5 p-5 sm:p-6">
      <div><p className="gc-eyebrow">Laboratório</p><h2 className="mt-1 text-xl font-bold text-white">Controle do caso</h2></div>

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-zinc-300">Status do caso</span>
        <select
          value={status}
          disabled={salvandoStatus}
          onChange={(e) => alterarStatus(e.target.value as StatusPedido)}
          className="gc-input [color-scheme:dark] disabled:opacity-60"
        >
          {STATUS_ORDER.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABEL[s]}
            </option>
          ))}
        </select>
        {salvandoStatus && <span className="text-xs text-zinc-400">Salvando…</span>}
        {erroStatus && (
          <p className="rounded-lg bg-rose-500/10 px-3 py-2 text-xs font-medium text-rose-300">
            ⚠ {erroStatus}
          </p>
        )}
      </label>

      <label className={`flex cursor-pointer items-start gap-3 rounded-xl border px-3 py-2.5 text-sm ${aguardando ? "border-amber-400/50 bg-amber-500/10 text-amber-100" : "border-white/10 text-zinc-300"}`}>
        <input type="checkbox" className="mt-1" checked={aguardando} onChange={(e) => alterarAguardando(e.target.checked)} />
        <span>
          <strong>⏳ Aguardando arquivos do dentista</strong>
          <span className="block text-xs text-zinc-400">Marcado: o dentista ainda pode anexar arquivos e complementos pelo portal. Desmarque quando a OS estiver completa.</span>
          {erroAguardando && <span className="block text-xs text-rose-300">{erroAguardando}</span>}
        </span>
      </label>

      <div className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-zinc-300">
          Prazo de entrega {urgente && <span className="ml-1 rounded-md bg-rose-600 px-1.5 py-0.5 text-[11px] font-bold text-white">⚠️ URGENTE</span>}
        </span>
        <div className="flex gap-2">
          <input type="date" value={prazo} onChange={(e) => setPrazo(e.target.value)} className="gc-input flex-1 [color-scheme:dark]" />
          <button onClick={salvarPrazo} disabled={salvandoPrazo} className="gc-btn gc-btn-secundario disabled:opacity-60">
            {salvandoPrazo ? "Salvando..." : "Salvar"}
          </button>
        </div>
        {urgente && !prazoInicial && <span className="text-xs text-rose-300">Urgência sem data: coloque aqui o prazo combinado com o dentista.</span>}
        {mensagemPrazo && (
          <span className={`text-xs ${mensagemPrazo === "Prazo salvo." ? "text-emerald-300" : "font-medium text-rose-300"}`}>{mensagemPrazo}</span>
        )}
      </div>

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-zinc-300">Notas internas</span>
        <textarea
          value={notas}
          onChange={(e) => setNotas(e.target.value)}
          rows={4}
          className="gc-input"
          placeholder="Anotações só visíveis pro laboratório..."
        />
      </label>
      <button
        onClick={salvarNotas}
        disabled={salvandoNotas}
        className="gc-btn gc-btn-secundario self-start disabled:opacity-60"
      >
        {salvandoNotas ? "Salvando..." : "Salvar notas"}
      </button>

      {mensagemNotas && (
        <p
          className={`text-xs ${
            mensagemNotas === "Notas salvas." ? "text-emerald-300" : "font-medium text-rose-300"
          }`}
        >
          {mensagemNotas}
        </p>
      )}
    </div>
  );
}
