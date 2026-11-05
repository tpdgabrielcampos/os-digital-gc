"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import PortalShell, { useDentista } from "@/components/gc/PortalShell";
import OdontogramaTrabalhos, { COR_CATEGORIA, type Marcacoes } from "@/components/OdontogramaTrabalhos";
import { Botao, I, PageHeader, Panel } from "@/components/gc/ui";
import { supabaseBrowser } from "@/lib/supabaseClient";
import { ehPontico, materialDoCaminho, pedeCor } from "@/lib/catalogo";
import { ORDEM_DENTES, agruparMarcacoes } from "@/lib/odontograma";
import { orcamento } from "@/lib/precos";
import { MAX_ARQUIVO, brl, numeroOS, tamanhoLegivel } from "@/lib/gc";

export default function NovaOSPage() {
  return (
    <PortalShell ativo="/portal/nova">
      <NovaOS />
    </PortalShell>
  );
}

const SEPARADOR_TRABALHOS = " + ";
const ACEITOS = ".stl,.ply,.obj,.dcm,.zip,.jpg,.jpeg,.png,.heic,.pdf";

type EstadoArquivo = "fila" | "enviando" | "enviado" | "erro";
interface Arq {
  id: string;
  file: File;
  estado: EstadoArquivo;
  erro?: string;
}

function nomeSeguro(nome: string) {
  return nome
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .slice(-120);
}

function mensagemDeErro(err: unknown) {
  if (err instanceof Error) return err.message;
  if (err && typeof err === "object" && "message" in err) return String((err as { message: unknown }).message);
  return String(err);
}

