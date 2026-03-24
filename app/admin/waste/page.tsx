"use client"

import { useEffect, useState, useMemo } from "react"

interface WasteReport {
  id: string
  size: string
  quantity: number
  reason: string | null
  createdAt: string
  user: { id: string; name: string }
}

interface WasteSummary {
  totalQuantity: number
  totalReports: number
  bySize: Record<string, number>
  byDate: Record<string, Record<string, number>>
  byUser: Record<string, { name: string; total: number }>
}

const SIZE_LABELS: Record<string, string> = {
  "40x60": "40×60 cm",
  "60x90": "60×90 cm",
  "80x120": "80×120 cm",
  "100x150": "100×150 cm",
  "salontafel": "Salontafel",
}

const SIZE_COLORS: Record<string, string> = {
  "40x60": "#3B82F6",
  "60x90": "#10B981",
  "80x120": "#F59E0B",
  "100x150": "#EF4444",
  "salontafel": "#8B5CF6",
}

function formatDate(dateStr: string): string {
  return new Date(dateStr + "T12:00:00").toLocaleDateString("nl-NL", {
    weekday: "short",
    day: "numeric",
    month: "short",
  })
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("nl-NL", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  })
}

export default function WastePage() {
  const [loading, setLoading] = useState(true)
  const [reports, setReports] = useState<WasteReport[]>([])
  const [summary, setSummary] = useState<WasteSummary | null>(null)
  const [activeTab, setActiveTab] = useState<"overview" | "history">("overview")

  // Date range - default: afgelopen 30 dagen
  const [startDate, setStartDate] = useState(() => {
    const d = new Date()
    d.setDate(d.getDate() - 30)
    return d.toISOString().split("T")[0]
  })
  const [endDate, setEndDate] = useState(() => new Date().toISOString().split("T")[0])

  const fetchData = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (startDate) params.set("from", startDate)
      if (endDate) params.set("to", endDate)
      const res = await fetch(`/api/waste?${params}`)
      if (!res.ok) throw new Error("Fetch failed")
      const data = await res.json()
      setReports(data.reports)
      setSummary(data.summary)
    } catch (err) {
      console.error("Error fetching waste data:", err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [startDate, endDate])

  // Alle datums in de periode gesorteerd
  const sortedDates = useMemo(() => {
    if (!summary?.byDate) return []
    return Object.keys(summary.byDate).sort()
  }, [summary])

  // Max dagwaarde voor grafiek schaal
  const maxDayTotal = useMemo(() => {
    if (!summary?.byDate) return 1
    let max = 0
    for (const day of Object.values(summary.byDate)) {
      const total = Object.values(day).reduce((a, b) => a + b, 0)
      if (total > max) max = total
    }
    return max || 1
  }, [summary])

  // Bereken totale hoeveelheid per maat voor de donut data
  const sizeEntries = useMemo(() => {
    if (!summary?.bySize) return []
    return Object.entries(summary.bySize).sort(([, a], [, b]) => b - a)
  }, [summary])

  if (loading && !summary) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-600" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">🗑️ Waste / Afval</h1>
          <p className="text-gray-600 mt-1">Overzicht van verspild materiaal per maat en periode</p>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="border border-gray-300 rounded-md px-3 py-2 text-sm"
          />
          <span className="text-gray-500">→</span>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="border border-gray-300 rounded-md px-3 py-2 text-sm"
          />
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <p className="text-sm font-medium text-gray-500">Totaal Afval</p>
          <p className="text-3xl font-bold text-red-600 mt-1">{summary?.totalQuantity || 0}</p>
          <p className="text-xs text-gray-400 mt-1">stuks in deze periode</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <p className="text-sm font-medium text-gray-500">Meldingen</p>
          <p className="text-3xl font-bold text-gray-900 mt-1">{summary?.totalReports || 0}</p>
          <p className="text-xs text-gray-400 mt-1">afvalmeldingen</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <p className="text-sm font-medium text-gray-500">Meeste Afval</p>
          <p className="text-3xl font-bold text-amber-600 mt-1">
            {sizeEntries.length > 0 ? SIZE_LABELS[sizeEntries[0][0]] || sizeEntries[0][0] : "—"}
          </p>
          <p className="text-xs text-gray-400 mt-1">
            {sizeEntries.length > 0 ? `${sizeEntries[0][1]} stuks` : "nog geen data"}
          </p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <p className="text-sm font-medium text-gray-500">Gem. per dag</p>
          <p className="text-3xl font-bold text-blue-600 mt-1">
            {sortedDates.length > 0
              ? (Math.round(((summary?.totalQuantity || 0) / sortedDates.length) * 10) / 10).toFixed(1)
              : "0"}
          </p>
          <p className="text-xs text-gray-400 mt-1">stuks per dag</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200">
        <div className="border-b border-gray-200">
          <nav className="flex gap-0">
            {[
              { key: "overview" as const, label: "Overzicht" },
              { key: "history" as const, label: "Meldingen" },
            ].map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === tab.key
                    ? "border-red-600 text-red-600"
                    : "border-transparent text-gray-500 hover:text-gray-700"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        <div className="p-6">
          {activeTab === "overview" ? (
            <div className="space-y-8">
              {/* Verdeling per maat */}
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Verdeling per maat</h3>
                {sizeEntries.length === 0 ? (
                  <p className="text-gray-500 text-sm">Geen afvaldata in deze periode.</p>
                ) : (
                  <div className="space-y-3">
                    {sizeEntries.map(([size, qty]) => {
                      const pct = summary?.totalQuantity ? (qty / summary.totalQuantity) * 100 : 0
                      return (
                        <div key={size} className="flex items-center gap-4">
                          <div className="w-28 text-sm font-medium text-gray-700 shrink-0">
                            {SIZE_LABELS[size] || size}
                          </div>
                          <div className="flex-1 bg-gray-100 rounded-full h-7 relative overflow-hidden">
                            <div
                              className="h-full rounded-full transition-all duration-500"
                              style={{
                                width: `${pct}%`,
                                backgroundColor: SIZE_COLORS[size] || "#6B7280",
                                minWidth: pct > 0 ? "2rem" : 0,
                              }}
                            />
                            <span className="absolute inset-0 flex items-center justify-center text-xs font-semibold text-gray-700">
                              {qty} ({Math.round(pct)}%)
                            </span>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

              {/* Dagelijkse grafiek */}
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Afval per dag</h3>
                {sortedDates.length === 0 ? (
                  <p className="text-gray-500 text-sm">Geen dagdata beschikbaar.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <div className="flex items-end gap-1" style={{ minWidth: sortedDates.length * 40, height: 200 }}>
                      {sortedDates.map((date) => {
                        const dayData = summary!.byDate[date]
                        const dayTotal = Object.values(dayData).reduce((a, b) => a + b, 0)
                        const barHeight = (dayTotal / maxDayTotal) * 170

                        // Stacked bar: elk formaat een segment
                        const segments: { size: string; qty: number }[] = []
                        for (const [size, qty] of Object.entries(dayData)) {
                          segments.push({ size, qty })
                        }

                        return (
                          <div key={date} className="flex flex-col items-center" style={{ minWidth: 36 }}>
                            <span className="text-[10px] text-gray-500 mb-1">{dayTotal}</span>
                            <div
                              className="w-7 rounded-t-sm flex flex-col-reverse overflow-hidden"
                              style={{ height: barHeight }}
                              title={`${formatDate(date)}: ${dayTotal} stuks`}
                            >
                              {segments.map((seg) => (
                                <div
                                  key={seg.size}
                                  style={{
                                    height: `${(seg.qty / dayTotal) * 100}%`,
                                    backgroundColor: SIZE_COLORS[seg.size] || "#6B7280",
                                  }}
                                  title={`${SIZE_LABELS[seg.size] || seg.size}: ${seg.qty}`}
                                />
                              ))}
                            </div>
                            <span className="text-[10px] text-gray-400 mt-1 -rotate-45 origin-top-left whitespace-nowrap">
                              {formatDate(date)}
                            </span>
                          </div>
                        )
                      })}
                    </div>
                    {/* Legend */}
                    <div className="flex flex-wrap gap-4 mt-6">
                      {Object.entries(SIZE_COLORS).map(([size, color]) => (
                        <div key={size} className="flex items-center gap-1.5">
                          <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: color }} />
                          <span className="text-xs text-gray-600">{SIZE_LABELS[size] || size}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Per medewerker */}
              {summary?.byUser && Object.keys(summary.byUser).length > 0 && (
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Per medewerker</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {Object.entries(summary.byUser)
                      .sort(([, a], [, b]) => b.total - a.total)
                      .map(([userId, data]) => (
                        <div key={userId} className="flex items-center justify-between bg-gray-50 rounded-lg px-4 py-3">
                          <span className="font-medium text-gray-800">{data.name}</span>
                          <span className="text-sm font-semibold text-red-600">{data.total} stuks</span>
                        </div>
                      ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* Meldingen tab — alle individuele reports */
            <div>
              {reports.length === 0 ? (
                <p className="text-gray-500 text-sm">Geen meldingen in deze periode.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-200 text-left text-gray-600">
                        <th className="pb-3 font-medium">Datum</th>
                        <th className="pb-3 font-medium">Maat</th>
                        <th className="pb-3 font-medium text-right">Aantal</th>
                        <th className="pb-3 font-medium">Medewerker</th>
                      </tr>
                    </thead>
                    <tbody>
                      {reports.map((r) => (
                        <tr key={r.id} className="border-b border-gray-100 hover:bg-gray-50">
                          <td className="py-2.5 text-gray-600">{formatDateTime(r.createdAt)}</td>
                          <td className="py-2.5">
                            <span
                              className="inline-block px-2 py-0.5 rounded-full text-xs font-medium text-white"
                              style={{ backgroundColor: SIZE_COLORS[r.size] || "#6B7280" }}
                            >
                              {SIZE_LABELS[r.size] || r.size}
                            </span>
                          </td>
                          <td className="py-2.5 text-right font-semibold text-gray-900">{r.quantity}</td>
                          <td className="py-2.5 text-gray-700">{r.user.name}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
