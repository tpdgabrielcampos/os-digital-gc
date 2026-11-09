"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import PortalShell, { useDentista } from "@/components/gc/PortalShell";
import OdontogramaTrabalhos, { COR_CATEGORIA, type Marcacoes } from "@/components/OdontogramaTrabalhos";
import { Botao, I, PageHeader, Panel } from "@/components/gc/ui";
import { supabaseBrowser } from "@/lib/supabaseClient";
import { ehPontico, materialDoCaminho, nomeUnidade, pedeCor, prazoMinimoDias } from "@/lib/catalogo";
import { ORDEM_DENTES, agruparMarcacoes } from "@/lib/odontograma";
import { orcamento } from "@/lib/precos";
import { MAX_ARQUIVO, brl, numeroOS, tamanhoLegivel } from "@/lib/gc";
import { ACEITOS, acaoOS, enviarArquivoOS, mensagemDeErro } from "@/lib/arquivosOS";
import AssistenteVoz, { estadoParaMarcacoes } from "@/components/gc/AssistenteVoz";
import type { EstadoVoz } from "@/lib/voz";

const PREF_VOZ = "gc-assistente-voz";

// WhatsApp do laboratório (com DDI e DDD, só números) para confirmar casos de urgência.
const WHATSAPP_LAB = (process.env.NEXT_PUBLIC_WHATSAPP_LAB || "5551997031706").replace(/\D/g, "");

function linkUrgencia(numero: string, paciente: string) {
  const texto = `⚠️ URGÊNCIA — Olá, Gabriel! Acabei de enviar a OS ${numero} (paciente ${paciente}) marcada como urgência. Podemos combinar a data de entrega?`;
  return `https://wa.me/${WHATSAPP_LAB}?text=${encodeURIComponent(texto)}`;
}

export default function NovaOSPage() {
  return (
    <PortalShell ativo="/portal/nova">
      <NovaOS />
    </PortalShell>
  );
}

const SEPARADOR_TRABALHOS = " + ";

type EstadoArquivo = "fila" | "enviando" | "enviado" | "erro";
interface Arq {
  id: string;
  file: File;
  estado: EstadoArquivo;
  erro?: string;
}


