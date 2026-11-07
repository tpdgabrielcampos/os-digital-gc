// Catálogo de serviços do laboratório, em árvore. O dentista clica num dente
// do odontograma e vai escolhendo nível por nível até chegar numa "folha"
// (um item sem filhos). O caminho escolhido vira o tipo de trabalho do
// serviço, por exemplo "PSD – Coroa – Dissilicato".

export interface NoCatalogo {
  nome: string;
  /** Texto mais explicativo mostrado no botão (opcional). */
  descricao?: string;
  filhos?: NoCatalogo[];
  /** Os filhos deste nó são materiais (vão para o campo "material"). */
  filhosSaoMaterial?: boolean;
}

const MATERIAIS_COROA: NoCatalogo[] = [
  { nome: "Zircônia" },
  { nome: "Dissilicato" },
  { nome: "Resina híbrida" },
  { nome: "Resina provisória" },
];

export const CATALOGO: NoCatalogo[] = [
  {
    nome: "PSI",
    descricao: "Prótese sobre implante",
    filhos: [
      { nome: "Coroa", filhos: MATERIAIS_COROA, filhosSaoMaterial: true },
      { nome: "Pilar personalizado + coroa" },
      { nome: "Pôntico", filhos: MATERIAIS_COROA, filhosSaoMaterial: true },
    ],
  },
  {
    nome: "PSD",
    descricao: "Prótese sobre dente",
    filhos: [
      { nome: "Coroa", filhos: MATERIAIS_COROA, filhosSaoMaterial: true },
      { nome: "Faceta", filhos: MATERIAIS_COROA, filhosSaoMaterial: true },
      { nome: "Pôntico", filhos: MATERIAIS_COROA, filhosSaoMaterial: true },
      {
        nome: "Inlay/Onlay",
        filhos: [{ nome: "Dissilicato" }, { nome: "Resina híbrida" }],
        filhosSaoMaterial: true,
      },
    ],
  },
  { nome: "Ajuste de cor" },
  { nome: "Enceramento diagnóstico" },
  {
    nome: "Protocolo",
    filhos: [
      { nome: "Provisório" },
      { nome: "Definitivo resina" },
      { nome: "Definitivo zircônia" },
    ],
  },
  {
    nome: "Planejamento de implante",
    filhos: [{ nome: "Guiado" }, { nome: "Orientado" }],
  },
  {
    nome: "Placa miorelaxante",
    filhos: [{ nome: "Fresada" }, { nome: "Impressa" }],
  },
  { nome: "Impressão de modelo" },
  { nome: "Impressão de biomodelo" },
  {
    nome: "Design CAD",
    descricao: "Só o desenho — sem fresagem nem finalização",
    filhos: [
      { nome: "Smile design" },
      { nome: "Coroa / faceta" },
      { nome: "Protocolo", descricao: "Marca a arcada completa" },
      { nome: "IBAR", descricao: "Arcada inteira" },
      { nome: "IBAR meia arcada", descricao: "Um lado da arcada (cobrado por lado)" },
    ],
  },
];

/** Separador usado para juntar o caminho num texto só. */
export const SEPARADOR = " – ";

/** Nó do catálogo correspondente a um caminho (ou undefined). */
export function noDoCaminho(caminho: string[]): NoCatalogo | undefined {
  let nivel: NoCatalogo[] | undefined = CATALOGO;
  let no: NoCatalogo | undefined;
  for (const parte of caminho) {
    no = nivel?.find((n) => n.nome === parte);
    if (!no) return undefined;
    nivel = no.filhos;
  }
  return no;
}

/** Opções do próximo nível depois de um caminho parcial. */
export function opcoesDepoisDe(caminho: string[]): NoCatalogo[] {
  if (caminho.length === 0) return CATALOGO;
  return noDoCaminho(caminho)?.filhos ?? [];
}

