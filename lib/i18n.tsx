"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { Idioma } from "@/lib/idiomaEntrada";
import { DICIONARIO } from "@/lib/traducoes";

// Tradução do portal do dentista (Español / English). O texto em português é a própria
// chave: tr("Nova OS") devolve "Nueva orden" / "New order". Fora do portal (painel do
// laboratório) não há provedor, então tudo fica em português.
// Os dados gravados (tipo de trabalho, catálogo, preços) continuam em português no banco:
// só a exibição é traduzida.

interface CtxIdioma {
  idioma: Idioma;
  setIdioma: (i: Idioma) => void;
}
const Ctx = createContext<CtxIdioma>({ idioma: "pt", setIdioma: () => {} });

export function ProvedorIdioma({ idioma, setIdioma, children }: CtxIdioma & { children: ReactNode }) {
  return <Ctx.Provider value={{ idioma, setIdioma }}>{children}</Ctx.Provider>;
}

type Vars = Record<string, string | number>;

export function traduzir(idioma: Idioma, texto: string, vars?: Vars): string {
  let s = texto;
  if (idioma !== "pt") {
    const e = DICIONARIO[texto];
    if (e) s = idioma === "es" ? e[0] : e[1];
  }
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(String(v));
  return s;
}

const SEP = " – ";

/** Lado/arcada: "arcada superior", "meia arcada superior direito, inferior esquerdo". */
function traduzirArcada(idioma: Idioma, rotulo: string) {
  if (idioma === "pt") return rotulo;
  const troca: [RegExp, string, string][] = [
    [/meia arcada/g, "media arcada", "half arch"],
    [/superior e inferior/g, "superior e inferior", "upper and lower"],
    [/superior direito/g, "superior derecho", "upper right"],
    [/superior esquerdo/g, "superior izquierdo", "upper left"],
    [/inferior direito/g, "inferior derecho", "lower right"],
    [/inferior esquerdo/g, "inferior izquierdo", "lower left"],
    [/\barcada\b/g, "arcada", "arch"],
    [/\bsuperior\b/g, "superior", "upper"],
    [/\binferior\b/g, "inferior", "lower"],
  ];
  let s = rotulo;
  for (const [re, es, en] of troca) s = s.replace(re, idioma === "es" ? `\u0000${es}\u0001` : `\u0000${en}\u0001`);
  s = s.replace(/[\u0000\u0001]/g, "");
  // inglês: "half arch upper right" → "upper right half arch"
  if (idioma === "en") s = s.replace(/^(half arch|arch) (.+)$/, "$2 $1");
  return s;
}

export function useT() {
  const { idioma, setIdioma } = useContext(Ctx);
  const tr = (texto: string, vars?: Vars) => traduzir(idioma, texto, vars);
  /** Serviço do catálogo: caminho (ou "PSD – Coroa – Zircônia") traduzido parte a parte. */
  const ts = (caminho: string[] | string) =>
    (Array.isArray(caminho) ? caminho : caminho.split(SEP)).map((p) => tr(p.trim())).join(SEP);
  const ta = (rotulo: string) => traduzirArcada(idioma, rotulo);
  /** Texto do "tipo de trabalho" gravado na OS, traduzido para exibir. */
  const tt = (tipo: string) => {
    if (idioma === "pt" || !tipo) return tipo;
    return tipo
      .split(/ \+ (?!coroa)/) // "Pilar personalizado + coroa" é um serviço só
      .map((parte) => {
        let t = parte.trim();
        const sufixos: string[] = [];
        for (;;) {
          const m = t.match(/\s*\(([^()]*)\)\s*$/);
          if (!m) break;
          const dentro = m[1];
          let traduzido = dentro;
          const d = dentro.match(/^dentes?\s+(.+)$/i);
          if (/^retrabalho$/i.test(dentro)) traduzido = tr("Retrabalho");
          else if (d) traduzido = `${tr(/^dentes/i.test(dentro) ? "dentes" : "dente")} ${d[1]}`;
          else if (/arcada/i.test(dentro)) traduzido = ta(dentro);
          sufixos.unshift(` (${traduzido})`);
          t = t.slice(0, m.index).trim();
        }
        return ts(t) + sufixos.join("");
      })
      .join(" + ");
  };
  return { idioma, setIdioma, tr, ts, ta, tt };
}
