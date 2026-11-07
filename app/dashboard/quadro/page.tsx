import { supabaseAdmin } from "@/lib/supabaseAdmin";
import AdminShell from "@/components/gc/AdminShell";
import Quadro, { type CartaoOS } from "@/components/gc/Quadro";

export const dynamic = "force-dynamic";

export default async function QuadroPage() {
  const { data } = await supabaseAdmin
    .from("pedidos")
    .select("*, pedido_arquivos(id)")
    .order("created_at", { ascending: false })
    .limit(1000);

  const cartoes: CartaoOS[] = (data ?? []).map((p) => ({
    id: p.id,
    numero: p.numero,
    paciente_nome: p.paciente_nome,
    dentista_nome: p.dentista_nome,
    tipo_trabalho: p.tipo_trabalho,
    dentes: p.dentes,
    status: p.status,
    status_updated_at: p.status_updated_at,
    created_at: p.created_at,
    prazo_desejado: p.prazo_desejado,
    arquivos: Array.isArray(p.pedido_arquivos) ? p.pedido_arquivos.length : 0,
    urgente: !!p.urgente || /URGENTE/.test(p.observacoes ?? ""),
  }));

  return (
    <AdminShell ativo="/dashboard/quadro" largo>
      <Quadro iniciais={cartoes} />
    </AdminShell>
  );
}
