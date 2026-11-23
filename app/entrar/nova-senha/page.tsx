"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabaseClient";
import { TEXTOS, useIdioma } from "@/lib/idiomaEntrada";
import SeletorIdioma from "@/components/gc/SeletorIdioma";

// Aberta pelo link "esqueci a senha" do e-mail: o Supabase já deixa a pessoa
// logada temporariamente, aqui ela só escolhe a senha nova.

export default function NovaSenhaPage() {
  const router = useRouter();
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [idioma, setIdioma] = useIdioma();
  const t = TEXTOS[idioma];

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    if (senha.length < 8) {
      setErro(t.errSenha);
      return;
    }
    setCarregando(true);
    const { error } = await supabaseBrowser.auth.updateUser({ password: senha });
    setCarregando(false);
    if (error) {
      setErro(t.novaExpirou);
      return;
    }
    router.replace("/portal");
  }

  return (
    <div className="gc-app relative flex min-h-screen items-center justify-center px-6 text-zinc-200">
      <div className="gc-ceu gc-ceu-forte" aria-hidden />
      <form onSubmit={salvar} className="gc-card relative z-10 w-full max-w-md p-8">
        <SeletorIdioma idioma={idioma} onEscolher={setIdioma} rotulo={t.idioma} />
        <p className="gc-eyebrow mt-2">OS digital GC</p>
        <h1 className="mt-2 text-2xl font-bold text-white">{t.novaTitulo}</h1>
        <label className="mt-6 flex flex-col gap-1.5 text-sm text-zinc-300">
          {t.novaCampo}
          <input className="gc-input" type="password" value={senha} onChange={(e) => setSenha(e.target.value)} autoComplete="new-password" />
        </label>
        {erro && <p className="mt-4 rounded-xl bg-rose-500/10 px-3 py-2 text-sm text-rose-300">{erro}</p>}
        <button type="submit" disabled={carregando} className="gc-btn gc-btn-principal mt-6">
          {carregando ? t.salvando : t.salvarEntrar}
        </button>
      </form>
    </div>
  );
}
