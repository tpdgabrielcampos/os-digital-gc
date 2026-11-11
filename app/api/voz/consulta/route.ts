import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { numeroOS } from "@/lib/gc";

// Assistente da página principal do portal: o dentista fala (ou digita) e o
// Claude decide se é uma BUSCA nos casos dele, uma CONSULTA TÉCNICA de prótese
// ou um pedido para abrir uma NOVA OS. Precisa da variável ANTHROPIC_API_KEY.

export const maxDuration = 30;

const STATUS: Record<string, string> = {
  recebido: "recebido",
  standby: "aguardando informação do dentista",
  cad: "em desenho (CAD)",
  aprovacao: "aguardando aprovação do projeto pelo dentista",
  cam: "em produção (CAM)",
  finalizacao: "em finalização",
  prova: "em prova",
  entregue: "entregue",
};

function hojeSP() {
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", weekday: "long", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

const SISTEMA = `Você é o assistente do portal do dentista do laboratório de prótese dentária GC (OS digital GC). Fala português do Brasil, com simpatia e objetividade, como um técnico de prótese experiente.
O dentista falou pelo microfone (a transcrição pode ter erros: interprete com bom senso) ou digitou. Decida qual destes é o pedido:

1. "busca": quer encontrar casos/pacientes dele (ex.: "cadê a coroa da Maria", "casos do João", "o que está aguardando aprovação", "o que entrega esta semana"). Use SOMENTE a lista de casos fornecida. Nomes podem vir com erro de transcrição: aproxime pelo som.
2. "consulta": pergunta técnica de prótese, materiais, preparo, cimentação, cor, prazos do laboratório, fluxo digital etc. Responda com precisão técnica. Se a dúvida depender de avaliação clínica, diga isso. Não invente normas, marcas ou números de que não tenha certeza.
3. "nova_os": quer enviar/criar um caso novo.
4. "outro": qualquer outra coisa (cumprimento, assunto fora do laboratório). Responda gentilmente e diga o que você sabe fazer.

Responda SÓ com JSON, sem texto antes ou depois:
{"tipo": "busca" | "consulta" | "nova_os" | "outro", "fala": "resposta curta para ser FALADA em voz alta (no máximo 2 frases, sem listas, sem símbolos)", "texto": "resposta completa para a tela (pode ter até 8 linhas; use quebras de linha; vazio se a fala já basta)", "ids": ["ids dos casos encontrados, só em busca"], "rotulo": "descrição curta do filtro, só em busca (ex.: Paciente Maria Souza)"}
Em busca sem resultado, "ids" vazio e a fala diz que não encontrou. Nunca cite casos que não estão na lista.`;

function primeiroJson(texto: string) {
  const ini = texto.indexOf("{");
  const fim = texto.lastIndexOf("}");
  if (ini < 0 || fim <= ini) return null;
  try {
    return JSON.parse(texto.slice(ini, fim + 1));
  } catch {
    return null;
  }
}

interface Caso {
  id: string;
  numero: number | null;
  paciente_nome: string;
  tipo_trabalho: string;
  dentes: string[] | null;
  status: string;
  prazo_desejado: string | null;
  created_at: string;
}

export async function POST(req: NextRequest) {
  const chave = process.env.ANTHROPIC_API_KEY;
  if (!chave) return NextResponse.json({ ok: false, erro: "O assistente ainda não foi ativado pelo laboratório." }, { status: 503 });

  // Só o dentista logado, e só com os casos dele.
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return NextResponse.json({ ok: false, erro: "não autenticado" }, { status: 401 });
  const { data: usuario } = await supabaseAdmin.auth.getUser(token);
  const uid = usuario?.user?.id;
  if (!uid) return NextResponse.json({ ok: false, erro: "não autenticado" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const fala = typeof body?.fala === "string" ? body.fala.trim().slice(0, 1500) : "";
  if (!fala) return NextResponse.json({ ok: false, erro: "requisição inválida" }, { status: 400 });
  const historico: { de: string; texto: string }[] = Array.isArray(body?.historico)
    ? body.historico
        .slice(-6)
        .filter((m: unknown) => m && typeof (m as { texto?: unknown }).texto === "string")
        .map((m: { de?: string; texto: string }) => ({ de: m.de === "dentista" ? "dentista" : "assistente", texto: m.texto.slice(0, 600) }))
    : [];

  const { data: casos } = await supabaseAdmin
    .from("pedidos")
    .select("id, numero, paciente_nome, tipo_trabalho, dentes, status, prazo_desejado, created_at")
    .eq("dentista_id", uid)
    .order("created_at", { ascending: false })
    .limit(300);
  const lista = (casos as Caso[] | null) ?? [];
  const validos = new Set(lista.map((c) => c.id));

  const linhas = lista
    .map(
      (c) =>
        `${c.id} | ${numeroOS(c.numero)} | ${c.paciente_nome} | ${c.tipo_trabalho} | dentes ${(c.dentes ?? []).join(",") || "-"} | ${STATUS[c.status] ?? c.status} | enviado ${c.created_at.slice(0, 10)} | entrega ${c.prazo_desejado ?? "-"}`
    )
    .join("\n");

  const conteudo = `HOJE: ${hojeSP()}
CASOS DO DENTISTA (id | OS | paciente | trabalho | dentes | situação | enviado | entrega):
${linhas || "(nenhum caso ainda)"}

CONVERSA ANTERIOR:
${historico.map((m) => `${m.de}: ${m.texto}`).join("\n") || "(início)"}

O DENTISTA DISSE: """${fala}"""`;

  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": chave, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL || "claude-haiku-5-5",
        max_tokens: 900,
        system: [{ type: "text", text: SISTEMA, cache_control: { type: "ephemeral" } }],
        messages: [{ role: "user", content: conteudo }],
      }),
    });
    const j = await r.json();
    if (!r.ok) {
      console.error("[consulta] anthropic", r.status, JSON.stringify(j).slice(0, 300));
      return NextResponse.json({ ok: false, erro: "O assistente não respondeu agora. Tente de novo." }, { status: 502 });
    }
    const texto = (j.content ?? []).filter((c: { type: string }) => c.type === "text").map((c: { text: string }) => c.text).join("");
    const saida = primeiroJson(texto);
    if (!saida) return NextResponse.json({ ok: false, erro: "Não entendi. Pode repetir?" }, { status: 502 });

    const tipo = ["busca", "consulta", "nova_os", "outro"].includes(saida.tipo) ? saida.tipo : "outro";
    const ids = tipo === "busca" && Array.isArray(saida.ids) ? saida.ids.map(String).filter((id: string) => validos.has(id)) : [];
    return NextResponse.json({
      ok: true,
      tipo,
      fala: typeof saida.fala === "string" ? saida.fala.slice(0, 400) : "",
      texto: typeof saida.texto === "string" ? saida.texto.slice(0, 2000) : "",
      ids,
      rotulo: typeof saida.rotulo === "string" ? saida.rotulo.slice(0, 120) : "",
    });
  } catch (err) {
    console.error("[consulta]", err);
    return NextResponse.json({ ok: false, erro: "Falha de conexão com o assistente." }, { status: 502 });
  }
}
