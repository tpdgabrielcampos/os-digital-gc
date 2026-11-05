import Link from "next/link";
import type { ReactNode } from "react";

// Peças visuais da OS digital GC (tema escuro "galáxia").
// Usadas tanto no painel do laboratório quanto no portal do dentista.

export function PageHeader({
  eyebrow,
  title,
  subtitle,
  actions,
}: {
  eyebrow: string;
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <section className="gc-card gc-hero relative overflow-hidden p-6 sm:p-8">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-2xl">
          <p className="gc-eyebrow">— {eyebrow}</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-white sm:text-4xl">{title}</h1>
          {subtitle && <div className="mt-3 text-[15px] leading-relaxed text-slate-300">{subtitle}</div>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </section>
  );
}

type Tom = "ouro" | "verde" | "violeta" | "ambar" | "rosa" | "ciano";

const TOM_ICONE: Record<Tom, string> = {
  ouro: "bg-amber-400/10 text-amber-300 ring-amber-300/20",
  verde: "bg-emerald-400/10 text-emerald-300 ring-emerald-300/20",
  violeta: "bg-violet-400/10 text-violet-300 ring-violet-300/20",
  ambar: "bg-orange-400/10 text-orange-300 ring-orange-300/20",
  rosa: "bg-rose-400/10 text-rose-300 ring-rose-300/20",
  ciano: "bg-cyan-400/10 text-cyan-300 ring-cyan-300/20",
};

export function Icone({ tom = "ouro", children }: { tom?: Tom; children: ReactNode }) {
  return (
    <span className={`inline-flex h-10 w-10 items-center justify-center rounded-xl ring-1 ${TOM_ICONE[tom]}`}>
      {children}
    </span>
  );
}

export function StatCard({
  tom = "ouro",
  icone,
  rotulo,
  valor,
  detalhe,
}: {
  tom?: Tom;
  icone: ReactNode;
  rotulo: string;
  valor: ReactNode;
  detalhe?: ReactNode;
}) {
  return (
    <div className="gc-card p-5">
      <Icone tom={tom}>{icone}</Icone>
      <p className="mt-4 text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">{rotulo}</p>
      <p className="mt-1 text-3xl font-bold text-white">{valor}</p>
      {detalhe && <p className="mt-1 text-sm text-slate-400">{detalhe}</p>}
    </div>
  );
}

export function Panel({
  eyebrow,
  title,
  badge,
  children,
  className = "",
}: {
  eyebrow?: string;
  title?: ReactNode;
  badge?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`gc-card p-5 sm:p-6 ${className}`}>
      {(eyebrow || title || badge) && (
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            {eyebrow && <p className="gc-eyebrow">{eyebrow}</p>}
            {title && <h2 className="mt-1 text-xl font-bold text-white">{title}</h2>}
          </div>
          {badge && <span className="gc-chip">{badge}</span>}
        </div>
      )}
      {children}
    </section>
  );
}

export function Botao({
  children,
  variante = "principal",
  href,
  type = "button",
  onClick,
  disabled,
}: {
  children: ReactNode;
  variante?: "principal" | "secundario";
  href?: string;
  type?: "button" | "submit";
  onClick?: () => void;
  disabled?: boolean;
}) {
  const classe = variante === "principal" ? "gc-btn gc-btn-principal" : "gc-btn gc-btn-secundario";
  if (href) return <Link href={href} className={classe}>{children}</Link>;
  return (
    <button type={type} onClick={onClick} disabled={disabled} className={classe}>
      {children}
    </button>
  );
}

export function Vazio({ children }: { children: ReactNode }) {
  return <p className="py-10 text-center text-[15px] text-slate-400">{children}</p>;
}

/** Ícones simples em linha (traço), desenhados aqui para não depender de biblioteca. */
export const I = {
  casa: <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/></svg>,
  pasta: <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>,
  pessoas: <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="8" r="3.2"/><path d="M3 20c.6-3.3 3-5 6-5s5.4 1.7 6 5"/><path d="M16 4.5a3 3 0 0 1 0 6M18 15c1.8.6 2.8 2.2 3 5"/></svg>,
  etiqueta: <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12V4a1 1 0 0 1 1-1h8l9 9-9 9z"/><circle cx="7.5" cy="7.5" r="1.4"/></svg>,
  cartao: <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18"/></svg>,
  grafico: <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg>,
  sobe: <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/></svg>,
  caixa: <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 8l-9-5-9 5 9 5z"/><path d="M3 8v8l9 5 9-5V8"/><path d="M12 13v8"/></svg>,
  relogio: <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>,
  nuvem: <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M7 18a4 4 0 0 1-.6-8 6 6 0 0 1 11.6 1.5A3.5 3.5 0 0 1 17.5 18z"/><path d="M12 11v5M9.5 13.5L12 11l2.5 2.5"/></svg>,
  mais: <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>,
  arquivo: <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8z"/><path d="M14 3v5h5"/></svg>,
  sair: <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M15 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4M10 16l-4-4 4-4M6 12h10"/></svg>,
};
