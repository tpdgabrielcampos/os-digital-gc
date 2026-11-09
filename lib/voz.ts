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
  urgente?: boolean;
}

export const ESTADO_VAZIO: EstadoVoz = { paciente: "", trabalhos: [], cor: "", prazo: "", instalacao: "", observacoes: "" };

export type EtapaVoz = "paciente" | "trabalhos" | "trabalho_opcao" | "trabalho_dentes" | "mais_trabalhos" | "cor" | "datas" | "observacoes" | "resumo";

/** Perguntas fixas de cada etapa (sempre as mesmas: o áudio fica guardado e toca na hora). */
export const PERGUNTAS: Partial<Record<EtapaVoz, string>> = {
  paciente: "Opa! Vamos montar essa OS. Qual o nome do paciente?",
  trabalhos: "Qual trabalho vamos realizar?",
  mais_trabalhos: "Mais algum trabalho?",
  cor: "Qual a cor?",
  datas: "Pra quando é a entrega?",
  observacoes: "Alguma observação?",
  resumo: "Tá certo? Fala confirmar, ou me diz o que mudar.",
};

export const pergunta = (etapa: EtapaVoz) => PERGUNTAS[etapa] ?? "";

/** Ajustes do assistente escolhidos pelo dentista (guardados no navegador). */
export interface ConfigVoz {
  voz: string; // nome da voz do navegador ("" = automática)
  velocidade: number; // 0.8 a 1.4
  pausa: number; // ms de silêncio antes de considerar que terminou de falar
}

export const CONFIG_PADRAO: ConfigVoz = { voz: "", velocidade: 1, pausa: 1300 };

/** Exemplo mostrado só na tela (não é falado, para o microfone não captar o exemplo como resposta). */
export const DICA: Partial<Record<EtapaVoz, string>> = {
  paciente: "Ex.: Maria Silva",
  trabalhos: "Ex.: coroa de zircônia sobre implante no 11 e 21",
  trabalho_opcao: "Responda só a opção (ex.: zircônia, sobre implante…)",
  trabalho_dentes: "Ex.: 11 e 21, do 13 ao 23, superior…",
  mais_trabalhos: "Ex.: faceta de dissilicato no 12 — ou “não”",
  cor: "Ex.: A2, A3.5, BL2",
  datas: "Ex.: dia 20, sexta que vem — ou “urgência”",
  observacoes: "Ex.: paciente com bruxismo — ou “não”",
  resumo: "Diga “confirmar” ou o que quer corrigir",
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
  /** Trabalhos entendidos pela IA (nomes do catálogo + dentes). */
  itens?: { nos: string[]; dentes: string[]; retrabalho: boolean }[];
  prazo?: string;
  urgente?: boolean;
  /** Na etapa "resumo": o dentista confirmou. */
  confirmado?: boolean;
  erro?: string;
}
