"use client"

import { useEffect, useState, useMemo, Fragment } from "react"
import ChangeBadge from "@/app/components/ChangeBadge"

interface Operator {
  id: string
  name: string
}

interface Completion {
  time: string
  jobId: string
  quantity: number
  format: string | null
  m2: number
  gapMinutes: number | null
  isIdle: boolean
}

interface IdlePeriod {
  from: string
  to: string
  durationMinutes: number
}

interface DayAnalysis {
  date: string
  operatorId: string
  operatorName: string
  firstCompletion: string
  lastCompletion: string
  totalActiveMinutes: number
  totalSpanMinutes: number
  totalIdleMinutes: number
  idleCount: number
  jobCount: number
  totalQuantity: number
  totalM2: number
  estimatedPrintMinutes: number
  completions: Completion[]
  idlePeriods: IdlePeriod[]
}

interface DailySummary {
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
}

interface PrintDataResponse {
  operators: Operator[]
  dayAnalyses: DayAnalysis[]
  dailySummary: DailySummary[]
  shiftbasePrintHours: number
  shiftbasePrintHoursByDate: Record<string, number>
  untaggedByDate?: Record<string, { sku: string | null; tags: string | null; productName: string | null; quantity: number }[]>
}

function formatMinutes(min: number): string {
  if (min === 0) return "0m"
  const h = Math.floor(min / 60)
  const m = Math.round(min % 60)
  if (h === 0) return `${m}m`
  return `${h}u ${m}m`
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit" })
}

function formatDate(dateStr: string): string {
  return new Date(dateStr + "T12:00:00").toLocaleDateString("nl-NL", {
    weekday: "short",
    day: "numeric",
    month: "short",
  })
}

function formatDateLong(dateStr: string): string {
  return new Date(dateStr + "T12:00:00").toLocaleDateString("nl-NL", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  })
}

