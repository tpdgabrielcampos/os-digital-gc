import { cookies } from "next/headers";
import { redirect } from "next/navigation";

// Página inicial (também é onde o app instalado abre).
// - Computador/celular do laboratório (já entrou no dashboard alguma vez) → dashboard geral.
// - Dentista → entrada do dentista (criar conta / entrar).
export const dynamic = "force-dynamic";

export default function Home() {
  const c = cookies();
  const esperado = process.env.ADMIN_PASSWORD ?? "";
  const sessaoAdmin = !!esperado && c.get("tatim_admin_session")?.value === esperado;
  const aparelhoDoLab = c.get("gc_aparelho_lab")?.value === "1";
  redirect(sessaoAdmin || aparelhoDoLab ? "/dashboard" : "/entrar");
}
