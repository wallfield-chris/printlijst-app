"use client"

import { useSession, signOut } from "next-auth/react"
import { useRouter } from "next/navigation"
import { useEffect, useState, useRef } from "react"
import bwipjs from "bwip-js"

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
  backfile?: string | null
  sku?: string | null
  tags?: string | null
  missingFile?: boolean
  completedByUser?: {
    id: string
    name: string
    email: string
  }
}

interface ListView {
  id: string
  name: string
  tags: string
  order: number
}

export default function PrintJobsPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [printJobs, setPrintJobs] = useState<PrintJob[]>([])
  const [listViews, setListViews] = useState<ListView[]>([])
  const [activeTab, setActiveTab] = useState<string>("all")
  const [priorityFilter, setPriorityFilter] = useState<"normal" | "urgent">("normal")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [selectedJob, setSelectedJob] = useState<PrintJob | null>(null)
  const backfileCanvasRef = useRef<HTMLCanvasElement>(null)
  const skuCanvasRef = useRef<HTMLCanvasElement>(null)

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

    fetchPrintJobs()
    fetchListViews()
  }, [session, status, router])

  useEffect(() => {
    if (selectedJob?.backfile && backfileCanvasRef.current) {
      try {
        bwipjs.toCanvas(backfileCanvasRef.current, {
          bcid: 'code128',
          text: selectedJob.backfile,
          scale: 2,
          height: 8,
          includetext: true,
          textxalign: 'center',
        })
      } catch (err) {
        console.error('Error generating backfile barcode:', err)
      }
    }

    if (selectedJob?.sku && skuCanvasRef.current) {
      try {
        const skuWithRtl = `${selectedJob.sku}.rtl`
        bwipjs.toCanvas(skuCanvasRef.current, {
          bcid: 'code128',
          text: skuWithRtl,
          scale: 2,
          height: 8,
          includetext: true,
          textxalign: 'center',
        })
      } catch (err) {
        console.error('Error generating SKU barcode:', err)
      }
    }
  }, [selectedJob])

  const fetchPrintJobs = async () => {
    try {
      setLoading(true)
      const response = await fetch("/api/printjobs?status=pending&status=in_progress&status=completed")
      
      if (!response.ok) {
        throw new Error("Fout bij ophalen van printjobs")
      }

      const data = await response.json()
      setPrintJobs(data)
    } catch (err) {
      setError("Kan printjobs niet laden")
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const fetchListViews = async () => {
    try {
      const response = await fetch("/api/list-views")
      if (response.ok) {
        const data = await response.json()
        setListViews(data)
      }
    } catch (err) {
      console.error("Error fetching list views:", err)
    }
  }

  const getFilteredJobs = () => {
    // First filter by priority
    let filtered = printJobs.filter(job => {
      if (priorityFilter === "urgent") {
        return job.priority === "urgent"
      } else {
        // Normal priority includes: low, normal, high (everything except urgent)
        return job.priority !== "urgent"
      }
    })

    // Then filter by list view/tab
    if (activeTab === "all") {
      return filtered
    }

    const activeView = listViews.find(view => view.id === activeTab)
    if (!activeView) return filtered

    const viewTags = activeView.tags.split(",").filter(t => t)
    
    return filtered.filter(job => {
      if (!job.tags) return false
      const jobTags = job.tags.split(",").filter(t => t)
      return viewTags.some(tag => jobTags.includes(tag))
    })
  }

  const updateJobStatus = async (id: string, newStatus: string) => {
    try {
      const response = await fetch(`/api/printjobs/${id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ printStatus: newStatus }),
      })

      if (!response.ok) {
        throw new Error("Fout bij updaten van printjob")
      }

      await fetchPrintJobs()
    } catch (err) {
      alert("Kon de printjob niet updaten")
      console.error(err)
    }
  }

  const openJobDetails = (job: PrintJob) => {
    setSelectedJob(job)
  }

  const closeJobDetails = () => {
    setSelectedJob(null)
  }

  const handleCompleteAndNext = async () => {
    if (!selectedJob) return
    
    // Update status to completed
    await updateJobStatus(selectedJob.id, "completed")
    
    // Find next job
    const currentIndex = printJobs.findIndex(job => job.id === selectedJob.id)
    const nextJob = printJobs[currentIndex + 1]
    
    if (nextJob) {
      setSelectedJob(nextJob)
    } else {
      setSelectedJob(null)
    }
  }

  const handleMissingPrintfile = async () => {
    if (!selectedJob) return
    
    // Check if already marked as missing file
    if (selectedJob.printStatus === "completed" || selectedJob.missingFile) {
      alert("Deze printjob is al gemarkeerd als missing file of voltooid")
      return
    }
    
    try {
      const response = await fetch(`/api/printjobs/${selectedJob.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ missingFile: true, printStatus: "completed" }),
      })

      if (!response.ok) {
        throw new Error("Fout bij markeren als missing file")
      }

      // Fetch updated jobs and move to next
      await fetchPrintJobs()
      
      const currentIndex = printJobs.findIndex(job => job.id === selectedJob.id)
      const nextJob = printJobs[currentIndex + 1]
      
      if (nextJob) {
        setSelectedJob(nextJob)
      } else {
        setSelectedJob(null)
      }
    } catch (err) {
      alert("Kon printjob niet markeren als missing file")
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

  if (status === "loading" || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Bezig met laden...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-100">
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
          <h1 className="text-2xl font-bold text-gray-900">Printlijst</h1>
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
        {/* Priority Filter Tabs */}
        <div className="mb-4 bg-white rounded-lg shadow-sm p-2">
          <div className="flex gap-2">
            <button
              onClick={() => setPriorityFilter("normal")}
              className={`flex-1 py-3 px-4 rounded-md font-medium text-sm transition-colors ${
                priorityFilter === "normal"
                  ? "bg-blue-600 text-white"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              Normal Priority
            </button>
            <button
              onClick={() => setPriorityFilter("urgent")}
              className={`flex-1 py-3 px-4 rounded-md font-medium text-sm transition-colors ${
                priorityFilter === "urgent"
                  ? "bg-red-600 text-white"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              Urgent Priority
            </button>
          </div>
        </div>

        {/* Tabs */}
        {listViews.length > 0 && (
          <div className="mb-6 border-b border-gray-200">
            <nav className="-mb-px flex space-x-8">
              <button
                onClick={() => setActiveTab("all")}
                className={`py-4 px-1 border-b-2 font-medium text-sm ${
                  activeTab === "all"
                    ? "border-blue-500 text-blue-600"
                    : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                }`}
              >
                Alle ({printJobs.filter(job => priorityFilter === "urgent" ? job.priority === "urgent" : job.priority !== "urgent").length})
              </button>
              {listViews.map((view) => {
                const viewTags = view.tags.split(",").filter(t => t)
                const count = printJobs.filter(job => {
                  // Apply priority filter
                  const passesPriorityFilter = priorityFilter === "urgent" 
                    ? job.priority === "urgent" 
                    : job.priority !== "urgent"
                  
                  if (!passesPriorityFilter) return false
                  if (!job.tags) return false
                  
                  const jobTags = job.tags.split(",").filter(t => t)
                  return viewTags.some(tag => jobTags.includes(tag))
                }).length

                return (
                  <button
                    key={view.id}
                    onClick={() => setActiveTab(view.id)}
                    className={`py-4 px-1 border-b-2 font-medium text-sm ${
                      activeTab === view.id
                        ? "border-blue-500 text-blue-600"
                        : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                    }`}
                  >
                    {view.name} ({count})
                  </button>
                )
              })}
            </nav>
          </div>
        )}

        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-semibold text-gray-800">
            Actieve Printjobs ({getFilteredJobs().length})
          </h2>
          <button
            onClick={fetchPrintJobs}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            ↻ Vernieuwen
          </button>
        </div>

        {error && (
          <div className="mb-4 p-4 bg-red-100 border border-red-400 text-red-700 rounded-md">
            {error}
          </div>
        )}

        {getFilteredJobs().length === 0 ? (
          <div className="bg-white rounded-lg shadow p-8 text-center">
            <p className="text-gray-600">Geen actieve printjobs op dit moment.</p>
          </div>
        ) : (
          <div className="grid gap-4">
            {getFilteredJobs().map((job) => {
              const cardColor = job.missingFile 
                ? "bg-red-50 border-2 border-red-200" 
                : job.printStatus === "completed"
                ? "bg-green-50 border-2 border-green-200"
                : "bg-white"
              
              return (
                <div
                  key={job.id}
                  onClick={() => openJobDetails(job)}
                  className={`${cardColor} rounded-lg shadow p-6 hover:shadow-lg transition-shadow cursor-pointer`}
                >
                <div className="flex justify-between items-start mb-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="text-lg font-semibold text-gray-900">
                        Order #{job.orderNumber}
                      </h3>
                      <span className={`px-3 py-1 rounded-full text-xs font-medium border ${getPriorityColor(job.priority)}`}>
                        {job.priority.toUpperCase()}
                      </span>
                    </div>
                    <p className="text-gray-700 mb-1">
                      <span className="font-medium">Product:</span> {job.productName}
                    </p>
                    <p className="text-gray-600 text-sm">
                      <span className="font-medium">Aantal:</span> {job.quantity}
                    </p>
                    <p className="text-gray-500 text-xs mt-2">
                      Ontvangen: {new Date(job.receivedAt).toLocaleString("nl-NL")}
                    </p>
                  </div>

                  <div className="flex flex-col gap-2 ml-4">
                    <span className={`px-3 py-1 rounded-md text-xs font-medium text-center ${
                      job.printStatus === "in_progress"
                        ? "bg-yellow-100 text-yellow-800"
                        : "bg-gray-100 text-gray-800"
                    }`}>
                      {getStatusText(job.printStatus)}
                    </span>
                  </div>
                </div>
              </div>
              )
            })}
          </div>
        )}

        {/* Popup Modal */}
        {selectedJob && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full p-8">
              <div className="flex justify-between items-start mb-4">
                <h2 className="text-xl font-bold text-gray-900">
                  Order #{selectedJob.orderNumber}
                </h2>
                <button
                  onClick={closeJobDetails}
                  className="text-gray-400 hover:text-gray-600 text-2xl leading-none"
                >
                  ×
                </button>
              </div>

              <div className="mb-6">
                <p className="text-gray-700 mb-2">
                  <span className="font-medium">Product:</span> {selectedJob.productName}
                </p>
                <p className="text-gray-600 mb-4">
                  <span className="font-medium">Aantal:</span> {selectedJob.quantity}
                </p>
              </div>

              {selectedJob.backfile ? (
                <div className="mb-6">
                  <p className="text-sm font-medium text-gray-700 mb-3">Backfile:</p>
                  <div className="bg-white border-2 border-gray-200 rounded-lg p-6 flex justify-center overflow-hidden">
                    <canvas ref={backfileCanvasRef} className="max-w-full h-auto"></canvas>
                  </div>
                </div>
              ) : (
                <div className="mb-6 p-4 bg-gray-100 rounded-lg text-center text-gray-500 text-sm">
                  Geen backfile beschikbaar
                </div>
              )}

              {selectedJob.sku ? (
                <div className="mb-6">
                  <p className="text-sm font-medium text-gray-700 mb-3">SKU:</p>
                  <div className="bg-white border-2 border-gray-200 rounded-lg p-6 flex justify-center overflow-hidden">
                    <canvas ref={skuCanvasRef} className="max-w-full h-auto"></canvas>
                  </div>
                </div>
              ) : (
                <div className="mb-6 p-4 bg-gray-100 rounded-lg text-center text-gray-500 text-sm">
                  Geen SKU beschikbaar
                </div>
              )}

              <div className="flex items-center justify-end gap-3 mt-6">
                <button
                  onClick={handleMissingPrintfile}
                  className="px-6 py-3 bg-yellow-600 text-white rounded-md hover:bg-yellow-700 font-medium"
                >
                  Missing Printfile
                </button>
                <button
                  onClick={handleCompleteAndNext}
                  className="px-6 py-3 bg-green-600 text-white rounded-md hover:bg-green-700 font-medium"
                >
                  Complete & Next
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
