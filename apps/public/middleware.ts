import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

export async function middleware(request: NextRequest) {
  const host = request.headers.get("host") ?? "";
  const hostname = host.split(":")[0]?.toLowerCase() ?? "";

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-feedchat-hostname", hostname);
  requestHeaders.delete("x-feedchat-tenant");

  return NextResponse.next({
    request: { headers: requestHeaders }
  });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|assets).*)"]
};
