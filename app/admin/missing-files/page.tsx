"use client"

import { useEffect, useState } from "react"

interface PrintJob {
  id: string
  orderNumber: string
  productName: string
  quantity: number
  priority: string
  printStatus: string
  receivedAt: string
  sku?: string
  backfile?: string
  customerName?: string
  orderStatus?: string
  imageUrl?: string
  tags?: string
  notes?: string
  completedByUser?: {
    name: string
  }
}

export default function MissingFilesPage() {
  const [printJobs, setPrintJobs] = useState<PrintJob[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [selectedJob, setSelectedJob] = useState<PrintJob | null>(null)
  const [editNotes, setEditNotes] = useState("")
  const [savingNotes, setSavingNotes] = useState(false)

  useEffect(() => {
    fetchMissingFiles()
  }, [])

  const fetchMissingFiles = async () => {
    try {
      setLoading(true)
      const response = await fetch("/api/printjobs?missingFile=true")
      
      if (!response.ok) {
        throw new Error("Fout bij ophalen van missing files")
      }

      const data = await response.json()
      setPrintJobs(data)
    } catch (err) {
      setError("Kan missing files niet laden")
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const openDetail = (job: PrintJob) => {
    setSelectedJob(job)
    setEditNotes(job.notes || "")
  }

  const closeDetail = () => {
    setSelectedJob(null)
    setEditNotes("")
  }

  const saveNotes = async () => {
    if (!selectedJob) return
    try {
      setSavingNotes(true)
      const res = await fetch(`/api/printjobs/${selectedJob.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes: editNotes }),
      })
      if (!res.ok) throw new Error("Fout bij opslaan")
      const updated = await res.json()
      setPrintJobs(prev => prev.map(j => j.id === updated.id ? { ...j, notes: updated.notes } : j))
      setSelectedJob(prev => prev ? { ...prev, notes: updated.notes } : null)
    } catch {
      alert("Kon notitie niet opslaan")
    } finally {
      setSavingNotes(false)
    }
  }

  const resolveJob = async (id: string) => {
    if (!confirm("Weet je zeker dat je deze job wilt markeren als opgelost?")) {
      return
    }

    try {
      const response = await fetch(`/api/printjobs/${id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ missingFile: false, printStatus: "pending" }),
      })

      if (!response.ok) {
        throw new Error("Fout bij updaten van printjob")
      }

      setSelectedJob(null)
      await fetchMissingFiles()
    } catch (err) {
      alert("Kon de printjob niet updaten")
      console.error(err)
    }
  }

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case "urgent": return "bg-red-100 text-red-800 border-red-300"
      case "high": return "bg-orange-100 text-orange-800 border-orange-300"
      case "normal": return "bg-blue-100 text-blue-800 border-blue-300"
      case "low": return "bg-gray-100 text-gray-800 border-gray-300"
      default: return "bg-gray-100 text-gray-800 border-gray-300"
    }
  }

  const getStatusText = (status: string) => {
    switch (status) {
      case "pending": return "Wachtend"
      case "in_progress": return "Bezig"
      case "completed": return "Voltooid"
      default: return status
    }
  }

  if (loading) {
    return (
      <div className="p-8">
        <div className="flex items-center justify-center min-h-96">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
            <p className="mt-4 text-gray-600">Bezig met laden...</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Missing Files</h1>
        <p className="text-gray-600 mt-2">
          Printjobs waarbij het printbestand ontbreekt
        </p>
      </div>

      {error && (
        <div className="mb-4 p-4 bg-red-100 border border-red-400 text-red-700 rounded-md">
          {error}
        </div>
      )}

      <div className="bg-white rounded-lg shadow">
        {printJobs.length === 0 ? (
          <div className="p-12 text-center">
            <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <h3 className="mt-4 text-lg font-medium text-gray-900">Geen missing files</h3>
            <p className="mt-2 text-sm text-gray-500">
              Er zijn momenteel geen printjobs met ontbrekende bestanden.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Order
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Product
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    SKU
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Aantal
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Priority
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Ontvangen
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Notities
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actie
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {printJobs.map((job) => (
                  <tr key={job.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => openDetail(job)}>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">
                        #{job.orderNumber}
                      </div>
                      {job.customerName && (
                        <div className="text-xs text-gray-500">{job.customerName}</div>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm text-gray-900">{job.productName}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-500">{job.sku || "-"}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">{job.quantity}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full border ${getPriorityColor(job.priority)}`}>
                        {job.priority.toUpperCase()}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">{getStatusText(job.printStatus)}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-500">
                        {new Date(job.receivedAt).toLocaleDateString("nl-NL")}
                      </div>
                      <div className="text-xs text-gray-400">
                        {new Date(job.receivedAt).toLocaleTimeString("nl-NL")}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-500 truncate max-w-[200px]">
                        {job.notes || <span className="text-gray-300 italic">Geen notities</span>}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <button
                        onClick={(e) => { e.stopPropagation(); resolveJob(job.id) }}
                        className="text-green-600 hover:text-green-900"
                      >
                        Markeer als opgelost
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="mt-4 text-sm text-gray-500">
        Totaal: {printJobs.length} printjob{printJobs.length !== 1 ? "s" : ""} met ontbrekende bestanden
      </div>

      {/* Detail Popup */}
      {selectedJob && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={closeDetail}>
          <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b border-gray-200">
              <div>
                <h2 className="text-xl font-bold text-gray-900">Order #{selectedJob.orderNumber}</h2>
                {selectedJob.customerName && (
                  <p className="text-sm text-gray-500 mt-0.5">{selectedJob.customerName}</p>
                )}
              </div>
              <button onClick={closeDetail} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
                <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Body */}
            <div className="p-6 space-y-5">
              {/* Product info + image */}
              <div className="flex gap-4">
                {selectedJob.imageUrl && (
                  <img
                    src={selectedJob.imageUrl}
                    alt={selectedJob.productName}
                    className="w-20 h-20 object-contain rounded-lg border border-gray-200 bg-gray-50 flex-shrink-0"
                  />
                )}
                <div className="min-w-0">
                  <h3 className="font-semibold text-gray-900 truncate">{selectedJob.productName}</h3>
                  <div className="mt-1 space-y-0.5 text-sm text-gray-600">
                    {selectedJob.sku && <p>SKU: <span className="font-mono">{selectedJob.sku}</span></p>}
                    {selectedJob.backfile && <p>Backfile: <span className="font-mono">{selectedJob.backfile}</span></p>}
                  </div>
                </div>
              </div>

              {/* Details grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-xs text-gray-500 uppercase font-medium">Aantal</p>
                  <p className="text-lg font-bold text-gray-900">{selectedJob.quantity}</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-xs text-gray-500 uppercase font-medium">Prioriteit</p>
                  <span className={`mt-1 inline-block px-2 py-0.5 text-xs font-semibold rounded-full border ${getPriorityColor(selectedJob.priority)}`}>
                    {selectedJob.priority.toUpperCase()}
                  </span>
                </div>
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-xs text-gray-500 uppercase font-medium">Status</p>
                  <p className="text-sm font-medium text-gray-900">{getStatusText(selectedJob.printStatus)}</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-xs text-gray-500 uppercase font-medium">Ontvangen</p>
                  <p className="text-sm font-medium text-gray-900">
                    {new Date(selectedJob.receivedAt).toLocaleDateString("nl-NL")}
                  </p>
                  <p className="text-xs text-gray-500">
                    {new Date(selectedJob.receivedAt).toLocaleTimeString("nl-NL")}
                  </p>
                </div>
                {selectedJob.orderStatus && (
                  <div className="bg-gray-50 rounded-lg p-3">
                    <p className="text-xs text-gray-500 uppercase font-medium">Order Status</p>
                    <p className="text-sm font-medium text-gray-900">{selectedJob.orderStatus}</p>
                  </div>
                )}
                {selectedJob.tags && (
                  <div className="bg-gray-50 rounded-lg p-3">
                    <p className="text-xs text-gray-500 uppercase font-medium">Tags</p>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {selectedJob.tags.split(",").map((tag, i) => (
                        <span key={i} className="px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded text-xs">{tag.trim()}</span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Notities */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Notities</label>
                <textarea
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  rows={4}
                  placeholder="Schrijf hier wat er aan de hand is..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
                />
                <div className="flex items-center justify-between mt-2">
                  <p className="text-xs text-gray-400">
                    {editNotes !== (selectedJob.notes || "") ? "Niet-opgeslagen wijzigingen" : ""}
                  </p>
                  <button
                    onClick={saveNotes}
                    disabled={savingNotes || editNotes === (selectedJob.notes || "")}
                    className="px-4 py-1.5 text-sm font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    {savingNotes ? "Opslaan..." : "Notitie opslaan"}
                  </button>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between p-6 border-t border-gray-200 bg-gray-50 rounded-b-xl">
              <button
                onClick={closeDetail}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Sluiten
              </button>
              <button
                onClick={() => resolveJob(selectedJob.id)}
                className="px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 transition-colors"
              >
                Markeer als opgelost
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
