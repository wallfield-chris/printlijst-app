import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

/** Format date as YYYY-MM-DD in local timezone (niet UTC!) */
function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

/**
 * Employee stats endpoint - voor /data pagina
 * Toont persoonlijke stats + leaderboard
 * Toegankelijk voor alle ingelogde werknemers
 */
export async function GET(request: NextRequest) {
  try {
    const session = await auth()
    if (!session) {
      return NextResponse.json({ error: "Niet geautoriseerd" }, { status: 401 })
    }

    const currentUserId = (session.user as any).id

    // Tijdranges
    const now = new Date()
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const startOf7Days = new Date(startOfToday)
    startOf7Days.setDate(startOf7Days.getDate() - 7)
    const startOf30Days = new Date(startOfToday)
    startOf30Days.setDate(startOf30Days.getDate() - 30)
    const startOfAllTime = new Date(2000, 0, 1)

    // Haal production specs op voor m2 berekeningen
    const productionSpecs = await prisma.productionSpec.findMany()
    const specsByTag: Record<string, { m2: number | null; time: number | null }> = {}
    for (const spec of productionSpecs) {
      specsByTag[spec.tag] = { m2: spec.m2, time: spec.time }
    }

    // Print configuratie (zelfde als frontend)
    const PRINT_CONFIGS = [
      { keywords: ["40x60", "40 x 60 cm"], perRun: 7, m2: 0.24 },
      { keywords: ["60x90", "60 x 90 cm"], perRun: 5, m2: 0.54 },
      { keywords: ["80x120", "80 x 120 cm"], perRun: 2, m2: 0.96 },
      { keywords: ["100x150", "100 x 150 cm"], perRun: 2, m2: 1.5 },
    ]

    function getJobM2(tags: string | null): number {
      if (!tags) return 0
      const tagList = tags.toLowerCase()
      for (const config of PRINT_CONFIGS) {
        if (config.keywords.some(kw => tagList.includes(kw.toLowerCase()))) {
          return config.m2
        }
      }
      return 0
    }

    function getJobFormat(tags: string | null): string | null {
      if (!tags) return null
      const tagList = tags.toLowerCase()
      for (const config of PRINT_CONFIGS) {
        if (config.keywords.some(kw => tagList.includes(kw.toLowerCase()))) return config.keywords[0]
      }
      return null
    }

    // Bereken totale printtijd door eerst alle stuks per formaat op te tellen,
    // dan runs te berekenen: ceil(totaalAantal / perRun) * 20 min
    function calcTotalPrintMinutes(jobs: { tags: string | null; quantity: number }[]): number {
      const qtyByFormat: Record<string, number> = {}
      for (const job of jobs) {
        const fmt = getJobFormat(job.tags)
        if (fmt) qtyByFormat[fmt] = (qtyByFormat[fmt] || 0) + job.quantity
      }
      let totalMinutes = 0
      for (const config of PRINT_CONFIGS) {
        const qty = qtyByFormat[config.keywords[0]] || 0
        if (qty > 0) {
          const runs = Math.ceil(qty / config.perRun)
          totalMinutes += runs * 20
        }
      }
      return totalMinutes
    }

    // Haal alle werknemers op
    const allEmployees = await prisma.user.findMany({
      where: { role: "employee" },
      select: { id: true, name: true, email: true },
    })

    // Helper: stats ophalen voor een bepaalde periode
    async function getStatsForPeriod(from: Date) {
      const completedJobs = await prisma.printJob.findMany({
        where: {
          printStatus: { in: ["completed", "pushed"] },
          completedAt: { gte: from },
          completedBy: { not: null },
        },
        select: {
          id: true,
          completedBy: true,
          completedAt: true,
          startedAt: true,
          quantity: true,
          tags: true,
        },
      })

      // Per werknemer stats berekenen
      const employeeMap: Record<string, {
        jobCount: number
        totalQuantity: number
        totalM2: number
        jobs: { tags: string | null; quantity: number }[]
        processingTimes: number[]
      }> = {}

      for (const emp of allEmployees) {
        employeeMap[emp.id] = {
          jobCount: 0,
          totalQuantity: 0,
          totalM2: 0,
          jobs: [],
          processingTimes: [],
        }
      }

      for (const job of completedJobs) {
        const empId = job.completedBy!
        if (!employeeMap[empId]) {
          employeeMap[empId] = {
            jobCount: 0,
            totalQuantity: 0,
            totalM2: 0,
            jobs: [],
            processingTimes: [],
          }
        }

        const stats = employeeMap[empId]
        stats.jobCount++
        stats.totalQuantity += job.quantity
        stats.totalM2 += getJobM2(job.tags) * job.quantity
        stats.jobs.push({ tags: job.tags, quantity: job.quantity })

        if (job.startedAt && job.completedAt) {
          const ms = job.completedAt.getTime() - job.startedAt.getTime()
          if (ms > 0 && ms < 24 * 60 * 60 * 1000) { // max 24 uur (filter uitschieters)
            stats.processingTimes.push(ms)
          }
        }
      }

      return employeeMap
    }

    // Stats ophalen voor alle periodes
    const [todayStats, weekStats, monthStats, allTimeStats] = await Promise.all([
      getStatsForPeriod(startOfToday),
      getStatsForPeriod(startOf7Days),
      getStatsForPeriod(startOf30Days),
      getStatsForPeriod(startOfAllTime),
    ])

    // Formatteer per werknemer
    function formatEmployeeStats(statsMap: Record<string, any>) {
      return allEmployees.map(emp => {
        const s = statsMap[emp.id] || { jobCount: 0, totalQuantity: 0, totalM2: 0, jobs: [], processingTimes: [] }
        const avgProcessingMs = s.processingTimes.length > 0
          ? s.processingTimes.reduce((a: number, b: number) => a + b, 0) / s.processingTimes.length
          : 0
        return {
          userId: emp.id,
          name: emp.name,
          email: emp.email,
          jobCount: s.jobCount,
          totalQuantity: s.totalQuantity,
          totalM2: Math.round(s.totalM2 * 100) / 100,
          totalPrintMinutes: Math.round(calcTotalPrintMinutes(s.jobs || [])),
          avgProcessingMs: Math.round(avgProcessingMs),
        }
      }).sort((a, b) => b.jobCount - a.jobCount) // sorteer op meeste jobs
    }

    // Dagelijkse breakdown voor de afgelopen 7 dagen (voor grafieken)
    const dailyBreakdown: { date: string; jobCount: number; totalM2: number; totalMinutes: number }[] = []
    for (let i = 6; i >= 0; i--) {
      const dayStart = new Date(startOfToday)
      dayStart.setDate(dayStart.getDate() - i)
      const dayEnd = new Date(dayStart)
      dayEnd.setDate(dayEnd.getDate() + 1)

      const dayJobs = await prisma.printJob.findMany({
        where: {
          printStatus: { in: ["completed", "pushed"] },
          completedAt: { gte: dayStart, lt: dayEnd },
          completedBy: currentUserId,
        },
        select: { quantity: true, tags: true },
      })

      let dayM2 = 0
      for (const job of dayJobs) {
        dayM2 += getJobM2(job.tags) * job.quantity
      }
      const dayMinutes = calcTotalPrintMinutes(dayJobs)

      dailyBreakdown.push({
        date: toDateStr(dayStart),
        jobCount: dayJobs.length,
        totalM2: Math.round(dayM2 * 100) / 100,
        totalMinutes: Math.round(dayMinutes),
      })
    }

    return NextResponse.json({
      currentUserId,
      periods: {
        today: formatEmployeeStats(todayStats),
        week: formatEmployeeStats(weekStats),
        month: formatEmployeeStats(monthStats),
        allTime: formatEmployeeStats(allTimeStats),
      },
      dailyBreakdown,
    })
  } catch (error) {
    console.error("Error in employee stats:", error)
    return NextResponse.json({ error: "Server error" }, { status: 500 })
  }
}
