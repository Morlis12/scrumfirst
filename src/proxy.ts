import { NextResponse } from "next/server";

const SESSION_COOKIES = [
  "authjs.session-token",
  "__Secure-authjs.session-token",
  "next-auth.session-token",
  "__Secure-next-auth.session-token",
];

const PROTECTED_PREFIXES = ["/backlog", "/planning", "/dod"];

export function proxy(request: Request) {
  const url = new URL(request.url);
  const { pathname } = url;

  const cookieHeader = request.headers.get("cookie") ?? "";
  const hasSession = SESSION_COOKIES.some((name) =>
    cookieHeader.includes(`${name}=`),
  );

  const isProtected = PROTECTED_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );

  // Contrôle optimiste : la vérification sécurisée (JWT) a lieu
  // dans chaque page / Server Action via `auth()`.
  if (isProtected && !hasSession) {
    return NextResponse.redirect(new URL("/login", url));
  }
  if ((pathname === "/login" || pathname === "/signup") && hasSession) {
    return NextResponse.redirect(new URL("/backlog", url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\.png$).*)"],
};
