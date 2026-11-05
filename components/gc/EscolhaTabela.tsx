"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function EscolhaTabela({
  dentistaId,
  tabelaAtual,
  tabelas,
}: {
  dentistaId: string;
  tabelaAtual: string | null;
  tabelas: { id: string; nome: string }[];
}) {
  const router = useRouter();
  const [valor, setValor] = useState(tabelaAtual ?? "");
  const [estado, setEstado] = useState<"" | "salvando" | "salvo" | "erro">("");

  async function trocar(novo: string) {
    const anterior = valor;
    setValor(novo);
    setEstado("salvando");
    const res = await fetch("/api/admin/dentistas", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: dentistaId, tabela_id: novo || null }),
    });
    if (res.ok) {
      setEstado("salvo");
      router.refresh();
    } else {
      setValor(anterior);
      setEstado("erro");
    }
  }

  return (
    <label className="flex items-center gap-2 text-sm text-zinc-400">
      Tabela
      <select
        value={valor}
        onChange={(e) => trocar(e.target.value)}
        disabled={estado === "salvando"}
        className={`gc-input w-44 [color-scheme:dark] ${!valor ? "border-amber-400/50" : ""}`}
      >
        <option value="">— sem tabela —</option>
        {tabelas.map((t) => (
          <option key={t.id} value={t.id}>{t.nome}</option>
        ))}
      </select>
      <span className="w-14 text-xs">
        {estado === "salvando" ? "…" : estado === "salvo" ? <span className="text-emerald-300">salvo</span> : estado === "erro" ? <span className="text-rose-300">erro</span> : ""}
      </span>
    </label>
  );
}
