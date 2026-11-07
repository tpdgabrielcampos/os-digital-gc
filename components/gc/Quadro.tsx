"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { STATUS_LABEL, STATUS_ORDER, type StatusPedido } from "@/lib/types";
import { numeroOS } from "@/lib/gc";

// Quadro estilo Trello: uma coluna por etapa, arrasta o cartão para a próxima.
// Funciona com mouse (arrasta direto) e no celular (segura o cartão um instante e arrasta).

export interface CartaoOS {
  id: string;
  numero: number | null;
  paciente_nome: string;
  dentista_nome: string | null;
  tipo_trabalho: string | null;
  dentes: string[] | null;
  status: StatusPedido;
  status_updated_at: string | null;
  created_at: string;
  prazo_desejado: string | null;
  arquivos: number;
  urgente?: boolean;
  aguardando?: boolean;
  atualizado_dentista?: string | null;
}

const COR_TOPO: Record<StatusPedido, string> = {
  recebido: "border-zinc-400",
  standby: "border-rose-500",
  cad: "border-sky-400",
  aprovacao: "border-pink-400",
  cam: "border-violet-400",
  finalizacao: "border-amber-400",
  prova: "border-orange-400",
  entregue: "border-emerald-400",
};

const DIA = 86400000;
/** Data AAAA-MM-DD no fuso do aparelho (o laboratório está no Brasil). */
const isoLocal = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const hojeISO = () => isoLocal(new Date());
const somaDias = (iso: string, dias: number) => {
  const [a, m, d] = iso.slice(0, 10).split("-").map(Number);
  return isoLocal(new Date(a, m - 1, d + dias));
};

/** Prazo de cada etapa (dias corridos a partir de quando o caso entrou nela). */
export const PRAZO_ETAPA: Partial<Record<StatusPedido, number>> = { cad: 2, cam: 3, finalizacao: 3 };

