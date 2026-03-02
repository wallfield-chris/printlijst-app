"use client"

import { useSession, signOut } from "next-auth/react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { useEffect, useState } from "react"

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

interface DailyBreakdown {
  date: string
  jobCount: number
  totalM2: number
  totalMinutes: number
}

interface StatsData {
  currentUserId: string
  periods: {
    today: EmployeeStat[]
    week: EmployeeStat[]
    month: EmployeeStat[]
    allTime: EmployeeStat[]
  }
  dailyBreakdown: DailyBreakdown[]
}

type Period = "today" | "week" | "month" | "allTime"

export default function DataPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [stats, setStats] = useState<StatsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [initialLoadDone, setInitialLoadDone] = useState(false)
  const [activePeriod, setActivePeriod] = useState<Period>("week")

  useEffect(() => {
    if (status === "loading") return
    if (!session) {
      router.push("/login")
      return
    }
    if ((session.user as any).role === "admin") {
      router.push("/admin")
      return
    }
    fetchStats()
  }, [session, status, router])

  const fetchStats = async () => {
    try {
      setLoading(true)
      const res = await fetch("/api/stats/employee")
      if (res.ok) {
        const data = await res.json()
        setStats(data)
        setInitialLoadDone(true)
      }
    } catch (err) {
      console.error("Error fetching stats:", err)
    } finally {
      setLoading(false)
    }
  }

  const formatDuration = (ms: number): string => {
    if (ms === 0) return "—"
    const seconds = Math.floor(ms / 1000)
    if (seconds < 60) return `${seconds}s`
    const minutes = Math.floor(seconds / 60)
    const secs = seconds % 60
    if (minutes < 60) return `${minutes}m ${secs}s`
    const hours = Math.floor(minutes / 60)
    const mins = minutes % 60
    return `${hours}u ${mins}m`
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

  if ((status === "loading" || loading) && !initialLoadDone) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <p className="text-gray-500 text-lg">Laden...</p>
      </div>
    )
  }

  if (!stats) return null

  const currentUserId = stats.currentUserId
  const periodData = stats.periods[activePeriod]
  const myStats = periodData.find((e) => e.userId === currentUserId)
  const myRank = periodData.findIndex((e) => e.userId === currentUserId) + 1

  const periodLabels: Record<Period, string> = {
    today: "Vandaag",
    week: "Afgelopen 7 dagen",
    month: "Afgelopen 30 dagen",
    allTime: "Totaal",
  }

  // Max waarden voor bar charts
  const maxJobs = Math.max(...periodData.map((e) => e.jobCount), 1)
  const maxM2 = Math.max(...periodData.map((e) => e.totalM2), 1)

  return (
    <div className="min-h-screen bg-gray-100">
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
          <div className="flex items-center gap-6">
            <h1 className="text-2xl font-bold text-gray-900">Statistieken</h1>
            <nav className="flex gap-1">
              <Link
                href="/printjobs"
                className="px-3 py-1.5 text-sm font-medium rounded-md text-gray-600 hover:text-gray-900 hover:bg-gray-100 transition-colors"
              >
                Printlijst
              </Link>
              <span className="px-3 py-1.5 text-sm font-medium rounded-md bg-blue-100 text-blue-700">
                Data
              </span>
            </nav>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-600">
              Ingelogd als: <span className="font-medium">{session?.user?.name}</span>
            </span>
            <button
              onClick={() => signOut({ callbackUrl: "/login" })}
              className="px-4 py-2 text-sm text-red-600 hover:text-red-800"
            >
              Uitloggen
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Periode selector */}
        <div className="mb-6 border-b border-gray-200">
          <nav className="-mb-px flex space-x-8">
            {(Object.keys(periodLabels) as Period[]).map((period) => (
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

        {/* Persoonlijke stats */}
        <div className="mb-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            Jouw prestaties — {periodLabels[activePeriod].toLowerCase()}
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <div className="bg-white rounded-lg shadow p-4">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Ranking</p>
              <p className="mt-1 text-3xl font-bold text-blue-600">
                #{myRank || "—"}
              </p>
              <p className="text-xs text-gray-400 mt-1">van {periodData.length} werknemers</p>
            </div>
            <div className="bg-white rounded-lg shadow p-4">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Jobs afgerond</p>
              <p className="mt-1 text-3xl font-bold text-gray-900">
                {myStats?.jobCount || 0}
              </p>
              <p className="text-xs text-gray-400 mt-1">{myStats?.totalQuantity || 0} stuks totaal</p>
            </div>
            <div className="bg-white rounded-lg shadow p-4">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Printtijd</p>
              <p className="mt-1 text-3xl font-bold text-green-600">
                {formatMinutes(myStats?.totalPrintMinutes || 0)}
              </p>
              <p className="text-xs text-gray-400 mt-1">geschatte printtijd</p>
            </div>
            <div className="bg-white rounded-lg shadow p-4">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Totaal m²</p>
              <p className="mt-1 text-3xl font-bold text-purple-600">
                {myStats?.totalM2 || 0}
              </p>
              <p className="text-xs text-gray-400 mt-1">vierkante meter geprint</p>
            </div>
            <div className="bg-white rounded-lg shadow p-4">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Gem. snelheid</p>
              <p className="mt-1 text-3xl font-bold text-orange-600">
                {formatDuration(myStats?.avgProcessingMs || 0)}
              </p>
              <p className="text-xs text-gray-400 mt-1">per job (start → klaar)</p>
            </div>
          </div>
        </div>

        {/* Dagelijkse breakdown (alleen voor week-view) */}
        {activePeriod === "week" && stats.dailyBreakdown.length > 0 && (
          <div className="mb-8">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Jouw week overzicht</h2>
            <div className="bg-white rounded-lg shadow overflow-hidden">
              <div className="grid grid-cols-7 gap-px bg-gray-200">
                {stats.dailyBreakdown.map((day) => {
                  const maxDayJobs = Math.max(...stats.dailyBreakdown.map((d) => d.jobCount), 1)
                  const barHeight = day.jobCount > 0 ? Math.max((day.jobCount / maxDayJobs) * 100, 8) : 0
                  return (
                    <div key={day.date} className="bg-white p-3 text-center">
                      <p className="text-xs font-medium text-gray-500">{formatDate(day.date)}</p>
                      <div className="h-20 flex items-end justify-center mt-2">
                        <div
                          className="w-8 bg-blue-500 rounded-t transition-all"
                          style={{ height: `${barHeight}%` }}
                        />
                      </div>
                      <p className="text-sm font-bold text-gray-900 mt-1">{day.jobCount}</p>
                      <p className="text-xs text-gray-400">{day.totalM2} m²</p>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        )}

        {/* Leaderboard */}
        <div>
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            Leaderboard — {periodLabels[activePeriod].toLowerCase()}
          </h2>
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-12">
                    #
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Werknemer
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Jobs
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider hidden sm:table-cell">
                    Stuks
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-48 hidden md:table-cell">
                    Jobs
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    m²
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-48 hidden md:table-cell">
                    m²
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider hidden sm:table-cell">
                    Printtijd
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider hidden lg:table-cell">
                    Gem. snelheid
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {periodData.map((emp, index) => {
                  const rank = index + 1
                  const isMe = emp.userId === currentUserId
                  const medal = rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : ""
                  return (
                    <tr
                      key={emp.userId}
                      className={`${isMe ? "bg-blue-50 font-medium" : "hover:bg-gray-50"} transition-colors`}
                    >
                      <td className="px-4 py-3 text-sm">
                        <span className="inline-flex items-center gap-1">
                          {medal || <span className="text-gray-400">{rank}</span>}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-900">
                        {emp.name}
                        {isMe && (
                          <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
                            Jij
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-right text-gray-900 font-mono">
                        {emp.jobCount}
                      </td>
                      <td className="px-4 py-3 text-sm text-right text-gray-500 font-mono hidden sm:table-cell">
                        {emp.totalQuantity}
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell">
                        <div className="w-full bg-gray-100 rounded-full h-2">
                          <div
                            className={`h-2 rounded-full transition-all ${isMe ? "bg-blue-500" : "bg-gray-400"}`}
                            style={{ width: `${(emp.jobCount / maxJobs) * 100}%` }}
                          />
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-right text-gray-900 font-mono">
                        {emp.totalM2}
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell">
                        <div className="w-full bg-gray-100 rounded-full h-2">
                          <div
                            className={`h-2 rounded-full transition-all ${isMe ? "bg-purple-500" : "bg-gray-400"}`}
                            style={{ width: `${(emp.totalM2 / maxM2) * 100}%` }}
                          />
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-right text-gray-500 hidden sm:table-cell">
                        {formatMinutes(emp.totalPrintMinutes)}
                      </td>
                      <td className="px-4 py-3 text-sm text-right text-gray-500 hidden lg:table-cell">
                        {formatDuration(emp.avgProcessingMs)}
                      </td>
                    </tr>
                  )
                })}
                {periodData.length === 0 && (
                  <tr>
                    <td colSpan={9} className="px-4 py-8 text-center text-gray-400">
                      Geen data beschikbaar voor deze periode
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  )
}
