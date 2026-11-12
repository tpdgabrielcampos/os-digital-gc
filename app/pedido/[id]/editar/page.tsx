import { notFound } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import AdminShell from "@/components/gc/AdminShell";
import FormularioOS from "@/components/gc/FormularioOS";
import { marcacoesDaOS } from "@/lib/editarOS";
import type { Dentista } from "@/lib/gc";

export const dynamic = "force-dynamic";

// Painel do laboratório: editar uma OS já enviada (mesmo formulário da Nova OS, já preenchido).
export default async function EditarOSPage({ params }: { params: { id: string } }) {
  const { data: p } = await supabaseAdmin.from("pedidos").select("*").eq("id", params.id).maybeSingle();
  if (!p) notFound();

  const { data: d } = p.dentista_id ? await supabaseAdmin.from("dentistas").select("*").eq("id", p.dentista_id).maybeSingle() : { data: null };
  // OS antigas (sem conta do dentista): monta um "dentista" com o que está na OS.
  const dentista = (d ?? { id: p.dentista_id ?? "", nome: p.dentista_nome, clinica: p.clinica, whatsapp: p.contato, tabela_id: null }) as Dentista;

  let precos: Record<string, number> = {};
  let nomeTabela: string | null = null;
  if (dentista.tabela_id) {
    const [{ data: ps }, { data: t }] = await Promise.all([
      supabaseAdmin.from("precos").select("servico, valor").eq("tabela_id", dentista.tabela_id),
      supabaseAdmin.from("tabelas_preco").select("nome").eq("id", dentista.tabela_id).maybeSingle(),
    ]);
    precos = Object.fromEntries((ps ?? []).map((x) => [x.servico, Number(x.valor)]));
    nomeTabela = t?.nome ?? null;
  }

  const { marcacoes, retrabalho } = marcacoesDaOS(p.tipo_trabalho, p.dentes);

  return (
    <AdminShell ativo="/dashboard/ordens">
      <FormularioOS
        modo="laboratorio"
        dentista={dentista}
        nomeTabela={nomeTabela}
        precosIniciais={precos}
        edicao={{
          pedidoId: p.id,
          numero: p.numero ?? null,
          paciente: p.paciente_nome ?? "",
          prazo: p.prazo_desejado ?? "",
          urgente: !!p.urgente,
          aguardando: !!p.aguardando_arquivos,
          cor: p.cor_restauracao ?? "",
          observacoes: p.observacoes ?? "",
          marcacoes,
          retrabalho,
        }}
      />
    </AdminShell>
  );
}
