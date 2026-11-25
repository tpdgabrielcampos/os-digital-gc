"use client";

import { useState } from "react";
import { montarZip, type ArquivoZip } from "@/lib/zip";

// Botão "Baixar todos (.zip)": baixa os arquivos da OS e entrega um arquivo único.
export default function BaixarTodos({ arquivos, nomeZip }: { arquivos: { nome: string; link: string }[]; nomeZip: string }) {
  const [estado, setEstado] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const ocupado = estado !== null;

  async function baixar() {
    setErro(null);
    const prontos: ArquivoZip[] = [];
    const falhas: string[] = [];
    try {
      for (let i = 0; i < arquivos.length; i++) {
        const a = arquivos[i];
        setEstado(`Baixando ${i + 1} de ${arquivos.length}…`);
        try {
          const r = await fetch(a.link);
          if (!r.ok) throw new Error(String(r.status));
          prontos.push({ nome: a.nome, dados: new Uint8Array(await r.arrayBuffer()) });
        } catch {
          falhas.push(a.nome);
        }
      }
      if (!prontos.length) throw new Error("Não consegui baixar os arquivos. Recarregue a página e tente de novo.");
      setEstado("Montando o .zip…");
      const url = URL.createObjectURL(montarZip(prontos));
      const link = document.createElement("a");
      link.href = url;
      link.download = nomeZip;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
      if (falhas.length) setErro(`Ficaram de fora (baixe separado): ${falhas.join(", ")}`);
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setEstado(null);
    }
  }

  return (
    <div className="mb-3 flex flex-wrap items-center gap-3">
      <button type="button" onClick={baixar} disabled={ocupado} className="gc-btn gc-btn-principal !px-4 !py-2 text-sm disabled:opacity-60">
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v12M7 10l5 5 5-5M5 21h14" /></svg>
        {estado ?? `Baixar todos (${arquivos.length}) em .zip`}
      </button>
      {erro && <span className="text-xs text-amber-300">{erro}</span>}
    </div>
  );
}
