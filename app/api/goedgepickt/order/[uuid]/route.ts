import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { GoedGepicktAPI } from "@/lib/goedgepickt"

export async function GET(
  request: NextRequest,
  { params }: { params: { uuid: string } }
) {
  try {
    const session = await auth()

    if (!session || session.user?.role !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const orderUuid = params.uuid

    if (!orderUuid) {
      return NextResponse.json(
        { error: "Order UUID is required" },
        { status: 400 }
      )
    }

    // Haal API key op uit settings
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

    // Haal order op
    console.log(`📦 Fetching order ${orderUuid} from GoedGepickt...`)
    const order = await api.getOrder(orderUuid)

    if (!order) {
      return NextResponse.json(
        { error: "Order not found or API error" },
        { status: 404 }
      )
    }

    return NextResponse.json({
      success: true,
      order,
    })
  } catch (error: any) {
    console.error("GoedGepickt order fetch error:", error)
    return NextResponse.json(
      { error: error.message || "Error fetching order" },
      { status: 500 }
    )
  }
}
