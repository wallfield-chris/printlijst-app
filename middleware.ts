import { auth } from "@/lib/auth"
import { NextResponse } from "next/server"

// Paden die GEEN login vereisen
const publicPaths = [
  "/printjobs/aftekenlijst",
  "/api/checklist"
]

export default auth((req) => {
  const { pathname } = req.nextUrl

  // Publieke paden altijd doorlaten
  if (publicPaths.some(path => pathname.startsWith(path))) {
    return NextResponse.next()
  }

  // Beveiligde paden: redirect naar login als niet ingelogd
  if (!req.auth) {
    return NextResponse.redirect(new URL("/login", req.nextUrl))
  }

  return NextResponse.next()
})

export const config = {
  matcher: [
    "/admin/:path*",
    "/printjobs/:path*",
    "/api/printjobs/:path*",
    "/api/stats/:path*",
    "/api/checklist/:path*"
  ]
}
