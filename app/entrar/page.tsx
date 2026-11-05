"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabaseClient";

// Tela inicial do dentista: criar conta ou entrar (e-mail + senha).

type Modo = "criar" | "entrar" | "esqueci";

export default function EntrarPage() {
  return (
    <Suspense fallback={null}>
      <Entrar />
    </Suspense>
  );
}

function traduzErro(msg: string) {
  const m = msg.toLowerCase();
  if (m.includes("invalid login")) return "E-mail ou senha incorretos.";
  if (m.includes("already registered") || m.includes("already been registered"))
    return "Esse e-mail já tem conta. Use \"Já tenho conta\" para entrar.";
  if (m.includes("email not confirmed")) return "Falta confirmar o e-mail: abra a mensagem que enviamos e clique no link.";
  if (m.includes("password")) return "A senha precisa ter pelo menos 8 caracteres.";
  if (m.includes("rate limit")) return "Muitas tentativas seguidas. Espere alguns minutos e tente de novo.";
  return msg;
}

function Entrar() {
  const router = useRouter();
  const params = useSearchParams();
  const voltar = params.get("voltar") || "/portal";
  const [modo, setModo] = useState<Modo>(params.get("modo") === "entrar" ? "entrar" : "criar");
  const [campos, setCampos] = useState({ nome: "", clinica: "", whatsapp: "", email: "", senha: "" });
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);

  // Já está logado? Vai direto para o portal.
  useEffect(() => {
    supabaseBrowser.auth.getSession().then(({ data }) => {
      if (data.session) router.replace(voltar);
    });
  }, [router, voltar]);

  const set = (k: keyof typeof campos) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setCampos((c) => ({ ...c, [k]: e.target.value }));

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setAviso(null);
    setCarregando(true);
    try {
      const email = campos.email.trim().toLowerCase();
      if (modo === "criar") {
        if (!campos.nome.trim()) throw new Error("Preencha o seu nome.");
        if (campos.senha.length < 8) throw new Error("A senha precisa ter pelo menos 8 caracteres.");
        const { data, error } = await supabaseBrowser.auth.signUp({
          email,
          password: campos.senha,
          options: {
            data: { nome: campos.nome.trim(), clinica: campos.clinica.trim(), whatsapp: campos.whatsapp.trim() },
            emailRedirectTo: `${window.location.origin}/portal`,
          },
        });
        if (error) throw error;
        if (data.session) {
          router.replace(voltar);
        } else {
          setAviso("Conta criada! Enviamos um e-mail de confirmação. Clique no link da mensagem e depois entre aqui.");
          setModo("entrar");
        }
      } else if (modo === "entrar") {
        const { error } = await supabaseBrowser.auth.signInWithPassword({ email, password: campos.senha });
        if (error) throw error;
        router.replace(voltar);
      } else {
        const { error } = await supabaseBrowser.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/entrar/nova-senha`,
        });
        if (error) throw error;
        setAviso("Se esse e-mail tiver conta, você vai receber um link para criar uma senha nova.");
      }
    } catch (err) {
      setErro(traduzErro(err instanceof Error ? err.message : String(err)));
    } finally {
      setCarregando(false);
    }
  }

  const campo = (rotulo: string, k: keyof typeof campos, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <label className="flex flex-col gap-1.5 text-sm text-zinc-300">
      {rotulo}
      <input className="gc-input" value={campos[k]} onChange={set(k)} {...props} />
    </label>
  );

  return (
    <div className="gc-app relative min-h-screen overflow-hidden text-zinc-200">
      <div className="gc-ceu gc-ceu-forte" aria-hidden />
      <div className="relative z-10 mx-auto grid min-h-screen max-w-6xl items-center gap-10 px-6 py-10 lg:grid-cols-[1.1fr_1fr]">
        <div className="flex flex-col items-center text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-gabriel-campos.png" alt="Gabriel Campos" className="h-52 w-auto invert sm:h-72 lg:h-80" />
          {/* Frase em "recortes de revista" — estilos em globals.css (.recortes) */}
          <p className="recortes mt-8 sm:mt-10" aria-label="Dentistry is what we do, changing lives is why we do!">
            <span className="linha">
              <span className="rc-dentistry">DENTISTRY</span>
              <span className="rc-iswhat">is what</span>
              <span className="par">
                <span className="rc-we">WE</span>
                <span className="rc-do">DO,</span>
              </span>
            </span>
            <span className="linha">
              <span className="rc-changing">changing</span>
              <span className="rc-lives">LIVES</span>
              <span className="rc-iswhy">is why</span>
              <span className="par">
                <span className="rc-we2">WE</span>
                <span className="rc-do2">DO!</span>
              </span>
            </span>
          </p>
        </div>

        <form
          onSubmit={enviar}
          className="w-full max-w-md justify-self-center rounded-[1.5rem] border border-white/10 bg-black/45 p-7 shadow-2xl backdrop-blur-md sm:p-9 lg:justify-self-end"
        >
          <div className="gc-tabs">
            <button type="button" onClick={() => setModo("criar")} className={`gc-tab ${modo === "criar" ? "gc-tab-ativa" : ""}`}>
              Criar conta
            </button>
            <button type="button" onClick={() => setModo("entrar")} className={`gc-tab ${modo !== "criar" ? "gc-tab-ativa" : ""}`}>
              Já tenho conta
            </button>
          </div>

          <h2 className="mt-6 text-2xl font-bold text-white">
            {modo === "criar" ? "Crie seu acesso" : modo === "entrar" ? "Bem-vindo de volta" : "Esqueci a senha"}
          </h2>
          <p className="mt-1 text-sm text-zinc-400">
            {modo === "criar"
              ? "Leva 1 minuto. Depois é só entrar e enviar suas OS."
              : modo === "entrar"
                ? "Entre com o e-mail e a senha da sua conta."
                : "Digite o seu e-mail para receber o link de uma senha nova."}
          </p>

          <div className="mt-6 flex flex-col gap-4">
            {modo === "criar" && (
              <>
                {campo("Nome completo", "nome", { placeholder: "Ex: Dra. Ana Souza", autoComplete: "name", required: true })}
                {campo("Clínica", "clinica", { placeholder: "Nome da clínica (opcional)" })}
                {campo("WhatsApp", "whatsapp", { placeholder: "(51) 9 9999-0000", inputMode: "tel", autoComplete: "tel" })}
              </>
            )}
            {campo("E-mail", "email", { type: "email", placeholder: "voce@clinica.com.br", autoComplete: "email", required: true })}
            {modo !== "esqueci" &&
              campo("Senha", "senha", {
                type: "password",
                placeholder: modo === "criar" ? "mínimo 8 caracteres" : "sua senha",
                autoComplete: modo === "criar" ? "new-password" : "current-password",
                required: true,
              })}
          </div>

          {erro && <p className="mt-4 rounded-xl bg-rose-500/10 px-3 py-2 text-sm text-rose-300">{erro}</p>}
          {aviso && <p className="mt-4 rounded-xl bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300">{aviso}</p>}

          <div className="mt-7 flex flex-wrap items-center gap-4">
            <button type="submit" disabled={carregando} className="gc-btn gc-btn-principal">
              {carregando
                ? "Aguarde…"
                : modo === "criar"
                  ? "Criar conta e entrar"
                  : modo === "entrar"
                    ? "Entrar"
                    : "Enviar link"}
            </button>
            {modo === "entrar" && (
              <button type="button" onClick={() => setModo("esqueci")} className="text-sm text-zinc-400 hover:text-white">
                Esqueci a senha
              </button>
            )}
            {modo === "esqueci" && (
              <button type="button" onClick={() => setModo("entrar")} className="text-sm text-zinc-400 hover:text-white">
                Voltar
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
