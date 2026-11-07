"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { SEPARADOR, opcoesDepoisDe } from "@/lib/catalogo";

// Odontograma em notação FDI onde cada dente recebe um trabalho do catálogo.
// Clique num dente -> abre uma janela para escolher o trabalho em etapas.
// No modo "vários dentes", os cliques só marcam os dentes; depois um botão
// abre a mesma janela e o trabalho escolhido vale para todos eles.

/** Cores (classes Tailwind) de cada categoria, para pintar os dentes.
 * Ficam neste arquivo porque o Tailwind só procura classes em app/ e components/. */
export const COR_CATEGORIA: Record<string, string> = {
  PSI: "border-indigo-700 bg-indigo-600 text-white",
  PSD: "border-sky-700 bg-sky-500 text-white",
  "Ajuste de cor": "border-orange-700 bg-orange-500 text-white",
  "Enceramento diagnóstico": "border-amber-600 bg-amber-400 text-amber-950",
  Protocolo: "border-violet-700 bg-violet-500 text-white",
  "Planejamento de implante": "border-emerald-700 bg-emerald-500 text-white",
  "Placa miorelaxante": "border-rose-700 bg-rose-500 text-white",
  "Impressão de modelo": "border-slate-600 bg-slate-500 text-white",
  "Impressão de biomodelo": "border-teal-700 bg-teal-500 text-white",
  "Design CAD": "border-fuchsia-700 bg-fuchsia-500 text-white",
};

const SUP_DIR = ["18", "17", "16", "15", "14", "13", "12", "11"];
const SUP_ESQ = ["21", "22", "23", "24", "25", "26", "27", "28"];
const INF_DIR = ["48", "47", "46", "45", "44", "43", "42", "41"];
const INF_ESQ = ["31", "32", "33", "34", "35", "36", "37", "38"];

const ARCADA_SUP = [...SUP_DIR, ...SUP_ESQ];
const ARCADA_INF = [...INF_DIR, ...INF_ESQ];

/** Protocolo é sempre arcada completa: um dente marcado vira a arcada toda. */
function expandirArcadas(dentes: string[]): string[] {
  const res = new Set<string>();
  for (const d of dentes) for (const x of ARCADA_SUP.includes(d) ? ARCADA_SUP : ARCADA_INF) res.add(x);
  return [...res];
}

// Protocolo (produção) e Protocolo do Design CAD marcam a arcada inteira.
const ehProtocolo = (c?: string[]) => c?.[0] === "Protocolo" || (c?.[0] === "Design CAD" && c?.[1] === "Protocolo");

/** dente -> caminho escolhido no catálogo (ex: ["PSD", "Coroa", "Dissilicato"]) */
export type Marcacoes = Record<string, string[]>;

interface Props {
  marcacoes: Marcacoes;
  onChange: (marcacoes: Marcacoes) => void;
}

