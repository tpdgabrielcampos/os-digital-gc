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

/** Perguntas faladas em cada etapa (tom informal; sorteia uma para não soar repetitivo). */
export const PERGUNTAS: Record<EtapaVoz, string[]> = {
  paciente: ["E aí, tudo certo? Bora montar essa OS. Qual o nome do paciente?", "Opa! Vamos lá. Me fala o nome do paciente."],
  trabalhos: ["Qual trabalho vamos realizar?"],
  mais_trabalhos: ["Mais alguma coisa nesse caso? Se não tiver, fala não.", "Tem mais algum trabalho? Se não, é só falar não."],
  cor: ["E a cor final, qual vai ser?", "Qual cor a gente segue?"],
  datas: ["Pra quando você precisa da entrega?", "Qual a data de entrega? Se for urgência, é só falar urgência."],
  observacoes: ["Quer deixar alguma observação pro laboratório? Se não, fala não.", "Alguma observação? Se não tiver, tranquilo, fala não."],
  resumo: ["Tá tudo certo? Fala confirmar, ou me diz o que mudar.", "Confere aí: tá certo? Diz confirmar ou o que quer corrigir."],
};

export const pergunta = (etapa: EtapaVoz) => {
  const l = PERGUNTAS[etapa];
  return l[Math.floor(Math.random() * l.length)];
};

/** Ajustes do assistente escolhidos pelo dentista (guardados no navegador). */
export interface ConfigVoz {
  voz: string; // nome da voz do navegador ("" = automática)
  velocidade: number; // 0.8 a 1.4
  pausa: number; // ms de silêncio antes de considerar que terminou de falar
}

export const CONFIG_PADRAO: ConfigVoz = { voz: "", velocidade: 1, pausa: 2000 };

/** Exemplo mostrado só na tela (não é falado, para o microfone não captar o exemplo como resposta). */
export const DICA: Partial<Record<EtapaVoz, string>> = {
  paciente: "Ex.: Maria Silva",
  trabalhos: "Ex.: coroa de zircônia sobre implante no 11 e 21",
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
  /** Na etapa "resumo": o dentista confirmou. */
  confirmado?: boolean;
  erro?: string;
}
