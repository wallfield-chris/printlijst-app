"use client"

import { useEffect, useState } from "react"
import ChangeBadge from "@/app/components/ChangeBadge"

interface User {
  id: string
  name: string
  email: string
}

interface CompletedJob {
  id: string
  orderNumber: string
  productName: string
  quantity: number
  tags?: string
  startedAt?: string
  completedAt?: string
  completedByUser?: User
}

interface EmployeeStat {
  userId: string
  name: string
  email: string
  jobCount: number
  totalQuantity: number
  totalM2: number
  totalPrintMinutes: number
  avgProcessingMs: number
}

interface PeriodStats {
  jobCount: number
  totalQuantity: number
  totalM2: number
  totalPrintMinutes: number
  avgProcessingMs: number
  m2PerHour: number
  employees: EmployeeStat[]
  shiftbaseHours: number | null
}

interface DailyBreakdown {
  date: string
  jobCount: number
  totalM2: number
  totalMinutes: number
  shiftbaseHours: number
}

interface PrevPeriodStats {
  jobCount: number
  totalQuantity: number
  totalM2: number
  totalPrintMinutes: number
  avgProcessingMs: number
  m2PerHour: number
  shiftbaseHours: number | null
}

interface Stats {
  statusCounts: { printStatus: string; _count: number }[]
  open: { m2: number; printMinutes: number; jobCount: number }
  today: PeriodStats
  week: PeriodStats
  month: PeriodStats
  prevToday: PrevPeriodStats
  prevWeek: PrevPeriodStats
  prevMonth: PrevPeriodStats
  dailyBreakdown: DailyBreakdown[]
  completedToday: CompletedJob[]
}

type Period = "today" | "week" | "month"

