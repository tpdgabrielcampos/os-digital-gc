"use client";

import { useEffect, useRef, useState } from "react";
import { Botao, PageHeader, Panel } from "@/components/gc/ui";

// Painel do laboratório: escolhe a voz e o jeito do assistente por voz.
// Vale para todos os dentistas (eles só podem ligar/desligar o som).

interface Config {
  provedor: "navegador" | "elevenlabs";
  voz_id: string | null;
  voz_nome: string | null;
  modelo: string;
  velocidade: number;
  estabilidade: number;
  estilo: number;
  pausa: number;
}
interface Voz {
  id: string;
  nome: string;
  categoria: string;
  descricao: string;
  amostra: string | null;
}

const MODELOS = [
  { id: "eleven_v4", nome: "Eleven v4 — o mesmo do site da ElevenLabs (recomendado)" },
  { id: "eleven_multilingual_v2", nome: "Multilingual v2 — melhor qualidade em português" },
  { id: "eleven_flash_v2_5", nome: "Flash v2.5 — mais rápida, gasta metade dos créditos" },
  { id: "eleven_v3", nome: "v3 — a mais expressiva (um pouco mais lenta)" },
];

const CATEGORIA: Record<string, string> = {
  cloned: "Clonada (sua)",
  generated: "Criada por você",
  professional: "Clonagem profissional",
  premade: "Padrão ElevenLabs",
};

const FRASE_TESTE = "E aí, tudo certo? Bora montar essa OS. Qual o nome do paciente?";

