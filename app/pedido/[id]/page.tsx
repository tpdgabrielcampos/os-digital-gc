import Link from "next/link";
import { notFound } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { Pedido, STATUS_LABEL } from "@/lib/types";
import AdminShell from "@/components/gc/AdminShell";
import { PageHeader, Panel } from "@/components/gc/ui";
import PainelControle from "@/components/PainelControle";
import { PONTO_STATUS, brl, dataBR, dataHoraBR, numeroOS, tamanhoLegivel, type PedidoArquivo } from "@/lib/gc";

export const dynamic = "force-dynamic";

type PedidoGC = Pedido & {
  numero: number | null;
  valor_estimado: number | null;
  pedido_arquivos: PedidoArquivo[];
};

export default async function PedidoDetalhePage({ params }: { params: { id: string } }) {
  const { data } = await supabaseAdmin
    .from("pedidos")
    .select("*, pedido_fotos(*), pedido_arquivos(*)")
    .eq("id", params.id)
    .single();
  if (!data) notFound();
  const pedido = data as PedidoGC;

  // Links temporários (1 h) para baixar os arquivos que ainda estão no servidor.
  const arquivos = await Promise.all(
    (pedido.pedido_arquivos ?? []).map(async (a) => {
      let link: string | null = null;
      if (!a.removido_do_servidor) {
        const { data: s } = await supabaseAdmin.storage
          .from("arquivos-os")
          .createSignedUrl(a.caminho, 3600, { download: a.nome });
        link = s?.signedUrl ?? null;
      }
      return { ...a, link };
    })
  );

  const trabalhos = pedido.tipo_trabalho.split(" + ");

  return (
    <AdminShell ativo="/dashboard/ordens">
      <Link href="/dashboard/ordens" className="text-sm text-zinc-400 hover:text-white">← Voltar às ordens de serviço</Link>

      <PageHeader
        eyebrow={numeroOS(pedido.numero)}
        title={pedido.paciente_nome}
        subtitle={
          <span className="inline-flex flex-wrap items-center gap-3">
            <span className="inline-flex items-center gap-2">
              <span className={`h-2.5 w-2.5 rounded-full ${PONTO_STATUS[pedido.status]}`} />
              {STATUS_LABEL[pedido.status]}
            </span>
            <span className="text-zinc-500">·</span>
            <span>{pedido.dentista_nome}{pedido.clinica ? ` — ${pedido.clinica}` : ""}</span>
            <span className="text-zinc-500">·</span>
            <span className="text-zinc-400">recebida {dataHoraBR(pedido.created_at)}</span>
          </span>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        <div className="flex min-w-0 flex-col gap-6">
          <Panel eyebrow="Trabalho" title={trabalhos.length > 1 ? `${trabalhos.length} trabalhos` : "Trabalho"}>
            <ul className="flex flex-col gap-2">
              {trabalhos.map((t) => (
                <li key={t} className="rounded-xl bg-white/[0.03] px-3 py-2.5 text-white">{t}</li>
              ))}
            </ul>
            <dl className="mt-5 grid gap-4 text-sm sm:grid-cols-3">
              <Item rotulo="Dentes" valor={pedido.dentes?.join(", ") || "—"} />
              <Item rotulo="Material" valor={pedido.material ?? "—"} />
              <Item rotulo="Cor final" valor={pedido.cor_restauracao ?? "—"} />
              <Item rotulo="Prazo desejado" valor={dataBR(pedido.prazo_desejado)} />
              <Item rotulo="Instalação agendada" valor={dataBR(pedido.instalacao_agendada)} />
              <Item rotulo="Valor estimado" valor={pedido.valor_estimado != null ? brl(pedido.valor_estimado) : "—"} />
            </dl>
            {pedido.observacoes && (
              <div className="mt-5 rounded-xl bg-white/[0.03] p-4 text-sm">
                <p className="text-xs text-zinc-500">Observações do dentista</p>
                <p className="mt-1 whitespace-pre-wrap text-zinc-200">{pedido.observacoes}</p>
              </div>
            )}
          </Panel>

          <Panel eyebrow="Arquivos" title="Escaneamentos e fotos" badge={`${arquivos.length} arquivo(s)`}>
            {arquivos.length === 0 && !(pedido.pedido_fotos?.length) ? (
              <p className="text-sm text-zinc-400">
                Nenhum arquivo enviado pelo portal{pedido.plataforma_envio ? ` — plataforma de envio: ${pedido.plataforma_envio}` : ""}.
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                {arquivos.map((a) => (
                  <div key={a.id} className="flex flex-wrap items-center gap-3 rounded-xl bg-white/[0.03] px-3 py-2.5">
                    <span className="min-w-0 flex-1 truncate text-sm text-white">{a.nome}</span>
                    <span className="text-xs text-zinc-400">{tamanhoLegivel(a.tamanho)}</span>
                    {a.link && (
                      <a href={a.link} className="text-xs font-semibold text-pink-300 hover:underline">Baixar</a>
                    )}
                    {a.drive_url ? (
                      <a href={a.drive_url} target="_blank" rel="noreferrer" className="text-xs font-semibold text-emerald-300 hover:underline">
                        Ver no Drive
                      </a>
                    ) : (
                      <span className="text-xs text-amber-300">copiando para o Drive…</span>
                    )}
                  </div>
                ))}
                {(pedido.pedido_fotos ?? []).map((f) => (
                  <a key={f.id} href={f.url} target="_blank" rel="noreferrer" className="rounded-xl bg-white/[0.03] px-3 py-2.5 text-sm text-pink-300 hover:underline">
                    Foto enviada
                  </a>
                ))}
              </div>
            )}
          </Panel>
        </div>

        <div className="flex flex-col gap-6">
          <PainelControle pedidoId={pedido.id} statusAtual={pedido.status} notasIniciais={pedido.notas_internas} prazoInicial={pedido.prazo_desejado} urgente={!!(pedido as { urgente?: boolean }).urgente || /URGENTE/.test(pedido.observacoes ?? "")} />
          <Panel eyebrow="Contato" title="Dentista">
            <dl className="flex flex-col gap-3 text-sm">
              <Item rotulo="Nome" valor={pedido.dentista_nome} />
              <Item rotulo="Clínica" valor={pedido.clinica ?? "—"} />
              <Item rotulo="WhatsApp" valor={pedido.contato ?? "—"} />
              <Item rotulo="Preenchido por" valor={pedido.quem_preencheu ?? "—"} />
            </dl>
          </Panel>
        </div>
      </div>
    </AdminShell>
  );
}

function Item({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div>
      <dt className="text-xs text-zinc-500">{rotulo}</dt>
      <dd className="mt-0.5 text-zinc-100">{valor}</dd>
    </div>
  );
}
