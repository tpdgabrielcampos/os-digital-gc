"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Botao, I, PageHeader, Panel, Vazio } from "@/components/gc/ui";
import { COR_CATEGORIA } from "@/components/OdontogramaTrabalhos";
import { SEPARADOR, nomeUnidade, todasAsFolhas, unidadeDoServico } from "@/lib/catalogo";
import type { Preco } from "@/lib/gc";

interface Tab {
  id: string;
  nome: string;
  dentistas: number;
}

const paraTexto = (v: number | undefined) =>
  v === undefined ? "" : v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** "1.200,50" | "1200.5" | "1200" -> 1200.5 ; vazio -> null ; inválido -> NaN */
function paraNumero(t: string): number | null {
  const s = t.trim().replace(/\s|R\$/g, "");
  if (!s) return null;
  const normal = s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s;
  const n = Number(normal);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : NaN;
}

export default function EditorPrecos({ tabelas, selecionada, precos }: { tabelas: Tab[]; selecionada: string | null; precos: Preco[] }) {
  const router = useRouter();
  const folhas = useMemo(() => todasAsFolhas(), []);
  const inicial = useMemo(() => {
    const m: Record<string, string> = {};
    for (const p of precos) m[p.servico] = paraTexto(Number(p.valor));
    return m;
  }, [precos]);
  const [valores, setValores] = useState<Record<string, string>>(inicial);
  const [mensagem, setMensagem] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [criando, setCriando] = useState<null | { nome: string; copiar: boolean }>(null);
  const [renomeando, setRenomeando] = useState<string | null>(null);

  const atual = tabelas.find((t) => t.id === selecionada) ?? null;
  const alterados = folhas.map((f) => f.join(SEPARADOR)).filter((k) => (valores[k] ?? "") !== (inicial[k] ?? ""));
  const invalidos = alterados.filter((k) => Number.isNaN(paraNumero(valores[k] ?? "")));
  const comPreco = folhas.filter((f) => (valores[f.join(SEPARADOR)] ?? "").trim()).length;

  const grupos = useMemo(() => {
    const g = new Map<string, string[][]>();
    for (const f of folhas) g.set(f[0], [...(g.get(f[0]) ?? []), f]);
    return Array.from(g.entries());
  }, [folhas]);

  async function chamar(url: string, method: string, body?: unknown) {
    const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
    const j = await res.json().catch(() => ({}));
    if (!res.ok || !j.ok) throw new Error(j.erro || "Não consegui salvar.");
    return j;
  }

  async function salvar() {
    if (!atual || invalidos.length) return;
    setSalvando(true);
    setMensagem(null);
    try {
      await chamar("/api/admin/precos", "PUT", {
        tabela_id: atual.id,
        precos: alterados.map((k) => ({ servico: k, valor: paraNumero(valores[k] ?? "") })),
      });
      setMensagem({ tipo: "ok", texto: `Preços da tabela ${atual.nome} salvos.` });
      router.refresh();
    } catch (e) {
      setMensagem({ tipo: "erro", texto: e instanceof Error ? e.message : String(e) });
    } finally {
      setSalvando(false);
    }
  }

  async function criarTabela() {
    if (!criando?.nome.trim()) return;
    try {
      const j = await chamar("/api/admin/tabelas", "POST", { nome: criando.nome, copiarDe: criando.copiar ? atual?.id : undefined });
      setCriando(null);
      router.push(`/dashboard/precos?t=${j.id}`);
      router.refresh();
    } catch (e) {
      setMensagem({ tipo: "erro", texto: e instanceof Error ? e.message : String(e) });
    }
  }

  async function renomear() {
    if (!atual || !renomeando?.trim()) return;
    try {
      await chamar("/api/admin/tabelas", "PATCH", { id: atual.id, nome: renomeando });
      setRenomeando(null);
      router.refresh();
    } catch (e) {
      setMensagem({ tipo: "erro", texto: e instanceof Error ? e.message : String(e) });
    }
  }

  async function apagar() {
    if (!atual) return;
    const aviso = atual.dentistas
      ? `Apagar a tabela "${atual.nome}"? ${atual.dentistas} dentista(s) vão ficar sem tabela.`
      : `Apagar a tabela "${atual.nome}"?`;
    if (!window.confirm(aviso)) return;
    try {
      await chamar(`/api/admin/tabelas?id=${atual.id}`, "DELETE");
      router.push("/dashboard/precos");
      router.refresh();
    } catch (e) {
      setMensagem({ tipo: "erro", texto: e instanceof Error ? e.message : String(e) });
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="Catálogo"
        title="Tabelas de preço"
        subtitle="Crie quantas tabelas quiser e ligue cada dentista a uma delas (em Dentistas). O valor estimado de cada OS sai daqui."
        actions={
          <>
            {atual && <Botao variante="secundario" onClick={() => setCriando({ nome: `${atual.nome} (cópia)`, copiar: true })}>Duplicar tabela</Botao>}
            <Botao onClick={() => setCriando({ nome: "", copiar: false })}>{I.mais} Nova tabela</Botao>
          </>
        }
      />

      {criando && (
        <div className="gc-card flex flex-wrap items-end gap-3 p-5">
          <label className="flex min-w-[240px] flex-1 flex-col gap-1.5 text-sm text-zinc-300">
            {criando.copiar ? `Nome da cópia de "${atual?.nome}"` : "Nome da nova tabela"}
            <input autoFocus className="gc-input" value={criando.nome} onChange={(e) => setCriando({ ...criando, nome: e.target.value })} placeholder="Ex: Parceiro, Avulso…" />
          </label>
          <Botao onClick={criarTabela}>Criar</Botao>
          <Botao variante="secundario" onClick={() => setCriando(null)}>Cancelar</Botao>
        </div>
      )}

      {tabelas.length === 0 ? (
        <Panel><Vazio>Nenhuma tabela ainda. Clique em “Nova tabela”.</Vazio></Panel>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {tabelas.map((t) => (
            <Link key={t.id} href={`/dashboard/precos?t=${t.id}`} className={`gc-card p-5 transition hover:bg-white/[0.04] ${t.id === selecionada ? "ring-1 ring-pink-400/60" : ""}`}>
              <p className="gc-eyebrow">{t.id === selecionada ? "Editando" : "Tabela"}</p>
              <p className="mt-1 text-xl font-bold text-white">{t.nome}</p>
              <p className="mt-1 text-sm text-zinc-400">{t.dentistas} dentista{t.dentistas === 1 ? "" : "s"} usando</p>
            </Link>
          ))}
        </div>
      )}

      {atual && (
        <Panel
          eyebrow={`Tabela ${atual.nome}`}
          title={
            renomeando !== null ? (
              <span className="flex flex-wrap items-center gap-2">
                <input autoFocus className="gc-input w-56 !py-1.5 text-base" value={renomeando} onChange={(e) => setRenomeando(e.target.value)} />
                <button onClick={renomear} className="text-sm text-emerald-300">salvar</button>
                <button onClick={() => setRenomeando(null)} className="text-sm text-zinc-400">cancelar</button>
              </span>
            ) : (
              "Preço por serviço"
            )
          }
          badge={`${comPreco} de ${folhas.length} com preço`}
        >
          <p className="-mt-2 mb-5 text-sm text-zinc-400">
            Deixe em branco o que você prefere combinar caso a caso — aparece “a combinar” para o dentista.
            {" "}
            <button onClick={() => setRenomeando(atual.nome)} className="text-zinc-300 underline-offset-2 hover:underline">Renomear</button>
            {" · "}
            <button onClick={apagar} className="text-rose-300 underline-offset-2 hover:underline">Apagar tabela</button>
          </p>
          <div className="flex flex-col gap-6">
            {grupos.map(([cat, itens]) => (
              <div key={cat}>
                <p className="mb-2 flex items-center gap-2 text-sm font-bold text-white">
                  <span className={`h-2.5 w-2.5 rounded-full border ${COR_CATEGORIA[cat] ?? ""}`} /> {cat}
                  {new Set(itens.map((i) => unidadeDoServico(i))).size === 1 && (
                    <span className="font-normal text-zinc-500">· por {nomeUnidade(unidadeDoServico(itens[0]))}</span>
                  )}
                </p>
                <div className="divide-y divide-white/5 rounded-xl border border-white/5">
                  {itens.map((f) => {
                    const k = f.join(SEPARADOR);
                    const nome = f.length > 1 ? f.slice(1).join(SEPARADOR) : f[0];
                    const ruim = Number.isNaN(paraNumero(valores[k] ?? ""));
                    return (
                      <div key={k} className="flex items-center justify-between gap-4 px-4 py-2.5">
                        <span className="text-[15px] text-zinc-200">
                          {nome}
                          {new Set(itens.map((i) => unidadeDoServico(i))).size > 1 && (
                            <span className="ml-2 text-xs text-zinc-500">por {nomeUnidade(unidadeDoServico(f))}</span>
                          )}
                        </span>
                        <span className="flex items-center gap-2">
                          <span className="text-sm text-zinc-500">R$</span>
                          <input
                            inputMode="decimal"
                            className={`gc-input w-32 !py-2 text-right ${ruim ? "!border-rose-400/70" : ""}`}
                            placeholder="a combinar"
                            value={valores[k] ?? ""}
                            onChange={(e) => setValores((v) => ({ ...v, [k]: e.target.value }))}
                          />
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          <div className="sticky bottom-4 mt-6 flex flex-wrap items-center gap-4 rounded-2xl border border-white/10 bg-black/80 p-4 backdrop-blur">
            <Botao onClick={salvar} disabled={salvando || alterados.length === 0 || invalidos.length > 0}>
              {salvando ? "Salvando…" : alterados.length ? `Salvar ${alterados.length} alteração(ões)` : "Nada para salvar"}
            </Botao>
            {invalidos.length > 0 && <span className="text-sm text-rose-300">Confira os valores em vermelho (use só números, ex: 450 ou 1.200,00).</span>}
            {mensagem && <span className={`text-sm ${mensagem.tipo === "ok" ? "text-emerald-300" : "text-rose-300"}`}>{mensagem.texto}</span>}
          </div>
        </Panel>
      )}
    </>
  );
}
