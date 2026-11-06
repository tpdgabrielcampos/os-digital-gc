import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { SEPARADOR, todasAsFolhas } from "@/lib/catalogo";
import { ORDEM_DENTES } from "@/lib/odontograma";
import { ESTADO_VAZIO, type EstadoVoz, type EtapaVoz, type RespostaVoz } from "@/lib/voz";

// Assistente por voz: recebe o que o dentista falou numa etapa e devolve o
// estado da OS atualizado. Quem "entende" a fala é o Claude (API da Anthropic).
// Precisa da variável ANTHROPIC_API_KEY no Vercel.

export const maxDuration = 30;

const ETAPAS: EtapaVoz[] = ["paciente", "trabalhos", "mais_trabalhos", "cor", "datas", "observacoes", "resumo"];
const SERVICOS = todasAsFolhas().map((c) => c.join(SEPARADOR));
const SUP = ORDEM_DENTES.filter((d) => d[0] === "1" || d[0] === "2");
const INF = ORDEM_DENTES.filter((d) => d[0] === "3" || d[0] === "4");

function hojeSP() {
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", weekday: "long", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

function instrucoes() {
  return `Você é o assistente de voz de um laboratório de prótese dentária (OS digital GC).
O dentista está montando uma ordem de serviço falando, uma etapa por vez. A fala vem do reconhecimento de voz do celular e pode ter erros de transcrição: interprete com bom senso odontológico (ex.: "zircônia", "dissilicato", "E-max" = Dissilicato, "PSI"/"sobre implante", "PSD"/"sobre dente", "onze" = dente 11).

Hoje é ${hojeSP()} (fuso de São Paulo).

SERVIÇOS VÁLIDOS (use exatamente um destes textos em "servico"):
${SERVICOS.map((s) => `- ${s}`).join("\n")}

REGRAS
- Dentes em notação FDI (11–18, 21–28, 31–38, 41–48). "Superior" = arcada de cima (1x e 2x), "inferior" = de baixo (3x e 4x).
- Protocolo, Placa miorelaxante, Impressão de modelo e Impressão de biomodelo são por arcada: coloque todos os dentes da arcada citada (superior: ${SUP.join(", ")}; inferior: ${INF.join(", ")}).
- "Sobre implante" = PSI, "sobre dente"/"dente natural"/"preparo" = PSD. Se o dentista não disser PSI ou PSD numa coroa/pôntico, ou não disser o material, NÃO invente: faça uma pergunta curta em "pergunta" e mantenha o que já entendeu.
- Se faltar o dente, pergunte.
- Datas: converta para AAAA-MM-DD (ex.: "sexta que vem", "dia 20"). Datas sempre no futuro.
- "Não", "nada", "sem observação" = deixar o campo vazio e seguir.
- Nomes de pessoas: escreva com iniciais maiúsculas, sem "o paciente é".
- Cor: escala Vita (A1, A2, A3, A3.5, B1, BL2…). "A três e meio" = A3.5.
- Na etapa "resumo": se ele confirmar ("confirmar", "tá certo", "pode enviar", "sim"), devolva confirmado=true. Se pedir correção, aplique a correção no estado e devolva confirmado=false com uma "fala" dizendo o que mudou.
- "fala": uma frase curta e simpática confirmando o que entendeu (será lida em voz alta). Sem emojis.

RESPONDA SÓ COM UM JSON, sem texto antes ou depois, neste formato:
{"estado": {"paciente": "", "trabalhos": [{"servico": "", "dentes": [""], "retrabalho": false}], "cor": "", "prazo": "", "instalacao": "", "observacoes": ""},
 "pergunta": null, "fala": "", "semMais": false, "confirmado": false}
"estado" é o estado COMPLETO da OS depois desta fala (copie o que já existia e altere só o que a fala muda; em "trabalhos" e "mais_trabalhos" ACRESCENTE novos trabalhos aos que já existem).
"semMais" = true só na etapa "mais_trabalhos" quando ele disser que não há mais trabalhos.`;
}

/** Garante que só entra serviço do catálogo e dente válido. */
function limpar(e: Partial<EstadoVoz> | undefined, anterior: EstadoVoz): EstadoVoz {
  const s = (v: unknown, max = 300) => (typeof v === "string" ? v.trim().slice(0, max) : "");
  const data = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : "");
  if (!e || typeof e !== "object") return anterior;
  const trabalhos = Array.isArray(e.trabalhos)
    ? e.trabalhos
        .filter((t) => t && SERVICOS.includes(t.servico))
        .map((t) => ({
          servico: t.servico,
          dentes: Array.from(new Set((Array.isArray(t.dentes) ? t.dentes : []).map(String).filter((d) => ORDEM_DENTES.includes(d)))),
          retrabalho: !!t.retrabalho,
        }))
        .filter((t) => t.dentes.length > 0)
    : anterior.trabalhos;
  return {
    paciente: s(e.paciente ?? anterior.paciente, 120),
    trabalhos,
    cor: s(e.cor ?? anterior.cor, 40),
    prazo: data(e.prazo ?? anterior.prazo),
    instalacao: data(e.instalacao ?? anterior.instalacao),
    observacoes: s(e.observacoes ?? anterior.observacoes, 1000),
  };
}

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

