"use client"

import { useEffect, useState } from "react"

interface User {
  id: string
  name: string
  email: string
  role: string
  createdAt: string
}

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

const CHECKLIST_ITEMS = [
  { key: "printerCleaned" as const, label: "Printer schoongemaakt", icon: "🖨️" },
  { key: "workplaceClean" as const, label: "Werkplek opgeruimd", icon: "🧹" },
  { key: "returnsProcessed" as const, label: "Retouren verwerkt", icon: "📦" },
  { key: "wasteDisposed" as const, label: "Afval weggegooid", icon: "🗑️" },
]

export default function WerknemersPage() {
  const [activeTab, setActiveTab] = useState<"werknemers" | "aftekenlijst">("werknemers")

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Werknemers</h1>
        <p className="text-gray-600 mt-2">Beheer werknemers en hun dagelijkse aftekenlijst</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-gray-200">
        <button
          onClick={() => setActiveTab("werknemers")}
          className={`px-5 py-3 text-sm font-medium border-b-2 transition-colors ${
            activeTab === "werknemers"
              ? "border-blue-600 text-blue-600"
              : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          👥 Werknemers
        </button>
        <button
          onClick={() => setActiveTab("aftekenlijst")}
          className={`px-5 py-3 text-sm font-medium border-b-2 transition-colors ${
            activeTab === "aftekenlijst"
              ? "border-blue-600 text-blue-600"
              : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          ✅ Aftekenlijst
        </button>
      </div>

      {activeTab === "werknemers" ? <WerknemersTab /> : <AftekenlijstTab />}
    </div>
  )
}

// ============================================================
// TAB 1: Werknemers beheer (bestaande functionaliteit)
// ============================================================
function WerknemersTab() {
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [showAddForm, setShowAddForm] = useState(false)

  // Form state
  const [formName, setFormName] = useState("")
  const [formEmail, setFormEmail] = useState("")
  const [formPassword, setFormPassword] = useState("")
  const [formRole, setFormRole] = useState("employee")

  useEffect(() => {
    fetchUsers()
  }, [])

  const fetchUsers = async () => {
    try {
      setLoading(true)
      const response = await fetch("/api/users")
      if (response.ok) {
        const data = await response.json()
        setUsers(data)
      }
      setError("")
    } catch (err) {
      setError("Kan werknemers niet laden")
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      const response = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formName,
          email: formEmail,
          password: formPassword,
          role: formRole,
        }),
      })
      if (response.ok) {
        await fetchUsers()
        resetForm()
        setShowAddForm(false)
      } else {
        const error = await response.json()
        setError(error.error || "Fout bij toevoegen werknemer")
      }
    } catch (err) {
      setError("Kan werknemer niet toevoegen")
      console.error(err)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm("Weet je zeker dat je deze werknemer wilt verwijderen?")) return
    try {
      const response = await fetch(`/api/users/${id}`, { method: "DELETE" })
      if (response.ok) {
        await fetchUsers()
      } else {
        setError("Kan werknemer niet verwijderen")
      }
    } catch (err) {
      setError("Kan werknemer niet verwijderen")
      console.error(err)
    }
  }

  const resetForm = () => {
    setFormName("")
    setFormEmail("")
    setFormPassword("")
    setFormRole("employee")
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  return (
    <>
      {error && (
        <div className="mb-6 p-4 bg-red-100 border border-red-400 text-red-700 rounded-lg">
          {error}
        </div>
      )}

      <div className="bg-white rounded-lg shadow">
        <div className="p-6 border-b border-gray-200 flex justify-between items-center">
          <h2 className="text-lg font-semibold text-gray-900">
            Alle Werknemers ({users.length})
          </h2>
          <button
            onClick={() => setShowAddForm(true)}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            + Nieuwe Werknemer
          </button>
        </div>

        {/* Add Form */}
        {showAddForm && (
          <div className="p-6 border-b border-gray-200 bg-gray-50">
            <h3 className="text-lg font-semibold mb-4">Nieuwe Werknemer Toevoegen</h3>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Naam</label>
                  <input
                    type="text"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                  <input
                    type="email"
                    value={formEmail}
                    onChange={(e) => setFormEmail(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Wachtwoord</label>
                  <input
                    type="password"
                    value={formPassword}
                    onChange={(e) => setFormPassword(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    required
                    minLength={6}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Rol</label>
                  <select
                    value={formRole}
                    onChange={(e) => setFormRole(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="employee">Werknemer</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>
              </div>
              <div className="flex gap-2">
                <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
                  Toevoegen
                </button>
                <button
                  type="button"
                  onClick={() => { resetForm(); setShowAddForm(false) }}
                  className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
                >
                  Annuleren
                </button>
              </div>
            </form>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Naam</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Email</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Rol</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Acties</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {users.map((user) => (
                <tr key={user.id}>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <div className="w-10 h-10 bg-blue-600 rounded-full flex items-center justify-center text-white font-semibold">
                        {user.name.charAt(0)}
                      </div>
                      <div className="ml-4">
                        <div className="text-sm font-medium text-gray-900">{user.name}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">{user.email}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full bg-blue-100 text-blue-800">
                      {user.role === "admin" ? "Admin" : "Werknemer"}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800">
                      Actief
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    <button
                      onClick={() => handleDelete(user.id)}
                      className="text-red-600 hover:text-red-900"
                    >
                      Verwijderen
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {users.length === 0 && (
            <div className="text-center py-12">
              <p className="text-gray-500">Geen werknemers gevonden</p>
            </div>
          )}
        </div>
      </div>
    </>
  )
}

// ============================================================
// TAB 2: Aftekenlijst
// ============================================================
function AftekenlijstTab() {
  const [entries, setEntries] = useState<ChecklistEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedDay, setExpandedDay] = useState<string | null>(null)

  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    try {
      setLoading(true)
      const res = await fetch("/api/checklist")
      if (res.ok) {
        const data = await res.json()
        setEntries(data)
      }
    } catch (err) {
      console.error("Error fetching checklist data:", err)
    } finally {
      setLoading(false)
    }
  }

  const formatDateNL = (dateStr: string) => {
    const d = new Date(dateStr + "T12:00:00")
    return d.toLocaleDateString("nl-NL", {
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric",
    })
  }

  const isComplete = (entry: ChecklistEntry) => {
    return CHECKLIST_ITEMS.every((item) => entry[item.key] === true)
  }

  const completionCount = (entry: ChecklistEntry) => {
    return CHECKLIST_ITEMS.filter((item) => entry[item.key] === true).length
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <p className="text-sm text-blue-800">
          ℹ️ Dit is een <strong>alleen-lezen overzicht</strong> van de dagelijkse aftekenlijst.
          Werknemers vullen de lijst in via <strong>Printlijst → Aftekenlijst</strong>.
        </p>
      </div>

      {/* Overzicht per dag */}
      <div className="bg-white rounded-lg shadow border border-gray-200">
        <div className="p-6 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">📅 Overzicht per dag</h2>
          <p className="text-sm text-gray-500 mt-1">Gedeelde dagelijkse checklist — 1 lijst per dag</p>
        </div>

        {entries.length === 0 ? (
          <div className="p-12 text-center text-gray-500">
            <p className="text-4xl mb-3">📋</p>
            <p className="font-medium">Nog geen aftekenlijsten ingevuld</p>
            <p className="text-sm mt-1">Werknemers kunnen de lijst invullen via de Aftekenlijst pagina</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {entries.map((entry) => {
              const isExpanded = expandedDay === entry.date
              const allDone = isComplete(entry)
              const done = completionCount(entry)
              const total = CHECKLIST_ITEMS.length

              return (
                <div key={entry.date}>
                  <button
                    onClick={() => setExpandedDay(isExpanded ? null : entry.date)}
                    className={`w-full flex items-center justify-between p-4 px-6 transition-colors text-left ${
                      allDone ? "bg-green-50 hover:bg-green-100" : "hover:bg-gray-50"
                    }`}
                  >
                    <div className="flex items-center gap-4">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
                        allDone
                          ? "bg-green-100 text-green-600"
                          : done > 0
                          ? "bg-yellow-100 text-yellow-600"
                          : "bg-gray-100 text-gray-400"
                      }`}>
                        {allDone ? (
                          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                          </svg>
                        ) : (
                          <span className="text-sm font-bold">{done}/{total}</span>
                        )}
                      </div>
                      <div>
                        <p className="font-semibold text-gray-900">{formatDateNL(entry.date)}</p>
                        <p className="text-sm text-gray-500">
                          {allDone ? "Volledig afgetekend" : `${done} van ${total} taken afgetekend`}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="w-24 h-2 bg-gray-200 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${
                            allDone ? "bg-green-500" : done > 0 ? "bg-yellow-400" : "bg-gray-200"
                          }`}
                          style={{ width: `${(done / total) * 100}%` }}
                        />
                      </div>
                      <svg
                        className={`w-5 h-5 text-gray-400 transition-transform ${isExpanded ? "rotate-180" : ""}`}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="px-6 pb-5 bg-gray-50 border-t border-gray-100">
                      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 mt-4">
                        {CHECKLIST_ITEMS.map((item) => {
                          const checked = entry[item.key]
                          return (
                            <div
                              key={item.key}
                              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm ${
                                checked
                                  ? "bg-green-50 text-green-700"
                                  : "bg-red-50 text-red-600"
                              }`}
                            >
                              {checked ? (
                                <svg className="w-4 h-4 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                </svg>
                              ) : (
                                <svg className="w-4 h-4 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                                  <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                                </svg>
                              )}
                              <span className="mr-1">{item.icon}</span>
                              <span className="truncate">{item.label}</span>
                            </div>
                          )
                        })}
                      </div>

                      {entry.notes && (
                        <div className="mt-3 p-3 bg-blue-50 rounded-lg border border-blue-100">
                          <p className="text-xs font-medium text-blue-600 mb-1">📝 Opmerkingen</p>
                          <p className="text-sm text-gray-700 whitespace-pre-wrap">{entry.notes}</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