export default function PrintDataPage() {
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<PrintDataResponse | null>(null)
  const [prevData, setPrevData] = useState<PrintDataResponse | null>(null)
  const [selectedOperator, setSelectedOperator] = useState("all")
  const [startDate, setStartDate] = useState("")
  const [endDate, setEndDate] = useState("")
  const [expandedDay, setExpandedDay] = useState<string | null>(null)
  const [expandedSession, setExpandedSession] = useState<string | null>(null)
  const [selectedChartDay, setSelectedChartDay] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<"overview" | "timeline" | "idle">("overview")

  useEffect(() => {
    const today = new Date()
    const thirtyDaysAgo = new Date(today)
    thirtyDaysAgo.setDate(today.getDate() - 30)
    setEndDate(today.toISOString().split("T")[0])
    setStartDate(thirtyDaysAgo.toISOString().split("T")[0])
  }, [])

  useEffect(() => {
    if (startDate && endDate) fetchData()
  }, [startDate, endDate, selectedOperator])

  const fetchData = async () => {
    try {
      setLoading(true)
      const params = new URLSearchParams({
        start: startDate,
        end: endDate,
        operator: selectedOperator,
      })

      // Bereken vorige periode (zelfde lengte, direct ervoor)
      const start = new Date(startDate + "T00:00:00")
      const end = new Date(endDate + "T00:00:00")
      const diffMs = end.getTime() - start.getTime()
      const prevEnd = new Date(start.getTime() - 1) // dag vóór startDate
      const prevStart = new Date(prevEnd.getTime() - diffMs)
      const prevParams = new URLSearchParams({
        start: prevStart.toISOString().split("T")[0],
        end: prevEnd.toISOString().split("T")[0],
        operator: selectedOperator,
      })

      const [res, prevRes] = await Promise.all([
        fetch(`/api/stats/print-data?${params}`),
        fetch(`/api/stats/print-data?${prevParams}`),
      ])
      if (res.ok) {
        const json = await res.json()
        setData(json)
      }
      if (prevRes.ok) {
        const prevJson = await prevRes.json()
        setPrevData(prevJson)
      }
    } catch (error) {
      console.error("Error fetching print data:", error)
    } finally {
      setLoading(false)
    }
  }

  // Gefilterde dag-analyses per operator
  const filteredDays = useMemo(() => {
    if (!data) return []
    if (selectedOperator === "all") return data.dayAnalyses
    return data.dayAnalyses.filter(d => d.operatorId === selectedOperator)
  }, [data, selectedOperator])

  // Totalen over de periode
  const totals = useMemo(() => {
    const t = {
      totalActiveMinutes: 0,
      totalIdleMinutes: 0,
      totalSpanMinutes: 0,
      jobCount: 0,
      totalQuantity: 0,
      totalM2: 0,
      estimatedPrintMinutes: 0,
      idleCount: 0,
      workDays: 0,
      shiftbasePrintHours: 0,
    }
    for (const d of filteredDays) {
      t.totalActiveMinutes += d.totalActiveMinutes
      t.totalIdleMinutes += d.totalIdleMinutes
      t.totalSpanMinutes += d.totalSpanMinutes
      t.jobCount += d.jobCount
      t.totalQuantity += d.totalQuantity
      t.totalM2 += d.totalM2
      t.estimatedPrintMinutes += d.estimatedPrintMinutes
      t.idleCount += d.idleCount
      t.workDays++
    }
    // Shiftbase printuren: als operator geselecteerd, tonen we het totaal (niet per-operator beschikbaar)
    // Bij "alle operators" tonen we de som van alle dagen
    if (data?.shiftbasePrintHoursByDate) {
      if (selectedOperator === "all") {
        t.shiftbasePrintHours = data.shiftbasePrintHours
      } else {
        // Per-operator niet beschikbaar uit Shiftbase, toon totaal van de gefilterde werkdagen
        const filteredDates = new Set(filteredDays.map(d => d.date))
        for (const [date, hours] of Object.entries(data.shiftbasePrintHoursByDate)) {
          if (filteredDates.has(date)) {
            t.shiftbasePrintHours += hours
          }
        }
      }
    }
    return t
  }, [filteredDays, data, selectedOperator])

  // Totalen vorige periode
  const prevTotals = useMemo(() => {
    const t = {
      totalActiveMinutes: 0,
      totalIdleMinutes: 0,
      totalSpanMinutes: 0,
      jobCount: 0,
      totalQuantity: 0,
      totalM2: 0,
      estimatedPrintMinutes: 0,
      idleCount: 0,
      workDays: 0,
      shiftbasePrintHours: 0,
    }
    if (!prevData) return t
    const days = selectedOperator === "all"
      ? prevData.dayAnalyses
      : prevData.dayAnalyses.filter(d => d.operatorId === selectedOperator)
    for (const d of days) {
      t.totalActiveMinutes += d.totalActiveMinutes
      t.totalIdleMinutes += d.totalIdleMinutes
      t.totalSpanMinutes += d.totalSpanMinutes
      t.jobCount += d.jobCount
      t.totalQuantity += d.totalQuantity
      t.totalM2 += d.totalM2
      t.estimatedPrintMinutes += d.estimatedPrintMinutes
      t.idleCount += d.idleCount
      t.workDays++
    }
    if (prevData?.shiftbasePrintHoursByDate) {
      if (selectedOperator === "all") {
        t.shiftbasePrintHours = prevData.shiftbasePrintHours
      } else {
        const filteredDates = new Set(days.map(d => d.date))
        for (const [date, hours] of Object.entries(prevData.shiftbasePrintHoursByDate)) {
          if (filteredDates.has(date)) {
            t.shiftbasePrintHours += hours
          }
        }
      }
    }
    return t
  }, [prevData, selectedOperator])

  // Groepeer completions per dag/operator in aaneengesloten werksessies (gescheiden door idle gaps)
  const allSessions = useMemo(() => {
    interface Session {
      key: string
      date: string
      operatorId: string
      operatorName: string
      completions: Completion[]
      startTime: string
      endTime: string
      durationMinutes: number
    }
    const sessions: Session[] = []
    let sessionIndex = 0
    for (const day of filteredDays) {
      let current: Session | null = null
      for (const c of day.completions) {
        if (!current || c.isIdle) {
          if (current && current.completions.length > 0) sessions.push(current)
          current = {
            key: `${day.date}-${day.operatorId}-${sessionIndex++}`,
            date: day.date,
            operatorId: day.operatorId,
            operatorName: day.operatorName,
            completions: [c],
            startTime: c.time,
            endTime: c.time,
            durationMinutes: 0,
          }
        } else {
          current.completions.push(c)
          current.endTime = c.time
        }
      }
      if (current && current.completions.length > 0) sessions.push(current)
    }
    // Bereken duur per sessie
    for (const s of sessions) {
      const ms = new Date(s.endTime).getTime() - new Date(s.startTime).getTime()
      s.durationMinutes = ms / 60000
    }
    return sessions
  }, [filteredDays])

  // Dagelijks overzicht (voor grafieken)
  const dailyChartData = useMemo(() => {
    if (!data) return []
    if (selectedOperator === "all") return data.dailySummary

    // Aggregeer per dag voor geselecteerde operator
    const byDate: Record<string, DailySummary> = {}
    for (const d of filteredDays) {
      if (!byDate[d.date]) {
        byDate[d.date] = {
          date: d.date,
          totalActiveMinutes: 0,
          totalSpanMinutes: 0,
          totalIdleMinutes: 0,
          idleCount: 0,
          jobCount: 0,
          totalQuantity: 0,
          totalM2: 0,
          estimatedPrintMinutes: 0,
          operatorCount: 1,
        }
      }
      const s = byDate[d.date]
      s.totalActiveMinutes += d.totalActiveMinutes
      s.totalSpanMinutes = Math.max(s.totalSpanMinutes, d.totalSpanMinutes)
      s.totalIdleMinutes += d.totalIdleMinutes
      s.idleCount += d.idleCount
      s.jobCount += d.jobCount
      s.totalQuantity += d.totalQuantity
      s.totalM2 += d.totalM2
      s.estimatedPrintMinutes += d.estimatedPrintMinutes
    }

    return Object.values(byDate).sort((a, b) => a.date.localeCompare(b.date))
  }, [data, selectedOperator, filteredDays])

  // Format breakdown per dag (voor klik-op-dag detail)
  const FORMAT_LABELS: Record<string, string> = {
    "40x60": "40×60 cm",
    "60x90": "60×90 cm",
    "80x120": "80×120 cm",
    "100x150": "100×150 cm",
    "salontafel": "Salontafel",
  }
  const FORMAT_COLORS: Record<string, string> = {
    "40x60": "#3B82F6",
    "60x90": "#10B981",
    "80x120": "#F59E0B",
    "100x150": "#EF4444",
    "salontafel": "#8B5CF6",
  }

  const getFormatBreakdown = (date: string) => {
    if (!data) return []
    const daysForDate = data.dayAnalyses.filter(d => {
      if (d.date !== date) return false
      if (selectedOperator !== "all" && d.operatorId !== selectedOperator) return false
      return true
    })
    const byFormat: Record<string, { qty: number; jobs: number }> = {}
    for (const day of daysForDate) {
      for (const c of day.completions) {
        const fmt = c.format || "overig"
        if (!byFormat[fmt]) byFormat[fmt] = { qty: 0, jobs: 0 }
        byFormat[fmt].qty += c.quantity
        byFormat[fmt].jobs += 1
      }
    }
    return Object.entries(byFormat)
      .sort(([, a], [, b]) => b.qty - a.qty)
      .map(([format, data]) => ({ format, ...data }))
  }

  if (loading && !data) {
    return (
      <div className="p-8">
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        </div>
      </div>
    )
  }

  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-8 flex flex-col sm:flex-row justify-between items-start gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Print Data</h1>
          <p className="text-gray-600 mt-1">Analyseer werktijden, pauzes en productiviteit van print operators</p>
        </div>

        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Operator</label>
            <select
              value={selectedOperator}
              onChange={(e) => setSelectedOperator(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
            >
              <option value="all">Alle operators</option>
              {data?.operators.map(op => (
                <option key={op.id} value={op.id}>{op.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Van</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Tot</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
            />
          </div>
        </div>
      </div>

      {/* KPI kaarten */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-4 mb-8">
        <div className="bg-white rounded-lg shadow p-4">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-gray-500 uppercase">Werkdagen</p>
            <ChangeBadge current={totals.workDays} previous={prevTotals.workDays} label="dagen" />
          </div>
          <p className="text-2xl font-bold text-gray-900 mt-1">{totals.workDays}</p>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-gray-500 uppercase">Actieve Tijd</p>
            <ChangeBadge current={totals.totalActiveMinutes} previous={prevTotals.totalActiveMinutes} label="min actief" />
          </div>
          <p className="text-2xl font-bold text-blue-600 mt-1">{formatMinutes(totals.totalActiveMinutes)}</p>
          <p className="text-xs text-gray-400">tussen completions</p>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-gray-500 uppercase">Idle Tijd</p>
            <ChangeBadge current={totals.totalIdleMinutes} previous={prevTotals.totalIdleMinutes} invertColor label="min idle" />
          </div>
          <p className="text-2xl font-bold text-orange-500 mt-1">{formatMinutes(totals.totalIdleMinutes)}</p>
          <p className="text-xs text-gray-400">{totals.idleCount} pauzes (&gt;5 min)</p>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-gray-500 uppercase">Jobs Voltooid</p>
            <ChangeBadge current={totals.jobCount} previous={prevTotals.jobCount} label="jobs" />
          </div>
          <p className="text-2xl font-bold text-green-600 mt-1">{totals.jobCount}</p>
          <p className="text-xs text-gray-400">{totals.totalQuantity} stuks</p>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-gray-500 uppercase">M² Geprint</p>
            <ChangeBadge current={totals.totalM2} previous={prevTotals.totalM2} label="m²" />
          </div>
          <p className="text-2xl font-bold text-indigo-600 mt-1">{totals.totalM2.toFixed(2)}</p>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-gray-500 uppercase">Shiftbase Uren</p>
            <ChangeBadge current={totals.shiftbasePrintHours * 60} previous={prevTotals.shiftbasePrintHours * 60} label="min" />
          </div>
          <p className="text-2xl font-bold text-teal-600 mt-1">
            {totals.shiftbasePrintHours > 0
              ? formatMinutes(Math.round(totals.shiftbasePrintHours * 60))
              : "—"}
          </p>
          <p className="text-xs text-gray-400">geklokt Print team</p>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-gray-500 uppercase">Gesch. Printtijd</p>
            <ChangeBadge current={totals.estimatedPrintMinutes} previous={prevTotals.estimatedPrintMinutes} label="min" />
          </div>
          <p className="text-2xl font-bold text-purple-600 mt-1">{formatMinutes(totals.estimatedPrintMinutes)}</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="mb-6 border-b border-gray-200">
        <div className="flex gap-6">
          {[
            { key: "overview" as const, label: "Dagelijks Overzicht" },
            { key: "timeline" as const, label: "Activiteit Timeline" },
            { key: "idle" as const, label: "Pauze Analyse" },
          ].map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.key
                  ? "border-blue-600 text-blue-600"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      {activeTab === "overview" && (
        <div className="space-y-6">
          {/* Grafiek: Shiftbase Uren vs Geschatte Printtijd per dag */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Shiftbase Uren vs Geschatte Printtijd per Dag</h2>
            {dailyChartData.length > 0 ? (() => {
              // Bereid data voor: combineer shiftbase uren en geschatte printtijd per dag
              const chartPoints = dailyChartData.map(day => ({
                date: day.date,
                shiftbaseMinutes: Math.round((data?.shiftbasePrintHoursByDate?.[day.date] || 0) * 60),
                estimatedMinutes: day.estimatedPrintMinutes,
              }))
              const maxMinutes = Math.max(
                ...chartPoints.map(p => Math.max(p.shiftbaseMinutes, p.estimatedMinutes)),
                60
              )
              const chartHeight = 288 // h-72 = 18rem = 288px
              const chartWidth = 100 // percentage

              const getY = (val: number) => chartHeight - (val / maxMinutes) * chartHeight
              const stepX = chartPoints.length > 1 ? chartWidth / (chartPoints.length - 1) : 50

              const shiftbasePath = chartPoints.map((p, i) =>
                `${i === 0 ? "M" : "L"} ${i * stepX} ${getY(p.shiftbaseMinutes)}`
              ).join(" ")
              const estimatedPath = chartPoints.map((p, i) =>
                `${i === 0 ? "M" : "L"} ${i * stepX} ${getY(p.estimatedMinutes)}`
              ).join(" ")

              // Y-axis: 5 stappen
              const ySteps = 5
              const yLabels = Array.from({ length: ySteps + 1 }, (_, i) =>
                Math.round((maxMinutes / ySteps) * (ySteps - i))
              )

              return (
                <div>
                  <div className="relative" style={{ height: chartHeight }}>
                    {/* Y-axis labels + grid */}
                    {yLabels.map((val, i) => {
                      const top = (i / ySteps) * 100
                      return (
                        <div key={i} className="absolute left-0 right-0" style={{ top: `${top}%` }}>
                          <div className="absolute -left-2 -translate-x-full text-xs text-gray-400 -translate-y-1/2">
                            {formatMinutes(val)}
                          </div>
                          <div className="border-t border-gray-100 w-full" />
                        </div>
                      )
                    })}

                    {/* SVG lijngrafiek */}
                    <svg
                      viewBox={`-2 -2 ${chartWidth + 4} ${chartHeight + 4}`}
                      preserveAspectRatio="none"
                      className="w-full h-full ml-1"
                      style={{ overflow: "visible" }}
                    >
                      {/* Shiftbase lijn (teal) */}
                      <path d={shiftbasePath} fill="none" stroke="#0d9488" strokeWidth="2.5" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
                      {/* Geschatte Printtijd lijn (paars) */}
                      <path d={estimatedPath} fill="none" stroke="#9333ea" strokeWidth="2.5" strokeLinejoin="round" strokeDasharray="6 3" vectorEffect="non-scaling-stroke" />

                      {/* Data punten + hover targets */}
                      {chartPoints.map((p, i) => (
                        <g key={i}>
                          <circle cx={i * stepX} cy={getY(p.shiftbaseMinutes)} r="3" fill="#0d9488" className="opacity-70 hover:opacity-100" style={{ transition: "opacity 0.15s" }} />
                          <circle cx={i * stepX} cy={getY(p.estimatedMinutes)} r="3" fill="#9333ea" className="opacity-70 hover:opacity-100" style={{ transition: "opacity 0.15s" }} />
                        </g>
                      ))}
                    </svg>

                    {/* Hover overlays met tooltips — klikbaar */}
                    <div className="absolute inset-0 flex ml-1">
                      {chartPoints.map((p, i) => {
                        const diff = p.shiftbaseMinutes - p.estimatedMinutes
                        const diffPct = p.estimatedMinutes > 0 ? Math.round((diff / p.estimatedMinutes) * 100) : 0
                        const isSelected = selectedChartDay === p.date
                        return (
                          <div
                            key={i}
                            className="flex-1 relative group cursor-pointer"
                            onClick={() => setSelectedChartDay(isSelected ? null : p.date)}
                          >
                            {isSelected && (
                              <div className="absolute inset-0 bg-blue-500/10 border-x border-blue-300/40" />
                            )}
                            <div className="hidden group-hover:block absolute bottom-full mb-2 left-1/2 -translate-x-1/2 z-10 bg-gray-900 text-white text-xs rounded-lg p-2.5 whitespace-nowrap shadow-lg">
                              <div className="font-medium mb-1">{formatDateLong(p.date)}</div>
                              <div className="text-teal-300">Shiftbase: {formatMinutes(p.shiftbaseMinutes)}</div>
                              <div className="text-purple-300">Gesch. Printtijd: {formatMinutes(p.estimatedMinutes)}</div>
                              {diff !== 0 && (
                                <div className={`mt-1 pt-1 border-t border-gray-700 ${diff > 0 ? "text-orange-300" : "text-green-300"}`}>
                                  Verschil: {diff > 0 ? "+" : ""}{formatMinutes(Math.abs(diff))} ({diff > 0 ? "+" : ""}{diffPct}%)
                                </div>
                              )}
                              <div className="mt-1 pt-1 border-t border-gray-700 text-gray-400">Klik voor details</div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>

                  {/* X-axis */}
                  <div className="flex mt-2 ml-1">
                    {chartPoints.map((p, i) => (
                      <div key={i} className="flex-1 text-center min-w-0">
                        <span className="text-[10px] text-gray-400 truncate block">
                          {chartPoints.length <= 14
                            ? formatDate(p.date)
                            : i % Math.ceil(chartPoints.length / 10) === 0
                              ? formatDate(p.date)
                              : ""
                          }
                        </span>
                      </div>
                    ))}
                  </div>

                  {/* Legend */}
                  <div className="flex gap-6 mt-4 text-sm text-gray-600">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-0.5 bg-teal-600 rounded" />
                      <span>Shiftbase uren (geklokt Print team)</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-0.5 bg-purple-600 rounded" style={{ borderTop: "2px dashed #9333ea" }} />
                      <span>Geschatte printtijd (berekend)</span>
                    </div>
                  </div>

                  {/* Klik-op-dag detail panel */}
                  {selectedChartDay && (() => {
                    const breakdown = getFormatBreakdown(selectedChartDay)
                    const dayData = dailyChartData.find(d => d.date === selectedChartDay)
                    if (!dayData) return null
                    const shiftMin = Math.round((data?.shiftbasePrintHoursByDate?.[selectedChartDay] || 0) * 60)
                    return (
                      <div className="mt-4 bg-blue-50 border border-blue-200 rounded-lg p-4 animate-in fade-in">
                        <div className="flex items-center justify-between mb-3">
                          <h3 className="font-semibold text-gray-900">
                            📋 {formatDateLong(selectedChartDay)}
                          </h3>
                          <button
                            onClick={() => setSelectedChartDay(null)}
                            className="text-gray-400 hover:text-gray-600 text-lg leading-none"
                          >
                            ×
                          </button>
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                          <div className="bg-white rounded-lg p-3 text-center">
                            <p className="text-xs text-gray-500">Jobs</p>
                            <p className="text-lg font-bold text-gray-900">{dayData.jobCount}</p>
                          </div>
                          <div className="bg-white rounded-lg p-3 text-center">
                            <p className="text-xs text-gray-500">Stuks</p>
                            <p className="text-lg font-bold text-gray-900">{dayData.totalQuantity}</p>
                          </div>
                          <div className="bg-white rounded-lg p-3 text-center">
                            <p className="text-xs text-gray-500">M²</p>
                            <p className="text-lg font-bold text-indigo-600">{dayData.totalM2.toFixed(2)}</p>
                          </div>
                          <div className="bg-white rounded-lg p-3 text-center">
                            <p className="text-xs text-gray-500">Printtijd</p>
                            <p className="text-lg font-bold text-purple-600">{formatMinutes(dayData.estimatedPrintMinutes)}</p>
                          </div>
                        </div>
                        {breakdown.length > 0 ? (
                          <div>
                            <p className="text-sm font-medium text-gray-700 mb-2">Verdeling per formaat:</p>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                              {breakdown.map(({ format, qty, jobs }) => (
                                <div key={format} className="flex items-center gap-3 bg-white rounded-lg px-3 py-2">
                                  <div
                                    className="w-3 h-3 rounded-sm shrink-0"
                                    style={{ backgroundColor: FORMAT_COLORS[format] || "#6B7280" }}
                                  />
                                  <span className="font-medium text-gray-800">
                                    {qty}× {FORMAT_LABELS[format] || format}
                                  </span>
                                  <span className="text-xs text-gray-400 ml-auto">{jobs} job{jobs !== 1 ? "s" : ""}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        ) : (
                          <p className="text-sm text-gray-500">Geen format-data beschikbaar voor deze dag.</p>
                        )}
                        {/* Onherkende jobs (zonder format-tag) */}
                        {data?.untaggedByDate?.[selectedChartDay]?.length ? (
                          <div className="mt-3 pt-3 border-t border-orange-200">
                            <p className="text-sm font-medium text-orange-700 mb-2">
                              ⚠️ {data.untaggedByDate[selectedChartDay].length} job(s) zonder formaat-tag:
                            </p>
                            <div className="space-y-1 max-h-40 overflow-y-auto">
                              {data.untaggedByDate[selectedChartDay].map((j, i) => (
                                <div key={i} className="text-xs bg-orange-50 rounded px-2 py-1 flex gap-2">
                                  <span className="text-gray-600 font-mono">{j.sku || "—"}</span>
                                  <span className="text-gray-500 truncate">{j.productName || ""}</span>
                                  <span className="text-gray-400 ml-auto">×{j.quantity}</span>
                                  {j.tags && <span className="text-orange-600">tags: {j.tags}</span>}
                                </div>
                              ))}
                            </div>
                          </div>
                        ) : null}
                        {shiftMin > 0 && (
                          <div className="mt-3 pt-3 border-t border-blue-200 text-sm text-gray-600">
                            Shiftbase uren: <span className="font-medium text-teal-700">{formatMinutes(shiftMin)}</span>
                            {dayData.estimatedPrintMinutes > 0 && (
                              <span className="ml-2 text-gray-400">
                                (verschil: {shiftMin > dayData.estimatedPrintMinutes ? "+" : ""}{formatMinutes(shiftMin - dayData.estimatedPrintMinutes)})
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })()}
                </div>
              )
            })() : (
              <div className="text-center py-12 text-gray-500">Geen data beschikbaar</div>
            )}
          </div>

          {/* Grafiek: Jobs per dag */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Jobs Voltooid per Dag</h2>
            {dailyChartData.length > 0 ? (
              <div>
                <div className="h-48 flex items-end gap-1 border-b border-l border-gray-200 pl-1 pb-1">
                  {dailyChartData.map((day, i) => {
                    const maxJobs = Math.max(...dailyChartData.map(d => d.jobCount), 5)
                    const h = Math.max((day.jobCount / maxJobs) * 100, day.jobCount > 0 ? 2 : 0)
                    const isSelected = selectedChartDay === day.date
                    return (
                      <div
                        key={i}
                        className="flex-1 flex items-end justify-center min-w-0 group relative cursor-pointer"
                        onClick={() => setSelectedChartDay(isSelected ? null : day.date)}
                      >
                        <div className="hidden group-hover:block absolute bottom-full mb-2 z-10 bg-gray-900 text-white text-xs rounded-lg p-2 whitespace-nowrap">
                          <div className="font-medium">{formatDate(day.date)}</div>
                          <div>{day.jobCount} jobs ({day.totalQuantity} stuks)</div>
                          <div>{day.totalM2.toFixed(2)} m²</div>
                          <div className="text-gray-400 mt-1 pt-1 border-t border-gray-700">Klik voor details</div>
                        </div>
                        <div
                          className={`w-full rounded-t-sm transition-all ${isSelected ? "bg-green-700 ring-2 ring-green-400" : "bg-green-500"}`}
                          style={{ height: `${h}%` }}
                        />
                      </div>
                    )
                  })}
                </div>
                <div className="flex gap-1 mt-1 pl-1">
                  {dailyChartData.map((day, i) => (
                    <div key={i} className="flex-1 text-center min-w-0">
                      <span className="text-[10px] text-gray-400 truncate block">
                        {dailyChartData.length <= 14
                          ? formatDate(day.date)
                          : i % Math.ceil(dailyChartData.length / 10) === 0
                            ? formatDate(day.date)
                            : ""
                        }
                      </span>
                    </div>
                  ))}
                </div>

                {/* Klik-op-dag detail panel */}
                {selectedChartDay && (() => {
                  const breakdown = getFormatBreakdown(selectedChartDay)
                  const dayData = dailyChartData.find(d => d.date === selectedChartDay)
                  if (!dayData) return null
                  return (
                    <div className="mt-4 bg-green-50 border border-green-200 rounded-lg p-4">
                      <div className="flex items-center justify-between mb-2">
                        <h3 className="font-semibold text-gray-900">
                          📋 {formatDateLong(selectedChartDay)} — {dayData.jobCount} jobs, {dayData.totalQuantity} stuks
                        </h3>
                        <button onClick={() => setSelectedChartDay(null)} className="text-gray-400 hover:text-gray-600 text-lg leading-none">×</button>
                      </div>
                      {breakdown.length > 0 ? (
                        <div className="flex flex-wrap gap-2">
                          {breakdown.map(({ format, qty, jobs }) => (
                            <div key={format} className="flex items-center gap-2 bg-white rounded-lg px-3 py-1.5 border border-green-100">
                              <div className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: FORMAT_COLORS[format] || "#6B7280" }} />
                              <span className="font-medium text-sm text-gray-800">{qty}× {FORMAT_LABELS[format] || format}</span>
                              <span className="text-xs text-gray-400">({jobs} job{jobs !== 1 ? "s" : ""})</span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-gray-500">Geen format-data voor deze dag.</p>
                      )}
                      {/* Onherkende jobs */}
                      {data?.untaggedByDate?.[selectedChartDay]?.length ? (
                        <div className="mt-2">
                          <p className="text-xs text-orange-600 font-medium">
                            ⚠️ {data.untaggedByDate[selectedChartDay].length} job(s) zonder formaat-tag
                          </p>
                        </div>
                      ) : null}
                    </div>
                  )
                })()}
              </div>
            ) : (
              <div className="text-center py-12 text-gray-500">Geen data beschikbaar</div>
            )}
          </div>

          {/* Grafiek: M² per dag */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">M² Geprint per Dag</h2>
            {dailyChartData.length > 0 ? (
              <div>
                <div className="h-48 flex items-end gap-1 border-b border-l border-gray-200 pl-1 pb-1">
                  {dailyChartData.map((day, i) => {
                    const maxM2 = Math.max(...dailyChartData.map(d => d.totalM2), 1)
                    const h = Math.max((day.totalM2 / maxM2) * 100, day.totalM2 > 0 ? 2 : 0)
                    const isSelected = selectedChartDay === day.date
                    return (
                      <div
                        key={i}
                        className="flex-1 flex items-end justify-center min-w-0 group relative cursor-pointer"
                        onClick={() => setSelectedChartDay(isSelected ? null : day.date)}
                      >
                        <div className="hidden group-hover:block absolute bottom-full mb-2 z-10 bg-gray-900 text-white text-xs rounded-lg p-2 whitespace-nowrap">
                          <div className="font-medium">{formatDate(day.date)}</div>
                          <div>{day.totalM2.toFixed(2)} m²</div>
                          <div className="text-gray-400 mt-1 pt-1 border-t border-gray-700">Klik voor details</div>
                        </div>
                        <div
                          className={`w-full rounded-t-sm transition-all ${isSelected ? "bg-indigo-700 ring-2 ring-indigo-400" : "bg-indigo-500"}`}
                          style={{ height: `${h}%` }}
                        />
                      </div>
                    )
                  })}
                </div>
                <div className="flex gap-1 mt-1 pl-1">
                  {dailyChartData.map((day, i) => (
                    <div key={i} className="flex-1 text-center min-w-0">
                      <span className="text-[10px] text-gray-400 truncate block">
                        {dailyChartData.length <= 14
                          ? formatDate(day.date)
                          : i % Math.ceil(dailyChartData.length / 10) === 0
                            ? formatDate(day.date)
                            : ""
                        }
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="text-center py-12 text-gray-500">Geen data beschikbaar</div>
            )}
          </div>
        </div>
      )}

      {activeTab === "timeline" && (
        <div className="space-y-4">
          <p className="text-sm text-gray-500 mb-4">
            Klik op een dag om de individuele completions te zien met timestamps en tijdsgaps.
          </p>

          {/* Dag tabel */}
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Datum</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Operator</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Eerste</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Laatste</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actief</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Idle</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Shiftbase</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Jobs</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">M²</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {filteredDays.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="px-4 py-8 text-center text-gray-500">Geen data beschikbaar</td>
                  </tr>
                ) : (
                  filteredDays.map((day) => {
                    const key = `${day.date}-${day.operatorId}`
                    const isExpanded = expandedDay === key
                    return (
                      <Fragment key={key}>
                        <tr
                          className="hover:bg-gray-50 cursor-pointer transition-colors"
                          onClick={() => setExpandedDay(isExpanded ? null : key)}
                        >
                          <td className="px-4 py-3 text-sm font-medium text-gray-900">{formatDateLong(day.date)}</td>
                          <td className="px-4 py-3 text-sm text-gray-700">{day.operatorName}</td>
                          <td className="px-4 py-3 text-sm text-right text-gray-600">{formatTime(day.firstCompletion)}</td>
                          <td className="px-4 py-3 text-sm text-right text-gray-600">{formatTime(day.lastCompletion)}</td>
                          <td className="px-4 py-3 text-sm text-right font-medium text-blue-600">{formatMinutes(day.totalActiveMinutes)}</td>
                          <td className="px-4 py-3 text-sm text-right font-medium text-orange-500">{formatMinutes(day.totalIdleMinutes)}</td>
                          <td className="px-4 py-3 text-sm text-right font-medium text-purple-600">
                            {data?.shiftbasePrintHoursByDate?.[day.date]
                              ? `${Math.floor(data.shiftbasePrintHoursByDate[day.date])}u ${Math.round((data.shiftbasePrintHoursByDate[day.date] % 1) * 60)}m`
                              : <span className="text-gray-400">—</span>}
                          </td>
                          <td className="px-4 py-3 text-sm text-right text-gray-600">{day.jobCount}</td>
                          <td className="px-4 py-3 text-sm text-right text-gray-600">{day.totalM2.toFixed(2)}</td>
                          <td className="px-4 py-3 text-center">
                            <span className={`inline-block transition-transform ${isExpanded ? "rotate-180" : ""}`}>▼</span>
                          </td>
                        </tr>

                        {isExpanded && (
                          <tr>
                            <td colSpan={10} className="bg-gray-50 px-4 py-4">
                              {/* Timeline visualisatie */}
                              <div className="mb-4">
                                <h4 className="text-sm font-semibold text-gray-700 mb-3">Activiteit Timeline</h4>
                                <TimelineBar completions={day.completions} />
                              </div>

                              {/* Detail tabel */}
                              <div className="overflow-x-auto">
                                <table className="min-w-full text-sm">
                                  <thead>
                                    <tr className="text-xs text-gray-500 uppercase">
                                      <th className="pr-4 py-1 text-left">#</th>
                                      <th className="pr-4 py-1 text-left">Tijd</th>
                                      <th className="pr-4 py-1 text-left">Formaat</th>
                                      <th className="pr-4 py-1 text-right">Stuks</th>
                                      <th className="pr-4 py-1 text-right">M²</th>
                                      <th className="pr-4 py-1 text-right">Gap</th>
                                      <th className="pr-4 py-1 text-center">Status</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {day.completions.map((c, i) => (
                                      <tr key={i} className={c.isIdle ? "bg-orange-50" : ""}>
                                        <td className="pr-4 py-1 text-gray-400">{i + 1}</td>
                                        <td className="pr-4 py-1 font-mono text-gray-800">{formatTime(c.time)}</td>
                                        <td className="pr-4 py-1 text-gray-600">{c.format || "—"}</td>
                                        <td className="pr-4 py-1 text-right text-gray-600">{c.quantity}</td>
                                        <td className="pr-4 py-1 text-right text-gray-600">{c.m2.toFixed(2)}</td>
                                        <td className="pr-4 py-1 text-right">
                                          {c.gapMinutes !== null ? (
                                            <span className={c.isIdle ? "text-orange-600 font-medium" : "text-gray-500"}>
                                              {c.gapMinutes < 1 ? "<1m" : formatMinutes(c.gapMinutes)}
                                            </span>
                                          ) : (
                                            <span className="text-gray-300">—</span>
                                          )}
                                        </td>
                                        <td className="pr-4 py-1 text-center">
                                          {c.isIdle ? (
                                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-700">
                                              pauze
                                            </span>
                                          ) : (
                                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
                                              actief
                                            </span>
                                          )}
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === "idle" && (
        <div className="space-y-6">
          {/* Pauzetijd per dag grafiek */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Pauzetijd per Dag (minuten)</h2>
            {dailyChartData.length > 0 ? (
              <div>
                <div className="h-48 flex items-end gap-1 border-b border-l border-gray-200 pl-1 pb-1">
                  {dailyChartData.map((day, i) => {
                    const maxIdle = Math.max(...dailyChartData.map(d => d.totalIdleMinutes), 30)
                    const h = Math.max((day.totalIdleMinutes / maxIdle) * 100, day.totalIdleMinutes > 0 ? 2 : 0)
                    return (
                      <div key={i} className="flex-1 flex items-end justify-center min-w-0 group relative">
                        <div className="hidden group-hover:block absolute bottom-full mb-2 z-10 bg-gray-900 text-white text-xs rounded-lg p-2 whitespace-nowrap">
                          <div className="font-medium">{formatDate(day.date)}</div>
                          <div>{formatMinutes(day.totalIdleMinutes)} idle</div>
                          <div>{day.idleCount} pauzes</div>
                        </div>
                        <div
                          className="w-full bg-orange-400 rounded-t-sm transition-all"
                          style={{ height: `${h}%` }}
                        />
                      </div>
                    )
                  })}
                </div>
                <div className="flex gap-1 mt-1 pl-1">
                  {dailyChartData.map((day, i) => (
                    <div key={i} className="flex-1 text-center min-w-0">
                      <span className="text-[10px] text-gray-400 truncate block">
                        {dailyChartData.length <= 14
                          ? formatDate(day.date)
                          : i % Math.ceil(dailyChartData.length / 10) === 0
                            ? formatDate(day.date)
                            : ""
                        }
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="text-center py-12 text-gray-500">Geen data beschikbaar</div>
            )}
          </div>

          {/* Actief vs Idle ratio per dag */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Actief vs Idle Verhouding per Dag</h2>
            {dailyChartData.filter(d => d.totalActiveMinutes + d.totalIdleMinutes > 0).length > 0 ? (
              <div className="space-y-3">
                {dailyChartData
                  .filter(d => d.totalActiveMinutes + d.totalIdleMinutes > 0)
                  .map((day, i) => {
                    const total = day.totalActiveMinutes + day.totalIdleMinutes
                    const activePct = total > 0 ? (day.totalActiveMinutes / total) * 100 : 0
                    return (
                      <div key={i}>
                        <div className="flex justify-between text-sm mb-1">
                          <span className="text-gray-600">{formatDate(day.date)}</span>
                          <span className="text-gray-500">
                            {formatMinutes(day.totalActiveMinutes)} actief / {formatMinutes(day.totalIdleMinutes)} idle
                            <span className="ml-2 font-medium text-blue-600">({Math.round(activePct)}% actief)</span>
                          </span>
                        </div>
                        <div className="w-full h-5 bg-gray-100 rounded-full overflow-hidden flex">
                          <div
                            className="bg-blue-500 h-full transition-all"
                            style={{ width: `${activePct}%` }}
                          />
                          <div
                            className="bg-orange-400 h-full transition-all"
                            style={{ width: `${100 - activePct}%` }}
                          />
                        </div>
                      </div>
                    )
                  })}
              </div>
            ) : (
              <div className="text-center py-12 text-gray-500">Geen data beschikbaar</div>
            )}
          </div>

          {/* Alle Print Sessies */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Alle Print Sessies</h2>
            <p className="text-sm text-gray-500 mb-4">
              Een sessie is een aaneengesloten reeks printjobs zonder pauze (&gt;5 min). Klik op een rij om de individuele jobs te zien.
            </p>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Datum</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Operator</th>
                    <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Start</th>
                    <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Einde</th>
                    <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Duur</th>
                    <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Jobs</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Platen (formaat × stuks)</th>
                    <th className="px-4 py-2"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {allSessions.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-4 py-8 text-center text-gray-500">Geen sessies gevonden</td>
                    </tr>
                  ) : (
                    allSessions.map((session) => {
                      const isExpanded = expandedSession === session.key
                      // Groepeer formaten voor samenvatting
                      const formatGroups = session.completions.reduce<Record<string, { quantity: number; m2: number }>>((acc, c) => {
                        const key = c.format || "Onbekend"
                        if (!acc[key]) acc[key] = { quantity: 0, m2: 0 }
                        acc[key].quantity += c.quantity
                        acc[key].m2 += c.m2
                        return acc
                      }, {})
                      return (
                        <Fragment key={session.key}>
                          <tr
                            className="hover:bg-gray-50 cursor-pointer transition-colors"
                            onClick={() => setExpandedSession(isExpanded ? null : session.key)}
                          >
                            <td className="px-4 py-2 text-gray-700">{formatDate(session.date)}</td>
                            <td className="px-4 py-2 text-gray-600">{session.operatorName}</td>
                            <td className="px-4 py-2 text-right font-mono text-gray-600">{formatTime(session.startTime)}</td>
                            <td className="px-4 py-2 text-right font-mono text-gray-600">{formatTime(session.endTime)}</td>
                            <td className="px-4 py-2 text-right font-medium text-blue-600">
                              {session.durationMinutes < 1 ? "&lt;1m" : formatMinutes(session.durationMinutes)}
                            </td>
                            <td className="px-4 py-2 text-right text-gray-600">{session.completions.length}</td>
                            <td className="px-4 py-2">
                              <div className="flex flex-wrap gap-1">
                                {Object.entries(formatGroups).map(([fmt, data]) => (
                                  <span
                                    key={fmt}
                                    className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-100"
                                  >
                                    {fmt} × {data.quantity}
                                  </span>
                                ))}
                              </div>
                            </td>
                            <td className="px-4 py-2 text-center">
                              <span className={`inline-block transition-transform text-gray-400 ${isExpanded ? "rotate-180" : ""}`}>▼</span>
                            </td>
                          </tr>
                          {isExpanded && (
                            <tr>
                              <td colSpan={8} className="bg-blue-50 px-6 py-4">
                                <h4 className="text-xs font-semibold text-gray-600 uppercase mb-2">Individuele printjobs in deze sessie</h4>
                                <table className="min-w-full text-sm">
                                  <thead>
                                    <tr className="text-xs text-gray-500">
                                      <th className="pr-4 py-1 text-left">#</th>
                                      <th className="pr-4 py-1 text-left">Tijdstip</th>
                                      <th className="pr-4 py-1 text-left">Formaat / Plaat</th>
                                      <th className="pr-4 py-1 text-right">Stuks</th>
                                      <th className="pr-4 py-1 text-right">M²</th>
                                      <th className="pr-4 py-1 text-right">Gap</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {session.completions.map((c, i) => (
                                      <tr key={i} className="border-t border-blue-100">
                                        <td className="pr-4 py-1 text-gray-400">{i + 1}</td>
                                        <td className="pr-4 py-1 font-mono text-gray-800">{formatTime(c.time)}</td>
                                        <td className="pr-4 py-1 text-gray-700 font-medium">{c.format || "—"}</td>
                                        <td className="pr-4 py-1 text-right text-gray-600">{c.quantity}</td>
                                        <td className="pr-4 py-1 text-right text-gray-600">{c.m2.toFixed(2)}</td>
                                        <td className="pr-4 py-1 text-right text-gray-500">
                                          {c.gapMinutes !== null && c.gapMinutes > 0
                                            ? (c.gapMinutes < 1 ? "<1m" : formatMinutes(c.gapMinutes))
                                            : "—"}
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Alle idle periodes */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Alle Pauzes (&gt;5 min)</h2>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Datum</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Operator</th>
                    <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Van</th>
                    <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Tot</th>
                    <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Duur</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {filteredDays.flatMap(day =>
                    day.idlePeriods.map((ip, i) => (
                      <tr key={`${day.date}-${day.operatorId}-${i}`} className="hover:bg-gray-50">
                        <td className="px-4 py-2 text-gray-700">{formatDate(day.date)}</td>
                        <td className="px-4 py-2 text-gray-600">{day.operatorName}</td>
                        <td className="px-4 py-2 text-right font-mono text-gray-600">{formatTime(ip.from)}</td>
                        <td className="px-4 py-2 text-right font-mono text-gray-600">{formatTime(ip.to)}</td>
                        <td className="px-4 py-2 text-right font-medium text-orange-600">{formatMinutes(ip.durationMinutes)}</td>
                      </tr>
                    ))
                  )}
                  {filteredDays.flatMap(d => d.idlePeriods).length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-gray-500">
                        Geen pauzes gevonden in de geselecteerde periode
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// Timeline bar component — visuele representatie van completions op een tijdlijn
function TimelineBar({ completions }: { completions: Completion[] }) {
  if (completions.length < 2) {
    return (
      <div className="text-xs text-gray-400 italic">Te weinig datapunten voor een timeline</div>
    )
  }

  const firstMs = new Date(completions[0].time).getTime()
  const lastMs = new Date(completions[completions.length - 1].time).getTime()
  const spanMs = lastMs - firstMs

  if (spanMs === 0) return null

  return (
    <div className="relative">
      {/* Tijdlijn balk */}
      <div className="relative h-10 bg-gray-100 rounded-lg overflow-hidden">
        {completions.map((c, i) => {
          if (i === 0) return null
          const prevMs = new Date(completions[i - 1].time).getTime()
          const curMs = new Date(c.time).getTime()
          const left = ((prevMs - firstMs) / spanMs) * 100
          const width = ((curMs - prevMs) / spanMs) * 100

          return (
            <div
              key={i}
              className={`absolute top-0 h-full ${c.isIdle ? "bg-orange-300" : "bg-blue-400"}`}
              style={{ left: `${left}%`, width: `${Math.max(width, 0.3)}%` }}
              title={`${formatTime(completions[i - 1].time)} - ${formatTime(c.time)} (${c.gapMinutes?.toFixed(1)}m)${c.isIdle ? " — PAUZE" : ""}`}
            />
          )
        })}
        {/* Completion points */}
        {completions.map((c, i) => {
          const ms = new Date(c.time).getTime()
          const pos = ((ms - firstMs) / spanMs) * 100
          return (
            <div
              key={`dot-${i}`}
              className="absolute top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-white border-2 border-gray-700 z-10"
              style={{ left: `calc(${pos}% - 4px)` }}
              title={`${formatTime(c.time)} — ${c.format || "?"} × ${c.quantity}`}
            />
          )
        })}
      </div>
      {/* Tijdlabels */}
      <div className="flex justify-between mt-1 text-xs text-gray-500">
        <span>{formatTime(completions[0].time)}</span>
        <span>{formatTime(completions[completions.length - 1].time)}</span>
      </div>
      {/* Legenda */}
      <div className="flex gap-4 mt-1 text-xs text-gray-500">
        <div className="flex items-center gap-1">
          <div className="w-3 h-2 bg-blue-400 rounded-sm" /> actief
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-2 bg-orange-300 rounded-sm" /> pauze (&gt;5 min)
        </div>
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-full border-2 border-gray-700 bg-white" /> completion
        </div>
      </div>
    </div>
  )
}
