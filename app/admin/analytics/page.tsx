"use client"

import { useEffect, useState } from "react"

interface User {
  id: string
  name: string
  email: string
  role?: string
}

interface PrintJob {
  id: string
  tags?: string
  quantity: number
  completedAt?: string
  completedBy?: string
  completedByUser?: User
}

interface ProductionSpec {
  id: string
  tag: string
  m2: number | null
  time: number | null
}

interface DailyM2Data {
  date: string
  m2: number
}

interface DailyJobsData {
  date: string
  jobs: number
}

export default function AnalyticsPage() {
  const [loading, setLoading] = useState(true)
  const [users, setUsers] = useState<User[]>([]) 
  const [selectedUserId, setSelectedUserId] = useState("all")
  const [startDate, setStartDate] = useState("")
  const [endDate, setEndDate] = useState("")
  const [selectedM2Point, setSelectedM2Point] = useState<number | null>(null)
  const [selectedJobsPoint, setSelectedJobsPoint] = useState<number | null>(null)
  const [completedJobs, setCompletedJobs] = useState<PrintJob[]>([])
  const [productionSpecs, setProductionSpecs] = useState<ProductionSpec[]>([])
  const [dailyM2Data, setDailyM2Data] = useState<DailyM2Data[]>([])
  const [dailyJobsData, setDailyJobsData] = useState<DailyJobsData[]>([])

  useEffect(() => {
    // Set default dates: last 30 days
    const today = new Date()
    const thirtyDaysAgo = new Date(today)
    thirtyDaysAgo.setDate(today.getDate() - 30)
    
    setEndDate(today.toISOString().split('T')[0])
    setStartDate(thirtyDaysAgo.toISOString().split('T')[0])
    
    fetchData()
  }, [])

  useEffect(() => {
    if (startDate && endDate) {
      calculateDailyM2()
      calculateDailyJobs()
    }
  }, [completedJobs, productionSpecs, selectedUserId, startDate, endDate])

  const fetchData = async () => {
    try {
      setLoading(true)
      
      const [jobsResponse, specsResponse, usersResponse] = await Promise.all([
        fetch("/api/printjobs"),
        fetch("/api/production-specs"),
        fetch("/api/users"),
      ])

      if (jobsResponse.ok) {
        const jobs = await jobsResponse.json()
        setCompletedJobs(jobs.filter((j: PrintJob) => j.completedAt))
      }

      if (specsResponse.ok) {
        const specs = await specsResponse.json()
        setProductionSpecs(specs)
      }

      if (usersResponse.ok) {
        const usersData = await usersResponse.json()
        setUsers(usersData.filter((u: User) => u.role === "employee"))
      }
    } catch (error) {
      console.error("Error fetching data:", error)
    } finally {
      setLoading(false)
    }
  }

  const calculateDailyM2 = () => {
    if (!startDate || !endDate) return

    const start = new Date(startDate + 'T00:00:00')
    const end = new Date(endDate + 'T23:59:59')
    
    // Filter jobs by user and date range
    const filteredJobs = completedJobs.filter(job => {
      if (!job.completedAt) return false
      
      const jobDate = new Date(job.completedAt)
      if (jobDate < start || jobDate > end) return false
      
      if (selectedUserId !== "all" && job.completedBy !== selectedUserId) return false
      
      return true
    })

    // Initialize all dates in range with 0
    const m2ByDate: { [key: string]: number } = {}
    const startDateStr = startDate // Already in YYYY-MM-DD format
    const endDateStr = endDate     // Already in YYYY-MM-DD format
    
    const currentDate = new Date(startDateStr + 'T12:00:00') // Use noon to avoid timezone issues
    const endDateObj = new Date(endDateStr + 'T12:00:00')
    
    while (currentDate <= endDateObj) {
      const dateStr = currentDate.toISOString().split('T')[0]
      m2ByDate[dateStr] = 0
      currentDate.setDate(currentDate.getDate() + 1)
    }
    
    // Calculate M2 for each job
    for (const job of filteredJobs) {
      const jobDate = new Date(job.completedAt!)
      const date = jobDate.toISOString().split('T')[0]
      
      if (job.tags) {
        const jobTags = job.tags.split(',').map(t => t.trim())
        
        for (const tag of jobTags) {
          const spec = productionSpecs.find(s => s.tag.toLowerCase() === tag.toLowerCase())
          if (spec && spec.m2) {
            m2ByDate[date] += spec.m2 * job.quantity
          }
        }
      }
    }

    // Convert to array and sort by date
    const data: DailyM2Data[] = Object.entries(m2ByDate)
      .map(([date, m2]) => ({ date, m2 }))
      .sort((a, b) => a.date.localeCompare(b.date))

    setDailyM2Data(data)
  }

  const calculateDailyJobs = () => {
    if (!startDate || !endDate) return

    const start = new Date(startDate + 'T00:00:00')
    const end = new Date(endDate + 'T23:59:59')
    
    // Filter jobs by user and date range
    const filteredJobs = completedJobs.filter(job => {
      if (!job.completedAt) return false
      
      const jobDate = new Date(job.completedAt)
      if (jobDate < start || jobDate > end) return false
      
      if (selectedUserId !== "all" && job.completedBy !== selectedUserId) return false
      
      return true
    })

    // Initialize all dates in range with 0
    const jobsByDate: { [key: string]: number } = {}
    const startDateStr = startDate // Already in YYYY-MM-DD format
    const endDateStr = endDate     // Already in YYYY-MM-DD format
    
    const currentDate = new Date(startDateStr + 'T12:00:00') // Use noon to avoid timezone issues
    const endDateObj = new Date(endDateStr + 'T12:00:00')
    
    while (currentDate <= endDateObj) {
      const dateStr = currentDate.toISOString().split('T')[0]
      jobsByDate[dateStr] = 0
      currentDate.setDate(currentDate.getDate() + 1)
    }
    
    // Count jobs per date
    for (const job of filteredJobs) {
      const jobDate = new Date(job.completedAt!)
      const date = jobDate.toISOString().split('T')[0]
      
      if (jobsByDate[date] !== undefined) {
        jobsByDate[date]++
      }
    }

    // Convert to array and sort by date
    const data: DailyJobsData[] = Object.entries(jobsByDate)
      .map(([date, jobs]) => ({ date, jobs }))
      .sort((a, b) => a.date.localeCompare(b.date))

    setDailyJobsData(data)
  }

  const getMaxM2 = () => {
    if (dailyM2Data.length === 0) return 100
    return Math.max(...dailyM2Data.map(d => d.m2), 100)
  }

  const getMaxJobs = () => {
    if (dailyJobsData.length === 0) return 10
    return Math.max(...dailyJobsData.map(d => d.jobs), 10)
  }

  if (loading) {
    return (
      <div className="p-8">
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        </div>
      </div>
    )
  }

  return (
    <div className="p-8">
      <div className="mb-8 flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Analytics</h1>
          <p className="text-gray-600 mt-2">Uitgebreide analyses en rapporten</p>
        </div>
        
        {/* Filters */}
        <div className="flex gap-4 items-end">
          {/* Werknemer selectie */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Werknemer
            </label>
            <select
              value={selectedUserId}
              onChange={(e) => setSelectedUserId(e.target.value)}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="all">Alle werknemers</option>
              {users.map(user => (
                <option key={user.id} value={user.id}>{user.name}</option>
              ))}
            </select>
          </div>

          {/* Datum van */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Van
            </label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          {/* Datum tot */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Tot
            </label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* M² per dag grafiek */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">M² Geprint per Dag</h2>
          {dailyM2Data.length > 0 ? (
            <div className="space-y-2">
              {/* Line chart */}
              <div className="h-80 border border-gray-200 rounded p-4 bg-gradient-to-b from-blue-50 to-white">
                <svg className="w-full h-full" viewBox="0 0 1000 300" preserveAspectRatio="none">
                  {/* Grid lines */}
                  <line x1="0" y1="0" x2="1000" y2="0" stroke="#e5e7eb" strokeWidth="1" />
                  <line x1="0" y1="75" x2="1000" y2="75" stroke="#e5e7eb" strokeWidth="1" />
                  <line x1="0" y1="150" x2="1000" y2="150" stroke="#e5e7eb" strokeWidth="1" />
                  <line x1="0" y1="225" x2="1000" y2="225" stroke="#e5e7eb" strokeWidth="1" />
                  <line x1="0" y1="300" x2="1000" y2="300" stroke="#e5e7eb" strokeWidth="2" />
                  
                  {/* Area under the line */}
                  <defs>
                    <linearGradient id="areaGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                      <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.3" />
                      <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.05" />
                    </linearGradient>
                  </defs>
                  
                  {(() => {
                    const maxM2 = getMaxM2()
                    const points = dailyM2Data.map((data, index) => {
                      const x = (index / (dailyM2Data.length - 1)) * 1000
                      const y = maxM2 > 0 ? 300 - ((data.m2 / maxM2) * 280) : 300
                      return `${x},${y}`
                    }).join(' ')
                    
                    const areaPoints = `0,300 ${points} 1000,300`
                    
                    return (
                      <>
                        {/* Area fill */}
                        <polygon points={areaPoints} fill="url(#areaGradient)" />
                        
                        {/* Line */}
                        <polyline
                          points={points}
                          fill="none"
                          stroke="#3b82f6"
                          strokeWidth="3"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                        
                        {/* Data points */}
                        {dailyM2Data.map((data, index) => {
                          const x = (index / (dailyM2Data.length - 1)) * 1000
                          const y = maxM2 > 0 ? 300 - ((data.m2 / maxM2) * 280) : 300
                          const isSelected = selectedM2Point === index
                          return (
                            <g key={index}>
                              <circle
                                cx={x}
                                cy={y}
                                r={isSelected ? "8" : "6"}
                                fill="#3b82f6"
                                stroke="white"
                                strokeWidth="3"
                                className="cursor-pointer transition-all"
                                onClick={() => setSelectedM2Point(selectedM2Point === index ? null : index)}
                                onMouseEnter={(e) => {
                                  e.currentTarget.setAttribute('r', '8')
                                }}
                                onMouseLeave={(e) => {
                                  if (!isSelected) e.currentTarget.setAttribute('r', '6')
                                }}
                              />
                            </g>
                          )
                        })}
                      </>
                    )
                  })()}
                </svg>
              </div>
              
              {/* Selected point info */}
              {selectedM2Point !== null && dailyM2Data[selectedM2Point] && (
                <div className="mt-3 p-3 bg-blue-100 border border-blue-300 rounded-lg">
                  <div className="flex justify-between items-center">
                    <div>
                      <div className="text-sm font-semibold text-blue-900">
                        {new Date(dailyM2Data[selectedM2Point].date).toLocaleDateString('nl-NL', { 
                          weekday: 'long',
                          day: 'numeric', 
                          month: 'long',
                          year: 'numeric'
                        })}
                      </div>
                      <div className="text-2xl font-bold text-blue-600 mt-1">
                        {dailyM2Data[selectedM2Point].m2.toFixed(2)} m²
                      </div>
                    </div>
                    <button 
                      onClick={() => setSelectedM2Point(null)}
                      className="text-blue-600 hover:text-blue-800 text-xl font-bold"
                    >
                      ×
                    </button>
                  </div>
                </div>
              )}
              
              {/* X-axis labels */}
              <div className="flex justify-between text-xs text-gray-500 mt-2">
                <span>{dailyM2Data.length > 0 ? new Date(dailyM2Data[0].date).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' }) : ''}</span>
                <span>{dailyM2Data.length > 0 ? new Date(dailyM2Data[dailyM2Data.length - 1].date).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' }) : ''}</span>
              </div>
              
              {/* Total */}
              <div className="mt-4 p-3 bg-blue-50 rounded-lg">
                <div className="text-sm text-gray-600">Totaal in periode</div>
                <div className="text-2xl font-bold text-blue-600">
                  {(() => {
                    const total = dailyM2Data.reduce((sum, d) => sum + d.m2, 0)
                    return isNaN(total) || total === 0 ? '0.00' : total.toFixed(2)
                  })()} m²
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center py-12 text-gray-500">
              Geen data beschikbaar voor de geselecteerde periode
            </div>
          )}
        </div>

        {/* Voltooide printjobs per dag */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Voltooide Printjobs per Dag</h2>
          {dailyJobsData.length > 0 ? (
            <div className="space-y-2">
              {/* Line chart */}
              <div className="h-80 border border-gray-200 rounded p-4 bg-gradient-to-b from-green-50 to-white">
                <svg className="w-full h-full" viewBox="0 0 1000 300" preserveAspectRatio="none">
                  {/* Grid lines */}
                  <line x1="0" y1="0" x2="1000" y2="0" stroke="#e5e7eb" strokeWidth="1" />
                  <line x1="0" y1="75" x2="1000" y2="75" stroke="#e5e7eb" strokeWidth="1" />
                  <line x1="0" y1="150" x2="1000" y2="150" stroke="#e5e7eb" strokeWidth="1" />
                  <line x1="0" y1="225" x2="1000" y2="225" stroke="#e5e7eb" strokeWidth="1" />
                  <line x1="0" y1="300" x2="1000" y2="300" stroke="#e5e7eb" strokeWidth="2" />
                  
                  {/* Area under the line */}
                  <defs>
                    <linearGradient id="jobsAreaGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                      <stop offset="0%" stopColor="#22c55e" stopOpacity="0.3" />
                      <stop offset="100%" stopColor="#22c55e" stopOpacity="0.05" />
                    </linearGradient>
                  </defs>
                  
                  {(() => {
                    const maxJobs = getMaxJobs()
                    const points = dailyJobsData.map((data, index) => {
                      const x = (index / (dailyJobsData.length - 1)) * 1000
                      const y = maxJobs > 0 ? 300 - ((data.jobs / maxJobs) * 280) : 300
                      return `${x},${y}`
                    }).join(' ')
                    
                    const areaPoints = `0,300 ${points} 1000,300`
                    
                    return (
                      <>
                        {/* Area fill */}
                        <polygon points={areaPoints} fill="url(#jobsAreaGradient)" />
                        
                        {/* Line */}
                        <polyline
                          points={points}
                          fill="none"
                          stroke="#22c55e"
                          strokeWidth="3"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                        
                        {/* Data points */}
                        {dailyJobsData.map((data, index) => {
                          const x = (index / (dailyJobsData.length - 1)) * 1000
                          const y = maxJobs > 0 ? 300 - ((data.jobs / maxJobs) * 280) : 300
                          const isSelected = selectedJobsPoint === index
                          return (
                            <g key={index}>
                              <circle
                                cx={x}
                                cy={y}
                                r={isSelected ? "8" : "6"}
                                fill="#22c55e"
                                stroke="white"
                                strokeWidth="3"
                                className="cursor-pointer transition-all"
                                onClick={() => setSelectedJobsPoint(selectedJobsPoint === index ? null : index)}
                                onMouseEnter={(e) => {
                                  e.currentTarget.setAttribute('r', '8')
                                }}
                                onMouseLeave={(e) => {
                                  if (!isSelected) e.currentTarget.setAttribute('r', '6')
                                }}
                              />
                            </g>
                          )
                        })}
                      </>
                    )
                  })()}
                </svg>
              </div>
              
              {/* Selected point info */}
              {selectedJobsPoint !== null && dailyJobsData[selectedJobsPoint] && (
                <div className="mt-3 p-3 bg-green-100 border border-green-300 rounded-lg">
                  <div className="flex justify-between items-center">
                    <div>
                      <div className="text-sm font-semibold text-green-900">
                        {new Date(dailyJobsData[selectedJobsPoint].date).toLocaleDateString('nl-NL', { 
                          weekday: 'long',
                          day: 'numeric', 
                          month: 'long',
                          year: 'numeric'
                        })}
                      </div>
                      <div className="text-2xl font-bold text-green-600 mt-1">
                        {dailyJobsData[selectedJobsPoint].jobs} jobs
                      </div>
                    </div>
                    <button 
                      onClick={() => setSelectedJobsPoint(null)}
                      className="text-green-600 hover:text-green-800 text-xl font-bold"
                    >
                      ×
                    </button>
                  </div>
                </div>
              )}
              
              {/* X-axis labels */}
              <div className="flex justify-between text-xs text-gray-500 mt-2">
                <span>{dailyJobsData.length > 0 ? new Date(dailyJobsData[0].date).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' }) : ''}</span>
                <span>{dailyJobsData.length > 0 ? new Date(dailyJobsData[dailyJobsData.length - 1].date).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' }) : ''}</span>
              </div>
              
              {/* Total */}
              <div className="mt-4 p-3 bg-green-50 rounded-lg">
                <div className="text-sm text-gray-600">Totaal in periode</div>
                <div className="text-2xl font-bold text-green-600">
                  {dailyJobsData.reduce((sum, d) => sum + d.jobs, 0)} jobs
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center py-12 text-gray-500">
              Geen data beschikbaar voor de geselecteerde periode
            </div>
          )}
        </div>

        {/* Top producten */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Meest Geprinte Producten</h2>
          <div className="text-center py-12 text-gray-500">
            Top 10 lijst komt hier...
          </div>
        </div>

        {/* Performance metrics */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Performance Metrics</h2>
          <div className="space-y-4">
            <div className="flex justify-between items-center p-3 bg-gray-50 rounded">
              <span className="text-sm font-medium text-gray-700">Gemiddelde doorlooptijd</span>
              <span className="text-lg font-bold text-blue-600">12m 34s</span>
            </div>
            <div className="flex justify-between items-center p-3 bg-gray-50 rounded">
              <span className="text-sm font-medium text-gray-700">Jobs per uur</span>
              <span className="text-lg font-bold text-green-600">8.5</span>
            </div>
            <div className="flex justify-between items-center p-3 bg-gray-50 rounded">
              <span className="text-sm font-medium text-gray-700">Error rate</span>
              <span className="text-lg font-bold text-red-600">0.5%</span>
            </div>
          </div>
        </div>
      </div>

      {/* Maandoverzicht */}
      <div className="bg-white rounded-lg shadow">
        <div className="p-6 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Maandoverzicht</h2>
        </div>
        <div className="p-6">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Maand
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Totaal Jobs
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Voltooid
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Gem. Tijd
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Trend
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                <tr>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    November 2025
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    245
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    242
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    11m 23s
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    <span className="text-green-600">↑ 12%</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
