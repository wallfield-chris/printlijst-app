"use client"

import Link from "next/link"
import { useEffect, useState } from "react"

interface ChecklistEntry {
  id: string
  date: string
  printerCleaned: boolean
  workplaceClean: boolean
  returnsProcessed: boolean
  wasteDisposed: boolean
  notes: string | null
  createdAt: string
  updatedAt: string
}

const CHECKLIST_ITEMS: { field: keyof ChecklistEntry; label: string; icon: string }[] = [
  { field: "printerCleaned", label: "Printer schoongemaakt", icon: "🖨️" },
  { field: "workplaceClean", label: "Werkplek opgeruimd", icon: "🧹" },
  { field: "returnsProcessed", label: "Retouren verwerkt", icon: "📦" },
  { field: "wasteDisposed", label: "Afval weggegooid", icon: "🗑️" },
]

function formatDate(dateStr: string): string {
  const [year, month, day] = dateStr.split("-")
  const date = new Date(Number(year), Number(month) - 1, Number(day))
  const dayNames = ["Zo", "Ma", "Di", "Wo", "Do", "Vr", "Za"]
  const monthNames = ["jan", "feb", "mrt", "apr", "mei", "jun", "jul", "aug", "sep", "okt", "nov", "dec"]
  return `${dayNames[date.getDay()]} ${Number(day)} ${monthNames[date.getMonth()]} ${year}`
}

function formatDateShort(dateStr: string): string {
  const [, month, day] = dateStr.split("-")
  const date = new Date(Number(dateStr.split("-")[0]), Number(month) - 1, Number(day))
  const dayNames = ["Zo", "Ma", "Di", "Wo", "Do", "Vr", "Za"]
  return `${dayNames[date.getDay()]} ${Number(day)}/${month}`
}

