"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import PortalShell, { useDentista } from "@/components/gc/PortalShell";
import { Botao, I, PageHeader, Panel, Vazio } from "@/components/gc/ui";
import { supabaseBrowser } from "@/lib/supabaseClient";
import { STATUS_LABEL, type StatusPedido } from "@/lib/types";
import { MAX_ARQUIVO, brl, dataBR, numeroOS, tamanhoLegivel } from "@/lib/gc";
import { ACEITOS, acaoOS, enviarArquivoOS, mensagemDeErro } from "@/lib/arquivosOS";

// Tela da OS para o dentista. Enquanto a OS está "aguardando arquivos" (e o caso
// ainda não entrou em produção), ele pode anexar arquivos, escrever um complemento
// e, no fim, liberar o caso para produção. Depois disso, só consulta.

export default function OSDentistaPage({ params }: { params: { id: string } }) {
  return (
    <PortalShell ativo="/portal">
      <OSDentista id={params.id} />
    </PortalShell>
  );
}

interface OS {
  id: string;
  numero: number | null;
  created_at: string;
  paciente_nome: string;
  tipo_trabalho: string;
  dentes: string[];
  cor_restauracao: string | null;
  status: StatusPedido;
  prazo_desejado: string | null;
  observacoes: string | null;
  valor_estimado: number | null;
  aguardando_arquivos?: boolean | null;
  pedido_arquivos: { id: string; nome: string; tamanho: number | null; criado_em: string }[];
}

type EstadoArq = "fila" | "enviando" | "enviado" | "erro";
interface Arq {
  id: string;
  file: File;
  estado: EstadoArq;
  erro?: string;
}

const EDITAVEIS: StatusPedido[] = ["recebido", "standby"];