export default function OdontogramaTrabalhos({ marcacoes, onChange }: Props) {
  const [modoVarios, setModoVarios] = useState(false);
  const [selecionados, setSelecionados] = useState<string[]>([]);
  const [janela, setJanela] = useState<string[] | null>(null); // dentes da janela aberta
  const [caminho, setCaminho] = useState<string[]>([]);
  const [ultimo, setUltimo] = useState<string[] | null>(null);

  function clicarDente(dente: string) {
    if (modoVarios) {
      setSelecionados((s) => (s.includes(dente) ? s.filter((d) => d !== dente) : [...s, dente]));
    } else {
      abrirJanela([dente]);
    }
  }

  function abrirJanela(dentes: string[]) {
    setCaminho([]);
    setJanela(dentes);
  }

  function fecharJanela() {
    setJanela(null);
    setCaminho([]);
  }

  function aplicar(caminhoFinal: string[]) {
    if (!janela) return;
    const novas = { ...marcacoes };
    const dentes = ehProtocolo(caminhoFinal) ? expandirArcadas(janela) : janela;
    // Se um dente de um protocolo recebe outro trabalho, o protocolo daquela arcada sai.
    if (!ehProtocolo(caminhoFinal)) {
      for (const d of expandirArcadas(janela.filter((x) => ehProtocolo(marcacoes[x])))) {
        if (ehProtocolo(novas[d])) delete novas[d];
      }
    }
    for (const d of dentes) novas[d] = caminhoFinal;
    onChange(novas);
    setUltimo(caminhoFinal);
    setSelecionados([]);
    setModoVarios(false);
    fecharJanela();
  }

  function remover() {
    if (!janela) return;
    const novas = { ...marcacoes };
    for (const d of janela) delete novas[d];
    // Remover um dente do protocolo remove a arcada inteira.
    for (const d of expandirArcadas(janela.filter((x) => ehProtocolo(marcacoes[x])))) {
      if (ehProtocolo(novas[d])) delete novas[d];
    }
    onChange(novas);
    setSelecionados([]);
    fecharJanela();
  }

  function escolher(nome: string) {
    const novo = [...caminho, nome];
    if (opcoesDepoisDe(novo).length === 0) aplicar(novo);
    else setCaminho(novo);
  }

  const opcoes = opcoesDepoisDe(caminho);
  const atual = janela && janela.length === 1 ? marcacoes[janela[0]] : undefined;
  const algumMarcado = janela?.some((d) => marcacoes[d]);

  function Dente({ n }: { n: string }) {
    const marc = marcacoes[n];
    const sel = selecionados.includes(n);
    const cor = marc ? COR_CATEGORIA[marc[0]] : "";
    return (
      <button
        type="button"
        onClick={() => clicarDente(n)}
        title={marc ? `${n}: ${marc.join(SEPARADOR)}` : `Dente ${n}`}
        className={`h-9 w-[26px] shrink-0 rounded-lg border text-xs font-semibold transition-colors sm:h-10 sm:w-8 ${
          marc
            ? cor
            : "border-white/10 bg-white/[0.03] text-zinc-400 hover:border-pink-300/60 hover:text-white"
        } ${sel ? "ring-2 ring-offset-2 ring-offset-black ring-pink-400" : ""}`}
      >
        {n}
      </button>
    );
  }

  return (
    <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-2 sm:p-4">
      <div className="overflow-x-auto">
        <div className="mx-auto flex w-fit flex-col gap-2">
          <div className="flex gap-2">
            <div className="flex gap-0.5 sm:gap-1">{SUP_DIR.map((n) => <Dente key={n} n={n} />)}</div>
            <div className="flex gap-0.5 sm:gap-1">{SUP_ESQ.map((n) => <Dente key={n} n={n} />)}</div>
          </div>
          <div className="flex gap-2">
            <div className="flex gap-0.5 sm:gap-1">{INF_DIR.map((n) => <Dente key={n} n={n} />)}</div>
            <div className="flex gap-0.5 sm:gap-1">{INF_ESQ.map((n) => <Dente key={n} n={n} />)}</div>
          </div>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-center gap-2 text-xs">
        {!modoVarios ? (
          <>
            <span className="text-zinc-400">Clique num dente para escolher o trabalho.</span>
            <button
              type="button"
              onClick={() => setModoVarios(true)}
              className="rounded-lg border border-white/15 px-2.5 py-1.5 font-medium text-zinc-200 hover:bg-white/5"
            >
              Marcar vários dentes de uma vez
            </button>
          </>
        ) : (
          <>
            <span className="text-zinc-300">
              {selecionados.length === 0
                ? "Clique nos dentes que terão o mesmo trabalho."
                : `Selecionados: ${[...selecionados].sort().join(", ")}`}
            </span>
            <button
              type="button"
              disabled={selecionados.length === 0}
              onClick={() => abrirJanela([...selecionados].sort())}
              className="gc-btn gc-btn-principal !px-3 !py-1.5 !text-xs disabled:opacity-40"
            >
              Escolher trabalho ({selecionados.length})
            </button>
            <button
              type="button"
              onClick={() => {
                setModoVarios(false);
                setSelecionados([]);
              }}
              className="rounded-md px-2 py-1 text-zinc-400 hover:underline"
            >
              Cancelar
            </button>
          </>
        )}
      </div>

      {janela &&
        typeof document !== "undefined" &&
        // Portal no <body>: o painel em volta tem efeito de vidro (backdrop-blur), que prende
        // elementos "fixed" dentro dele e cortava a janela quando a lista de trabalhos era longa.
        createPortal(
        <div
          style={{ fontFamily: '"Sora", ui-sans-serif, system-ui, sans-serif' }}
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 backdrop-blur-sm sm:items-center sm:p-4"
          onClick={fecharJanela}
        >
          <div
            className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-t-3xl border border-white/10 bg-[#0c0c0f] p-5 text-zinc-200 shadow-2xl sm:rounded-3xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-bold text-white">
                  {janela.length === 1 ? `Dente ${janela[0]}` : `Dentes ${janela.join(", ")}`}
                </h3>
                <p className="text-xs text-zinc-400">
                  {caminho.length === 0 ? "Escolha o tipo de trabalho" : caminho.join(SEPARADOR)}
                </p>
              </div>
              <button
                type="button"
                onClick={fecharJanela}
                className="text-xl leading-none text-zinc-500 hover:text-white"
                aria-label="Fechar"
              >
                ×
              </button>
            </div>

            {atual && caminho.length === 0 && (
              <p className="mt-3 rounded-lg bg-white/5 px-3 py-2 text-xs text-zinc-300">
                Atual: <strong>{atual.join(SEPARADOR)}</strong>
              </p>
            )}

            {caminho.length === 0 && ultimo && (
              <button
                type="button"
                onClick={() => aplicar(ultimo)}
                className="mt-3 w-full rounded-lg border-2 border-dashed border-pink-300/40 px-3 py-2 text-left text-sm text-pink-200 hover:bg-white/5"
              >
                Repetir: <strong>{ultimo.join(SEPARADOR)}</strong>
              </button>
            )}

            <div className="mt-3 flex flex-col gap-2">
              {opcoes.map((o) => (
                <button
                  key={o.nome}
                  type="button"
                  onClick={() => escolher(o.nome)}
                  className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3 text-left hover:border-pink-300/50 hover:bg-white/5"
                >
                  <span>
                    <span className="flex items-center gap-2 font-medium text-white">
                      {caminho.length === 0 && (
                        <span
                          className={`inline-block h-3 w-3 rounded-full border ${COR_CATEGORIA[o.nome] ?? ""}`}
                        />
                      )}
                      {o.nome}
                    </span>
                    {caminho.length === 0 && o.nome === "Protocolo" && (
                      <span className="block text-xs text-zinc-400">Marca a arcada completa</span>
                    )}
                    {o.descricao && (
                      <span className="block text-xs text-zinc-400">{o.descricao}</span>
                    )}
                  </span>
                  {o.filhos && <span className="text-zinc-500">›</span>}
                </button>
              ))}
            </div>

            <div className="mt-4 flex items-center justify-between">
              {caminho.length > 0 ? (
                <button
                  type="button"
                  onClick={() => setCaminho(caminho.slice(0, -1))}
                  className="text-sm text-zinc-400 hover:text-white"
                >
                  ‹ Voltar
                </button>
              ) : (
                <span />
              )}
              {algumMarcado && (
                <button
                  type="button"
                  onClick={remover}
                  className="text-sm font-medium text-rose-400 hover:underline"
                >
                  Remover marcação
                </button>
              )}
            </div>
          </div>
        </div>
        , document.body)}
    </div>
  );
}