function getTodayStr(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`
}

function isAllChecked(entry: ChecklistEntry): boolean {
  return CHECKLIST_ITEMS.every((item) => entry[item.field] === true)
}

function checkedCount(entry: ChecklistEntry): number {
  return CHECKLIST_ITEMS.filter((item) => entry[item.field] === true).length
}

export default function AftekenlijstPage() {
  const [entries, setEntries] = useState<ChecklistEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedDate, setExpandedDate] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [notes, setNotes] = useState<Record<string, string>>({})

  // Laad checklist data direct (geen login vereist)
  useEffect(() => {
    fetchEntries()
  }, [])

  // Auto-expand vandaag
  useEffect(() => {
    if (entries.length > 0 && expandedDate === null) {
      setExpandedDate(getTodayStr())
    }
  }, [entries])

  async function fetchEntries() {
    try {
      const res = await fetch("/api/checklist")
      if (res.ok) {
        const data = await res.json()
        setEntries(data)
        const notesMap: Record<string, string> = {}
        data.forEach((e: ChecklistEntry) => {
          if (e.notes) notesMap[e.date] = e.notes
        })
        setNotes(notesMap)
      }
    } catch (err) {
      console.error("Error loading checklist:", err)
    } finally {
      setLoading(false)
    }
  }

  async function toggleItem(date: string, field: string, currentValue: boolean) {
    setSaving(true)
    try {
      const res = await fetch("/api/checklist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date, field, value: !currentValue }),
      })
      if (res.ok) {
        const updated = await res.json()
        setEntries((prev) => {
          const existing = prev.find((e) => e.date === date)
          if (existing) {
            return prev.map((e) => (e.date === date ? updated : e))
          }
          return [updated, ...prev].sort((a, b) => b.date.localeCompare(a.date))
        })
      }
    } catch (err) {
      console.error("Error toggling item:", err)
    } finally {
      setSaving(false)
    }
  }

  async function saveNotes(date: string) {
    try {
      await fetch("/api/checklist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date, field: "notes", value: notes[date] || "" }),
      })
    } catch (err) {
      console.error("Error saving notes:", err)
    }
  }

  function getLast30Days(): string[] {
    const days: string[] = []
    const now = new Date()
    for (let i = 0; i < 30; i++) {
      const d = new Date(now)
      d.setDate(d.getDate() - i)
      days.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`)
    }
    return days
  }

  function getEntryForDate(date: string): ChecklistEntry | null {
    return entries.find((e) => e.date === date) || null
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="text-center">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-3 text-gray-600 text-sm">Laden...</p>
        </div>
      </div>
    )
  }

  const today = getTodayStr()
  const days = getLast30Days()

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header — compact op mobiel */}
      <header className="bg-white shadow">
        <div className="max-w-4xl mx-auto px-3 sm:px-6 py-3 sm:py-4 flex justify-between items-center">
          <h1 className="text-lg sm:text-2xl font-bold text-gray-900">📋 Aftekenlijst</h1>
          <Link
            href="/login"
            className="px-3 py-1.5 text-sm font-medium text-blue-600 hover:text-blue-800"
          >
            Inloggen
          </Link>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-2 sm:px-6 lg:px-8 py-4 sm:py-8">
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          <div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-gray-200">
            <p className="text-sm text-gray-500">
              Vink per dag alle taken af. Groen = alles klaar.
            </p>
          </div>

          <div className="divide-y divide-gray-100">
            {days.map((date) => {
              const entry = getEntryForDate(date)
              const isExpanded = expandedDate === date
              const isToday = date === today
              const allDone = entry ? isAllChecked(entry) : false
              const done = entry ? checkedCount(entry) : 0
              const total = CHECKLIST_ITEMS.length

              return (
                <div key={date}>
                  {/* Rij — grotere touch target op mobiel */}
                  <button
                    onClick={() => setExpandedDate(isExpanded ? null : date)}
                    className={`w-full px-3 sm:px-6 py-3 sm:py-3.5 flex items-center justify-between text-left transition-colors active:bg-gray-100 ${
                      allDone
                        ? "bg-green-50 hover:bg-green-100"
                        : isToday
                          ? "bg-blue-50 hover:bg-blue-100"
                          : "hover:bg-gray-50"
                    }`}
                  >
                    <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                      {/* Status indicator */}
                      <div
                        className={`w-3 h-3 rounded-full flex-shrink-0 ${
                          allDone ? "bg-green-500" : done > 0 ? "bg-yellow-400" : "bg-gray-300"
                        }`}
                      />
                      <div className="min-w-0">
                        <span className={`text-sm sm:text-base font-medium ${isToday ? "text-blue-700" : "text-gray-900"}`}>
                          {/* Korte datum op mobiel, volle datum op desktop */}
                          <span className="sm:hidden">{formatDateShort(date)}</span>
                          <span className="hidden sm:inline">{formatDate(date)}</span>
                        </span>
                        {isToday && (
                          <span className="ml-1.5 sm:ml-2 text-[10px] sm:text-xs bg-blue-200 text-blue-800 px-1.5 sm:px-2 py-0.5 rounded-full font-medium">
                            Vandaag
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
                      {/* Voortgang */}
                      <div className="flex items-center gap-1.5 sm:gap-2">
                        <div className="w-16 sm:w-24 h-2 bg-gray-200 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${
                              allDone ? "bg-green-500" : done > 0 ? "bg-yellow-400" : "bg-gray-200"
                            }`}
                            style={{ width: `${(done / total) * 100}%` }}
                          />
                        </div>
                        <span className={`text-xs sm:text-sm font-medium tabular-nums ${allDone ? "text-green-700" : "text-gray-500"}`}>
                          {done}/{total}
                        </span>
                      </div>

                      {/* Chevron */}
                      <svg
                        className={`w-4 h-4 sm:w-5 sm:h-5 text-gray-400 transition-transform ${isExpanded ? "rotate-180" : ""}`}
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                  </button>

                  {/* Uitklap met checklist items */}
                  {isExpanded && (
                    <div className="px-3 sm:px-6 py-3 sm:py-4 bg-gray-50 border-t border-gray-100">
                      <div className="grid gap-2">
                        {CHECKLIST_ITEMS.map((item) => {
                          const checked = entry ? (entry[item.field] as boolean) : false

                          return (
                            <button
                              key={item.field}
                              onClick={() => toggleItem(date, item.field, checked)}
                              disabled={saving}
                              className={`flex items-center gap-3 px-3 sm:px-4 py-3.5 sm:py-3 rounded-lg transition-all text-left active:scale-[0.98] ${
                                checked
                                  ? "bg-green-100 hover:bg-green-200"
                                  : "bg-white hover:bg-gray-100 border border-gray-200"
                              } ${saving ? "opacity-60" : ""}`}
                            >
                              {/* Checkbox — groter op mobiel */}
                              <div
                                className={`w-7 h-7 sm:w-6 sm:h-6 rounded-md flex items-center justify-center flex-shrink-0 transition-colors ${
                                  checked
                                    ? "bg-green-500 text-white"
                                    : "border-2 border-gray-300"
                                }`}
                              >
                                {checked && (
                                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                  </svg>
                                )}
                              </div>

                              <span className="text-lg">{item.icon}</span>
                              <span className={`text-sm font-medium ${checked ? "text-green-800" : "text-gray-700"}`}>
                                {item.label}
                              </span>
                            </button>
                          )
                        })}
                      </div>

                      {/* Notities */}
                      <div className="mt-3 sm:mt-4">
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          📝 Opmerkingen
                        </label>
                        <textarea
                          value={notes[date] || ""}
                          onChange={(e) => setNotes((prev) => ({ ...prev, [date]: e.target.value }))}
                          onBlur={() => saveNotes(date)}
                          placeholder="Optionele opmerkingen..."
                          rows={2}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
                        />
                      </div>

                      {/* Status samenvatting */}
                      {allDone && (
                        <div className="mt-3 flex items-center gap-2 text-green-700 bg-green-100 px-3 py-2.5 rounded-lg">
                          <svg className="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          <span className="text-sm font-medium">Alle taken afgevinkt! 🎉</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </main>
    </div>
  )
}
