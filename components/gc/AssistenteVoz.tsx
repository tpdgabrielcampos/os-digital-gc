"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CATALOGO, SEPARADOR, todasAsFolhas, unidadeDoServico } from "@/lib/catalogo";
import { ORDEM_DENTES, agruparMarcacoes } from "@/lib/odontograma";
import { orcamento } from "@/lib/precos";
import { brl } from "@/lib/gc";
import { CONFIG_PADRAO, DICA, PERGUNTAS, pergunta as sortearPergunta, type ConfigVoz, type EstadoVoz, type EtapaVoz, type RespostaVoz } from "@/lib/voz";
import {
  candidatosDaFala,
  candidatosDosNos,
  corDaFala,
  dataDaFala,
  dataFalada as dataPorExtenso,
  dataMinima,
  dentesDaFala,
  dentesFalados,
  ehNao,
  ehRetrabalho,
  ehSim,
  filtrar,
  isoLocal,
  nomePaciente,
  nomeTrabalho,
  perguntaDentes,
  perguntaOpcao,
  responderOpcao,
  trabalhoPedeCor,
  variosTrabalhos,
} from "@/lib/vozRoteiro";
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
  r.continuous = true; // a gente decide quando parou de falar (tempo de pausa ajustável)
  r.maxAlternatives = 1;
  return r;
}

/** Frases que se repetem sempre iguais: o áudio fica pronto antes de precisar. */
const FIXAS: Set<string> = (() => {
  const f = new Set<string>(Object.values(PERGUNTAS).filter(Boolean) as string[]);
  ["Anotado.", "Beleza.", "Qual?", "Não peguei.", "Não peguei os dentes.", "Não peguei a cor.", "Não peguei a data.", "Não peguei qual é o trabalho.", "Anotado como urgência.", "Tranquilo, sem cor por enquanto."].forEach((x) => f.add(x));
  const folhas = todasAsFolhas();
  for (const x of folhas) f.add(perguntaDentes(x));
  // perguntas de opção de cada ponto do catálogo
  const prefixos = new Set<string>();
  for (const x of folhas) for (let i = 1; i < x.length; i++) prefixos.add(x.slice(0, i).join("|"));
  for (const p of Array.from(prefixos)) {
    const c = folhas.filter((x) => x.slice(0, p.split("|").length).join("|") === p);
    if (c.length > 1) f.add(perguntaOpcao(c));
  }
  for (const peca of ["Coroa", "Pôntico"]) {
    const c = folhas.filter((x) => (x[0] === "PSI" || x[0] === "PSD") && x[1] === peca);
    f.add(perguntaOpcao(c));
  }
  void CATALOGO;
  return f;
})();

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

/** Palavras de um texto, sem acento e pontuação. */
function palavras(t: string) {
  return t
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2);
}

/** O microfone captou a própria voz do assistente? (maioria das palavras igual à última fala) */
function ehEco(ouvido: string, falado: string) {
  const a = palavras(ouvido);
  if (a.length < 3) return false;
  const b = new Set(palavras(falado));
  const iguais = a.filter((w) => b.has(w)).length;
  return iguais / a.length >= 0.6;
}

