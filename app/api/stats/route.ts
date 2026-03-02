import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

/** Format date as YYYY-MM-DD in local timezone (niet UTC!) */
function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

const PRINT_CONFIGS = [
  { keywords: ["40x60", "40 x 60 cm"], perRun: 7, m2: 0.24 },
  { keywords: ["60x90", "60 x 90 cm"], perRun: 5, m2: 0.54 },
  { keywords: ["80x120", "80 x 120 cm"], perRun: 2, m2: 0.96 },
  { keywords: ["100x150", "100 x 150 cm"], perRun: 2, m2: 1.5 },
]

function getJobM2(tags: string | null): number {
  if (!tags) return 0
  const t = tags.toLowerCase()
  for (const c of PRINT_CONFIGS) {
    if (c.keywords.some(kw => t.includes(kw.toLowerCase()))) return c.m2
  }
  return 0
}

function getJobFormat(tags: string | null): string | null {
  if (!tags) return null
  const t = tags.toLowerCase()
  for (const c of PRINT_CONFIGS) {
    if (c.keywords.some(kw => t.includes(kw.toLowerCase()))) return c.keywords[0]
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
  for (const c of PRINT_CONFIGS) {
    const qty = qtyByFormat[c.keywords[0]] || 0
    if (qty > 0) {
      const runs = Math.ceil(qty / c.perRun)
      totalMinutes += runs * 20
    }
  }
  return totalMinutes
}

export async function GET(request: NextRequest) {
  try {
    const session = await auth()
    
    if (!session || (session.user as any).role !== "admin") {
      return NextResponse.json({ error: "Niet geautoriseerd" }, { status: 401 })
    }

    const now = new Date()
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const startOf7Days = new Date(startOfToday)
    startOf7Days.setDate(startOf7Days.getDate() - 7)
    const startOf30Days = new Date(startOfToday)
    startOf30Days.setDate(startOf30Days.getDate() - 30)

    // Status counts
    const statusCounts = await prisma.printJob.groupBy({
      by: ["printStatus"],
      _count: true,
    })

    // Open jobs (pending + in_progress)
    const openJobs = await prisma.printJob.findMany({
      where: { printStatus: { in: ["pending", "in_progress"] } },
      select: { quantity: true, tags: true },
    })

    let openM2 = 0
    for (const job of openJobs) {
      openM2 += getJobM2(job.tags) * job.quantity
    }
    const openPrintMinutes = calcTotalPrintMinutes(openJobs)

    // Helper: production stats for completed jobs in a period
    async function getPeriodProduction(from: Date, until?: Date) {
      const jobs = await prisma.printJob.findMany({
        where: {
          printStatus: { in: ["completed", "pushed"] },
          completedAt: { gte: from, ...(until ? { lt: until } : {}) },
          completedBy: { not: null },
        },
        select: {
          id: true, completedBy: true, completedAt: true, startedAt: true,
          quantity: true, tags: true,
        },
      })

      let totalM2 = 0
      let totalQuantity = 0
      const processingTimes: number[] = []

      // Per-employee accumulator
      const empMap: Record<string, {
        jobCount: number; totalQuantity: number; totalM2: number;
        jobs: { tags: string | null; quantity: number }[]; processingTimes: number[]
      }> = {}

      for (const job of jobs) {
        const m2 = getJobM2(job.tags) * job.quantity
        totalM2 += m2
        totalQuantity += job.quantity

        if (job.startedAt && job.completedAt) {
          const ms = job.completedAt.getTime() - job.startedAt.getTime()
          if (ms > 0 && ms < 24 * 3600 * 1000) processingTimes.push(ms)
        }

        const eId = job.completedBy!
        if (!empMap[eId]) {
          empMap[eId] = { jobCount: 0, totalQuantity: 0, totalM2: 0, jobs: [], processingTimes: [] }
        }
        empMap[eId].jobCount++
        empMap[eId].totalQuantity += job.quantity
        empMap[eId].totalM2 += m2
        empMap[eId].jobs.push({ tags: job.tags, quantity: job.quantity })
        if (job.startedAt && job.completedAt) {
          const ms = job.completedAt.getTime() - job.startedAt.getTime()
          if (ms > 0 && ms < 24 * 3600 * 1000) empMap[eId].processingTimes.push(ms)
        }
      }

      // Bereken printtijd geaggregeerd per formaat
      const totalPrintMinutes = calcTotalPrintMinutes(jobs)

      const avgProcessingMs = processingTimes.length > 0
        ? processingTimes.reduce((a, b) => a + b, 0) / processingTimes.length
        : 0

      // m²/uur = totalM2 / geschatte printtijd in uren
      const printHours = totalPrintMinutes / 60
      const m2PerHour = printHours > 0 ? totalM2 / printHours : 0

      return {
        jobCount: jobs.length,
        totalQuantity,
        totalM2: Math.round(totalM2 * 100) / 100,
        totalPrintMinutes: Math.round(totalPrintMinutes),
        avgProcessingMs: Math.round(avgProcessingMs),
        m2PerHour: Math.round(m2PerHour * 100) / 100,
        employeeMap: empMap,
      }
    }

    // Previous periods voor percentage change badges
    const startOfYesterday = new Date(startOfToday)
    startOfYesterday.setDate(startOfYesterday.getDate() - 1)
    const startOfPrev7Days = new Date(startOfToday)
    startOfPrev7Days.setDate(startOfPrev7Days.getDate() - 14)
    const startOfPrev30Days = new Date(startOfToday)
    startOfPrev30Days.setDate(startOfPrev30Days.getDate() - 60)

    const [todayProd, weekProd, monthProd, prevTodayProd, prevWeekProd, prevMonthProd] = await Promise.all([
      getPeriodProduction(startOfToday),
      getPeriodProduction(startOf7Days),
      getPeriodProduction(startOf30Days),
      getPeriodProduction(startOfYesterday, startOfToday),
      getPeriodProduction(startOfPrev7Days, startOf7Days),
      getPeriodProduction(startOfPrev30Days, startOf30Days),
    ])

    // Shiftbase Print Team werktijden uit DailyMetric tabel (geen live API calls)
    let shiftbaseHours: {
      today: number
      week: number
      month: number
      dailyHours: Record<string, number>
      prevToday: number
      prevWeek: number
      prevMonth: number
    } | null = null

    try {
      // Lees alle DailyMetric rijen voor de volledige range (60 dagen terug)
      const metrics = await prisma.dailyMetric.findMany({
        where: { date: { gte: toDateStr(startOfPrev30Days) } },
        select: { date: true, printHours: true },
      })

      if (metrics.length > 0) {
        const dailyHours: Record<string, number> = {}
        for (const m of metrics) {
          dailyHours[m.date] = m.printHours
        }

        const todayStr = toDateStr(startOfToday)
        const todayHours = dailyHours[todayStr] || 0

        let weekHours = 0
        let monthHours = 0
        let prevTodayHrs = 0
        let prevWeekHrs = 0
        let prevMonthHrs = 0
        for (const [date, hours] of Object.entries(dailyHours)) {
          const d = new Date(date + "T00:00:00")
          if (d >= startOf7Days) weekHours += hours
          if (d >= startOf30Days) monthHours += hours
          // Previous periods
          if (d >= startOfYesterday && d < startOfToday) prevTodayHrs += hours
          if (d >= startOfPrev7Days && d < startOf7Days) prevWeekHrs += hours
          if (d >= startOfPrev30Days && d < startOf30Days) prevMonthHrs += hours
        }

        shiftbaseHours = {
          today: Math.round(todayHours * 10) / 10,
          week: Math.round(weekHours * 10) / 10,
          month: Math.round(monthHours * 10) / 10,
          dailyHours,
          prevToday: Math.round(prevTodayHrs * 10) / 10,
          prevWeek: Math.round(prevWeekHrs * 10) / 10,
          prevMonth: Math.round(prevMonthHrs * 10) / 10,
        }
      }
    } catch (err) {
      console.error("Error reading DailyMetric for Shiftbase hours:", err)
    }

    // Get all employees for formatting
    const employees = await prisma.user.findMany({
      where: { role: "employee" },
      select: { id: true, name: true, email: true },
    })

    function formatEmployees(empMap: Record<string, any>) {
      return employees.map(emp => {
        const s = empMap[emp.id] || { jobCount: 0, totalQuantity: 0, totalM2: 0, jobs: [], processingTimes: [] }
        const avg = s.processingTimes.length > 0
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
          avgProcessingMs: Math.round(avg),
        }
      }).sort((a, b) => b.jobCount - a.jobCount)
    }

    // Daily breakdown (last 7 days, all employees combined)
    const dailyBreakdown: { date: string; jobCount: number; totalM2: number; totalMinutes: number; shiftbaseHours: number }[] = []
    for (let i = 6; i >= 0; i--) {
      const dayStart = new Date(startOfToday)
      dayStart.setDate(dayStart.getDate() - i)
      const dayEnd = new Date(dayStart)
      dayEnd.setDate(dayEnd.getDate() + 1)

      const dayJobs = await prisma.printJob.findMany({
        where: {
          printStatus: { in: ["completed", "pushed"] },
          completedAt: { gte: dayStart, lt: dayEnd },
        },
        select: { quantity: true, tags: true },
      })

      let dayM2 = 0
      for (const job of dayJobs) {
        dayM2 += getJobM2(job.tags) * job.quantity
      }
      const dayMinutes = calcTotalPrintMinutes(dayJobs)

      const dayKey = toDateStr(dayStart)
      dailyBreakdown.push({
        date: dayKey,
        jobCount: dayJobs.length,
        totalM2: Math.round(dayM2 * 100) / 100,
        totalMinutes: Math.round(dayMinutes),
        shiftbaseHours: Math.round((shiftbaseHours?.dailyHours[dayKey] || 0) * 10) / 10,
      })
    }

    // Completed jobs (today, for recent table)
    const completedToday = await prisma.printJob.findMany({
      where: {
        printStatus: { in: ["completed", "pushed"] },
        completedAt: { gte: startOfToday },
      },
      include: {
        completedByUser: { select: { id: true, name: true, email: true } },
      },
      orderBy: { completedAt: "desc" },
      take: 20,
    })

    return NextResponse.json({
      statusCounts,
      open: {
        m2: Math.round(openM2 * 100) / 100,
        printMinutes: Math.round(openPrintMinutes),
        jobCount: openJobs.length,
      },
      today: {
        ...todayProd,
        employees: formatEmployees(todayProd.employeeMap),
        shiftbaseHours: shiftbaseHours?.today ?? null,
      },
      week: {
        ...weekProd,
        employees: formatEmployees(weekProd.employeeMap),
        shiftbaseHours: shiftbaseHours?.week ?? null,
      },
      month: {
        ...monthProd,
        employees: formatEmployees(monthProd.employeeMap),
        shiftbaseHours: shiftbaseHours?.month ?? null,
      },
      prevToday: {
        ...prevTodayProd,
        shiftbaseHours: shiftbaseHours?.prevToday ?? null,
      },
      prevWeek: {
        ...prevWeekProd,
        shiftbaseHours: shiftbaseHours?.prevWeek ?? null,
      },
      prevMonth: {
        ...prevMonthProd,
        shiftbaseHours: shiftbaseHours?.prevMonth ?? null,
      },
      dailyBreakdown,
      completedToday,
    })

  } catch (error) {
    console.error("Error fetching stats:", error)
    return NextResponse.json(
      { error: "Fout bij ophalen van statistieken" },
      { status: 500 }
    )
  }
}
