"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { I, PageHeader, Panel, StatCard } from "@/components/gc/ui";
import { brl, numeroOS } from "@/lib/gc";
import {
  CATEGORIAS_ENTRADA,
  CATEGORIAS_SAIDA,
  FORMAS_PAGAMENTO,
  SUBLIMITE,
  TABELAS_SIMPLES,
  TETO_SIMPLES,
  calcSimples,
  dataCurta,
  diaNoMes,
  hoje,
  mesDe,
  nomeMes,
  situacao,
  somaMeses,
  valorOS,
  type ConfigFiscal,
  type DentistaFin,
  type Historico,
  type Lancamento,
  type OSFin,
  type Situacao,
  type TipoLanc,
} from "@/lib/financeiro";

type Aba = "resumo" | "lancamentos" | "clientes" | "fiscal";

interface Props {
  faltaBanco: boolean;
  lancamentos: Lancamento[];
  dentistas: DentistaFin[];
  os: OSFin[];
  config: ConfigFiscal;
  historico: Historico[];
}

async function api(corpo: Record<string, unknown>) {
  const r = await fetch("/api/admin/financeiro", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(corpo),
  });
  const j = await r.json().catch(() => null);
  if (!r.ok || !j?.ok) throw new Error(j?.erro || `erro ${r.status}`);
  return j;
}

const soma = (ls: { valor: number }[]) => ls.reduce((s, l) => s + Number(l.valor || 0), 0);
const pct = (v: number) => `${v.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`;

const COR_SIT: Record<Situacao, string> = {
  pago: "bg-emerald-500/15 text-emerald-300",
  aberto: "bg-white/10 text-zinc-300",
  vencido: "bg-rose-600 text-white",
};

export default function Financeiro(p: Props) {
  const router = useRouter();
  const [aba, setAba] = useState<Aba>("resumo");
  const [mes, setMes] = useState(mesDe(hoje()));
  const [editando, setEditando] = useState<Partial<Lancamento> | null>(null);
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [lendo, setLendo] = useState(false);
  const [repetirInicial, setRepetirInicial] = useState<{ vezes: number; modo: string } | null>(null);
  const [lidoDaNota, setLidoDaNota] = useState<{ confianca: string; observacao: string } | null>(null);

  async function lerNota(arquivo: File | undefined) {
    if (!arquivo) return;
    setLendo(true);
    try {
      const { tipo, dados } = await prepararArquivo(arquivo);
      const r = await fetch("/api/admin/financeiro/nota", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tipo, dados, nome: arquivo.name }),
      });
      const j = await r.json().catch(() => null);
      if (!r.ok || !j?.ok) throw new Error(j?.erro || `erro ${r.status}`);
      const n = j.nota;
      const pagoNaHora = !n.vencimento && ["Pix", "Dinheiro", "Cartão de débito"].includes(n.forma_pagamento);
      const extras = [n.itens, n.numero_documento ? `Doc. ${n.numero_documento}` : "", n.cnpj ? `CNPJ ${n.cnpj}` : ""].filter(Boolean).join(" · ");
      setRepetirInicial(n.parcelas > 1 ? { vezes: n.parcelas, modo: "parcelas" } : null);
      setLidoDaNota({ confianca: n.confianca, observacao: n.observacao });
      setEditando({
        tipo: "saida",
        descricao: n.descricao || n.fornecedor || "Compra",
        categoria: n.categoria,
        valor: n.valor ?? undefined,
        competencia: n.data,
        vencimento: n.vencimento || n.data,
        fornecedor: n.fornecedor || null,
        forma_pagamento: n.forma_pagamento || null,
        pago_em: pagoNaHora ? n.data : null,
        nf_status: "nao_se_aplica",
        observacoes: extras || null,
        anexo: j.anexo ?? null,
      });
    } catch (e) {
      setAviso({ ok: false, texto: `Nota: ${(e as Error).message}` });
    } finally {
      setLendo(false);
    }
  }

  useEffect(() => {
    if (!aviso) return;
    const t = setTimeout(() => setAviso(null), 4000);
    return () => clearTimeout(t);
  }, [aviso]);

  async function executar(corpo: Record<string, unknown>, ok: string) {
    setOcupado(true);
    try {
      const j = await api(corpo);
      setAviso({ ok: true, texto: ok });
      router.refresh();
      return j;
    } catch (e) {
      setAviso({ ok: false, texto: (e as Error).message });
      return null;
    } finally {
      setOcupado(false);
    }
  }

  const nomeDentista = useMemo(() => Object.fromEntries(p.dentistas.map((d) => [d.id, d.nome])), [p.dentistas]);

  if (p.faltaBanco) {
    return (
      <Panel eyebrow="Financeiro" title="Falta preparar o banco">
        <p className="text-sm text-zinc-300">Rode o arquivo <code>supabase/migration_financeiro.sql</code> no SQL Editor do Supabase e recarregue a página.</p>
      </Panel>
    );
  }

  const ctx = { ...p, mes, nomeDentista, executar, ocupado, setEditando };

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <PageHeader
        eyebrow="Financeiro"
        title="Controle financeiro"
        subtitle="Entradas, saídas, cobranças por dentista e controle do Simples Nacional."
        actions={
          <>
            <div className="flex items-center gap-1 rounded-xl border border-white/10 bg-black/30 p-1">
              <button className="rounded-lg px-2.5 py-1.5 text-zinc-300 hover:bg-white/10" onClick={() => setMes(somaMeses(mes, -1))} aria-label="Mês anterior">‹</button>
              <span className="min-w-[150px] text-center text-sm font-semibold text-white">{nomeMes(mes)}</span>
              <button className="rounded-lg px-2.5 py-1.5 text-zinc-300 hover:bg-white/10" onClick={() => setMes(somaMeses(mes, 1))} aria-label="Próximo mês">›</button>
            </div>
            <label className={`gc-btn gc-btn-secundario cursor-pointer ${lendo ? "pointer-events-none opacity-60" : ""}`} title="Tire uma foto ou escolha a nota (foto ou PDF)">
              📷 {lendo ? "Lendo a nota…" : "Ler nota"}
              <input type="file" accept="image/*,application/pdf" className="hidden" onChange={(e) => { lerNota(e.target.files?.[0]); e.target.value = ""; }} />
            </label>
            <button className="gc-btn gc-btn-secundario" onClick={() => { setRepetirInicial(null); setLidoDaNota(null); setEditando(novo("entrada", mes)); }}>{I.mais} Entrada</button>
            <button className="gc-btn gc-btn-principal" onClick={() => { setRepetirInicial(null); setLidoDaNota(null); setEditando(novo("saida", mes)); }}>{I.mais} Saída</button>
          </>
        }
      />

      <div className="gc-tabs self-start">
        {([
          ["resumo", "Resumo"],
          ["lancamentos", "Lançamentos"],
          ["clientes", "Clientes / cobranças"],
          ["fiscal", "Fiscal (Simples)"],
        ] as [Aba, string][]).map(([k, r]) => (
          <button key={k} onClick={() => setAba(k)} className={`gc-tab ${aba === k ? "gc-tab-ativa" : ""}`}>{r}</button>
        ))}
      </div>

      {aba === "resumo" && <Resumo {...ctx} irPara={setAba} />}
      {aba === "lancamentos" && <Lancamentos {...ctx} />}
      {aba === "clientes" && <Clientes {...ctx} />}
      {aba === "fiscal" && <Fiscal {...ctx} />}

      {editando && (
        <EditorLancamento
          inicial={editando}
          repetirInicial={repetirInicial}
          lidoDaNota={lidoDaNota}
          dentistas={p.dentistas}
          os={p.os}
          ocupado={ocupado}
          fechar={() => { setEditando(null); setLidoDaNota(null); setRepetirInicial(null); }}
          salvar={async (lanc, repetir) => {
            const ok = await executar({ acao: "salvar", lanc, repetir }, lanc.id ? "Lançamento atualizado." : "Lançamento criado.");
            if (ok) { setEditando(null); setLidoDaNota(null); setRepetirInicial(null); }
          }}
        />
      )}

      {aviso && (
        <div className={`fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-xl px-4 py-3 text-sm shadow-xl ${aviso.ok ? "bg-emerald-600 text-white" : "bg-rose-600 text-white"}`}>{aviso.texto}</div>
      )}
    </div>
  );
}

