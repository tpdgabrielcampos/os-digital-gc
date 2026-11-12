import { SEPARADOR } from "@/lib/catalogo";
import type { Marcacoes } from "@/components/OdontogramaTrabalhos";

/**
 * Remonta o odontograma a partir do que foi gravado na OS:
 * "PSI – Coroa – Zircônia (dentes 11, 21) + Faceta… (dente 12) (Retrabalho)".
 * Com um trabalho só, os dentes vêm da coluna "dentes".
 */
export function marcacoesDaOS(tipoTrabalho: string, dentes: string[] | null) {
  const marcacoes: Marcacoes = {};
  const retrabalho: Record<string, boolean> = {};
  const partes = (tipoTrabalho || "").split(" + ").map((x) => x.trim()).filter(Boolean);
  for (const parte of partes) {
    let t = parte;
    const ret = /\s*\(Retrabalho\)\s*$/i.test(t);
    t = t.replace(/\s*\(Retrabalho\)\s*$/i, "");
    let ds: string[] = [];
    const m = t.match(/\s*\(dentes?\s+([\d,\s]+)\)\s*$/i);
    if (m) {
      ds = m[1].split(/[,\s]+/).filter(Boolean);
      t = t.slice(0, m.index).trim();
    } else if (partes.length === 1) ds = dentes ?? [];
    const caminho = t.split(SEPARADOR).map((x) => x.trim()).filter(Boolean);
    if (!caminho.length) continue;
    for (const d of ds) marcacoes[d] = caminho;
    if (ret) retrabalho[caminho.join(SEPARADOR)] = true;
  }
  return { marcacoes, retrabalho };
}
