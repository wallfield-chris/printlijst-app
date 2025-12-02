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
  completedByUser?: {
    name: string
  }
}

export default function MissingFilesPage() {
  const [printJobs, setPrintJobs] = useState<PrintJob[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

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
        body: JSON.stringify({ missingFile: false }),
      })

      if (!response.ok) {
        throw new Error("Fout bij updaten van printjob")
      }

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
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actie
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {printJobs.map((job) => (
                  <tr key={job.id} className="hover:bg-gray-50">
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
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <button
                        onClick={() => resolveJob(job.id)}
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
    </div>
  )
}
