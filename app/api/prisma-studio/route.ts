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

    // Use the Kinsta TCP proxy URL for Prisma Studio
    const prismaStudioUrl = process.env.PRISMA_STUDIO_URL || "http://europe-west4-001.proxy.kinsta.app:30244"
    
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
