import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { GoedGepicktAPI } from "@/lib/goedgepickt"

/**
 * GET /api/goedgepickt/statuses
 * Haal alle unieke order statussen op uit GoedGepickt
 */
export async function GET(request: NextRequest) {
  try {
    const session = await auth()

    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Haal API key op
    const apiKeySetting = await prisma.setting.findUnique({
      where: { key: "goedgepickt_api_key" },
    })

    if (!apiKeySetting || !apiKeySetting.value) {
      return NextResponse.json(
        { error: "GoedGepickt API key not configured" },
        { status: 400 }
      )
    }

    // Initialiseer API client
    const api = new GoedGepicktAPI(apiKeySetting.value)

    console.log("📊 Fetching order statuses from GoedGepickt...")
    
    // Haal laatste 100 orders op
    const orders = await api.getOrders({ limit: 100 })
    
    // Verzamel alle unieke statussen
    const statusCounts = new Map<string, number>()
    
    for (const order of orders) {
      const status = order.status || "unknown"
      statusCounts.set(status, (statusCounts.get(status) || 0) + 1)
    }

    const statuses = Array.from(statusCounts.entries())
      .map(([status, count]) => ({ status, count }))
      .sort((a, b) => b.count - a.count)

    console.log(`✅ Found ${statuses.length} unique statuses in ${orders.length} orders`)

    return NextResponse.json({
      success: true,
      totalOrders: orders.length,
      statuses,
    })
  } catch (error: any) {
    console.error("❌ Error fetching statuses:", error)
    return NextResponse.json(
      { error: error.message || "Error fetching statuses" },
      { status: 500 }
    )
  }
}
