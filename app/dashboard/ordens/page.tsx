import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import AdminShell from "@/components/gc/AdminShell";
import { PageHeader, Panel, Vazio } from "@/components/gc/ui";
import BotaoExcluirPedido from "@/components/BotaoExcluirPedido";
import { STATUS_LABEL, STATUS_ORDER, type StatusPedido } from "@/lib/types";
import { PONTO_STATUS, brl, dataBR, numeroOS } from "@/lib/gc";

export const dynamic = "force-dynamic";

interface P {
  id: string;
  numero: number | null;
  created_at: string;
  paciente_nome: string;
  dentista_nome: string;
  tipo_trabalho: string;
  dentes: string[];
  status: StatusPedido;
  prazo_desejado: string | null;
  instalacao_agendada: string | null;
  valor_estimado: number | null;
  pedido_arquivos: { id: string }[];
}

export default async function Ordens({ searchParams }: { searchParams: { status?: string; q?: string } }) {
  const { data } = await supabaseAdmin
    .from("pedidos")
    .select("id, numero, created_at, paciente_nome, dentista_nome, tipo_trabalho, dentes, status, prazo_desejado, instalacao_agendada, valor_estimado, pedido_arquivos(id)")
    .order("created_at", { ascending: false });
  const todos = (data ?? []) as P[];

  const filtro = searchParams.status as StatusPedido | "abertas" | undefined;
  const q = (searchParams.q ?? "").trim().toLowerCase();
  const abertas = todos.filter((p) => p.status !== "entregue");
  let lista = !filtro ? todos : filtro === "abertas" ? abertas : todos.filter((p) => p.status === filtro);
  if (q) {
    lista = lista.filter((p) =>
      [p.paciente_nome, p.dentista_nome, p.tipo_trabalho, numeroOS(p.numero)].some((t) => t?.toLowerCase().includes(q))
    );
  }

  const opcoes: [string, string, number][] = [
    ["", "Todas", todos.length],
    ["abertas", "Em aberto", abertas.length],
    ...STATUS_ORDER.map((s) => [s, STATUS_LABEL[s], todos.filter((p) => p.status === s).length] as [string, string, number]),
  ];
  const hoje = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });

  return (
    <AdminShell ativo="/dashboard/ordens" contagens={{ "/dashboard/ordens": abertas.length }}>
      <PageHeader
        eyebrow="Produção"
        title="Ordens de serviço"
        subtitle="Todas as OS recebidas. Clique numa OS para ver os detalhes, os arquivos e mudar o status."
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {opcoes.map(([v, r, n]) => {
            const ativo = (filtro ?? "") === v;
            const href = `/dashboard/ordens?${new URLSearchParams({ ...(v ? { status: v } : {}), ...(q ? { q } : {}) })}`;
            return (
              <Link key={v || "todas"} href={href} className={`gc-chip !px-3 !py-1.5 ${ativo ? "gc-tab-ativa !text-white" : "hover:bg-white/10"}`}>
                {r} <span className="opacity-70">({n})</span>
              </Link>
            );
          })}
        </div>
        <form className="w-full max-w-xs">
          {filtro && <input type="hidden" name="status" value={filtro} />}
          <input name="q" defaultValue={q} className="gc-input" placeholder="Buscar paciente, dentista ou OS…" />
        </form>
      </div>

      <Panel>
        {lista.length === 0 ? (
          <Vazio>Nenhuma OS encontrada.</Vazio>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-left text-sm">
              <thead className="text-xs uppercase tracking-wider text-zinc-500">
                <tr>
                  <th className="px-3 py-2">OS / Paciente</th>
                  <th className="px-3 py-2">Dentista</th>
                  <th className="px-3 py-2">Trabalho</th>
                  <th className="px-3 py-2">Entrega</th>
                  <th className="px-3 py-2">Valor</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Recebida</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {lista.map((p) => {
                  const atrasada = p.status !== "entregue" && p.prazo_desejado && p.prazo_desejado.slice(0, 10) < hoje;
                  return (
                    <tr key={p.id} className="hover:bg-white/[0.03]">
                      <td className="px-3 py-3">
                        <Link href={`/pedido/${p.id}`} className="font-semibold text-white hover:underline">
                          {p.paciente_nome}
                        </Link>
                        <span className="block text-xs text-zinc-500">
                          {numeroOS(p.numero)}
                          {p.pedido_arquivos?.length ? ` · ${p.pedido_arquivos.length} arquivo(s)` : ""}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-zinc-300">{p.dentista_nome}</td>
                      <td className="max-w-[280px] px-3 py-3 text-zinc-300">
                        <span className="line-clamp-2">{p.tipo_trabalho}</span>
                      </td>
                      <td className={`px-3 py-3 ${atrasada ? "font-semibold text-rose-300" : "text-zinc-300"}`}>{dataBR(p.prazo_desejado)}</td>
                      <td className="px-3 py-3 text-zinc-300">{p.valor_estimado != null ? brl(p.valor_estimado) : "—"}</td>
                      <td className="px-3 py-3">
                        <span className="inline-flex items-center gap-2 text-zinc-200">
                          <span className={`h-2 w-2 rounded-full ${PONTO_STATUS[p.status]}`} />
                          {STATUS_LABEL[p.status]}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-zinc-400">{dataBR(p.created_at)}</td>
                      <td className="px-3 py-3 text-right">
                        <BotaoExcluirPedido pedidoId={p.id} pacienteNome={p.paciente_nome} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </AdminShell>
  );
}
