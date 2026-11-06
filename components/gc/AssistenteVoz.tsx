"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SEPARADOR, ehPontico, pedeCor } from "@/lib/catalogo";
import { agruparMarcacoes } from "@/lib/odontograma";
import { orcamento } from "@/lib/precos";
import { brl } from "@/lib/gc";
import { PERGUNTA, type EstadoVoz, type EtapaVoz, type RespostaVoz } from "@/lib/voz";
import type { Marcacoes } from "@/components/OdontogramaTrabalhos";

// Assistente por voz da Nova OS. Pergunta etapa por etapa (fala em voz alta),
// escuta a resposta (reconhecimento de voz do navegador), manda para a API
// interpretar e, no fim, lê o resumo e pede confirmação antes de preencher a OS.

/* eslint-disable @typescript-eslint/no-explicit-any */
type Reconhecedor = any;

function criarReconhecedor(): Reconhecedor | null {
  if (typeof window === "undefined") return null;
  const R = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
  if (!R) return null;
  const r = new R();
  r.lang = "pt-BR";
  r.interimResults = true;
  r.continuous = false;
  r.maxAlternatives = 1;
  return r;
}

export function estadoParaMarcacoes(estado: EstadoVoz): Marcacoes {
  const m: Marcacoes = {};
  for (const t of estado.trabalhos) for (const d of t.dentes) m[d] = t.servico.split(SEPARADOR);
  return m;
}

const dataFalada = (iso: string) => {
  const [a, m, d] = iso.split("-");
  return a ? `${d}/${m}` : "";
};

function listaDentes(dentes: string[]) {
  if (dentes.length === 1) return `dente ${dentes[0]}`;
  if (dentes.length >= 14) return dentes[0][0] === "1" || dentes[0][0] === "2" ? "arcada superior" : "arcada inferior";
  return `dentes ${dentes.slice(0, -1).join(", ")} e ${dentes[dentes.length - 1]}`;
}

interface Mensagem {
  de: "assistente" | "dentista";
  texto: string;
}

interface Props {
  token: string;
  precos: Record<string, number>;
  inicial: EstadoVoz;
  onAplicar: (estado: EstadoVoz) => void;
  onFechar: () => void;
}

