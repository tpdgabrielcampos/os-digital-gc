import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { adminAutorizado } from "@/lib/adminAuth";

const negado = () => NextResponse.json({ ok: false, erro: "Não autorizado" }, { status: 401 });

// Cria uma tabela (opcionalmente copiando os preços de outra).
export async function POST(req: NextRequest) {
  if (!adminAutorizado(req)) return negado();
  const body = await req.json().catch(() => null);
  const nome = String(body?.nome ?? "").trim();
  if (!nome) return NextResponse.json({ ok: false, erro: "Dê um nome para a tabela" }, { status: 400 });

  const { data: nova, error } = await supabaseAdmin.from("tabelas_preco").insert({ nome }).select("id").single();
  if (error || !nova) return NextResponse.json({ ok: false, erro: error?.message }, { status: 500 });

  if (body?.copiarDe) {
    const { data: origem } = await supabaseAdmin.from("precos").select("servico, valor").eq("tabela_id", body.copiarDe);
    if (origem?.length) {
      await supabaseAdmin.from("precos").insert(origem.map((p) => ({ ...p, tabela_id: nova.id })));
    }
  }
  return NextResponse.json({ ok: true, id: nova.id });
}

// Renomeia.
export async function PATCH(req: NextRequest) {
  if (!adminAutorizado(req)) return negado();
  const body = await req.json().catch(() => null);
  const nome = String(body?.nome ?? "").trim();
  if (!body?.id || !nome) return NextResponse.json({ ok: false, erro: "id e nome são obrigatórios" }, { status: 400 });
  const { error } = await supabaseAdmin.from("tabelas_preco").update({ nome }).eq("id", body.id);
  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

// Apaga (os dentistas ligados a ela ficam sem tabela).
export async function DELETE(req: NextRequest) {
  if (!adminAutorizado(req)) return negado();
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ ok: false, erro: "id é obrigatório" }, { status: 400 });
  const { error } = await supabaseAdmin.from("tabelas_preco").delete().eq("id", id);
  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
