import { Pedido, StatusPedido } from "@/lib/types";

const TRELLO_API_KEY = process.env.TRELLO_API_KEY ?? "";
const TRELLO_API_TOKEN = process.env.TRELLO_API_TOKEN ?? "";

// Quadro do laboratório no Trello. Pode ser o id completo ou o código curto
// que aparece na URL do quadro (ex: trello.com/b/yFngSY4y/gc -> "yFngSY4y").
const TRELLO_BOARD_ID = process.env.TRELLO_BOARD_ID ?? "";

// Ids de lista fixos (opcional). Se uma dessas variáveis estiver definida na
// Vercel, ela tem prioridade; senão a lista é encontrada pelo NOME no quadro.
const LISTA_FIXA: Record<StatusPedido, string | undefined> = {
  recebido: process.env.TRELLO_LIST_RECEBIDO,
  standby: process.env.TRELLO_LIST_STANDBY,
  cad: process.env.TRELLO_LIST_CAD,
  cam: process.env.TRELLO_LIST_CAM,
  finalizacao: process.env.TRELLO_LIST_FINALIZACAO,
  entregue: process.env.TRELLO_LIST_ENTREGUE,
};

function trelloConfigurado() {
  return Boolean(TRELLO_API_KEY && TRELLO_API_TOKEN);
}

function authParams() {
  return `key=${TRELLO_API_KEY}&token=${TRELLO_API_TOKEN}`;
}

