export const STATUS_ORDER = [
  "recebido",
  "standby",
  "cad",
  "cam",
  "finalizacao",
  "entregue",
] as const;

export type StatusPedido = (typeof STATUS_ORDER)[number];

export const STATUS_LABEL: Record<StatusPedido, string> = {
  recebido: "Recebido",
  standby: "Standby",
  cad: "CAD",
  cam: "CAM",
  finalizacao: "Finalização",
  entregue: "Entregue",
};

export const STATUS_COLOR: Record<StatusPedido, string> = {
  recebido: "bg-slate-100 text-slate-700 border-slate-300",
  standby: "bg-amber-100 text-amber-800 border-amber-300",
  cad: "bg-sky-100 text-sky-800 border-sky-300",
  cam: "bg-indigo-100 text-indigo-800 border-indigo-300",
  finalizacao: "bg-violet-100 text-violet-800 border-violet-300",
  entregue: "bg-teal-100 text-teal-800 border-teal-300",
};

export const TIPOS_TRABALHO = [
  "Enceramento diagnóstico",
  "Coroa/faceta Dissilicato",
  "Coroa/faceta Zircônia",
  "Provisório",
  "Protocolo Cerâmico",
  "Protocolo Provisório",
  "Protocolo PMMA Definitivo",
  "Placa Miorelaxante",
  "Guia Cirúrgico",
  "Impressão de modelo para placa de clareamento",
];

export interface PedidoFoto {
  id: string;
  pedido_id: string;
  url: string;
  created_at: string;
}

export interface Pedido {
  id: string;
  // Serviços enviados juntos na mesma ordem de serviço compartilham o os_id.
  os_id: string | null;
  created_at: string;
  status_updated_at: string;
  paciente_nome: string;
  paciente_nascimento: string | null;
  dentista_nome: string;
  clinica: string | null;
  contato: string | null;
  tipo_trabalho: string;
  dentes: string[];
  material: string | null;
  cor_restauracao: string | null;
  prazo_desejado: string | null;
  instalacao_agendada: string | null;
  quem_preencheu: string | null;
  observacoes: string | null;
  dscore_referencia: string | null;
  status: StatusPedido;
  notas_internas: string | null;
  trello_card_id: string | null;
  pedido_fotos?: PedidoFoto[];
}
