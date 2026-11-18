import { NextRequest, NextResponse } from "next/server";

const COOKIE_NAME = "tatim_admin_session";

export async function POST(req: NextRequest) {
  const { senha } = await req.json();
  const esperado = process.env.ADMIN_PASSWORD ?? "";

  if (!esperado || senha !== esperado) {
    return NextResponse.json({ ok: false, erro: "Senha incorreta" }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE_NAME, esperado, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30, // 30 dias
  });
  // Marca este aparelho como do laboratório: o app passa a abrir sempre no dashboard.
  res.cookies.set("gc_aparelho_lab", "1", {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365 * 5,
  });
  return res;
}