/** Material do caminho, quando o último nível é um material (PSI/PSD). */
export function materialDoCaminho(caminho: string[]): string | null {
  if (caminho.length < 2) return null;
  const pai = noDoCaminho(caminho.slice(0, -1));
  return pai?.filhosSaoMaterial ? caminho[caminho.length - 1] : null;
}

/** Pôntico segue a cor final do restante do caso. */
export function ehPontico(caminho: string[]): boolean {
  return caminho[1] === "Pôntico";
}

/** Prótese (PSI/PSD) e Ajuste de cor pedem a cor final — menos o pôntico. */
export function pedeCor(caminho: string[]): boolean {
  if (caminho[0] === "Ajuste de cor") return true;
  return (caminho[0] === "PSI" || caminho[0] === "PSD") && !ehPontico(caminho);
}

/** Todos os serviços "finais" do catálogo (folhas), como caminhos. */
export function todasAsFolhas(nivel: NoCatalogo[] = CATALOGO, prefixo: string[] = []): string[][] {
  const saida: string[][] = [];
  for (const no of nivel) {
    const caminho = [...prefixo, no.nome];
    if (no.filhos?.length) saida.push(...todasAsFolhas(no.filhos, caminho));
    else saida.push(caminho);
  }
  return saida;
}

/** Como o serviço é cobrado: por dente (elemento), por arcada ou por meia arcada (lado). */
export type Unidade = "elemento" | "arcada" | "meia arcada";

/** Texto da unidade no singular/plural. */
export function nomeUnidade(u: Unidade, qtd = 1) {
  if (u === "arcada") return qtd > 1 ? "arcadas" : "arcada";
  if (u === "meia arcada") return qtd > 1 ? "meias arcadas" : "meia arcada";
  return qtd > 1 ? "elementos" : "elemento";
}

const POR_ARCADA = new Set(["Protocolo", "Placa miorelaxante", "Impressão de modelo", "Impressão de biomodelo"]);

/** Design CAD (só desenho): protocolo e IBAR por arcada; IBAR meia arcada por lado; o resto por peça. */
const DESIGN_POR_ARCADA = new Set(["Protocolo", "IBAR"]);

export function unidadeDoServico(caminho: string[]): Unidade {
  if (caminho[0] === "Design CAD") {
    if (caminho[1] === "IBAR meia arcada") return "meia arcada";
    return DESIGN_POR_ARCADA.has(caminho[1]) ? "arcada" : "elemento";
  }
  return POR_ARCADA.has(caminho[0]) ? "arcada" : "elemento";
}

/** Trabalho cerâmico: zircônia ou dissilicato (coroa, faceta, pôntico, inlay/onlay, protocolo de zircônia). */
export function ehCeramico(caminho: string[]): boolean {
  return caminho.some((p) => /zirc[oô]nia|dissilicato/i.test(p));
}

/**
 * Prazo mínimo (dias corridos a partir de hoje) para cada serviço:
 * Design CAD de IBAR = 1 dia; demais itens do Design CAD (smile, coroa/faceta, protocolo) = 2 dias;
 * todos os trabalhos de produção = 7 dias (independente da quantidade de peças).
 */
export function prazoMinimoDias(caminho: string[]): number {
  if (caminho[0] === "Design CAD") return caminho[1]?.startsWith("IBAR") ? 1 : 2;
  return 7;
}

/** Quantidade cobrada: nº de dentes, ou nº de arcadas (superior/inferior) envolvidas. */
export function quantidadeCobrada(caminho: string[], dentes: string[]): number {
  const u = unidadeDoServico(caminho);
  if (u === "elemento") return dentes.length;
  // meia arcada: conta os lados (quadrantes 1, 2, 3 e 4) que têm dente marcado
  if (u === "meia arcada") return new Set(dentes.map((d) => d[0])).size;
  const sup = dentes.some((d) => d[0] === "1" || d[0] === "2");
  const inf = dentes.some((d) => d[0] === "3" || d[0] === "4");
  return (sup ? 1 : 0) + (inf ? 1 : 0);
}
