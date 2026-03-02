import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

const PRINT_CONFIGS = [
  { keywords: ["40x60", "40 x 60 cm"], perRun: 7, m2: 0.24 },
  { keywords: ["60x90", "60 x 90 cm"], perRun: 5, m2: 0.54 },
  { keywords: ["80x120", "80 x 120 cm"], perRun: 2, m2: 0.96 },
  { keywords: ["100x150", "100 x 150 cm"], perRun: 2, m2: 1.5 },
]

const IDLE_THRESHOLD_MS = 5 * 60 * 1000 // 5 minuten

function getJobFormat(tags: string | null): string | null {
  if (!tags) return null
  const t = tags.toLowerCase()
  for (const c of PRINT_CONFIGS) {
    if (c.keywords.some(kw => t.includes(kw.toLowerCase()))) return c.keywords[0]
  }
  return null
}

function getJobM2(tags: string | null): number {
  if (!tags) return 0
  const t = tags.toLowerCase()
  for (const c of PRINT_CONFIGS) {
    if (c.keywords.some(kw => t.includes(kw.toLowerCase()))) return c.m2
  }
  return 0
}

interface CompletionEvent {
  id: string
  completedAt: Date
  quantity: number
  tags: string | null
  format: string | null
  m2: number
}

interface DayAnalysis {
  date: string
  operatorId: string
  operatorName: string
  // Timestamps
  firstCompletion: string
  lastCompletion: string
  // Werk analytics
  totalActiveMinutes: number   // totale werktijd (exclusief idle > 5 min)
  totalSpanMinutes: number     // totale tijdsspanne (first to last)
  totalIdleMinutes: number     // totale idle tijd (pauzes > 5 min)
  idleCount: number            // aantal pauzes > 5 min
  // Productie
  jobCount: number
  totalQuantity: number
  totalM2: number
  estimatedPrintMinutes: number
  // Per-completion details
  completions: {
    time: string
    jobId: string
    quantity: number
    format: string | null
    m2: number
    gapMinutes: number | null  // tijd sinds vorige completion
    isIdle: boolean            // gap > 5 min?
  }[]
  // Idle periodes
  idlePeriods: {
    from: string
    to: string
    durationMinutes: number
  }[]
}

