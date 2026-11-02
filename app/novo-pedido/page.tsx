"use client";

import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabaseClient";
import { PLATAFORMAS_ENVIO } from "@/lib/types";
import { SEPARADOR, ehPontico, materialDoCaminho, pedeCor } from "@/lib/catalogo";
import OdontogramaTrabalhos, { COR_CATEGORIA, Marcacoes } from "@/components/OdontogramaTrabalhos";

type EstadoEnvio = "idle" | "enviando" | "sucesso" | "erro";

// Cada ordem de serviço (OS) pode ter vários serviços. O dentista marca no
// odontograma o trabalho de cada dente; dentes com o mesmo trabalho viram um
// serviço só (uma linha em "pedidos", com status, prazo e cartão do Trello
// próprios). Todas as linhas da mesma OS compartilham o mesmo "os_id".
// A cor final e o prazo valem para o caso inteiro (todos os serviços da OS);
// só o "É retrabalho" é marcado serviço por serviço.
interface Detalhe {
  retrabalho: boolean;
}

const DETALHE_VAZIO: Detalhe = { retrabalho: false };

const ORDEM_DENTES = [
  "18", "17", "16", "15", "14", "13", "12", "11",
  "21", "22", "23", "24", "25", "26", "27", "28",
  "48", "47", "46", "45", "44", "43", "42", "41",
  "31", "32", "33", "34", "35", "36", "37", "38",
];

interface Grupo {
  chave: string;
  caminho: string[];
  dentes: string[];
}

/** Junta os dentes que receberam o mesmo trabalho. */
function agruparMarcacoes(marcacoes: Marcacoes): Grupo[] {
  const grupos: Grupo[] = [];
  for (const dente of ORDEM_DENTES) {
    const caminho = marcacoes[dente];
    if (!caminho) continue;
    const chave = caminho.join(SEPARADOR);
    const g = grupos.find((x) => x.chave === chave);
    if (g) g.dentes.push(dente);
    else grupos.push({ chave, caminho, dentes: [dente] });
  }
  return grupos;
}

const FUNDO_PAGINA =
  "min-h-screen bg-white bg-[url('/fundo.jpg')] bg-cover bg-center bg-no-repeat bg-fixed";

const CLASSE_INPUT =
  "rounded-md border border-slate-300 px-3 py-2 focus:border-navy focus:outline-none";

export default function NovoPedidoPage() {
  const [estado, setEstado] = useState<EstadoEnvio>("idle");
  const [erro, setErro] = useState<string | null>(null);
  const [fotos, setFotos] = useState<File[]>([]);
  const [marcacoes, setMarcacoes] = useState<Marcacoes>({});
  const [detalhes, setDetalhes] = useState<Record<string, Detalhe>>({});
  const [corCaso, setCorCaso] = useState("");
  const [prazoCaso, setPrazoCaso] = useState("");
  const grupos = agruparMarcacoes(marcacoes);
  // A cor do caso vale para PSI/PSD/Ajuste de cor (e o pôntico segue ela).
  const usaCor = (c: string[]) => pedeCor(c) || ehPontico(c);
  const casoPedeCor = grupos.some((g) => usaCor(g.caminho));

  function detalheDe(chave: string): Detalhe {
    return detalhes[chave] ?? DETALHE_VAZIO;
  }

  function atualizarDetalhe(chave: string, campos: Partial<Detalhe>) {
    setDetalhes((d) => ({ ...d, [chave]: { ...(d[chave] ?? DETALHE_VAZIO), ...campos } }));
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

    if (grupos.length === 0) {
      faltando.push("Trabalho — clique num dente do odontograma e escolha o trabalho");
    }
    if (casoPedeCor && !corCaso.trim()) {
      faltando.push("Cor final do caso");
    }

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
      const linhas = grupos.map((g) => {
        const d = detalheDe(g.chave);
        return {
          ...comum,
          id: crypto.randomUUID(),
          tipo_trabalho: g.chave + (d.retrabalho ? " (Retrabalho)" : ""),
          dentes: g.dentes,
          material: materialDoCaminho(g.caminho),
          cor_restauracao: usaCor(g.caminho) ? corCaso.trim() || null : null,
          prazo_desejado: prazoCaso || null,
        };
      });
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
      setMarcacoes({});
      setDetalhes({});
      setCorCaso("");
      setPrazoCaso("");
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

            <fieldset className="flex min-w-0 flex-col gap-4 rounded-lg border border-slate-200 bg-white p-4">
              <legend className="px-1 text-sm font-semibold text-navy">
                Trabalho a ser realizado
              </legend>

              <div>
                <span className="mb-1 block text-sm font-medium text-slate-700">
                  Dentes e trabalhos <span className="text-rose-500">*</span>
                </span>
                <OdontogramaTrabalhos marcacoes={marcacoes} onChange={setMarcacoes} />
              </div>

              {grupos.length === 0 ? (
                <p className="text-sm text-slate-500">Nenhum trabalho marcado ainda.</p>
              ) : (
                <div className="flex flex-col gap-3">
                  {grupos.map((g) => {
                    const d = detalheDe(g.chave);
                    const cor = COR_CATEGORIA[g.caminho[0]] ?? "";
                    return (
                      <div key={g.chave} className="rounded-lg border border-slate-200 p-3">
                        <div className="flex items-start gap-2">
                          <span className={`mt-1 inline-block h-3 w-3 shrink-0 rounded-full border ${cor}`} />
                          <div>
                            <p className="text-sm font-semibold text-slate-800">{g.chave}</p>
                            <p className="text-xs text-slate-500">
                              {g.dentes.length === 1 ? "Dente" : "Dentes"} {g.dentes.join(", ")}
                            </p>
                          </div>
                        </div>
                        <label className="mt-3 flex items-center gap-2 text-sm text-slate-700">
                          <input
                            type="checkbox"
                            checked={d.retrabalho}
                            onChange={(e) => atualizarDetalhe(g.chave, { retrabalho: e.target.checked })}
                          />
                          É retrabalho
                        </label>
                      </div>
                    );
                  })}
                </div>
              )}

              {grupos.length > 0 && (
                <div className="grid gap-3 rounded-lg bg-slate-50 p-3 sm:grid-cols-2">
                  {casoPedeCor && (
                    <CampoControlado
                      label="Cor final do caso"
                      required
                      placeholder="Ex: A2, A3.5, BL2..."
                      value={corCaso}
                      onChange={setCorCaso}
                    />
                  )}
                  <CampoControlado
                    label="Prazo desejado"
                    type="date"
                    value={prazoCaso}
                    onChange={setPrazoCaso}
                  />
                </div>
              )}
            </fieldset>

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
                : grupos.length > 1
                  ? `Enviar ordem de serviço (${grupos.length} serviços)`
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
