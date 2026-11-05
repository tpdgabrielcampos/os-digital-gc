import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { numeroOS } from "@/lib/gc";

// Copia um arquivo do Storage (bucket "arquivos-os") para o Google Drive, pelo
// mesmo Apps Script da planilha (GOOGLE_SHEETS_WEBHOOK_URL). O Apps Script
// baixa o arquivo por um link temporário e salva em
//   OS digital GC — Arquivos / <Dentista> / <Paciente – GC-0001> /

export async function copiarArquivoParaDrive(arquivoId: string): Promise<{ ok: boolean; erro?: string; url?: string }> {
  const webhook = process.env.GOOGLE_SHEETS_WEBHOOK_URL;
  if (!webhook) return { ok: false, erro: "GOOGLE_SHEETS_WEBHOOK_URL não configurada" };

  const { data: arq } = await supabaseAdmin
    .from("pedido_arquivos")
    .select("id, nome, caminho, drive_id, drive_url, removido_do_servidor, pedidos(numero, paciente_nome, dentista_nome)")
    .eq("id", arquivoId)
    .single();
  if (!arq) return { ok: false, erro: "arquivo não encontrado" };
  if (arq.drive_id) return { ok: true, url: arq.drive_url ?? undefined };
  if (arq.removido_do_servidor) return { ok: false, erro: "arquivo já saiu do servidor" };

  const pedido = (Array.isArray(arq.pedidos) ? arq.pedidos[0] : arq.pedidos) as
    | { numero: number | null; paciente_nome: string; dentista_nome: string }
    | null;

  const { data: link, error: eLink } = await supabaseAdmin.storage
    .from("arquivos-os")
    .createSignedUrl(arq.caminho, 60 * 30);
  if (eLink || !link) return { ok: false, erro: eLink?.message ?? "não gerou o link" };

  const res = await fetch(webhook, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({
      acao: "arquivo",
      pastas: [pedido?.dentista_nome || "Sem dentista", `${pedido?.paciente_nome || "Paciente"} – ${numeroOS(pedido?.numero)}`],
      nome: arq.nome,
      url: link.signedUrl,
    }),
    redirect: "follow",
  });
  const texto = await res.text();
  let r: { ok?: boolean; id?: string; url?: string; erro?: string } = {};
  try {
    r = JSON.parse(texto);
  } catch {
    return { ok: false, erro: `resposta inesperada do Apps Script: ${texto.slice(0, 120)}` };
  }
  if (!r.ok || !r.id) return { ok: false, erro: r.erro ?? "falhou no Apps Script" };

  await supabaseAdmin.from("pedido_arquivos").update({ drive_id: r.id, drive_url: r.url }).eq("id", arquivoId);
  return { ok: true, url: r.url };
}
