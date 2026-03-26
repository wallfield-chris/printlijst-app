import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

// ===================================================================
// Nachtelijke cron job — synct GoedGepickt + Shiftbase data
// Draait elke nacht om 00:00 via externe cron trigger (bijv. cron-job.org)
// Beveiligd met CRON_SECRET header
// Synct de afgelopen 3 dagen zodat data altijd up-to-date is
// ===================================================================

const GG_BASE = "https://account.goedgepickt.nl/api/v1"
const SB_BASE = "https://api.shiftbase.com/api"
const INPAK_TEAM_ID = 219703
const PRINT_TEAM_ID = 219705
const DAYS_TO_SYNC = 3 // Vandaag + gisteren + eergisteren

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

async function fetchWithRetry(url: string, headers: Record<string, string>, retries = 5): Promise<Response> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const res = await fetch(url, { headers, cache: "no-store" })
    if (res.status !== 429) return res
    const retryAfter = res.headers.get("Retry-After")
    const waitMs = retryAfter
      ? parseInt(retryAfter) * 1000
      : Math.min(5000 * Math.pow(2, attempt), 30000)
    console.log(`[CRON] Rate limited (429), wacht ${waitMs}ms... (poging ${attempt + 1}/${retries + 1})`)
    await sleep(waitMs)
  }
  return fetch(url, { headers, cache: "no-store" })
}

