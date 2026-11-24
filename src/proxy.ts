import { NextResponse, type NextRequest } from "next/server";

/**
 * Primeira barreira: sem o cookie de sessão, vai para /login. É só um redirecionamento barato; a checagem de
 * verdade (sessão válida + usuário ativo) acontece em requireUser(), dentro de cada página, ação e rota.
 * /api/refresh tem a própria autenticação (Bearer CRON_SECRET) e fica de fora.
 */
export function proxy(req: NextRequest) {
  if (!req.cookies.has("pokedex_session")) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!login|api/refresh|_next/static|_next/image|favicon.ico|icon).*)"],
};
