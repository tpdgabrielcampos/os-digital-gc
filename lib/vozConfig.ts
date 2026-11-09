import { createHash } from "node:crypto";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

// Ajustes do assistente por voz, definidos pelo laboratório em /dashboard/voz.

export interface ConfigAssistente {
  provedor: "navegador" | "elevenlabs";
  voz_id: string | null;
  voz_nome: string | null;
  modelo: string;
  velocidade: number;
  estabilidade: number;
  estilo: number;
  pausa: number;
}

export const CONFIG_ASSISTENTE_PADRAO: ConfigAssistente = {
  provedor: "navegador",
  voz_id: null,
  voz_nome: null,
  modelo: "eleven_v4",
  velocidade: 1,
  estabilidade: 0.5,
  estilo: 0,
  pausa: 1300,
};

// Valores das opções antigas (Rápido/Normal/Calmo) passam para os novos, mais ágeis.
const PAUSA_ANTIGA: Record<number, number> = { 1200: 900, 2000: 1300, 3200: 2200 };

export async function lerConfigAssistente(): Promise<ConfigAssistente> {
  const { data } = await supabaseAdmin.from("config_assistente").select("*").eq("id", 1).maybeSingle();
  if (!data) return CONFIG_ASSISTENTE_PADRAO;
  return {
    provedor: data.provedor === "elevenlabs" ? "elevenlabs" : "navegador",
    voz_id: data.voz_id,
    voz_nome: data.voz_nome,
    modelo: data.modelo || CONFIG_ASSISTENTE_PADRAO.modelo,
    velocidade: Number(data.velocidade) || 1,
    estabilidade: Number(data.estabilidade ?? 0.45),
    estilo: Number(data.estilo ?? 0.3),
    pausa: PAUSA_ANTIGA[Number(data.pausa)] ?? (Number(data.pausa) || 1300),
  };
}

/** A voz premium só vale se tiver a chave no Vercel e uma voz escolhida. */
export function premiumAtivo(c: ConfigAssistente) {
  return c.provedor === "elevenlabs" && !!c.voz_id && !!process.env.ELEVENLABS_API_KEY;
}

const BUCKET = "voz-cache";

const chaveAudio = (texto: string, c: ConfigAssistente) =>
  createHash("sha256").update([c.voz_id, c.modelo, c.velocidade, c.estabilidade, c.estilo, texto].join("|")).digest("hex") + ".mp3";

const corpoEleven = (texto: string, c: ConfigAssistente) =>
  JSON.stringify({
    text: texto,
    model_id: c.modelo,
    voice_settings: {
      stability: c.estabilidade,
      similarity_boost: 0.75,
      style: c.estilo,
      use_speaker_boost: true,
      speed: Math.min(1.2, Math.max(0.7, c.velocidade)),
    },
  });

/**
 * Igual ao gerarAudio, mas já vai mandando o áudio enquanto a ElevenLabs gera
 * (o navegador começa a tocar antes de a frase ficar pronta). Guarda no cache no fim.
 */
export async function audioEmFluxo(texto: string, c: ConfigAssistente): Promise<{ corpo?: ReadableStream<Uint8Array> | ArrayBuffer; erro?: string; status?: number }> {
  const chave = process.env.ELEVENLABS_API_KEY;
  if (!chave || !c.voz_id) return { erro: "voz premium não configurada", status: 409 };
  const caminho = chaveAudio(texto, c);
  const { data: guardado } = await supabaseAdmin.storage.from(BUCKET).download(caminho);
  if (guardado) return { corpo: await guardado.arrayBuffer() };

  const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(c.voz_id)}/stream?output_format=mp3_44100_64`, {
    method: "POST",
    headers: { "xi-api-key": chave, "Content-Type": "application/json", Accept: "audio/mpeg" },
    body: corpoEleven(texto, c),
  });
  if (!r.ok || !r.body) {
    const detalhe = (await r.text().catch(() => "")).slice(0, 300);
    console.error("[voz/falar] elevenlabs stream", r.status, detalhe);
    return { erro: `ElevenLabs respondeu ${r.status}: ${detalhe}`, status: 502 };
  }
  const leitor = r.body.getReader();
  const partes: Uint8Array[] = [];
  const corpo = new ReadableStream<Uint8Array>({
    async pull(ctrl) {
      const { done, value } = await leitor.read();
      if (value) {
        partes.push(value);
        ctrl.enqueue(value);
      }
      if (done) {
        const tudo = new Uint8Array(partes.reduce((n, p) => n + p.length, 0));
        let i = 0;
        for (const p of partes) {
          tudo.set(p, i);
          i += p.length;
        }
        // guarda para a próxima vez (se falhar, tudo bem)
        await supabaseAdmin.storage.from(BUCKET).upload(caminho, tudo, { contentType: "audio/mpeg", upsert: true }).catch(() => null);
        ctrl.close();
      }
    },
    cancel() {
      leitor.cancel().catch(() => {});
    },
  });
  return { corpo };
}

/** Gera (ou busca do cache) o mp3 de uma frase com a voz premium. */
export async function gerarAudio(texto: string, c: ConfigAssistente): Promise<{ audio?: ArrayBuffer; erro?: string; status?: number }> {
  const chave = process.env.ELEVENLABS_API_KEY;
  if (!chave || !c.voz_id) return { erro: "voz premium não configurada", status: 409 };

  const id = createHash("sha256")
    .update([c.voz_id, c.modelo, c.velocidade, c.estabilidade, c.estilo, texto].join("|"))
    .digest("hex");
  const caminho = `${id}.mp3`;

  const { data: guardado } = await supabaseAdmin.storage.from(BUCKET).download(caminho);
  if (guardado) return { audio: await guardado.arrayBuffer() };

  const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(c.voz_id)}?output_format=mp3_44100_64`, {
    method: "POST",
    headers: { "xi-api-key": chave, "Content-Type": "application/json", Accept: "audio/mpeg" },
    body: JSON.stringify({
      text: texto,
      model_id: c.modelo,
      voice_settings: {
        stability: c.estabilidade,
        similarity_boost: 0.75, // igual ao padrão do site da ElevenLabs
        style: c.estilo,
        use_speaker_boost: true,
        speed: Math.min(1.2, Math.max(0.7, c.velocidade)),
      },
    }),
  });
  if (!r.ok) {
    const detalhe = (await r.text()).slice(0, 300);
    console.error("[voz/falar] elevenlabs", r.status, detalhe);
    return { erro: `ElevenLabs respondeu ${r.status}: ${detalhe}`, status: 502 };
  }
  const audio = await r.arrayBuffer();
  // guarda para a próxima vez (se falhar, tudo bem)
  await supabaseAdmin.storage.from(BUCKET).upload(caminho, audio, { contentType: "audio/mpeg", upsert: true }).catch(() => null);
  return { audio };
}