async function fetchAllPages(
  url: string,
  headers: Record<string, string>,
  maxPages = 200,
): Promise<{ items: any[]; success: boolean }> {
  const allItems: any[] = []
  let page = 1
  let lastPage = 1

  while (page <= lastPage && page <= maxPages) {
    const sep = url.includes("?") ? "&" : "?"
    const res = await fetchWithRetry(`${url}${sep}page=${page}`, headers)
    if (res.status !== 200) {
      console.log(`[CRON] fetchAllPages stopped at page ${page}: status ${res.status}`)
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
// GET /api/cron/sync-daily-metrics
// Wordt aangeroepen door externe cron service (bijv. cron-job.org)
// Header: Authorization: Bearer <CRON_SECRET>
// ===================================================================
export async function GET(request: NextRequest) {
  const startTime = Date.now()

  try {
    // Beveilig met CRON_SECRET
    const cronSecret = process.env.CRON_SECRET
    if (!cronSecret) {
      console.error("[CRON] CRON_SECRET is niet geconfigureerd")
      return NextResponse.json({ error: "CRON_SECRET niet geconfigureerd" }, { status: 500 })
    }

    const authHeader = request.headers.get("authorization")
    if (authHeader !== `Bearer ${cronSecret}`) {
      console.warn("[CRON] Ongeautoriseerd verzoek")
      return NextResponse.json({ error: "Niet geautoriseerd" }, { status: 401 })
    }

    console.log(`[CRON] Start nachtelijke sync van ${DAYS_TO_SYNC} dagen...`)

    // Bereken datumbereik: vandaag + vorige dagen
    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const startDate = new Date(today)
    startDate.setDate(startDate.getDate() - (DAYS_TO_SYNC - 1))
    const startStr = toDateStr(startDate)
    const endStr = toDateStr(today)

    console.log(`[CRON] Datumbereik: ${startStr} → ${endStr}`)

    // Haal API keys op uit database
    const [ggKeySetting, sbKeySetting] = await Promise.all([
      prisma.setting.findUnique({ where: { key: "goedgepickt_api_key" } }),
      prisma.setting.findUnique({ where: { key: "shiftbase_api_key" } }),
    ])

    // Per-dag data accumulators
    const dayData: Record<string, {
      shipments: number; completedOrders: number; processingDays: number[]
      inpakHours: number; inpakEmployees: { name: string; hours: number }[]
      printHours: number; printEmployees: { name: string; hours: number }[]
      allTeams: { name: string; hours: number }[]
    }> = {}

    for (let i = 0; i < DAYS_TO_SYNC; i++) {
      const d = new Date(startDate)
      d.setDate(d.getDate() + i)
      dayData[toDateStr(d)] = {
        shipments: 0, completedOrders: 0, processingDays: [],
        inpakHours: 0, inpakEmployees: [], printHours: 0, printEmployees: [], allTeams: [],
      }
    }

    let ggShipmentsFetched = 0
    let ggOrdersFetched = 0
    let shipmentsFetchSuccess = false
    let ordersFetchSuccess = false
    let shiftbaseSuccess = false

    // =========================================================
    // STAP 1: GoedGepickt Zendingen
    // =========================================================
    if (ggKeySetting?.value) {
      const headers = ggHeaders(ggKeySetting.value)

      await sleep(2000) // rate limit cooldown

      console.log("[CRON] GoedGepickt zendingen ophalen...")
      const shipmentsResult = await fetchAllPages(
        `${GG_BASE}/shipments?createdAfter=${startStr}`, headers
      )
      ggShipmentsFetched = shipmentsResult.items.length
      shipmentsFetchSuccess = shipmentsResult.success
      console.log(`[CRON] ${shipmentsResult.items.length} zendingen opgehaald (success: ${shipmentsFetchSuccess})`)

      for (const s of shipmentsResult.items) {
        const cd = s.createDate ? new Date(s.createDate) : null
        if (cd && !isNaN(cd.getTime())) {
          const dayKey = toDateStr(cd)
          if (dayData[dayKey]) dayData[dayKey].shipments++
        }
      }

      // =========================================================
      // STAP 2: GoedGepickt Orders
      // =========================================================
      await sleep(5000) // rate limit cooldown

      console.log("[CRON] GoedGepickt orders ophalen...")
      const ordersResult = await fetchAllPages(
        `${GG_BASE}/orders?orderstatus=completed&createdAfter=${startStr}`, headers
      )
      ggOrdersFetched = ordersResult.items.length
      ordersFetchSuccess = ordersResult.success
      console.log(`[CRON] ${ordersResult.items.length} orders opgehaald (success: ${ordersFetchSuccess})`)

      for (const order of ordersResult.items) {
        const finishDate = order.finishDate ? new Date(order.finishDate) : null
        const createDate = order.createDate ? new Date(order.createDate) : null
        if (finishDate && !isNaN(finishDate.getTime())) {
          const dayKey = toDateStr(finishDate)
          if (dayData[dayKey]) {
            dayData[dayKey].completedOrders++
            if (createDate && !isNaN(createDate.getTime())) {
              const diffDays = (finishDate.getTime() - createDate.getTime()) / (1000 * 60 * 60 * 24)
              if (diffDays >= 0 && diffDays < 365) {
                dayData[dayKey].processingDays.push(Math.round(diffDays * 10) / 10)
              }
            }
          }
        }
      }
    } else {
      console.log("[CRON] GoedGepickt overgeslagen (geen API key)")
    }

    // =========================================================
    // STAP 3: Shiftbase
    // =========================================================
    if (sbKeySetting?.value) {
      console.log("[CRON] Shiftbase uren ophalen...")
      const res = await fetch(
        `${SB_BASE}/timesheets?min_date=${startStr}&max_date=${endStr}`,
        { headers: sbHeaders(sbKeySetting.value), cache: "no-store" }
      )

      if (res.status === 200) {
        const data = await res.json()
        const entries = (data.data || []) as ShiftbaseEntry[]
        shiftbaseSuccess = true
        console.log(`[CRON] ${entries.length} Shiftbase entries opgehaald`)

        const dailyTeamHours: Record<string, Record<string, number>> = {}
        const dailyInpakEmps: Record<string, Record<string, number>> = {}
        const dailyPrintEmps: Record<string, Record<string, number>> = {}

        for (const entry of entries) {
          const date = entry.Timesheet.date
          const hours = parseFloat(entry.Timesheet.total) || 0
          const teamId = String(entry.Team?.id)
          const teamName = entry.Team?.name?.trim() || "Onbekend"
          const empName = entry.User?.name || "Onbekend"
          if (!dayData[date]) continue
          if (!dailyTeamHours[date]) dailyTeamHours[date] = {}
          dailyTeamHours[date][teamName] = (dailyTeamHours[date][teamName] || 0) + hours
          if (teamId === String(INPAK_TEAM_ID)) {
            dayData[date].inpakHours += hours
            if (!dailyInpakEmps[date]) dailyInpakEmps[date] = {}
            dailyInpakEmps[date][empName] = (dailyInpakEmps[date][empName] || 0) + hours
          }
          if (teamId === String(PRINT_TEAM_ID)) {
            dayData[date].printHours += hours
            if (!dailyPrintEmps[date]) dailyPrintEmps[date] = {}
            dailyPrintEmps[date][empName] = (dailyPrintEmps[date][empName] || 0) + hours
          }
        }
        for (const [date, teams] of Object.entries(dailyTeamHours)) {
          if (dayData[date]) {
            dayData[date].allTeams = Object.entries(teams).map(([name, hours]) => ({ name, hours: Math.round(hours * 10) / 10 }))
          }
        }
        for (const [date, emps] of Object.entries(dailyInpakEmps)) {
          if (dayData[date]) {
            dayData[date].inpakEmployees = Object.entries(emps).filter(([, hours]) => hours > 0).map(([name, hours]) => ({ name, hours: Math.round(hours * 10) / 10 }))
          }
        }
        for (const [date, emps] of Object.entries(dailyPrintEmps)) {
          if (dayData[date]) {
            dayData[date].printEmployees = Object.entries(emps).filter(([, hours]) => hours > 0).map(([name, hours]) => ({ name, hours: Math.round(hours * 10) / 10 }))
          }
        }
      } else {
        console.error(`[CRON] Shiftbase fout: status ${res.status}`)
      }
    } else {
      console.log("[CRON] Shiftbase overgeslagen (geen API key)")
    }

    // =========================================================
    // STAP 4: Opslaan in database
    // =========================================================
    console.log("[CRON] Opslaan in database...")
    let upsertCount = 0

    for (const [date, d] of Object.entries(dayData)) {
      const updateData: Record<string, any> = { syncedAt: new Date() }
      const createData: Record<string, any> = { date }

      if (shipmentsFetchSuccess) {
        updateData.shipments = d.shipments
        createData.shipments = d.shipments
      }
      if (ordersFetchSuccess) {
        updateData.completedOrders = d.completedOrders
        updateData.processingDaysList = d.processingDays.length > 0 ? JSON.stringify(d.processingDays) : null
        createData.completedOrders = d.completedOrders
        createData.processingDaysList = d.processingDays.length > 0 ? JSON.stringify(d.processingDays) : null
      }
      if (sbKeySetting?.value) {
        updateData.inpakHours = Math.round(d.inpakHours * 10) / 10
        updateData.inpakEmployees = d.inpakEmployees.length > 0 ? JSON.stringify(d.inpakEmployees) : null
        updateData.printHours = Math.round(d.printHours * 10) / 10
        updateData.printEmployees = d.printEmployees.length > 0 ? JSON.stringify(d.printEmployees) : null
        updateData.allTeamsData = d.allTeams.length > 0 ? JSON.stringify(d.allTeams) : null
        createData.inpakHours = Math.round(d.inpakHours * 10) / 10
        createData.inpakEmployees = d.inpakEmployees.length > 0 ? JSON.stringify(d.inpakEmployees) : null
        createData.printHours = Math.round(d.printHours * 10) / 10
        createData.printEmployees = d.printEmployees.length > 0 ? JSON.stringify(d.printEmployees) : null
        createData.allTeamsData = d.allTeams.length > 0 ? JSON.stringify(d.allTeams) : null
      }

      await prisma.dailyMetric.upsert({ where: { date }, create: createData as any, update: updateData })
      upsertCount++
    }

    const durationMs = Date.now() - startTime
    const result = {
      success: true,
      message: "Nachtelijke sync voltooid",
      duration: `${Math.round(durationMs / 1000)}s`,
      period: { start: startStr, end: endStr, days: DAYS_TO_SYNC },
      goedgepickt: {
        shipments: ggShipmentsFetched,
        orders: ggOrdersFetched,
        shipmentsFetchSuccess,
        ordersFetchSuccess,
      },
      shiftbase: {
        success: shiftbaseSuccess,
        configured: !!sbKeySetting?.value,
      },
      rowsWritten: upsertCount,
      syncedAt: new Date().toISOString(),
    }

    console.log(`[CRON] ✅ Sync voltooid in ${Math.round(durationMs / 1000)}s — ${upsertCount} rijen bijgewerkt`)

    return NextResponse.json(result, { status: 200 })
  } catch (error) {
    const durationMs = Date.now() - startTime
    console.error(`[CRON] ❌ Fout na ${Math.round(durationMs / 1000)}s:`, error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        duration: `${Math.round(durationMs / 1000)}s`,
      },
      { status: 500 }
    )
  }
}
