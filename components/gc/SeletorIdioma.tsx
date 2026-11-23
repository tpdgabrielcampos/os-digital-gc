"use client";

import { IDIOMAS, type Idioma } from "@/lib/idiomaEntrada";

/** Botões de idioma da tela de entrada (Português / Español / English). */
export default function SeletorIdioma({ idioma, onEscolher, rotulo }: { idioma: Idioma; onEscolher: (i: Idioma) => void; rotulo: string }) {
  return (
    <div className="flex items-center justify-end gap-1.5 text-xs" role="group" aria-label={rotulo}>
      <span className="mr-1 text-zinc-500">🌐</span>
      {IDIOMAS.map((i) => (
        <button
          key={i.id}
          type="button"
          lang={i.id}
          onClick={() => onEscolher(i.id)}
          aria-pressed={idioma === i.id}
          className={`rounded-full px-2.5 py-1 font-medium transition-colors ${
            idioma === i.id ? "bg-white/15 text-white" : "text-zinc-400 hover:bg-white/5 hover:text-white"
          }`}
        >
          {i.nome}
        </button>
      ))}
    </div>
  );
}

/** Versão compacta (lista) para a barra do celular. */
export function SeletorIdiomaCompacto({ idioma, onEscolher, rotulo }: { idioma: Idioma; onEscolher: (i: Idioma) => void; rotulo: string }) {
  return (
    <select
      aria-label={rotulo}
      value={idioma}
      onChange={(e) => onEscolher(e.target.value as Idioma)}
      className="rounded-lg border border-white/10 bg-black/60 px-1.5 py-1.5 text-xs font-semibold text-zinc-200"
    >
      {IDIOMAS.map((i) => (
        <option key={i.id} value={i.id}>
          {i.id.toUpperCase()}
        </option>
      ))}
    </select>
  );
}