function OSDentista({ id }: { id: string }) {
  const { sessao, dentista } = useDentista();
  const [os, setOs] = useState<OS | null | undefined>(undefined);
  const [arquivos, setArquivos] = useState<Arq[]>([]);
  const [complemento, setComplemento] = useState("");
  const [ocupado, setOcupado] = useState<null | "arquivos" | "complemento" | "concluir">(null);
  const [aviso, setAviso] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);
  const inputArquivo = useRef<HTMLInputElement>(null);

  const carregar = useCallback(async () => {
    const { data } = await supabaseBrowser
      .from("pedidos")
      .select("*, pedido_arquivos(id, nome, tamanho, criado_em)")
      .eq("id", id)
      .eq("dentista_id", dentista.id)
      .maybeSingle();
    setOs((data as OS) ?? null);
  }, [id, dentista.id]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  if (os === undefined) return <Vazio>Carregando…</Vazio>;
  if (os === null)
    return (
      <Vazio>
        Não encontrei essa OS. <a href="/portal" className="text-pink-300 underline">Voltar para Minhas OS</a>
      </Vazio>
    );

  const editavel = !!os.aguardando_arquivos && EDITAVEIS.includes(os.status);
  const naFila = arquivos.filter((a) => a.estado === "fila" || a.estado === "erro");

  function adicionar(lista: FileList | null) {
    if (!lista) return;
    const novos: Arq[] = Array.from(lista).map((file) => ({
      id: crypto.randomUUID(),
      file,
      estado: file.size > MAX_ARQUIVO ? "erro" : "fila",
      erro: file.size > MAX_ARQUIVO ? "maior que 50 MB — compacte ou divida o arquivo" : undefined,
    }));
    setArquivos((a) => [...a, ...novos]);
  }

  const marcar = (aid: string, d: Partial<Arq>) => setArquivos((a) => a.map((x) => (x.id === aid ? { ...x, ...d } : x)));

  async function enviarArquivos() {
    if (!os) return;
    setOcupado("arquivos");
    setAviso(null);
    let ok = 0;
    for (const a of arquivos.filter((x) => x.estado === "fila" || (x.estado === "erro" && x.file.size <= MAX_ARQUIVO))) {
      marcar(a.id, { estado: "enviando", erro: undefined });
      const r = await enviarArquivoOS({ file: a.file, dentistaId: dentista.id, pedidoId: os.id, token: sessao.access_token });
      if (r.ok) {
        ok++;
        marcar(a.id, { estado: "enviado" });
      } else marcar(a.id, { estado: "erro", erro: r.erro });
    }
    if (ok > 0) await acaoOS(os.id, sessao.access_token, { acao: "arquivos" }).catch(() => {});
    setArquivos((a) => a.filter((x) => x.estado !== "enviado"));
    await carregar();
    setOcupado(null);
    setAviso(ok > 0 ? { tipo: "ok", texto: `${ok} arquivo(s) enviado(s) para o laboratório.` } : { tipo: "erro", texto: "Nenhum arquivo subiu. Confira a internet e tente de novo." });
  }

  async function salvarComplemento() {
    if (!os || !complemento.trim()) return;
    setOcupado("complemento");
    setAviso(null);
    try {
      await acaoOS(os.id, sessao.access_token, { acao: "complemento", texto: complemento });
      setComplemento("");
      await carregar();
      setAviso({ tipo: "ok", texto: "Complemento salvo na OS." });
    } catch (e) {
      setAviso({ tipo: "erro", texto: mensagemDeErro(e) });
    } finally {
      setOcupado(null);
    }
  }

  async function concluir() {
    if (!os) return;
    if (naFila.length > 0) {
      setAviso({ tipo: "erro", texto: "Ainda tem arquivo na lista sem enviar. Toque em “Enviar arquivos” antes de liberar." });
      return;
    }
    if (complemento.trim()) {
      setAviso({ tipo: "erro", texto: "Você escreveu um complemento e não salvou. Salve antes de liberar." });
      return;
    }
    setOcupado("concluir");
    setAviso(null);
    try {
      await acaoOS(os.id, sessao.access_token, { acao: "concluir" });
      await carregar();
      setAviso({ tipo: "ok", texto: "Pronto! OS completa e liberada para produção." });
    } catch (e) {
      setAviso({ tipo: "erro", texto: mensagemDeErro(e) });
    } finally {
      setOcupado(null);
    }
  }

  return (
    <>
      <PageHeader
        eyebrow={numeroOS(os.numero)}
        title={os.paciente_nome}
        subtitle={os.tipo_trabalho}
        actions={<Botao variante="secundario" href="/portal">Minhas OS</Botao>}
      />

      {editavel ? (
        <div className="rounded-2xl border border-amber-400/40 bg-amber-500/10 p-4 text-sm text-amber-100">
          <p className="font-semibold">⏳ OS aguardando arquivos e informações</p>
          <p className="mt-1 text-amber-100/80">
            O caso só entra em produção quando todas as informações e arquivos forem enviados. Anexe o que falta abaixo e,
            no fim, toque em <strong>“Enviei tudo — liberar para produção”</strong>.
          </p>
        </div>
      ) : (
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-sm text-zinc-300">
          Esta OS está completa e já está com o laboratório. Para mudar alguma coisa, fale com o laboratório.
        </div>
      )}

      {aviso && (
        <p className={`rounded-xl px-4 py-3 text-sm ${aviso.tipo === "ok" ? "bg-emerald-500/10 text-emerald-200" : "bg-rose-500/10 text-rose-200"}`}>{aviso.texto}</p>
      )}

      <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
        <div className="flex flex-col gap-6">
          <Panel eyebrow="Arquivos" title="Escaneamentos e fotos" badge={`${os.pedido_arquivos.length} enviado(s)`}>
            {os.pedido_arquivos.length > 0 ? (
              <div className="flex flex-col gap-2">
                {os.pedido_arquivos.map((a) => (
                  <div key={a.id} className="flex items-center gap-3 rounded-xl bg-white/[0.03] px-3 py-2.5 text-sm">
                    <span className="text-zinc-400">{I.arquivo}</span>
                    <span className="min-w-0 flex-1 truncate text-white">{a.nome}</span>
                    <span className="text-xs text-zinc-400">{tamanhoLegivel(a.tamanho)}</span>
                    <span className="text-xs font-semibold text-emerald-300">enviado</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-zinc-400">Nenhum arquivo enviado ainda.</p>
            )}

            {editavel && (
              <>
                <div
                  onClick={() => inputArquivo.current?.click()}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    adicionar(e.dataTransfer.files);
                  }}
                  className="mt-4 flex cursor-pointer flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-white/10 bg-white/[0.02] px-4 py-6 text-center transition hover:border-white/25"
                >
                  <span className="text-[#f2a43a]">{I.nuvem}</span>
                  <p className="font-semibold text-white">Adicionar arquivos</p>
                  <p className="text-sm text-zinc-400">STL, PLY, OBJ, fotos ou PDF · até 50 MB cada</p>
                  <input
                    ref={inputArquivo}
                    type="file"
                    multiple
                    accept={ACEITOS}
                    className="hidden"
                    onChange={(e) => {
                      adicionar(e.target.files);
                      e.target.value = "";
                    }}
                  />
                </div>
                {arquivos.length > 0 && (
                  <div className="mt-3 flex flex-col gap-2">
                    {arquivos.map((a) => (
                      <div key={a.id} className="flex items-center gap-3 rounded-xl bg-white/[0.03] px-3 py-2.5 text-sm">
                        <span className="min-w-0 flex-1 truncate text-white">{a.file.name}</span>
                        <span className="text-xs text-zinc-400">{tamanhoLegivel(a.file.size)}</span>
                        <span className={`text-xs font-semibold ${a.estado === "erro" ? "text-rose-300" : a.estado === "enviando" ? "text-amber-300" : "text-zinc-400"}`}>
                          {a.estado === "erro" ? a.erro ?? "erro" : a.estado === "enviando" ? "enviando…" : "pronto"}
                        </span>
                        {!ocupado && (
                          <button type="button" onClick={() => setArquivos((x) => x.filter((y) => y.id !== a.id))} className="text-zinc-500 hover:text-white" title="Tirar">
                            ×
                          </button>
                        )}
                      </div>
                    ))}
                    <div>
                      <Botao onClick={enviarArquivos} disabled={!!ocupado || naFila.length === 0}>
                        {ocupado === "arquivos" ? "Enviando…" : `Enviar arquivos (${naFila.length})`}
                      </Botao>
                    </div>
                  </div>
                )}
              </>
            )}
          </Panel>

          <Panel eyebrow="Observações" title="Informações do caso">
            <p className="whitespace-pre-wrap text-sm text-zinc-300">{os.observacoes?.trim() || "Nenhuma observação."}</p>
            {editavel && (
              <div className="mt-4 flex flex-col gap-2">
                <textarea
                  className="gc-input min-h-[90px]"
                  placeholder="Complemento: cor, detalhes do caso, o que faltou informar…"
                  value={complemento}
                  onChange={(e) => setComplemento(e.target.value)}
                  disabled={!!ocupado}
                />
                <div>
                  <Botao variante="secundario" onClick={salvarComplemento} disabled={!!ocupado || !complemento.trim()}>
                    {ocupado === "complemento" ? "Salvando…" : "Salvar complemento"}
                  </Botao>
                </div>
              </div>
            )}
          </Panel>
        </div>

        <div className="flex flex-col gap-6 xl:sticky xl:top-8 xl:self-start">
          <Panel eyebrow="Resumo" title="Dados da OS">
            <dl className="grid gap-3 text-sm">
              <div><dt className="text-xs text-zinc-500">Status</dt><dd className="text-white">{editavel ? "Aguardando arquivos" : STATUS_LABEL[os.status]}</dd></div>
              <div><dt className="text-xs text-zinc-500">Dentes</dt><dd className="text-white">{os.dentes?.join(", ") || "—"}</dd></div>
              <div><dt className="text-xs text-zinc-500">Cor</dt><dd className="text-white">{os.cor_restauracao || "—"}</dd></div>
              <div><dt className="text-xs text-zinc-500">Prazo</dt><dd className="text-white">{dataBR(os.prazo_desejado)}</dd></div>
              <div><dt className="text-xs text-zinc-500">Valor estimado</dt><dd className="text-white">{os.valor_estimado != null ? brl(os.valor_estimado) : "a confirmar"}</dd></div>
              <div><dt className="text-xs text-zinc-500">Enviada em</dt><dd className="text-white">{dataBR(os.created_at)}</dd></div>
            </dl>
            {editavel && (
              <div className="mt-5 border-t border-white/10 pt-4">
                <button
                  type="button"
                  onClick={concluir}
                  disabled={!!ocupado}
                  className="w-full rounded-xl bg-emerald-500 px-4 py-3 text-sm font-bold text-white hover:bg-emerald-400 disabled:opacity-60"
                >
                  {ocupado === "concluir" ? "Liberando…" : "Enviei tudo — liberar para produção"}
                </button>
                <p className="mt-2 text-xs text-zinc-500">Depois de liberar, a OS não pode mais ser alterada por aqui.</p>
              </div>
            )}
          </Panel>
        </div>
      </div>
    </>
  );
}
