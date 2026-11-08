import Link from "next/link";
import type { ReactNode } from "react";
import { I } from "@/components/gc/ui";

export interface ItemMenu {
  href: string;
  rotulo: string;
  icone: ReactNode;
  contagem?: number;
}

export const MENU_LAB: ItemMenu[] = [
  { href: "/dashboard", rotulo: "Visão geral", icone: I.casa },
  { href: "/dashboard/quadro", rotulo: "Quadro de etapas", icone: I.grafico },
  { href: "/dashboard/ordens", rotulo: "Ordens de serviço", icone: I.pasta },
  { href: "/dashboard/dentistas", rotulo: "Dentistas", icone: I.pessoas },
  { href: "/dashboard/financeiro", rotulo: "Financeiro", icone: I.cartao },
  { href: "/dashboard/precos", rotulo: "Tabelas de preço", icone: I.etiqueta },
  { href: "/dashboard/voz", rotulo: "Assistente de voz", icone: I.microfone },
];

export const MENU_DENTISTA: ItemMenu[] = [
  { href: "/portal", rotulo: "Minhas OS", icone: I.pasta },
  { href: "/portal/nova", rotulo: "Nova OS", icone: I.mais },
];

/**
 * Moldura das telas logadas: menu lateral + fundo preto com o splash GC.
 * `ativo` é o href do item marcado no menu.
 */
export default function Shell({
  menu,
  ativo,
  usuario,
  papel,
  rodape,
  sair,
  largo,
  children,
}: {
  menu: ItemMenu[];
  ativo: string;
  usuario: string;
  papel: string;
  rodape?: ReactNode;
  /** Botão de sair (componente cliente). */
  sair?: ReactNode;
  /** Usa a largura toda da tela (quadro de etapas). */
  largo?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="gc-app min-h-screen text-slate-200">
      <div className="gc-ceu" aria-hidden />
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-64 flex-col border-r border-white/5 bg-black/70 px-4 py-6 backdrop-blur lg:flex">
        <Link href={menu[0].href} className="flex justify-center px-2 pt-2" title="Gabriel Campos">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-gabriel-campos.png" alt="Gabriel Campos" className="h-28 w-auto invert" />
        </Link>

        <nav className="mt-10 flex flex-col gap-1">
          {menu.map((m) => {
            const marcado = m.href === ativo;
            return (
              <Link
                key={m.href}
                href={m.href}
                className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-[15px] font-medium transition ${
                  marcado
                    ? "gc-menu-ativo text-white"
                    : "text-slate-300 hover:bg-white/5 hover:text-white"
                }`}
              >
                <span className={marcado ? "text-pink-300" : "text-slate-400"}>{m.icone}</span>
                <span className="flex-1">{m.rotulo}</span>
                {m.contagem !== undefined && (
                  <span className={`rounded-md px-1.5 text-xs font-semibold ${marcado ? "bg-pink-400/15 text-pink-200" : "bg-white/5 text-slate-400"}`}>
                    {m.contagem}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto flex flex-col gap-3">
          {rodape}
          <div className="gc-card flex items-center gap-3 p-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg gc-barra text-sm font-bold text-white">
              {usuario.slice(0, 1).toUpperCase()}
            </span>
            <span className="min-w-0 flex-1 leading-tight">
              <span className="block truncate text-sm font-semibold text-white">{usuario}</span>
              <span className="block text-xs text-slate-400">{papel}</span>
            </span>
            {sair ?? <span className="text-slate-500">{I.sair}</span>}
          </div>
        </div>
      </aside>

      {/* Celular: barra de cima com o menu em linha */}
      <header className="sticky top-0 z-20 flex gap-1 overflow-x-auto border-b border-white/5 bg-black/85 px-3 py-2 backdrop-blur lg:hidden">
        {menu.map((m) => (
          <Link
            key={m.href}
            href={m.href}
            className={`flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm ${
              m.href === ativo ? "gc-menu-ativo text-white" : "text-slate-300"
            }`}
          >
            {m.icone}
            {m.rotulo}
          </Link>
        ))}
        {sair && <span className="ml-auto flex shrink-0 items-center px-2">{sair}</span>}
      </header>

      <main className="relative z-10 px-4 py-6 sm:px-6 lg:ml-64 lg:px-8 lg:py-8">
        <div className={`mx-auto flex min-w-0 flex-col gap-6 ${largo ? "max-w-none" : "max-w-6xl"}`}>{children}</div>
      </main>
    </div>
  );
}
