import { supabaseAdmin } from "@/lib/supabaseAdmin";
import AdminShell from "@/components/gc/AdminShell";
import { I, PageHeader, Panel, StatCard, Vazio } from "@/components/gc/ui";
import EscolhaTabela from "@/components/gc/EscolhaTabela";
import { brl, dataBR, type Dentista, type TabelaPreco } from "@/lib/gc";

export const dynamic = "force-dynamic";

export default async function DentistasPage() {
  const [{ data: dentistas }, { data: tabelas }, { data: pedidos }] = await Promise.all([
    supabaseAdmin.from("dentistas").select("*").order("criado_em", { ascending: false }),
    supabaseAdmin.from("tabelas_preco").select("*").order("nome"),
    supabaseAdmin.from("pedidos").select("dentista_id, valor_estimado").not("dentista_id", "is", null),
  ]);
  const lista = (dentistas ?? []) as Dentista[];
  const tabs = (tabelas ?? []) as TabelaPreco[];

  const resumo = new Map<string, { qtd: number; valor: number }>();
  for (const p of pedidos ?? []) {
    const r = resumo.get(p.dentista_id) ?? { qtd: 0, valor: 0 };
    r.qtd += 1;
    r.valor += Number(p.valor_estimado ?? 0);
    resumo.set(p.dentista_id, r);
  }
  const semTabela = lista.filter((d) => !d.tabela_id).length;

  return (
    <AdminShell ativo="/dashboard/dentistas" contagens={{ "/dashboard/dentistas": lista.length }}>
      <PageHeader
        eyebrow="Relacionamento"
        title="Dentistas"
        subtitle="Quem criou conta no portal aparece aqui sozinho. Escolha a tabela de preço de cada um — é ela que calcula o valor estimado das OS dele."
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard tom="violeta" icone={I.pessoas} rotulo="Dentistas cadastrados" valor={lista.length} />
        <StatCard tom="ambar" icone={I.etiqueta} rotulo="Sem tabela de preço" valor={semTabela} detalhe={semTabela ? "escolha uma tabela abaixo" : "todos com tabela"} />
        <StatCard tom="verde" icone={I.pasta} rotulo="OS pelo portal" valor={pedidos?.length ?? 0} />
      </div>

      <Panel eyebrow="Cadastro" title="Dentistas do portal" badge={`${lista.length} dentista(s)`}>
        {lista.length === 0 ? (
          <Vazio>Ninguém criou conta ainda. Mande o link do portal para os dentistas: os-digital-gc.vercel.app</Vazio>
        ) : (
          <div className="divide-y divide-white/5">
            {lista.map((d) => {
              const r = resumo.get(d.id);
              return (
                <div key={d.id} className="flex flex-wrap items-center gap-4 py-4">
                  <span className="gc-barra flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-sm font-bold text-white">
                    {(d.nome || d.email || "?").slice(0, 1).toUpperCase()}
                  </span>
                  <div className="min-w-[200px] flex-1">
                    <p className="font-semibold text-white">{d.nome || "(sem nome)"}</p>
                    <p className="text-sm text-zinc-400">
                      {[d.clinica, d.email, d.whatsapp].filter(Boolean).join(" · ")}
                    </p>
                    <p className="text-xs text-zinc-500">
                      conta criada {dataBR(d.criado_em)} · {r ? `${r.qtd} OS · ${brl(r.valor, 0)}` : "nenhuma OS ainda"}
                    </p>
                  </div>
                  <EscolhaTabela dentistaId={d.id} tabelaAtual={d.tabela_id} tabelas={tabs.map((t) => ({ id: t.id, nome: t.nome }))} />
                </div>
              );
            })}
          </div>
        )}
      </Panel>
    </AdminShell>
  );
}
