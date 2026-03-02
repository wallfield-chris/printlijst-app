import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

const GG_BASE = "https://account.goedgepickt.nl/api/v1"
const SB_BASE = "https://api.shiftbase.com/api"
const INPAK_TEAM_ID = 219703
const PRINT_TEAM_ID = 219705

// ===================================================================
// Helpers
// ===================================================================

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

function ggHeaders(apiKey: string) {
  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  }
}

function sbHeaders(apiKey: string) {
  return {
    Authorization: `API ${apiKey}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  }
}

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

/** Fetch with retry on 429 rate limit */
async function fetchWithRetry(url: string, headers: Record<string, string>, retries = 4): Promise<Response> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const res = await fetch(url, { headers, cache: "no-store" })
    if (res.status !== 429) return res
    const waitMs = Math.min(2000 * Math.pow(2, attempt), 15000)
    console.log(`[SYNC] Rate limited (429), wacht ${waitMs}ms... (poging ${attempt + 1}/${retries + 1})`)
    await sleep(waitMs)
  }
  return fetch(url, { headers, cache: "no-store" })
}

/** Fetch all pages with rate limit handling + inter-page delay */
async function fetchAllPages(url: string, headers: Record<string, string>, maxPages = 200): Promise<any[]> {
  const allItems: any[] = []
  let page = 1
  let lastPage = 1

  while (page <= lastPage && page <= maxPages) {
    const sep = url.includes("?") ? "&" : "?"
    const res = await fetchWithRetry(`${url}${sep}page=${page}`, headers)
    if (res.status !== 200) {
      console.log(`[SYNC] fetchAllPages stopped at page ${page}: status ${res.status}`)
      break
    }
    const data = await res.json()
    const items = data.items || data.data || []
    allItems.push(...items)

    if (data.pageInfo) {
      const totalItems = data.pageInfo.totalItems || 0
      const apiLastPage = data.pageInfo.lastPage || 1
      const calculatedLastPage = Math.ceil(totalItems / 15)
      lastPage = Math.max(apiLastPage, calculatedLastPage)
    }
    if (items.length === 0) break

    // Kleine vertraging tussen pagina's om rate limits te vermijden
    if (page < lastPage) await sleep(300)
    page++
  }
  return allItems
}

interface ShiftbaseEntry {
  Timesheet: { id: number; date: string; total: string; team_id: string }
  User: { id: number; name: string; first_name: string; last_name: string }
  Team: { id: string; name: string }
}

// ===================================================================
// POST /api/admin/sync-daily-metrics
// Synct dagelijkse metrics uit GoedGepickt + Shiftbase naar database
// Body: { days?: number } (default: 14)
// ===================================================================
export async function POST(request: NextRequest) {
  try {
    const session = await auth()
    if (!session || (session.user as any).role !== "admin") {
      return NextResponse.json({ error: "Niet geautoriseerd" }, { status: 401 })
    }

    const body = await request.json().catch(() => ({}))
    const days = Math.min(Math.max(body.days || 14, 1), 365)

    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const startDate = new Date(today)
    startDate.setDate(startDate.getDate() - days)
    const startStr = toDateStr(startDate)
    const endStr = toDateStr(today)

    console.log(`[SYNC] Start sync: ${startStr} → ${endStr} (${days} dagen)`)

    // Haal API keys op
    const [ggKeySetting, sbKeySetting] = await Promise.all([
      prisma.setting.findUnique({ where: { key: "goedgepickt_api_key" } }),
      prisma.setting.findUnique({ where: { key: "shiftbase_api_key" } }),
    ])

    // Per-dag accumulators
    const dayData: Record<string, {
      shipments: number
      completedOrders: number
      processingDays: number[]
      inpakHours: number
      inpakEmployees: { name: string; hours: number }[]
      printHours: number
      allTeams: { name: string; hours: number }[]
    }> = {}

    // Initialiseer alle dagen
    for (let i = 0; i <= days; i++) {
      const d = new Date(startDate)
      d.setDate(d.getDate() + i)
      const key = toDateStr(d)
      dayData[key] = {
        shipments: 0,
        completedOrders: 0,
        processingDays: [],
        inpakHours: 0,
        inpakEmployees: [],
        printHours: 0,
        allTeams: [],
      }
    }

    let ggShipmentsFetched = 0
    let ggOrdersFetched = 0

    // ===================================================================
    // 1. GoedGepickt — Zendingen
    // ===================================================================
    if (ggKeySetting?.value) {
      const headers = ggHeaders(ggKeySetting.value)

      console.log("[SYNC] Fetching GG shipments...")
      const allShipments = await fetchAllPages(
        `${GG_BASE}/shipments?createdAfter=${startStr}`,
        headers
      )
      ggShipmentsFetched = allShipments.length
      console.log(`[SYNC] GG shipments fetched: ${allShipments.length}`)

      // Groepeer per createDate
      for (const s of allShipments) {
        const cd = s.createDate ? new Date(s.createDate) : null
        if (cd && !isNaN(cd.getTime())) {
          const dayKey = toDateStr(cd)
          if (dayData[dayKey]) {
            dayData[dayKey].shipments++
          }
        }
      }

      // ===================================================================
      // 2. GoedGepickt — Completed Orders (voor afhandeltijd)
      // ===================================================================
      console.log("[SYNC] Fetching GG completed orders...")
      const allOrders = await fetchAllPages(
        `${GG_BASE}/orders?orderstatus=completed&createdAfter=${startStr}`,
        headers
      )
      ggOrdersFetched = allOrders.length
      console.log(`[SYNC] GG completed orders fetched: ${allOrders.length}`)

      // Groepeer per finishDate
      for (const order of allOrders) {
        const finishDate = order.finishDate ? new Date(order.finishDate) : null
        const createDate = order.createDate ? new Date(order.createDate) : null

        if (finishDate && !isNaN(finishDate.getTime())) {
          const dayKey = toDateStr(finishDate)
          if (dayData[dayKey]) {
            dayData[dayKey].completedOrders++

            // Afhandeltijd in dagen
            if (createDate && !isNaN(createDate.getTime())) {
              const diffDays = (finishDate.getTime() - createDate.getTime()) / (1000 * 60 * 60 * 24)
              if (diffDays >= 0 && diffDays < 365) {
                dayData[dayKey].processingDays.push(
                  Math.round(diffDays * 10) / 10
                )
              }
            }
          }
        }
      }
    }

    // ===================================================================
    // 3. Shiftbase — Timesheets voor alle teams
    // ===================================================================
    if (sbKeySetting?.value) {
      console.log("[SYNC] Fetching Shiftbase timesheets...")
      const res = await fetch(
        `${SB_BASE}/timesheets?min_date=${startStr}&max_date=${endStr}`,
        { headers: sbHeaders(sbKeySetting.value), cache: "no-store" }
      )

      if (res.status === 200) {
        const data = await res.json()
        const entries = (data.data || []) as ShiftbaseEntry[]
        console.log(`[SYNC] Shiftbase entries: ${entries.length}`)

        // Per-dag per-team accumulators
        const dailyTeamHours: Record<string, Record<string, number>> = {}
        const dailyInpakEmps: Record<string, Record<string, number>> = {}

        for (const entry of entries) {
          const date = entry.Timesheet.date
          const hours = parseFloat(entry.Timesheet.total) || 0
          const teamId = String(entry.Team?.id)
          const teamName = entry.Team?.name?.trim() || "Onbekend"
          const empName = entry.User?.name || "Onbekend"

          if (!dayData[date]) continue

          // Track per team per dag
          if (!dailyTeamHours[date]) dailyTeamHours[date] = {}
          dailyTeamHours[date][teamName] = (dailyTeamHours[date][teamName] || 0) + hours

          // Inpak team
          if (teamId === String(INPAK_TEAM_ID)) {
            dayData[date].inpakHours += hours
            if (!dailyInpakEmps[date]) dailyInpakEmps[date] = {}
            dailyInpakEmps[date][empName] = (dailyInpakEmps[date][empName] || 0) + hours
          }

          // Print team
          if (teamId === String(PRINT_TEAM_ID)) {
            dayData[date].printHours += hours
          }
        }

        // Convert accumulator maps naar arrays
        for (const [date, teams] of Object.entries(dailyTeamHours)) {
          if (dayData[date]) {
            dayData[date].allTeams = Object.entries(teams).map(([name, hours]) => ({
              name,
              hours: Math.round(hours * 10) / 10,
            }))
          }
        }
        for (const [date, emps] of Object.entries(dailyInpakEmps)) {
          if (dayData[date]) {
            dayData[date].inpakEmployees = Object.entries(emps)
              .filter(([, hours]) => hours > 0)
              .map(([name, hours]) => ({
                name,
                hours: Math.round(hours * 10) / 10,
              }))
          }
        }
      } else {
        console.log(`[SYNC] Shiftbase fetch failed: ${res.status}`)
      }
    }

    // ===================================================================
    // 4. Opslaan in database — upsert per dag
    // ===================================================================
    console.log("[SYNC] Writing to database...")
    let upsertCount = 0

    for (const [date, d] of Object.entries(dayData)) {
      await prisma.dailyMetric.upsert({
        where: { date },
        create: {
          date,
          shipments: d.shipments,
          completedOrders: d.completedOrders,
          processingDaysList: d.processingDays.length > 0 ? JSON.stringify(d.processingDays) : null,
          inpakHours: Math.round(d.inpakHours * 10) / 10,
          inpakEmployees: d.inpakEmployees.length > 0 ? JSON.stringify(d.inpakEmployees) : null,
          printHours: Math.round(d.printHours * 10) / 10,
          allTeamsData: d.allTeams.length > 0 ? JSON.stringify(d.allTeams) : null,
        },
        update: {
          shipments: d.shipments,
          completedOrders: d.completedOrders,
          processingDaysList: d.processingDays.length > 0 ? JSON.stringify(d.processingDays) : null,
          inpakHours: Math.round(d.inpakHours * 10) / 10,
          inpakEmployees: d.inpakEmployees.length > 0 ? JSON.stringify(d.inpakEmployees) : null,
          printHours: Math.round(d.printHours * 10) / 10,
          allTeamsData: d.allTeams.length > 0 ? JSON.stringify(d.allTeams) : null,
          syncedAt: new Date(),
        },
      })
      upsertCount++
    }

    console.log(`[SYNC] Done! ${upsertCount} dagen opgeslagen`)

    return NextResponse.json({
      success: true,
      synced: {
        days,
        startDate: startStr,
        endDate: endStr,
        rowsWritten: upsertCount,
        ggShipments: ggShipmentsFetched,
        ggOrders: ggOrdersFetched,
        hasShiftbase: !!sbKeySetting?.value,
      },
    })
  } catch (error) {
    console.error("[SYNC] Error:", error)
    return NextResponse.json(
      { error: "Fout bij synchroniseren van metrics" },
      { status: 500 }
    )
  }
}