/** Foto: reduz para no máx. 1800px (JPEG) para subir rápido. PDF: vai como está (até 4 MB). */
async function prepararArquivo(f: File): Promise<{ tipo: string; dados: string }> {
  const paraBase64 = (blob: Blob) =>
    new Promise<string>((ok, erro) => {
      const r = new FileReader();
      r.onload = () => ok(String(r.result).split(",")[1] ?? "");
      r.onerror = () => erro(new Error("não consegui ler o arquivo"));
      r.readAsDataURL(blob);
    });
  if (f.type === "application/pdf") {
    if (f.size > 4 * 1024 * 1024) throw new Error("PDF muito grande (máx. 4 MB).");
    return { tipo: "application/pdf", dados: await paraBase64(f) };
  }
  if (!f.type.startsWith("image/")) throw new Error("Envie uma foto ou PDF.");
  try {
    const bmp = await createImageBitmap(f);
    const esc = Math.min(1, 1800 / Math.max(bmp.width, bmp.height));
    const c = document.createElement("canvas");
    c.width = Math.round(bmp.width * esc);
    c.height = Math.round(bmp.height * esc);
    c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
    const blob = await new Promise<Blob | null>((ok) => c.toBlob(ok, "image/jpeg", 0.85));
    if (!blob) throw new Error();
    return { tipo: "image/jpeg", dados: await paraBase64(blob) };
  } catch {
    if (f.size > 4 * 1024 * 1024) throw new Error("Foto muito grande. Tente tirar de novo.");
    return { tipo: f.type === "image/heic" ? "image/jpeg" : f.type, dados: await paraBase64(f) };
  }
}

function novo(tipo: TipoLanc, mes: string): Partial<Lancamento> {
  const d = mesDe(hoje()) === mes ? hoje() : `${mes}-01`;
  return { tipo, competencia: d, vencimento: d, categoria: tipo === "entrada" ? "Serviços (OS)" : "Materiais e insumos", nf_status: tipo === "entrada" ? "pendente" : "nao_se_aplica" };
}

interface Ctx extends Props {
  mes: string;
  nomeDentista: Record<string, string>;
  executar: (c: Record<string, unknown>, ok: string) => Promise<unknown>;
  ocupado: boolean;
  setEditando: (l: Partial<Lancamento> | null) => void;
}

// ====================================================================== RESUMO
function Resumo({ lancamentos, os, mes, nomeDentista, irPara, setEditando }: Ctx & { irPara: (a: Aba) => void }) {
  const ref = hoje();
  const doMes = (iso: string | null) => !!iso && iso.slice(0, 7) === mes;

  const recebido = soma(lancamentos.filter((l) => l.tipo === "entrada" && doMes(l.pago_em)));
  const pago = soma(lancamentos.filter((l) => l.tipo === "saida" && doMes(l.pago_em)));
  const faturado = soma(lancamentos.filter((l) => l.tipo === "entrada" && doMes(l.competencia)));
  const despesas = soma(lancamentos.filter((l) => l.tipo === "saida" && doMes(l.competencia)));
  const resultado = faturado - despesas;

  const aReceber = lancamentos.filter((l) => l.tipo === "entrada" && !l.pago_em);
  const aPagar = lancamentos.filter((l) => l.tipo === "saida" && !l.pago_em);
  const recVencido = aReceber.filter((l) => situacao(l, ref) === "vencido");
  const pagVencido = aPagar.filter((l) => situacao(l, ref) === "vencido");
  const semCobranca = os.filter((o) => o.status === "entregue" && !o.cobranca_id);

  const meses = Array.from({ length: 6 }, (_, i) => somaMeses(mes, i - 5));
  const serie = meses.map((m) => ({
    m,
    e: soma(lancamentos.filter((l) => l.tipo === "entrada" && l.competencia.slice(0, 7) === m)),
    s: soma(lancamentos.filter((l) => l.tipo === "saida" && l.competencia.slice(0, 7) === m)),
  }));
  const maxSerie = Math.max(1, ...serie.flatMap((x) => [x.e, x.s]));

  const porCategoria = agrupar(lancamentos.filter((l) => l.tipo === "saida" && doMes(l.competencia)), (l) => l.categoria);
  const porCliente = agrupar(
    lancamentos.filter((l) => l.tipo === "entrada" && doMes(l.competencia)),
    (l) => (l.dentista_id ? nomeDentista[l.dentista_id] ?? "Dentista" : "Sem cliente")
  );

  const limite7 = (() => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    return d.toISOString().slice(0, 10);
  })();
  const proximos = lancamentos
    .filter((l) => !l.pago_em && l.vencimento && l.vencimento <= limite7)
    .sort((a, b) => (a.vencimento ?? "").localeCompare(b.vencimento ?? ""))
    .slice(0, 12);

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard tom="verde" icone={I.sobe} rotulo="Recebido no mês" valor={brl(recebido)} detalhe={`Faturado no mês: ${brl(faturado)}`} />
        <StatCard tom="rosa" icone={I.cartao} rotulo="Pago no mês" valor={brl(pago)} detalhe={`Despesas do mês: ${brl(despesas)}`} />
        <StatCard tom={recebido - pago >= 0 ? "ciano" : "rosa"} icone={I.caixa} rotulo="Saldo do caixa no mês" valor={brl(recebido - pago)} detalhe="o que entrou menos o que saiu" />
        <StatCard
          tom={resultado >= 0 ? "ouro" : "rosa"}
          icone={I.grafico}
          rotulo="Resultado (lucro)"
          valor={brl(resultado)}
          detalhe={faturado > 0 ? `margem de ${pct((resultado / faturado) * 100)}` : "faturado − despesas do mês"}
        />
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Alerta titulo="A receber" valor={brl(soma(aReceber))} detalhe={recVencido.length ? `${recVencido.length} vencido(s): ${brl(soma(recVencido))}` : "nada vencido"} ruim={recVencido.length > 0} onClick={() => irPara("clientes")} />
        <Alerta titulo="A pagar" valor={brl(soma(aPagar))} detalhe={pagVencido.length ? `${pagVencido.length} vencido(s): ${brl(soma(pagVencido))}` : "nada vencido"} ruim={pagVencido.length > 0} onClick={() => irPara("lancamentos")} />
        <Alerta
          titulo="OS entregues sem cobrança"
          valor={`${semCobranca.length} OS`}
          detalhe={semCobranca.length ? `${brl(semCobranca.reduce((s, o) => s + valorOS(o), 0))} para faturar` : "tudo cobrado"}
          ruim={semCobranca.length > 0}
          onClick={() => irPara("clientes")}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <Panel eyebrow="Últimos 6 meses" title="Entradas × saídas (competência)">
          <div className="flex h-56 items-end gap-3">
            {serie.map((x) => (
              <div key={x.m} className="flex flex-1 flex-col items-center gap-2">
                <div className="flex h-44 w-full items-end justify-center gap-1">
                  <div className="w-1/3 rounded-t-md bg-emerald-400/80" style={{ height: `${(x.e / maxSerie) * 100}%` }} title={`Entradas ${brl(x.e)}`} />
                  <div className="w-1/3 rounded-t-md bg-rose-400/80" style={{ height: `${(x.s / maxSerie) * 100}%` }} title={`Saídas ${brl(x.s)}`} />
                </div>
                <span className={`text-[11px] ${x.m === mes ? "font-bold text-white" : "text-zinc-500"}`}>{nomeMes(x.m, true)}</span>
              </div>
            ))}
          </div>
          <p className="mt-3 flex gap-4 text-xs text-zinc-400">
            <span><span className="mr-1 inline-block h-2 w-2 rounded-sm bg-emerald-400" />Entradas</span>
            <span><span className="mr-1 inline-block h-2 w-2 rounded-sm bg-rose-400" />Saídas</span>
          </p>
        </Panel>

        <Panel eyebrow="Próximos 7 dias" title="Vencimentos">
          {proximos.length === 0 ? (
            <p className="text-sm text-zinc-500">Nenhum vencimento em aberto.</p>
          ) : (
            <div className="flex flex-col gap-1.5">
              {proximos.map((l) => (
                <button key={l.id} onClick={() => setEditando(l)} className="flex items-center gap-3 rounded-lg bg-white/[0.03] px-3 py-2 text-left text-sm hover:bg-white/[0.06]">
                  <span className={`rounded-md px-1.5 py-0.5 text-[11px] font-semibold ${COR_SIT[situacao(l, ref)]}`}>{dataCurta(l.vencimento)}</span>
                  <span className="min-w-0 flex-1 truncate text-zinc-200">{l.descricao}</span>
                  <span className={`font-semibold ${l.tipo === "entrada" ? "text-emerald-300" : "text-rose-300"}`}>{l.tipo === "entrada" ? "+" : "−"} {brl(l.valor)}</span>
                </button>
              ))}
            </div>
          )}
        </Panel>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Panel eyebrow={nomeMes(mes)} title="Despesas por categoria">
          <Barras itens={porCategoria} cor="bg-rose-400/70" vazio="Nenhuma despesa no mês." />
        </Panel>
        <Panel eyebrow={nomeMes(mes)} title="Faturamento por cliente">
          <Barras itens={porCliente} cor="bg-emerald-400/70" vazio="Nenhuma entrada no mês." />
        </Panel>
      </div>
    </>
  );
}

