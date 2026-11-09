import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { CATALOGO, SEPARADOR, todasAsFolhas } from "@/lib/catalogo";
import { ORDEM_DENTES } from "@/lib/odontograma";
import { ESTADO_VAZIO, type EstadoVoz, type EtapaVoz, type RespostaVoz } from "@/lib/voz";

// Assistente por voz: recebe o que o dentista falou numa etapa e devolve o
// estado da OS atualizado. Quem "entende" a fala é o Claude (API da Anthropic).
// Precisa da variável ANTHROPIC_API_KEY no Vercel.

export const maxDuration = 30;

const ETAPAS: EtapaVoz[] = ["paciente", "trabalhos", "mais_trabalhos", "cor", "datas", "observacoes", "resumo"];
const SERVICOS = todasAsFolhas().map((c) => c.join(SEPARADOR));
const NOMES = new Set(todasAsFolhas().flat());

function hojeSP() {
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", weekday: "long", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

function arvore(nos = CATALOGO, nivel = 0): string {
  return nos.map((n) => `${"  ".repeat(nivel)}- ${n.nome}${n.descricao ? ` (${n.descricao})` : ""}\n${n.filhos ? arvore(n.filhos, nivel + 1) : ""}`).join("");
}

// Parte fixa do prompt (fica em cache na Anthropic: responde mais rápido e gasta menos).
const CONHECIMENTO = `Você é o assistente de voz de um laboratório de prótese dentária (OS digital GC) e entende de prótese como um técnico experiente.
O dentista monta a ordem de serviço falando. A fala vem do reconhecimento de voz do celular e pode ter erros de transcrição: interprete com bom senso odontológico.

CATÁLOGO DO LABORATÓRIO (árvore; cada trabalho é um caminho até uma folha):
${arvore()}
GLOSSÁRIO
- "Sobre implante", "em cima do implante", "parafusada", "cimentada no implante" = PSI. "Sobre dente", "dente natural", "preparo", "dente preparado" = PSD.
- "E-max", "emax", "cerâmica pura", "dissilicato de lítio" = Dissilicato. "Zirconia", "zirc", "zircônia monolítica" = Zircônia. "PMMA", "provisório", "temporária" = Resina provisória. "Nanocerâmica" = Resina híbrida.
- "Lente", "lente de contato", "laminado" = Faceta. "Ponte"/"prótese fixa de 3 elementos" = coroas nos pilares + pôntico no meio (ex.: ponte do 14 ao 16 = Coroa no 14 e 16, Pôntico no 15).
- "Protocolo", "híbrida sobre implantes", "All-on-4" = Protocolo (por arcada). "Barra", "IBAR" = só no Design CAD.
- "Placa", "placa de bruxismo", "miorrelaxante" = Placa miorelaxante (por arcada).
- "Encerar", "enceramento", "wax-up" = Enceramento diagnóstico (só dentes; não tem material).
- "Ajuste de cor", "maquiagem", "caracterização" = Ajuste de cor (só dentes).
- "Modelo", "imprimir modelo" = Impressão de modelo. "Biomodelo" = Impressão de biomodelo (por arcada).
- "Guia cirúrgica", "planejamento" = Planejamento de implante (Guiado ou Orientado).
- "Só o design", "só o desenho", "só o CAD", "só o projeto" = Design CAD (sem fresagem nem finalização).
- Dentes em notação FDI (11–18, 21–28, 31–38, 41–48). "Onze" = 11, "vinte e um" = 21. Superior = 1x e 2x, inferior = 3x e 4x. Lado direito do paciente: superior 1x, inferior 4x; esquerdo: superior 2x, inferior 3x.
- Cor na escala Vita (A1, A2, A3, A3.5, B1, BL2…).
- PRAZO MÍNIMO (dias corridos a partir de hoje): Design CAD de IBAR = 1 dia; demais Design CAD = 2 dias; trabalhos de produção = 7 dias.

REGRAS
- NUNCA invente o que o dentista não disse: se ele não falou PSI/PSD ou o material, deixe de fora (o sistema pergunta depois).
- Responda SÓ com o JSON pedido, sem texto antes ou depois.`;

/** Instruções da tarefa de cada etapa. */
function tarefa(etapa: EtapaVoz) {
  if (etapa === "trabalhos" || etapa === "mais_trabalhos")
    return `TAREFA: liste os trabalhos que o dentista pediu nesta fala.
Formato: {"trabalhos": [{"nos": ["PSI", "Coroa", "Zircônia"], "dentes": ["11", "21"], "retrabalho": false}]}
"nos" = nomes EXATOS do catálogo que ele disse ou que estão implícitos com certeza (ex.: "enceramento" = ["Enceramento diagnóstico"]; "coroa de emax" = ["Coroa", "Dissilicato"], sem PSI/PSD porque ele não disse). "dentes" = só os que ele citou (vazio se não citou). Se não for pedido de trabalho nenhum, devolva {"trabalhos": []}.`;
  if (etapa === "datas")
    return `TAREFA: data de entrega pedida. Hoje é ${hojeSP()} (fuso de São Paulo).
Formato: {"prazo": "AAAA-MM-DD", "urgente": false}. Se for urgência, {"prazo": "", "urgente": true}. Se não der para saber a data, {"prazo": "", "urgente": false}. Datas sempre no futuro.`;
  return `TAREFA: o dentista ouviu o resumo da OS e pediu uma correção. Hoje é ${hojeSP()}.
Aplique a correção no estado e devolva o estado COMPLETO. Em "trabalhos", "servico" é o caminho completo do catálogo unido por " – " (ex.: "PSI – Coroa – Zircônia").
Formato: {"estado": {"paciente": "", "trabalhos": [{"servico": "", "dentes": [""], "retrabalho": false}], "cor": "", "prazo": "", "instalacao": "", "observacoes": ""}, "fala": "frase curta dizendo o que mudou", "confirmado": false}
Se ele só confirmou, devolva o mesmo estado com "confirmado": true.`;
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
    urgente: !!(e.urgente ?? anterior.urgente),
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
  const conteudo = `${tarefa(etapa)}

PERGUNTA FEITA: ${pergunta}
ESTADO ATUAL DA OS: ${JSON.stringify(anterior)}
FALA DO DENTISTA: """${fala}"""`;

  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": chave, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL || "claude-haiku-5-5",
        max_tokens: 900,
        system: [{ type: "text", text: CONHECIMENTO, cache_control: { type: "ephemeral" } }],
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

    if (etapa === "trabalhos" || etapa === "mais_trabalhos") {
      const lista = Array.isArray(saida.trabalhos) ? saida.trabalhos : [];
      return NextResponse.json({
        ok: true,
        itens: lista
          .map((t: { nos?: unknown; dentes?: unknown; retrabalho?: unknown }) => ({
            nos: (Array.isArray(t?.nos) ? t.nos : []).map(String).filter((n: string) => NOMES.has(n)),
            dentes: (Array.isArray(t?.dentes) ? t.dentes : []).map(String).filter((d: string) => ORDEM_DENTES.includes(d)),
            retrabalho: !!t?.retrabalho,
          }))
          .filter((t: { nos: string[] }) => t.nos.length > 0),
      });
    }
    if (etapa === "datas") {
      const prazo = typeof saida.prazo === "string" && /^\d{4}-\d{2}-\d{2}$/.test(saida.prazo) ? saida.prazo : "";
      return NextResponse.json({ ok: true, prazo, urgente: !!saida.urgente });
    }
    return NextResponse.json({
      ok: true,
      estado: limpar(saida.estado, anterior),
      fala: typeof saida.fala === "string" ? saida.fala.slice(0, 300) : "",
      confirmado: !!saida.confirmado,
    });
  } catch (err) {
    console.error("[voz]", err);
    return NextResponse.json({ ok: false, erro: "Falha de conexão com o assistente." }, { status: 502 });
  }
}