export async function GET(request: NextRequest) {
  try {
    const session = await auth()
    if (!session || (session.user as any).role !== "admin") {
      return NextResponse.json({ error: "Niet geautoriseerd" }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const startDate = searchParams.get("start")
    const endDate = searchParams.get("end")
    const operatorId = searchParams.get("operator") // "all" of een specifiek id

    // Defaults: afgelopen 30 dagen
    const now = new Date()
    const from = startDate ? new Date(startDate + "T00:00:00") : new Date(now.getFullYear(), now.getMonth(), now.getDate() - 30)
    const to = endDate ? new Date(endDate + "T23:59:59") : now

    // Haal alle voltooide jobs op in de periode
    const jobs = await prisma.printJob.findMany({
      where: {
        printStatus: { in: ["completed", "pushed"] },
        completedAt: { gte: from, lte: to },
        completedBy: operatorId && operatorId !== "all" ? operatorId : { not: null },
      },
      select: {
        id: true,
        completedAt: true,
        completedBy: true,
        quantity: true,
        tags: true,
      },
      orderBy: { completedAt: "asc" },
    })

    // Haal operators op
    const operators = await prisma.user.findMany({
      where: { role: "employee" },
      select: { id: true, name: true, email: true },
    })
    const operatorMap = Object.fromEntries(operators.map(o => [o.id, o.name || o.email || "Onbekend"]))

    // Groepeer per operator per dag
    const grouped: Record<string, Record<string, CompletionEvent[]>> = {}
    for (const job of jobs) {
      if (!job.completedAt || !job.completedBy) continue
      const opId = job.completedBy
      const dateKey = `${job.completedAt.getFullYear()}-${String(job.completedAt.getMonth() + 1).padStart(2, "0")}-${String(job.completedAt.getDate()).padStart(2, "0")}`

      if (!grouped[opId]) grouped[opId] = {}
      if (!grouped[opId][dateKey]) grouped[opId][dateKey] = []

      grouped[opId][dateKey].push({
        id: job.id,
        completedAt: job.completedAt,
        quantity: job.quantity,
        tags: job.tags,
        format: getJobFormat(job.tags),
        m2: getJobM2(job.tags) * job.quantity,
      })
    }

    // Analyseer per operator per dag
    const dayAnalyses: DayAnalysis[] = []

    for (const [opId, days] of Object.entries(grouped)) {
      for (const [dateKey, events] of Object.entries(days)) {
        // Sorteer op tijd
        events.sort((a, b) => a.completedAt.getTime() - b.completedAt.getTime())

        const completions: DayAnalysis["completions"] = []
        const idlePeriods: DayAnalysis["idlePeriods"] = []
        let totalIdleMs = 0
        let idleCount = 0
        let totalActiveMs = 0

        for (let i = 0; i < events.length; i++) {
          const ev = events[i]
          let gapMs: number | null = null
          let isIdle = false

          if (i > 0) {
            gapMs = ev.completedAt.getTime() - events[i - 1].completedAt.getTime()
            isIdle = gapMs > IDLE_THRESHOLD_MS

            if (isIdle) {
              totalIdleMs += gapMs
              idleCount++
              idlePeriods.push({
                from: events[i - 1].completedAt.toISOString(),
                to: ev.completedAt.toISOString(),
                durationMinutes: Math.round(gapMs / 60000),
              })
            } else {
              totalActiveMs += gapMs
            }
          }

          completions.push({
            time: ev.completedAt.toISOString(),
            jobId: ev.id,
            quantity: ev.quantity,
            format: ev.format,
            m2: Math.round(ev.m2 * 100) / 100,
            gapMinutes: gapMs !== null ? Math.round(gapMs / 60000 * 10) / 10 : null,
            isIdle,
          })
        }

        const firstTime = events[0].completedAt
        const lastTime = events[events.length - 1].completedAt
        const totalSpanMs = lastTime.getTime() - firstTime.getTime()

        // Bereken geschatte printtijd (geaggregeerd per formaat)
        const qtyByFormat: Record<string, number> = {}
        for (const ev of events) {
          if (ev.format) qtyByFormat[ev.format] = (qtyByFormat[ev.format] || 0) + ev.quantity
        }
        let estimatedPrintMinutes = 0
        for (const c of PRINT_CONFIGS) {
          const qty = qtyByFormat[c.keywords[0]] || 0
          if (qty > 0) {
            estimatedPrintMinutes += Math.ceil(qty / c.perRun) * 20
          }
        }

        dayAnalyses.push({
          date: dateKey,
          operatorId: opId,
          operatorName: operatorMap[opId] || "Onbekend",
          firstCompletion: firstTime.toISOString(),
          lastCompletion: lastTime.toISOString(),
          totalActiveMinutes: Math.round(totalActiveMs / 60000),
          totalSpanMinutes: Math.round(totalSpanMs / 60000),
          totalIdleMinutes: Math.round(totalIdleMs / 60000),
          idleCount,
          jobCount: events.length,
          totalQuantity: events.reduce((s, e) => s + e.quantity, 0),
          totalM2: Math.round(events.reduce((s, e) => s + e.m2, 0) * 100) / 100,
          estimatedPrintMinutes,
          completions,
          idlePeriods,
        })
      }
    }

    // Sorteer op datum (nieuwste eerst)
    dayAnalyses.sort((a, b) => b.date.localeCompare(a.date))

    // Samenvattingen per dag (alle operators gecombineerd)
    const dailySummary: Record<string, {
      date: string
      totalActiveMinutes: number
      totalSpanMinutes: number
      totalIdleMinutes: number
      idleCount: number
      jobCount: number
      totalQuantity: number
      totalM2: number
      estimatedPrintMinutes: number
      operatorCount: number
    }> = {}

    for (const da of dayAnalyses) {
      if (!dailySummary[da.date]) {
        dailySummary[da.date] = {
          date: da.date,
          totalActiveMinutes: 0,
          totalSpanMinutes: 0,
          totalIdleMinutes: 0,
          idleCount: 0,
          jobCount: 0,
          totalQuantity: 0,
          totalM2: 0,
          estimatedPrintMinutes: 0,
          operatorCount: 0,
        }
      }
      const s = dailySummary[da.date]
      s.totalActiveMinutes += da.totalActiveMinutes
      s.totalSpanMinutes = Math.max(s.totalSpanMinutes, da.totalSpanMinutes)
      s.totalIdleMinutes += da.totalIdleMinutes
      s.idleCount += da.idleCount
      s.jobCount += da.jobCount
      s.totalQuantity += da.totalQuantity
      s.totalM2 += da.totalM2
      s.estimatedPrintMinutes += da.estimatedPrintMinutes
      s.operatorCount++
    }

    const dailySummaryArr = Object.values(dailySummary)
      .map(s => ({ ...s, totalM2: Math.round(s.totalM2 * 100) / 100 }))
      .sort((a, b) => a.date.localeCompare(b.date))

    return NextResponse.json({
      operators: operators.map(o => ({ id: o.id, name: o.name || o.email })),
      dayAnalyses,
      dailySummary: dailySummaryArr,
    })
  } catch (error) {
    console.error("Error in print-data stats:", error)
    return NextResponse.json({ error: "Server error" }, { status: 500 })
  }
}
