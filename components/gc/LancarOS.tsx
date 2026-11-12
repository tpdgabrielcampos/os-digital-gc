"use client";

import { useMemo, useState } from "react";
import FormularioOS from "@/components/gc/FormularioOS";
import { PageHeader, Panel, Vazio } from "@/components/gc/ui";
import type { Dentista } from "@/lib/gc";

// Painel do laboratório: escolhe o dentista e abre o mesmo formulário da Nova OS no nome dele.
export default function LancarOS({
  dentistas,
  precosPorTabela,
  nomesTabelas,
}: {
  dentistas: Dentista[];
  precosPorTabela: Record<string, Record<string, number>>;
  nomesTabelas: Record<string, string>;
}) {
  const [escolhido, setEscolhido] = useState<Dentista | null>(null);
  const [rodada, setRodada] = useState(0);
  const [busca, setBusca] = useState("");

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
    if (!q) return dentistas;
    const norm = (t: string | null) => (t ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
    return dentistas.filter((d) => norm(d.nome).includes(q) || norm(d.clinica).includes(q) || norm(d.email).includes(q));
  }, [busca, dentistas]);

  if (escolhido) {
    return (
      <FormularioOS
        key={`${escolhido.id}-${rodada}`}
        modo="laboratorio"
        dentista={escolhido}
        nomeTabela={escolhido.tabela_id ? nomesTabelas[escolhido.tabela_id] ?? null : null}
        precosIniciais={escolhido.tabela_id ? precosPorTabela[escolhido.tabela_id] ?? {} : {}}
        onTrocarDentista={() => {
          setEscolhido(null);
          setRodada((r) => r + 1);
        }}
      />
    );
  }

  return (
    <>
      <PageHeader
        eyebrow="Lançar OS"
        title="Para qual dentista?"
        subtitle="Escolha o dentista e preencha a OS por ele. Ela fica no nome dele, aparece em “Minhas OS” no portal e segue o fluxo normal do laboratório."
      />
      <Panel eyebrow="Dentistas" title={`${dentistas.length} com conta no portal`}>
        <label htmlFor="busca-dentista" className="sr-only">
          Buscar dentista
        </label>
        <input id="busca-dentista" className="gc-input mb-4 w-full" placeholder="Buscar por nome, clínica ou e-mail…" value={busca} onChange={(e) => setBusca(e.target.value)} />
        {filtrados.length === 0 ? (
          <Vazio>Nenhum dentista encontrado.</Vazio>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {filtrados.map((d) => (
              <button
                key={d.id}
                type="button"
                onClick={() => setEscolhido(d)}
                className="flex items-center gap-3 rounded-2xl border border-white/5 bg-white/[0.03] p-4 text-left transition hover:border-pink-400/40 hover:bg-white/[0.06]"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl gc-barra text-sm font-bold text-white">{(d.nome || "?").slice(0, 1).toUpperCase()}</span>
                <span className="min-w-0 leading-tight">
                  <span className="block truncate font-semibold text-white">{d.nome || d.email}</span>
                  <span className="block truncate text-xs text-zinc-400">
                    {d.clinica || "Sem clínica"} · {d.tabela_id ? nomesTabelas[d.tabela_id] ?? "tabela" : "sem tabela de preço"}
                  </span>
                </span>
              </button>
            ))}
          </div>
        )}
      </Panel>
    </>
  );
}
