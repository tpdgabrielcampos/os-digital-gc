import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

// Ações do dentista numa OS que ainda está incompleta ("envio os arquivos depois").
// Ele só consegue mexer enquanto a OS está aguardando arquivos e o caso ainda
// não entrou em produção (Recebido ou Standby). Depois de "Concluir", trava.

const EDITAVEIS = ["recebido", "standby"];

function quando() {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date());
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return NextResponse.json({ ok: false, erro: "não autenticado" }, { status: 401 });
  const { data: usuario } = await supabaseAdmin.auth.getUser(token);
  if (!usuario?.user) return NextResponse.json({ ok: false, erro: "não autenticado" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const acao = body?.acao as string | undefined;

  const { data: p } = await supabaseAdmin
    .from("pedidos")
    .select("id, dentista_id, status, observacoes, aguardando_arquivos, created_at")
    .eq("id", params.id)
    .maybeSingle();
  if (!p || p.dentista_id !== usuario.user.id) {
    return NextResponse.json({ ok: false, erro: "OS não encontrada" }, { status: 404 });
  }

  const agora = new Date().toISOString();
  const editavel = !!p.aguardando_arquivos && EDITAVEIS.includes(p.status);
  let atualizacao: Record<string, unknown> | null = null;

  if (acao === "pendente") {
    // Logo depois de criar a OS (ex.: algum arquivo não subiu): reabre para completar.
    const recente = Date.now() - new Date(p.created_at).getTime() < 6 * 3600 * 1000;
    if (!recente || !EDITAVEIS.includes(p.status)) {
      return NextResponse.json({ ok: false, erro: "Essa OS não pode mais ser reaberta." }, { status: 409 });
    }
    atualizacao = { aguardando_arquivos: true };
  } else {
    if (!editavel) {
      return NextResponse.json(
        { ok: false, erro: "Esta OS já está completa. Para mudar algo, fale com o laboratório." },
        { status: 409 }
      );
    }
    if (acao === "complemento") {
      const texto = typeof body?.texto === "string" ? body.texto.trim().slice(0, 2000) : "";
      if (!texto) return NextResponse.json({ ok: false, erro: "Escreva o complemento." }, { status: 400 });
      const anterior = (p.observacoes ?? "").trim();
      atualizacao = {
        observacoes: `${anterior ? anterior + "\n\n" : ""}[${quando()}] Complemento: ${texto}`,
        atualizado_pelo_dentista_em: agora,
      };
    } else if (acao === "arquivos") {
      atualizacao = { atualizado_pelo_dentista_em: agora };
    } else if (acao === "concluir") {
      atualizacao = { aguardando_arquivos: false, atualizado_pelo_dentista_em: agora };
    }
  }

  if (!atualizacao) return NextResponse.json({ ok: false, erro: "ação inválida" }, { status: 400 });

  const { error } = await supabaseAdmin.from("pedidos").update(atualizacao).eq("id", p.id);
  if (error) return NextResponse.json({ ok: false, erro: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
