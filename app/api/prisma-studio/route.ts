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

    // Use the proxy route instead of direct TCP proxy URL
    const baseUrl = process.env.NEXTAUTH_URL || request.headers.get("origin") || "https://printlijstapp-g6qhk.kinsta.app"
    const prismaStudioUrl = `${baseUrl}/api/prisma-studio/proxy`
    
    return NextResponse.json({
      success: true,
      url: prismaStudioUrl,
      message: "Prisma Studio URL opgehaald via proxy"
    })
  } catch (error) {
    console.error("Error getting Prisma Studio URL:", error)
    return NextResponse.json(
      { error: "Kon Prisma Studio URL niet ophalen" },
      { status: 500 }
    )
  }
}
