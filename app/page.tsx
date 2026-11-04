import Link from "next/link";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col items-center justify-center gap-8 px-6 text-center">
      <div>
        <h1 className="text-3xl font-bold text-navy">OS digital GC</h1>
        <p className="mt-2 text-slate-600">
          Envio e acompanhamento de ordens de serviço
        </p>
      </div>
      <div className="flex w-full flex-col gap-4 sm:flex-row">
        <Link
          href="/novo-pedido"
          className="flex-1 rounded-lg bg-navy px-6 py-4 font-semibold text-white shadow-sm transition hover:bg-navy/90"
        >
          Sou dentista — criar ordem de serviço
        </Link>
        <Link
          href="/dashboard"
          className="flex-1 rounded-lg border border-navy px-6 py-4 font-semibold text-navy shadow-sm transition hover:bg-navy/5"
        >
          Painel do laboratório
        </Link>
      </div>
    </main>
  );
}
