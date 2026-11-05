import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { adminAutorizado } from "@/lib/adminAuth";

// Salva os preços de uma tabela. Serviço com valor vazio sai da tabela
// (aparece como "a combinar" para o dentista).
export async function PUT(req: NextRequest) {
  if (!adminAutorizado(req)) return NextResponse.json({ ok: false, erro: "Não autorizado" }, { status: 401 });
  const body = await req.json().catch(() => null);
  const tabelaId = body?.tabela_id;
  const lista: { servico: string; valor: number | null }[] = Array.isArray(body?.precos) ? body.precos : [];
  if (!tabelaId) return NextResponse.json({ ok: false, erro: "tabela_id é obrigatório" }, { status: 400 });

  const comValor = lista.filter((p) => typeof p.valor === "number" && p.valor >= 0);
  const semValor = lista.filter((p) => p.valor === null).map((p) => p.servico);

  if (comValor.length) {
    const { error } = await supabaseAdmin
      .from("precos")
      .upsert(comValor.map((p) => ({ tabela_id: tabelaId, servico: p.servico, valor: p.valor })));
    if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
  }
  if (semValor.length) {
    await supabaseAdmin.from("precos").delete().eq("tabela_id", tabelaId).in("servico", semValor);
  }
  return NextResponse.json({ ok: true });
}
