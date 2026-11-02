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

/** Serviços de prótese (PSI/PSD) pedem a cor final — menos o pôntico. */
export function pedeCor(caminho: string[]): boolean {
  return (caminho[0] === "PSI" || caminho[0] === "PSD") && !ehPontico(caminho);
}
