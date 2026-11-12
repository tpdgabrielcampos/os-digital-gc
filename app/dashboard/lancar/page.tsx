import { supabaseAdmin } from "@/lib/supabaseAdmin";
import AdminShell from "@/components/gc/AdminShell";
import LancarOS from "@/components/gc/LancarOS";
import type { Dentista, TabelaPreco } from "@/lib/gc";

export const dynamic = "force-dynamic";

// Lançar uma OS no nome de um dentista (para quem está na correria).
export default async function LancarPage() {
  const [{ data: dentistas }, { data: tabelas }, { data: precos }] = await Promise.all([
    supabaseAdmin.from("dentistas").select("*").order("nome"),
    supabaseAdmin.from("tabelas_preco").select("*"),
    supabaseAdmin.from("precos").select("tabela_id, servico, valor"),
  ]);

  const precosPorTabela: Record<string, Record<string, number>> = {};
  for (const p of precos ?? []) {
    (precosPorTabela[p.tabela_id] ??= {})[p.servico] = Number(p.valor);
  }
  const nomes: Record<string, string> = {};
  for (const t of (tabelas ?? []) as TabelaPreco[]) nomes[t.id] = t.nome;

  return (
    <AdminShell ativo="/dashboard/lancar">
      <LancarOS dentistas={((dentistas ?? []) as Dentista[]).filter((d) => d.ativo !== false)} precosPorTabela={precosPorTabela} nomesTabelas={nomes} />
    </AdminShell>
  );
}
