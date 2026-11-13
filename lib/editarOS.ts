import { SEPARADOR, ehTrabalhoDeArcada } from "@/lib/catalogo";
import { ORDEM_DENTES, type Grupo } from "@/lib/odontograma";
import type { Marcacoes } from "@/components/OdontogramaTrabalhos";

/**
 * Remonta o odontograma a partir do que foi gravado na OS:
 * "PSI – Coroa – Zircônia (dentes 11, 21) + Faceta… (dente 12) (Retrabalho)".
 * Com um trabalho só, os dentes vêm da coluna "dentes".
 */
export function marcacoesDaOS(tipoTrabalho: string, dentes: string[] | null) {
  const marcacoes: Marcacoes = {};
  const retrabalho: Record<string, boolean> = {};
  const arcadas: Grupo[] = [];
  const partes = (tipoTrabalho || "").split(" + ").map((x) => x.trim()).filter(Boolean);
  for (const parte of partes) {
    let t = parte;
    const ret = /\s*\(Retrabalho\)\s*$/i.test(t);
    t = t.replace(/\s*\(Retrabalho\)\s*$/i, "");
    let ds: string[] = [];
    // placa / modelo: "(arcada superior e inferior)"
    const arc = t.match(/\s*\(arcada\s+([a-z ]+)\)\s*$/i);
    if (arc) {
      t = t.slice(0, arc.index).trim();
      const qual = arc[1].toLowerCase();
      const dentesArc = ORDEM_DENTES.filter((d) => ((d[0] === "1" || d[0] === "2") && qual.includes("superior")) || ((d[0] === "3" || d[0] === "4") && qual.includes("inferior")));
      const caminho = t.split(SEPARADOR).map((x) => x.trim()).filter(Boolean);
      if (caminho.length) {
        arcadas.push({ chave: caminho.join(SEPARADOR), caminho, dentes: dentesArc });
        if (ret) retrabalho[caminho.join(SEPARADOR)] = true;
      }
      continue;
    }
    const m = t.match(/\s*\(dentes?\s+([\d,\s]+)\)\s*$/i);
    if (m) {
      ds = m[1].split(/[,\s]+/).filter(Boolean);
      t = t.slice(0, m.index).trim();
    } else if (partes.length === 1) ds = dentes ?? [];
    const caminho = t.split(SEPARADOR).map((x) => x.trim()).filter(Boolean);
    if (!caminho.length) continue;
    // OS antiga com placa / modelo nos dentes: passa para a lista por arcada
    if (ehTrabalhoDeArcada(caminho)) {
      arcadas.push({ chave: caminho.join(SEPARADOR), caminho, dentes: ds });
      if (ret) retrabalho[caminho.join(SEPARADOR)] = true;
      continue;
    }
    for (const d of ds) marcacoes[d] = caminho;
    if (ret) retrabalho[caminho.join(SEPARADOR)] = true;
  }
  return { marcacoes, retrabalho, arcadas };
}
