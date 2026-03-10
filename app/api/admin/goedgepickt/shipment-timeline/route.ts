import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

// ===================================================================
// GET /api/admin/goedgepickt/shipment-timeline
// Haalt zendingen op met exacte aanmaaktijden vanuit GoedGepickt.
// Geeft per dag een gesorteerde lijst van tijdstempels terug.
// ===================================================================

const GG_BASE = "https://account.goedgepickt.nl/api/v1"
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function fetchWithRetry(url: string, headers: Record<string, string>, retries = 4): Promise<Response> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const res = await fetch(url, { headers, cache: "no-store" })
    if (res.status !== 429) return res
    const waitMs = Math.min(3000 * Math.pow(2, attempt), 30000)
    await sleep(waitMs)
  }
  return fetch(url, { headers, cache: "no-store" })
}

async function fetchAllShipmentPages(
  baseUrl: string,
  headers: Record<string, string>,
): Promise<any[]> {
  const allItems: any[] = []
  let page = 1
  let lastPage = 1

  while (page <= lastPage && page <= 50) {
    const sep = baseUrl.includes("?") ? "&" : "?"
    const res = await fetchWithRetry(`${baseUrl}${sep}page=${page}&perPage=100`, headers)
    if (res.status !== 200) break
    const data = await res.json()
    const items = data.items || data.data || []
    allItems.push(...items)
    if (data.pageInfo) {
      lastPage = data.pageInfo.lastPage || Math.ceil((data.pageInfo.totalItems || items.length) / 100) || 1
    }
    if (items.length === 0) break
    if (page < lastPage) await sleep(400)
    page++
  }
  return allItems
}

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

export async function GET(request: NextRequest) {
  try {
    const session = await auth()
    if (!session || (session.user as any).role !== "admin") {
      return NextResponse.json({ error: "Niet geautoriseerd" }, { status: 401 })
    }

    const sp = request.nextUrl.searchParams
    const startDate = sp.get("start") || toDateStr(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000))
    const endDate = sp.get("end") || toDateStr(new Date())

    const apiKeySetting = await prisma.setting.findUnique({
      where: { key: "goedgepickt_api_key" },
    })
    if (!apiKeySetting?.value) {
      return NextResponse.json({ error: "Geen GoedGepickt API key geconfigureerd" }, { status: 400 })
    }

    const headers = {
      Authorization: `Bearer ${apiKeySetting.value}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    }

    // Haal alle zendingen op aangemaakt na startDate
    const url = `${GG_BASE}/shipments?createdAfter=${startDate}`
    const shipments = await fetchAllShipmentPages(url, headers)

    // Groepeer per dag, filter op datumbereik
    const endDateObj = new Date(endDate + "T23:59:59")
    const startDateObj = new Date(startDate + "T00:00:00")

    // Map: date -> gesorteerde array van { time: ISO string, orderNumber?: string }
    const byDay: Record<string, { time: string; orderNumber?: string; orderUuid?: string }[]> = {}

    for (const s of shipments) {
      const rawDate = s.createDate || s.createdAt || s.created_at
      if (!rawDate) continue
      const d = new Date(rawDate)
      if (isNaN(d.getTime())) continue
      if (d < startDateObj || d > endDateObj) continue
      const dayKey = toDateStr(d)
      if (!byDay[dayKey]) byDay[dayKey] = []
      byDay[dayKey].push({
        time: d.toISOString(),
        orderNumber: s.orderNumber || s.order_number || undefined,
        orderUuid: s.orderUuid || s.order_uuid || undefined,
      })
    }

    // Sorteer elke dag op tijd
    for (const day of Object.keys(byDay)) {
      byDay[day].sort((a, b) => a.time.localeCompare(b.time))
    }

    // Bouw resultaat: gesorteerde array van dagen
    const days = Object.keys(byDay)
      .sort()
      .map((date) => {
        const entries = byDay[date]
        // Bereken gaps tussen opeenvolgende zendingen
        const withGaps = entries.map((e, i) => {
          if (i === 0) return { ...e, gapMinutes: null as number | null }
          const prev = new Date(entries[i - 1].time).getTime()
          const curr = new Date(e.time).getTime()
          return {
            ...e,
            gapMinutes: (curr - prev) / 60000,
          }
        })
        return {
          date,
          count: entries.length,
          firstShipment: entries[0]?.time ?? null,
          lastShipment: entries[entries.length - 1]?.time ?? null,
          shipments: withGaps,
        }
      })

    return NextResponse.json({ days, totalShipments: shipments.length })
  } catch (error) {
    console.error("Error fetching shipment timeline:", error)
    return NextResponse.json({ error: "Fout bij ophalen van zendingen" }, { status: 500 })
  }
}
