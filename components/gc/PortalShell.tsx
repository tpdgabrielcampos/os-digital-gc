"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import type { Session } from "@supabase/supabase-js";
import { supabaseBrowser } from "@/lib/supabaseClient";
import type { Dentista } from "@/lib/gc";
import Shell, { MENU_DENTISTA } from "@/components/gc/Shell";
import { I } from "@/components/gc/ui";
import AssistentePortal from "@/components/gc/AssistentePortal";
import { ProvedorIdioma, traduzir } from "@/lib/i18n";
import { useIdioma } from "@/lib/idiomaEntrada";
import SeletorIdioma, { SeletorIdiomaCompacto } from "@/components/gc/SeletorIdioma";

// Tudo que fica dentro do portal do dentista precisa de login. Este componente
// confere a sessão do Supabase, carrega o cadastro do dentista e desenha a
// moldura (menu + fundo). As páginas pegam os dados com useDentista().

interface Ctx {
  sessao: Session;
  dentista: Dentista;
  nomeTabela: string | null;
}

const DentistaCtx = createContext<Ctx | null>(null);

export function useDentista() {
  const c = useContext(DentistaCtx);
  if (!c) throw new Error("useDentista fora do PortalShell");
  return c;
}

export default function PortalShell({ ativo, children }: { ativo: string; children: ReactNode }) {
  const router = useRouter();
  const [ctx, setCtx] = useState<Ctx | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [idioma, setIdioma] = useIdioma();
  const tr = (s: string) => traduzir(idioma, s);

  useEffect(() => {
    let vivo = true;
    (async () => {
      const { data } = await supabaseBrowser.auth.getSession();
      const sessao = data.session;
      // Aparelho novo: usa o idioma escolhido no cadastro.
      try {
        const doCadastro = sessao?.user.user_metadata?.idioma;
        if (!localStorage.getItem("gc_idioma") && (doCadastro === "es" || doCadastro === "en")) setIdioma(doCadastro);
      } catch {}
      if (!sessao) {
        router.replace(`/entrar?voltar=${encodeURIComponent(window.location.pathname)}`);
        return;
      }
      const { data: dentista, error } = await supabaseBrowser
        .from("dentistas")
        .select("*")
        .eq("id", sessao.user.id)
        .maybeSingle();
      if (!vivo) return;
      if (error || !dentista) {
        setErro("sem_cadastro");
        return;
      }
      let nomeTabela: string | null = null;
      if (dentista.tabela_id) {
        const { data: t } = await supabaseBrowser
          .from("tabelas_preco")
          .select("nome")
          .eq("id", dentista.tabela_id)
          .maybeSingle();
        nomeTabela = t?.nome ?? null;
      }
      if (vivo) setCtx({ sessao, dentista: dentista as Dentista, nomeTabela });
    })();
    return () => {
      vivo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  async function sair() {
    await supabaseBrowser.auth.signOut();
    router.replace("/entrar");
  }

  if (erro) {
    return (
      <div className="gc-app flex min-h-screen items-center justify-center p-6 text-center text-zinc-300">
        <div className="gc-ceu" aria-hidden />
        <div className="gc-card relative z-10 max-w-md p-8">
          <p>{tr("Não encontrei o seu cadastro. Saia e entre de novo; se continuar, fale com o laboratório.")}</p>
          <button onClick={sair} className="gc-btn gc-btn-secundario mt-6">{tr("Sair")}</button>
        </div>
      </div>
    );
  }

  if (!ctx) {
    return (
      <div className="gc-app flex min-h-screen items-center justify-center text-zinc-400">
        <div className="gc-ceu" aria-hidden />
        <p className="relative z-10">{tr("Carregando…")}</p>
      </div>
    );
  }

  return (
    <ProvedorIdioma idioma={idioma} setIdioma={setIdioma}>
    <DentistaCtx.Provider value={ctx}>
      <Shell
        menu={MENU_DENTISTA.map((m) => ({ ...m, rotulo: tr(m.rotulo) }))}
        ativo={ativo}
        usuario={ctx.dentista.nome || ctx.dentista.email || "Dentista"}
        papel={ctx.dentista.clinica || tr("Dentista")}
        rodape={<SeletorIdioma idioma={idioma} onEscolher={setIdioma} rotulo={tr("Idioma")} />}
        extraCelular={<SeletorIdiomaCompacto idioma={idioma} onEscolher={setIdioma} rotulo={tr("Idioma")} />}
        lateral={<AssistentePortal modo="lateral" />}
        sair={
          <button onClick={sair} title={tr("Sair")} className="text-slate-400 hover:text-white">
            {I.sair}
          </button>
        }
      >
        {children}
        <AssistentePortal modo="flutuante" />
      </Shell>
    </DentistaCtx.Provider>
    </ProvedorIdioma>
  );
}
