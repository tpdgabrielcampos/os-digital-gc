"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useDentista } from "@/components/gc/PortalShell";
import MascoteGC, { type HumorMascote } from "@/components/gc/MascoteGC";

// Assistente do portal do dentista: fica na barra lateral (no celular, num botão
// flutuante). O dentista toca no microfone e pede para achar um paciente/caso ou
// tira uma dúvida técnica com a IA. A busca chega na lista "Minhas OS" pelo
// evento "gc:busca" (e fica guardada se ele estiver em outra página).

export const EVENTO_BUSCA = "gc:busca";
export const CHAVE_BUSCA = "gc-busca";
export interface BuscaAssistente {
  ids: string[];
  rotulo: string;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
type Status = "parado" | "ouvindo" | "pensando" | "falando";

interface Resposta {
  ok: boolean;
  erro?: string;
  tipo?: "busca" | "consulta" | "nova_os" | "outro";
  fala?: string;
  texto?: string;
  ids?: string[];
  rotulo?: string;
}

const SUGESTOES = ["O que está aguardando minha aprovação?", "Qual o espaço oclusal mínimo para coroa de zircônia?"];

function criarReconhecedor() {
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

function escolherVoz(todas: SpeechSynthesisVoice[]) {
  const br = todas.filter((v) => /pt[-_]br/i.test(v.lang));
  return br.find((v) => /natural|neural|online/i.test(v.name)) || br.find((v) => /google/i.test(v.name)) || br[0] || todas.find((v) => v.lang?.toLowerCase().startsWith("pt"));
}

export default function AssistentePortal({ modo }: { modo: "lateral" | "flutuante" }) {
  const router = useRouter();
  const caminho = usePathname();
  const { sessao, dentista } = useDentista();
  const token = sessao.access_token;
  const primeiroNome = (dentista.nome || "").split(" ").filter((p) => !/^dra?\.?$/i.test(p))[0] || "";
  const [aberto, setAberto] = useState(false);
  // na barra lateral o balão só aparece durante a conversa e some sozinho depois
  const [balaoVisivel, setBalaoVisivel] = useState(false);
  const [status, setStatus] = useState<Status>("parado");
  const [balao, setBalao] = useState(primeiroNome ? `Oi, ${primeiroNome}! Toque no microfone e me peça um paciente ou tire uma dúvida técnica.` : "Oi! Toque no microfone e me peça um paciente ou tire uma dúvida técnica.");
  const [detalhe, setDetalhe] = useState("");
  const [parcial, setParcial] = useState("");
  const [texto, setTexto] = useState("");
  const [reacao, setReacao] = useState<HumorMascote | null>(null);
  const [semMicrofone, setSemMicrofone] = useState(false);
  const [mudo, setMudo] = useState(false);
  const historico = useRef<{ de: string; texto: string }[]>([]);
  const reconhecedor = useRef<any>(null);
  const audio = useRef<HTMLAudioElement | null>(null);
  const premium = useRef(false);
  const velocidade = useRef(1);
  const vivo = useRef(true);

  useEffect(() => {
    vivo.current = true;
    if (!criarReconhecedor()) setSemMicrofone(true);
    fetch("/api/voz/config", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        premium.current = !!j.premium;
        velocidade.current = Number(j.velocidade) || 1;
      })
      .catch(() => {});
    return () => {
      vivo.current = false;
      try {
        reconhecedor.current?.abort();
      } catch {}
      audio.current?.pause();
      window.speechSynthesis?.cancel();
    };
  }, []);

  useEffect(() => {
    if (!balaoVisivel || status !== "parado") return;
    const t = setTimeout(() => setBalaoVisivel(false), detalhe ? 45000 : 12000);
    return () => clearTimeout(t);
  }, [balaoVisivel, status, detalhe]);

  const reagir = useCallback((h: HumorMascote, ms = 2200) => {
    setReacao(h);
    setTimeout(() => vivo.current && setReacao(null), ms);
  }, []);

  const falar = useCallback(
    async (frase: string) => {
      if (!frase || mudo) {
        setStatus("parado");
        return;
      }
      setStatus("falando");
      const fim = () => vivo.current && setStatus("parado");
      if (premium.current) {
        try {
          const r = await fetch("/api/voz/falar", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({ texto: frase }),
          });
          if (!r.ok) throw new Error(String(r.status));
          const url = URL.createObjectURL(await r.blob());
          const a = new Audio(url);
          audio.current = a;
          a.onended = a.onerror = a.onpause = () => {
            URL.revokeObjectURL(url);
            fim();
          };
          await a.play();
          return;
        } catch {
          // cai para a voz do navegador
        }
      }
      const sintese = window.speechSynthesis;
      if (!sintese) return fim();
      sintese.cancel();
      const u = new SpeechSynthesisUtterance(frase);
      u.lang = "pt-BR";
      const v = escolherVoz(sintese.getVoices());
      if (v) u.voice = v;
      u.rate = velocidade.current;
      u.onend = u.onerror = fim;
      sintese.speak(u);
      setTimeout(fim, 4000 + frase.length * 110);
    },
    [mudo, token]
  );

