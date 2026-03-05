import { auth } from "@/lib/auth"
import { NextResponse } from "next/server"

// Paden die GEEN login vereisen
const publicPaths = [
  "/printjobs/aftekenlijst",
  "/api/checklist"
]

export async function middleware(request: Request) {
  const url = new URL(request.url)

  // Publieke paden doorlaten zonder auth
  if (publicPaths.some(path => url.pathname.startsWith(path))) {
    return NextResponse.next()
  }

  // Alle andere gematchte routes vereisen auth
  return (auth as any)(request)
}

export const config = {
  matcher: [
    "/admin/:path*",
    "/printjobs/:path*",
    "/api/printjobs/:path*",
    "/api/stats/:path*",
    "/api/checklist/:path*"
  ]
}
