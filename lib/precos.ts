import { quantidadeCobrada, unidadeDoServico, type Unidade } from "@/lib/catalogo";
import type { Grupo } from "@/lib/odontograma";

export interface ItemOrcamento {
  chave: string;
  caminho: string[];
  dentes: string[];
  quantidade: number;
  unidade: Unidade;
  unitario: number | null; // null = serviço sem preço na tabela
  total: number;
}

/** Monta o orçamento da OS a partir dos grupos do odontograma e da tabela de preço. */
export function orcamento(grupos: Grupo[], precos: Record<string, number>): { itens: ItemOrcamento[]; total: number; semPreco: number } {
  const itens = grupos.map((g) => {
    const quantidade = quantidadeCobrada(g.caminho, g.dentes);
    const unitario = g.chave in precos ? precos[g.chave] : null;
    return {
      chave: g.chave,
      caminho: g.caminho,
      dentes: g.dentes,
      quantidade,
      unidade: unidadeDoServico(g.caminho),
      unitario,
      total: (unitario ?? 0) * quantidade,
    };
  });
  return {
    itens,
    total: itens.reduce((s, i) => s + i.total, 0),
    semPreco: itens.filter((i) => i.unitario === null).length,
  };
}
