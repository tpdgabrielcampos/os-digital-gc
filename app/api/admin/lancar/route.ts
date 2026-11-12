import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { adminAutorizado } from "@/lib/adminAuth";
import { copiarArquivoParaDrive } from "@/lib/drive";
import { nomeSeguro } from "@/lib/arquivosOS";

// "Lançar OS" do painel do laboratório: o Gabriel preenche a OS no nome de um
// dentista (quando ele está na correria). Mesmo formulário do portal, mas a
// gravação passa por aqui, com a chave de serviço, depois de conferir o login do painel.

export const maxDuration = 60;

// Campos que o formulário pode mandar (o resto vem do cadastro do dentista).
const CAMPOS = ["os_id", "paciente_nome", "tipo_trabalho", "dentes", "material", "cor_restauracao", "prazo_desejado", "plataforma_envio", "observacoes", "valor_estimado", "urgente", "aguardando_arquivos"];

export async function POST(req: NextRequest) {
  if (!adminAutorizado(req)) return NextResponse.json({ ok: false, erro: "Entre de novo no painel." }, { status: 401 });
  const body = await req.json().catch(() => null);
  const acao = body?.acao;

  // 1) cria a OS
  if (acao === "criar") {
    const { data: dentista } = await supabaseAdmin.from("dentistas").select("*").eq("id", String(body?.dentistaId ?? "")).maybeSingle();
    if (!dentista) return NextResponse.json({ ok: false, erro: "Dentista não encontrado." }, { status: 404 });
    const dados: Record<string, unknown> = {};
    for (const c of CAMPOS) if (body?.dados && c in body.dados) dados[c] = body.dados[c];
    if (typeof dados.paciente_nome !== "string" || !dados.paciente_nome.trim()) {
      return NextResponse.json({ ok: false, erro: "Falta o nome do paciente." }, { status: 400 });
    }
    const base = {
      ...dados,
      dentista_id: dentista.id,
      dentista_nome: dentista.nome,
      clinica: dentista.clinica,
      contato: dentista.whatsapp,
      quem_preencheu: "Laboratório GC",
    };
    let { data: pedido, error } = await supabaseAdmin.from("pedidos").insert(base).select("id, numero").single();
    if (error && /urgente|aguardando_arquivos/i.test(error.message)) {
      // banco ainda sem essas colunas: marca nas observações
      const { urgente, aguardando_arquivos, ...resto } = base as Record<string, unknown>;
      const marcas = [urgente ? "⚠️ URGENTE — confirmar data." : "", aguardando_arquivos ? "⏳ AGUARDANDO ARQUIVOS." : ""].filter(Boolean).join(" ");
      ({ data: pedido, error } = await supabaseAdmin
        .from("pedidos")
        .insert({ ...resto, observacoes: `${marcas} ${resto.observacoes ?? ""}`.trim() })
        .select("id, numero")
        .single());
    }
    if (error || !pedido) return NextResponse.json({ ok: false, erro: error?.message || "Não consegui criar a OS." }, { status: 500 });
    return NextResponse.json({ ok: true, id: pedido.id, numero: pedido.numero });
  }

  // As outras ações são sobre uma OS que já existe.
  const pedidoId = String(body?.pedidoId ?? "");
  const { data: pedido } = await supabaseAdmin.from("pedidos").select("id, dentista_id").eq("id", pedidoId).maybeSingle();
  if (!pedido) return NextResponse.json({ ok: false, erro: "OS não encontrada." }, { status: 404 });

  // 1b) edição da OS pelo laboratório (os dados do dentista não mudam)
  if (acao === "editar") {
    const dados: Record<string, unknown> = {};
    for (const c of CAMPOS) if (c !== "os_id" && c !== "plataforma_envio" && body?.dados && c in body.dados) dados[c] = body.dados[c];
    if ("paciente_nome" in dados && !(typeof dados.paciente_nome === "string" && dados.paciente_nome.trim())) {
      return NextResponse.json({ ok: false, erro: "Falta o nome do paciente." }, { status: 400 });
    }
    if (dados.prazo_desejado != null && !(typeof dados.prazo_desejado === "string" && /^\d{4}-\d{2}-\d{2}$/.test(dados.prazo_desejado))) {
      return NextResponse.json({ ok: false, erro: "Data inválida." }, { status: 400 });
    }
    let { error } = await supabaseAdmin.from("pedidos").update(dados).eq("id", pedido.id);
    if (error && /urgente|aguardando_arquivos/i.test(error.message)) {
      const { urgente: _u, aguardando_arquivos: _a, ...resto } = dados;
      ({ error } = await supabaseAdmin.from("pedidos").update(resto).eq("id", pedido.id));
    }
    if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  // 2) link para o navegador subir o arquivo direto no Storage
  if (acao === "link_arquivo") {
    const nome = typeof body?.nome === "string" ? body.nome : "arquivo";
    const caminho = `${pedido.dentista_id}/${pedido.id}/${Date.now()}-${nomeSeguro(nome)}`;
    const { data, error } = await supabaseAdmin.storage.from("arquivos-os").createSignedUploadUrl(caminho);
    if (error || !data) return NextResponse.json({ ok: false, erro: error?.message || "Não consegui preparar o envio." }, { status: 500 });
    return NextResponse.json({ ok: true, caminho, token: data.token });
  }

  // 3) arquivo subiu: registra na OS e copia para o Drive
  if (acao === "registrar_arquivo") {
    const caminho = String(body?.caminho ?? "");
    if (!caminho.startsWith(`${pedido.dentista_id}/${pedido.id}/`)) return NextResponse.json({ ok: false, erro: "caminho inválido" }, { status: 400 });
    const { data: reg, error } = await supabaseAdmin
      .from("pedido_arquivos")
      .insert({ pedido_id: pedido.id, dentista_id: pedido.dentista_id, nome: String(body?.nome ?? "arquivo").slice(0, 200), caminho, tamanho: Number(body?.tamanho) || null })
      .select("id")
      .single();
    if (error || !reg) return NextResponse.json({ ok: false, erro: error?.message || "Não consegui registrar o arquivo." }, { status: 500 });
    const r = await copiarArquivoParaDrive(reg.id);
    if (!r.ok) console.error(`[drive] arquivo ${reg.id}: ${r.erro}`); // a rotina diária tenta de novo
    return NextResponse.json({ ok: true });
  }

  // 4) algum arquivo não subiu: deixa a OS aguardando arquivos
  if (acao === "pendente") {
    const { error } = await supabaseAdmin.from("pedidos").update({ aguardando_arquivos: true }).eq("id", pedido.id);
    if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ ok: false, erro: "ação inválida" }, { status: 400 });
}