/** Voz escolhida pelo dentista, ou a mais natural disponível em português do Brasil. */
function escolherVoz(todas: SpeechSynthesisVoice[], nome: string) {
  const pt = todas.filter((v) => v.lang?.toLowerCase().startsWith("pt"));
  if (nome) {
    const v = pt.find((x) => x.name === nome);
    if (v) return v;
  }
  const br = pt.filter((v) => v.lang.toLowerCase() === "pt-br" || v.lang.toLowerCase() === "pt_br");
  return (
    br.find((v) => /natural|neural|online/i.test(v.name)) ||
    br.find((v) => /google/i.test(v.name)) ||
    br.find((v) => /francisca|thalita|maria/i.test(v.name)) ||
    br[0] ||
    pt[0]
  );
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
  const [pergunta, setPergunta] = useState<string>(() => sortearPergunta("paciente"));
  const [config, setConfig] = useState<ConfigVoz & { carregado?: boolean }>(CONFIG_PADRAO);

  const [status, setStatus] = useState<"falando" | "ouvindo" | "pensando" | "parado">("parado");
  const [parcial, setParcial] = useState("");
  const [texto, setTexto] = useState("");
  const [mudo, setMudo] = useState(false);
  const [historico, setHistorico] = useState<Mensagem[]>([]);
  const [semMicrofone, setSemMicrofone] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const ultimaFala = useRef("");
  const geracao = useRef(0); // cada fala nova invalida a anterior
  const reconhecedor = useRef<Reconhecedor | null>(null);
  const ativo = useRef(true);
  const fimDaLista = useRef<HTMLDivElement>(null);
  // refs para os callbacks da voz enxergarem o valor atual
  const ref = useRef({ estado, etapa, pergunta, mudo, config });
  ref.current = { estado, etapa, pergunta, mudo, config };

  // Ajustes definidos pelo laboratório (/dashboard/voz): voz premium, velocidade e pausa.
  const premium = useRef(false);
  const audioAtual = useRef<HTMLAudioElement | null>(null);
  useEffect(() => {
    fetch("/api/voz/config", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        premium.current = !!j.premium;
        setConfig({ ...CONFIG_PADRAO, velocidade: Number(j.velocidade) || 1, pausa: Number(j.pausa) || 1300, carregado: true });
      })
      .catch(() => {});
  }, []);

  const grupos = useMemo(() => agruparMarcacoes(estadoParaMarcacoes(estado)), [estado]);
  const orc = useMemo(() => orcamento(grupos, precos), [grupos, precos]);
  const temPrecos = Object.keys(precos).length > 0;

  useEffect(() => {
    fimDaLista.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [historico, parcial]);

  const pararTudo = useCallback(() => {
    geracao.current++;
    try {
      reconhecedor.current?.abort();
    } catch {}
    audioAtual.current?.pause();
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
    let interino = "";
    let silencio: ReturnType<typeof setTimeout> | undefined;
    // Só considera que terminou depois de X segundos sem falar nada novo.
    const esperarSilencio = (fechada: boolean) => {
      if (silencio) clearTimeout(silencio);
      // quando o reconhecimento já fechou a frase, espera menos
      const p = ref.current.config.pausa;
      silencio = setTimeout(() => {
        try {
          r.stop();
        } catch {}
      }, fechada ? Math.min(p, 800) : p);
    };
    r.onresult = (ev: any) => {
      final = "";
      interino = "";
      for (let i = 0; i < ev.results.length; i++) {
        const t = ev.results[i][0].transcript;
        if (ev.results[i].isFinal) final += t + " ";
        else interino += t;
      }
      setParcial((final + interino).trim());
      esperarSilencio(!interino.trim());
    };
    let erro = "";
    r.onerror = (ev: any) => {
      erro = ev.error;
      if (ev.error === "not-allowed" || ev.error === "service-not-allowed") setSemMicrofone(true);
    };
    r.onend = () => {
      if (silencio) clearTimeout(silencio);
      setParcial("");
      if (!ativo.current) return;
      const ouvido = (final + interino).trim();
      if (ouvido && ehEco(ouvido, ultimaFala.current)) {
        // captou a voz do próprio assistente: descarta e escuta de novo
        setAviso("Captei a minha própria voz e ignorei. Se acontecer de novo, use fone de ouvido ou desligue a voz do assistente.");
        ultimaFala.current = "";
        setTimeout(() => ouvir(), 300);
        return;
      }
      if (ouvido) responder(ouvido);
      else {
        setStatus("parado");
        if (erro === "no-speech" || erro === "audio-capture")
          setAviso("Não ouvi nada. Confira se o navegador está usando o microfone certo (ícone de câmera/microfone na barra de endereço) e toque no microfone para tentar de novo.");
        else if (erro === "network") setAviso("Sem conexão com o reconhecimento de voz. Tente de novo ou digite a resposta.");
      }
    };
    setAviso(null);
    setStatus("ouvindo");
    try {
      r.start();
    } catch {
      setStatus("parado");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------- fala do assistente ----------
  // Áudios das frases fixas ficam guardados no navegador (tocam na hora).
  const cacheAudio = useRef(new Map<string, Promise<Blob>>());

  async function pedirAudio(frase: string) {
    const r = await fetch("/api/voz/falar", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ texto: frase }),
    });
    if (!r.ok) throw new Error(String(r.status));
    return r;
  }

  function audioGuardado(frase: string) {
    let p = cacheAudio.current.get(frase);
    if (!p) {
      p = pedirAudio(frase).then((r) => r.blob());
      p.catch(() => cacheAudio.current.delete(frase));
      cacheAudio.current.set(frase, p);
    }
    return p;
  }

  /** Frase fixa → do cache; frase nova → vem aos pedaços (toca enquanto é gerada). */
  function obterAudio(frase: string): Promise<Blob | Response> {
    if (FIXAS.has(frase) || cacheAudio.current.has(frase)) return audioGuardado(frase);
    return pedirAudio(frase);
  }

  function tocar(item: Blob | Response): Promise<void> {
    return new Promise((fim) => {
      let acabou = false;
      const terminar = () => {
        if (acabou) return;
        acabou = true;
        fim();
      };
      const MS = typeof window !== "undefined" ? (window as any).MediaSource : undefined;
      if (item instanceof Blob || !item.body || !MS?.isTypeSupported?.("audio/mpeg")) {
        const toca = async () => {
          const blob = item instanceof Blob ? item : await item.blob();
          const url = URL.createObjectURL(blob);
          const a = new Audio(url);
          audioAtual.current = a;
          a.onended = a.onerror = a.onpause = () => {
            URL.revokeObjectURL(url);
            terminar();
          };
          await a.play();
        };
        toca().catch(terminar);
        return;
      }
      // tocando enquanto chega (MediaSource)
      const ms = new MS();
      const url = URL.createObjectURL(ms);
      const a = new Audio(url);
      audioAtual.current = a;
      a.onended = a.onerror = a.onpause = () => {
        URL.revokeObjectURL(url);
        terminar();
      };
      ms.addEventListener("sourceopen", async () => {
        try {
          const sb = ms.addSourceBuffer("audio/mpeg");
          const leitor = (item as Response).body!.getReader();
          let comecou = false;
          for (;;) {
            const { done, value } = await leitor.read();
            if (done) break;
            if (!ativo.current || acabou) {
              leitor.cancel().catch(() => {});
              return;
            }
            await new Promise<void>((ok) => {
              sb.addEventListener("updateend", () => ok(), { once: true });
              sb.appendBuffer(value);
            });
            if (!comecou) {
              comecou = true;
              a.play().catch(terminar);
            }
          }
          if (ms.readyState === "open") ms.endOfStream();
          if (!comecou) terminar();
        } catch {
          terminar();
        }
      });
    });
  }

  const semPremium = useRef(false);
  const falhasVoz = useRef(0);

  // Voz premium (ElevenLabs). Pede todos os pedaços juntos e toca um atrás do outro;
  // o texto aparece na tela junto com a voz. Se falhar, cai para a voz do navegador.
  async function falarPremium(partes: string[], depois: "ouvir" | "nada") {
    const minha = ++geracao.current;
    const valendo = () => ativo.current && geracao.current === minha;
    setStatus("falando");
    const itens = partes.map((p) => obterAudio(p));
    itens.forEach((i) => i.catch(() => {}));
    for (let i = 0; i < partes.length; i++) {
      let item: Blob | Response;
      try {
        try {
          item = await itens[i];
        } catch {
          // falhou (ex.: servidor "acordando"): tenta mais uma vez antes de desistir
          if (!valendo()) return;
          item = await pedirAudio(partes[i]);
        }
        falhasVoz.current = 0;
      } catch {
        if (!valendo()) return;
        // só esta fala sai na voz do navegador; a voz premium volta na próxima
        // (desliga de vez só se falhar 3 vezes seguidas)
        falhasVoz.current++;
        premium.current = false;
        falarRef.current(partes.slice(i), depois, true);
        if (falhasVoz.current < 3) premium.current = true;
        else semPremium.current = true;
        setHistorico((h) => [...h, ...partes.slice(i).map((t) => ({ de: "assistente" as const, texto: t }))]);
        return;
      }
      if (!valendo()) return;
      setHistorico((h) => [...h, { de: "assistente", texto: partes[i] }]);
      await tocar(item);
      if (!valendo()) return;
    }
    setTimeout(() => {
      if (!valendo()) return;
      if (depois === "ouvir") ouvir();
      else setStatus("parado");
    }, 200);
  }
  const falarRef = useRef<(f: string | string[], d: "ouvir" | "nada", jaNoHistorico?: boolean) => void>(() => {});

  const falar = useCallback(
    (entrada: string | string[], depois: "ouvir" | "nada" = "ouvir", jaNoHistorico = false) => {
      const partes = (Array.isArray(entrada) ? entrada : [entrada]).map((p) => p.trim()).filter(Boolean);
      const frase = partes.join(" ");
      ultimaFala.current = frase;
      try {
        reconhecedor.current?.abort();
      } catch {}
      geracao.current++;
      audioAtual.current?.pause();
      if (!ref.current.mudo && premium.current) {
        falarPremium(partes, depois);
        return;
      }
      if (!jaNoHistorico) setHistorico((h) => [...h, ...partes.map((t) => ({ de: "assistente" as const, texto: t }))]);
      const sintese = typeof window !== "undefined" ? window.speechSynthesis : undefined;
      if (ref.current.mudo || !sintese) {
        if (depois === "ouvir") ouvir();
        else setStatus("parado");
        return;
      }
      sintese.cancel();
      const { config: cfg } = ref.current;
      const voz = escolherVoz(sintese.getVoices(), "");
      // Fala frase por frase: algumas vozes online cortam textos longos.
      const pedacos = frase.match(/[^.!?]+[.!?]*/g)?.map((x) => x.trim()).filter(Boolean) ?? [frase];
      let terminou = false;
      const fim = () => {
        if (terminou) return;
        // só começa a ouvir depois que a voz terminou de verdade (evita captar a própria fala)
        if (sintese.speaking) {
          setTimeout(fim, 200);
          return;
        }
        terminou = true;
        setTimeout(() => {
          if (depois === "ouvir") ouvir();
          else setStatus("parado");
        }, 300);
      };
      pedacos.forEach((p, i) => {
        const u = new SpeechSynthesisUtterance(p);
        u.lang = "pt-BR";
        if (voz) u.voice = voz;
        u.rate = cfg.velocidade;
        u.pitch = 1;
        if (i === pedacos.length - 1) {
          u.onend = fim;
          u.onerror = fim;
        }
        sintese.speak(u);
      });
      setStatus("falando");
      // alguns celulares não disparam onend: garante que segue
      setTimeout(fim, 4000 + (frase.length * 110) / cfg.velocidade);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ouvir]
  );
  falarRef.current = falar;

  // Deixa as perguntas fixas prontas assim que abre (as que já existem só são baixadas).
  useEffect(() => {
    if (!config.carregado || !premium.current) return;
    let cancelado = false;
    (async () => {
      for (const f of Array.from(FIXAS)) {
        if (cancelado) return;
        await audioGuardado(f).catch(() => null);
      }
    })();
    return () => {
      cancelado = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.carregado]);

  // ---------- roteiro ----------
  // trabalho sendo montado (ainda faltam opção ou dentes) e os que a IA já entendeu na mesma fala
  const rascunho = useRef<{ cands: string[][]; dentes: string[]; retrabalho: boolean } | null>(null);
  const fila = useRef<{ cands: string[][]; dentes: string[]; retrabalho: boolean }[]>([]);
  const dataSugerida = useRef<string | null>(null);
  const errosSeguidos = useRef(0);

  function resumoFalado(e: EstadoVoz) {
    const partes = [`Então ficou assim: ${e.paciente || "paciente sem nome"}.`];
    for (const t of e.trabalhos) {
      const f = t.servico.split(SEPARADOR);
      partes.push(`${nomeTrabalho(f)} ${dentesFalados(t.dentes, f)}${t.retrabalho ? ", retrabalho" : ""}.`.replace(/^./, (c) => c.toUpperCase()));
    }
    if (e.cor) partes.push(`Cor ${e.cor}.`);
    if (e.urgente) partes.push("Urgência.");
    else if (e.prazo) partes.push(`Entrega ${dataPorExtenso(e.prazo)}.`);
    if (e.observacoes) partes.push(`Observação: ${e.observacoes}.`);
    const g = agruparMarcacoes(estadoParaMarcacoes(e));
    const o = orcamento(g, precos);
    if (temPrecos && o.total > 0) partes.push(`Valor estimado ${brl(o.total)}${o.semPreco ? ", mais os itens a combinar" : ""}.`);
    return partes.join(" ");
  }

  function mudarEstado(e: EstadoVoz) {
    ref.current.estado = e;
    setEstado(e);
  }

  function perguntar(proxima: EtapaVoz, e: EstadoVoz, prefixo = "", q = sortearPergunta(proxima)) {
    ref.current.etapa = proxima;
    ref.current.pergunta = q;
    setEtapa(proxima);
    setPergunta(q);
    falar(proxima === "resumo" ? [prefixo, resumoFalado(e), q] : [prefixo, q]);
  }

  /** Depois dos trabalhos: cor (se precisar) e data de entrega. */
  function depoisDosTrabalhos(e: EstadoVoz, prefixo = "") {
    if (e.trabalhos.length === 0) return perguntar("trabalhos", e, prefixo);
    if (e.trabalhos.some((t) => trabalhoPedeCor(t.servico)) && !e.cor) return perguntar("cor", e, prefixo);
    if (!e.prazo && !e.urgente) return perguntar("datas", e, prefixo);
    return perguntar("observacoes", e, prefixo);
  }

  function ajustarDentes(f: string[], dentes: string[]) {
    const u = unidadeDoServico(f);
    if (u === "elemento") return dentes;
    const q = new Set(dentes.map((d) => d[0]));
    if (u === "meia arcada") return ORDEM_DENTES.filter((d) => q.has(d[0]));
    const sup = q.has("1") || q.has("2");
    const inf = q.has("3") || q.has("4");
    return ORDEM_DENTES.filter((d) => ((d[0] === "1" || d[0] === "2") && sup) || ((d[0] === "3" || d[0] === "4") && inf));
  }

  /** Pergunta o que falta no trabalho em montagem, ou registra quando estiver completo. */
  function avancarTrabalho(e: EstadoVoz, prefixo = "") {
    const r = rascunho.current;
    if (!r) return depoisDosTrabalhos(e, prefixo);
    if (r.cands.length > 1) return perguntar("trabalho_opcao", e, prefixo, perguntaOpcao(r.cands));
    const f = r.cands[0];
    if (!r.dentes.length) return perguntar("trabalho_dentes", e, prefixo, perguntaDentes(f));
    const servico = f.join(SEPARADOR);
    const dentes = ajustarDentes(f, r.dentes);
    const existente = e.trabalhos.find((t) => t.servico === servico);
    const trabalhos = existente
      ? e.trabalhos.map((t) => (t === existente ? { ...t, dentes: ORDEM_DENTES.filter((d) => t.dentes.includes(d) || dentes.includes(d)) } : t))
      : [...e.trabalhos, { servico, dentes, retrabalho: r.retrabalho }];
    // outro trabalho já usava algum desses dentes? o novo vale
    const limpos = trabalhos
      .map((t) => (t.servico === servico ? t : { ...t, dentes: t.dentes.filter((d) => !dentes.includes(d)) }))
      .filter((t) => t.dentes.length > 0);
    const novo = { ...e, trabalhos: limpos };
    mudarEstado(novo);
    rascunho.current = fila.current.shift() ?? null;
    // ex.: ponte — o pôntico segue o mesmo tipo (implante/dente) e material da coroa
    if (rascunho.current && rascunho.current.cands.length > 1) {
      const herda = [f[0], f[2]].filter(Boolean).map((n) => [n.normalize("NFD").replace(/[\u0300-\u036f]/g, "")]);
      rascunho.current.cands = filtrar(rascunho.current.cands, herda);
    }
    const item = `${nomeTrabalho(f)} ${dentesFalados(dentes, f)}`;
    const ok = prefixo.startsWith("Anotado:") ? `${prefixo.replace(/\.$/, "")}, e ${item}.` : `${prefixo ? prefixo + " " : ""}Anotado: ${item}.`;
    if (rascunho.current) return avancarTrabalho(novo, ok);
    return perguntar("mais_trabalhos", novo, ok);
  }

  async function perguntarIA(et: EtapaVoz, fala: string, e: EstadoVoz, pg: string): Promise<RespostaVoz> {
    const r = await fetch("/api/voz/interpretar", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ etapa: et, fala, estado: e, pergunta: pg }),
    });
    const j: RespostaVoz = await r.json().catch(() => ({ ok: false, erro: "resposta inválida" }));
    if (!j.ok && r.status === 503) j.erro = j.erro || "O assistente não está ativo.";
    return j;
  }

  /** Repete a pergunta atual (com um aviso curto). */
  function repetir(aviso = "Não peguei.") {
    errosSeguidos.current++;
    const { etapa: et, pergunta: pg } = ref.current;
    if (errosSeguidos.current >= 3) setAviso("Se preferir, digite a resposta aqui embaixo ou toque em “Parar aqui e terminar no formulário”.");
    falar([aviso, pg]);
    ref.current.etapa = et;
  }

  async function novoTrabalho(fala: string, e: EstadoVoz) {
    const local = variosTrabalhos(fala) ? null : candidatosDaFala(fala);
    if (local) {
      const unico = local.length === 1 ? local[0] : undefined;
      rascunho.current = { cands: local, dentes: dentesDaFala(fala, unico), retrabalho: ehRetrabalho(fala) };
      fila.current = [];
      return avancarTrabalho(e);
    }
    setStatus("pensando");
    const j = await perguntarIA("trabalhos", fala, e, ref.current.pergunta);
    if (!ativo.current) return;
    if (!j.ok) return falar(j.erro || "Não entendi. Pode repetir?", "ouvir");
    const itens = (j.itens ?? [])
      .map((t) => {
        const cands = candidatosDosNos(t.nos);
        if (!cands) return null;
        const dentes = t.dentes.length ? (cands.length === 1 ? ajustarDentes(cands[0], t.dentes) : t.dentes) : [];
        return { cands, dentes, retrabalho: t.retrabalho };
      })
      .filter((x): x is { cands: string[][]; dentes: string[]; retrabalho: boolean } => !!x);
    if (!itens.length) return repetir("Não peguei qual é o trabalho.");
    rascunho.current = itens[0];
    fila.current = itens.slice(1);
    return avancarTrabalho(e);
  }

  async function responder(fala: string) {
    const { estado: e, etapa: et, pergunta: pg } = ref.current;
    setHistorico((h) => [...h, { de: "dentista", texto: fala }]);
    setAviso(null);
    try {
      switch (et) {
        case "paciente": {
          const nome = nomePaciente(fala);
          if (!nome) return repetir();
          errosSeguidos.current = 0;
          const novo = { ...e, paciente: nome };
          mudarEstado(novo);
          return perguntar("trabalhos", novo, "Anotado.");
        }
        case "trabalhos":
        case "mais_trabalhos": {
          if (ehNao(fala) && (et === "mais_trabalhos" || e.trabalhos.length > 0)) return depoisDosTrabalhos(e, "Beleza.");
          if (et === "mais_trabalhos" && ehSim(fala) && fala.trim().split(/\s+/).length <= 3) return perguntar("trabalhos", e, "", "Qual?");
          errosSeguidos.current = 0;
          return await novoTrabalho(fala, e);
        }
        case "trabalho_opcao": {
          const r = rascunho.current;
          if (!r) return perguntar("trabalhos", e);
          const antes = r.cands.length;
          const cands = responderOpcao(r.cands, fala);
          const dentes = dentesDaFala(fala, cands.length === 1 ? cands[0] : undefined);
          if (dentes.length) r.dentes = dentes;
          if (cands.length === antes) {
            // talvez ele tenha descrito outro trabalho: tenta entender como trabalho novo
            const outro = candidatosDaFala(fala);
            if (!outro) return repetir();
            r.cands = outro;
          } else r.cands = cands;
          errosSeguidos.current = 0;
          return avancarTrabalho(e);
        }
        case "trabalho_dentes": {
          const r = rascunho.current;
          if (!r) return perguntar("trabalhos", e);
          const dentes = dentesDaFala(fala, r.cands[0]);
          if (!dentes.length) return repetir("Não peguei os dentes.");
          r.dentes = dentes;
          errosSeguidos.current = 0;
          return avancarTrabalho(e);
        }
        case "cor": {
          let cor = corDaFala(fala);
          if (!cor) {
            if (ehNao(fala) || /depois|nao sei|não sei|definir|combinar|foto/i.test(fala)) cor = "";
            else if (fala.trim().length <= 30) cor = fala.trim();
            else return repetir("Não peguei a cor.");
          }
          errosSeguidos.current = 0;
          const novo = { ...e, cor };
          mudarEstado(novo);
          return depoisDosTrabalhos(novo, cor ? `Cor ${cor}.` : "Tranquilo, sem cor por enquanto.");
        }
        case "datas": {
          const hojeIso = isoLocal(new Date());
          const minimo = dataMinima(e.trabalhos.map((t) => t.servico), hojeIso);
          let r = dataSugerida.current && ehSim(fala) ? { data: dataSugerida.current } : dataDaFala(fala, hojeIso);
          dataSugerida.current = null;
          if (!r) {
            setStatus("pensando");
            const j = await perguntarIA("datas", fala, e, pg);
            if (!ativo.current) return;
            r = j.ok ? (j.urgente ? { urgente: true } : j.prazo ? { data: j.prazo } : null) : null;
          }
          if (!r) return repetir("Não peguei a data.");
          errosSeguidos.current = 0;
          if (r.urgente) {
            const novo = { ...e, prazo: "", urgente: true };
            mudarEstado(novo);
            return perguntar("observacoes", novo, "Anotado como urgência.");
          }
          if (r.data! < minimo) {
            dataSugerida.current = minimo;
            return perguntar("datas", e, "", `Pra esse caso o mínimo é ${dataPorExtenso(minimo)}. Pode ser?`);
          }
          const novo = { ...e, prazo: r.data!, urgente: false };
          mudarEstado(novo);
          return perguntar("observacoes", novo, `Entrega ${dataPorExtenso(r.data!)}.`);
        }
        case "observacoes": {
          const obs = ehNao(fala) ? "" : fala.trim().replace(/^./, (c) => c.toUpperCase());
          const novo = { ...e, observacoes: obs };
          mudarEstado(novo);
          return perguntar("resumo", novo, obs ? "Anotado." : "");
        }
        case "resumo": {
          if (ehSim(fala)) {
            falar(e.urgente ? "Fechou! Preenchi a OS. Como é urgência, depois de enviar me chama no WhatsApp pra combinar a data." : "Fechou! Preenchi a OS pra você. Agora é só anexar os arquivos e enviar.", "nada");
            onAplicar(e);
            return;
          }
          setStatus("pensando");
          const j = await perguntarIA("resumo", fala, e, pg);
          if (!ativo.current) return;
          if (!j.ok || !j.estado) return falar(j.erro || "Não entendi. Pode repetir?", "ouvir");
          if (j.confirmado) {
            falar("Fechou! Preenchi a OS pra você. Agora é só anexar os arquivos e enviar.", "nada");
            onAplicar(j.estado);
            return;
          }
          mudarEstado(j.estado);
          return perguntar("resumo", j.estado, j.fala || "Corrigido.");
        }
      }
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
    status === "ouvindo" ? "Ouvindo… pode falar" : status === "falando" ? "Falando…" : status === "pensando" ? "Entendendo…" : historico.length ? "Toque no microfone para responder" : "Toque em começar";

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
                <div className="min-w-0">
                  <p className="text-sm text-zinc-300">{semMicrofone ? "Microfone indisponível neste navegador — digite a resposta abaixo." : rotuloStatus}</p>
                  {historico.length > 0 && DICA[etapa] && <p className="mt-0.5 text-xs text-zinc-500">{DICA[etapa]}</p>}
                </div>
              </div>
              {aviso && <p className="mt-3 rounded-xl bg-amber-500/10 px-3 py-2 text-xs text-amber-200">{aviso}</p>}
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
              <Item rotulo="Entrega" valor={estado.urgente ? "Urgência" : estado.prazo && dataFalada(estado.prazo)} />
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
