"use client";

import { useEffect, useState } from "react";
import PortalShell, { useDentista } from "@/components/gc/PortalShell";
import { Botao, I, PageHeader, Panel, StatCard, Vazio } from "@/components/gc/ui";
import { supabaseBrowser } from "@/lib/supabaseClient";
import { STATUS_LABEL, type StatusPedido } from "@/lib/types";
import { brl, numeroOS, tamanhoLegivel } from "@/lib/gc";

export default function PortalPage() {
  return (
    <PortalShell ativo="/portal">
      <MinhasOS />
    </PortalShell>
  );
}

interface Linha {
  id: string;
  numero: number | null;
  created_at: string;
  paciente_nome: string;
  tipo_trabalho: string;
  dentes: string[];
  status: StatusPedido;
  prazo_desejado: string | null;
  valor_estimado: number | null;
  pedido_arquivos: { id: string; nome: string; tamanho: number | null }[];
}

const COR_STATUS: Record<StatusPedido, string> = {
  recebido: "bg-zinc-300",
  standby: "bg-rose-400",
  cad: "bg-sky-400",
  cam: "bg-violet-400",
  finalizacao: "bg-amber-300",
  entregue: "bg-emerald-400",
};

// O que o dentista vê em cada etapa (mais claro que o nome interno da lista).
const STATUS_DENTISTA: Record<StatusPedido, string> = {
  recebido: "Recebido",
  standby: "Aguardando informação",
  cad: "Em desenho (CAD)",
  cam: "Em produção (CAM)",
  finalizacao: "Em finalização",
  entregue: "Entregue",
};

const dataBR = (v: string | null) => {
  if (!v) return "—";
  const [a, m, d] = v.slice(0, 10).split("-");
  return `${d}/${m}/${a}`;
};

function MinhasOS() {
  const { dentista } = useDentista();
  const [linhas, setLinhas] = useState<Linha[] | null>(null);
  const [aba, setAba] = useState<"andamento" | "entregues">("andamento");
  const [aberta, setAberta] = useState<string | null>(null);

  useEffect(() => {
    supabaseBrowser
      .from("pedidos")
      .select("id, numero, created_at, paciente_nome, tipo_trabalho, dentes, status, prazo_desejado, valor_estimado, pedido_arquivos(id, nome, tamanho)")
      .eq("dentista_id", dentista.id)
      .order("created_at", { ascending: false })
      .then(({ data }) => setLinhas((data as Linha[]) ?? []));
  }, [dentista.id]);

  const todas = linhas ?? [];
  const andamento = todas.filter((l) => l.status !== "entregue");
  const entregues = todas.filter((l) => l.status === "entregue");
  const mostradas = aba === "andamento" ? andamento : entregues;
  const primeiroNome = (dentista.nome || "").split(" ").filter((p) => !/^dra?\.?$/i.test(p))[0] || "";

  return (
    <>
      <PageHeader
        eyebrow="Minhas ordens de serviço"
        title={primeiroNome ? `Olá, ${primeiroNome}` : "Olá!"}
        subtitle="Acompanhe aqui o andamento de cada caso que você enviou para o laboratório."
        actions={<Botao href="/portal/nova">{I.mais} Nova OS</Botao>}
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard tom="violeta" icone={I.pasta} rotulo="Em andamento" valor={andamento.length} detalhe="casos no laboratório" />
        <StatCard tom="verde" icone={I.caixa} rotulo="Entregues" valor={entregues.length} detalhe="desde o início" />
        <StatCard
          tom="ambar"
          icone={I.relogio}
          rotulo="Aguardando você"
          valor={todas.filter((l) => l.status === "standby").length}
          detalhe="casos que precisam de informação"
        />
      </div>

      <Panel
        eyebrow="Casos"
        title={
          <span className="gc-tabs mt-1 !text-base">
            <button onClick={() => setAba("andamento")} className={`gc-tab ${aba === "andamento" ? "gc-tab-ativa" : ""}`}>
              Em andamento ({andamento.length})
            </button>
            <button onClick={() => setAba("entregues")} className={`gc-tab ${aba === "entregues" ? "gc-tab-ativa" : ""}`}>
              Entregues ({entregues.length})
            </button>
          </span>
        }
      >
        {linhas === null ? (
          <Vazio>Carregando…</Vazio>
        ) : mostradas.length === 0 ? (
          <Vazio>{aba === "andamento" ? "Nenhum caso em andamento. Clique em “Nova OS” para enviar o primeiro." : "Nenhum caso entregue ainda."}</Vazio>
        ) : (
          <div className="divide-y divide-white/5">
            {mostradas.map((l) => (
              <div key={l.id} className="py-3">
                <button onClick={() => setAberta(aberta === l.id ? null : l.id)} className="flex w-full items-center gap-4 text-left">
                  <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${COR_STATUS[l.status]}`} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-white">
                      {l.paciente_nome} <span className="font-normal text-zinc-500">· {numeroOS(l.numero)}</span>
                    </p>
                    <p className="truncate text-sm text-zinc-400">{l.tipo_trabalho}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-sm font-semibold text-white">{STATUS_DENTISTA[l.status] ?? STATUS_LABEL[l.status]}</p>
                    <p className="text-xs text-zinc-400">enviado {dataBR(l.created_at)}</p>
                  </div>
                </button>
                {aberta === l.id && (
                  <div className="mt-3 grid gap-3 rounded-xl bg-white/[0.03] p-4 text-sm sm:grid-cols-3">
                    <p><span className="block text-xs text-zinc-500">Dentes</span>{l.dentes.join(", ") || "—"}</p>
                    <p><span className="block text-xs text-zinc-500">Prazo desejado</span>{dataBR(l.prazo_desejado)}</p>
                    <p><span className="block text-xs text-zinc-500">Valor estimado</span>{l.valor_estimado != null ? brl(l.valor_estimado) : "a confirmar"}</p>
                    <div className="sm:col-span-3">
                      <span className="block text-xs text-zinc-500">Arquivos enviados</span>
                      {l.pedido_arquivos.length === 0
                        ? "Nenhum"
                        : l.pedido_arquivos.map((a) => (
                            <span key={a.id} className="mr-3 inline-block text-zinc-300">
                              {a.nome} <span className="text-zinc-500">({tamanhoLegivel(a.tamanho)})</span>
                            </span>
                          ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Panel>
    </>
  );
}
