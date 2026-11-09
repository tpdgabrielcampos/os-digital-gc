"use client";

import { useEffect, useState } from "react";

// Registra o service worker e mostra o botão "Instalar app" quando o navegador permite.
// No iPhone/iPad (Safari) não existe botão automático: mostramos como fazer pelo "Compartilhar".

interface EventoInstalar extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export default function InstalarApp({ compacto }: { compacto?: boolean }) {
  const [evento, setEvento] = useState<EventoInstalar | null>(null);
  const [instalado, setInstalado] = useState(true);
  const [ios, setIos] = useState(false);
  const [outroNavegador, setOutroNavegador] = useState(false);
  const [ajuda, setAjuda] = useState(false);

  useEffect(() => {
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
    const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone === true;
    setInstalado(standalone);
    setIos(/iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1));
    const w = window as unknown as { __gcInstalar?: EventoInstalar };
    if (w.__gcInstalar) setEvento(w.__gcInstalar);
    const pegar = (e: Event) => {
      e.preventDefault();
      setEvento(e as EventoInstalar);
    };
    const pegarGuardado = () => w.__gcInstalar && setEvento(w.__gcInstalar);
    window.addEventListener("gc-instalar", pegarGuardado);
    // Sem convite automático (Firefox, Safari no Mac, ou Chrome que ainda não ofereceu): mostra o passo a passo.
    const t = setTimeout(() => !w.__gcInstalar && setOutroNavegador(true), 2500);
    const feito = () => setInstalado(true);
    window.addEventListener("beforeinstallprompt", pegar);
    window.addEventListener("appinstalled", feito);
    return () => {
      window.removeEventListener("beforeinstallprompt", pegar);
      window.removeEventListener("appinstalled", feito);
      window.removeEventListener("gc-instalar", pegarGuardado);
      clearTimeout(t);
    };
  }, []);

  if (instalado || (!evento && !ios && !outroNavegador)) return null;

  async function instalar() {
    if (evento) {
      await evento.prompt();
      const r = await evento.userChoice.catch(() => null);
      if (r?.outcome === "accepted") setInstalado(true);
      setEvento(null);
    } else setAjuda((v) => !v);
  }

  return (
    <div className={compacto ? "shrink-0" : ""}>
      <button
        onClick={instalar}
        className={`flex items-center gap-2 rounded-xl bg-white/10 font-semibold text-white hover:bg-white/15 ${compacto ? "px-3 py-2 text-sm" : "w-full justify-center px-3 py-2.5 text-sm"}`}
      >
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v12M7 10l5 5 5-5M5 21h14" /></svg>
        Instalar app
      </button>
      {ajuda && !ios && (
        <div className="fixed inset-x-3 bottom-3 z-50 mx-auto max-w-md rounded-2xl border border-white/10 bg-[#121214] p-4 text-sm text-zinc-200 shadow-2xl" onClick={() => setAjuda(false)}>
          <p className="font-semibold text-white">Instalar o app</p>
          <p className="mt-1">
            <strong>Chrome / Edge no computador:</strong> clique no ícone de instalar na barra de endereço (monitor com seta, ao lado da estrela) ou no menu <strong>⋮</strong> → <strong>Transmitir, salvar e compartilhar</strong> → <strong>Instalar página como app</strong>.
          </p>
          <p className="mt-2"><strong>Celular Android:</strong> menu <strong>⋮</strong> → <strong>Instalar app</strong> ou <strong>Adicionar à tela inicial</strong>.</p>
          <p className="mt-2 text-xs text-zinc-500">Clique aqui para fechar.</p>
        </div>
      )}
      {ajuda && ios && (
        <div className="fixed inset-x-3 bottom-3 z-50 rounded-2xl border border-white/10 bg-[#121214] p-4 text-sm text-zinc-200 shadow-2xl" onClick={() => setAjuda(false)}>
          <p className="font-semibold text-white">Instalar no iPhone / iPad</p>
          <p className="mt-1">No Safari, toque em <strong>Compartilhar</strong> (quadrado com seta para cima) e depois em <strong>“Adicionar à Tela de Início”</strong>.</p>
          <p className="mt-2 text-xs text-zinc-500">Toque aqui para fechar.</p>
        </div>
      )}
    </div>
  );
}