function agrupar(ls: Lancamento[], chave: (l: Lancamento) => string) {
  const m = new Map<string, number>();
  for (const l of ls) m.set(chave(l), (m.get(chave(l)) ?? 0) + Number(l.valor));
  return Array.from(m.entries()).sort((a, b) => b[1] - a[1]);
}

function Barras({ itens, cor, vazio }: { itens: [string, number][]; cor: string; vazio: string }) {
  if (!itens.length) return <p className="text-sm text-zinc-500">{vazio}</p>;
  const total = itens.reduce((s, [, v]) => s + v, 0);
  const max = itens[0][1] || 1;
  return (
    <div className="flex flex-col gap-2.5">
      {itens.slice(0, 10).map(([k, v]) => (
        <div key={k}>
          <div className="flex justify-between text-sm">
            <span className="truncate text-zinc-200">{k}</span>
            <span className="shrink-0 text-zinc-400">{brl(v)} · {pct((v / total) * 100)}</span>
          </div>
          <div className="mt-1 h-2 rounded-full bg-white/5"><div className={`h-2 rounded-full ${cor}`} style={{ width: `${(v / max) * 100}%` }} /></div>
        </div>
      ))}
    </div>
  );
}

function Alerta({ titulo, valor, detalhe, ruim, onClick }: { titulo: string; valor: string; detalhe: string; ruim: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} className={`gc-card p-4 text-left transition hover:brightness-110 ${ruim ? "ring-1 ring-rose-500/40" : ""}`}>
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">{titulo}</p>
      <p className="mt-1 text-2xl font-bold text-white">{valor}</p>
      <p className={`mt-1 text-sm ${ruim ? "text-rose-300" : "text-zinc-500"}`}>{detalhe}</p>
    </button>
  );
}

