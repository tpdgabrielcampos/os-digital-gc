// Módulo financeiro: tipos, categorias e cálculos (Simples Nacional).

export type TipoLanc = "entrada" | "saida";
export type NfStatus = "pendente" | "emitida" | "nao_se_aplica";

export interface Lancamento {
  id: string;
  tipo: TipoLanc;
  descricao: string;
  categoria: string;
  valor: number;
  competencia: string; // AAAA-MM-DD
  vencimento: string | null;
  pago_em: string | null;
  forma_pagamento: string | null;
  dentista_id: string | null;
  pedido_id: string | null;
  fornecedor: string | null;
  parcela: string | null;
  grupo: string | null;
  nf_status: NfStatus;
  nf_numero: string | null;
  observacoes: string | null;
  anexo?: string | null;
  criado_em: string;
}

export interface DentistaFin {
  id: string;
  nome: string;
  clinica: string | null;
  whatsapp: string | null;
  forma_cobranca: "mensal" | "por_os";
  dia_vencimento: number;
}

/** OS entregue (para faturar) ou já cobrada. */
export interface OSFin {
  id: string;
  numero: number | null;
  paciente_nome: string;
  tipo_trabalho: string | null;
  dentista_id: string | null;
  dentista_nome: string | null;
  status: string;
  entregue_em: string | null;
  valor_estimado: number | null;
  valor_final: number | null;
  cobranca_id: string | null;
}

export interface ConfigFiscal {
  regime: string;
  anexo: "I" | "II" | "III" | "V";
  aliquota_manual: number | null;
}

export interface Historico {
  mes: string; // AAAA-MM-01
  receita: number;
}

export const CATEGORIAS_ENTRADA = ["Fechamento mensal", "Serviços (OS)", "Outras receitas"];
export const CATEGORIAS_SAIDA = [
  "Terceirizados",
  "Materiais e insumos",
  "Aluguel",
  "Energia / água",
  "Internet / telefone",
  "Softwares / assinaturas",
  "Contador",
  "Impostos (DAS)",
  "Pró-labore",
  "Salários e encargos",
  "Equipamentos / parcelas",
  "Manutenção",
  "Frete / motoboy",
  "Marketing",
  "Taxas bancárias / cartão",
  "Outras despesas",
];
export const FORMAS_PAGAMENTO = ["Pix", "Dinheiro", "Cartão de crédito", "Cartão de débito", "Boleto", "Transferência"];

export const valorOS = (o: OSFin) => Number(o.valor_final ?? o.valor_estimado ?? 0);

// ---------- datas ----------
export const isoLocal = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
export const hoje = () => isoLocal(new Date());
export const mesDe = (iso: string) => iso.slice(0, 7); // AAAA-MM
export function somaMeses(mes: string, n: number) {
  const [a, m] = mes.split("-").map(Number);
  const d = new Date(a, m - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
export function nomeMes(mes: string, curto = false) {
  const [a, m] = mes.split("-").map(Number);
  const s = new Date(a, m - 1, 1).toLocaleDateString("pt-BR", { month: curto ? "short" : "long", year: "numeric" });
  return s.replace(".", "").replace(/^./, (c) => c.toUpperCase());
}
export function diaNoMes(mes: string, dia: number) {
  const [a, m] = mes.split("-").map(Number);
  const ultimo = new Date(a, m, 0).getDate();
  return `${mes}-${String(Math.min(Math.max(dia, 1), ultimo)).padStart(2, "0")}`;
}
export const dataCurta = (iso: string | null | undefined) => (iso ? iso.slice(0, 10).split("-").reverse().join("/") : "—");

export type Situacao = "pago" | "aberto" | "vencido";
export function situacao(l: Lancamento, ref = hoje()): Situacao {
  if (l.pago_em) return "pago";
  if (l.vencimento && l.vencimento < ref) return "vencido";
  return "aberto";
}

// ---------- Simples Nacional (LC 123/2006, tabelas da LC 155/2016, em vigor desde 2018) ----------
// [limite superior da faixa (RBT12), alíquota nominal, parcela a deduzir]
type Faixa = [number, number, number];
export const TABELAS_SIMPLES: Record<ConfigFiscal["anexo"], { nome: string; faixas: Faixa[] }> = {
  I: { nome: "Anexo I — Comércio", faixas: [[180000, 4, 0], [360000, 7.3, 5940], [720000, 9.5, 13860], [1800000, 10.7, 22500], [3600000, 14.3, 87300], [4800000, 19, 378000]] },
  II: { nome: "Anexo II — Indústria", faixas: [[180000, 4.5, 0], [360000, 7.8, 5940], [720000, 10, 13860], [1800000, 11.2, 22500], [3600000, 14.7, 85500], [4800000, 30, 720000]] },
  III: { nome: "Anexo III — Serviços", faixas: [[180000, 6, 0], [360000, 11.2, 9360], [720000, 13.5, 17640], [1800000, 16, 35640], [3600000, 21, 125640], [4800000, 33, 648000]] },
  V: { nome: "Anexo V — Serviços (Fator R abaixo de 28%)", faixas: [[180000, 15.5, 0], [360000, 18, 4500], [720000, 19.5, 9900], [1800000, 20.5, 17100], [3600000, 23, 62100], [4800000, 30.5, 540000]] },
};
export const SUBLIMITE = 3600000;
export const TETO_SIMPLES = 4800000;

export function calcSimples(anexo: ConfigFiscal["anexo"], rbt12: number) {
  const faixas = TABELAS_SIMPLES[anexo].faixas;
  const idx = faixas.findIndex(([lim]) => rbt12 <= lim);
  const i = idx === -1 ? faixas.length - 1 : idx;
  const [, nominal, deduzir] = faixas[i];
  const efetiva = rbt12 > 0 ? ((rbt12 * nominal) / 100 - deduzir) / rbt12 * 100 : nominal;
  return { faixa: i + 1, nominal, deduzir, efetiva: Math.max(0, efetiva) };
}
