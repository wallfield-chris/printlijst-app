import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"

export async function POST(request: Request) {
  try {
    // Check if user is authenticated and is admin
    const session = await getServerSession(authOptions)
    
    if (!session || session.user.role !== "admin") {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      )
    }

    // Get the Prisma Studio URL from environment
    const baseUrl = process.env.NEXTAUTH_URL || request.headers.get("origin") || "http://localhost:3000"
    const prismaStudioPort = process.env.PRISMA_STUDIO_PORT || "5555"
    
    // In production, Prisma Studio runs on the same host but different port
    const prismaStudioUrl = process.env.PRISMA_STUDIO_URL || `${baseUrl.replace(/:\d+$/, '')}:${prismaStudioPort}`
    
    return NextResponse.json({
      success: true,
      url: prismaStudioUrl,
      message: "Prisma Studio URL opgehaald",
      note: "Prisma Studio moet draaien op de server. Zie PRISMA-STUDIO-SETUP.md voor instructies."
    })
  } catch (error) {
    console.error("Error getting Prisma Studio URL:", error)
    return NextResponse.json(
      { error: "Kon Prisma Studio URL niet ophalen" },
      { status: 500 }
    )
  }
}