/** Data (AAAA-MM-DD, no fuso do aparelho) daqui a N dias corridos. */
function dataDaquiA(dias: number) {
  const d = new Date();
  d.setDate(d.getDate() + dias);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const dataBRCurta = (iso: string) => iso.split("-").reverse().join("/");


function NovaOS() {
  const { sessao, dentista, nomeTabela } = useDentista();
  const [paciente, setPaciente] = useState("");
  const [prazo, setPrazo] = useState("");
  const [urgente, setUrgente] = useState(false);
  const [arquivosDepois, setArquivosDepois] = useState(false);
  const [corCaso, setCorCaso] = useState("");
  const [observacoes, setObservacoes] = useState("");
  const [marcacoes, setMarcacoes] = useState<Marcacoes>({});
  const [retrabalho, setRetrabalho] = useState<Record<string, boolean>>({});
  const [arquivos, setArquivos] = useState<Arq[]>([]);
  const [precos, setPrecos] = useState<Record<string, number>>({});
  const [estado, setEstado] = useState<"editando" | "enviando" | "pronto">("editando");
  const [erro, setErro] = useState<string | null>(null);
  const [resultado, setResultado] = useState<{ id: string; numero: number | null; falhas: number; urgente: boolean; aguardando: boolean } | null>(null);
  const [arrastando, setArrastando] = useState(false);
  const inputArquivo = useRef<HTMLInputElement>(null);
  const painelArquivos = useRef<HTMLDivElement>(null);
  const [vozAberta, setVozAberta] = useState(false);
  const [sempreVoz, setSempreVoz] = useState(false);
  const [preenchidoPorVoz, setPreenchidoPorVoz] = useState(false);

  // Preferência do dentista: abrir o assistente por voz sempre que entrar na Nova OS.
  useEffect(() => {
    try {
      if (localStorage.getItem(PREF_VOZ) === "1") {
        setSempreVoz(true);
        setVozAberta(true);
      }
    } catch {}
  }, []);

  function mudarSempreVoz(v: boolean) {
    setSempreVoz(v);
    try {
      localStorage.setItem(PREF_VOZ, v ? "1" : "0");
    } catch {}
  }

  function estadoAtual(): EstadoVoz {
    return {
      paciente,
      trabalhos: agruparMarcacoes(marcacoes).map((g) => ({ servico: g.chave, dentes: g.dentes, retrabalho: !!retrabalho[g.chave] })),
      cor: corCaso,
      prazo,
      instalacao: "",
      observacoes,
      urgente,
    };
  }

  function aplicarVoz(e: EstadoVoz) {
    setPaciente(e.paciente);
    setMarcacoes(estadoParaMarcacoes(e));
    setRetrabalho(Object.fromEntries(e.trabalhos.filter((t) => t.retrabalho).map((t) => [t.servico, true])));
    setCorCaso(e.cor);
    setPrazo(e.prazo);
    if (e.urgente) setUrgente(true);
    setObservacoes(e.observacoes);
    setPreenchidoPorVoz(true);
    setTimeout(() => {
      setVozAberta(false);
      painelArquivos.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 2500);
  }

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
  // Prazo mínimo do caso = o maior prazo mínimo entre os trabalhos marcados.
  const diasMinimos = grupos.length ? Math.max(...grupos.map((g) => prazoMinimoDias(g.caminho))) : 0;
  const prazoMinimo = dataDaquiA(diasMinimos);
  // Urgência: sem data obrigatória — o prazo é combinado com o laboratório pelo WhatsApp.
  const prazoCurto = !urgente && !!prazo && grupos.length > 0 && prazo < prazoMinimo;
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
    if (!urgente && !prazo) faltando.push("data de entrega (ou marque “É urgência”)");
    if (prazoCurto) {
      setErro(`O prazo mínimo para esse caso é ${dataBRCurta(prazoMinimo)} (${diasMinimos} ${diasMinimos > 1 ? "dias" : "dia"}). Escolha essa data ou uma depois.`);
      return;
    }
    if (faltando.length) {
      setErro(`Falta preencher: ${faltando.join(", ")}.`);
      return;
    }

    // Urgência: abre a aba do WhatsApp já no clique (senão o navegador bloqueia)
    // e só coloca o link depois que a OS foi criada, com o número dela.
    let abaWhats: Window | null = null;
    if (urgente) {
      try { abaWhats = window.open("", "_blank"); } catch { abaWhats = null; }
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

      const dadosOS = {
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
          prazo_desejado: urgente ? null : prazo || null,
          plataforma_envio: enviaveis.length ? "Portal GC" : null,
          observacoes: observacoes.trim() || null,
          valor_estimado: temPrecos ? orc.total : null,
      };
      const inserir = (d: Record<string, unknown>) => supabaseBrowser.from("pedidos").insert(d).select("id, numero").single();
      const extras: Record<string, unknown> = {};
      if (urgente) extras.urgente = true;
      if (arquivosDepois) extras.aguardando_arquivos = true;
      let { data: pedido, error } = await inserir({ ...dadosOS, ...extras });
      if (error && /urgente|aguardando_arquivos/i.test(error.message)) {
        // banco ainda sem essas colunas: marca nas observações
        const marcas = [urgente ? "⚠️ URGENTE — confirmar data." : "", arquivosDepois ? "⏳ AGUARDANDO ARQUIVOS." : ""].filter(Boolean).join(" ");
        ({ data: pedido, error } = await inserir({ ...dadosOS, observacoes: `${marcas} ${dadosOS.observacoes ?? ""}`.trim() }));
      }
      if (error || !pedido) throw error ?? new Error("Não consegui criar a OS.");

      // Arquivos: um por vez, para não estourar a internet de quem envia.
      let falhas = 0;
      for (const a of enviaveis) {
        marcarArq(a.id, { estado: "enviando" });
        const r = await enviarArquivoOS({ file: a.file, dentistaId: dentista.id, pedidoId: pedido.id, token: sessao.access_token });
        if (r.ok) marcarArq(a.id, { estado: "enviado" });
        else {
          falhas++;
          marcarArq(a.id, { estado: "erro", erro: r.erro });
        }
      }
      // Algum arquivo não subiu: deixa a OS aberta para ele reenviar pela tela da OS.
      let aguardando = arquivosDepois;
      if (falhas > 0 && !arquivosDepois) {
        aguardando = await acaoOS(pedido.id, sessao.access_token, { acao: "pendente" }).then(() => true).catch(() => false);
      }

      for (const rota of ["/api/planilha/enviar-pedido"]) {
        fetch(rota, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pedidoId: pedido.id }),
          keepalive: true,
        }).catch(() => {});
      }

      if (abaWhats) {
        try { abaWhats.location.href = linkUrgencia(numeroOS(pedido.numero), paciente); } catch { /* fica o botão */ }
      }
      setResultado({ id: pedido.id, numero: pedido.numero, falhas, urgente, aguardando });
      setEstado("pronto");
    } catch (err) {
      try { abaWhats?.close(); } catch { /* ok */ }
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
        {resultado.aguardando && (
          <div className="mt-6 rounded-2xl border border-amber-400/40 bg-amber-500/10 p-4 text-left">
            <p className="font-semibold text-amber-200">⏳ OS aguardando arquivos</p>
            <p className="mt-1 text-sm text-zinc-300">
              O caso só entra em produção quando todas as informações e arquivos forem enviados. Quando tiver tudo, abra a OS e
              anexe o que falta.
            </p>
            <a
              href={`/portal/os/${resultado.id}`}
              className="mt-3 inline-flex items-center gap-2 rounded-xl bg-amber-500 px-4 py-2.5 text-sm font-bold text-black hover:bg-amber-400"
            >
              Abrir a OS para completar
            </a>
          </div>
        )}
        {resultado.urgente && (
          <div className="mt-6 rounded-2xl border border-rose-400/40 bg-rose-500/10 p-4 text-left">
            <p className="font-semibold text-rose-200">⚠️ Caso marcado como urgência</p>
            <p className="mt-1 text-sm text-zinc-300">
              Avise o laboratório pelo WhatsApp para combinar a data de entrega. Se o WhatsApp não abriu sozinho, toque no botão:
            </p>
            <a
              href={linkUrgencia(numeroOS(resultado.numero), paciente)}
              target="_blank"
              rel="noreferrer"
              className="mt-3 inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-bold text-white hover:bg-emerald-400"
            >
              Avisar o laboratório no WhatsApp
            </a>
          </div>
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
    <>
    {vozAberta && (
      <AssistenteVoz
        token={sessao.access_token}
        precos={precos}
        inicial={estadoAtual()}
        onAplicar={aplicarVoz}
        onFechar={() => setVozAberta(false)}
      />
    )}
    <form onSubmit={enviar} className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Nova ordem de serviço"
        title="Enviar um caso"
        subtitle="Marque os dentes, escolha o trabalho e anexe os arquivos. Você vê o valor estimado antes de enviar."
        actions={
          <div className="flex flex-col items-start gap-2 sm:items-end">
            <Botao onClick={() => setVozAberta(true)} disabled={enviando}>
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></svg>
              Preencher por voz
            </Botao>
            <label className="flex items-center gap-2 text-xs text-zinc-400">
              <input type="checkbox" checked={sempreVoz} onChange={(e) => mudarSempreVoz(e.target.checked)} />
              Sempre abrir o assistente por voz
            </label>
          </div>
        }
      />
      {preenchidoPorVoz && (
        <p className="rounded-xl bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
          Preenchido pelo assistente por voz. Confira os dados, anexe os arquivos e toque em “Enviar ordem de serviço”.
        </p>
      )}

      <div className="grid gap-6 xl:grid-cols-[1.6fr_1fr]">
        <div className="flex min-w-0 flex-col gap-6">
          <Panel eyebrow="Paciente" title="Dados do caso">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="flex flex-col gap-1.5 text-sm text-zinc-300 sm:col-span-2">
                Nome do paciente *
                <input className="gc-input" value={paciente} onChange={(e) => setPaciente(e.target.value)} disabled={enviando} />
              </label>
              <label className="flex flex-col gap-1.5 text-sm text-zinc-300 sm:col-span-2">
                {urgente ? "Data de entrega" : "Data de entrega *"}
                <input
                  type="date"
                  className={`gc-input [color-scheme:dark] ${prazoCurto ? "!border-rose-400/70" : ""}`}
                  value={urgente ? "" : prazo}
                  min={grupos.length ? prazoMinimo : dataDaquiA(0)}
                  onChange={(e) => setPrazo(e.target.value)}
                  disabled={enviando || urgente}
                />
                <span className={`text-xs ${prazoCurto ? "text-rose-300" : "text-zinc-500"}`}>
                  {urgente
                    ? "Urgência: a data será combinada com o laboratório pelo WhatsApp."
                    : grupos.length
                    ? `Entrega a partir de ${dataBRCurta(prazoMinimo)} (prazo mínimo de ${diasMinimos} ${diasMinimos > 1 ? "dias corridos" : "dia"} para este caso)`
                    : "Prazos mínimos: Design 2 dias (IBAR 1 dia) · demais trabalhos 7 dias corridos"}
                </span>
              </label>
              <label className={`flex cursor-pointer items-start gap-3 rounded-xl border px-4 py-3 text-sm sm:col-span-2 ${urgente ? "border-rose-400/50 bg-rose-500/10 text-rose-100" : "border-white/10 text-zinc-300"}`}>
                <input type="checkbox" className="mt-1" checked={urgente} onChange={(e) => setUrgente(e.target.checked)} disabled={enviando} />
                <span>
                  <strong>⚠️ É urgência</strong>
                  <span className="block text-xs text-zinc-400">Não precisa escolher data. Ao enviar, abre o WhatsApp do laboratório para combinar o prazo.</span>
                </span>
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

          <div ref={painelArquivos} />
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
            <label className={`mt-4 flex cursor-pointer items-start gap-3 rounded-xl border px-4 py-3 text-sm ${arquivosDepois ? "border-amber-400/50 bg-amber-500/10 text-amber-100" : "border-white/10 text-zinc-300"}`}>
              <input type="checkbox" className="mt-1" checked={arquivosDepois} onChange={(e) => setArquivosDepois(e.target.checked)} disabled={enviando} />
              <span>
                <strong>⏳ Envio os arquivos depois</strong>
                <span className="block text-xs text-zinc-400">
                  {arquivosDepois
                    ? "Atenção: o caso só entra em produção quando todas as informações e arquivos forem enviados. Depois é só abrir a OS em “Minhas OS” e anexar o que falta."
                    : "Ainda não tem o escaneamento? Marque aqui e complete a OS depois, pelo celular ou computador."}
                </span>
              </span>
            </label>
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
                        {i.quantidade} {nomeUnidade(i.unidade, i.quantidade)}
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
    </>
  );
}