export default function AssistenteVoz({ token, precos, inicial, onAplicar, onFechar }: Props) {
  const [estado, setEstado] = useState<EstadoVoz>(inicial);
  const [etapa, setEtapa] = useState<EtapaVoz>("paciente");
  const [pergunta, setPergunta] = useState<string>(PERGUNTA.paciente);
  const [status, setStatus] = useState<"falando" | "ouvindo" | "pensando" | "parado">("parado");
  const [parcial, setParcial] = useState("");
  const [texto, setTexto] = useState("");
  const [mudo, setMudo] = useState(false);
  const [historico, setHistorico] = useState<Mensagem[]>([]);
  const [semMicrofone, setSemMicrofone] = useState(false);
  const reconhecedor = useRef<Reconhecedor | null>(null);
  const ativo = useRef(true);
  const fimDaLista = useRef<HTMLDivElement>(null);
  // refs para os callbacks da voz enxergarem o valor atual
  const ref = useRef({ estado, etapa, pergunta, mudo });
  ref.current = { estado, etapa, pergunta, mudo };

  const grupos = useMemo(() => agruparMarcacoes(estadoParaMarcacoes(estado)), [estado]);
  const orc = useMemo(() => orcamento(grupos, precos), [grupos, precos]);
  const temPrecos = Object.keys(precos).length > 0;
  const precisaCor = (e: EstadoVoz) => e.trabalhos.some((t) => pedeCor(t.servico.split(SEPARADOR)) || ehPontico(t.servico.split(SEPARADOR)));

  useEffect(() => {
    fimDaLista.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [historico, parcial]);

  const pararTudo = useCallback(() => {
    try {
      reconhecedor.current?.abort();
    } catch {}
    if (typeof window !== "undefined") window.speechSynthesis?.cancel();
  }, []);

  useEffect(() => {
    ativo.current = true;
    return () => {
      ativo.current = false;
      pararTudo();
    };
  }, [pararTudo]);

  const ouvir = useCallback(() => {
    if (!ativo.current) return;
    const r = criarReconhecedor();
    if (!r) {
      setSemMicrofone(true);
      setStatus("parado");
      return;
    }
    reconhecedor.current = r;
    let final = "";
    r.onresult = (ev: any) => {
      let interino = "";
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const t = ev.results[i][0].transcript;
        if (ev.results[i].isFinal) final += t;
        else interino += t;
      }
      setParcial(final || interino);
    };
    r.onerror = (ev: any) => {
      if (ev.error === "not-allowed" || ev.error === "service-not-allowed") setSemMicrofone(true);
    };
    r.onend = () => {
      setParcial("");
      if (!ativo.current) return;
      if (final.trim()) responder(final.trim());
      else setStatus("parado");
    };
    setStatus("ouvindo");
    try {
      r.start();
    } catch {
      setStatus("parado");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const falar = useCallback(
    (frase: string, depois: "ouvir" | "nada" = "ouvir") => {
      setHistorico((h) => [...h, { de: "assistente", texto: frase }]);
      const sintese = typeof window !== "undefined" ? window.speechSynthesis : undefined;
      if (ref.current.mudo || !sintese) {
        if (depois === "ouvir") ouvir();
        else setStatus("parado");
        return;
      }
      sintese.cancel();
      const u = new SpeechSynthesisUtterance(frase);
      u.lang = "pt-BR";
      const voz = sintese.getVoices().find((v) => v.lang?.toLowerCase().startsWith("pt-br")) || sintese.getVoices().find((v) => v.lang?.toLowerCase().startsWith("pt"));
      if (voz) u.voice = voz;
      u.rate = 1.05;
      let terminou = false;
      const fim = () => {
        if (terminou) return;
        terminou = true;
        if (depois === "ouvir") ouvir();
        else setStatus("parado");
      };
      u.onend = fim;
      u.onerror = fim;
      setStatus("falando");
      sintese.speak(u);
      // alguns celulares não disparam onend: garante que segue
      setTimeout(fim, Math.min(20000, 1500 + frase.length * 75));
    },
    [ouvir]
  );

  function resumoFalado(e: EstadoVoz) {
    const partes = [`Paciente ${e.paciente || "sem nome"}.`];
    for (const t of e.trabalhos) partes.push(`${t.servico.split(SEPARADOR).join(", ")}, ${listaDentes(t.dentes)}${t.retrabalho ? ", retrabalho" : ""}.`);
    if (e.cor) partes.push(`Cor ${e.cor}.`);
    if (e.prazo) partes.push(`Prazo ${dataFalada(e.prazo)}.`);
    if (e.instalacao) partes.push(`Instalação ${dataFalada(e.instalacao)}.`);
    if (e.observacoes) partes.push(`Observação: ${e.observacoes}.`);
    const g = agruparMarcacoes(estadoParaMarcacoes(e));
    const o = orcamento(g, precos);
    if (temPrecos && o.total > 0) partes.push(`Valor estimado ${brl(o.total)}${o.semPreco ? ", mais os itens a combinar" : ""}.`);
    return partes.join(" ");
  }

  function irPara(proxima: EtapaVoz, e: EstadoVoz, prefixo = "") {
    setEtapa(proxima);
    const p = proxima === "resumo" ? `${resumoFalado(e)} ${PERGUNTA.resumo}` : PERGUNTA[proxima];
    setPergunta(PERGUNTA[proxima]);
    falar(prefixo ? `${prefixo} ${p}` : p);
  }

  function seguir(atual: EtapaVoz, e: EstadoVoz, semMais: boolean, prefixo: string) {
    switch (atual) {
      case "paciente":
        return irPara("trabalhos", e, prefixo);
      case "trabalhos":
        return irPara("mais_trabalhos", e, prefixo);
      case "mais_trabalhos":
        if (!semMais) return irPara("mais_trabalhos", e, prefixo);
        if (e.trabalhos.length === 0) return irPara("trabalhos", e, prefixo);
        return irPara(precisaCor(e) && !e.cor ? "cor" : "datas", e, prefixo);
      case "cor":
        return irPara("datas", e, prefixo);
      case "datas":
        return irPara("observacoes", e, prefixo);
      case "observacoes":
        return irPara("resumo", e, prefixo);
      case "resumo":
        return irPara("resumo", e, prefixo);
    }
  }

  async function responder(fala: string) {
    const { estado: e0, etapa: et, pergunta: pg } = ref.current;
    setHistorico((h) => [...h, { de: "dentista", texto: fala }]);
    setStatus("pensando");
    try {
      const r = await fetch("/api/voz/interpretar", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ etapa: et, fala, estado: e0, pergunta: pg }),
      });
      const j: RespostaVoz = await r.json().catch(() => ({ ok: false, erro: "resposta inválida" }));
      if (!ativo.current) return;
      if (!j.ok || !j.estado) {
        falar(j.erro || "Não entendi. Pode repetir?", r.status === 503 ? "nada" : "ouvir");
        return;
      }
      const novo = j.estado;
      setEstado(novo);
      if (et === "resumo" && j.confirmado) {
        falar("Perfeito! Preenchi a ordem de serviço. Agora anexe os arquivos e toque em enviar.", "nada");
        onAplicar(novo);
        return;
      }
      if (j.pergunta) {
        setPergunta(j.pergunta);
        falar(j.fala ? `${j.fala} ${j.pergunta}` : j.pergunta);
        return;
      }
      seguir(et, novo, !!j.semMais, j.fala || "");
    } catch {
      falar("Falhou a conexão. Tente de novo.", "nada");
    }
  }

  function comecar() {
    falar(pergunta);
  }

  function enviarTexto(e: React.FormEvent) {
    e.preventDefault();
    const t = texto.trim();
    if (!t || status === "pensando") return;
    pararTudo();
    setTexto("");
    responder(t);
  }

  function tocarMicrofone() {
    if (status === "ouvindo") {
      try {
        reconhecedor.current?.stop();
      } catch {}
      return;
    }
    window.speechSynthesis?.cancel();
    ouvir();
  }

  const corOrbe =
    status === "ouvindo"
      ? "from-[#e0649c] to-[#8f5bd9] animate-pulse"
      : status === "falando"
        ? "from-[#5fb8cf] to-[#8f5bd9]"
        : status === "pensando"
          ? "from-[#f2a43a] to-[#e0649c] animate-pulse"
          : "from-zinc-600 to-zinc-800";

  const rotuloStatus =
    status === "ouvindo" ? "Ouvindo… pode falar" : status === "falando" ? "Falando…" : status === "pensando" ? "Entendendo…" : historico.length ? "Toque no microfone para responder" : "Toque em comecar";

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 backdrop-blur-sm sm:items-center sm:p-6" role="dialog" aria-label="Assistente por voz">
      <div className="gc-card flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-b-none sm:rounded-b-[1.25rem]">
        <div className="flex items-center justify-between gap-3 border-b border-white/5 px-5 py-4">
          <div>
            <p className="gc-eyebrow">Assistente por voz</p>
            <p className="text-sm text-zinc-400">Responda falando. No fim eu leio o resumo para você confirmar.</p>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setMudo((m) => !m)} className="gc-chip" title="Ligar/desligar a voz do assistente">
              {mudo ? "Voz desligada" : "Voz ligada"}
            </button>
            <button type="button" onClick={() => { pararTudo(); onFechar(); }} className="text-2xl leading-none text-zinc-400 hover:text-white" aria-label="Fechar">
              ×
            </button>
          </div>
        </div>

        <div className="grid min-h-0 flex-1 gap-0 md:grid-cols-[1.4fr_1fr]">
          <div className="flex min-h-0 flex-col">
            <div className="min-h-[220px] flex-1 overflow-y-auto px-5 py-4">
              {historico.length === 0 && (
                <p className="py-6 text-center text-sm text-zinc-400">
                  Vou perguntar o paciente, os trabalhos e dentes, a cor, o prazo e as observações — um de cada vez.
                </p>
              )}
              <div className="flex flex-col gap-2.5">
                {historico.map((m, i) => (
                  <p
                    key={i}
                    className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-sm ${
                      m.de === "assistente" ? "self-start bg-white/[0.06] text-zinc-100" : "self-end bg-gradient-to-r from-[#8f5bd9]/70 to-[#e0649c]/70 text-white"
                    }`}
                  >
                    {m.texto}
                  </p>
                ))}
                {parcial && <p className="max-w-[85%] self-end rounded-2xl bg-white/[0.04] px-3.5 py-2 text-sm italic text-zinc-300">{parcial}</p>}
                <div ref={fimDaLista} />
              </div>
            </div>

            <div className="border-t border-white/5 px-5 py-4">
              <div className="flex items-center gap-4">
                {historico.length === 0 ? (
                  <button type="button" onClick={comecar} className="gc-btn gc-btn-principal">
                    Começar
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={tocarMicrofone}
                    disabled={status === "pensando" || semMicrofone}
                    className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-gradient-to-br text-white shadow-lg transition disabled:opacity-40 ${corOrbe}`}
                    aria-label={status === "ouvindo" ? "Parar de ouvir" : "Falar"}
                  >
                    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="9" y="3" width="6" height="11" rx="3" />
                      <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
                    </svg>
                  </button>
                )}
                <p className="text-sm text-zinc-300">{semMicrofone ? "Microfone indisponível neste navegador — digite a resposta abaixo." : rotuloStatus}</p>
              </div>
              <form onSubmit={enviarTexto} className="mt-3 flex gap-2">
                <input className="gc-input flex-1" placeholder="Ou digite a resposta aqui…" value={texto} onChange={(e) => setTexto(e.target.value)} />
                <button type="submit" className="gc-btn gc-btn-secundario" disabled={!texto.trim() || status === "pensando"}>
                  Enviar
                </button>
              </form>
              <button type="button" onClick={() => { pararTudo(); onAplicar(estado); }} className="mt-3 text-xs text-zinc-400 underline-offset-4 hover:text-white hover:underline md:hidden">
                Parar aqui e terminar no formulário
              </button>
            </div>
          </div>

          <div className="hidden min-h-0 overflow-y-auto border-l border-white/5 bg-white/[0.015] px-5 py-4 md:block">
            <p className="gc-eyebrow">O que já entendi</p>
            <dl className="mt-3 flex flex-col gap-3 text-sm">
              <Item rotulo="Paciente" valor={estado.paciente} />
              <div>
                <dt className="text-xs uppercase tracking-wider text-zinc-500">Trabalhos</dt>
                {estado.trabalhos.length === 0 ? (
                  <dd className="text-zinc-500">—</dd>
                ) : (
                  estado.trabalhos.map((t, i) => (
                    <dd key={i} className="mt-1 text-white">
                      {t.servico} <span className="text-zinc-400">· {listaDentes(t.dentes)}</span>
                    </dd>
                  ))
                )}
              </div>
              <Item rotulo="Cor" valor={estado.cor} />
              <Item rotulo="Prazo" valor={estado.prazo && dataFalada(estado.prazo)} />
              <Item rotulo="Instalação" valor={estado.instalacao && dataFalada(estado.instalacao)} />
              <Item rotulo="Observações" valor={estado.observacoes} />
              {temPrecos && grupos.length > 0 && <Item rotulo="Valor estimado" valor={brl(orc.total) + (orc.semPreco ? " + a combinar" : "")} />}
            </dl>
            <button type="button" onClick={() => { pararTudo(); onAplicar(estado); }} className="mt-6 text-sm text-zinc-400 underline-offset-4 hover:text-white hover:underline">
              Parar aqui e terminar no formulário
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Item({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wider text-zinc-500">{rotulo}</dt>
      <dd className={valor ? "text-white" : "text-zinc-500"}>{valor || "—"}</dd>
    </div>
  );
}
