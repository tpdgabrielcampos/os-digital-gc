import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import AdminShell from "@/components/gc/AdminShell";
import { Botao, I, PageHeader, Panel, StatCard, Vazio } from "@/components/gc/ui";
import { STATUS_LABEL, STATUS_ORDER, type StatusPedido } from "@/lib/types";
import { CARTAO_STATUS, PONTO_STATUS, brl, dataBR, numeroOS } from "@/lib/gc";

export const dynamic = "force-dynamic";

interface P {
  id: string;
  numero: number | null;
  created_at: string;
  status_updated_at: string;
  paciente_nome: string;
  dentista_nome: string;
  tipo_trabalho: string;
  dentes: string[];
  status: StatusPedido;
  prazo_desejado: string | null;
  valor_estimado: number | null;
}

const PERIODOS = { hoje: "Hoje", semana: "Semana", mes: "Mês", ano: "Ano", tudo: "Tudo" } as const;
type Periodo = keyof typeof PERIODOS;

const FUSO = "America/Sao_Paulo";
const hojeISO = () => new Date().toLocaleDateString("en-CA", { timeZone: FUSO });

function inicioDoPeriodo(p: Periodo): Date | null {
  const agora = new Date();
  const [a, m, d] = hojeISO().split("-").map(Number);
  // Meia-noite de Brasília = 03:00 UTC.
  const meiaNoite = (ano: number, mes: number, dia: number) => new Date(Date.UTC(ano, mes - 1, dia, 3));
  if (p === "hoje") return meiaNoite(a, m, d);
  if (p === "semana") return new Date(agora.getTime() - 7 * 864e5);
  if (p === "mes") return meiaNoite(a, m, 1);
  if (p === "ano") return meiaNoite(a, 1, 1);
  return null;
}

function saudacao() {
  const h = Number(new Date().toLocaleString("en-US", { timeZone: FUSO, hour: "numeric", hour12: false }));
  return h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite";
}

