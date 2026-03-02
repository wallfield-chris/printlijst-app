import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { GoedGepicktAPI } from "@/lib/goedgepickt"

export async function GET(request: NextRequest) {
  try {
    const session = await auth()
    if (!session) {
      return NextResponse.json({ error: "Niet geautoriseerd" }, { status: 401 })
    }

    const apiKeySetting = await prisma.setting.findUnique({
      where: { key: "goedgepickt_api_key" },
    })

    if (!apiKeySetting?.value) {
      return NextResponse.json({ error: "Geen API key geconfigureerd" }, { status: 400 })
    }

    const api = new GoedGepicktAPI(apiKeySetting.value)
    const locations = await api.getPickLocations()

    return NextResponse.json({ locations })
  } catch (error) {
    console.error("Error fetching picklocations:", error)
    return NextResponse.json({ error: "Fout bij ophalen van locaties" }, { status: 500 })
  }
}