/** Tira acentos, espaços extras e maiúsculas: "Finalizaçao" -> "finalizacao". */
function normalizar(texto: string) {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Status correspondente ao nome de uma lista do quadro (ou undefined). */
function statusPeloNomeDaLista(nome: string): StatusPedido | undefined {
  const n = normalizar(nome);
  if (n.startsWith("recebid")) return "recebido";
  if (n.startsWith("standby") || n.startsWith("stand by")) return "standby";
  if (n === "cad") return "cad";
  if (n === "cam") return "cam";
  if (n.startsWith("finaliza")) return "finalizacao";
  if (n.startsWith("entregue")) return "entregue";
  return undefined;
}

interface ListaTrello {
  id: string;
  name: string;
}

// Cache curto das listas do quadro, pra não consultar o Trello a cada pedido.
let cacheListas: { listas: ListaTrello[]; em: number } | null = null;

async function listasDoQuadro(): Promise<ListaTrello[]> {
  if (!trelloConfigurado() || !TRELLO_BOARD_ID) return [];
  if (cacheListas && Date.now() - cacheListas.em < 5 * 60 * 1000) return cacheListas.listas;
  try {
    const res = await fetch(
      `https://api.trello.com/1/boards/${TRELLO_BOARD_ID}/lists?fields=name&filter=open&${authParams()}`
    );
    if (!res.ok) {
      console.error("Falha ao ler as listas do Trello:", await res.text());
      return [];
    }
    const listas = (await res.json()) as ListaTrello[];
    cacheListas = { listas, em: Date.now() };
    return listas;
  } catch (err) {
    console.error("Erro ao ler as listas do Trello:", err);
    return [];
  }
}

/**
 * Id da lista do Trello correspondente a um status. Para "entregue", prefere
 * a lista do mês atual (ex: "Entregues Outubro") e, se não existir, a
 * primeira lista que começa com "Entregues".
 */
export async function listIdParaStatus(status: StatusPedido): Promise<string | undefined> {
  if (LISTA_FIXA[status]) return LISTA_FIXA[status];
  const candidatas = (await listasDoQuadro()).filter(
    (l) => statusPeloNomeDaLista(l.name) === status
  );
  if (status === "entregue" && candidatas.length > 1) {
    const mes = normalizar(
      new Date().toLocaleString("pt-BR", { month: "long", timeZone: "America/Sao_Paulo" })
    );
    const doMes = candidatas.find((l) => normalizar(l.name).includes(mes));
    if (doMes) return doMes.id;
  }
  return candidatas[0]?.id;
}

/** Status correspondente a uma lista do Trello (pelo id fixo ou pelo nome). */
export async function statusParaListId(
  listId: string,
  nomeDaLista?: string
): Promise<StatusPedido | undefined> {
  const fixa = (Object.entries(LISTA_FIXA) as [StatusPedido, string | undefined][]).find(
    ([, id]) => id === listId
  );
  if (fixa) return fixa[0];
  if (nomeDaLista) return statusPeloNomeDaLista(nomeDaLista);
  const lista = (await listasDoQuadro()).find((l) => l.id === listId);
  return lista ? statusPeloNomeDaLista(lista.name) : undefined;
}

/** "2026-10-18" -> "18/10/2026" (sem passar por fuso horário). */
function dataBR(valor: string) {
  const [ano, mes, dia] = valor.slice(0, 10).split("-");
  return ano && mes && dia ? `${dia}/${mes}/${ano}` : valor;
}

function descricaoCartao(pedido: Pedido) {
  const linhas = [
    `Dentista: ${pedido.dentista_nome}`,
    // OS com vários trabalhos: um por linha.
    pedido.tipo_trabalho.includes(" + ")
      ? `Trabalhos:\n${pedido.tipo_trabalho
          .split(" + ")
          .map((t) => `• ${t}`)
          .join("\n")}`
      : `Trabalho: ${pedido.tipo_trabalho}`,
    pedido.dentes?.length ? `Dentes: ${pedido.dentes.join(", ")}` : null,
    pedido.material ? `Material: ${pedido.material}` : null,
    pedido.cor_restauracao ? `Cor: ${pedido.cor_restauracao}` : null,
    pedido.valor_estimado != null
      ? `Valor estimado: ${Number(pedido.valor_estimado).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}`
      : null,
    pedido.prazo_desejado ? `Prazo desejado: ${dataBR(pedido.prazo_desejado)}` : null,
    pedido.instalacao_agendada
      ? `Instalação agendada: ${dataBR(pedido.instalacao_agendada)}`
      : null,
    pedido.plataforma_envio ? `Plataforma de envio: ${pedido.plataforma_envio}` : null,
    pedido.quem_preencheu ? `Preenchido por: ${pedido.quem_preencheu}` : null,
    pedido.dscore_referencia ? `Referência DS Core: ${pedido.dscore_referencia}` : null,
    pedido.observacoes ? `Observações: ${pedido.observacoes}` : null,
    "",
    `Ver no painel: ${process.env.NEXT_PUBLIC_SITE_URL ?? ""}/pedido/${pedido.id}`,
  ].filter(Boolean);
  return linhas.join("\n");
}

/**
 * Cria um cartão no Trello para um pedido novo, na lista correspondente ao
 * status atual dele (normalmente "recebido"). Retorna o id do cartão criado,
 * ou null se o Trello não estiver configurado ou a chamada falhar — nesse
 * caso o pedido continua existindo normalmente, só sem o cartão.
 */
export async function criarCartaoTrello(pedido: Pedido): Promise<string | null> {
  if (!trelloConfigurado()) return null;
  const listId = await listIdParaStatus(pedido.status);
  if (!listId) return null;

  try {
    const params = new URLSearchParams({
      idList: listId,
      name: `${pedido.numero ? `GC-${String(pedido.numero).padStart(4, "0")} · ` : ""}${pedido.paciente_nome} — ${pedido.tipo_trabalho}`,
      desc: descricaoCartao(pedido),
    });
    const res = await fetch(`https://api.trello.com/1/cards?${authParams()}&${params}`, {
      method: "POST",
    });
    if (!res.ok) {
      console.error("Falha ao criar cartão no Trello:", await res.text());
      return null;
    }
    const data = await res.json();
    return data.id as string;
  } catch (err) {
    console.error("Erro ao criar cartão no Trello:", err);
    return null;
  }
}

/**
 * Move um cartão existente para a lista correspondente a um novo status.
 * Não lança erro se falhar — a atualização do status no banco já aconteceu
 * antes dessa chamada, e o Trello é só um espelho.
 */
export async function moverCartaoTrello(cardId: string, status: StatusPedido): Promise<boolean> {
  if (!trelloConfigurado()) return false;
  const listId = await listIdParaStatus(status);
  if (!listId) return false;

  try {
    const res = await fetch(
      `https://api.trello.com/1/cards/${cardId}?idList=${listId}&${authParams()}`,
      { method: "PUT" }
    );
    if (!res.ok) {
      console.error("Falha ao mover cartão no Trello:", await res.text());
      return false;
    }
    return true;
  } catch (err) {
    console.error("Erro ao mover cartão no Trello:", err);
    return false;
  }
}
