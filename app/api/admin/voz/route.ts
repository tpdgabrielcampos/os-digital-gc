import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { adminAutorizado } from "@/lib/adminAuth";
import { lerConfigAssistente } from "@/lib/vozConfig";

export const dynamic = "force-dynamic";

const negado = () => NextResponse.json({ ok: false, erro: "Não autorizado" }, { status: 401 });

interface VozEleven {
  id: string;
  nome: string;
  categoria: string;
  descricao: string;
  amostra: string | null;
}

// Ajustes atuais + vozes da sua conta ElevenLabs (as que você criou/clonou e as salvas da biblioteca).
export async function GET(req: NextRequest) {
  if (!adminAutorizado(req)) return negado();
  const config = await lerConfigAssistente();
  const chave = process.env.ELEVENLABS_API_KEY;
  let vozes: VozEleven[] = [];
  let erroVozes: string | null = null;
  if (chave) {
    const r = await fetch("https://api.elevenlabs.io/v1/voices", { headers: { "xi-api-key": chave }, cache: "no-store" });
    if (r.ok) {
      const j = await r.json();
      vozes = (j.voices ?? []).map((v: { voice_id: string; name: string; category?: string; labels?: Record<string, string>; description?: string; preview_url?: string }) => ({
        id: v.voice_id,
        nome: v.name,
        categoria: v.category ?? "",
        descricao: [v.labels?.gender, v.labels?.age, v.labels?.accent, v.labels?.descriptive ?? v.labels?.description].filter(Boolean).join(" · ") || v.description || "",
        amostra: v.preview_url ?? null,
      }));
    } else {
      erroVozes = `A ElevenLabs recusou a chave (${r.status}). Confira a ELEVENLABS_API_KEY no Vercel.`;
    }
  }
  return NextResponse.json({ ok: true, config, temChave: !!chave, vozes, erroVozes });
}

export async function PUT(req: NextRequest) {
  if (!adminAutorizado(req)) return negado();
  const b = await req.json().catch(() => null);
  if (!b) return NextResponse.json({ ok: false, erro: "dados inválidos" }, { status: 400 });
  const num = (v: unknown, min: number, max: number, padrao: number) => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : padrao;
  };
  const dados = {
    id: 1,
    provedor: b.provedor === "elevenlabs" ? "elevenlabs" : "navegador",
    voz_id: b.voz_id ? String(b.voz_id).slice(0, 100) : null,
    voz_nome: b.voz_nome ? String(b.voz_nome).slice(0, 100) : null,
    modelo: String(b.modelo || "eleven_multilingual_v2").slice(0, 60),
    velocidade: num(b.velocidade, 0.7, 1.4, 1),
    estabilidade: num(b.estabilidade, 0, 1, 0.45),
    estilo: num(b.estilo, 0, 1, 0.3),
    pausa: Math.round(num(b.pausa, 800, 5000, 2000)),
    atualizado_em: new Date().toISOString(),
  };
  const { error } = await supabaseAdmin.from("config_assistente").upsert(dados);
  if (error) {
    const falta = /config_assistente/.test(error.message);
    return NextResponse.json(
      { ok: false, erro: falta ? "Falta rodar o SQL supabase/migration_voz.sql no Supabase." : error.message },
      { status: 500 }
    );
  }
  return NextResponse.json({ ok: true });
}
