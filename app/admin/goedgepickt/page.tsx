"use client"

import { useEffect, useState } from "react"
import ChangeBadge from "@/app/components/ChangeBadge"

interface DailyData {
  date: string
  shipments: number
  completed: number
  inpakHours: number
  printHours: number
  inpakEmployees: { name: string; hours: number }[]
  shipmentsPerHour: number
}

interface ProcessingStats {
  avgDays: number
  medianDays: number
  totalOrders: number
  buckets: {
    sameDay: number
    oneToTwo: number
    twoToFive: number
    fiveToTen: number
    tenPlus: number
  }
}

interface EmployeeStat {
  name: string
  totalHours: number
  days: number
  avgHoursPerDay: number
  cost: number
}

interface TeamStat {
  name: string
  totalHours: number
  days: number
}

interface WeeklyEfficiency {
  week: string
  shipments: number
  hours: number
  perHour: number
}

interface GGStats {
  period: string
  periodLabel: string
  periodDays: number
  shipments: {
    total: number
    avgPerDay: number
  }
  completedOrders: {
    totalPeriod: number
    fetched: number
  }
  processing: ProcessingStats
  previousPeriod: {
    shipments: number
    avgPerDay: number
    completedOrders: number
    shipmentsPerHour: number | null
    totalHours: number | null
    totalCost: number | null
    costPerShipment: number | null
  }
  dailyData: DailyData[]
  shiftbase: {
    available: boolean
    totalHours?: number
    totalShipments?: number
    shipmentsPerHour?: number
    totalCost?: number
    costPerShipment?: number
    employeeStats?: EmployeeStat[]
    teamStats?: TeamStat[]
    weeklyEfficiency?: WeeklyEfficiency[]
  }
  lastSyncedAt?: string | null
  needsSync?: boolean
}

const PERIOD_OPTIONS = [
  { value: "7d", label: "7 dagen" },
  { value: "14d", label: "14 dagen" },
  { value: "30d", label: "30 dagen" },
  { value: "90d", label: "90 dagen" },
  { value: "this_month", label: "Deze maand" },
  { value: "last_month", label: "Vorige maand" },
]

