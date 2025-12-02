"use client"

import { useEffect, useState } from "react"

interface User {
  id: string
  name: string
  email: string
}

interface PrintJob {
  id: string
  orderNumber: string
  productName: string
  quantity: number
  priority: string
  printStatus: string
  receivedAt: string
  startedAt?: string
  completedAt?: string
  completedByUser?: User
  tags?: string
}

interface Stats {
  statusCounts: { printStatus: string; _count: number }[]
  completedJobs: PrintJob[]
  avgProcessingTimeMs: number
  employeeStats: { user: User; count: number }[]
}

interface ProductionSpec {
  id: string
  tag: string
  m2: number | null
  time: number | null
}

export default function DashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [allJobs, setAllJobs] = useState<PrintJob[]>([])
  const [productionSpecs, setProductionSpecs] = useState<ProductionSpec[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [autoRefresh, setAutoRefresh] = useState(true)

  useEffect(() => {
    fetchData()
  }, [])

  useEffect(() => {
    if (!autoRefresh) return

    const interval = setInterval(() => {
      fetchData()
    }, 5000) // Elke 5 seconden verversen

    return () => clearInterval(interval)
  }, [autoRefresh])

  const fetchData = async () => {
    try {
      setLoading(true)
      
      const [statsResponse, jobsResponse, specsResponse] = await Promise.all([
        fetch("/api/stats"),
        fetch("/api/printjobs"),
        fetch("/api/production-specs"),
      ])

      if (!statsResponse.ok || !jobsResponse.ok || !specsResponse.ok) {
        throw new Error("Fout bij ophalen van data")
      }

      const statsData = await statsResponse.json()
      const jobsData = await jobsResponse.json()
      const specsData = await specsResponse.json()

      setStats(statsData)
      setAllJobs(jobsData)
      setProductionSpecs(specsData)
      setError("")
    } catch (err) {
      setError("Kan data niet laden")
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const formatTime = (ms: number) => {
    const seconds = Math.floor(ms / 1000)
    const minutes = Math.floor(seconds / 60)
    const hours = Math.floor(minutes / 60)

    if (hours > 0) {
      return `${hours}u ${minutes % 60}m`
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`
    } else {
      return `${seconds}s`
    }
  }

  const getStatusCount = (status: string) => {
    const statusItem = stats?.statusCounts.find(s => s.printStatus === status)
    return statusItem?._count || 0
  }

  const calculateTotalM2 = () => {
    const pendingAndInProgress = allJobs.filter(
      j => j.printStatus === "pending" || j.printStatus === "in_progress"
    )
    
    let totalM2 = 0
    
    for (const job of pendingAndInProgress) {
      if (!job.tags) continue
      
      const jobTags = job.tags.split(',').map(t => t.trim())
      
      for (const tag of jobTags) {
        const spec = productionSpecs.find(s => s.tag.toLowerCase() === tag.toLowerCase())
        if (spec && spec.m2) {
          totalM2 += spec.m2 * job.quantity
        }
      }
    }
    
    return totalM2.toFixed(2)
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

  const pendingJobs = allJobs.filter(j => j.printStatus === "pending")
  const inProgressJobs = allJobs.filter(j => j.printStatus === "in_progress")
  const completedToday = allJobs.filter(j => {
    if (!j.completedAt) return false
    const today = new Date()
    const completedDate = new Date(j.completedAt)
    return completedDate.toDateString() === today.toDateString()
  })

  return (
    <div className="p-8">
      <div className="mb-8 flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-gray-600 mt-2">Real-time monitoring & statistieken</p>
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
        <div className="mb-6 p-4 bg-red-100 border border-red-400 text-red-700 rounded-lg">
          {error}
        </div>
      )}

      {/* Statistiek Cards */}
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
              <p className="text-sm font-medium text-gray-600">Voltooid Vandaag</p>
              <p className="text-3xl font-bold text-green-600">{completedToday.length}</p>
            </div>
            <div className="p-3 bg-green-100 rounded-full">
              <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Gem. Verwerkingstijd</p>
              <p className="text-3xl font-bold text-purple-600">
                {stats ? formatTime(stats.avgProcessingTimeMs) : "-"}
              </p>
            </div>
            <div className="p-3 bg-purple-100 rounded-full">
              <svg className="w-8 h-8 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
              </svg>
            </div>
          </div>
        </div>
      </div>

      {/* Tweede rij - Productie Statistieken */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Totaal M² Open</p>
              <p className="text-3xl font-bold text-indigo-600">{calculateTotalM2()}</p>
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
              <p className="text-sm font-medium text-gray-600">Totaal Tijd Open</p>
              <p className="text-3xl font-bold text-gray-400">-</p>
            </div>
            <div className="p-3 bg-gray-100 rounded-full">
              <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Placeholder 1</p>
              <p className="text-3xl font-bold text-gray-400">-</p>
            </div>
            <div className="p-3 bg-gray-100 rounded-full">
              <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Placeholder 2</p>
              <p className="text-3xl font-bold text-gray-400">-</p>
            </div>
            <div className="p-3 bg-gray-100 rounded-full">
              <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" />
              </svg>
            </div>
          </div>
        </div>
      </div>

      {/* Werknemers Prestaties */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        <div className="bg-white rounded-lg shadow">
          <div className="p-6 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">Werknemers Prestaties</h2>
          </div>
          <div className="p-6">
            {stats?.employeeStats && stats.employeeStats.length > 0 ? (
              <div className="space-y-4">
                {stats.employeeStats.map((emp) => (
                  <div key={emp.user.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-blue-600 rounded-full flex items-center justify-center text-white font-semibold">
                        {emp.user.name.charAt(0)}
                      </div>
                      <div>
                        <p className="font-medium text-gray-900">{emp.user.name}</p>
                        <p className="text-sm text-gray-500">{emp.user.email}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-2xl font-bold text-blue-600">{emp.count}</p>
                      <p className="text-xs text-gray-500">voltooid</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-gray-500 text-center py-8">Geen data beschikbaar</p>
            )}
          </div>
        </div>

        {/* Actieve Jobs */}
        <div className="bg-white rounded-lg shadow">
          <div className="p-6 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">Actieve Jobs</h2>
          </div>
          <div className="p-6 max-h-96 overflow-y-auto">
            {[...pendingJobs, ...inProgressJobs].length > 0 ? (
              <div className="space-y-3">
                {[...pendingJobs, ...inProgressJobs].slice(0, 10).map((job) => (
                  <div key={job.id} className="p-3 border border-gray-200 rounded-lg">
                    <div className="flex justify-between items-start mb-1">
                      <span className="font-medium text-gray-900">Order #{job.orderNumber}</span>
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                        job.printStatus === "in_progress"
                          ? "bg-yellow-100 text-yellow-800"
                          : "bg-blue-100 text-blue-800"
                      }`}>
                        {job.printStatus === "in_progress" ? "Bezig" : "Wachtend"}
                      </span>
                    </div>
                    <p className="text-sm text-gray-600">{job.productName}</p>
                    <p className="text-xs text-gray-500 mt-1">
                      {new Date(job.receivedAt).toLocaleTimeString("nl-NL")}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-gray-500 text-center py-8">Geen actieve jobs</p>
            )}
          </div>
        </div>
      </div>

      {/* Recent Voltooide Jobs */}
      <div className="bg-white rounded-lg shadow">
        <div className="p-6 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Recent Voltooid</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Order #
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Product
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Werknemer
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Voltooid
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Tijd
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {completedToday.slice(0, 10).map((job) => {
                const processingTime = job.startedAt && job.completedAt
                  ? new Date(job.completedAt).getTime() - new Date(job.startedAt).getTime()
                  : 0

                return (
                  <tr key={job.id}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {job.orderNumber}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {job.productName}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {job.completedByUser?.name || "-"}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {job.completedAt ? new Date(job.completedAt).toLocaleTimeString("nl-NL") : "-"}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {processingTime > 0 ? formatTime(processingTime) : "-"}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {completedToday.length === 0 && (
            <p className="text-gray-500 text-center py-8">Nog geen voltooide jobs vandaag</p>
          )}
        </div>
      </div>
    </div>
  )
}

interface User {
  id: string
  name: string
  email: string
}

interface PrintJob {
  id: string
  orderNumber: string
  productName: string
  quantity: number
  priority: string
  status: string
  receivedAt: string
  startedAt?: string
  completedAt?: string
  completedByUser?: User
}


