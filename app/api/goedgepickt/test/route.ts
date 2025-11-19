import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { GoedGepicktAPI } from "@/lib/goedgepickt"

/**
 * POST /api/goedgepickt/test
 * Test de GoedGepickt API verbinding
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth()

    if (!session || session.user?.role !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await request.json()
    const { apiKey } = body

    if (!apiKey) {
      return NextResponse.json(
        { error: "API key is required" },
        { status: 400 }
      )
    }

    // Test de verbinding
    const api = new GoedGepicktAPI(apiKey)
    const isConnected = await api.testConnection()

    if (isConnected) {
      return NextResponse.json({
        success: true,
        message: "Verbinding met GoedGepickt succesvol!",
      })
    } else {
      return NextResponse.json(
        {
          success: false,
          message: "Kan geen verbinding maken met GoedGepickt API",
        },
        { status: 400 }
      )
    }
  } catch (error: any) {
    console.error("GoedGepickt test error:", error)
    return NextResponse.json(
      { error: error.message || "Error testing connection" },
      { status: 500 }
    )
  }
}
