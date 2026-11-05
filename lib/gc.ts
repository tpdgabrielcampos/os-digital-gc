import type { StatusPedido } from "@/lib/types";

// Tipos e utilidades da OS digital GC (portal do dentista + painel).

export interface Dentista {
  id: string;
  nome: string;
  clinica: string | null;
  whatsapp: string | null;
  email: string | null;
  tabela_id: string | null;
  ativo: boolean;
  criado_em: string;
}

export interface TabelaPreco {
  id: string;
  nome: string;
  criada_em: string;
}

export interface Preco {
  tabela_id: string;
  servico: string;
  valor: number;
}

export interface PedidoArquivo {
  id: string;
  pedido_id: string;
  dentista_id: string | null;
  nome: string;
  caminho: string;
  tamanho: number | null;
  drive_id: string | null;
  drive_url: string | null;
  removido_do_servidor: boolean;
  criado_em: string;
}

export const brl = (v: number | null | undefined, casas = 2) =>
  (v ?? 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: casas,
    maximumFractionDigits: casas,
  });

export const numeroOS = (n: number | null | undefined) => (n ? `GC-${String(n).padStart(4, "0")}` : "GC-····");

export function tamanhoLegivel(bytes: number | null | undefined) {
  if (!bytes) return "";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} MB`;
}

export const MAX_ARQUIVO = 50 * 1024 * 1024; // 50 MB (limite do plano grátis do Supabase)


/** Cor da bolinha de status (tema escuro). */
export const PONTO_STATUS: Record<StatusPedido, string> = {
  recebido: "bg-zinc-300",
  standby: "bg-rose-400",
  cad: "bg-sky-400",
  cam: "bg-violet-400",
  finalizacao: "bg-amber-300",
  entregue: "bg-emerald-400",
};

/** Borda + texto dos cartões de contagem por status. */
export const CARTAO_STATUS: Record<StatusPedido, string> = {
  recebido: "border-zinc-400/30 text-zinc-200",
  standby: "border-rose-400/30 text-rose-300",
  cad: "border-sky-400/30 text-sky-300",
  cam: "border-violet-400/30 text-violet-300",
  finalizacao: "border-amber-400/30 text-amber-300",
  entregue: "border-emerald-400/30 text-emerald-300",
};

/** "2026-11-04..." -> "04/11/2026" sem mexer com fuso. */
export function dataBR(v: string | null | undefined) {
  if (!v) return "—";
  const [a, m, d] = v.slice(0, 10).split("-");
  return a && m && d ? `${d}/${m}/${a}` : v;
}

/** Data e hora no fuso de Brasília. */
export function dataHoraBR(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" });
}
