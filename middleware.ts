import { auth } from "@/lib/auth"
import { NextResponse } from "next/server"

// Expliciete middleware: alleen beschermde routes checken op auth.
// Routes NIET in de matcher (zoals /aftekenlijst) worden NOOIT geraakt.
export default auth((req) => {
  if (!req.auth) {
    return NextResponse.redirect(new URL("/login", req.url))
  }
  return NextResponse.next()
})

export const config = {
  matcher: [
    "/admin/:path*",
    "/printjobs/:path*",
    "/api/printjobs/:path*",
    "/api/stats/:path*",
  ]
}
