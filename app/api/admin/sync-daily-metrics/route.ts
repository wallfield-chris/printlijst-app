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
async function fetchAllPages(
  url: string,
  headers: Record<string, string>,
  maxPages = 200,
  onPage?: (page: number, totalPages: number) => void
): Promise<{ items: any[]; success: boolean }> {
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

    // Report progress
    if (onPage) onPage(page, lastPage)

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
// Streamt voortgang via Server-Sent Events (SSE)
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

    // Haal API keys op
    const [ggKeySetting, sbKeySetting] = await Promise.all([
      prisma.setting.findUnique({ where: { key: "goedgepickt_api_key" } }),
      prisma.setting.findUnique({ where: { key: "shiftbase_api_key" } }),
    ])

    // Use SSE stream for progress
    const encoder = new TextEncoder()
    const stream = new ReadableStream({
      async start(controller) {
        const send = (data: Record<string, any>) => {
          try {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
          } catch { /* stream closed */ }
        }

        try {
          send({ type: "start", message: `Synchronisatie gestart: ${days} dagen (${startStr} → ${endStr})`, step: 0, totalSteps: 5 })

          // Per-dag accumulators
          const dayData: Record<string, {
            shipments: number; completedOrders: number; processingDays: number[];
            inpakHours: number; inpakEmployees: { name: string; hours: number }[];
            printHours: number; printEmployees: { name: string; hours: number }[];
            allTeams: { name: string; hours: number }[];
          }> = {}

          for (let i = 0; i <= days; i++) {
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

          // =========================================================
          // STAP 1: GoedGepickt Zendingen
          // =========================================================
          if (ggKeySetting?.value) {
            const headers = ggHeaders(ggKeySetting.value)

            send({ type: "progress", message: "Even wachten voor rate limit cooldown...", step: 1, totalSteps: 5, detail: "3 seconden pauze" })
            await sleep(3000)

            send({ type: "progress", message: "GoedGepickt zendingen ophalen...", step: 1, totalSteps: 5, detail: "Pagina's laden" })
            const shipmentsResult = await fetchAllPages(
              `${GG_BASE}/shipments?createdAfter=${startStr}`, headers,
              200, (page, total) => send({ type: "progress", message: `GoedGepickt zendingen ophalen...`, step: 1, totalSteps: 5, detail: `Pagina ${page}${total > 1 ? ` van ~${total}` : ""}` })
            )
            ggShipmentsFetched = shipmentsResult.items.length
            shipmentsFetchSuccess = shipmentsResult.success
            send({ type: "progress", message: `✅ ${shipmentsResult.items.length} zendingen opgehaald`, step: 1, totalSteps: 5, detail: shipmentsFetchSuccess ? "Succes" : "⚠️ Niet volledig (rate limit)" })

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
            send({ type: "progress", message: "Wachten tussen API calls...", step: 2, totalSteps: 5, detail: "5 seconden pauze (rate limit)" })
            await sleep(5000)

            send({ type: "progress", message: "GoedGepickt afgeronde orders ophalen...", step: 2, totalSteps: 5, detail: "Pagina's laden" })
            const ordersResult = await fetchAllPages(
              `${GG_BASE}/orders?orderstatus=completed&createdAfter=${startStr}`, headers,
              200, (page, total) => send({ type: "progress", message: `GoedGepickt orders ophalen...`, step: 2, totalSteps: 5, detail: `Pagina ${page}${total > 1 ? ` van ~${total}` : ""}` })
            )
            ggOrdersFetched = ordersResult.items.length
            ordersFetchSuccess = ordersResult.success
            send({ type: "progress", message: `✅ ${ordersResult.items.length} orders opgehaald`, step: 2, totalSteps: 5, detail: ordersFetchSuccess ? "Succes" : "⚠️ Niet volledig (rate limit)" })

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
            send({ type: "progress", message: "⏭️ GoedGepickt overgeslagen (geen API key)", step: 2, totalSteps: 5 })
          }

          // =========================================================
          // STAP 3: Shiftbase
          // =========================================================
          if (sbKeySetting?.value) {
            send({ type: "progress", message: "Shiftbase uren ophalen...", step: 3, totalSteps: 5, detail: "Timesheets laden" })
            const res = await fetch(
              `${SB_BASE}/timesheets?min_date=${startStr}&max_date=${endStr}`,
              { headers: sbHeaders(sbKeySetting.value), cache: "no-store" }
            )

            if (res.status === 200) {
              const data = await res.json()
              const entries = (data.data || []) as ShiftbaseEntry[]
              send({ type: "progress", message: `✅ ${entries.length} Shiftbase entries opgehaald`, step: 3, totalSteps: 5 })

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
              send({ type: "progress", message: `⚠️ Shiftbase fout: status ${res.status}`, step: 3, totalSteps: 5, detail: "Data overgeslagen" })
            }
          } else {
            send({ type: "progress", message: "⏭️ Shiftbase overgeslagen (geen API key)", step: 3, totalSteps: 5 })
          }

          // =========================================================
          // STAP 4: Opslaan in database
          // =========================================================
          send({ type: "progress", message: "Opslaan in database...", step: 4, totalSteps: 5, detail: `${Object.keys(dayData).length} dagen wegschrijven` })
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

          // =========================================================
          // STAP 5: Klaar
          // =========================================================
          const warnings: string[] = []
          if (!shipmentsFetchSuccess) warnings.push("Zendingen niet volledig opgehaald (rate limit)")
          if (!ordersFetchSuccess) warnings.push("Orders niet volledig opgehaald (rate limit)")

          send({
            type: "done",
            message: "Synchronisatie voltooid!",
            step: 5,
            totalSteps: 5,
            result: {
              days, startDate: startStr, endDate: endStr,
              rowsWritten: upsertCount, ggShipments: ggShipmentsFetched, ggOrders: ggOrdersFetched,
              hasShiftbase: !!sbKeySetting?.value, shipmentsFetchSuccess, ordersFetchSuccess,
            },
            warnings: warnings.length > 0 ? warnings : undefined,
          })
        } catch (error) {
          send({ type: "error", message: `Fout: ${error instanceof Error ? error.message : String(error)}` })
        } finally {
          controller.close()
        }
      }
    })

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
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
