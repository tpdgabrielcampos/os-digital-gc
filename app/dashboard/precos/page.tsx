import { supabaseAdmin } from "@/lib/supabaseAdmin";
import AdminShell from "@/components/gc/AdminShell";
import EditorPrecos from "@/components/gc/EditorPrecos";
import type { Preco, TabelaPreco } from "@/lib/gc";

export const dynamic = "force-dynamic";

export default async function PrecosPage({ searchParams }: { searchParams: { t?: string } }) {
  const [{ data: tabelas }, { data: precos }, { data: dentistas }] = await Promise.all([
    supabaseAdmin.from("tabelas_preco").select("*").order("criada_em"),
    supabaseAdmin.from("precos").select("*"),
    supabaseAdmin.from("dentistas").select("tabela_id"),
  ]);
  const tabs = (tabelas ?? []) as TabelaPreco[];
  const uso: Record<string, number> = {};
  for (const d of dentistas ?? []) if (d.tabela_id) uso[d.tabela_id] = (uso[d.tabela_id] ?? 0) + 1;
  const selecionada = tabs.find((t) => t.id === searchParams.t)?.id ?? tabs[0]?.id ?? null;

  return (
    <AdminShell ativo="/dashboard/precos">
      <EditorPrecos
        key={selecionada ?? "nenhuma"}
        tabelas={tabs.map((t) => ({ id: t.id, nome: t.nome, dentistas: uso[t.id] ?? 0 }))}
        selecionada={selecionada}
        precos={((precos ?? []) as Preco[]).filter((p) => p.tabela_id === selecionada)}
      />
    </AdminShell>
  );
}
