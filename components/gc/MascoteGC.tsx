"use client";

import { useEffect, useId, useRef, useState } from "react";
import s from "./MascoteGC.module.css";

// Mascote do assistente GC: render 3D (cabeça e corpo em camadas) com olhos de LED
// desenhados em código no visor, para reagir em tempo real ao que o assistente faz.

export type HumorMascote =
  | "normal"
  | "feliz"
  | "animado"
  | "empolgado"
  | "amei"
  | "piscadinha"
  | "falando"
  | "ouvindo"
  | "pensando";

interface Props {
  humor?: HumorMascote;
  /** Altura em px. */
  tamanho?: number;
  /** "busto" mostra só a cabeça e os ombros; "corpo" mostra o boneco inteiro. */
  variante?: "busto" | "corpo";
  /** Olhos e cabeça acompanham o ponteiro do mouse. */
  seguirMouse?: boolean;
  /** Cor dos LEDs. */
  cor?: string;
  className?: string;
}

// Proporções da imagem original (1438 x 2576)
const PROP = 1438 / 2576;
const BUSTO = { altura: 0.42, topo: 0.08, largura: 0.72, esquerda: 0.17 };

const PISCA: HumorMascote[] = ["normal", "animado", "ouvindo"];

export default function MascoteGC({ humor = "normal", tamanho = 120, variante = "busto", seguirMouse = true, cor = "#FF4A1C", className = "" }: Props) {
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const raiz = useRef<HTMLDivElement>(null);
  const [piscando, setPiscando] = useState(false);
  const [mira, setMira] = useState({ x: 0, y: 0 });

  // piscar de vez em quando
  useEffect(() => {
    if (!PISCA.includes(humor)) return;
    let t: ReturnType<typeof setTimeout>;
    let t2: ReturnType<typeof setTimeout>;
    const agendar = () => {
      t = setTimeout(() => {
        setPiscando(true);
        t2 = setTimeout(() => setPiscando(false), 130);
        agendar();
      }, 2200 + Math.random() * 3200);
    };
    agendar();
    return () => {
      clearTimeout(t);
      clearTimeout(t2);
      setPiscando(false);
    };
  }, [humor]);

  // seguir o mouse
  useEffect(() => {
    if (!seguirMouse) return;
    const mover = (ev: PointerEvent) => {
      const el = raiz.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height * (variante === "busto" ? 0.5 : 0.3);
      const lim = (v: number) => Math.max(-1, Math.min(1, v));
      setMira({ x: lim((ev.clientX - cx) / 600), y: lim((ev.clientY - cy) / 400) });
    };
    window.addEventListener("pointermove", mover);
    return () => window.removeEventListener("pointermove", mover);
  }, [seguirMouse, variante]);

  // tamanho da figura dentro do recorte
  const busto = variante === "busto";
  const alturaFig = busto ? tamanho / BUSTO.altura : tamanho;
  const larguraFig = alturaFig * PROP;
  const caixa = busto
    ? { width: larguraFig * BUSTO.largura, height: tamanho }
    : { width: larguraFig, height: tamanho };
  const posFig = busto
    ? { width: larguraFig, height: alturaFig, top: -alturaFig * BUSTO.topo, left: -larguraFig * BUSTO.esquerda }
    : { width: larguraFig, height: alturaFig, top: 0, left: 0 };

  const pensando = humor === "pensando";
  const olharX = pensando ? 22 : mira.x * 34;
  const olharY = pensando ? -22 : mira.y * 22;

  const p = (n: string) => `${n}-${id}`;
  const LED = `url(#${p("led")})`;

  return (
    <div
      ref={raiz}
      className={`${s.recorte} ${s[humor] ?? ""} ${className}`}
      style={{ ...caixa, ["--led" as string]: cor }}
      role="img"
      aria-label={`Mascote GC (${humor})`}
    >
      <div className={s.figura} style={posFig}>
        <div className={`${s.camada} ${s.corpo}`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/mascote/body.webp" alt="" draggable={false} />
        </div>
        <div className={`${s.camada} ${s.seguir}`} style={{ transform: `rotate(${mira.x * 4}deg) translate(${mira.x * 1}%, ${mira.y * 0.5}%)` }}>
          <div className={`${s.camada} ${s.cabeca}`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/mascote/head.webp" alt="" draggable={false} />
            <svg viewBox="0 0 1438 2576" aria-hidden="true">
              <defs>
                <pattern id={p("led")} width="12" height="11" patternUnits="userSpaceOnUse">
                  <rect width="12" height="7" fill={cor} />
                </pattern>
                <pattern id={p("rosa")} width="12" height="11" patternUnits="userSpaceOnUse">
                  <rect width="12" height="7" fill="#FF3D7A" />
                </pattern>
                <pattern id={p("ouro")} width="12" height="11" patternUnits="userSpaceOnUse">
                  <rect width="12" height="7" fill="#FFC02E" />
                </pattern>
                <filter id={p("brilho")} x="-80%" y="-80%" width="260%" height="260%">
                  <feGaussianBlur in="SourceGraphic" stdDeviation="9" result="b" />
                  <feMerge>
                    <feMergeNode in="b" />
                    <feMergeNode in="b" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
              </defs>
              <g transform="translate(605 864) skewY(-4)">
                <g className={s.olhar} style={{ transform: `translate(${olharX}px, ${olharY}px)` }}>
                  <g filter={`url(#${p("brilho")})`}>
                    <g transform="translate(-154 0)">
                      <g className={`${s.palpebra} ${piscando ? s.piscando : ""}`}>
                        <Olho humor={humor} lado="e" led={LED} rosa={`url(#${p("rosa")})`} ouro={`url(#${p("ouro")})`} />
                      </g>
                    </g>
                    <g transform="translate(154 0)">
                      <g className={`${s.palpebra} ${piscando ? s.piscando : ""}`}>
                        <Olho humor={humor} lado="d" led={LED} rosa={`url(#${p("rosa")})`} ouro={`url(#${p("ouro")})`} />
                      </g>
                    </g>
                    <g transform="translate(0 122)">
                      <Boca humor={humor} led={LED} />
                    </g>
                  </g>
                </g>
              </g>
            </svg>
          </div>
        </div>
      </div>
    </div>
  );
}

function Olho({ humor, lado, led, rosa, ouro }: { humor: HumorMascote; lado: "e" | "d"; led: string; rosa: string; ouro: string }) {
  const normal = <rect x="-48" y="-64" width="96" height="128" rx="10" fill={led} />;
  const arco = <path className={`${s.forma} ${s.arco}`} d="M-60 24 L0 -36 L60 24" fill="none" stroke={led} strokeWidth="32" strokeLinecap="round" strokeLinejoin="round" />;
  switch (humor) {
    case "feliz":
    case "falando":
      return arco;
    case "piscadinha":
      return lado === "e" ? normal : arco;
    case "animado":
      return (
        <g className={`${s.forma} ${s.pop}`}>
          <rect x="-58" y="-76" width="116" height="152" rx="34" fill={led} />
          <rect x="6" y="-60" width="28" height="28" rx="8" fill="#FFE9DF" />
        </g>
      );
    case "ouvindo":
      return (
        <g>
          <rect x="-56" y="-72" width="112" height="144" rx="30" fill={led} />
          <rect x="6" y="-58" width="26" height="26" rx="8" fill="#FFE9DF" />
        </g>
      );
    case "pensando":
      return <rect x="-44" y="-30" width="88" height="60" rx="10" fill={led} />;
    case "empolgado":
      return <path className={`${s.forma} ${s.estrela}`} d="M0 -80 L21.2 -29.1 L76.1 -24.7 L34.2 11.1 L47 64.7 L0 36 L-47 64.7 L-34.2 11.1 L-76.1 -24.7 L-21.2 -29.1Z" fill={ouro} />;
    case "amei":
      return <path className={`${s.forma} ${s.coracao}`} d="M0 64 C-96 4 -74 -72 -22 -64 C-6 -61 0 -48 0 -42 C0 -48 6 -61 22 -64 C74 -72 96 4 0 64Z" fill={rosa} />;
    default:
      return normal;
  }
}

function Boca({ humor, led }: { humor: HumorMascote; led: string }) {
  const sorriso = <path d="M-58 0 Q0 52 58 0" fill="none" stroke={led} strokeWidth="18" strokeLinecap="round" />;
  const sorrisao = <path d="M-70 -6 Q0 70 70 -6 Z" fill={led} stroke={led} strokeWidth="10" strokeLinejoin="round" />;
  switch (humor) {
    case "feliz":
    case "amei":
    case "piscadinha":
      return sorriso;
    case "animado":
    case "empolgado":
      return sorrisao;
    case "ouvindo":
      return <ellipse cx="0" cy="8" rx="22" ry="18" fill={led} />;
    case "falando": {
      const xs = [-64, -32, 0, 32, 64];
      const atraso = [0, 0.12, 0.24, 0.08, 0.18];
      return (
        <g>
          {xs.map((x, i) => (
            <rect key={x} className={s.barra} style={{ animationDelay: `${atraso[i]}s` }} x={x - 10} y="-30" width="20" height="60" rx="6" fill={led} />
          ))}
        </g>
      );
    }
    case "pensando":
      return (
        <g>
          {[-40, 0, 40].map((x, i) => (
            <rect key={x} className={s.ponto} style={{ animationDelay: `${i * 0.2}s` }} x={x - 11} y="-11" width="22" height="22" rx="5" fill={led} />
          ))}
        </g>
      );
    default:
      return null;
  }
}