export default function DashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [activePeriod, setActivePeriod] = useState<Period>("today")

  useEffect(() => {
    fetchData()
  }, [])

  useEffect(() => {
    if (!autoRefresh) return
    const interval = setInterval(fetchData, 5000)
    return () => clearInterval(interval)
  }, [autoRefresh])

  const fetchData = async () => {
    try {
      const res = await fetch("/api/stats")
      if (!res.ok) throw new Error("Fout bij ophalen van data")
      const data = await res.json()
      setStats(data)
      setError("")
    } catch (err) {
      setError("Kan data niet laden")
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const formatTime = (ms: number) => {
    if (ms === 0) return "—"
    const seconds = Math.floor(ms / 1000)
    const minutes = Math.floor(seconds / 60)
    const hours = Math.floor(minutes / 60)
    if (hours > 0) return `${hours}u ${minutes % 60}m`
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`
    return `${seconds}s`
  }

  const formatMinutes = (minutes: number): string => {
    if (minutes === 0) return "—"
    if (minutes < 60) return `${minutes} min`
    const hours = Math.floor(minutes / 60)
    const mins = minutes % 60
    if (mins === 0) return `${hours} uur`
    return `${hours}u ${mins}m`
  }

  const formatDate = (dateStr: string): string => {
    const d = new Date(dateStr + "T00:00:00")
    const days = ["zo", "ma", "di", "wo", "do", "vr", "za"]
    return `${days[d.getDay()]} ${d.getDate()}/${d.getMonth() + 1}`
  }

  const getStatusCount = (status: string) => {
    return stats?.statusCounts.find(s => s.printStatus === status)?._count || 0
  }

  if (loading && !stats) {
    return (
      <div className="p-8">
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        </div>
      </div>
    )
  }

  const periodLabels: Record<Period, string> = {
    today: "Vandaag",
    week: "Afgelopen 7 dagen",
    month: "Afgelopen 30 dagen",
  }

  const periodData = stats ? stats[activePeriod] : null
  const prevPeriodMap: Record<Period, "prevToday" | "prevWeek" | "prevMonth"> = {
    today: "prevToday",
    week: "prevWeek",
    month: "prevMonth",
  }
  const prevData = stats ? stats[prevPeriodMap[activePeriod]] : null

  return (
    <div className="p-8">
      <div className="mb-8 flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-gray-600 mt-2">Real-time productie monitoring</p>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={autoRefresh}
            onChange={(e) => setAutoRefresh(e.target.checked)}
            className="rounded"
          />
          <span className="text-gray-600">Auto-refresh (5s)</span>
        </label>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-100 border border-red-400 text-red-700 rounded-lg">{error}</div>
      )}

      {/* Row 1 - Live status */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Wachtend</p>
              <p className="text-3xl font-bold text-blue-600">{getStatusCount("pending")}</p>
            </div>
            <div className="p-3 bg-blue-100 rounded-full">
              <svg className="w-8 h-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">In Bewerking</p>
              <p className="text-3xl font-bold text-yellow-600">{getStatusCount("in_progress")}</p>
            </div>
            <div className="p-3 bg-yellow-100 rounded-full">
              <svg className="w-8 h-8 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">M² Open</p>
              <p className="text-3xl font-bold text-indigo-600">{stats?.open.m2 || 0}</p>
              <p className="text-xs text-gray-400 mt-1">{stats?.open.jobCount || 0} jobs</p>
            </div>
            <div className="p-3 bg-indigo-100 rounded-full">
              <svg className="w-8 h-8 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z" />
              </svg>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Geschatte Printtijd Open</p>
              <p className="text-3xl font-bold text-orange-600">{formatMinutes(stats?.open.printMinutes || 0)}</p>
            </div>
            <div className="p-3 bg-orange-100 rounded-full">
              <svg className="w-8 h-8 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
          </div>
        </div>
      </div>

      {/* Periode selector */}
      <div className="mb-6 border-b border-gray-200">
        <nav className="-mb-px flex space-x-8">
          {(Object.keys(periodLabels) as Period[]).map(period => (
            <button
              key={period}
              onClick={() => setActivePeriod(period)}
              className={`py-2 px-1 border-b-2 font-medium text-sm transition-colors ${
                activePeriod === period
                  ? "border-blue-500 text-blue-600"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              }`}
            >
              {periodLabels[period]}
            </button>
          ))}
        </nav>
      </div>

      {/* Row 2 - Productie stats voor gekozen periode */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-6 mb-8">
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-gray-600">Jobs Voltooid</p>
            {prevData && <ChangeBadge current={periodData?.jobCount || 0} previous={prevData.jobCount} />}
          </div>
          <p className="text-3xl font-bold text-green-600">{periodData?.jobCount || 0}</p>
          <p className="text-xs text-gray-400 mt-1">{periodData?.totalQuantity || 0} stuks</p>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-gray-600">M² Geprint</p>
            {prevData && <ChangeBadge current={periodData?.totalM2 || 0} previous={prevData.totalM2} />}
          </div>
          <p className="text-3xl font-bold text-indigo-600">{periodData?.totalM2 || 0}</p>
          <p className="text-xs text-gray-400 mt-1">vierkante meter</p>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-gray-600">Geschatte Printtijd</p>
            {prevData && <ChangeBadge current={periodData?.totalPrintMinutes || 0} previous={prevData.totalPrintMinutes} />}
          </div>
          <p className="text-3xl font-bold text-purple-600">{formatMinutes(periodData?.totalPrintMinutes || 0)}</p>
          <p className="text-xs text-gray-400 mt-1">op basis van formaten</p>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-gray-600">M²/uur</p>
            {prevData && <ChangeBadge current={periodData?.m2PerHour || 0} previous={prevData.m2PerHour} />}
          </div>
          <p className="text-3xl font-bold text-teal-600">{periodData?.m2PerHour || 0}</p>
          <p className="text-xs text-gray-400 mt-1">gemiddelde doorvoer</p>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-gray-600">Gem. Verwerkingstijd</p>
            {prevData && <ChangeBadge current={periodData?.avgProcessingMs || 0} previous={prevData.avgProcessingMs} invertColor />}
          </div>
          <p className="text-3xl font-bold text-orange-600">{formatTime(periodData?.avgProcessingMs || 0)}</p>
          <p className="text-xs text-gray-400 mt-1">start → klaar per job</p>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-gray-600">Werktijd (Shiftbase)</p>
            {prevData?.shiftbaseHours != null && periodData?.shiftbaseHours != null && (
              <ChangeBadge current={periodData.shiftbaseHours} previous={prevData.shiftbaseHours} />
            )}
          </div>
          {periodData?.shiftbaseHours != null ? (
            <>
              <p className="text-3xl font-bold text-cyan-600">
                {formatMinutes(Math.round(periodData.shiftbaseHours * 60))}
              </p>
              {(() => {
                const printHours = (periodData?.totalPrintMinutes || 0) / 60
                const workHours = periodData.shiftbaseHours
                if (printHours > 0 && workHours > 0) {
                  const ratio = Math.round((printHours / workHours) * 100)
                  const color = ratio > 80 ? "text-green-600" : ratio > 50 ? "text-yellow-600" : "text-red-500"
                  return <p className={`text-xs mt-1 ${color}`}>Benutting: {ratio}% van werktijd</p>
                }
                return <p className="text-xs text-gray-400 mt-1">Print team uren</p>
              })()}
            </>
          ) : (
            <>
              <p className="text-3xl font-bold text-gray-300">—</p>
              <p className="text-xs text-gray-400 mt-1">niet beschikbaar</p>
            </>
          )}
        </div>
      </div>

      {/* Daily breakdown chart (last 7 days) */}
      {stats && stats.dailyBreakdown.length > 0 && (
        <div className="mb-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Productie afgelopen 7 dagen</h2>
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <div className="grid grid-cols-7 gap-px bg-gray-200">
              {stats.dailyBreakdown.map(day => {
                const maxM2 = Math.max(...stats.dailyBreakdown.map(d => d.totalM2), 0.1)
                const barHeight = day.totalM2 > 0 ? Math.max((day.totalM2 / maxM2) * 100, 8) : 0
                return (
                  <div key={day.date} className="bg-white p-3 text-center">
                    <p className="text-xs font-medium text-gray-500">{formatDate(day.date)}</p>
                    <div className="h-24 flex items-end justify-center gap-1 mt-2">
                      <div
                        className="w-5 bg-indigo-500 rounded-t transition-all"
                        style={{ height: `${barHeight}%` }}
                        title={`${day.totalM2} m² geprint`}
                      />
                      {day.shiftbaseHours > 0 && (
                        <div
                          className="w-5 bg-cyan-400 rounded-t transition-all"
                          style={{ height: `${Math.max((day.shiftbaseHours / Math.max(...stats.dailyBreakdown.map(d => d.shiftbaseHours || 0.1), 0.1)) * 100, 8)}%` }}
                          title={`${day.shiftbaseHours}u werktijd`}
                        />
                      )}
                    </div>
                    <p className="text-sm font-bold text-gray-900 mt-1">{day.totalM2} m²</p>
                    <p className="text-xs text-gray-400">{day.jobCount} jobs</p>
                    <p className="text-xs text-gray-400">{formatMinutes(day.totalMinutes)}</p>
                    {day.shiftbaseHours > 0 && (
                      <p className="text-xs text-cyan-600 font-medium">{day.shiftbaseHours}u werk</p>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* Werknemers & Active/Recent */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* Employee leaderboard */}
        <div className="bg-white rounded-lg shadow">
          <div className="p-6 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">
              Werknemers — {periodLabels[activePeriod].toLowerCase()}
            </h2>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase w-10">#</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Naam</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Jobs</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">M²</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Printtijd</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Gem. snelheid</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {periodData?.employees.filter(e => e.jobCount > 0).map((emp, i) => {
                  const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : ""
                  return (
                    <tr key={emp.userId} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm">
                        {medal || <span className="text-gray-400">{i + 1}</span>}
                      </td>
                      <td className="px-4 py-3 text-sm font-medium text-gray-900">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center text-white text-xs font-semibold">
                            {emp.name.charAt(0)}
                          </div>
                          {emp.name}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-right font-mono text-gray-900">{emp.jobCount}</td>
                      <td className="px-4 py-3 text-sm text-right font-mono text-gray-900">{emp.totalM2}</td>
                      <td className="px-4 py-3 text-sm text-right text-gray-500">{formatMinutes(emp.totalPrintMinutes)}</td>
                      <td className="px-4 py-3 text-sm text-right text-gray-500">{formatTime(emp.avgProcessingMs)}</td>
                    </tr>
                  )
                })}
                {(!periodData?.employees || periodData.employees.filter(e => e.jobCount > 0).length === 0) && (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-gray-400">
                      Geen data voor deze periode
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Recent voltooid vandaag */}
        <div className="bg-white rounded-lg shadow">
          <div className="p-6 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">Recent Voltooid Vandaag</h2>
          </div>
          <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50 sticky top-0">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Order</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Product</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Door</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Tijd</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {stats?.completedToday.map(job => {
                  const procTime = job.startedAt && job.completedAt
                    ? new Date(job.completedAt).getTime() - new Date(job.startedAt).getTime()
                    : 0
                  return (
                    <tr key={job.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm font-medium text-gray-900">#{job.orderNumber}</td>
                      <td className="px-4 py-3 text-sm text-gray-600 max-w-[200px] truncate">{job.productName}</td>
                      <td className="px-4 py-3 text-sm text-gray-500">{job.completedByUser?.name || "—"}</td>
                      <td className="px-4 py-3 text-sm text-right text-gray-500">{procTime > 0 ? formatTime(procTime) : "—"}</td>
                    </tr>
                  )
                })}
                {(!stats?.completedToday || stats.completedToday.length === 0) && (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-gray-400">
                      Nog geen voltooide jobs vandaag
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}