// ====================================================================== LANÇAMENTOS
function Lancamentos({ lancamentos, dentistas, mes, nomeDentista, executar, setEditando }: Ctx) {
  const [periodo, setPeriodo] = useState<"mes" | "todos">("mes");
  const [base, setBase] = useState<"vencimento" | "competencia">("vencimento");
  const [tipo, setTipo] = useState<"" | TipoLanc>("");
  const [sit, setSit] = useState<"" | Situacao>("");
  const [cat, setCat] = useState("");
  const [cliente, setCliente] = useState("");
  const [busca, setBusca] = useState("");
  const ref = hoje();

  const lista = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return lancamentos
      .filter((l) => {
        const d = (base === "vencimento" ? l.vencimento : l.competencia) ?? l.competencia;
        if (periodo === "mes" && d.slice(0, 7) !== mes) return false;
        if (tipo && l.tipo !== tipo) return false;
        if (sit && situacao(l, ref) !== sit) return false;
        if (cat && l.categoria !== cat) return false;
        if (cliente && l.dentista_id !== cliente) return false;
        if (q && !`${l.descricao} ${l.fornecedor ?? ""} ${l.observacoes ?? ""} ${l.dentista_id ? nomeDentista[l.dentista_id] ?? "" : ""}`.toLowerCase().includes(q)) return false;
        return true;
      })
      .sort((a, b) => ((base === "vencimento" ? a.vencimento : a.competencia) ?? "").localeCompare((base === "vencimento" ? b.vencimento : b.competencia) ?? ""));
  }, [lancamentos, periodo, base, tipo, sit, cat, cliente, busca, mes, ref, nomeDentista]);

  const ent = soma(lista.filter((l) => l.tipo === "entrada"));
  const sai = soma(lista.filter((l) => l.tipo === "saida"));

  function exportarCSV() {
    const linhas = [
      ["Tipo", "Descrição", "Categoria", "Cliente/Fornecedor", "Valor", "Competência", "Vencimento", "Pago em", "Forma", "Parcela", "NF", "Nº NF"],
      ...lista.map((l) => [
        l.tipo === "entrada" ? "Entrada" : "Saída",
        l.descricao,
        l.categoria,
        l.dentista_id ? nomeDentista[l.dentista_id] ?? "" : l.fornecedor ?? "",
        l.valor.toFixed(2).replace(".", ","),
        dataCurta(l.competencia),
        dataCurta(l.vencimento),
        l.pago_em ? dataCurta(l.pago_em) : "",
        l.forma_pagamento ?? "",
        l.parcela ?? "",
        l.tipo === "entrada" ? (l.nf_status === "emitida" ? "Emitida" : l.nf_status === "pendente" ? "Pendente" : "Não se aplica") : "",
        l.nf_numero ?? "",
      ]),
    ];
    const csv = "﻿" + linhas.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    a.download = `financeiro-${periodo === "mes" ? mes : "todos"}.csv`;
    a.click();
  }

  return (
    <Panel>
      <div className="flex flex-wrap items-end gap-2">
        <Sel rotulo="Período" valor={periodo} mudar={(v) => setPeriodo(v as "mes" | "todos")} opcoes={[["mes", nomeMes(mes)], ["todos", "Todos"]]} />
        <Sel rotulo="Data" valor={base} mudar={(v) => setBase(v as "vencimento" | "competencia")} opcoes={[["vencimento", "Vencimento"], ["competencia", "Competência"]]} />
        <Sel rotulo="Tipo" valor={tipo} mudar={(v) => setTipo(v as "" | TipoLanc)} opcoes={[["", "Todos"], ["entrada", "Entradas"], ["saida", "Saídas"]]} />
        <Sel rotulo="Situação" valor={sit} mudar={(v) => setSit(v as "" | Situacao)} opcoes={[["", "Todas"], ["aberto", "Em aberto"], ["vencido", "Vencidos"], ["pago", "Pagos"]]} />
        <Sel rotulo="Categoria" valor={cat} mudar={setCat} opcoes={[["", "Todas"], ...[...CATEGORIAS_ENTRADA, ...CATEGORIAS_SAIDA].map((c) => [c, c] as [string, string])]} />
        <Sel rotulo="Cliente" valor={cliente} mudar={setCliente} opcoes={[["", "Todos"], ...dentistas.map((d) => [d.id, d.nome] as [string, string])]} />
        <label className="flex min-w-[180px] flex-1 flex-col gap-1 text-xs text-zinc-400">
          Buscar
          <input className="gc-input !py-2" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="descrição, fornecedor…" />
        </label>
        <button className="gc-btn gc-btn-secundario" onClick={exportarCSV}>Exportar planilha</button>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <Mini rotulo="Entradas" valor={brl(ent)} cor="text-emerald-300" />
        <Mini rotulo="Saídas" valor={brl(sai)} cor="text-rose-300" />
        <Mini rotulo="Saldo" valor={brl(ent - sai)} cor={ent - sai >= 0 ? "text-white" : "text-rose-300"} />
      </div>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[860px] text-sm">
          <thead>
            <tr className="border-b border-white/10 text-left text-xs uppercase tracking-wide text-zinc-500">
              <th className="py-2 pr-3">{base === "vencimento" ? "Venc." : "Comp."}</th>
              <th className="py-2 pr-3">Descrição</th>
              <th className="py-2 pr-3">Categoria</th>
              <th className="py-2 pr-3 text-right">Valor</th>
              <th className="py-2 pr-3">Situação</th>
              <th className="py-2 pr-3">NF</th>
              <th className="py-2" />
            </tr>
          </thead>
          <tbody>
            {lista.length === 0 && (
              <tr><td colSpan={7} className="py-10 text-center text-zinc-500">Nenhum lançamento com esses filtros.</td></tr>
            )}
            {lista.map((l) => {
              const s = situacao(l, ref);
              return (
                <tr key={l.id} className="border-b border-white/5 align-top">
                  <td className="py-2.5 pr-3 text-zinc-300">{dataCurta(base === "vencimento" ? l.vencimento : l.competencia)}</td>
                  <td className="py-2.5 pr-3">
                    <p className="font-medium text-white">
                      {l.descricao}
                      {l.parcela ? <span className="ml-1 text-xs text-zinc-500">({l.parcela})</span> : null}
                      {l.anexo ? <a href={`/api/admin/financeiro/nota?p=${encodeURIComponent(l.anexo)}`} target="_blank" rel="noreferrer" className="ml-2 text-xs text-sky-300 hover:underline" title="Ver comprovante">📎 nota</a> : null}
                    </p>
                    <p className="text-xs text-zinc-500">{l.dentista_id ? nomeDentista[l.dentista_id] : l.fornecedor}{l.forma_pagamento ? ` · ${l.forma_pagamento}` : ""}</p>
                  </td>
                  <td className="py-2.5 pr-3 text-zinc-400">{l.categoria}</td>
                  <td className={`py-2.5 pr-3 text-right font-semibold ${l.tipo === "entrada" ? "text-emerald-300" : "text-rose-300"}`}>{l.tipo === "entrada" ? "+" : "−"} {brl(l.valor)}</td>
                  <td className="py-2.5 pr-3">
                    <button
                      title={l.pago_em ? "Desfazer pagamento" : "Marcar como pago hoje"}
                      onClick={() => executar({ acao: "pagar", id: l.id, pago_em: l.pago_em ? null : hoje() }, l.pago_em ? "Voltou para em aberto." : l.tipo === "entrada" ? "Recebimento registrado." : "Pagamento registrado.")}
                      className={`rounded-md px-2 py-0.5 text-xs font-semibold ${COR_SIT[s]}`}
                    >
                      {s === "pago" ? `${l.tipo === "entrada" ? "Recebido" : "Pago"} ${dataCurta(l.pago_em)}` : s === "vencido" ? "Vencido" : "Em aberto"}
                    </button>
                  </td>
                  <td className="py-2.5 pr-3 text-xs">
                    {l.tipo === "entrada" ? (
                      l.nf_status === "emitida" ? <span className="text-emerald-300">Nº {l.nf_numero || "—"}</span> : l.nf_status === "pendente" ? <span className="text-amber-300">pendente</span> : <span className="text-zinc-600">—</span>
                    ) : (
                      <span className="text-zinc-600">—</span>
                    )}
                  </td>
                  <td className="py-2.5 text-right">
                    <button className="text-xs text-pink-300 hover:underline" onClick={() => setEditando(l)}>editar</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

function Sel({ rotulo, valor, mudar, opcoes }: { rotulo: string; valor: string; mudar: (v: string) => void; opcoes: [string, string][] }) {
  return (
    <label className="flex flex-col gap-1 text-xs text-zinc-400">
      {rotulo}
      <select className="gc-input !py-2 [color-scheme:dark]" value={valor} onChange={(e) => mudar(e.target.value)}>
        {opcoes.map(([v, r]) => <option key={v} value={v}>{r}</option>)}
      </select>
    </label>
  );
}

function Mini({ rotulo, valor, cor }: { rotulo: string; valor: string; cor: string }) {
  return (
    <div className="rounded-xl bg-white/[0.03] px-4 py-3">
      <p className="text-xs text-zinc-500">{rotulo}</p>
      <p className={`text-lg font-bold ${cor}`}>{valor}</p>
    </div>
  );
}

// ====================================================================== CLIENTES
function Clientes({ lancamentos, dentistas, os, mes, executar, ocupado }: Ctx) {
  const [sel, setSel] = useState<string | null>(null);
  const [busca, setBusca] = useState("");
  const ref = hoje();

  const linhas = useMemo(() => {
    return dentistas
      .map((d) => {
        const ls = lancamentos.filter((l) => l.tipo === "entrada" && l.dentista_id === d.id);
        const entreguesMes = os.filter((o) => o.dentista_id === d.id && o.entregue_em?.slice(0, 7) === mes);
        const naoCobradas = os.filter((o) => o.dentista_id === d.id && o.status === "entregue" && !o.cobranca_id);
        const aberto = ls.filter((l) => !l.pago_em);
        return {
          d,
          producaoMes: entreguesMes.reduce((s, o) => s + valorOS(o), 0),
          qtdMes: entreguesMes.length,
          naoCobradas,
          faturadoMes: soma(ls.filter((l) => l.competencia.slice(0, 7) === mes)),
          recebidoMes: soma(ls.filter((l) => l.pago_em?.slice(0, 7) === mes)),
          aberto: soma(aberto),
          vencido: soma(aberto.filter((l) => situacao(l, ref) === "vencido")),
        };
      })
      .filter((x) => !busca.trim() || `${x.d.nome} ${x.d.clinica ?? ""}`.toLowerCase().includes(busca.trim().toLowerCase()))
      .sort((a, b) => b.vencido - a.vencido || b.aberto + b.naoCobradas.length - (a.aberto + a.naoCobradas.length) || a.d.nome.localeCompare(b.d.nome));
  }, [dentistas, lancamentos, os, mes, busca, ref]);

  const escolhido = linhas.find((x) => x.d.id === sel) ?? null;

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <Panel eyebrow={nomeMes(mes)} title="Clientes">
        <input className="gc-input mb-3" placeholder="Buscar dentista ou clínica" value={busca} onChange={(e) => setBusca(e.target.value)} />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b border-white/10 text-left text-xs uppercase tracking-wide text-zinc-500">
                <th className="py-2 pr-2">Dentista</th>
                <th className="py-2 pr-2 text-right">Produção mês</th>
                <th className="py-2 pr-2 text-right">A faturar</th>
                <th className="py-2 pr-2 text-right">Em aberto</th>
                <th className="py-2 text-right">Vencido</th>
              </tr>
            </thead>
            <tbody>
              {linhas.map((x) => (
                <tr key={x.d.id} onClick={() => setSel(x.d.id)} className={`cursor-pointer border-b border-white/5 hover:bg-white/[0.04] ${sel === x.d.id ? "bg-white/[0.06]" : ""}`}>
                  <td className="py-2.5 pr-2">
                    <p className="font-medium text-white">{x.d.nome}</p>
                    <p className="text-xs text-zinc-500">{x.d.forma_cobranca === "mensal" ? `Mensal · vence dia ${x.d.dia_vencimento}` : "Por OS"}</p>
                  </td>
                  <td className="py-2.5 pr-2 text-right text-zinc-300">{brl(x.producaoMes)}<span className="block text-xs text-zinc-500">{x.qtdMes} OS</span></td>
                  <td className={`py-2.5 pr-2 text-right ${x.naoCobradas.length ? "font-semibold text-amber-300" : "text-zinc-600"}`}>
                    {x.naoCobradas.length ? `${x.naoCobradas.length} OS` : "—"}
                  </td>
                  <td className="py-2.5 pr-2 text-right text-zinc-300">{x.aberto ? brl(x.aberto) : "—"}</td>
                  <td className={`py-2.5 text-right ${x.vencido ? "font-semibold text-rose-300" : "text-zinc-600"}`}>{x.vencido ? brl(x.vencido) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-zinc-500">Produção = OS entregues no mês (valor final ou estimado). OS sem dentista cadastrado no portal não aparecem aqui.</p>
      </Panel>

      {escolhido ? (
        <DetalheCliente key={escolhido.d.id} x={escolhido} lancamentos={lancamentos} mes={mes} executar={executar} ocupado={ocupado} />
      ) : (
        <Panel eyebrow="Cobrança" title="Escolha um dentista">
          <p className="text-sm text-zinc-400">Clique num dentista para ver as OS a faturar, gerar o fechamento do mês, acompanhar o que está em aberto e mandar o extrato pelo WhatsApp.</p>
        </Panel>
      )}
    </div>
  );
}

function DetalheCliente({
  x,
  lancamentos,
  mes,
  executar,
  ocupado,
}: {
  x: { d: DentistaFin; naoCobradas: OSFin[]; aberto: number; vencido: number };
  lancamentos: Lancamento[];
  mes: string;
  executar: Ctx["executar"];
  ocupado: boolean;
}) {
  const { d } = x;
  const ref = hoje();
  // Fechamento mensal: por padrão, as OS entregues até o fim do mês escolhido.
  const fimMes = diaNoMes(mes, 31);
  const [marcadas, setMarcadas] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(x.naoCobradas.map((o) => [o.id, d.forma_cobranca === "mensal" ? (o.entregue_em ?? "").slice(0, 10) <= fimMes : true]))
  );
  const [valores, setValores] = useState<Record<string, string>>(() => Object.fromEntries(x.naoCobradas.map((o) => [o.id, valorOS(o).toFixed(2).replace(".", ",")])));
  const [forma, setForma] = useState(d.forma_cobranca);
  const [dia, setDia] = useState(String(d.dia_vencimento));
  const [vencimento, setVencimento] = useState(d.forma_cobranca === "mensal" ? diaNoMes(somaMeses(mes, 1), d.dia_vencimento) : hoje());

  const escolhidas = x.naoCobradas.filter((o) => marcadas[o.id]);
  const num = (s: string) => Number(String(s).replace(/\./g, "").replace(",", ".")) || 0;
  const total = escolhidas.reduce((s, o) => s + num(valores[o.id] ?? "0"), 0);
  const cobrancas = lancamentos.filter((l) => l.tipo === "entrada" && l.dentista_id === d.id).sort((a, b) => (b.vencimento ?? "").localeCompare(a.vencimento ?? ""));
  const abertas = cobrancas.filter((l) => !l.pago_em);

  function extratoWhats() {
    const fone = (d.whatsapp ?? "").replace(/\D/g, "");
    const linhas = abertas.map((l) => `• ${l.descricao}: ${brl(l.valor)} — vence ${dataCurta(l.vencimento)}${situacao(l, ref) === "vencido" ? " (vencido)" : ""}`);
    const texto = `Olá, ${d.nome.split(" ")[0]}! Segue o extrato do laboratório GC:\n\n${linhas.join("\n")}\n\nTotal em aberto: ${brl(soma(abertas))}\n\nQualquer dúvida, estou à disposição.`;
    window.open(`https://wa.me/${fone.length >= 10 ? (fone.startsWith("55") ? fone : "55" + fone) : ""}?text=${encodeURIComponent(texto)}`, "_blank");
  }

  return (
    <div className="flex flex-col gap-6">
      <Panel eyebrow="Cliente" title={d.nome} badge={d.clinica ?? undefined}>
        <div className="flex flex-wrap items-end gap-3">
          <Sel rotulo="Forma de cobrança" valor={forma} mudar={(v) => setForma(v as DentistaFin["forma_cobranca"])} opcoes={[["mensal", "Fechamento mensal"], ["por_os", "Por OS"]]} />
          <label className="flex flex-col gap-1 text-xs text-zinc-400">
            Dia de vencimento
            <input className="gc-input !w-24 !py-2" type="number" min={1} max={31} value={dia} onChange={(e) => setDia(e.target.value)} />
          </label>
          <button
            className="gc-btn gc-btn-secundario"
            disabled={ocupado || (forma === d.forma_cobranca && Number(dia) === d.dia_vencimento)}
            onClick={() => executar({ acao: "dentista", id: d.id, forma_cobranca: forma, dia_vencimento: Number(dia) }, "Cadastro de cobrança salvo.")}
          >
            Salvar
          </button>
        </div>
      </Panel>

      <Panel eyebrow="A faturar" title={`OS entregues sem cobrança (${x.naoCobradas.length})`}>
        {x.naoCobradas.length === 0 ? (
          <p className="text-sm text-zinc-500">Nenhuma OS pendente de cobrança.</p>
        ) : (
          <>
            <div className="flex flex-col gap-1.5">
              {x.naoCobradas.map((o) => (
                <label key={o.id} className="flex min-w-0 items-center gap-3 rounded-lg bg-white/[0.03] px-3 py-2 text-sm">
                  <input type="checkbox" checked={!!marcadas[o.id]} onChange={(e) => setMarcadas((m) => ({ ...m, [o.id]: e.target.checked }))} />
                  <span className="min-w-0 flex-1">
                    <span className="font-medium text-white">{numeroOS(o.numero)} · {o.paciente_nome}</span>
                    <span className="block truncate text-xs text-zinc-500">entregue {dataCurta(o.entregue_em)} · {o.tipo_trabalho}</span>
                  </span>
                  <span className="text-xs text-zinc-500">R$</span>
                  <input className="gc-input !w-28 !py-1.5 text-right" value={valores[o.id] ?? ""} onChange={(e) => setValores((v) => ({ ...v, [o.id]: e.target.value }))} />
                </label>
              ))}
            </div>
            <div className="mt-4 flex flex-wrap items-end gap-3">
              <label className="flex flex-col gap-1 text-xs text-zinc-400">
                Vencimento
                <input type="date" className="gc-input !py-2 [color-scheme:dark]" value={vencimento} onChange={(e) => setVencimento(e.target.value)} />
              </label>
              <div className="flex-1 text-right">
                <p className="text-xs text-zinc-500">{escolhidas.length} OS selecionada(s)</p>
                <p className="text-xl font-bold text-white">{brl(total)}</p>
              </div>
              <button
                className="gc-btn gc-btn-principal"
                disabled={ocupado || !escolhidas.length || !vencimento}
                onClick={() =>
                  executar(
                    {
                      acao: "cobrar",
                      modo: forma,
                      dentista_id: d.id,
                      competencia: forma === "mensal" ? fimMes : hoje(),
                      vencimento,
                      os: escolhidas.map((o) => ({ id: o.id, valor: num(valores[o.id] ?? "0") })),
                    },
                    forma === "mensal" ? `Fechamento de ${nomeMes(mes)} gerado.` : "Cobrança gerada."
                  )
                }
              >
                {forma === "mensal" ? `Gerar fechamento de ${nomeMes(mes, true)}` : "Gerar cobrança"}
              </button>
            </div>
          </>
        )}
      </Panel>

      <Panel eyebrow="Cobranças" title="Em aberto e histórico" badge={x.vencido ? `vencido ${brl(x.vencido)}` : undefined}>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-zinc-400">Em aberto: <strong className="text-white">{brl(soma(abertas))}</strong></p>
          <button className="gc-btn gc-btn-secundario" disabled={!abertas.length} onClick={extratoWhats}>Enviar extrato no WhatsApp</button>
        </div>
        {cobrancas.length === 0 ? (
          <p className="text-sm text-zinc-500">Nenhuma cobrança ainda.</p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {cobrancas.slice(0, 30).map((l) => {
              const s = situacao(l, ref);
              return (
                <div key={l.id} className="flex flex-wrap items-center gap-3 rounded-lg bg-white/[0.03] px-3 py-2 text-sm">
                  <span className="min-w-0 flex-1">
                    <span className="font-medium text-white">{l.descricao}</span>
                    <span className="block text-xs text-zinc-500">vence {dataCurta(l.vencimento)}{l.observacoes ? ` · ${l.observacoes}` : ""}</span>
                  </span>
                  <span className="font-semibold text-emerald-300">{brl(l.valor)}</span>
                  <button
                    className={`rounded-md px-2 py-0.5 text-xs font-semibold ${COR_SIT[s]}`}
                    onClick={() => executar({ acao: "pagar", id: l.id, pago_em: l.pago_em ? null : hoje() }, l.pago_em ? "Voltou para em aberto." : "Recebimento registrado.")}
                    title={l.pago_em ? "Desfazer" : "Marcar recebido hoje"}
                  >
                    {s === "pago" ? `Recebido ${dataCurta(l.pago_em)}` : s === "vencido" ? "Vencido · receber" : "Receber"}
                  </button>
                  {!l.pago_em && (
                    <button
                      className="text-xs text-zinc-500 hover:text-rose-300"
                      title="Cancelar a cobrança (as OS voltam para 'a faturar')"
                      onClick={() => confirm("Cancelar esta cobrança? As OS voltam para a lista a faturar.") && executar({ acao: "excluir", id: l.id }, "Cobrança cancelada.")}
                    >
                      cancelar
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Panel>
    </div>
  );
}

// ====================================================================== FISCAL
function Fiscal({ lancamentos, config, historico, mes, executar, ocupado }: Ctx) {
  const [anexo, setAnexo] = useState(config.anexo);
  const [manual, setManual] = useState(config.aliquota_manual != null ? String(config.aliquota_manual).replace(".", ",") : "");
  const [histMes, setHistMes] = useState(somaMeses(mes, -1));
  const [histValor, setHistValor] = useState("");

  const receitaMes = (m: string) =>
    soma(lancamentos.filter((l) => l.tipo === "entrada" && l.competencia.slice(0, 7) === m)) + (historico.find((h) => h.mes.slice(0, 7) === m)?.receita ?? 0);

  const receita = receitaMes(mes);
  const ult12 = Array.from({ length: 12 }, (_, i) => somaMeses(mes, i - 12));
  const rbt12 = ult12.reduce((s, m) => s + receitaMes(m), 0);
  const mesesComDados = ult12.filter((m) => receitaMes(m) > 0).length;
  // Empresa com menos de 12 meses: a lei manda usar a média dos meses de atividade × 12.
  const rbt12Usado = mesesComDados > 0 && mesesComDados < 12 ? (rbt12 / mesesComDados) * 12 : rbt12;
  const calc = calcSimples(config.anexo, rbt12Usado);
  const aliquota = config.aliquota_manual ?? calc.efetiva;
  const das = (receita * aliquota) / 100;
  const vencDas = diaNoMes(somaMeses(mes, 1), 20);
  const dasLancado = lancamentos.some((l) => l.tipo === "saida" && l.categoria === "Impostos (DAS)" && l.competencia.slice(0, 7) === mes);

  const ano = mes.slice(0, 4);
  const noAno = Array.from({ length: 12 }, (_, i) => `${ano}-${String(i + 1).padStart(2, "0")}`).reduce((s, m) => s + receitaMes(m), 0);
  const nfPend = lancamentos.filter((l) => l.tipo === "entrada" && l.nf_status === "pendente" && l.competencia.slice(0, 7) <= mes);

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard tom="verde" icone={I.sobe} rotulo={`Receita bruta · ${nomeMes(mes, true)}`} valor={brl(receita)} detalhe="entradas por competência" />
        <StatCard tom="violeta" icone={I.grafico} rotulo="RBT12 (últimos 12 meses)" valor={brl(rbt12)} detalhe={mesesComDados < 12 ? `só ${mesesComDados} mês(es) lançados — estimado pela média; informe o histórico abaixo` : `faixa ${calc.faixa} do Anexo ${config.anexo}`} />
        <StatCard tom="ouro" icone={I.etiqueta} rotulo="Alíquota efetiva" valor={pct(aliquota)} detalhe={config.aliquota_manual != null ? "informada pelo contador" : `nominal ${pct(calc.nominal)} − ${brl(calc.deduzir)}`} />
        <StatCard tom="rosa" icone={I.cartao} rotulo="DAS estimado" valor={brl(das)} detalhe={`vence ${dataCurta(vencDas)}`} />
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Panel eyebrow="Simples Nacional" title="Imposto do mês">
          <dl className="grid gap-2 text-sm">
            <Linha r="Receita do mês" v={brl(receita)} />
            <Linha r="RBT12 usado no cálculo" v={brl(rbt12Usado)} />
            <Linha r="Faixa" v={`${calc.faixa}ª — ${TABELAS_SIMPLES[config.anexo].nome}`} />
            <Linha r="Alíquota efetiva" v={pct(aliquota)} />
            <Linha r="DAS estimado" v={brl(das)} forte />
            <Linha r="Vencimento" v={dataCurta(vencDas)} />
          </dl>
          <button
            className="gc-btn gc-btn-principal mt-4"
            disabled={ocupado || das <= 0 || dasLancado}
            onClick={() =>
              executar(
                {
                  acao: "salvar",
                  lanc: { tipo: "saida", descricao: `DAS Simples Nacional — ${nomeMes(mes)}`, categoria: "Impostos (DAS)", valor: Math.round(das * 100) / 100, competencia: diaNoMes(mes, 31), vencimento: vencDas, fornecedor: "Receita Federal", nf_status: "nao_se_aplica" },
                },
                "DAS lançado nas saídas."
              )
            }
          >
            {dasLancado ? "DAS deste mês já lançado" : "Lançar DAS nas saídas"}
          </button>
          <p className="mt-3 text-xs leading-relaxed text-zinc-500">
            Estimativa pelas tabelas da LC 123/2006 (alterada pela LC 155/2016). O valor oficial é o do PGDAS-D. Confirme o anexo com o seu contador: nos Anexos III/V conta o Fator R (folha ÷ receita).
          </p>
        </Panel>

        <Panel eyebrow="Limites" title={`Faturamento ${ano}`}>
          <Limite rotulo="Sublimite (ICMS/ISS no Simples)" valor={noAno} limite={SUBLIMITE} />
          <div className="h-4" />
          <Limite rotulo="Teto do Simples Nacional" valor={noAno} limite={TETO_SIMPLES} />
          <p className="mt-4 text-sm text-zinc-400">Acumulado no ano: <strong className="text-white">{brl(noAno)}</strong> · RBT12: <strong className="text-white">{brl(rbt12)}</strong></p>
        </Panel>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Panel eyebrow="Notas fiscais" title={`Entradas sem NF (${nfPend.length})`} badge={nfPend.length ? brl(soma(nfPend)) : undefined}>
          {nfPend.length === 0 ? (
            <p className="text-sm text-zinc-500">Todas as entradas até este mês estão com NF emitida ou marcadas como “não se aplica”.</p>
          ) : (
            <div className="flex flex-col gap-1.5">
              {nfPend.slice(0, 40).map((l) => (
                <NfLinha key={l.id} l={l} executar={executar} />
              ))}
            </div>
          )}
        </Panel>

        <Panel eyebrow="Configuração" title="Regime e histórico">
          <div className="flex flex-wrap items-end gap-3">
            <Sel rotulo="Anexo do Simples" valor={anexo} mudar={(v) => setAnexo(v as ConfigFiscal["anexo"])} opcoes={(["I", "II", "III", "V"] as const).map((a) => [a, TABELAS_SIMPLES[a].nome] as [string, string])} />
            <label className="flex flex-col gap-1 text-xs text-zinc-400">
              Alíquota do contador (%) — opcional
              <input className="gc-input !w-40 !py-2" placeholder="ex.: 6,54" value={manual} onChange={(e) => setManual(e.target.value)} />
            </label>
            <button className="gc-btn gc-btn-secundario" disabled={ocupado} onClick={() => executar({ acao: "config", anexo, aliquota_manual: manual.trim() === "" ? null : manual }, "Configuração fiscal salva.")}>Salvar</button>
          </div>
          <div className="mt-6 border-t border-white/10 pt-4">
            <p className="text-sm text-zinc-300">Faturamento de meses anteriores ao sistema</p>
            <p className="mt-1 text-xs text-zinc-500">Informe a receita bruta dos 12 meses antes de começar a lançar aqui, para o RBT12 e a alíquota ficarem certos.</p>
            <div className="mt-3 flex flex-wrap items-end gap-2">
              <label className="flex flex-col gap-1 text-xs text-zinc-400">
                Mês
                <input type="month" className="gc-input !py-2 [color-scheme:dark]" value={histMes} onChange={(e) => setHistMes(e.target.value)} />
              </label>
              <label className="flex flex-col gap-1 text-xs text-zinc-400">
                Receita (R$)
                <input className="gc-input !w-36 !py-2" value={histValor} onChange={(e) => setHistValor(e.target.value)} placeholder="0,00" />
              </label>
              <button className="gc-btn gc-btn-secundario" disabled={ocupado || !histMes || !histValor} onClick={() => executar({ acao: "historico", mes: `${histMes}-01`, receita: histValor }, "Histórico salvo.").then(() => setHistValor(""))}>Salvar mês</button>
            </div>
            {historico.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {historico.map((h) => (
                  <span key={h.mes} className="rounded-md bg-white/5 px-2 py-1 text-xs text-zinc-300">{nomeMes(h.mes.slice(0, 7), true)}: {brl(h.receita)}</span>
                ))}
              </div>
            )}
          </div>
        </Panel>
      </div>
    </div>
  );
}

function NfLinha({ l, executar }: { l: Lancamento; executar: Ctx["executar"] }) {
  const [numero, setNumero] = useState("");
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg bg-white/[0.03] px-3 py-2 text-sm">
      <span className="min-w-0 flex-1">
        <span className="text-white">{l.descricao}</span>
        <span className="block text-xs text-zinc-500">{dataCurta(l.competencia)} · {brl(l.valor)}</span>
      </span>
      <input className="gc-input !w-28 !py-1.5" placeholder="nº da NF" value={numero} onChange={(e) => setNumero(e.target.value)} />
      <button className="text-xs font-semibold text-emerald-300 hover:underline" onClick={() => executar({ acao: "nf", id: l.id, nf_status: "emitida", nf_numero: numero }, "NF registrada.")}>emitida</button>
      <button className="text-xs text-zinc-500 hover:underline" onClick={() => executar({ acao: "nf", id: l.id, nf_status: "nao_se_aplica" }, "Marcado como sem NF.")}>sem NF</button>
    </div>
  );
}

function Linha({ r, v, forte }: { r: string; v: string; forte?: boolean }) {
  return (
    <div className="flex justify-between gap-3 border-b border-white/5 pb-1.5">
      <dt className="text-zinc-400">{r}</dt>
      <dd className={forte ? "font-bold text-white" : "text-zinc-200"}>{v}</dd>
    </div>
  );
}

function Limite({ rotulo, valor, limite }: { rotulo: string; valor: number; limite: number }) {
  const p = Math.min(100, (valor / limite) * 100);
  return (
    <div>
      <div className="flex justify-between text-sm">
        <span className="text-zinc-300">{rotulo}</span>
        <span className="text-zinc-400">{brl(valor)} de {brl(limite, 0)}</span>
      </div>
      <div className="mt-1.5 h-2.5 rounded-full bg-white/5">
        <div className={`h-2.5 rounded-full ${p >= 80 ? "bg-rose-500" : p >= 60 ? "bg-amber-400" : "bg-emerald-400"}`} style={{ width: `${p}%` }} />
      </div>
      <p className="mt-1 text-xs text-zinc-500">{pct(p)} usado no ano</p>
    </div>
  );
}

// ====================================================================== EDITOR
function EditorLancamento({
  inicial,
  repetirInicial,
  lidoDaNota,
  dentistas,
  os,
  ocupado,
  fechar,
  salvar,
}: {
  inicial: Partial<Lancamento>;
  repetirInicial?: { vezes: number; modo: string } | null;
  lidoDaNota?: { confianca: string; observacao: string } | null;
  dentistas: DentistaFin[];
  os: OSFin[];
  ocupado: boolean;
  fechar: () => void;
  salvar: (l: Partial<Lancamento>, repetir: { vezes: number; modo: string } | null) => void;
}) {
  const [l, setL] = useState<Partial<Lancamento> & { valorTxt?: string }>({
    ...inicial,
    valorTxt: inicial.valor != null ? Number(inicial.valor).toFixed(2).replace(".", ",") : "",
  });
  const [vezes, setVezes] = useState(String(repetirInicial?.vezes ?? 1));
  const [modo, setModo] = useState(repetirInicial?.modo ?? "recorrente");
  const [pago, setPago] = useState(!!inicial.pago_em);
  const novo = !inicial.id;
  const entrada = l.tipo === "entrada";
  const up = (d: Partial<Lancamento>) => setL((x) => ({ ...x, ...d }));
  const cats = entrada ? CATEGORIAS_ENTRADA : CATEGORIAS_SAIDA;
  const [mostrar, setMostrar] = useState(false);
  useEffect(() => setMostrar(true), []);

  function enviar() {
    const valor = Number(String(l.valorTxt ?? "").replace(/\./g, "").replace(",", "."));
    salvar(
      {
        id: l.id,
        tipo: l.tipo,
        descricao: l.descricao,
        categoria: l.categoria,
        valor,
        competencia: l.competencia,
        vencimento: l.vencimento,
        pago_em: pago ? l.pago_em || hoje() : null,
        forma_pagamento: l.forma_pagamento,
        dentista_id: l.dentista_id || null,
        pedido_id: l.pedido_id || null,
        fornecedor: l.fornecedor,
        nf_status: l.nf_status,
        nf_numero: l.nf_numero,
        observacoes: l.observacoes,
        anexo: l.anexo,
      },
      novo && Number(vezes) > 1 ? { vezes: Number(vezes), modo } : null
    );
  }

  const conteudo: ReactNode = (
    <div className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-black/70 p-4 sm:items-center" style={{ fontFamily: "Sora, system-ui, sans-serif" }} onClick={fechar}>
      <div className="w-full max-w-2xl rounded-2xl border border-white/10 bg-[#121214] p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-bold text-white">{novo ? (entrada ? "Nova entrada" : "Nova saída") : "Editar lançamento"}</h2>
          <button onClick={fechar} className="text-2xl leading-none text-zinc-500 hover:text-white">×</button>
        </div>

        {lidoDaNota && (
          <div className={`mb-4 rounded-xl px-4 py-3 text-sm ${lidoDaNota.confianca === "baixa" ? "bg-rose-500/10 text-rose-200" : "bg-emerald-500/10 text-emerald-200"}`}>
            <strong>Preenchido a partir da nota.</strong> Confira valor, data e categoria antes de salvar.
            {lidoDaNota.confianca === "baixa" && <span className="block text-xs">Leitura com pouca confiança{lidoDaNota.observacao ? `: ${lidoDaNota.observacao}` : ""}.</span>}
          </div>
        )}
        {l.anexo && (
          <a href={`/api/admin/financeiro/nota?p=${encodeURIComponent(l.anexo)}`} target="_blank" rel="noreferrer" className="mb-3 inline-block text-xs text-sky-300 hover:underline">📎 Ver comprovante</a>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          {novo && (
            <div className="gc-tabs sm:col-span-2">
              <button className={`gc-tab ${entrada ? "gc-tab-ativa" : ""}`} onClick={() => up({ tipo: "entrada", categoria: CATEGORIAS_ENTRADA[1], nf_status: "pendente" })}>Entrada</button>
              <button className={`gc-tab ${!entrada ? "gc-tab-ativa" : ""}`} onClick={() => up({ tipo: "saida", categoria: CATEGORIAS_SAIDA[1], nf_status: "nao_se_aplica" })}>Saída</button>
            </div>
          )}
          <Campo rotulo="Descrição *" largo>
            <input className="gc-input" value={l.descricao ?? ""} onChange={(e) => up({ descricao: e.target.value })} placeholder={entrada ? "ex.: Coroa 21 — Dra. Ana" : "ex.: Blocos de zircônia"} />
          </Campo>
          <Campo rotulo="Categoria *">
            <select className="gc-input [color-scheme:dark]" value={l.categoria ?? ""} onChange={(e) => up({ categoria: e.target.value })}>
              {cats.map((c) => <option key={c}>{c}</option>)}
            </select>
          </Campo>
          <Campo rotulo={novo && Number(vezes) > 1 && modo === "parcelas" ? "Valor total (R$) *" : "Valor (R$) *"}>
            <input className="gc-input" inputMode="decimal" value={l.valorTxt ?? ""} onChange={(e) => setL((x) => ({ ...x, valorTxt: e.target.value }))} placeholder="0,00" />
          </Campo>
          <Campo rotulo="Competência (mês de referência)">
            <input type="date" className="gc-input [color-scheme:dark]" value={l.competencia ?? ""} onChange={(e) => up({ competencia: e.target.value })} />
          </Campo>
          <Campo rotulo="Vencimento">
            <input type="date" className="gc-input [color-scheme:dark]" value={l.vencimento ?? ""} onChange={(e) => up({ vencimento: e.target.value })} />
          </Campo>
          {entrada ? (
            <Campo rotulo="Cliente (dentista)">
              <select className="gc-input [color-scheme:dark]" value={l.dentista_id ?? ""} onChange={(e) => up({ dentista_id: e.target.value || null })}>
                <option value="">—</option>
                {dentistas.map((d) => <option key={d.id} value={d.id}>{d.nome}</option>)}
              </select>
            </Campo>
          ) : (
            <Campo rotulo="Fornecedor">
              <input className="gc-input" value={l.fornecedor ?? ""} onChange={(e) => up({ fornecedor: e.target.value })} placeholder="ex.: fresadora parceira" />
            </Campo>
          )}
          <Campo rotulo={entrada ? "OS relacionada" : "OS relacionada (custo do caso)"}>
            <select className="gc-input [color-scheme:dark]" value={l.pedido_id ?? ""} onChange={(e) => up({ pedido_id: e.target.value || null })}>
              <option value="">—</option>
              {os.slice(0, 400).map((o) => <option key={o.id} value={o.id}>{numeroOS(o.numero)} · {o.paciente_nome}</option>)}
            </select>
          </Campo>

          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-white/10 px-3 py-2.5 sm:col-span-2">
            <label className="flex items-center gap-2 text-sm text-zinc-200">
              <input type="checkbox" checked={pago} onChange={(e) => setPago(e.target.checked)} />
              {entrada ? "Já recebido" : "Já pago"}
            </label>
            {pago && (
              <>
                <input type="date" className="gc-input !w-auto !py-1.5 [color-scheme:dark]" value={l.pago_em ?? hoje()} onChange={(e) => up({ pago_em: e.target.value })} />
                <select className="gc-input !w-auto !py-1.5 [color-scheme:dark]" value={l.forma_pagamento ?? ""} onChange={(e) => up({ forma_pagamento: e.target.value || null })}>
                  <option value="">forma…</option>
                  {FORMAS_PAGAMENTO.map((f) => <option key={f}>{f}</option>)}
                </select>
              </>
            )}
          </div>

          {entrada && (
            <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
              <span className="text-xs text-zinc-400">Nota fiscal:</span>
              <select className="gc-input !w-auto !py-1.5 [color-scheme:dark]" value={l.nf_status ?? "pendente"} onChange={(e) => up({ nf_status: e.target.value as Lancamento["nf_status"] })}>
                <option value="pendente">Pendente</option>
                <option value="emitida">Emitida</option>
                <option value="nao_se_aplica">Não se aplica</option>
              </select>
              {l.nf_status === "emitida" && <input className="gc-input !w-36 !py-1.5" placeholder="nº da NF" value={l.nf_numero ?? ""} onChange={(e) => up({ nf_numero: e.target.value })} />}
            </div>
          )}

          {novo && (
            <div className="flex flex-wrap items-center gap-3 rounded-xl bg-white/[0.03] px-3 py-2.5 sm:col-span-2">
              <span className="text-xs text-zinc-400">Repetir:</span>
              <select className="gc-input !w-auto !py-1.5 [color-scheme:dark]" value={modo} onChange={(e) => setModo(e.target.value)}>
                <option value="recorrente">todo mês (mesmo valor)</option>
                <option value="parcelas">parcelado (divide o valor)</option>
              </select>
              <input type="number" min={1} max={60} className="gc-input !w-20 !py-1.5" value={vezes} onChange={(e) => setVezes(e.target.value)} />
              <span className="text-xs text-zinc-500">{modo === "parcelas" ? "parcelas" : "meses"} (1 = só uma vez)</span>
            </div>
          )}

          <Campo rotulo="Observações" largo>
            <textarea className="gc-input min-h-[70px]" value={l.observacoes ?? ""} onChange={(e) => up({ observacoes: e.target.value })} />
          </Campo>
        </div>

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
          {!novo ? (
            <ExcluirBotao l={inicial as Lancamento} fechar={fechar} />
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <button className="gc-btn gc-btn-secundario" onClick={fechar}>Cancelar</button>
            <button className="gc-btn gc-btn-principal" disabled={ocupado || !l.descricao?.trim() || !l.valorTxt || !l.competencia} onClick={enviar}>{ocupado ? "Salvando…" : "Salvar"}</button>
          </div>
        </div>
      </div>
    </div>
  );
  return mostrar ? createPortal(conteudo, document.body) : null;
}

function ExcluirBotao({ l, fechar }: { l: Lancamento; fechar: () => void }) {
  const router = useRouter();
  async function excluir(grupo: boolean) {
    if (!confirm(grupo ? "Excluir este e os próximos lançamentos em aberto desta série?" : "Excluir este lançamento?")) return;
    try {
      await api({ acao: "excluir", id: l.id, grupo });
      fechar();
      router.refresh();
    } catch (e) {
      alert((e as Error).message);
    }
  }
  return (
    <div className="flex gap-3 text-xs">
      <button className="text-rose-300 hover:underline" onClick={() => excluir(false)}>Excluir</button>
      {l.grupo && <button className="text-rose-300 hover:underline" onClick={() => excluir(true)}>Excluir este e os próximos</button>}
    </div>
  );
}

function Campo({ rotulo, largo, children }: { rotulo: string; largo?: boolean; children: ReactNode }) {
  return (
    <label className={`flex flex-col gap-1 text-xs text-zinc-400 ${largo ? "sm:col-span-2" : ""}`}>
      {rotulo}
      {children}
    </label>
  );
}
