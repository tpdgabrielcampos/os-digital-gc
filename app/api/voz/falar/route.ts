import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { adminAutorizado } from "@/lib/adminAuth";
import { gerarAudio, lerConfigAssistente, premiumAtivo } from "@/lib/vozConfig";

// Gera a fala do assistente com a voz premium (ElevenLabs). Frases repetidas
// (as perguntas fixas) ficam guardadas no Storage e não gastam crédito de novo.

export const maxDuration = 30;

async function autorizado(req: NextRequest) {
  if (adminAutorizado(req)) return true; // botão "Testar" do painel
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return false;
  const { data } = await supabaseAdmin.auth.getUser(token);
  return !!data?.user;
}

export async function POST(req: NextRequest) {
  if (!(await autorizado(req))) return NextResponse.json({ ok: false, erro: "não autenticado" }, { status: 401 });
  const body = await req.json().catch(() => null);
  const texto = typeof body?.texto === "string" ? body.texto.trim().slice(0, 1200) : "";
  if (!texto) return NextResponse.json({ ok: false, erro: "texto vazio" }, { status: 400 });

  const c = await lerConfigAssistente();
  // No painel dá para testar uma voz antes de salvar.
  if (adminAutorizado(req) && body?.teste && typeof body.teste === "object") {
    Object.assign(c, {
      provedor: "elevenlabs",
      voz_id: String(body.teste.voz_id || c.voz_id || ""),
      modelo: String(body.teste.modelo || c.modelo),
      velocidade: Number(body.teste.velocidade ?? c.velocidade),
      estabilidade: Number(body.teste.estabilidade ?? c.estabilidade),
      estilo: Number(body.teste.estilo ?? c.estilo),
    });
  } else if (!premiumAtivo(c)) {
    return NextResponse.json({ ok: false, erro: "voz premium desligada" }, { status: 409 });
  }

  const g = await gerarAudio(texto, c);
  if (!g.audio) return NextResponse.json({ ok: false, erro: g.erro }, { status: g.status ?? 500 });
  return new NextResponse(g.audio, { headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-store" } });
}
