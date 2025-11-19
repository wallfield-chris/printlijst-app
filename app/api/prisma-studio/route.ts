import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"

export async function POST() {
  try {
    // Check if user is authenticated and is admin
    const session = await getServerSession(authOptions)
    
    if (!session || session.user.role !== "admin") {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      )
    }

    // Get the Prisma Studio URL from environment or use default
    const prismaStudioUrl = process.env.PRISMA_STUDIO_URL || "http://localhost:5555"
    
    return NextResponse.json({
      success: true,
      url: prismaStudioUrl,
      message: "Prisma Studio URL opgehaald"
    })
  } catch (error) {
    console.error("Error getting Prisma Studio URL:", error)
    return NextResponse.json(
      { error: "Kon Prisma Studio URL niet ophalen" },
      { status: 500 }
    )
  }
}