export default async function VisaoGeral({ searchParams }: { searchParams: { p?: string } }) {
  const periodo: Periodo = (searchParams.p as Periodo) in PERIODOS ? (searchParams.p as Periodo) : "mes";
  const [{ data }, { count: nDentistas }] = await Promise.all([
    supabaseAdmin
      .from("pedidos")
      .select("id, numero, created_at, status_updated_at, paciente_nome, dentista_nome, tipo_trabalho, dentes, status, prazo_desejado, valor_estimado")
      .order("created_at", { ascending: false }),
    supabaseAdmin.from("dentistas").select("id", { count: "exact", head: true }),
  ]);
  const todos = (data ?? []) as P[];

  const inicio = inicioDoPeriodo(periodo);
  const noPeriodo = (iso: string) => !inicio || new Date(iso) >= inicio;
  const recebidos = todos.filter((p) => noPeriodo(p.created_at));
  const entregues = todos.filter((p) => p.status === "entregue" && noPeriodo(p.status_updated_at));
  const abertos = todos.filter((p) => p.status !== "entregue");
  const hoje = hojeISO();
  const prazoHoje = abertos.filter((p) => p.prazo_desejado?.slice(0, 10) === hoje).length;
  const atrasados = abertos.filter((p) => p.prazo_desejado && p.prazo_desejado.slice(0, 10) < hoje).length;

  const faturamento = recebidos.reduce((s, p) => s + Number(p.valor_estimado ?? 0), 0);
  const entregueValor = entregues.reduce((s, p) => s + Number(p.valor_estimado ?? 0), 0);
  const elementos = entregues.reduce((s, p) => s + (p.dentes?.length ?? 0), 0);

  // Últimas 8 semanas (valor das OS recebidas em cada semana).
  const semanas = Array.from({ length: 8 }, (_, i) => {
    const fim = Date.now() - (7 - i) * 7 * 864e5;
    const ini = fim - 7 * 864e5;
    const lista = todos.filter((p) => {
      const t = new Date(p.created_at).getTime();
      return t > ini && t <= fim;
    });
    return {
      rotulo: new Date(ini + 864e5).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: FUSO }),
      valor: lista.reduce((s, p) => s + Number(p.valor_estimado ?? 0), 0),
      qtd: lista.length,
    };
  });
  const usaValor = semanas.some((s) => s.valor > 0);
  const maxSemana = Math.max(1, ...semanas.map((s) => (usaValor ? s.valor : s.qtd)));

  // Ranking de dentistas no período.
  const porDentista = new Map<string, { valor: number; qtd: number }>();
  for (const p of recebidos) {
    const k = p.dentista_nome || "Sem nome";
    const r = porDentista.get(k) ?? { valor: 0, qtd: 0 };
    r.valor += Number(p.valor_estimado ?? 0);
    r.qtd += 1;
    porDentista.set(k, r);
  }
  const ranking = Array.from(porDentista.entries())
    .sort((a, b) => b[1].valor - a[1].valor || b[1].qtd - a[1].qtd)
    .slice(0, 6);
  const maxRank = Math.max(1, ...ranking.map(([, r]) => (usaValor ? r.valor : r.qtd)));

  const dataExtenso = new Date().toLocaleDateString("pt-BR", { timeZone: FUSO, weekday: "long", day: "numeric", month: "long", year: "numeric" });

  return (
    <AdminShell ativo="/dashboard" contagens={{ "/dashboard/ordens": abertos.length, "/dashboard/dentistas": nDentistas ?? 0 }}>
      <PageHeader
        eyebrow="Painel principal"
        title={`${saudacao()}, Gabriel`}
        subtitle={
          <>
            <p>Resumo da produção — OS recebidas, valores e os dentistas que mais enviam.</p>
            <p className="mt-1 text-sm text-zinc-400">{dataExtenso.charAt(0).toUpperCase() + dataExtenso.slice(1)}</p>
          </>
        }
        actions={
          <>
            <Botao variante="secundario" href="/dashboard/ordens">{I.pasta} Ordens</Botao>
            <Botao href="/dashboard/precos">{I.etiqueta} Preços</Botao>
          </>
        }
      />

      <div className="gc-tabs self-start">
        {(Object.keys(PERIODOS) as Periodo[]).map((k) => (
          <Link key={k} href={`/dashboard?p=${k}`} className={`gc-tab ${k === periodo ? "gc-tab-ativa" : ""}`}>
            {PERIODOS[k]}
          </Link>
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard tom="ouro" icone={I.sobe} rotulo="Valor das OS recebidas" valor={brl(faturamento, 0)} detalhe={`${recebidos.length} OS no período`} />
        <StatCard tom="verde" icone={I.cartao} rotulo="Valor entregue" valor={brl(entregueValor, 0)} detalhe={`${entregues.length} OS entregues`} />
        <StatCard tom="violeta" icone={I.caixa} rotulo="Elementos produzidos" valor={elementos} detalhe="dentes das OS entregues" />
        <StatCard
          tom="ambar"
          icone={I.relogio}
          rotulo="Em produção"
          valor={abertos.length}
          detalhe={atrasados ? `${atrasados} atrasada${atrasados > 1 ? "s" : ""} · ${prazoHoje} para hoje` : `${prazoHoje} com prazo hoje`}
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {STATUS_ORDER.filter((s) => s !== "entregue").map((s) => (
          <Link key={s} href={`/dashboard/ordens?status=${s}`} className={`gc-card flex items-center justify-between border px-4 py-3 hover:bg-white/5 ${CARTAO_STATUS[s]}`}>
            <span className="text-sm font-semibold">● {STATUS_LABEL[s]}</span>
            <span className="text-lg font-bold">{abertos.filter((p) => p.status === s).length}</span>
          </Link>
        ))}
      </div>

      <Panel eyebrow="Análise temporal" title={usaValor ? "Valor recebido por semana" : "OS recebidas por semana"} badge="últimas 8 semanas">
        <div className="flex h-44 items-end gap-2 border-b border-white/5 pb-2 sm:gap-3">
          {semanas.map((s, i) => {
            const v = usaValor ? s.valor : s.qtd;
            return (
              <div key={i} className="flex h-full flex-1 flex-col justify-end" title={usaValor ? brl(s.valor) : `${s.qtd} OS`}>
                <div
                  className="w-full rounded-t-lg bg-gradient-to-t from-[#8f5bd9]/60 via-[#e0649c]/80 to-[#f2a43a]"
                  style={{ height: `${Math.max(v ? 6 : 1, (v / maxSemana) * 100)}%`, opacity: v ? 1 : 0.25 }}
                />
              </div>
            );
          })}
        </div>
        <div className="mt-2 flex justify-between gap-2 text-[11px] text-zinc-500">
          {semanas.map((s, i) => <span key={i} className="flex-1 text-center">{s.rotulo}</span>)}
        </div>
      </Panel>

      <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        <Panel eyebrow="Produção" title="Últimas OS recebidas" badge={`${abertos.length} abertas`}>
          {todos.length === 0 ? (
            <Vazio>Nenhuma OS ainda.</Vazio>
          ) : (
            <div className="divide-y divide-white/5">
              {todos.slice(0, 6).map((o) => (
                <Link key={o.id} href={`/pedido/${o.id}`} className="flex items-center gap-4 py-3 hover:opacity-90">
                  <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${PONTO_STATUS[o.status]}`} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-white">
                      {o.paciente_nome} <span className="font-normal text-zinc-500">· {numeroOS(o.numero)}</span>
                    </p>
                    <p className="truncate text-sm text-zinc-400">{o.dentista_nome} — {o.tipo_trabalho}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="font-semibold text-white">{o.valor_estimado != null ? brl(o.valor_estimado, 0) : "—"}</p>
                    <p className="text-xs text-zinc-400">{STATUS_LABEL[o.status]} · prazo {dataBR(o.prazo_desejado)}</p>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </Panel>

        <Panel eyebrow="Desempenho" title="Ranking de dentistas">
          {ranking.length === 0 ? (
            <Vazio>Sem OS neste período.</Vazio>
          ) : (
            <div className="flex flex-col gap-4">
              {ranking.map(([nome, r], i) => (
                <div key={nome}>
                  <div className="flex justify-between gap-3 text-sm">
                    <span className="truncate font-semibold text-white">{i + 1}. {nome}</span>
                    <span className="shrink-0 text-zinc-300">{usaValor ? brl(r.valor, 0) : `${r.qtd} OS`}</span>
                  </div>
                  <div className="mt-1.5 h-2 rounded-full bg-white/5">
                    <div className="gc-barra h-2 rounded-full" style={{ width: `${((usaValor ? r.valor : r.qtd) / maxRank) * 100}%` }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>
    </AdminShell>
  );
}