  async function perguntar(fala: string) {
    setBalaoVisivel(true);
    setStatus("pensando");
    setBalao(`“${fala}”`);
    setDetalhe("");
    historico.current.push({ de: "dentista", texto: fala });
    let j: Resposta;
    try {
      const r = await fetch("/api/voz/consulta", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ fala, historico: historico.current.slice(-6) }),
      });
      j = await r.json().catch(() => ({ ok: false, erro: "Resposta inválida." }));
    } catch {
      j = { ok: false, erro: "Falhou a conexão. Tente de novo." };
    }
    if (!vivo.current) return;
    if (!j.ok) {
      setBalao(j.erro || "Não consegui responder agora.");
      setStatus("parado");
      return;
    }
    const resposta = j.fala || "Pronto.";
    historico.current.push({ de: "assistente", texto: resposta });
    setBalao(resposta);
    setDetalhe(j.texto && j.texto !== resposta ? j.texto : "");
    if (j.tipo === "busca") {
      const busca: BuscaAssistente = { ids: j.ids ?? [], rotulo: j.rotulo || fala };
      try {
        sessionStorage.setItem(CHAVE_BUSCA, JSON.stringify(busca));
      } catch {}
      window.dispatchEvent(new CustomEvent<BuscaAssistente>(EVENTO_BUSCA, { detail: busca }));
      if (caminho !== "/portal") router.push("/portal");
      reagir((j.ids ?? []).length ? "animado" : "piscadinha");
    } else if (j.tipo === "nova_os") {
      reagir("empolgado");
      setTimeout(() => router.push("/portal/nova"), 1600);
    } else if (j.tipo === "consulta") {
      reagir("feliz", 1500);
    }
    falar(resposta);
  }

  function ouvir() {
    if (status === "ouvindo") {
      try {
        reconhecedor.current?.stop();
      } catch {}
      return;
    }
    audio.current?.pause();
    window.speechSynthesis?.cancel();
    const r = criarReconhecedor();
    if (!r) {
      setSemMicrofone(true);
      return;
    }
    reconhecedor.current = r;
    let ouvido = "";
    r.onresult = (ev: any) => {
      let t = "";
      for (let i = 0; i < ev.results.length; i++) t += ev.results[i][0].transcript;
      ouvido = t;
      setParcial(t);
    };
    r.onerror = (ev: any) => {
      if (ev.error === "not-allowed" || ev.error === "service-not-allowed") setSemMicrofone(true);
    };
    r.onend = () => {
      setParcial("");
      if (!vivo.current) return;
      if (ouvido.trim()) perguntar(ouvido.trim());
      else {
        setStatus("parado");
        setBalao("Não ouvi nada. Toque no microfone e fale de novo.");
      }
    };
    setBalaoVisivel(true);
    setBalao("Pode falar, estou ouvindo…");
    setDetalhe("");
    setStatus("ouvindo");
    try {
      r.start();
    } catch {
      setStatus("parado");
    }
  }

  function enviarTexto(e: React.FormEvent) {
    e.preventDefault();
    const t = texto.trim();
    if (!t || status === "pensando") return;
    setTexto("");
    audio.current?.pause();
    window.speechSynthesis?.cancel();
    perguntar(t);
  }

  const humor: HumorMascote = reacao ?? (status === "parado" ? (historico.current.length ? "normal" : "feliz") : status);

  const corBotao =
    status === "ouvindo"
      ? "from-[#e0649c] to-[#8f5bd9] animate-pulse"
      : status === "pensando"
        ? "from-[#f2a43a] to-[#e0649c] animate-pulse"
        : "from-[#8f5bd9] to-[#e0649c]";

  const microfone = (
    <button
      type="button"
      onClick={ouvir}
      disabled={status === "pensando" || semMicrofone}
      className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gradient-to-br text-white shadow-lg transition disabled:opacity-40 ${corBotao}`}
      aria-label={status === "ouvindo" ? "Parar de ouvir" : "Falar com o assistente"}
    >
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="9" y="3" width="6" height="11" rx="3" />
        <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
      </svg>
    </button>
  );

  const rotulo = semMicrofone
    ? "Microfone indisponível aqui. Digite abaixo."
    : status === "ouvindo"
      ? "Ouvindo… toque para terminar."
      : status === "pensando"
        ? "Procurando a resposta…"
        : status === "falando"
          ? "Respondendo…"
          : "Toque para falar";

  const conversa = (
    <div className="flex flex-col gap-3">
      <p className="rounded-2xl rounded-tl-sm bg-white/[0.07] px-3.5 py-2.5 text-sm leading-snug text-white" aria-live="polite">
        {parcial ? <span className="italic text-zinc-300">{parcial}</span> : balao}
      </p>
      {detalhe && <p className="max-h-56 overflow-y-auto whitespace-pre-line rounded-2xl bg-white/[0.04] px-3.5 py-2.5 text-[13px] leading-relaxed text-zinc-300">{detalhe}</p>}
      <div className="flex items-center gap-3">
        {microfone}
        <p className="min-w-0 flex-1 text-xs leading-snug text-zinc-400">{rotulo}</p>
        <button type="button" onClick={() => setMudo((m) => !m)} className="text-xs text-zinc-500 underline-offset-4 hover:text-white hover:underline" title="Ligar/desligar a voz do assistente">
          {mudo ? "Som off" : "Som on"}
        </button>
      </div>
      <form onSubmit={enviarTexto} className="flex gap-2">
        <label htmlFor={`pergunta-${modo}`} className="sr-only">
          Pergunta para o assistente
        </label>
        <input id={`pergunta-${modo}`} className="gc-input min-w-0 flex-1 !py-2 text-sm" placeholder="Paciente ou dúvida técnica…" value={texto} onChange={(e) => setTexto(e.target.value)} />
        <button type="submit" className="gc-btn gc-btn-secundario !px-3 !py-2 text-sm" disabled={!texto.trim() || status === "pensando"} aria-label="Perguntar">
          OK
        </button>
      </form>
      {!historico.current.length && (
        <div className="flex flex-col gap-1.5">
          {SUGESTOES.map((s) => (
            <button key={s} type="button" onClick={() => status !== "pensando" && perguntar(s)} className="rounded-xl bg-white/[0.04] px-3 py-2 text-left text-xs text-zinc-300 hover:bg-white/[0.08] hover:text-white">
              {s}
            </button>
          ))}
        </div>
      )}
      <p className="text-[11px] leading-snug text-zinc-500">Respostas técnicas são orientações gerais e não substituem a avaliação clínica.</p>
    </div>
  );

  if (modo === "lateral") {
    return (
      <section className="mt-6 flex flex-col items-center gap-3" aria-label="Assistente GC">
        <MascoteGC humor={humor} variante="corpo" tamanho={200} />
        {microfone}
        {balaoVisivel && (
          <div className="relative w-full">
            <p className="rounded-2xl bg-white/[0.07] px-3.5 py-2.5 pr-8 text-sm leading-snug text-white" aria-live="polite">
              {parcial ? <span className="italic text-zinc-300">{parcial}</span> : balao}
            </p>
            {detalhe && (
              <>
                <p className="mt-2 max-h-64 overflow-y-auto whitespace-pre-line rounded-2xl bg-white/[0.04] px-3.5 py-2.5 text-[13px] leading-relaxed text-zinc-300">{detalhe}</p>
                <p className="mt-1.5 text-[11px] leading-snug text-zinc-500">Orientação geral; não substitui a avaliação clínica.</p>
              </>
            )}
            <button type="button" onClick={() => setBalaoVisivel(false)} className="absolute right-2 top-1.5 text-lg leading-none text-zinc-500 hover:text-white" aria-label="Fechar resposta">
              ×
            </button>
          </div>
        )}
        {semMicrofone && <p className="text-center text-xs text-zinc-500">Microfone indisponível neste navegador.</p>}
      </section>
    );
  }

  // celular: botão flutuante com o rosto do mascote
  return (
    <div className="fixed bottom-4 right-4 z-40 flex flex-col items-end gap-3 lg:hidden">
      {aberto && (
        <section className="gc-card w-[min(22rem,calc(100vw-2rem))] p-4" aria-label="Assistente GC">
          <div className="mb-3 flex items-center gap-3">
            <MascoteGC humor={humor} tamanho={64} seguirMouse={false} className="rounded-xl bg-white/[0.05]" />
            <p className="gc-eyebrow flex-1">Assistente GC</p>
            <button type="button" onClick={() => setAberto(false)} className="text-2xl leading-none text-zinc-400 hover:text-white" aria-label="Fechar assistente">
              ×
            </button>
          </div>
          {conversa}
        </section>
      )}
      {!aberto && (
        <button type="button" onClick={() => setAberto(true)} className="rounded-2xl border border-white/10 bg-black/80 p-1 shadow-xl backdrop-blur" aria-label="Abrir o assistente GC">
          <MascoteGC humor={humor} tamanho={64} seguirMouse={false} />
        </button>
      )}
    </div>
  );
}
