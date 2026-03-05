export { auth as middleware } from "@/lib/auth"

export const config = {
  matcher: [
    "/admin/:path*",
    // /printjobs beschermd BEHALVE /printjobs/aftekenlijst (publiek)
    "/printjobs/((?!aftekenlijst).*)",
    "/api/printjobs/:path*",
    "/api/stats/:path*",
  ]
}
