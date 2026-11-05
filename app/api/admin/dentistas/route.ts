import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { adminAutorizado } from "@/lib/adminAuth";

// Liga um dentista a uma tabela de preço, ou ativa/desativa a conta.
export async function PATCH(req: NextRequest) {
  if (!adminAutorizado(req)) return NextResponse.json({ ok: false, erro: "Não autorizado" }, { status: 401 });
  const body = await req.json().catch(() => null);
  if (!body?.id) return NextResponse.json({ ok: false, erro: "id é obrigatório" }, { status: 400 });

  const campos: Record<string, unknown> = {};
  if ("tabela_id" in body) campos.tabela_id = body.tabela_id || null;
  if (typeof body.ativo === "boolean") campos.ativo = body.ativo;
  if (!Object.keys(campos).length) return NextResponse.json({ ok: false, erro: "Nada para salvar" }, { status: 400 });

  const { error } = await supabaseAdmin.from("dentistas").update(campos).eq("id", body.id);
  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