function NovaOS() {
  const { sessao, dentista, nomeTabela } = useDentista();
  const [paciente, setPaciente] = useState("");
  const [prazo, setPrazo] = useState("");
  const [instalacao, setInstalacao] = useState("");
  const [corCaso, setCorCaso] = useState("");
  const [observacoes, setObservacoes] = useState("");
  const [marcacoes, setMarcacoes] = useState<Marcacoes>({});
  const [retrabalho, setRetrabalho] = useState<Record<string, boolean>>({});
  const [arquivos, setArquivos] = useState<Arq[]>([]);
  const [precos, setPrecos] = useState<Record<string, number>>({});
  const [estado, setEstado] = useState<"editando" | "enviando" | "pronto">("editando");
  const [erro, setErro] = useState<string | null>(null);
  const [resultado, setResultado] = useState<{ numero: number | null; falhas: number } | null>(null);
  const [arrastando, setArrastando] = useState(false);
  const inputArquivo = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!dentista.tabela_id) return;
    supabaseBrowser
      .from("precos")
      .select("servico, valor")
      .eq("tabela_id", dentista.tabela_id)
      .then(({ data }) => {
        const m: Record<string, number> = {};
        for (const p of data ?? []) m[p.servico] = Number(p.valor);
        setPrecos(m);
      });
  }, [dentista.tabela_id]);

  const grupos = useMemo(() => agruparMarcacoes(marcacoes), [marcacoes]);
  const orc = useMemo(() => orcamento(grupos, precos), [grupos, precos]);
  const casoPedeCor = grupos.some((g) => pedeCor(g.caminho) || ehPontico(g.caminho));
  const temPrecos = Object.keys(precos).length > 0;

  function adicionarArquivos(lista: FileList | null) {
    if (!lista) return;
    const novos: Arq[] = [];
    for (const file of Array.from(lista)) {
      novos.push({
        id: crypto.randomUUID(),
        file,
        estado: file.size > MAX_ARQUIVO ? "erro" : "fila",
        erro: file.size > MAX_ARQUIVO ? "maior que 50 MB — compacte ou divida o arquivo" : undefined,
      });
    }
    setArquivos((a) => [...a, ...novos]);
  }

  const marcarArq = (id: string, dados: Partial<Arq>) =>
    setArquivos((a) => a.map((x) => (x.id === id ? { ...x, ...dados } : x)));

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    const faltando: string[] = [];
    if (!paciente.trim()) faltando.push("nome do paciente");
    if (grupos.length === 0) faltando.push("pelo menos um trabalho no odontograma");
    if (casoPedeCor && !corCaso.trim()) faltando.push("cor final do caso");
    if (faltando.length) {
      setErro(`Falta preencher: ${faltando.join(", ")}.`);
      return;
    }

    setEstado("enviando");
    try {
      const varios = grupos.length > 1;
      const trabalhos = grupos.map((g) => {
        const dentes = varios ? ` (dente${g.dentes.length > 1 ? "s" : ""} ${g.dentes.join(", ")})` : "";
        return g.chave + dentes + (retrabalho[g.chave] ? " (Retrabalho)" : "");
      });
      const materiais = Array.from(
        new Set(grupos.map((g) => materialDoCaminho(g.caminho)).filter((m): m is string => !!m))
      );
      const enviaveis = arquivos.filter((a) => a.estado !== "erro");

      const { data: pedido, error } = await supabaseBrowser
        .from("pedidos")
        .insert({
          os_id: crypto.randomUUID(),
          dentista_id: dentista.id,
          dentista_nome: dentista.nome,
          clinica: dentista.clinica,
          contato: dentista.whatsapp,
          quem_preencheu: dentista.nome,
          paciente_nome: paciente.trim(),
          tipo_trabalho: trabalhos.join(SEPARADOR_TRABALHOS),
          dentes: ORDEM_DENTES.filter((d) => marcacoes[d]),
          material: materiais.join(", ") || null,
          cor_restauracao: casoPedeCor ? corCaso.trim() : null,
          prazo_desejado: prazo || null,
          instalacao_agendada: instalacao || null,
          plataforma_envio: enviaveis.length ? "Portal GC" : null,
          observacoes: observacoes.trim() || null,
          valor_estimado: temPrecos ? orc.total : null,
        })
        .select("id, numero")
        .single();
      if (error || !pedido) throw error ?? new Error("Não consegui criar a OS.");

      // Arquivos: um por vez, para não estourar a internet de quem envia.
      let falhas = 0;
      for (const a of enviaveis) {
        marcarArq(a.id, { estado: "enviando" });
        const caminho = `${dentista.id}/${pedido.id}/${Date.now()}-${nomeSeguro(a.file.name)}`;
        const { error: eUp } = await supabaseBrowser.storage.from("arquivos-os").upload(caminho, a.file, {
          contentType: a.file.type || "application/octet-stream",
        });
        if (eUp) {
          falhas++;
          marcarArq(a.id, { estado: "erro", erro: mensagemDeErro(eUp) });
          continue;
        }
        const { data: reg } = await supabaseBrowser
          .from("pedido_arquivos")
          .insert({ pedido_id: pedido.id, dentista_id: dentista.id, nome: a.file.name, caminho, tamanho: a.file.size })
          .select("id")
          .single();
        marcarArq(a.id, { estado: "enviado" });
        // Cópia para o Google Drive (pasta Dentista / Paciente – OS). Roda no servidor.
        if (reg?.id) {
          fetch("/api/drive/copiar", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${sessao.access_token}` },
            body: JSON.stringify({ arquivoId: reg.id }),
            keepalive: true,
          }).catch(() => {});
        }
      }

      for (const rota of ["/api/trello/criar-cartao", "/api/planilha/enviar-pedido"]) {
        fetch(rota, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pedidoId: pedido.id }),
          keepalive: true,
        }).catch(() => {});
      }

      setResultado({ numero: pedido.numero, falhas });
      setEstado("pronto");
    } catch (err) {
      setErro(`Não consegui enviar a OS. Detalhe: ${mensagemDeErro(err)}`);
      setEstado("editando");
    }
  }

  if (estado === "pronto" && resultado) {
    return (
      <div className="gc-card gc-hero mx-auto mt-10 w-full max-w-xl p-10 text-center">
        <p className="gc-eyebrow">OS enviada</p>
        <h1 className="mt-3 text-3xl font-bold text-white">{numeroOS(resultado.numero)}</h1>
        <p className="mt-3 text-zinc-300">
          Recebemos o caso de <strong className="text-white">{paciente}</strong>. Você acompanha o andamento em “Minhas OS”.
        </p>
        {resultado.falhas > 0 && (
          <p className="mt-4 rounded-xl bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
            {resultado.falhas} arquivo(s) não subiram. Envie de novo pela tela da OS ou mande pelo WhatsApp.
          </p>
        )}
        <div className="mt-8 flex justify-center gap-3">
          <Botao variante="secundario" href="/portal">Minhas OS</Botao>
          <Botao onClick={() => window.location.reload()}>{I.mais} Nova OS</Botao>
        </div>
      </div>
    );
  }

  const enviando = estado === "enviando";

  return (
    <form onSubmit={enviar} className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Nova ordem de serviço"
        title="Enviar um caso"
        subtitle="Marque os dentes, escolha o trabalho e anexe os arquivos. Você vê o valor estimado antes de enviar."
      />

      <div className="grid gap-6 xl:grid-cols-[1.6fr_1fr]">
        <div className="flex min-w-0 flex-col gap-6">
          <Panel eyebrow="Paciente" title="Dados do caso">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="flex flex-col gap-1.5 text-sm text-zinc-300 sm:col-span-2">
                Nome do paciente *
                <input className="gc-input" value={paciente} onChange={(e) => setPaciente(e.target.value)} disabled={enviando} />
              </label>
              <label className="flex flex-col gap-1.5 text-sm text-zinc-300">
                Prazo desejado
                <input type="date" className="gc-input [color-scheme:dark]" value={prazo} onChange={(e) => setPrazo(e.target.value)} disabled={enviando} />
              </label>
              <label className="flex flex-col gap-1.5 text-sm text-zinc-300">
                Data da instalação (se já marcada)
                <input type="date" className="gc-input [color-scheme:dark]" value={instalacao} onChange={(e) => setInstalacao(e.target.value)} disabled={enviando} />
              </label>
            </div>
          </Panel>

          <Panel eyebrow="Odontograma" title="Dentes e trabalhos" badge={grupos.length ? `${grupos.length} trabalho${grupos.length > 1 ? "s" : ""}` : undefined}>
            <OdontogramaTrabalhos marcacoes={marcacoes} onChange={setMarcacoes} />
            {grupos.length > 0 && (
              <div className="mt-5 flex flex-col gap-2">
                {grupos.map((g) => (
                  <div key={g.chave} className="flex flex-wrap items-center gap-3 rounded-xl bg-white/[0.03] px-3 py-2.5">
                    <span className={`h-2.5 w-2.5 rounded-full border ${COR_CATEGORIA[g.caminho[0]] ?? ""}`} />
                    <span className="min-w-0 flex-1 text-sm text-white">
                      {g.chave} <span className="text-zinc-400">· {g.dentes.length > 1 ? "dentes" : "dente"} {g.dentes.join(", ")}</span>
                    </span>
                    <label className="flex items-center gap-2 text-xs text-zinc-400">
                      <input
                        type="checkbox"
                        checked={!!retrabalho[g.chave]}
                        onChange={(e) => setRetrabalho((r) => ({ ...r, [g.chave]: e.target.checked }))}
                      />
                      É retrabalho
                    </label>
                  </div>
                ))}
              </div>
            )}
            {casoPedeCor && (
              <label className="mt-5 flex max-w-xs flex-col gap-1.5 text-sm text-zinc-300">
                Cor final do caso *
                <input className="gc-input" placeholder="Ex: A2, A3.5, BL2…" value={corCaso} onChange={(e) => setCorCaso(e.target.value)} disabled={enviando} />
              </label>
            )}
          </Panel>

          <Panel eyebrow="Arquivos" title="Escaneamentos e fotos" badge="STL, PLY, OBJ, JPG, PDF">
            <div
              onClick={() => inputArquivo.current?.click()}
              onDragOver={(e) => {
                e.preventDefault();
                setArrastando(true);
              }}
              onDragLeave={() => setArrastando(false)}
              onDrop={(e) => {
                e.preventDefault();
                setArrastando(false);
                adicionarArquivos(e.dataTransfer.files);
              }}
              className={`flex cursor-pointer flex-col items-center gap-2 rounded-2xl border-2 border-dashed px-4 py-8 text-center transition ${
                arrastando ? "border-pink-300/70 bg-pink-400/5" : "border-white/10 bg-white/[0.02] hover:border-white/25"
              }`}
            >
              <span className="text-[#f2a43a]">{I.nuvem}</span>
              <p className="font-semibold text-white">Arraste os arquivos aqui ou clique para escolher</p>
              <p className="text-sm text-zinc-400">Até 50 MB por arquivo. Vão direto para a pasta do caso no laboratório.</p>
              <input
                ref={inputArquivo}
                type="file"
                multiple
                accept={ACEITOS}
                className="hidden"
                onChange={(e) => {
                  adicionarArquivos(e.target.files);
                  e.target.value = "";
                }}
              />
            </div>
            {arquivos.length > 0 && (
              <div className="mt-4 flex flex-col gap-2">
                {arquivos.map((a) => (
                  <div key={a.id} className="flex items-center gap-3 rounded-xl bg-white/[0.03] px-3 py-2.5">
                    <span className="text-zinc-400">{I.arquivo}</span>
                    <span className="min-w-0 flex-1 truncate text-sm text-white">{a.file.name}</span>
                    <span className="text-xs text-zinc-400">{tamanhoLegivel(a.file.size)}</span>
                    <span
                      className={`text-xs font-semibold ${
                        a.estado === "enviado" ? "text-emerald-300" : a.estado === "erro" ? "text-rose-300" : a.estado === "enviando" ? "text-amber-300" : "text-zinc-400"
                      }`}
                      title={a.erro}
                    >
                      {a.estado === "enviado" ? "enviado" : a.estado === "erro" ? a.erro ?? "erro" : a.estado === "enviando" ? "enviando…" : "pronto"}
                    </span>
                    {!enviando && a.estado !== "enviado" && (
                      <button type="button" onClick={() => setArquivos((x) => x.filter((y) => y.id !== a.id))} className="text-zinc-500 hover:text-white" title="Tirar">
                        ×
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Panel>

          <Panel eyebrow="Observações" title="Algo que o laboratório precisa saber?">
            <textarea
              className="gc-input min-h-[110px]"
              placeholder="Detalhes do caso, preferências, contato da clínica…"
              value={observacoes}
              onChange={(e) => setObservacoes(e.target.value)}
              disabled={enviando}
            />
          </Panel>
        </div>

        <div className="flex flex-col gap-6 xl:sticky xl:top-8 xl:self-start">
          <Panel eyebrow="Resumo" title="Valor estimado">
            {grupos.length === 0 ? (
              <p className="text-sm text-zinc-400">Marque os trabalhos no odontograma para ver o valor.</p>
            ) : (
              <div className="flex flex-col gap-3">
                {orc.itens.map((i) => (
                  <div key={i.chave} className="flex items-start gap-3">
                    <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full border ${COR_CATEGORIA[i.caminho[0]] ?? ""}`} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-white">{i.chave}</p>
                      <p className="text-xs text-zinc-400">
                        {i.quantidade} {i.unidade === "arcada" ? (i.quantidade > 1 ? "arcadas" : "arcada") : i.quantidade > 1 ? "elementos" : "elemento"}
                        {i.unitario !== null && ` × ${brl(i.unitario)}`}
                      </p>
                    </div>
                    <span className="text-sm font-semibold text-white">{i.unitario === null ? "a combinar" : brl(i.total)}</span>
                  </div>
                ))}
              </div>
            )}
            <div className="mt-5 flex items-end justify-between border-t border-white/5 pt-4">
              <span className="text-sm text-zinc-400">Total estimado</span>
              <span className="text-3xl font-bold text-white">{temPrecos ? brl(orc.total) : "—"}</span>
            </div>
            <p className="mt-2 text-xs text-zinc-500">
              {temPrecos
                ? `Valores da sua tabela${nomeTabela ? ` (${nomeTabela})` : ""}. ${orc.semPreco ? "Itens “a combinar” o laboratório confirma depois. " : ""}O valor final pode mudar se houver ajuste no caso.`
                : "O laboratório ainda não ligou uma tabela de preço à sua conta — o valor é confirmado depois do envio."}
            </p>
            {erro && <p className="mt-4 rounded-xl bg-rose-500/10 px-3 py-2 text-sm text-rose-300">{erro}</p>}
            <div className="mt-5 flex flex-wrap items-center gap-3">
              <Botao type="submit" disabled={enviando}>{enviando ? "Enviando…" : "Enviar ordem de serviço"}</Botao>
              <Link href="/portal" className="text-sm text-zinc-400 hover:text-white">Cancelar</Link>
            </div>
          </Panel>
        </div>
      </div>
    </form>
  );
}
