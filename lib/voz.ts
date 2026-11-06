// Assistente por voz da Nova OS: tipos e etapas compartilhados entre a tela e a API.

export interface TrabalhoVoz {
  servico: string; // caminho completo do catálogo, ex: "PSI – Coroa – Zircônia"
  dentes: string[]; // notação FDI, ex: ["11", "21"]
  retrabalho?: boolean;
}

export interface EstadoVoz {
  paciente: string;
  trabalhos: TrabalhoVoz[];
  cor: string;
  prazo: string; // AAAA-MM-DD ou ""
  instalacao: string; // AAAA-MM-DD ou ""
  observacoes: string;
}

export const ESTADO_VAZIO: EstadoVoz = { paciente: "", trabalhos: [], cor: "", prazo: "", instalacao: "", observacoes: "" };

export type EtapaVoz = "paciente" | "trabalhos" | "mais_trabalhos" | "cor" | "datas" | "observacoes" | "resumo";

/** Pergunta falada em cada etapa. */
export const PERGUNTA: Record<EtapaVoz, string> = {
  paciente: "Olá! Vamos montar a ordem de serviço. Qual é o nome do paciente?",
  trabalhos: "Qual trabalho vamos fazer, e em quais dentes? Por exemplo: coroa de zircônia sobre implante no dente 11.",
  mais_trabalhos: "Tem mais algum trabalho nesse caso? Se não tiver, é só dizer não.",
  cor: "Qual é a cor final do caso? Por exemplo: A2.",
  datas: "Tem um prazo desejado ou uma data de instalação já marcada? Se não tiver, diga não.",
  observacoes: "Alguma observação para o laboratório? Se não tiver, diga não.",
  resumo: "Está tudo certo? Diga confirmar, ou fale o que quer corrigir.",
};

/** Resposta da API para cada fala do dentista. */
export interface RespostaVoz {
  ok: boolean;
  estado?: EstadoVoz;
  /** Pergunta de esclarecimento: a etapa se repete com ela. */
  pergunta?: string | null;
  /** Frase curta de confirmação, lida em voz alta. */
  fala?: string;
  /** Na etapa "mais_trabalhos": o dentista disse que não tem mais. */
  semMais?: boolean;
  /** Na etapa "resumo": o dentista confirmou. */
  confirmado?: boolean;
  erro?: string;
}
