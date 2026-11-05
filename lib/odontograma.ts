import { SEPARADOR } from "@/lib/catalogo";
import type { Marcacoes } from "@/components/OdontogramaTrabalhos";

// Ordem dos dentes como aparecem no odontograma (notação FDI).
export const ORDEM_DENTES = [
  "18", "17", "16", "15", "14", "13", "12", "11",
  "21", "22", "23", "24", "25", "26", "27", "28",
  "48", "47", "46", "45", "44", "43", "42", "41",
  "31", "32", "33", "34", "35", "36", "37", "38",
];

export interface Grupo {
  chave: string;
  caminho: string[];
  dentes: string[];
}

/** Junta os dentes que receberam o mesmo trabalho. */
export function agruparMarcacoes(marcacoes: Marcacoes): Grupo[] {
  const grupos: Grupo[] = [];
  for (const dente of ORDEM_DENTES) {
    const caminho = marcacoes[dente];
    if (!caminho) continue;
    const chave = caminho.join(SEPARADOR);
    const g = grupos.find((x) => x.chave === chave);
    if (g) g.dentes.push(dente);
    else grupos.push({ chave, caminho, dentes: [dente] });
  }
  return grupos;
}
