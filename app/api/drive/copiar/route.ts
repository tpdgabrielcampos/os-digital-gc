import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { copiarArquivoParaDrive } from "@/lib/drive";

// O Apps Script pode levar alguns segundos para baixar um STL grande.
export const maxDuration = 60;

// Chamado pelo portal logo depois de cada arquivo subir. Só o dono do arquivo
// (dentista logado) pode pedir a cópia. Se falhar, a rotina diária tenta de novo.
export async function POST(req: NextRequest) {
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const body = await req.json().catch(() => null);
  const arquivoId = body?.arquivoId;
  if (!token || typeof arquivoId !== "string") {
    return NextResponse.json({ ok: false, erro: "requisição inválida" }, { status: 400 });
  }

  const { data: usuario } = await supabaseAdmin.auth.getUser(token);
  if (!usuario?.user) return NextResponse.json({ ok: false, erro: "não autenticado" }, { status: 401 });

  const { data: arq } = await supabaseAdmin
    .from("pedido_arquivos")
    .select("dentista_id")
    .eq("id", arquivoId)
    .single();
  if (!arq || arq.dentista_id !== usuario.user.id) {
    return NextResponse.json({ ok: false, erro: "arquivo não encontrado" }, { status: 404 });
  }

  const r = await copiarArquivoParaDrive(arquivoId);
  if (!r.ok) console.error(`[drive] arquivo ${arquivoId}: ${r.erro}`);
  return NextResponse.json(r);
}
