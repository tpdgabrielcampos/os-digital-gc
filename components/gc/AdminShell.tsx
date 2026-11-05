import type { ReactNode } from "react";
import Shell, { MENU_LAB } from "@/components/gc/Shell";
import LogoutButton from "@/components/LogoutButton";
import { I } from "@/components/gc/ui";

// Moldura das telas do laboratório (painel do Gabriel).
export default function AdminShell({
  ativo,
  contagens,
  children,
}: {
  ativo: string;
  contagens?: Partial<Record<string, number>>;
  children: ReactNode;
}) {
  const menu = MENU_LAB.map((m) => (contagens?.[m.href] !== undefined ? { ...m, contagem: contagens[m.href] } : m));
  return (
    <Shell
      menu={menu}
      ativo={ativo}
      usuario="Gabriel"
      papel="Laboratório"
      sair={<LogoutButton />}
      rodape={
        <a
          href="https://drive.google.com/drive/search?q=%22OS%20digital%20GC%20%E2%80%94%20Arquivos%22"
          target="_blank"
          rel="noreferrer"
          className="gc-card flex items-center gap-3 p-3 hover:bg-white/5"
        >
          <span className="text-emerald-300">{I.nuvem}</span>
          <span className="leading-tight">
            <span className="block text-sm font-semibold text-white">Arquivos no Drive</span>
            <span className="block text-xs text-slate-400">Pasta “OS digital GC — Arquivos”</span>
          </span>
        </a>
      }
    >
      {children}
    </Shell>
  );
}