/** Até quando a etapa atual precisa ficar pronta. Se o prazo final do caso vier antes, vale ele. */
function limiteEtapa(c: CartaoOS): { data: string; motivo: "etapa" | "prazo final" } | null {
  const dias = PRAZO_ETAPA[c.status];
  if (dias == null) return null;
  const entrou = isoLocal(new Date(c.status_updated_at ?? c.created_at));
  const daEtapa = somaDias(entrou, dias);
  const final = c.prazo_desejado?.slice(0, 10);
  if (final && final < daEtapa) return { data: final, motivo: "prazo final" };
  return { data: daEtapa, motivo: "etapa" };
}
const diasDesde = (iso: string | null) => (iso ? Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / DIA)) : 0);
const ddmm = (iso: string | null) => {
  if (!iso) return "";
  const [, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}`;
};

/** "PSD – Coroa – Zircônia (dentes 14, 15) + Enceramento…" -> "Coroa em zircônia · 2x" */
function resumoTrabalho(c: CartaoOS) {
  const t = (c.tipo_trabalho || "Tipo a confirmar").split(" + ");
  const primeiro = t[0].replace(/\s*\((dentes?|Retrabalho)[^)]*\)/gi, "").split(" – ").filter((x) => !/^(PSD|PSI)$/.test(x));
  const nome = primeiro.join(" em ").replace(/ em (Zircônia|Dissilicato|Resina híbrida|Resina provisória)$/i, (_, m) => ` em ${m.toLowerCase()}`);
  const qtd = c.dentes?.length ?? 0;
  return `${nome}${t.length > 1 ? ` +${t.length - 1}` : ""}${qtd > 1 ? ` · ${qtd}x` : ""}`;
}

type FiltroEntregue = "7" | "30" | "todos";

export default function Quadro({ iniciais }: { iniciais: CartaoOS[] }) {
  const router = useRouter();
  const [cartoes, setCartoes] = useState(iniciais);
  const [busca, setBusca] = useState("");
  const [filtroEntregue, setFiltroEntregue] = useState<FiltroEntregue>("30");
  const [arrastando, setArrastando] = useState<{ id: string; x: number; y: number; w: number; dx: number; dy: number } | null>(null);
  const [colunaAlvo, setColunaAlvo] = useState<StatusPedido | null>(null);
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);
  const gesto = useRef<{ id: string; x0: number; y0: number; timer?: ReturnType<typeof setTimeout>; ativo: boolean; tipo: string; el: HTMLElement } | null>(null);

  useEffect(() => setCartoes(iniciais), [iniciais]);

  useEffect(() => {
    if (!aviso) return;
    const t = setTimeout(() => setAviso(null), 4000);
    return () => clearTimeout(t);
  }, [aviso]);

  const filtrados = useMemo(() => {
    const q = busca
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "");
    return cartoes.filter((c) => {
      if (q) {
        const alvo = `${numeroOS(c.numero)} ${c.numero ?? ""} ${c.paciente_nome} ${c.dentista_nome ?? ""}`
          .toLowerCase()
          .normalize("NFD")
          .replace(/[̀-ͯ]/g, "");
        if (!alvo.includes(q)) return false;
      }
      if (c.status === "entregue" && filtroEntregue !== "todos") {
        if (diasDesde(c.status_updated_at) > Number(filtroEntregue)) return false;
      }
      return true;
    });
  }, [cartoes, busca, filtroEntregue]);

  const porColuna = useMemo(() => {
    const m = Object.fromEntries(STATUS_ORDER.map((s) => [s, [] as CartaoOS[]])) as Record<StatusPedido, CartaoOS[]>;
    for (const c of filtrados) m[c.status]?.push(c);
    // Entregue: mais recentes primeiro. Demais: quem está há mais tempo na etapa primeiro.
    for (const s of STATUS_ORDER) {
      m[s].sort((a, b) => {
        const ta = new Date(a.status_updated_at ?? a.created_at).getTime();
        const tb = new Date(b.status_updated_at ?? b.created_at).getTime();
        return s === "entregue" ? tb - ta : ta - tb;
      });
    }
    return m;
  }, [filtrados]);

  // Agenda: casos em CAD, CAM e Finalização ordenados pelo limite da etapa.
  const agenda = useMemo(() => {
    const hoje = hojeISO();
    const amanha = somaDias(hoje, 1);
    const itens = cartoes
      .map((c) => ({ c, lim: limiteEtapa(c) }))
      .filter((x): x is { c: CartaoOS; lim: NonNullable<ReturnType<typeof limiteEtapa>> } => !!x.lim && x.lim.data <= amanha)
      .sort((a, b) => a.lim.data.localeCompare(b.lim.data) || Number(!!b.c.urgente) - Number(!!a.c.urgente));
    return {
      atrasados: itens.filter((x) => x.lim.data < hoje),
      hoje: itens.filter((x) => x.lim.data === hoje),
      amanha: itens.filter((x) => x.lim.data === amanha),
    };
  }, [cartoes]);
  const [agendaAberta, setAgendaAberta] = useState(true);

  async function mover(id: string, para: StatusPedido) {
    const antes = cartoes.find((c) => c.id === id);
    if (!antes || antes.status === para) return;
    const agora = new Date().toISOString();
    setCartoes((cs) => cs.map((c) => (c.id === id ? { ...c, status: para, status_updated_at: agora } : c)));
    try {
      const r = await fetch(`/api/pedidos/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: para }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.ok) throw new Error(j.erro || `erro ${r.status}`);
      setAviso({ ok: true, texto: `${numeroOS(antes.numero)} → ${STATUS_LABEL[para]}` });
    } catch (e) {
      setCartoes((cs) => cs.map((c) => (c.id === id ? antes : c)));
      const msg = String((e as Error).message || e);
      setAviso({
        ok: false,
        texto: /status_check/.test(msg)
          ? "Essa etapa ainda não existe no banco: rode o SQL supabase/migration_quadro.sql no Supabase."
          : `Não consegui mover: ${msg}`,
      });
    }
  }

  // ---------- arrastar (mouse e toque) ----------
  function colunaNoPonto(x: number, y: number): StatusPedido | null {
    const el = document.elementFromPoint(x, y)?.closest("[data-coluna]") as HTMLElement | null;
    return (el?.dataset.coluna as StatusPedido) ?? null;
  }

  function comecar(e: React.PointerEvent<HTMLElement>, id: string) {
    if (e.button !== 0) return;
    const el = e.currentTarget;
    const g = { id, x0: e.clientX, y0: e.clientY, ativo: false, tipo: e.pointerType, el } as NonNullable<typeof gesto.current>;
    gesto.current = g;
    if (e.pointerType !== "mouse") {
      // no toque, segura ~0,35 s para começar a arrastar (senão é rolagem normal)
      g.timer = setTimeout(() => ativar(e.clientX, e.clientY), 350);
    }
  }

  function ativar(x: number, y: number) {
    const g = gesto.current;
    if (!g || g.ativo) return;
    g.ativo = true;
    const r = g.el.getBoundingClientRect();
    navigator.vibrate?.(15);
    setArrastando({ id: g.id, x, y, w: r.width, dx: x - r.left, dy: y - r.top });
    setColunaAlvo(colunaNoPonto(x, y));
  }

  useEffect(() => {
    function move(e: PointerEvent) {
      const g = gesto.current;
      if (!g) return;
      if (!g.ativo) {
        const dist = Math.hypot(e.clientX - g.x0, e.clientY - g.y0);
        if (g.tipo === "mouse" && dist > 6) ativar(e.clientX, e.clientY);
        else if (g.tipo !== "mouse" && dist > 10) {
          clearTimeout(g.timer); // mexeu antes do tempo: é rolagem
          gesto.current = null;
        }
        return;
      }
      e.preventDefault();
      setArrastando((a) => (a ? { ...a, x: e.clientX, y: e.clientY } : a));
      setColunaAlvo(colunaNoPonto(e.clientX, e.clientY));
      // rolagem automática do quadro perto das bordas
      const q = document.getElementById("quadro-colunas");
      if (q) {
        const r = q.getBoundingClientRect();
        if (e.clientX > r.right - 60) q.scrollLeft += 18;
        else if (e.clientX < r.left + 60) q.scrollLeft -= 18;
      }
    }
    function fim(e: PointerEvent) {
      const g = gesto.current;
      gesto.current = null;
      if (!g) return;
      clearTimeout(g.timer);
      if (g.ativo) {
        const destino = colunaNoPonto(e.clientX, e.clientY);
        setArrastando(null);
        setColunaAlvo(null);
        if (destino) mover(g.id, destino);
      } else if (e.type === "pointerup") {
        router.push(`/pedido/${g.id}`); // clique simples abre o trabalho
      }
    }
    function bloquearToque(e: TouchEvent) {
      if (gesto.current?.ativo) e.preventDefault();
    }
    window.addEventListener("pointermove", move, { passive: false });
    window.addEventListener("pointerup", fim);
    window.addEventListener("pointercancel", fim);
    window.addEventListener("touchmove", bloquearToque, { passive: false });
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", fim);
      window.removeEventListener("pointercancel", fim);
      window.removeEventListener("touchmove", bloquearToque);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cartoes]);

  const cartaoArrastado = arrastando ? cartoes.find((c) => c.id === arrastando.id) : null;

  return (
    <div className={`flex min-w-0 flex-col gap-4 ${arrastando ? "select-none" : ""}`}>
      <div className="flex flex-wrap items-center gap-3">
        <input className="gc-input max-w-sm flex-1" placeholder="Buscar por nº da OS, paciente ou dentista" value={busca} onChange={(e) => setBusca(e.target.value)} />
        <p className="text-sm text-zinc-500">Arraste o cartão para a etapa seguinte. No celular, segure o cartão um instante e depois arraste. Toque no cartão para abrir o trabalho.</p>
      </div>

      <section className="rounded-2xl border border-white/10 bg-white/[0.03]">
        <button type="button" onClick={() => setAgendaAberta((v) => !v)} className="flex w-full flex-wrap items-center justify-between gap-2 px-4 py-3 text-left">
          <span className="text-sm font-bold text-white">📅 Agenda do dia</span>
          <span className="flex flex-wrap items-center gap-2 text-xs font-semibold">
            <span className={`rounded-full px-2 py-0.5 ${agenda.atrasados.length ? "bg-rose-600 text-white" : "bg-white/10 text-zinc-400"}`}>{agenda.atrasados.length} atrasado(s)</span>
            <span className={`rounded-full px-2 py-0.5 ${agenda.hoje.length ? "bg-amber-500 text-black" : "bg-white/10 text-zinc-400"}`}>{agenda.hoje.length} para hoje</span>
            <span className="rounded-full bg-white/10 px-2 py-0.5 text-zinc-300">{agenda.amanha.length} para amanhã</span>
            <span className="text-zinc-500">{agendaAberta ? "▲" : "▼"}</span>
          </span>
        </button>
        {agendaAberta && (
          <div className="grid gap-3 border-t border-white/5 p-4 md:grid-cols-3">
            {([
              ["Atrasados", agenda.atrasados, "text-rose-300"],
              ["Fazer hoje", agenda.hoje, "text-amber-300"],
              ["Amanhã", agenda.amanha, "text-zinc-300"],
            ] as const).map(([titulo, lista, cor]) => (
              <div key={titulo} className="flex flex-col gap-1.5">
                <p className={`text-xs font-bold uppercase tracking-wide ${cor}`}>{titulo}</p>
                {lista.length === 0 ? (
                  <p className="text-xs text-zinc-600">Nada aqui.</p>
                ) : (
                  lista.map(({ c, lim }) => (
                    <a key={c.id} href={`/pedido/${c.id}`} className="rounded-lg bg-black/30 px-3 py-2 text-xs hover:bg-black/50">
                      <span className="font-semibold text-white">
                        {c.urgente ? "⚠️ " : ""}
                        {c.numero ? String(c.numero).padStart(3, "0") : "—"} · {c.paciente_nome}
                      </span>
                      <span className="block text-zinc-400">
                        {STATUS_LABEL[c.status]} até {ddmm(lim.data)}
                        {lim.motivo === "prazo final" ? " (prazo final do caso)" : ""} · {resumoTrabalho(c)}
                      </span>
                    </a>
                  ))
                )}
              </div>
            ))}
            <p className="text-[11px] text-zinc-500 md:col-span-3">Prazos por etapa (dias corridos desde que o caso entrou nela): CAD 2 dias · CAM 3 dias · Finalização 3 dias.</p>
          </div>
        )}
      </section>

      <div id="quadro-colunas" className="-mx-1 flex gap-4 overflow-x-auto px-1 pb-4" style={{ minHeight: "70vh" }}>
        {STATUS_ORDER.map((s) => {
          const lista = porColuna[s];
          const alvo = colunaAlvo === s && arrastando && cartaoArrastado?.status !== s;
          return (
            <section
              key={s}
              data-coluna={s}
              className={`flex w-[272px] shrink-0 flex-col rounded-2xl border bg-white/[0.03] transition ${alvo ? "border-pink-300/60 bg-pink-400/[0.06]" : "border-white/5"}`}
            >
              <header className={`flex items-center justify-between gap-2 border-b-2 px-4 py-3 ${COR_TOPO[s]}`}>
                <h2 className="text-sm font-bold text-white">
                  {STATUS_LABEL[s]}
                  {PRAZO_ETAPA[s] != null && <span className="ml-1.5 text-[11px] font-normal text-zinc-500">{PRAZO_ETAPA[s]} dias</span>}
                </h2>
                <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${s === "standby" && lista.length ? "bg-rose-500 text-white" : "bg-white/10 text-zinc-200"}`}>{lista.length}</span>
              </header>
              {s === "entregue" && (
                <label className="flex items-center gap-2 px-4 pt-2 text-xs text-zinc-400">
                  Mostrar:
                  <select className="rounded-lg border border-white/10 bg-black/40 px-2 py-1 text-xs text-zinc-200" value={filtroEntregue} onChange={(e) => setFiltroEntregue(e.target.value as FiltroEntregue)}>
                    <option value="7">Últimos 7 dias</option>
                    <option value="30">Últimos 30 dias</option>
                    <option value="todos">Todos</option>
                  </select>
                </label>
              )}
              <div className="flex max-h-[72vh] flex-col gap-2.5 overflow-y-auto p-3">
                {lista.length === 0 && <p className="py-6 text-center text-xs text-zinc-600">Nenhum caso</p>}
                {lista.map((c) => (
                  <Cartao key={c.id} c={c} fantasma={arrastando?.id === c.id} onPointerDown={(e) => comecar(e, c.id)} />
                ))}
              </div>
            </section>
          );
        })}
      </div>

      {arrastando && cartaoArrastado && (
        <div className="pointer-events-none fixed z-50 rotate-2 opacity-95 shadow-2xl" style={{ left: arrastando.x - arrastando.dx, top: arrastando.y - arrastando.dy, width: arrastando.w }}>
          <Cartao c={cartaoArrastado} />
        </div>
      )}

      {aviso && (
        <div className={`fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-xl px-4 py-3 text-sm shadow-xl ${aviso.ok ? "bg-emerald-600 text-white" : "bg-rose-600 text-white"}`}>{aviso.texto}</div>
      )}
    </div>
  );
}

function Cartao({ c, fantasma, onPointerDown }: { c: CartaoOS; fantasma?: boolean; onPointerDown?: (e: React.PointerEvent<HTMLElement>) => void }) {
  const dias = diasDesde(c.status_updated_at ?? c.created_at);
  const entregue = c.status === "entregue";
  const atrasado = !entregue && !!c.prazo_desejado && c.prazo_desejado.slice(0, 10) < hojeISO();
  const parado = !entregue && dias >= 7;
  const lim = limiteEtapa(c);
  const hoje = hojeISO();
  return (
    <article
      onPointerDown={onPointerDown}
      className={`cursor-grab touch-pan-y rounded-xl border bg-[#141416] p-3 ${c.urgente && !entregue ? "border-rose-500/60" : "border-white/10"} transition hover:border-white/25 active:cursor-grabbing ${fantasma ? "opacity-30" : ""}`}
    >
      <p className="text-sm font-bold leading-snug text-white">
        <span className="text-zinc-400">{c.numero ? String(c.numero).padStart(3, "0") : "—"}</span> · {c.paciente_nome}
      </p>
      <p className="mt-0.5 line-clamp-2 text-xs text-zinc-400">
        {resumoTrabalho(c)}
        {c.dentista_nome ? ` · ${c.dentista_nome}` : ""}
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] font-semibold">
        {c.urgente && !entregue && <span className="rounded-md bg-rose-600 px-1.5 py-0.5 text-white">⚠️ URGENTE</span>}
        {c.aguardando && !entregue && <span className="rounded-md bg-amber-500 px-1.5 py-0.5 text-black">⏳ Aguardando arquivos</span>}
        {!c.aguardando && !entregue && c.atualizado_dentista && diasDesde(c.atualizado_dentista) <= 3 && (
          <span className="rounded-md bg-emerald-500/20 px-1.5 py-0.5 text-emerald-300">📎 Novidades {ddmm(c.atualizado_dentista)}</span>
        )}
        {entregue ? (
          <span className="rounded-md border border-emerald-400/40 px-1.5 py-0.5 text-emerald-300">Entregue {ddmm(c.status_updated_at)}</span>
        ) : (
          <span className={`rounded-md px-1.5 py-0.5 ${parado ? "bg-rose-600 text-white" : "bg-white/10 text-zinc-300"}`}>há {dias} d</span>
        )}
        {lim && (
          <span className={`rounded-md px-1.5 py-0.5 ${lim.data < hoje ? "bg-rose-600 text-white" : lim.data === hoje ? "bg-amber-500 text-black" : "bg-sky-500/15 text-sky-300"}`}>
            {lim.data < hoje ? "etapa atrasada" : lim.data === hoje ? "etapa: hoje" : `etapa até ${ddmm(lim.data)}`}
          </span>
        )}
        {!entregue && c.prazo_desejado && (
          <span className={`rounded-md px-1.5 py-0.5 ${atrasado ? "bg-rose-600 text-white" : "bg-white/10 text-zinc-300"}`}>prazo {ddmm(c.prazo_desejado)}</span>
        )}
        {c.arquivos > 0 && <span className="rounded-md bg-sky-500/15 px-1.5 py-0.5 text-sky-300">📎 {c.arquivos}</span>}
      </div>
    </article>
  );
}