export default function GoedgepicktPage() {
  const [stats, setStats] = useState<GGStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [tooltipDay, setTooltipDay] = useState<DailyData | null>(null)
  const [period, setPeriod] = useState("14d")
  const [syncing, setSyncing] = useState(false)
  const [syncMessage, setSyncMessage] = useState("")
  const [needsSync, setNeedsSync] = useState(false)
  const [syncProgress, setSyncProgress] = useState<{ step: number; totalSteps: number; message: string; detail?: string } | null>(null)
  const [syncError, setSyncError] = useState("")

  useEffect(() => {
    fetchStats()
  }, [period])

  const fetchStats = async () => {
    try {
      setLoading(true)
      const params = new URLSearchParams({ period })
      const res = await fetch(`/api/admin/goedgepickt?${params}`)
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || "Fout bij ophalen")
      }
      const data = await res.json()
      if (data.needsSync) {
        setNeedsSync(true)
        setStats(null)
      } else {
        setNeedsSync(false)
        setStats(data)
      }
      setError("")
    } catch (err: any) {
      setError(err.message || "Kan data niet laden")
    } finally {
      setLoading(false)
    }
  }

  const syncMetrics = async (days: number) => {
    try {
      setSyncing(true)
      setSyncMessage("")
      setSyncError("")
      setSyncProgress({ step: 0, totalSteps: 5, message: `Synchronisatie starten (${days} dagen)...` })

      const res = await fetch("/api/admin/sync-daily-metrics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ days }),
      })

      if (!res.ok) {
        const errData = await res.json().catch(() => ({ error: "Onbekende fout" }))
        throw new Error(errData.error || `HTTP ${res.status}`)
      }

      // Read SSE stream
      const reader = res.body?.getReader()
      const decoder = new TextDecoder()
      let buffer = ""

      if (!reader) throw new Error("Geen response stream")

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })

        // Process complete SSE messages
        const lines = buffer.split("\n\n")
        buffer = lines.pop() || "" // keep incomplete message in buffer

        for (const line of lines) {
          const dataLine = line.replace(/^data: /, "").trim()
          if (!dataLine) continue
          try {
            const event = JSON.parse(dataLine)
            if (event.type === "progress" || event.type === "start") {
              setSyncProgress({
                step: event.step || 0,
                totalSteps: event.totalSteps || 5,
                message: event.message,
                detail: event.detail,
              })
            } else if (event.type === "done") {
              setSyncProgress({ step: 5, totalSteps: 5, message: "✅ " + event.message })
              const r = event.result
              const warnings = event.warnings ? `\n⚠️ ${event.warnings.join(". ")}` : ""
              setSyncMessage(`${r.rowsWritten} dagen gesynchroniseerd (${r.ggShipments} zendingen, ${r.ggOrders} orders)${warnings}`)
              await fetchStats()
            } else if (event.type === "error") {
              setSyncError(event.message)
            }
          } catch { /* skip malformed JSON */ }
        }
      }
    } catch (err: any) {
      setSyncError(err.message || "Fout bij synchroniseren")
      setSyncProgress(null)
    } finally {
      setSyncing(false)
      // Keep progress visible for a bit, then clear
      setTimeout(() => {
        setSyncProgress(null)
        setSyncMessage("")
        setSyncError("")
      }, 15000)
    }
  }

  const formatDate = (dateStr: string): string => {
    const d = new Date(dateStr + "T00:00:00")
    const days = ["zo", "ma", "di", "wo", "do", "vr", "za"]
    return `${days[d.getDay()]} ${d.getDate()}/${d.getMonth() + 1}`
  }

  if (loading) {
    return (
      <div className="p-8">
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
          <p className="ml-4 text-gray-500">Data laden...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-4">GoedGepickt</h1>
        <div className="p-4 bg-red-100 border border-red-400 text-red-700 rounded-lg">
          {error}
        </div>
        <button
          onClick={() => fetchStats()}
          className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          Opnieuw proberen
        </button>
      </div>
    )
  }

  // Sync progress panel — shared between needsSync and normal view
  const SyncProgressPanel = () => {
    if (!syncProgress && !syncMessage && !syncError) return null
    return (
      <div className="bg-white border border-gray-200 rounded-lg p-6 mb-6 shadow-sm">
        <div className="flex items-center gap-3 mb-4">
          {syncing ? (
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600" />
          ) : syncError ? (
            <div className="w-6 h-6 bg-red-500 rounded-full flex items-center justify-center text-white text-xs font-bold">!</div>
          ) : (
            <div className="w-6 h-6 bg-green-500 rounded-full flex items-center justify-center text-white text-xs">✓</div>
          )}
          <h3 className="font-semibold text-gray-800">
            {syncing ? "Bezig met synchroniseren..." : syncError ? "Synchronisatie mislukt" : "Synchronisatie voltooid"}
          </h3>
        </div>

        {/* Progress bar */}
        {syncProgress && (
          <div className="mb-4">
            <div className="flex justify-between text-sm text-gray-600 mb-1">
              <span>{syncProgress.message}</span>
              <span>Stap {syncProgress.step}/{syncProgress.totalSteps}</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-3">
              <div
                className="bg-blue-600 h-3 rounded-full transition-all duration-500 ease-out"
                style={{ width: `${(syncProgress.step / syncProgress.totalSteps) * 100}%` }}
              />
            </div>
            {syncProgress.detail && (
              <p className="text-xs text-gray-500 mt-1">{syncProgress.detail}</p>
            )}
          </div>
        )}

        {/* Steps overview */}
        {syncing && syncProgress && (
          <div className="grid grid-cols-5 gap-2 mt-3">
            {["API Cooldown", "GG Zendingen", "GG Orders", "Shiftbase", "Opslaan"].map((label, i) => {
              const stepNum = i + 1
              const isDone = syncProgress.step > stepNum
              const isActive = syncProgress.step === stepNum
              return (
                <div key={i} className={`text-center py-2 px-1 rounded text-xs font-medium ${
                  isDone ? "bg-green-100 text-green-700" :
                  isActive ? "bg-blue-100 text-blue-700 animate-pulse" :
                  "bg-gray-100 text-gray-400"
                }`}>
                  {isDone ? "✅" : isActive ? "⏳" : "○"} {label}
                </div>
              )
            })}
          </div>
        )}

        {syncError && (
          <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
            {syncError}
          </div>
        )}
        {syncMessage && !syncError && (
          <p className="mt-3 text-sm text-green-700 font-medium">{syncMessage}</p>
        )}
      </div>
    )
  }

  if (!stats) {
    if (needsSync) {
      return (
        <div className="p-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-4">GoedGepickt &amp; Shiftbase</h1>
          
          <SyncProgressPanel />

          {!syncing && !syncMessage && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-8 text-center">
              <svg className="w-12 h-12 text-yellow-500 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
              <h2 className="text-xl font-semibold text-gray-800 mb-2">Nog geen data gesynchroniseerd</h2>
              <p className="text-gray-600 mb-6">Klik op onderstaande knop om de data van GoedGepickt en Shiftbase op te halen en op te slaan.</p>
              <div className="flex items-center justify-center gap-3">
                <button
                  onClick={() => syncMetrics(14)}
                  disabled={syncing}
                  className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium disabled:opacity-50"
                >
                  Synchroniseer laatste 14 dagen
                </button>
                <button
                  onClick={() => syncMetrics(90)}
                  disabled={syncing}
                  className="px-6 py-3 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 font-medium disabled:opacity-50"
                >
                  Volledige sync (90 dagen)
                </button>
              </div>
            </div>
          )}
        </div>
      )
    }
    return null
  }

  const { processing, dailyData, shiftbase } = stats

  // Max voor dagelijkse grafiek — gebruik shipments
  const maxDailyShipments = Math.max(...dailyData.map(d => d.shipments), 1)
  const maxDailyHours = Math.max(...dailyData.map(d => Math.max(d.inpakHours, d.printHours)), 1)

  // Bucket labels en kleuren
  const bucketConfig = [
    { key: "sameDay" as const, label: "< 1 dag", color: "bg-green-500" },
    { key: "oneToTwo" as const, label: "1-2 dagen", color: "bg-blue-500" },
    { key: "twoToFive" as const, label: "2-5 dagen", color: "bg-yellow-500" },
    { key: "fiveToTen" as const, label: "5-10 dagen", color: "bg-orange-500" },
    { key: "tenPlus" as const, label: "10+ dagen", color: "bg-red-500" },
  ]
  const maxBucket = Math.max(
    ...bucketConfig.map(b => processing.buckets[b.key]),
    1
  )

  const maxTeamHours = Math.max(...(shiftbase.teamStats?.map(t => t.totalHours) || [1]))
  const maxWeeklyPerHour = Math.max(...(shiftbase.weeklyEfficiency?.map(w => w.perHour) || [1]))

  const formatWeek = (mondayStr: string): string => {
    const d = new Date(mondayStr + "T00:00:00")
    const endOfWeek = new Date(d)
    endOfWeek.setDate(endOfWeek.getDate() + 6)
    return `${d.getDate()}/${d.getMonth() + 1} - ${endOfWeek.getDate()}/${endOfWeek.getMonth() + 1}`
  }

  return (
    <div className="p-8">
      <div className="mb-8 flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">GoedGepickt &amp; Shiftbase</h1>
          <p className="text-gray-600 mt-2">
            Zendingen, afhandeltijd &amp; productiviteit
          </p>
        </div>
        <div className="flex items-center gap-3">
          {stats?.lastSyncedAt && (
            <span className="text-xs text-gray-400">
              Laatste sync: {new Date(stats.lastSyncedAt).toLocaleString("nl-NL")}
            </span>
          )}
          {syncMessage && (
            <span className={`text-xs font-medium ${syncing ? "text-blue-500" : "text-green-600"}`}>
              {syncMessage}
            </span>
          )}
          <button
            onClick={() => syncMetrics(14)}
            disabled={syncing}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2 disabled:opacity-50"
          >
            <svg className={`w-4 h-4 ${syncing ? "animate-spin" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            {syncing ? "Bezig..." : "Synchroniseren"}
          </button>
          <button
            onClick={() => syncMetrics(90)}
            disabled={syncing}
            className="px-3 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 flex items-center gap-1 text-sm disabled:opacity-50"
            title="Volledige synchronisatie (90 dagen)"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
            Volledige sync
          </button>
        </div>
      </div>

      {/* Sync progress panel */}
      <SyncProgressPanel />

      {/* Periode selector */}
      <div className="mb-6 flex items-center gap-2">
        <span className="text-sm font-medium text-gray-500">Periode:</span>
        <div className="inline-flex rounded-lg border border-gray-200 bg-white shadow-sm">
          {PERIOD_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setPeriod(opt.value)}
              className={`px-3 py-1.5 text-sm font-medium transition-colors first:rounded-l-lg last:rounded-r-lg ${
                period === opt.value
                  ? "bg-blue-600 text-white"
                  : "text-gray-600 hover:bg-gray-50"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
        {loading && (
          <div className="animate-spin rounded-full h-4 w-4 border-2 border-blue-600 border-t-transparent ml-2"></div>
        )}
      </div>

      {/* Overzicht kaarten */}
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-6 mb-8">
        {/* Totaal Zendingen */}
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium text-gray-600">Zendingen</p>
                <ChangeBadge current={stats.shipments.total} previous={stats.previousPeriod.shipments} label="zendingen" />
              </div>
              <p className="text-3xl font-bold text-green-600">{stats.shipments.total}</p>
              <p className="text-xs text-gray-400 mt-1">totaal in {stats.periodLabel}</p>
            </div>
            <div className="p-3 bg-green-100 rounded-full">
              <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
              </svg>
            </div>
          </div>
        </div>

        {/* Gem per dag */}
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium text-gray-600">Gem. per Dag</p>
                <ChangeBadge current={stats.shipments.avgPerDay} previous={stats.previousPeriod.avgPerDay} label="per dag" />
              </div>
              <p className="text-3xl font-bold text-indigo-600">
                {stats.shipments.avgPerDay}
              </p>
              <p className="text-xs text-gray-400 mt-1">zendingen / dag</p>
            </div>
            <div className="p-3 bg-indigo-100 rounded-full">
              <svg className="w-8 h-8 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
          </div>
        </div>

        {/* Gem afhandeltijd */}
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Gem. Afhandeltijd</p>
              <p className="text-3xl font-bold text-blue-600">
                {processing.avgDays} <span className="text-lg font-normal">dagen</span>
              </p>
              <p className="text-xs text-gray-400 mt-1">
                mediaan: {processing.medianDays} d
              </p>
            </div>
            <div className="p-3 bg-blue-100 rounded-full">
              <svg className="w-8 h-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
          </div>
        </div>

        {/* Orders Afgerond */}
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium text-gray-600">Orders Afgerond</p>
                <ChangeBadge current={stats.completedOrders.totalPeriod} previous={stats.previousPeriod.completedOrders} label="orders" />
              </div>
              <p className="text-3xl font-bold text-purple-600">{stats.completedOrders.totalPeriod}</p>
              <p className="text-xs text-gray-400 mt-1">
                in {stats.periodLabel}
              </p>
            </div>
            <div className="p-3 bg-purple-100 rounded-full">
              <svg className="w-8 h-8 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
          </div>
        </div>
      </div>

      {/* Shiftbase KPI kaarten */}
      {shiftbase.available && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          {/* Zendingen per uur */}
          <div className="bg-white rounded-lg shadow p-6 ring-2 ring-orange-200">
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-gray-600">Zendingen / Uur</p>
                  {stats.previousPeriod.shipmentsPerHour != null && (
                    <ChangeBadge current={shiftbase.shipmentsPerHour || 0} previous={stats.previousPeriod.shipmentsPerHour} label="zend/uur" />
                  )}
                </div>
                <p className="text-3xl font-bold text-orange-600">
                  {shiftbase.shipmentsPerHour}
                </p>
                <p className="text-xs text-gray-400 mt-1">
                  {shiftbase.totalShipments} zend. / {shiftbase.totalHours}u
                </p>
              </div>
              <div className="p-3 bg-orange-100 rounded-full">
                <svg className="w-8 h-8 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
            </div>
            <p className="text-[10px] text-orange-500 mt-2 font-medium">Inpak Team &middot; {stats.periodLabel}</p>
          </div>

          {/* Totale Inpak Uren */}
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-gray-600">Inpak Uren ({stats.periodLabel})</p>
                  {stats.previousPeriod.totalHours != null && (
                    <ChangeBadge current={shiftbase.totalHours || 0} previous={stats.previousPeriod.totalHours} label="uur" />
                  )}
                </div>
                <p className="text-3xl font-bold text-amber-600">
                  {shiftbase.totalHours} <span className="text-lg font-normal">uur</span>
                </p>
                <p className="text-xs text-gray-400 mt-1">
                  {shiftbase.employeeStats?.length || 0} medewerkers
                </p>
              </div>
              <div className="p-3 bg-amber-100 rounded-full">
                <svg className="w-8 h-8 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
            </div>
            <p className="text-[10px] text-amber-500 mt-2 font-medium">Shiftbase &middot; Inpak Team</p>
          </div>

          {/* Totale Kosten Inpak */}
          <div className="bg-white rounded-lg shadow p-6 ring-2 ring-red-200">
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-gray-600">Kosten Inpak ({stats.periodLabel})</p>
                  {stats.previousPeriod.totalCost != null && (
                    <ChangeBadge current={shiftbase.totalCost || 0} previous={stats.previousPeriod.totalCost} invertColor label="€" formatValue={(v) => `€${v.toLocaleString("nl-NL", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`} />
                  )}
                </div>
                <p className="text-3xl font-bold text-red-600">
                  &euro;{shiftbase.totalCost?.toLocaleString("nl-NL")}
                </p>
                <p className="text-xs text-gray-400 mt-1">
                  &euro;{shiftbase.costPerShipment?.toFixed(2)} per zending
                </p>
              </div>
              <div className="p-3 bg-red-100 rounded-full">
                <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
            </div>
            <p className="text-[10px] text-red-500 mt-2 font-medium">&euro;17/uur gemiddeld &middot; {stats.periodLabel}</p>
          </div>

          {/* Kosten per Zending */}
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-gray-600">Kosten/Zending</p>
                  {stats.previousPeriod.costPerShipment != null && (
                    <ChangeBadge current={shiftbase.costPerShipment || 0} previous={stats.previousPeriod.costPerShipment} invertColor label="€/zending" formatValue={(v) => `€${v.toFixed(2)}`} />
                  )}
                </div>
                <p className="text-3xl font-bold text-rose-600">
                  &euro;{shiftbase.costPerShipment?.toFixed(2)}
                </p>
                <p className="text-xs text-gray-400 mt-1">
                  {shiftbase.totalShipments} zendingen totaal
                </p>
              </div>
              <div className="p-3 bg-rose-100 rounded-full">
                <svg className="w-8 h-8 text-rose-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                </svg>
              </div>
            </div>
            <p className="text-[10px] text-rose-500 mt-2 font-medium">inpak kosten / zendingen</p>
          </div>
        </div>
      )}

      {/* Zendingen per dag + Inpak uren (14 dagen) */}
      <div className="mb-8">
        <h2 className="text-lg font-semibold text-gray-900 mb-1">
          Zendingen &amp; Uren per dag
        </h2>
        <p className="text-sm text-gray-500 mb-4">Laatste {stats.periodLabel} — zendingen (groen), inpak uren (oranje), print uren (paars)</p>
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="grid gap-px bg-gray-200" style={{ gridTemplateColumns: `repeat(${dailyData.length}, minmax(0, 1fr))` }}>
            {dailyData.map(day => {
              const shipBarHeight = day.shipments > 0 ? Math.max((day.shipments / maxDailyShipments) * 100, 6) : 0
              const hoursBarHeight = day.inpakHours > 0 ? Math.max((day.inpakHours / maxDailyHours) * 100, 6) : 0
              const printBarHeight = day.printHours > 0 ? Math.max((day.printHours / maxDailyHours) * 100, 6) : 0
              const isToday = day.date === new Date().toISOString().split("T")[0]
              const isWeekend = (() => {
                const d = new Date(day.date + "T00:00:00")
                return d.getDay() === 0 || d.getDay() === 6
              })()
              return (
                <div
                  key={day.date}
                  className={`bg-white p-2 text-center cursor-pointer hover:bg-gray-50 transition-colors ${isToday ? "ring-2 ring-blue-400 ring-inset" : ""}`}
                  onClick={() => setTooltipDay(tooltipDay?.date === day.date ? null : day)}
                >
                  <p className={`text-[10px] font-medium ${isWeekend ? "text-red-400" : "text-gray-500"}`}>
                    {formatDate(day.date)}
                  </p>
                  <div className="h-20 flex items-end justify-center gap-0.5 mt-1">
                    <div
                      className={`w-3 rounded-t transition-all ${isToday ? "bg-blue-500" : isWeekend ? "bg-gray-300" : "bg-green-500"}`}
                      style={{ height: `${shipBarHeight}%` }}
                      title={`${day.shipments} zendingen`}
                    />
                    {shiftbase.available && (
                      <div
                        className="w-3 rounded-t transition-all bg-orange-400"
                        style={{ height: `${hoursBarHeight}%` }}
                        title={`${day.inpakHours}u inpak`}
                      />
                    )}
                    {shiftbase.available && (
                      <div
                        className="w-3 rounded-t transition-all bg-purple-500"
                        style={{ height: `${printBarHeight}%` }}
                        title={`${day.printHours}u print`}
                      />
                    )}
                  </div>
                  <p className="text-xs font-bold text-gray-900 mt-1">{day.shipments}</p>
                  {shiftbase.available && day.inpakHours > 0 && (
                    <p className="text-[9px] text-orange-600 font-semibold">{day.shipmentsPerHour}/u</p>
                  )}
                </div>
              )
            })}
          </div>

          {/* Legend */}
          <div className="px-4 py-2 bg-gray-50 border-t border-gray-200 flex gap-4 text-[10px] text-gray-500">
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 bg-green-500 rounded-sm inline-block"></span>
              Zendingen
            </span>
            {shiftbase.available && (
              <span className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 bg-orange-400 rounded-sm inline-block"></span>
                Inpak uren
              </span>
            )}
            {shiftbase.available && (
              <span className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 bg-purple-500 rounded-sm inline-block"></span>
                Print uren
              </span>
            )}
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 bg-gray-300 rounded-sm inline-block"></span>
              Weekend
            </span>
          </div>
        </div>

        {/* Tooltip / detail panel */}
        {tooltipDay && (
          <div className="mt-3 bg-white rounded-lg shadow border border-gray-200 p-4">
            <div className="flex justify-between items-start">
              <div>
                <h3 className="font-semibold text-gray-900">
                  {new Date(tooltipDay.date + "T00:00:00").toLocaleDateString("nl-NL", { weekday: "long", day: "numeric", month: "long" })}
                </h3>
                <div className="mt-2 grid grid-cols-4 gap-4 text-sm">
                  <div>
                    <p className="text-gray-500">Zendingen</p>
                    <p className="text-lg font-bold text-green-600">{tooltipDay.shipments}</p>
                  </div>
                  <div>
                    <p className="text-gray-500">Inpak uren</p>
                    <p className="text-lg font-bold text-orange-600">{tooltipDay.inpakHours || "—"}</p>
                  </div>
                  <div>
                    <p className="text-gray-500">Print uren</p>
                    <p className="text-lg font-bold text-purple-600">{tooltipDay.printHours || "—"}</p>
                  </div>
                  <div>
                    <p className="text-gray-500">Zend./uur</p>
                    <p className="text-lg font-bold text-blue-600">{tooltipDay.shipmentsPerHour || "—"}</p>
                  </div>
                </div>
              </div>
              <button onClick={() => setTooltipDay(null)} className="text-gray-400 hover:text-gray-600">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            {tooltipDay.inpakEmployees && tooltipDay.inpakEmployees.length > 0 && (
              <div className="mt-3 pt-3 border-t border-gray-100">
                <p className="text-xs font-medium text-gray-500 mb-2">Inpak Team medewerkers</p>
                <div className="flex flex-wrap gap-2">
                  {tooltipDay.inpakEmployees.map((emp, i) => (
                    <span key={i} className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-orange-50 text-orange-700 border border-orange-200">
                      {emp.name.split(" ")[0]} — {emp.hours}u
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* === Shiftbase Sectie === */}
      {shiftbase.available && (
        <div className="mb-8">
          <h2 className="text-xl font-bold text-gray-900 mb-1 flex items-center gap-2">
            <svg className="w-5 h-5 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Shiftbase Uren
          </h2>
          <p className="text-sm text-gray-500 mb-6">Medewerker- en teamstatistieken uit Shiftbase (laatste {stats.periodLabel})</p>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Medewerker Leaderboard */}
            {shiftbase.employeeStats && shiftbase.employeeStats.length > 0 && (
              <div className="bg-white rounded-lg shadow">
                <div className="p-6 border-b border-gray-200">
                  <h3 className="text-lg font-semibold text-gray-900">Inpak Team — Medewerkers</h3>
                  <p className="text-sm text-gray-500 mt-1">Gewerkte uren &amp; kosten per medewerker ({stats.periodLabel})</p>
                </div>
                <div className="p-6">
                  <div className="space-y-3">
                    {shiftbase.employeeStats.map((emp, i) => {
                      const maxHours = shiftbase.employeeStats![0].totalHours
                      const barWidth = maxHours > 0 ? (emp.totalHours / maxHours) * 100 : 0
                      return (
                        <div key={emp.name}>
                          <div className="flex justify-between text-sm mb-1">
                            <span className="text-gray-700 font-medium flex items-center gap-2">
                              {i === 0 && <span className="text-yellow-500">🥇</span>}
                              {i === 1 && <span className="text-gray-400">🥈</span>}
                              {i === 2 && <span className="text-amber-600">🥉</span>}
                              {emp.name}
                            </span>
                            <span className="text-gray-500 text-xs">
                              <span className="font-bold text-orange-600">{emp.totalHours}u</span>
                              <span className="text-gray-400 ml-1">· {emp.days}d · gem. {emp.avgHoursPerDay}u/d</span>
                              <span className="text-red-500 font-semibold ml-1">· €{emp.cost}</span>
                            </span>
                          </div>
                          <div className="w-full bg-gray-100 rounded-full h-2.5">
                            <div
                              className="h-2.5 rounded-full bg-orange-400 transition-all"
                              style={{ width: `${barWidth}%` }}
                            />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* Team Vergelijking */}
            {shiftbase.teamStats && shiftbase.teamStats.length > 0 && (
              <div className="bg-white rounded-lg shadow">
                <div className="p-6 border-b border-gray-200">
                  <h3 className="text-lg font-semibold text-gray-900">Alle Teams — Uren Vergelijking</h3>
                  <p className="text-sm text-gray-500 mt-1">Totaal gewerkte uren per team ({stats.periodLabel})</p>
                </div>
                <div className="p-6">
                  <div className="space-y-3">
                    {shiftbase.teamStats.map((team) => {
                      const barWidth = maxTeamHours > 0 ? (team.totalHours / maxTeamHours) * 100 : 0
                      const isInpak = team.name.includes("Inpak")
                      return (
                        <div key={team.name}>
                          <div className="flex justify-between text-sm mb-1">
                            <span className={`font-medium ${isInpak ? "text-orange-700" : "text-gray-700"}`}>
                              {team.name}
                              {isInpak && <span className="text-[10px] ml-1 text-orange-400">★</span>}
                            </span>
                            <span className="text-gray-500">
                              <span className={`font-bold ${isInpak ? "text-orange-600" : "text-gray-700"}`}>{team.totalHours}u</span>
                              <span className="text-gray-400 ml-1">· {team.days} dagen</span>
                            </span>
                          </div>
                          <div className="w-full bg-gray-100 rounded-full h-2.5">
                            <div
                              className={`h-2.5 rounded-full transition-all ${isInpak ? "bg-orange-400" : "bg-blue-400"}`}
                              style={{ width: `${barWidth}%` }}
                            />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Wekelijkse Efficiency Trend */}
          {shiftbase.weeklyEfficiency && shiftbase.weeklyEfficiency.length > 0 && (
            <div className="mt-6 bg-white rounded-lg shadow">
              <div className="p-6 border-b border-gray-200">
                <h3 className="text-lg font-semibold text-gray-900">Productiviteit per week</h3>
                <p className="text-sm text-gray-500 mt-1">Zendingen per gewerkt uur (Inpak Team) — weekoverzicht</p>
              </div>
              <div className="p-6">
                <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${Math.min(shiftbase.weeklyEfficiency.length, 4)}, 1fr)` }}>
                  {shiftbase.weeklyEfficiency.map((week) => {
                    const barHeight = maxWeeklyPerHour > 0 ? (week.perHour / maxWeeklyPerHour) * 100 : 0
                    return (
                      <div key={week.week} className="text-center">
                        <p className="text-xs text-gray-500 font-medium mb-2">{formatWeek(week.week)}</p>
                        <div className="h-24 flex items-end justify-center mb-2">
                          <div
                            className="w-12 rounded-t bg-gradient-to-t from-orange-500 to-orange-300 transition-all relative"
                            style={{ height: `${Math.max(barHeight, 8)}%` }}
                          >
                            <span className="absolute -top-5 left-1/2 -translate-x-1/2 text-sm font-bold text-orange-600 whitespace-nowrap">
                              {week.perHour}
                            </span>
                          </div>
                        </div>
                        <p className="text-[10px] text-gray-400">{week.shipments} zend.</p>
                        <p className="text-[10px] text-gray-400">{week.hours}u gewerkt</p>
                        <p className="text-[10px] text-red-400">€{Math.round(week.hours * 17)}</p>
                      </div>
                    )
                  })}
                </div>
                <p className="text-[10px] text-gray-400 text-center mt-3">zendingen per gewerkt uur</p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Afhandeltijd verdeling */}
      <div className="mb-8">
        <div className="bg-white rounded-lg shadow">
          <div className="p-6 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">Verdeling Afhandeltijd</h2>
            <p className="text-sm text-gray-500 mt-1">
              Doorlooptijd van aanmaken tot afronden — laatste {stats.periodLabel} ({processing.totalOrders} orders geanalyseerd)
            </p>
          </div>
          <div className="p-6 space-y-4">
            {bucketConfig.map(bucket => {
              const value = processing.buckets[bucket.key]
              const pct = processing.totalOrders > 0
                ? Math.round((value / processing.totalOrders) * 100)
                : 0
              const barWidth = (value / maxBucket) * 100
              return (
                <div key={bucket.key}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-gray-700 font-medium">{bucket.label}</span>
                    <span className="text-gray-500">
                      {value} orders ({pct}%)
                    </span>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-3">
                    <div
                      className={`h-3 rounded-full transition-all ${bucket.color}`}
                      style={{ width: `${barWidth}%` }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Info banner */}
      <div className="space-y-3">
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-700">
          <strong>GoedGepickt:</strong> De API toont geen informatie over welke gebruiker een order
          heeft afgerond. Dit is alleen zichtbaar in de bestellingsgeschiedenis in GoedGepickt zelf.
        </div>
        {shiftbase.available && (
          <div className="bg-orange-50 border border-orange-200 rounded-lg p-4 text-sm text-orange-700">
            <strong>Shiftbase:</strong> Gewerkte uren worden opgehaald van het <strong>Inpak Team</strong> uit 
            Shiftbase. De &quot;zendingen per uur&quot; is berekend als: totaal zendingen (GG) ÷ totaal gewerkte uren Inpak Team (Shiftbase).
            Teamvergelijking toont alle teams uit de Production afdeling.
          </div>
        )}
      </div>
    </div>
  )
}
