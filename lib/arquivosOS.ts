import { supabaseBrowser } from "@/lib/supabaseClient";

// Envio de um arquivo do caso (STL, foto, PDF…) pelo portal do dentista:
// sobe para o Storage, registra na OS e pede a cópia para o Google Drive.
// Usado na Nova OS e na tela da OS (quando o dentista manda os arquivos depois).

export const ACEITOS = ".stl,.ply,.obj,.dcm,.zip,.jpg,.jpeg,.png,.heic,.pdf";

export function nomeSeguro(nome: string) {
  return nome
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .slice(-120);
}

export function mensagemDeErro(err: unknown) {
  if (err instanceof Error) return err.message;
  if (err && typeof err === "object" && "message" in err) return String((err as { message: unknown }).message);
  return String(err);
}

export async function enviarArquivoOS(opts: {
  file: File;
  dentistaId: string;
  pedidoId: string;
  token: string;
}): Promise<{ ok: true } | { ok: false; erro: string }> {
  const { file, dentistaId, pedidoId, token } = opts;
  const caminho = `${dentistaId}/${pedidoId}/${Date.now()}-${nomeSeguro(file.name)}`;
  const { error: eUp } = await supabaseBrowser.storage.from("arquivos-os").upload(caminho, file, {
    contentType: file.type || "application/octet-stream",
  });
  if (eUp) return { ok: false, erro: mensagemDeErro(eUp) };

  const { data: reg, error: eReg } = await supabaseBrowser
    .from("pedido_arquivos")
    .insert({ pedido_id: pedidoId, dentista_id: dentistaId, nome: file.name, caminho, tamanho: file.size })
    .select("id")
    .single();
  if (eReg || !reg) return { ok: false, erro: eReg ? mensagemDeErro(eReg) : "não consegui registrar o arquivo" };

  // Cópia para o Google Drive (pasta Dentista / Paciente – OS). Roda no servidor.
  fetch("/api/drive/copiar", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ arquivoId: reg.id }),
    keepalive: true,
  }).catch(() => {});
  return { ok: true };
}

/** Ações do dentista numa OS já enviada (complemento, concluir, avisar arquivos novos). */
export async function acaoOS(pedidoId: string, token: string, corpo: Record<string, unknown>) {
  const r = await fetch(`/api/portal/os/${pedidoId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(corpo),
  });
  const j = await r.json().catch(() => null);
  if (!r.ok || !j?.ok) throw new Error(j?.erro || "Não consegui salvar. Tente de novo.");
  return j;
}
