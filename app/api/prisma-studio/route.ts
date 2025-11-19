import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"

export async function POST(request: Request) {
  try {
    // Check if user is authenticated and is admin
    const session = await auth()
    
    if (!session || session.user.role !== "admin") {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      )
    }

    // Get the Prisma Studio URL from environment
    const baseUrl = process.env.NEXTAUTH_URL || request.headers.get("origin") || "http://localhost:3000"
    
    // Use reverse proxy path instead of separate port
    const prismaStudioUrl = `${baseUrl}/prisma-studio`
    
    return NextResponse.json({
      success: true,
      url: prismaStudioUrl,
      message: "Prisma Studio URL opgehaald",
      note: "Prisma Studio draait via reverse proxy op /prisma-studio"
    })
  } catch (error) {
    console.error("Error getting Prisma Studio URL:", error)
    return NextResponse.json(
      { error: "Kon Prisma Studio URL niet ophalen" },
      { status: 500 }
    )
  }
}
