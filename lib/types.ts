export const STATUS_ORDER = [
  "recebido",
  "standby",
  "cad",
  "aprovacao",
  "cam",
  "finalizacao",
  "prova",
  "entregue",
] as const;

export type StatusPedido = (typeof STATUS_ORDER)[number];

export const STATUS_LABEL: Record<StatusPedido, string> = {
  recebido: "Recebido",
  standby: "Standby",
  cad: "CAD",
  aprovacao: "Aprovação (HTML)",
  cam: "CAM / fresagem",
  finalizacao: "Finalização",
  prova: "Prova",
  entregue: "Entregue",
};

export const STATUS_COLOR: Record<StatusPedido, string> = {
  recebido: "bg-slate-100 text-slate-700 border-slate-300",
  standby: "bg-amber-100 text-amber-800 border-amber-300",
  cad: "bg-sky-100 text-sky-800 border-sky-300",
  aprovacao: "bg-rose-100 text-rose-800 border-rose-300",
  cam: "bg-indigo-100 text-indigo-800 border-indigo-300",
  finalizacao: "bg-violet-100 text-violet-800 border-violet-300",
  prova: "bg-orange-100 text-orange-800 border-orange-300",
  entregue: "bg-teal-100 text-teal-800 border-teal-300",
};

export const TIPOS_TRABALHO = [
  "Enceramento diagnóstico",
  "Coroa/faceta Dissilicato",
  "Coroa/faceta Zircônia",
  "Coroa/faceta Resina",
  "Coroa/faceta Provisória",
  "Provisório",
  "Protocolo Cerâmico",
  "Protocolo Provisório",
  "Protocolo PMMA Definitivo",
  "Placa Miorelaxante",
  "Guia Cirúrgico",
  "Impressão de modelo para placa de clareamento",
  "Retrabalho",
];

// Por onde os arquivos de escaneamento chegam ao laboratório.
export const PLATAFORMAS_ENVIO = ["DSCORE", "ASX", "E-mail"];

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
  plataforma_envio: string | null;
  quem_preencheu: string | null;
  observacoes: string | null;
  dscore_referencia: string | null;
  status: StatusPedido;
  notas_internas: string | null;
  trello_card_id: string | null;
  // Portal GC
  numero?: number | null;
  valor_estimado?: number | null;
  dentista_id?: string | null;
  pedido_fotos?: PedidoFoto[];
}
