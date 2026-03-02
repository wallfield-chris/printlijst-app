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

/** Fetch with retry on 429 rate limit — longer waits */
async function fetchWithRetry(url: string, headers: Record<string, string>, retries = 5): Promise<Response> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const res = await fetch(url, { headers, cache: "no-store" })
    if (res.status !== 429) return res
    // Check Retry-After header first, otherwise use exponential backoff
    const retryAfter = res.headers.get("Retry-After")
    const waitMs = retryAfter
      ? parseInt(retryAfter) * 1000
      : Math.min(5000 * Math.pow(2, attempt), 30000)
    console.log(`[SYNC] Rate limited (429), wacht ${waitMs}ms... (poging ${attempt + 1}/${retries + 1})`)
    await sleep(waitMs)
  }
  return fetch(url, { headers, cache: "no-store" })
}

/** Fetch all pages with rate limit handling + inter-page delay */
async function fetchAllPages(url: string, headers: Record<string, string>, maxPages = 200): Promise<{ items: any[]; success: boolean }> {
  const allItems: any[] = []
  let page = 1
  let lastPage = 1

  while (page <= lastPage && page <= maxPages) {
    const sep = url.includes("?") ? "&" : "?"
    const res = await fetchWithRetry(`${url}${sep}page=${page}`, headers)
    if (res.status !== 200) {
      console.log(`[SYNC] fetchAllPages stopped at page ${page}: status ${res.status}`)
      // Return what we have, but mark as failed if we got nothing
      return { items: allItems, success: allItems.length > 0 }
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

    // Vertraging tussen pagina's om rate limits te vermijden
    if (page < lastPage) await sleep(500)
    page++
  }
  return { items: allItems, success: true }
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
    let shipmentsFetchSuccess = false
    let ordersFetchSuccess = false

    // ===================================================================
    // 1. GoedGepickt — Zendingen
    // ===================================================================
    if (ggKeySetting?.value) {
      const headers = ggHeaders(ggKeySetting.value)

      // Eerst wachten om eventuele rate limit te laten herstellen
      console.log("[SYNC] Wacht 3s voor rate limit cooldown...")
      await sleep(3000)

      console.log("[SYNC] Fetching GG shipments...")
      const shipmentsResult = await fetchAllPages(
        `${GG_BASE}/shipments?createdAfter=${startStr}`,
        headers
      )
      ggShipmentsFetched = shipmentsResult.items.length
      shipmentsFetchSuccess = shipmentsResult.success
      console.log(`[SYNC] GG shipments fetched: ${shipmentsResult.items.length} (success: ${shipmentsResult.success})`)

      // Debug: log first few dates
      if (shipmentsResult.items.length > 0) {
        console.log(`[SYNC] First shipment createDate: ${shipmentsResult.items[0].createDate}`)
      }

      // Groepeer per createDate
      for (const s of shipmentsResult.items) {
        const cd = s.createDate ? new Date(s.createDate) : null
        if (cd && !isNaN(cd.getTime())) {
          const dayKey = toDateStr(cd)
          if (dayData[dayKey]) {
            dayData[dayKey].shipments++
          }
        }
      }

      // Pauze tussen secties om rate limit te respecteren
      console.log("[SYNC] Wacht 5s tussen shipments en orders...")
      await sleep(5000)

      // ===================================================================
      // 2. GoedGepickt — Completed Orders (voor afhandeltijd)
      // ===================================================================
      console.log("[SYNC] Fetching GG completed orders...")
      const ordersResult = await fetchAllPages(
        `${GG_BASE}/orders?orderstatus=completed&createdAfter=${startStr}`,
        headers
      )
      ggOrdersFetched = ordersResult.items.length
      ordersFetchSuccess = ordersResult.success
      console.log(`[SYNC] GG completed orders fetched: ${ordersResult.items.length} (success: ${ordersResult.success})`)

      // Groepeer per finishDate
      for (const order of ordersResult.items) {
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
    //    Alleen velden updaten die succesvol gefetcht zijn
    // ===================================================================
    console.log("[SYNC] Writing to database...")
    console.log(`[SYNC] Shipments success: ${shipmentsFetchSuccess}, Orders success: ${ordersFetchSuccess}`)
    let upsertCount = 0

    for (const [date, d] of Object.entries(dayData)) {
      // Build update object - alleen velden die succesvol zijn opgehaald
      const updateData: Record<string, any> = {
        syncedAt: new Date(),
      }
      const createData: Record<string, any> = {
        date,
      }

      // GG shipments - alleen updaten als fetch succesvol was
      if (shipmentsFetchSuccess) {
        updateData.shipments = d.shipments
        createData.shipments = d.shipments
      }

      // GG completed orders - alleen updaten als fetch succesvol was
      if (ordersFetchSuccess) {
        updateData.completedOrders = d.completedOrders
        updateData.processingDaysList = d.processingDays.length > 0 ? JSON.stringify(d.processingDays) : null
        createData.completedOrders = d.completedOrders
        createData.processingDaysList = d.processingDays.length > 0 ? JSON.stringify(d.processingDays) : null
      }

      // Shiftbase - altijd updaten (1 API call, geen rate limit issues)
      if (sbKeySetting?.value) {
        updateData.inpakHours = Math.round(d.inpakHours * 10) / 10
        updateData.inpakEmployees = d.inpakEmployees.length > 0 ? JSON.stringify(d.inpakEmployees) : null
        updateData.printHours = Math.round(d.printHours * 10) / 10
        updateData.allTeamsData = d.allTeams.length > 0 ? JSON.stringify(d.allTeams) : null
        createData.inpakHours = Math.round(d.inpakHours * 10) / 10
        createData.inpakEmployees = d.inpakEmployees.length > 0 ? JSON.stringify(d.inpakEmployees) : null
        createData.printHours = Math.round(d.printHours * 10) / 10
        createData.allTeamsData = d.allTeams.length > 0 ? JSON.stringify(d.allTeams) : null
      }

      await prisma.dailyMetric.upsert({
        where: { date },
        create: createData as any,
        update: updateData,
      })
      upsertCount++
    }

    console.log(`[SYNC] Done! ${upsertCount} dagen opgeslagen`)

    const warnings: string[] = []
    if (!shipmentsFetchSuccess) warnings.push("Zendingen konden niet volledig worden opgehaald (rate limit)")
    if (!ordersFetchSuccess) warnings.push("Orders konden niet volledig worden opgehaald (rate limit)")

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
        shipmentsFetchSuccess,
        ordersFetchSuccess,
      },
      warnings: warnings.length > 0 ? warnings : undefined,
    })
  } catch (error) {
    console.error("[SYNC] Error:", error)
    return NextResponse.json(
      { error: "Fout bij synchroniseren van metrics" },
      { status: 500 }
    )
  }
}
