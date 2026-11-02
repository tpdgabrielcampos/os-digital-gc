"use client";

import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabaseClient";
import { PLATAFORMAS_ENVIO, TIPOS_TRABALHO } from "@/lib/types";
import OdontogramaSelector from "@/components/OdontogramaSelector";

type EstadoEnvio = "idle" | "enviando" | "sucesso" | "erro";

// Cada ordem de serviço (OS) pode ter vários serviços. No banco, cada serviço
// vira uma linha própria em "pedidos" (com status, prazo e cartão do Trello
// próprios), e todas as linhas da mesma OS compartilham o mesmo "os_id".
interface Servico {
  chave: string;
  tipoTrabalho: string;
  dentes: string[];
  material: string;
  cor: string;
  prazo: string;
}

function novoServico(): Servico {
  return {
    chave: crypto.randomUUID(),
    tipoTrabalho: TIPOS_TRABALHO[0],
    dentes: [],
    material: "",
    cor: "",
    prazo: "",
  };
}

const FUNDO_PAGINA =
  "min-h-screen bg-white bg-[url('/fundo.jpg')] bg-cover bg-center bg-no-repeat bg-fixed";

const CLASSE_INPUT =
  "rounded-md border border-slate-300 px-3 py-2 focus:border-navy focus:outline-none";

