import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { adminAutorizado } from "@/lib/adminAuth";
import { CATEGORIAS_SAIDA, FORMAS_PAGAMENTO } from "@/lib/financeiro";

// Leitura de nota fiscal / cupom / boleto por foto ou PDF.
// 1) guarda o arquivo no Storage (bucket privado "notas"); 2) o Claude lê e devolve os campos;
// 3) a tela abre o lançamento preenchido para o Gabriel conferir e salvar.

export const maxDuration = 60;
const BUCKET = "notas";
const TIPOS = ["image/jpeg", "image/png", "image/webp", "image/gif", "application/pdf"];

function hojeSP() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
}

function instrucoes() {
  return `Você lê comprovantes de despesas de um laboratório de prótese dentária no Brasil (nota fiscal, NFC-e, cupom fiscal, DANFE, boleto, recibo, fatura de cartão).
Hoje é ${hojeSP()}.
Extraia os dados e responda SÓ com um JSON, sem texto antes ou depois:
{"fornecedor": "", "cnpj": "", "descricao": "", "categoria": "", "valor": 0, "data": "AAAA-MM-DD", "vencimento": "AAAA-MM-DD ou vazio", "forma_pagamento": "", "parcelas": 1, "numero_documento": "", "itens": "", "confianca": "alta|media|baixa", "observacao": ""}
Regras:
- "valor": valor TOTAL pago/a pagar (número com ponto decimal, sem R$). Se houver desconto, use o valor final.
- "data": data de emissão/compra. "vencimento": só se for boleto ou tiver vencimento explícito; se não houver, deixe "".
- "categoria": escolha exatamente uma destas: ${CATEGORIAS_SAIDA.join(" | ")}. Ex.: blocos de zircônia, resina, brocas, dissilicato = "Materiais e insumos"; fresagem/impressão/cerâmica feita por outro laboratório = "Terceirizados"; luz/água = "Energia / água"; DAS = "Impostos (DAS)".
- "forma_pagamento": uma destas se der para saber: ${FORMAS_PAGAMENTO.join(" | ")}; senão "".
- "parcelas": número de parcelas se estiver parcelado no cartão/boleto; senão 1.
- "descricao": curta (até 60 caracteres), ex.: "Blocos de zircônia — Fornecedor X".
- "itens": resumo dos principais itens comprados (até 200 caracteres).
- Se não for um comprovante legível, devolva confianca "baixa" e explique em "observacao".`;
}

function primeiroJson(t: string) {
  const i = t.indexOf("{");
  const f = t.lastIndexOf("}");
  if (i < 0 || f <= i) return null;
  try {
    return JSON.parse(t.slice(i, f + 1));
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  if (!adminAutorizado(req)) return NextResponse.json({ ok: false, erro: "Não autorizado" }, { status: 401 });
  const chave = process.env.ANTHROPIC_API_KEY;
  if (!chave) return NextResponse.json({ ok: false, erro: "Falta a chave ANTHROPIC_API_KEY no Vercel." }, { status: 503 });

  const b = await req.json().catch(() => null);
  const tipo = String(b?.tipo ?? "");
  const dados = String(b?.dados ?? "");
  const nome = String(b?.nome ?? "nota").replace(/[^a-zA-Z0-9._-]+/g, "_").slice(-80);
  if (!TIPOS.includes(tipo) || !dados) return NextResponse.json({ ok: false, erro: "Envie uma foto (JPG/PNG) ou PDF." }, { status: 400 });
  const bytes = Buffer.from(dados, "base64");
  if (bytes.length > 4.2 * 1024 * 1024) return NextResponse.json({ ok: false, erro: "Arquivo muito grande (máx. 4 MB)." }, { status: 413 });

  // 1) guarda o comprovante
  const caminho = `${hojeSP().slice(0, 7)}/${Date.now()}-${nome}`;
  let anexo: string | null = caminho;
  const up = await supabaseAdmin.storage.from(BUCKET).upload(caminho, bytes, { contentType: tipo, upsert: false });
  if (up.error) {
    console.error("[nota] storage", up.error.message);
    anexo = null; // segue mesmo assim: o importante é ler a nota
  }

  // 2) lê com o Claude
  const bloco =
    tipo === "application/pdf"
      ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: dados } }
      : { type: "image", source: { type: "base64", media_type: tipo, data: dados } };
  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": chave, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL_NOTAS || process.env.ANTHROPIC_MODEL || "claude-haiku-5-5",
        max_tokens: 1200,
        system: instrucoes(),
        messages: [{ role: "user", content: [bloco, { type: "text", text: "Leia este comprovante e devolva o JSON." }] }],
      }),
    });
    const j = await r.json();
    if (!r.ok) {
      console.error("[nota] anthropic", r.status, JSON.stringify(j).slice(0, 300));
      return NextResponse.json({ ok: false, erro: "Não consegui ler a nota agora. Tente de novo.", anexo }, { status: 502 });
    }
    const texto = (j.content ?? []).filter((c: { type: string }) => c.type === "text").map((c: { text: string }) => c.text).join("");
    const s = primeiroJson(texto);
    if (!s) return NextResponse.json({ ok: false, erro: "Não entendi essa nota. Tente uma foto mais nítida.", anexo }, { status: 502 });
    const data = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : "");
    const valor = Number(s.valor);
    return NextResponse.json({
      ok: true,
      anexo,
      nota: {
        fornecedor: String(s.fornecedor ?? "").slice(0, 120),
        cnpj: String(s.cnpj ?? "").slice(0, 30),
        descricao: String(s.descricao ?? "").slice(0, 120),
        categoria: CATEGORIAS_SAIDA.includes(s.categoria) ? s.categoria : "Outras despesas",
        valor: Number.isFinite(valor) && valor > 0 ? Math.round(valor * 100) / 100 : null,
        data: data(s.data) || hojeSP(),
        vencimento: data(s.vencimento),
        forma_pagamento: FORMAS_PAGAMENTO.includes(s.forma_pagamento) ? s.forma_pagamento : "",
        parcelas: Math.min(Math.max(Number(s.parcelas) || 1, 1), 48),
        numero_documento: String(s.numero_documento ?? "").slice(0, 60),
        itens: String(s.itens ?? "").slice(0, 300),
        confianca: ["alta", "media", "baixa"].includes(s.confianca) ? s.confianca : "media",
        observacao: String(s.observacao ?? "").slice(0, 300),
      },
    });
  } catch (e) {
    console.error("[nota]", e);
    return NextResponse.json({ ok: false, erro: "Falha de conexão ao ler a nota.", anexo }, { status: 502 });
  }
}

// Abre o comprovante guardado (link temporário).
export async function GET(req: NextRequest) {
  if (!adminAutorizado(req)) return NextResponse.json({ ok: false, erro: "Não autorizado" }, { status: 401 });
  const caminho = req.nextUrl.searchParams.get("p") ?? "";
  if (!caminho || caminho.includes("..")) return NextResponse.json({ ok: false, erro: "arquivo inválido" }, { status: 400 });
  const { data, error } = await supabaseAdmin.storage.from(BUCKET).createSignedUrl(caminho, 300);
  if (error || !data?.signedUrl) return NextResponse.json({ ok: false, erro: "Comprovante não encontrado" }, { status: 404 });
  return NextResponse.redirect(data.signedUrl);
}
