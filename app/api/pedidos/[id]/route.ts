import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { STATUS_ORDER } from "@/lib/types";
import { moverCartaoTrello } from "@/lib/trello";

const COOKIE_NAME = "tatim_admin_session";

function autorizado(req: NextRequest) {
  const cookie = req.cookies.get(COOKIE_NAME)?.value;
  const esperado = process.env.ADMIN_PASSWORD ?? "";
  return Boolean(cookie && esperado && cookie === esperado);
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  if (!autorizado(req)) {
    return NextResponse.json({ ok: false, erro: "Não autorizado" }, { status: 401 });
  }

  const body = await req.json();
  const atualizacao: Record<string, unknown> = {};

  if (body.status) {
    if (!STATUS_ORDER.includes(body.status)) {
      return NextResponse.json({ ok: false, erro: "Status inválido" }, { status: 400 });
    }
    atualizacao.status = body.status;
    atualizacao.status_updated_at = new Date().toISOString();
  }

  if ("prazo_desejado" in body) {
    const v = body.prazo_desejado;
    if (v !== null && !(typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v))) {
      return NextResponse.json({ ok: false, erro: "Data inválida" }, { status: 400 });
    }
    atualizacao.prazo_desejado = v;
  }

  if (typeof body.notas_internas === "string") {
    atualizacao.notas_internas = body.notas_internas;
  }

  if (Object.keys(atualizacao).length === 0) {
    return NextResponse.json({ ok: false, erro: "Nada para atualizar" }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from("pedidos")
    .update(atualizacao)
    .eq("id", params.id)
    .select("id, status, trello_card_id")
    .single();

  if (error) {
    return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json(
      { ok: false, erro: "Pedido não encontrado (nada foi atualizado)" },
      { status: 404 }
    );
  }

  // Espelha a mudança de status no Trello (se o pedido já tiver um cartão
  // vinculado). Isso não bloqueia a resposta em caso de falha — o status já
  // foi salvo no banco, que é a fonte da verdade.
  if (body.status && data.trello_card_id) {
    await moverCartaoTrello(data.trello_card_id, body.status).catch(() => false);
  }

  return NextResponse.json({ ok: true, pedido: data });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  if (!autorizado(req)) {
    return NextResponse.json({ ok: false, erro: "Não autorizado" }, { status: 401 });
  }

  // As fotos e o registro dos arquivos (pedido_fotos / pedido_arquivos) têm
  // "on delete cascade", então somem junto. Os arquivos guardados no servidor
  // (Storage) são apagados aqui; a cópia no Google Drive fica.
  const { data: arquivos } = await supabaseAdmin
    .from("pedido_arquivos")
    .select("caminho")
    .eq("pedido_id", params.id)
    .eq("removido_do_servidor", false);
  if (arquivos?.length) {
    await supabaseAdmin.storage.from("arquivos-os").remove(arquivos.map((a) => a.caminho));
  }

  const { error, count } = await supabaseAdmin
    .from("pedidos")
    .delete({ count: "exact" })
    .eq("id", params.id);

  if (error) {
    return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
  }

  if (!count) {
    return NextResponse.json(
      { ok: false, erro: "Pedido não encontrado (nada foi apagado)" },
      { status: 404 }
    );
  }

  return NextResponse.json({ ok: true });
}
