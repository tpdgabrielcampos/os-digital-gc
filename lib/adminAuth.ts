import type { NextRequest } from "next/server";

// Sessão simples do painel do laboratório (cookie com a ADMIN_PASSWORD),
// a mesma usada pelo middleware.
export const COOKIE_ADMIN = "tatim_admin_session";

export function adminAutorizado(req: NextRequest) {
  const cookie = req.cookies.get(COOKIE_ADMIN)?.value;
  const esperado = process.env.ADMIN_PASSWORD ?? "";
  return Boolean(cookie && esperado && cookie === esperado);
}
