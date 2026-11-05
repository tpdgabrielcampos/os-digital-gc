import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { copiarArquivoParaDrive } from "@/lib/drive";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

// Rotina diária (vercel.json → crons):
//  1. Copia para o Drive os arquivos que ainda não foram copiados.
//  2. Apaga do servidor (Supabase) os arquivos com mais de 60 dias que já
//     estão no Drive — assim o espaço grátis de 1 GB não enche.
const DIAS_NO_SERVIDOR = 60;

export async function GET(req: NextRequest) {
  const segredo = process.env.CRON_SECRET;
  if (segredo && req.headers.get("authorization") !== `Bearer ${segredo}`) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const inicio = Date.now();
  const copiados: string[] = [];
  const falhas: string[] = [];

  const { data: pendentes } = await supabaseAdmin
    .from("pedido_arquivos")
    .select("id")
    .is("drive_id", null)
    .eq("removido_do_servidor", false)
    .order("criado_em")
    .limit(20);
  for (const p of pendentes ?? []) {
    if (Date.now() - inicio > 40_000) break; // deixa folga antes do limite de 60 s
    const r = await copiarArquivoParaDrive(p.id);
    (r.ok ? copiados : falhas).push(p.id);
  }

  const limite = new Date(Date.now() - DIAS_NO_SERVIDOR * 24 * 3600 * 1000).toISOString();
  const { data: velhos } = await supabaseAdmin
    .from("pedido_arquivos")
    .select("id, caminho")
    .not("drive_id", "is", null)
    .eq("removido_do_servidor", false)
    .lt("criado_em", limite)
    .limit(200);
  let removidos = 0;
  if (velhos?.length) {
    const { error } = await supabaseAdmin.storage.from("arquivos-os").remove(velhos.map((v) => v.caminho));
    if (!error) {
      await supabaseAdmin
        .from("pedido_arquivos")
        .update({ removido_do_servidor: true })
        .in("id", velhos.map((v) => v.id));
      removidos = velhos.length;
    }
  }

  return NextResponse.json({ ok: true, copiados: copiados.length, falhas: falhas.length, removidos });
}
