"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function BotaoExcluirPedido({
  pedidoId,
  pacienteNome,
}: {
  pedidoId: string;
  pacienteNome: string;
}) {
  const router = useRouter();
  const [apagando, setApagando] = useState(false);

  async function excluir() {
    const confirmou = window.confirm(
      `Apagar o pedido de "${pacienteNome}"? Essa ação não pode ser desfeita.`
    );
    if (!confirmou) return;

    setApagando(true);
    try {
      const res = await fetch(`/api/pedidos/${pedidoId}`, { method: "DELETE" });
      const corpo = await res.json().catch(() => null);

      if (!res.ok || !corpo?.ok) {
        throw new Error(corpo?.erro || "Não consegui apagar. Tente novamente.");
      }

      router.refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Não consegui apagar. Tente novamente.");
      setApagando(false);
    }
  }

  return (
    <button
      onClick={excluir}
      disabled={apagando}
      title="Apagar pedido"
      aria-label={`Apagar pedido de ${pacienteNome}`}
      className="rounded-md p-1.5 text-zinc-500 transition hover:bg-rose-500/10 hover:text-rose-300 disabled:opacity-50"
    >
      {apagando ? (
        <span className="block h-4 w-4 animate-pulse text-xs">…</span>
      ) : (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 20 20"
          fill="currentColor"
          className="h-4 w-4"
        >
          <path
            fillRule="evenodd"
            d="M8.75 1A2.75 2.75 0 0 0 6 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 1 0 .23 1.482l.149-.022.841 10.518A2.75 2.75 0 0 0 7.596 19h4.807a2.75 2.75 0 0 0 2.742-2.53l.841-10.52.149.023a.75.75 0 0 0 .23-1.482A41.03 41.03 0 0 0 14 4.193V3.75A2.75 2.75 0 0 0 11.25 1h-2.5ZM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4ZM8.58 7.72a.75.75 0 0 0-1.5.06l.3 7.5a.75.75 0 1 0 1.5-.06l-.3-7.5Zm4.34.06a.75.75 0 1 0-1.5-.06l-.3 7.5a.75.75 0 1 0 1.5.06l.3-7.5Z"
            clipRule="evenodd"
          />
        </svg>
      )}
    </button>
  );
}
