"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setCarregando(true);
    setErro(null);

    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ senha }),
    });

    setCarregando(false);

    if (!res.ok) {
      setErro("Senha incorreta.");
      return;
    }

    router.push(params.get("redirect") || "/dashboard");
    router.refresh();
  }

  return (
    <div className="gc-app relative flex min-h-screen items-center justify-center px-6 text-zinc-200">
      <div className="gc-ceu gc-ceu-forte" aria-hidden />
      <form onSubmit={handleSubmit} className="relative z-10 w-full max-w-sm rounded-[1.5rem] border border-white/10 bg-black/50 p-8 shadow-2xl backdrop-blur-md">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo-gabriel-campos.png" alt="Gabriel Campos" className="mx-auto h-24 w-auto invert" />
        <p className="gc-eyebrow mt-6 text-center">Painel do laboratório</p>
        <h1 className="mt-1 text-center text-2xl font-bold text-white">Acesso restrito</h1>

        <label className="mt-6 flex flex-col gap-1.5 text-sm text-zinc-300">
          Senha
          <input type="password" value={senha} onChange={(e) => setSenha(e.target.value)} autoFocus className="gc-input" />
        </label>

        {erro && <p className="mt-3 rounded-xl bg-rose-500/10 px-3 py-2 text-sm text-rose-300">{erro}</p>}

        <button type="submit" disabled={carregando} className="gc-btn gc-btn-principal mt-6 w-full justify-center">
          {carregando ? "Entrando…" : "Entrar"}
        </button>
      </form>
    </div>
  );
}
