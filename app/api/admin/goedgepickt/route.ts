import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

// ===================================================================
// GET /api/admin/goedgepickt
// Leest nu uit DailyMetric tabel — GEEN externe API calls meer!
// Data wordt gevuld door POST /api/admin/sync-daily-metrics
// ===================================================================

const COST_PER_HOUR = 17 // €17 gemiddeld per uur

const VALID_PERIODS = ["today", "yesterday", "7d", "14d", "30d", "90d", "this_month", "last_month", "custom"] as const
type Period = (typeof VALID_PERIODS)[number]

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

/** Bereken start- en einddatum voor een periode */
function getPeriodDates(period: Period, now: Date, customStart?: string, customEnd?: string): { startDate: string; endDate: string; label: string; days: number } {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())

  switch (period) {
    case "today": {
      return { startDate: toDateStr(today), endDate: toDateStr(today), label: "vandaag", days: 1 }
    }
    case "yesterday": {
      const yday = new Date(today); yday.setDate(yday.getDate() - 1)
      return { startDate: toDateStr(yday), endDate: toDateStr(yday), label: "gisteren", days: 1 }
    }
    case "7d": {
      const start = new Date(today); start.setDate(start.getDate() - 7)
      return { startDate: toDateStr(start), endDate: toDateStr(today), label: "7 dagen", days: 7 }
    }
    case "14d": {
      const start = new Date(today); start.setDate(start.getDate() - 14)
      return { startDate: toDateStr(start), endDate: toDateStr(today), label: "14 dagen", days: 14 }
    }
    case "30d": {
      const start = new Date(today); start.setDate(start.getDate() - 30)
      return { startDate: toDateStr(start), endDate: toDateStr(today), label: "30 dagen", days: 30 }
    }
    case "90d": {
      const start = new Date(today); start.setDate(start.getDate() - 90)
      return { startDate: toDateStr(start), endDate: toDateStr(today), label: "90 dagen", days: 90 }
    }
    case "this_month": {
      const start = new Date(today.getFullYear(), today.getMonth(), 1)
      const daysSoFar = Math.ceil((today.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1
      return { startDate: toDateStr(start), endDate: toDateStr(today), label: "deze maand", days: daysSoFar }
    }
    case "last_month": {
      const start = new Date(today.getFullYear(), today.getMonth() - 1, 1)
      const end = new Date(today.getFullYear(), today.getMonth(), 0)
      const daysInMonth = end.getDate()
      return { startDate: toDateStr(start), endDate: toDateStr(end), label: "vorige maand", days: daysInMonth }
    }
    case "custom": {
      if (!customStart || !customEnd) {
        // Fallback to 14d if custom dates missing
        const start = new Date(today); start.setDate(start.getDate() - 14)
        return { startDate: toDateStr(start), endDate: toDateStr(today), label: "14 dagen", days: 14 }
      }
      const s = new Date(customStart + "T00:00:00")
      const e = new Date(customEnd + "T00:00:00")
      const diffMs = e.getTime() - s.getTime()
      const days = Math.max(1, Math.round(diffMs / (1000 * 60 * 60 * 24)) + 1)
      const label = `${customStart.slice(8)}/${customStart.slice(5,7)} – ${customEnd.slice(8)}/${customEnd.slice(5,7)}`
      return { startDate: customStart, endDate: customEnd, label, days }
    }
  }
}

/** Get Monday of a given week */
function getMondayOfWeek(date: Date): Date {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  const day = d.getDay()
  const diff = day === 0 ? 6 : day - 1
  d.setDate(d.getDate() - diff)
  return d
}

/** Aggregeer DailyMetric rijen */
function aggregateMetrics(metrics: any[]) {
  let totalShipments = 0
  let totalCompleted = 0
  let totalInpakHours = 0
  let totalPrintHours = 0
  const allProcessingDays: number[] = []
  const employeeMap: Record<string, { totalHours: number; daysSet: Set<string> }> = {}
  const printEmployeeMap: Record<string, { totalHours: number; daysSet: Set<string> }> = {}
  const teamMap: Record<string, { totalHours: number; daysSet: Set<string> }> = {}

  for (const m of metrics) {
    totalShipments += m.shipments
    totalCompleted += m.completedOrders
    totalInpakHours += m.inpakHours
    totalPrintHours += m.printHours

    // Processing days
    if (m.processingDaysList) {
      try {
        const days = JSON.parse(m.processingDaysList) as number[]
        allProcessingDays.push(...days)
      } catch {}
    }

    // Inpak employees
    if (m.inpakEmployees) {
      try {
        const emps = JSON.parse(m.inpakEmployees) as { name: string; hours: number }[]
        for (const e of emps) {
          if (!employeeMap[e.name]) employeeMap[e.name] = { totalHours: 0, daysSet: new Set() }
          employeeMap[e.name].totalHours += e.hours
          employeeMap[e.name].daysSet.add(m.date)
        }
      } catch {}
    }

    // Print employees
    if (m.printEmployees) {
      try {
        const emps = JSON.parse(m.printEmployees) as { name: string; hours: number }[]
        for (const e of emps) {
          if (!printEmployeeMap[e.name]) printEmployeeMap[e.name] = { totalHours: 0, daysSet: new Set() }
          printEmployeeMap[e.name].totalHours += e.hours
          printEmployeeMap[e.name].daysSet.add(m.date)
        }
      } catch {}
    }

    // All teams
    if (m.allTeamsData) {
      try {
        const teams = JSON.parse(m.allTeamsData) as { name: string; hours: number }[]
        for (const t of teams) {
          if (!teamMap[t.name]) teamMap[t.name] = { totalHours: 0, daysSet: new Set() }
          teamMap[t.name].totalHours += t.hours
          teamMap[t.name].daysSet.add(m.date)
        }
      } catch {}
    }
  }

  // Processing stats
  const avgDays = allProcessingDays.length > 0
    ? allProcessingDays.reduce((a, b) => a + b, 0) / allProcessingDays.length
    : 0
  const sorted = [...allProcessingDays].sort((a, b) => a - b)
  const medianDays = sorted.length > 0
    ? sorted.length % 2 === 0
      ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
      : sorted[Math.floor(sorted.length / 2)]
    : 0

  // Buckets
  const buckets = { sameDay: 0, oneToTwo: 0, twoToFive: 0, fiveToTen: 0, tenPlus: 0 }
  for (const d of allProcessingDays) {
    if (d < 1) buckets.sameDay++
    else if (d < 2) buckets.oneToTwo++
    else if (d < 5) buckets.twoToFive++
    else if (d < 10) buckets.fiveToTen++
    else buckets.tenPlus++
  }

  // Employee stats (Inpak)
  const employeeStats = Object.entries(employeeMap)
    .map(([name, data]) => ({
      name,
      totalHours: Math.round(data.totalHours * 10) / 10,
      days: data.daysSet.size,
      avgHoursPerDay: data.daysSet.size > 0
        ? Math.round((data.totalHours / data.daysSet.size) * 10) / 10
        : 0,
      cost: Math.round(data.totalHours * COST_PER_HOUR),
    }))
    .sort((a, b) => b.totalHours - a.totalHours)

  // Employee stats (Print)
  const printEmployeeStats = Object.entries(printEmployeeMap)
    .map(([name, data]) => ({
      name,
      totalHours: Math.round(data.totalHours * 10) / 10,
      days: data.daysSet.size,
      avgHoursPerDay: data.daysSet.size > 0
        ? Math.round((data.totalHours / data.daysSet.size) * 10) / 10
        : 0,
      cost: Math.round(data.totalHours * COST_PER_HOUR),
    }))
    .sort((a, b) => b.totalHours - a.totalHours)

  // Team stats
  const teamStats = Object.entries(teamMap)
    .map(([name, data]) => ({
      name,
      totalHours: Math.round(data.totalHours * 10) / 10,
      days: data.daysSet.size,
    }))
    .sort((a, b) => b.totalHours - a.totalHours)

  const totalCost = Math.round(totalInpakHours * COST_PER_HOUR)
  const shipmentsPerHour = totalInpakHours > 0
    ? Math.round((totalShipments / totalInpakHours) * 10) / 10
    : 0
  const costPerShipment = totalShipments > 0
    ? Math.round((totalCost / totalShipments) * 100) / 100
    : 0

  return {
    totalShipments,
    totalCompleted,
    totalInpakHours: Math.round(totalInpakHours * 10) / 10,
    totalPrintHours: Math.round(totalPrintHours * 10) / 10,
    processing: {
      avgDays: Math.round(avgDays * 10) / 10,
      medianDays: Math.round(medianDays * 10) / 10,
      totalOrders: allProcessingDays.length,
      buckets,
    },
    employeeStats,
    printEmployeeStats,
    teamStats,
    totalCost,
    shipmentsPerHour,
    costPerShipment,
  }
}

export async function GET(request: NextRequest) {
  try {
    const session = await auth()
    if (!session || (session.user as any).role !== "admin") {
      return NextResponse.json({ error: "Niet geautoriseerd" }, { status: 401 })
    }

    const periodParam = request.nextUrl.searchParams.get("period") || "14d"
    const customStart = request.nextUrl.searchParams.get("startDate") || undefined
    const customEnd = request.nextUrl.searchParams.get("endDate") || undefined
    const period: Period = VALID_PERIODS.includes(periodParam as Period) ? (periodParam as Period) : "14d"

    const now = new Date()
    const { startDate: periodStartStr, endDate: periodEndStr, label: periodLabel, days: periodDays } = getPeriodDates(period, now, customStart, customEnd)

    // Vorige periode (zelfde lengte, direct ervoor)
    const periodStart = new Date(periodStartStr + "T00:00:00")
    const prevPeriodStart = new Date(periodStart)
    prevPeriodStart.setDate(prevPeriodStart.getDate() - periodDays)
    const prevPeriodStartStr = toDateStr(prevPeriodStart)

    // ===================================================================
    // DB query — razendsnel, geen externe API calls
    // ===================================================================
    const [currentMetrics, prevMetrics, lastSync] = await Promise.all([
      prisma.dailyMetric.findMany({
        where: { date: { gte: periodStartStr, lte: periodEndStr } },
        orderBy: { date: "asc" },
      }),
      prisma.dailyMetric.findMany({
        where: { date: { gte: prevPeriodStartStr, lt: periodStartStr } },
        orderBy: { date: "asc" },
      }),
      prisma.dailyMetric.findFirst({
        orderBy: { syncedAt: "desc" },
        select: { syncedAt: true },
      }),
    ])

    // Check of er data is
    if (currentMetrics.length === 0 && prevMetrics.length === 0) {
      return NextResponse.json({
        needsSync: true,
        error: "Geen data beschikbaar. Klik op 'Synchroniseren' om data op te halen.",
      }, { status: 200 })
    }

    // Aggregeer huidige en vorige periode
    const current = aggregateMetrics(currentMetrics)
    const prev = aggregateMetrics(prevMetrics)

    // Dagelijkse breakdown
    const dailyData = currentMetrics.map(m => {
      const inpakEmployees: { name: string; hours: number }[] = m.inpakEmployees
        ? (() => { try { return JSON.parse(m.inpakEmployees) } catch { return [] } })()
        : []
      return {
        date: m.date,
        shipments: m.shipments,
        completed: m.completedOrders,
        inpakHours: Math.round(m.inpakHours * 10) / 10,
        printHours: Math.round(m.printHours * 10) / 10,
        inpakEmployees,
        shipmentsPerHour: m.inpakHours > 0
          ? Math.round((m.shipments / m.inpakHours) * 10) / 10
          : 0,
      }
    })

    // Weekly efficiency
    const weeklyMap: Record<string, { shipments: number; hours: number }> = {}
    for (const m of currentMetrics) {
      const d = new Date(m.date + "T00:00:00")
      const monday = getMondayOfWeek(d)
      const weekKey = toDateStr(monday)
      if (!weeklyMap[weekKey]) weeklyMap[weekKey] = { shipments: 0, hours: 0 }
      weeklyMap[weekKey].shipments += m.shipments
      weeklyMap[weekKey].hours += m.inpakHours
    }
    const weeklyEfficiency = Object.entries(weeklyMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([week, data]) => ({
        week,
        shipments: data.shipments,
        hours: Math.round(data.hours * 10) / 10,
        perHour: data.hours > 0 ? Math.round((data.shipments / data.hours) * 10) / 10 : 0,
      }))

    const avgPerDay = periodDays > 0 ? Math.round((current.totalShipments / periodDays) * 10) / 10 : 0
    const prevAvgPerDay = periodDays > 0 ? Math.round((prev.totalShipments / periodDays) * 10) / 10 : 0

    const responseData = {
      period,
      periodLabel,
      periodDays,
      shipments: {
        total: current.totalShipments,
        avgPerDay,
      },
      completedOrders: {
        totalPeriod: current.totalCompleted,
        fetched: current.totalCompleted,
      },
      processing: current.processing,
      previousPeriod: {
        shipments: prev.totalShipments,
        avgPerDay: prevAvgPerDay,
        completedOrders: prev.totalCompleted,
        shipmentsPerHour: prev.shipmentsPerHour,
        totalHours: prev.totalInpakHours,
        totalCost: prev.totalCost,
        costPerShipment: prev.costPerShipment,
      },
      dailyData,
      shiftbase: current.totalInpakHours > 0 || current.totalPrintHours > 0 ? {
        available: true,
        totalHours: current.totalInpakHours,
        totalPrintHours: current.totalPrintHours,
        totalShipments: current.totalShipments,
        shipmentsPerHour: current.shipmentsPerHour,
        totalCost: current.totalCost,
        costPerShipment: current.costPerShipment,
        employeeStats: current.employeeStats,
        printEmployeeStats: current.printEmployeeStats,
        teamStats: current.teamStats,
        weeklyEfficiency,
      } : { available: false },
      lastSyncedAt: lastSync?.syncedAt?.toISOString() ?? null,
      // Auto-sync: als laatste sync > 12 uur geleden, geef signaal aan frontend
      needsAutoSync: lastSync?.syncedAt
        ? (Date.now() - new Date(lastSync.syncedAt).getTime()) > 12 * 60 * 60 * 1000
        : true,
    }

    return NextResponse.json(responseData)
  } catch (error: any) {
    console.error("Error in admin goedgepickt stats:", error)
    return NextResponse.json({ 
      error: "Fout bij ophalen van GoedGepickt data",
      detail: error?.message || String(error),
    }, { status: 500 })
  }
}
