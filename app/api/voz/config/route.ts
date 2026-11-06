import { NextResponse } from "next/server";
import { lerConfigAssistente, premiumAtivo } from "@/lib/vozConfig";

export const dynamic = "force-dynamic";

// O que a tela do dentista precisa saber (sem nada secreto).
export async function GET() {
  const c = await lerConfigAssistente();
  return NextResponse.json({
    premium: premiumAtivo(c),
    velocidade: c.velocidade,
    pausa: c.pausa,
  });
}