export default function ConfigVoz() {
  const [config, setConfig] = useState<Config | null>(null);
  const [vozes, setVozes] = useState<Voz[]>([]);
  const [temChave, setTemChave] = useState(false);
  const [erroVozes, setErroVozes] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [testando, setTestando] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);
  const [fraseTeste, setFraseTeste] = useState(FRASE_TESTE);
  const audio = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    fetch("/api/admin/voz", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (!j.ok) throw new Error(j.erro);
        // Primeira vez (nada salvo ainda): já sugere o mesmo jeito do site da ElevenLabs.
        const c = j.config as Config;
        setConfig(c.voz_id ? c : { ...c, modelo: "eleven_v4", estabilidade: 0.5, estilo: 0 });
        setVozes(j.vozes ?? []);
        setTemChave(!!j.temChave);
        setErroVozes(j.erroVozes ?? null);
      })
      .catch((e) => setMsg({ ok: false, texto: String(e.message || e) }));
  }, []);

  if (!config) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader eyebrow="Assistente por voz" title="Voz do assistente" />
        <Panel>{msg ? <p className="text-sm text-rose-300">{msg.texto}</p> : <p className="text-sm text-zinc-400">Carregando…</p>}</Panel>
      </div>
    );
  }

  const set = (c: Partial<Config>) => setConfig((x) => (x ? { ...x, ...c } : x));
  const premium = config.provedor === "elevenlabs";

  async function salvar() {
    if (!config) return;
    setSalvando(true);
    setMsg(null);
    const r = await fetch("/api/admin/voz", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(config) });
    const j = await r.json().catch(() => ({ ok: false, erro: "falha ao salvar" }));
    setSalvando(false);
    setMsg(j.ok ? { ok: true, texto: "Salvo! Vale para todos os dentistas a partir da próxima OS." } : { ok: false, texto: j.erro });
  }

  async function testar() {
    if (!config) return;
    audio.current?.pause();
    window.speechSynthesis?.cancel();
    setMsg(null);
    if (!premium) {
      const u = new SpeechSynthesisUtterance(fraseTeste);
      u.lang = "pt-BR";
      const v = window.speechSynthesis.getVoices().find((x) => /google/i.test(x.name) && /pt-br/i.test(x.lang)) || window.speechSynthesis.getVoices().find((x) => /pt-br/i.test(x.lang));
      if (v) u.voice = v;
      u.rate = config.velocidade;
      window.speechSynthesis.speak(u);
      return;
    }
    if (!config.voz_id) {
      setMsg({ ok: false, texto: "Escolha uma voz primeiro." });
      return;
    }
    setTestando(true);
    const r = await fetch("/api/voz/falar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ texto: fraseTeste, teste: config }),
    });
    setTestando(false);
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      setMsg({ ok: false, texto: j.erro || `Erro ${r.status}` });
      return;
    }
    const url = URL.createObjectURL(await r.blob());
    audio.current = new Audio(url);
    audio.current.play();
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Assistente por voz"
        title="Voz do assistente"
        subtitle="O jeito que o assistente fala com os dentistas na Nova OS. Vale para todos — eles só conseguem ligar ou desligar o som."
        actions={<Botao onClick={salvar} disabled={salvando}>{salvando ? "Salvando…" : "Salvar ajustes"}</Botao>}
      />

      {msg && <p className={`rounded-xl px-4 py-3 text-sm ${msg.ok ? "bg-emerald-500/10 text-emerald-200" : "bg-rose-500/10 text-rose-200"}`}>{msg.texto}</p>}

      <div className="grid gap-6 xl:grid-cols-[1.5fr_1fr]">
        <div className="flex min-w-0 flex-col gap-6">
          <Panel eyebrow="Tipo de voz" title="De onde vem a voz">
            <div className="grid gap-3 sm:grid-cols-2">
              {[
                { id: "navegador", t: "Voz do navegador", d: "Grátis. Usa a voz do celular/computador do dentista (mais robótica)." },
                { id: "elevenlabs", t: "Voz premium (ElevenLabs)", d: "Natural e exclusiva. Usa os créditos da sua conta ElevenLabs." },
              ].map((o) => (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => set({ provedor: o.id as Config["provedor"] })}
                  className={`rounded-2xl border p-4 text-left transition ${config.provedor === o.id ? "border-pink-300/60 bg-pink-400/10" : "border-white/10 bg-white/[0.02] hover:border-white/25"}`}
                >
                  <p className="font-semibold text-white">{o.t}</p>
                  <p className="mt-1 text-sm text-zinc-400">{o.d}</p>
                </button>
              ))}
            </div>
            {premium && !temChave && (
              <p className="mt-4 rounded-xl bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
                Falta a chave: crie uma API key na ElevenLabs e cadastre no Vercel como <code>ELEVENLABS_API_KEY</code>. Enquanto isso, os dentistas ouvem a voz do navegador.
              </p>
            )}
            {erroVozes && <p className="mt-4 rounded-xl bg-rose-500/10 px-3 py-2 text-sm text-rose-200">{erroVozes}</p>}
          </Panel>

          {premium && temChave && (
            <Panel eyebrow="ElevenLabs" title="Escolha a voz" badge={vozes.length ? `${vozes.length} vozes na sua conta` : undefined}>
              {vozes.length === 0 ? (
                <p className="text-sm text-zinc-400">Nenhuma voz encontrada na sua conta.</p>
              ) : (
                <div className="flex max-h-[420px] flex-col gap-2 overflow-y-auto pr-1">
                  {vozes.map((v) => (
                    <label
                      key={v.id}
                      className={`flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 ${config.voz_id === v.id ? "bg-pink-400/10 ring-1 ring-pink-300/40" : "bg-white/[0.03] hover:bg-white/[0.06]"}`}
                    >
                      <input type="radio" name="voz" checked={config.voz_id === v.id} onChange={() => set({ voz_id: v.id, voz_nome: v.nome })} />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold text-white">{v.nome}</span>
                        <span className="block truncate text-xs text-zinc-400">
                          {CATEGORIA[v.categoria] ?? v.categoria}
                          {v.descricao ? ` · ${v.descricao}` : ""}
                        </span>
                      </span>
                      {v.amostra && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            audio.current?.pause();
                            audio.current = new Audio(v.amostra!);
                            audio.current.play();
                          }}
                          className="gc-chip"
                        >
                          Amostra
                        </button>
                      )}
                    </label>
                  ))}
                </div>
              )}
              <p className="mt-4 text-xs text-zinc-500">
                A amostra é em inglês. Para ouvir a voz em português, use “Testar” ao lado. Para soar igual ao site da ElevenLabs: modelo Eleven v4, expressividade 50% e estilo 0%. Para uma voz exclusiva: na ElevenLabs, crie em <strong>Voices → Create a Voice</strong> (Voice Design ou clone da sua voz). Ela aparece aqui sozinha.
              </p>
            </Panel>
          )}
        </div>

        <div className="flex flex-col gap-6 xl:sticky xl:top-8 xl:self-start">
          <Panel eyebrow="Jeito de falar" title="Ajustes">
            <div className="flex flex-col gap-5">
              {premium && (
                <label className="flex flex-col gap-1.5 text-sm text-zinc-300">
                  Modelo
                  <select className="gc-input" value={config.modelo} onChange={(e) => set({ modelo: e.target.value })}>
                    {MODELOS.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.nome}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <label className="flex flex-col gap-1.5 text-sm text-zinc-300">
                Velocidade: {config.velocidade.toFixed(2)}x
                <input type="range" min={premium ? 0.7 : 0.8} max={premium ? 1.2 : 1.4} step={0.05} value={config.velocidade} onChange={(e) => set({ velocidade: Number(e.target.value) })} className="accent-[#e0649c]" />
              </label>
              {premium && (
                <>
                  <label className="flex flex-col gap-1.5 text-sm text-zinc-300">
                    Expressividade: {Math.round((1 - config.estabilidade) * 100)}%
                    <input type="range" min={0} max={1} step={0.05} value={1 - config.estabilidade} onChange={(e) => set({ estabilidade: 1 - Number(e.target.value) })} className="accent-[#e0649c]" />
                    <span className="text-xs text-zinc-500">Mais = fala mais solta e variada. Menos = mais certinha e constante.</span>
                  </label>
                  <label className="flex flex-col gap-1.5 text-sm text-zinc-300">
                    Estilo: {Math.round(config.estilo * 100)}%
                    <input type="range" min={0} max={1} step={0.05} value={config.estilo} onChange={(e) => set({ estilo: Number(e.target.value) })} className="accent-[#e0649c]" />
                    <span className="text-xs text-zinc-500">Exagera o jeito característico da voz. Acima de 50% pode soar caricato.</span>
                  </label>
                </>
              )}
              <div className="flex flex-col gap-1.5 text-sm text-zinc-300">
                Esperar o dentista terminar de falar
                <div className="gc-tabs">
                  {[
                    [900, "Rápido"],
                    [1300, "Normal"],
                    [2200, "Calmo"],
                  ].map(([ms, nome]) => (
                    <button key={ms} type="button" onClick={() => set({ pausa: ms as number })} className={`gc-tab flex-1 ${config.pausa === ms ? "gc-tab-ativa" : ""}`}>
                      {nome}
                    </button>
                  ))}
                </div>
                <span className="text-xs text-zinc-500">Tempo de silêncio antes de o assistente seguir para a próxima pergunta.</span>
              </div>
            </div>
          </Panel>

          <Panel eyebrow="Ouvir antes" title="Testar">
            <textarea className="gc-input min-h-[80px]" value={fraseTeste} onChange={(e) => setFraseTeste(e.target.value)} />
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <Botao variante="secundario" onClick={testar} disabled={testando}>
                {testando ? "Gerando…" : "▶ Testar"}
              </Botao>
              <span className="text-xs text-zinc-500">O teste usa os ajustes desta tela (mesmo antes de salvar).</span>
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}