export async function POST(req: NextRequest): Promise<NextResponse<RespostaVoz>> {
  const chave = process.env.ANTHROPIC_API_KEY;
  if (!chave) return NextResponse.json({ ok: false, erro: "O assistente por voz ainda não foi ativado pelo laboratório." }, { status: 503 });

  // Só dentista logado usa (evita que estranhos gastem a chave).
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return NextResponse.json({ ok: false, erro: "não autenticado" }, { status: 401 });
  const { data: usuario } = await supabaseAdmin.auth.getUser(token);
  if (!usuario?.user) return NextResponse.json({ ok: false, erro: "não autenticado" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const etapa = body?.etapa as EtapaVoz;
  const fala = typeof body?.fala === "string" ? body.fala.slice(0, 1500) : "";
  const anterior = limpar(body?.estado, ESTADO_VAZIO);
  if (!ETAPAS.includes(etapa) || !fala.trim()) {
    return NextResponse.json({ ok: false, erro: "requisição inválida" }, { status: 400 });
  }

  const pergunta = typeof body?.pergunta === "string" ? body.pergunta.slice(0, 300) : "";
  const conteudo = `ETAPA: ${etapa}
PERGUNTA FEITA: ${pergunta}
ESTADO ATUAL: ${JSON.stringify(anterior)}
FALA DO DENTISTA: """${fala}"""`;

  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": chave, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL || "claude-haiku-5-5",
        max_tokens: 2000,
        system: instrucoes(),
        messages: [{ role: "user", content: conteudo }],
      }),
    });
    const j = await r.json();
    if (!r.ok) {
      console.error("[voz] anthropic", r.status, JSON.stringify(j).slice(0, 300));
      return NextResponse.json({ ok: false, erro: "O assistente não respondeu agora. Tente de novo ou preencha manualmente." }, { status: 502 });
    }
    const texto = (j.content ?? []).filter((c: { type: string }) => c.type === "text").map((c: { text: string }) => c.text).join("");
    const saida = primeiroJson(texto);
    if (!saida) return NextResponse.json({ ok: false, erro: "Não entendi. Pode repetir?" }, { status: 502 });

    return NextResponse.json({
      ok: true,
      estado: limpar(saida.estado, anterior),
      pergunta: typeof saida.pergunta === "string" && saida.pergunta.trim() ? saida.pergunta.trim() : null,
      fala: typeof saida.fala === "string" ? saida.fala.slice(0, 400) : "",
      semMais: !!saida.semMais,
      confirmado: !!saida.confirmado,
    });
  } catch (err) {
    console.error("[voz]", err);
    return NextResponse.json({ ok: false, erro: "Falha de conexão com o assistente." }, { status: 502 });
  }
}