export default function NovoPedidoPage() {
  const [estado, setEstado] = useState<EstadoEnvio>("idle");
  const [erro, setErro] = useState<string | null>(null);
  const [fotos, setFotos] = useState<File[]>([]);
  const [servicos, setServicos] = useState<Servico[]>(() => [novoServico()]);

  function atualizarServico(chave: string, campos: Partial<Servico>) {
    setServicos((lista) => lista.map((s) => (s.chave === chave ? { ...s, ...campos } : s)));
  }

  function removerServico(chave: string) {
    setServicos((lista) => (lista.length > 1 ? lista.filter((s) => s.chave !== chave) : lista));
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErro(null);

    const form = e.currentTarget;
    const data = new FormData(form);

    // Bloqueio explícito de envio: além do "required" nativo dos campos de
    // texto, confere aqui de novo — cobre o odontograma, que não é um
    // <input> comum — e mostra exatamente o que falta preencher.
    const camposObrigatorios: [string, string][] = [
      ["paciente_nome", "Nome do paciente"],
      ["dentista_nome", "Seu nome"],
      ["quem_preencheu", "Quem preencheu"],
      ["plataforma_envio", "Plataforma de envio"],
    ];
    const faltando = camposObrigatorios
      .filter(([nomeCampo]) => !String(data.get(nomeCampo) ?? "").trim())
      .map(([, label]) => label);

    servicos.forEach((s, i) => {
      const rotulo = servicos.length > 1 ? ` (serviço ${i + 1})` : "";
      if (s.dentes.length === 0) {
        faltando.push(`Dentes envolvidos${rotulo} — marque pelo menos um dente no odontograma`);
      }
      if (!s.material.trim()) faltando.push(`Material desejado${rotulo}`);
      if (!s.cor.trim()) faltando.push(`Cor final da restauração${rotulo}`);
    });

    if (faltando.length > 0) {
      setErro(`Preencha os campos obrigatórios antes de enviar: ${faltando.join(", ")}.`);
      return;
    }

    setEstado("enviando");

    try {
      // Gera os ids no navegador em vez de pedir de volta do banco (.select()):
      // como o formulário é público, só liberamos permissão de CRIAR pedidos
      // pra quem não está logado, não de LER.
      const osId = crypto.randomUUID();
      const comum = {
        os_id: osId,
        paciente_nome: String(data.get("paciente_nome") ?? ""),
        dentista_nome: String(data.get("dentista_nome") ?? ""),
        quem_preencheu: String(data.get("quem_preencheu") ?? "").trim(),
        instalacao_agendada: (data.get("instalacao_agendada") as string) || null,
        plataforma_envio: (data.get("plataforma_envio") as string) || null,
        observacoes: (data.get("observacoes") as string) || null,
      };
      const linhas = servicos.map((s) => ({
        ...comum,
        id: crypto.randomUUID(),
        tipo_trabalho: s.tipoTrabalho,
        dentes: s.dentes,
        material: s.material.trim() || null,
        cor_restauracao: s.cor.trim() || null,
        prazo_desejado: s.prazo || null,
      }));
      const pedidoIds = linhas.map((l) => l.id);

      const { error: erroPedido } = await supabaseBrowser.from("pedidos").insert(linhas);
      if (erroPedido) throw erroPedido;

      // Upload das fotos (se houver) uma vez só, ligadas a todos os serviços da OS.
      for (const foto of fotos) {
        const caminho = `${osId}/${Date.now()}-${foto.name}`;
        const { error: erroUpload } = await supabaseBrowser.storage
          .from("pedido-fotos")
          .upload(caminho, foto);

        if (erroUpload) throw erroUpload;

        const { data: urlPublica } = supabaseBrowser.storage
          .from("pedido-fotos")
          .getPublicUrl(caminho);

        await supabaseBrowser
          .from("pedido_fotos")
          .insert(pedidoIds.map((pedidoId) => ({ pedido_id: pedidoId, url: urlPublica.publicUrl })));
      }

      // Para cada serviço: cria o cartão no Trello e envia a linha para a
      // planilha, em segundo plano. Se falhar, a OS já está salva mesmo assim.
      for (const pedidoId of pedidoIds) {
        fetch("/api/trello/criar-cartao", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pedidoId }),
          keepalive: true,
        }).catch(() => {});

        fetch("/api/planilha/enviar-pedido", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pedidoId }),
          keepalive: true,
        }).catch((e) => console.error("Falha ao enviar para a planilha:", e));
      }

      setEstado("sucesso");
      form.reset();
      setServicos([novoServico()]);
      setFotos([]);
    } catch (err) {
      console.error(err);
      setErro(`Não consegui enviar a ordem de serviço. Detalhe: ${mensagemDeErro(err)}`);
      setEstado("erro");
    }
  }

  // Extrai uma mensagem legível de qualquer tipo de erro. Erros do Supabase
  // (PostgrestError) não são instâncias de Error — são objetos simples com
  // uma propriedade "message" — então "String(err)" neles vira "[object
  // Object]" e esconde o motivo real da falha.
  function mensagemDeErro(err: unknown): string {
    if (err instanceof Error) return err.message;
    if (
      err &&
      typeof err === "object" &&
      "message" in err &&
      typeof (err as { message: unknown }).message === "string"
    ) {
      return (err as { message: string }).message;
    }
    try {
      return JSON.stringify(err);
    } catch {
      return String(err);
    }
  }

  if (estado === "sucesso") {
    return (
      <div className={FUNDO_PAGINA}>
        <main className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center gap-4 px-6 text-center">
          <div className="rounded-full bg-emerald-100 p-4 text-emerald-700">✓</div>
          <h1 className="text-2xl font-bold text-navy">Ordem de serviço enviada!</h1>
          <p className="text-slate-600">
            Recebemos os dados do caso. Vamos conferir os arquivos do paciente
            no DS Core e retornar assim que o trabalho for aceito.
          </p>
          <button
            onClick={() => setEstado("idle")}
            className="mt-4 rounded-lg bg-navy px-5 py-2.5 font-medium text-white hover:bg-navy/90"
          >
            Enviar outra ordem
          </button>
        </main>
      </div>
    );
  }

  return (
    <div className={FUNDO_PAGINA}>
      <main className="mx-auto max-w-2xl px-6 py-10">
        <div className="mb-6 flex justify-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo-gabriel-campos.png"
            alt="Gabriel Campos"
            className="w-40 sm:w-48"
          />
        </div>

        <div className="rounded-2xl bg-white/90 p-6 shadow-sm backdrop-blur-sm sm:p-8">
          <h1 className="text-2xl font-bold text-navy">Nova ordem de serviço</h1>
          <p className="mt-1 text-sm text-slate-600">
            Preencha os dados do caso. Os arquivos de escaneamento (.ply)
            continuam sendo enviados separadamente pelo DS Core.
          </p>

          <form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-6">
            <fieldset className="flex flex-col gap-4 rounded-lg border border-slate-200 bg-white p-4">
              <legend className="px-1 text-sm font-semibold text-navy">
                Dados do paciente
              </legend>
              <Campo label="Nome do paciente" name="paciente_nome" required />
            </fieldset>

            <fieldset className="flex flex-col gap-4 rounded-lg border border-slate-200 bg-white p-4">
              <legend className="px-1 text-sm font-semibold text-navy">
                Seus dados (dentista)
              </legend>
              <Campo label="Seu nome" name="dentista_nome" required />
              <Campo
                label="Quem preencheu"
                name="quem_preencheu"
                required
                placeholder="Nome de quem está preenchendo este pedido"
              />
            </fieldset>

            {servicos.map((s, i) => (
              <fieldset
                key={s.chave}
                className="flex min-w-0 flex-col gap-4 rounded-lg border border-slate-200 bg-white p-4"
              >
                <legend className="px-1 text-sm font-semibold text-navy">
                  {servicos.length > 1 ? `Serviço ${i + 1}` : "Trabalho a ser realizado"}
                </legend>

                {servicos.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removerServico(s.chave)}
                    className="self-end text-xs font-medium text-rose-600 hover:underline"
                  >
                    Remover este serviço
                  </button>
                )}

                <label className="flex flex-col gap-1 text-sm">
                  <span className="font-medium text-slate-700">Tipo de trabalho</span>
                  <select
                    value={s.tipoTrabalho}
                    onChange={(e) => atualizarServico(s.chave, { tipoTrabalho: e.target.value })}
                    className={CLASSE_INPUT}
                  >
                    {TIPOS_TRABALHO.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </label>

                <div>
                  <span className="mb-1 block text-sm font-medium text-slate-700">
                    Dentes envolvidos <span className="text-rose-500">*</span>
                  </span>
                  <OdontogramaSelector
                    selecionados={s.dentes}
                    onChange={(dentes) => atualizarServico(s.chave, { dentes })}
                  />
                </div>

                <CampoControlado
                  label="Material desejado"
                  required
                  placeholder="Ex: Zircônia, e.max, PMMA..."
                  value={s.material}
                  onChange={(material) => atualizarServico(s.chave, { material })}
                />
                <CampoControlado
                  label="Cor final da restauração"
                  required
                  placeholder="Ex: A2, A3.5, BL2..."
                  value={s.cor}
                  onChange={(cor) => atualizarServico(s.chave, { cor })}
                />
                <CampoControlado
                  label="Prazo desejado"
                  type="date"
                  value={s.prazo}
                  onChange={(prazo) => atualizarServico(s.chave, { prazo })}
                />
              </fieldset>
            ))}

            <button
              type="button"
              onClick={() => setServicos((lista) => [...lista, novoServico()])}
              className="rounded-lg border-2 border-dashed border-navy/40 px-4 py-3 text-sm font-semibold text-navy hover:bg-navy/5"
            >
              + Adicionar outro serviço para este paciente
            </button>

            <fieldset className="flex flex-col gap-4 rounded-lg border border-slate-200 bg-white p-4">
              <legend className="px-1 text-sm font-semibold text-navy">
                Informações gerais
              </legend>
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium text-slate-700">
                  Plataforma de envio <span className="text-rose-500">*</span>
                </span>
                <select
                  name="plataforma_envio"
                  required
                  defaultValue=""
                  className={CLASSE_INPUT}
                >
                  <option value="" disabled>
                    Selecione...
                  </option>
                  {PLATAFORMAS_ENVIO.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </label>
              <Campo
                label="Data da instalação agendada"
                name="instalacao_agendada"
                type="date"
              />
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium text-slate-700">Observações</span>
                <textarea
                  name="observacoes"
                  rows={3}
                  className={CLASSE_INPUT}
                  placeholder="Detalhes do caso, cor, instruções específicas..."
                />
              </label>
            </fieldset>

            <fieldset className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-4">
              <legend className="px-1 text-sm font-semibold text-navy">
                Fotos (opcional)
              </legend>
              <input
                type="file"
                accept="image/*"
                multiple
                onChange={(e) => setFotos(Array.from(e.target.files ?? []))}
                className="text-sm"
              />
              {fotos.length > 0 && (
                <p className="text-xs text-slate-500">
                  {fotos.length} foto(s) selecionada(s)
                </p>
              )}
            </fieldset>

            {erro && (
              <p className="rounded-md bg-rose-50 px-4 py-3 text-sm text-rose-700">
                {erro}
              </p>
            )}

            <button
              type="submit"
              disabled={estado === "enviando"}
              className="rounded-lg bg-navy px-6 py-3 font-semibold text-white shadow-sm transition hover:bg-navy/90 disabled:opacity-60"
            >
              {estado === "enviando"
                ? "Enviando..."
                : servicos.length > 1
                  ? `Enviar ordem de serviço (${servicos.length} serviços)`
                  : "Enviar ordem de serviço"}
            </button>
          </form>
        </div>
      </main>
    </div>
  );
}

function Campo({
  label,
  name,
  type = "text",
  required = false,
  placeholder,
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  placeholder?: string;
}) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="font-medium text-slate-700">
        {label} {required && <span className="text-rose-500">*</span>}
      </span>
      <input
        type={type}
        name={name}
        required={required}
        placeholder={placeholder}
        className={CLASSE_INPUT}
      />
    </label>
  );
}

function CampoControlado({
  label,
  value,
  onChange,
  type = "text",
  required = false,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (valor: string) => void;
  type?: string;
  required?: boolean;
  placeholder?: string;
}) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="font-medium text-slate-700">
        {label} {required && <span className="text-rose-500">*</span>}
      </span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        placeholder={placeholder}
        className={CLASSE_INPUT}
      />
    </label>
  );
}
