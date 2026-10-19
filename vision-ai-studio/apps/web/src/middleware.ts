import { NextResponse, type NextRequest } from "next/server";

/** Redireciona para o login quando não há cookie de sessão (validação real ocorre no servidor). */
export function middleware(req: NextRequest) {
  const has = req.cookies.has("vision_session");
  const { pathname } = req.nextUrl;
  const isAuthPage = pathname === "/entrar" || pathname === "/cadastro";
  if (!has && !isAuthPage) return NextResponse.redirect(new URL("/entrar", req.url));
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|svg|ico)).*)"],
};
