"use client"

import { useEffect, useState, useCallback } from "react"
import { useSession } from "next-auth/react"

interface Author {
  id: string
  name: string
  email: string
}

interface LogEntry {
  id: string
  content: string
  mood: "good" | "neutral" | "bad"
  authorId: string
  author: Author
  createdAt: string
  updatedAt: string
}

const moodConfig = {
  good: { emoji: "🟢", label: "Goed", bg: "bg-green-50", border: "border-green-200", text: "text-green-700", ring: "ring-green-500" },
  neutral: { emoji: "🔵", label: "Neutraal", bg: "bg-blue-50", border: "border-blue-200", text: "text-blue-700", ring: "ring-blue-500" },
  bad: { emoji: "🔴", label: "Slecht", bg: "bg-red-50", border: "border-red-200", text: "text-red-700", ring: "ring-red-500" },
}

export default function LogboekPage() {
  const { data: session } = useSession()
  const [entries, setEntries] = useState<LogEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)

  // New entry form
  const [content, setContent] = useState("")
  const [mood, setMood] = useState<"good" | "neutral" | "bad">("neutral")
  const [submitting, setSubmitting] = useState(false)

  // Edit state
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editContent, setEditContent] = useState("")
  const [editMood, setEditMood] = useState<"good" | "neutral" | "bad">("neutral")

  // Delete confirmation
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const fetchEntries = useCallback(async () => {
    try {
      const res = await fetch(`/api/logbook?page=${page}&limit=50`)
      if (res.ok) {
        const data = await res.json()
        setEntries(data.entries)
        setTotal(data.total)
      }
    } catch (err) {
      console.error("Error fetching logbook:", err)
    } finally {
      setLoading(false)
    }
  }, [page])

  useEffect(() => {
    fetchEntries()
  }, [fetchEntries])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!content.trim() || submitting) return

    setSubmitting(true)
    try {
      const res = await fetch("/api/logbook", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content, mood }),
      })
      if (res.ok) {
        setContent("")
        setMood("neutral")
        setPage(1)
        fetchEntries()
      }
    } catch (err) {
      console.error("Error creating entry:", err)
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/logbook/${id}`, { method: "DELETE" })
      if (res.ok) {
        setDeletingId(null)
        fetchEntries()
      }
    } catch (err) {
      console.error("Error deleting entry:", err)
    }
  }

  const handleEdit = async (id: string) => {
    try {
      const res = await fetch(`/api/logbook/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: editContent, mood: editMood }),
      })
      if (res.ok) {
        setEditingId(null)
        fetchEntries()
      }
    } catch (err) {
      console.error("Error updating entry:", err)
    }
  }

  const startEdit = (entry: LogEntry) => {
    setEditingId(entry.id)
    setEditContent(entry.content)
    setEditMood(entry.mood)
  }

  // Groepeer entries per dag
  const groupedEntries = entries.reduce<Record<string, LogEntry[]>>((acc, entry) => {
    const date = new Date(entry.createdAt).toLocaleDateString("nl-NL", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    })
    if (!acc[date]) acc[date] = []
    acc[date].push(entry)
    return acc
  }, {})

  const totalPages = Math.ceil(total / 50)

  if (loading) {
    return (
      <div className="p-8">
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto" />
            <p className="mt-4 text-gray-600">Logboek laden...</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Logboek</h1>
        <p className="text-gray-500 mt-1">
          Houd bij wat er elke dag gebeurt — wat ging goed, wat kan beter.
        </p>
      </div>

      {/* Nieuwe entry formulier */}
      <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-8">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center text-white font-semibold text-sm">
            {session?.user?.name?.charAt(0) || "?"}
          </div>
          <span className="text-sm font-medium text-gray-700">{session?.user?.name}</span>
          <span className="text-xs text-gray-400">— nieuwe notitie</span>
        </div>

        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Wat is er vandaag gebeurd? Wat ging goed? Wat kan beter?"
          rows={4}
          className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none text-sm"
        />

        <div className="flex items-center justify-between mt-4">
          {/* Mood selector */}
          <div className="flex items-center gap-1">
            <span className="text-xs text-gray-500 mr-2">Stemming:</span>
            {(Object.keys(moodConfig) as Array<keyof typeof moodConfig>).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMood(m)}
                className={`px-3 py-1.5 text-xs rounded-full border transition-all ${
                  mood === m
                    ? `${moodConfig[m].bg} ${moodConfig[m].border} ${moodConfig[m].text} font-semibold ring-2 ${moodConfig[m].ring} ring-offset-1`
                    : "border-gray-200 text-gray-500 hover:bg-gray-50"
                }`}
              >
                {moodConfig[m].emoji} {moodConfig[m].label}
              </button>
            ))}
          </div>

          <button
            type="submit"
            disabled={!content.trim() || submitting}
            className="px-5 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {submitting ? "Opslaan..." : "Opslaan"}
          </button>
        </div>
      </form>

      {/* Entries per dag */}
      {Object.keys(groupedEntries).length === 0 ? (
        <div className="text-center py-16">
          <svg className="w-16 h-16 text-gray-300 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
          </svg>
          <p className="text-gray-500 text-lg">Nog geen logboek entries</p>
          <p className="text-gray-400 text-sm mt-1">Schrijf je eerste notitie hierboven!</p>
        </div>
      ) : (
        <div className="space-y-8">
          {Object.entries(groupedEntries).map(([date, dayEntries]) => (
            <div key={date}>
              {/* Dag header */}
              <div className="flex items-center gap-3 mb-4">
                <div className="h-px bg-gray-200 flex-1" />
                <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">
                  {date}
                </h2>
                <div className="h-px bg-gray-200 flex-1" />
              </div>

              {/* Entries van die dag */}
              <div className="space-y-3">
                {dayEntries.map((entry) => {
                  const mc = moodConfig[entry.mood]
                  const isEditing = editingId === entry.id
                  const isDeleting = deletingId === entry.id
                  const time = new Date(entry.createdAt).toLocaleTimeString("nl-NL", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })

                  return (
                    <div
                      key={entry.id}
                      className={`bg-white rounded-lg border ${mc.border} ${mc.bg} p-5 transition-all hover:shadow-sm`}
                    >
                      {isEditing ? (
                        /* Edit mode */
                        <div>
                          <textarea
                            value={editContent}
                            onChange={(e) => setEditContent(e.target.value)}
                            rows={4}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none text-sm"
                          />
                          <div className="flex items-center justify-between mt-3">
                            <div className="flex items-center gap-1">
                              {(Object.keys(moodConfig) as Array<keyof typeof moodConfig>).map((m) => (
                                <button
                                  key={m}
                                  type="button"
                                  onClick={() => setEditMood(m)}
                                  className={`px-2.5 py-1 text-xs rounded-full border transition-all ${
                                    editMood === m
                                      ? `${moodConfig[m].bg} ${moodConfig[m].border} ${moodConfig[m].text} font-semibold`
                                      : "border-gray-200 text-gray-500 hover:bg-gray-50"
                                  }`}
                                >
                                  {moodConfig[m].emoji}
                                </button>
                              ))}
                            </div>
                            <div className="flex gap-2">
                              <button
                                onClick={() => setEditingId(null)}
                                className="px-3 py-1.5 text-xs text-gray-600 bg-gray-100 rounded-md hover:bg-gray-200"
                              >
                                Annuleren
                              </button>
                              <button
                                onClick={() => handleEdit(entry.id)}
                                className="px-3 py-1.5 text-xs text-white bg-blue-600 rounded-md hover:bg-blue-700"
                              >
                                Opslaan
                              </button>
                            </div>
                          </div>
                        </div>
                      ) : (
                        /* View mode */
                        <div>
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-2">
                                <span className="text-base">{mc.emoji}</span>
                                <span className="text-sm font-medium text-gray-700">{entry.author.name}</span>
                                <span className="text-xs text-gray-400">{time}</span>
                                {entry.updatedAt !== entry.createdAt && (
                                  <span className="text-xs text-gray-400 italic">(bewerkt)</span>
                                )}
                              </div>
                              <p className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">
                                {entry.content}
                              </p>
                            </div>

                            {/* Actions */}
                            <div className="flex items-center gap-1 shrink-0">
                              <button
                                onClick={() => startEdit(entry)}
                                className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                                title="Bewerken"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                </svg>
                              </button>
                              {isDeleting ? (
                                <div className="flex items-center gap-1">
                                  <button
                                    onClick={() => handleDelete(entry.id)}
                                    className="px-2 py-1 text-xs text-white bg-red-600 rounded hover:bg-red-700"
                                  >
                                    Ja
                                  </button>
                                  <button
                                    onClick={() => setDeletingId(null)}
                                    className="px-2 py-1 text-xs text-gray-600 bg-gray-100 rounded hover:bg-gray-200"
                                  >
                                    Nee
                                  </button>
                                </div>
                              ) : (
                                <button
                                  onClick={() => setDeletingId(entry.id)}
                                  className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                                  title="Verwijderen"
                                >
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                  </svg>
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Paginering */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-8">
          <button
            onClick={() => setPage(Math.max(1, page - 1))}
            disabled={page === 1}
            className="px-3 py-1.5 text-sm border border-gray-200 rounded-md disabled:opacity-50 hover:bg-gray-50"
          >
            Vorige
          </button>
          <span className="text-sm text-gray-500">
            Pagina {page} van {totalPages}
          </span>
          <button
            onClick={() => setPage(Math.min(totalPages, page + 1))}
            disabled={page === totalPages}
            className="px-3 py-1.5 text-sm border border-gray-200 rounded-md disabled:opacity-50 hover:bg-gray-50"
          >
            Volgende
          </button>
        </div>
      )}

      {/* Totaal */}
      {total > 0 && (
        <p className="text-center text-xs text-gray-400 mt-4">
          {total} {total === 1 ? "notitie" : "notities"} totaal
        </p>
      )}
    </div>
  )
}
