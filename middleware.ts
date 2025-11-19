export { auth as middleware } from "@/lib/auth"

export const config = {
  matcher: [
    "/admin/:path*",
    "/printjobs/:path*",
    "/api/printjobs/:path*",
    "/api/stats/:path*"
  ]
}
