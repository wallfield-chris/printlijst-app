"use client"

import { useSession, signOut } from "next-auth/react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { useEffect, useState, useRef, useCallback } from "react"
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
  imageUrl?: string | null
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
  const [loading, setLoading] = useState(true)
  const [initialLoadDone, setInitialLoadDone] = useState(false)
  const [error, setError] = useState("")
  const [selectedJob, setSelectedJob] = useState<PrintJob | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [syncProgress, setSyncProgress] = useState<{ step: number; totalSteps: number; message: string; detail?: string } | null>(null)
  const [refreshProgress, setRefreshProgress] = useState<{ step: number; totalSteps: number; message: string; detail?: string } | null>(null)
  const [modalImageUrl, setModalImageUrl] = useState<string | null>(null)
  // Push to Stock
  const [pushToStockOpen, setPushToStockOpen] = useState(false)
  const [pickLocations, setPickLocations] = useState<{ uuid: string; name: string }[]>([])
  const [pickLocationsLoading, setPickLocationsLoading] = useState(false)
  const [pickLocationsError, setPickLocationsError] = useState<string | null>(null)
  const [selectedLocation, setSelectedLocation] = useState<{ uuid: string; name: string } | null>(null)
  const [pushing, setPushing] = useState(false)
  const [pushResult, setPushResult] = useState<{ pushed: number; failed: number; message: string; failedProducts?: { name: string; error: string }[] } | null>(null)
  // Real-time polling
  const [pollHash, setPollHash] = useState<string | null>(null)
  const [isLive, setIsLive] = useState(false)
  const [newOrderFlash, setNewOrderFlash] = useState(false)
  const pollRef = useRef<string | null>(null)

  // Callback refs — tekenen de barcode zodra het canvas element mount
  const backfileCanvasRef = useCallback((canvas: HTMLCanvasElement | null) => {
    if (!canvas || !selectedJob?.backfile) return
    try {
      bwipjs.toCanvas(canvas, {
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
  }, [selectedJob?.backfile])

  const skuCanvasRef = useCallback((canvas: HTMLCanvasElement | null) => {
    if (!canvas || !selectedJob?.sku) return
    try {
      const skuWithRtl = `${selectedJob.sku}.rtl`
      bwipjs.toCanvas(canvas, {
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
  }, [selectedJob?.sku])

  useEffect(() => {
    if (status === "loading") return
    
    if (!session) {
      router.push("/login")
      return
    }

    fetchPrintJobs()
    fetchListViews()
  }, [session, status, router])

  // Real-time polling: check elke 5 seconden of er nieuwe/gewijzigde printjobs zijn
  // + check-completed elke 30 seconden (verwijdert afgeronde orders uit GG)
  // + auto-sync vanuit GoedGepickt elke 30 seconden (importeert nieuwe orders — server rate-limited)
  useEffect(() => {
    if (!session) return

    const pollForUpdates = async () => {
      try {
        const res = await fetch("/api/printjobs/poll")
        if (!res.ok) return
        const data = await res.json()
        const newHash = data.hash as string

        setIsLive(true)

        // Als de hash veranderd is → data is gewijzigd, herlaad printjobs
        if (pollRef.current !== null && pollRef.current !== newHash) {
          console.log("🔄 Wijziging gedetecteerd, printjobs herladen...")
          // Flash-effect voor nieuwe orders
          if (data.count > 0) {
            setNewOrderFlash(true)
            setTimeout(() => setNewOrderFlash(false), 3000)
          }
          await fetchPrintJobs(true)
        }

        pollRef.current = newHash
        setPollHash(newHash)
      } catch {
        setIsLive(false)
      }
    }

    // Check-completed: verwijder afgeronde/verzonden orders (server rate-limited op 30s)
    const checkCompleted = async () => {
      try {
        const res = await fetch("/api/goedgepickt/check-completed")
        if (!res.ok) return
        const data = await res.json()
        if (data.deleted && data.deleted > 0) {
          console.log(`🗑️ ${data.deleted} afgeronde printjobs verwijderd`)
          // Poll zal de hash-verandering oppikken en UI direct updaten
        }
      } catch {
        // Silently fail
      }
    }

    // Auto-sync: haal nieuwe orders op vanuit GoedGepickt (server rate-limited op 30s)
    const autoSync = async () => {
      try {
        const res = await fetch("/api/goedgepickt/auto-sync")
        if (!res.ok) return
        const data = await res.json()
        if (data.imported && data.imported > 0) {
          console.log(`📦 Auto-sync: ${data.imported} nieuwe orders geïmporteerd`)
          // Poll zal de hash-verandering oppikken en data herladen
        }
      } catch {
        // Silently fail — auto-sync is optioneel
      }
    }

    // Direct eerste poll + check + sync
    pollForUpdates()
    checkCompleted()
    autoSync()

    const pollInterval = setInterval(pollForUpdates, 5_000)        // elke 5 seconden
    const checkInterval = setInterval(checkCompleted, 30_000)      // elke 30 seconden
    const syncInterval = setInterval(autoSync, 30_000)             // elke 30 seconden
    return () => {
      clearInterval(pollInterval)
      clearInterval(checkInterval)
      clearInterval(syncInterval)
    }
  }, [session])

  // Haal afbeelding op als die nog niet in de DB staat
  useEffect(() => {
    if (!selectedJob) {
      setModalImageUrl(null)
      return
    }
    if (selectedJob.imageUrl) {
      setModalImageUrl(selectedJob.imageUrl)
      return
    }
    // Geen imageUrl in DB: fetch live uit GoedGepickt
    setModalImageUrl(null)
    fetch(`/api/printjobs/${selectedJob.id}/image`)
      .then((r) => r.json())
      .then((data) => {
        if (data.imageUrl) setModalImageUrl(data.imageUrl)
      })
      .catch(() => {})
  }, [selectedJob])

  const fetchPrintJobs = async (silent = false) => {
    try {
      if (!silent) setLoading(true)
      const response = await fetch("/api/printjobs?status=pending&status=in_progress&status=completed")
      
      if (!response.ok) {
        throw new Error("Fout bij ophalen van printjobs")
      }

      const data = await response.json()
      setPrintJobs(data)
      setInitialLoadDone(true)
    } catch (err) {
      if (!silent) setError("Kan printjobs niet laden")
      console.error(err)
    } finally {
      if (!silent) setLoading(false)
    }
  }

  // SSE stream reader helper
  const readSSEStream = async (
    response: Response, 
    setProgress: (p: { step: number; totalSteps: number; message: string; detail?: string } | null) => void
  ): Promise<any> => {
    const reader = response.body?.getReader()
    const decoder = new TextDecoder()
    let buffer = ""
    let result: any = null

    if (!reader) throw new Error("Geen response stream")

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })

      const lines = buffer.split("\n\n")
      buffer = lines.pop() || ""

      for (const line of lines) {
        const dataLine = line.replace(/^data: /, "").trim()
        if (!dataLine) continue
        try {
          const event = JSON.parse(dataLine)
          if (event.type === "start" || event.type === "progress") {
            setProgress({
              step: event.step || 0,
              totalSteps: event.totalSteps || 4,
              message: event.message,
              detail: event.detail,
            })
          } else if (event.type === "done") {
            setProgress({ step: event.totalSteps, totalSteps: event.totalSteps, message: "✅ " + event.message })
            result = event.result
          } else if (event.type === "error") {
            setProgress(null)
            throw new Error(event.message)
          }
        } catch (e) {
          if (e instanceof Error && e.message !== "Geen response stream") throw e
        }
      }
    }
    return result
  }

  const refreshWithStatusSync = async () => {
    if (refreshing) return
    try {
      setRefreshing(true)
      setError("")

      // Stap 1: Ruim duplicaten op (pending jobs die al als completed/pushed bestaan)
      setRefreshProgress({ step: 1, totalSteps: 4, message: "🧹 Duplicaten opruimen..." })
      try {
        const cleanupRes = await fetch("/api/printjobs/cleanup-duplicates", { method: "POST" })
        if (cleanupRes.ok) {
          const cleanupData = await cleanupRes.json()
          if (cleanupData.duplicatesRemoved > 0) {
            setRefreshProgress({ step: 1, totalSteps: 4, message: `🧹 ${cleanupData.duplicatesRemoved} duplicaten verwijderd` })
          } else {
            setRefreshProgress({ step: 1, totalSteps: 4, message: "🧹 Geen duplicaten gevonden" })
          }
        }
      } catch {
        // Silently continue — niet kritiek
      }

      // Stap 2: Verwijder afgeronde/verzonden/geannuleerde orders uit de lijst
      setRefreshProgress({ step: 2, totalSteps: 4, message: "🗑️ Afgeronde orders controleren..." })
      try {
        await fetch("/api/goedgepickt/check-completed")
      } catch {
        // Silently continue
      }

      // Stap 3: Sync statussen + gepickte producten met streaming
      setRefreshProgress({ step: 3, totalSteps: 4, message: "🔄 Statussen controleren..." })
      const statusResponse = await fetch("/api/printjobs/sync-statuses?stream=true", {
        method: "POST",
      })
      if (statusResponse.ok && statusResponse.body) {
        await readSSEStream(statusResponse, (p) => {
          if (p) setRefreshProgress({ step: 3, totalSteps: 4, message: p.message, detail: p.detail })
        })
      }

      // Stap 4: Haal eventuele nieuwe orders op + voorraad-allocatie met streaming
      setRefreshProgress({ step: 4, totalSteps: 4, message: "📦 Nieuwe orders ophalen..." })
      const syncResponse = await fetch("/api/goedgepickt/sync-orders?stream=true", {
        method: "POST",
      })
      if (syncResponse.ok && syncResponse.body) {
        await readSSEStream(syncResponse, (p) => {
          if (p) setRefreshProgress({ step: 4, totalSteps: 4, message: p.message, detail: p.detail })
        })
      }

      setRefreshProgress({ step: 4, totalSteps: 4, message: "✅ Vernieuwen voltooid" })
    } catch (err: any) {
      console.error("Sync fout:", err)
      setError("Kon orders niet synchroniseren uit GoedGepickt")
    } finally {
      setRefreshing(false)
      await fetchPrintJobs()
      setTimeout(() => setRefreshProgress(null), 3000)
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

  const syncOrdersFromGoedgepickt = async () => {
    if (syncing) return
    
    if (!confirm("Volledige hernieuwde sync uit GoedGepickt? Alle bestaande wachtende jobs worden verwijderd en opnieuw opgehaald.")) {
      return
    }

    try {
      setSyncing(true)
      setError("")
      setSyncProgress({ step: 0, totalSteps: 4, message: "Synchronisatie starten..." })
      
      const response = await fetch("/api/goedgepickt/sync-orders?stream=true", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reset: true }),
      })

      if (!response.ok) {
        const errData = await response.json().catch(() => ({ error: "Onbekende fout" }))
        throw new Error(errData.error || "Fout bij ophalen van orders")
      }

      if (response.body) {
        const result = await readSSEStream(response, setSyncProgress)
        
        // Toon resultaat in progress panel (niet meer via alert)
        if (result) {
          const stats = result
          let detail = `${stats.imported} geïmporteerd`
          if (stats.inStock > 0) detail += `, ${stats.inStock} op voorraad`
          if (stats.excluded > 0) detail += `, ${stats.excluded} geëxcludeerd`
          if (stats.picked > 0) detail += `, ${stats.picked} al gepickt`
          if (stats.stockUnverified > 0) detail += `, ${stats.stockUnverified} stock onbekend`
          if (stats.deletedBefore > 0) detail += ` (${stats.deletedBefore} oude verwijderd)`
          setSyncProgress({ step: 4, totalSteps: 4, message: `✅ Sync voltooid`, detail })
        }
      }

      await fetchPrintJobs()
    } catch (err: any) {
      setError(err.message || "Kon orders niet ophalen uit GoedGepickt")
      console.error(err)
    } finally {
      setSyncing(false)
      setTimeout(() => setSyncProgress(null), 8000)
    }
  }

  // Bereken geschatte printtijd op basis van formaat-tags
  // 40x60 → 7/run | 60x90 → 5/run | 80x120 → 2/run | 100x150 → 2/run | 1 run = 20 min
  const PRINT_CONFIGS = [
    { keywords: ['40x60', '40 x 60'], perRun: 7 },
    { keywords: ['60x90', '60 x 90'], perRun: 5 },
    { keywords: ['80x120', '80 x 120'], perRun: 2 },
    { keywords: ['100x150', '100 x 150'], perRun: 2 },
  ]

  const calculatePrintTime = (jobs: PrintJob[]): string => {
    let totalMinutes = 0
    for (const config of PRINT_CONFIGS) {
      const count = jobs.filter(job => {
        const tags = (job.tags || '').toLowerCase()
        return config.keywords.some(kw => tags.includes(kw.toLowerCase()))
      }).length
      if (count > 0) {
        totalMinutes += Math.ceil(count / config.perRun) * 20
      }
    }
    if (totalMinutes === 0) return ''
    const hours = Math.floor(totalMinutes / 60)
    const mins = totalMinutes % 60
    if (hours === 0) return `${mins} min`
    if (mins === 0) return `${hours} uur`
    return `${hours} uur ${mins} min`
  }

  const getPrintTimeBreakdown = (jobs: PrintJob[]): string => {
    const parts: string[] = []
    for (const config of PRINT_CONFIGS) {
      const count = jobs.filter(job => {
        const tags = (job.tags || '').toLowerCase()
        return config.keywords.some(kw => tags.includes(kw.toLowerCase()))
      }).length
      if (count > 0) {
        const runs = Math.ceil(count / config.perRun)
        const mins = runs * 20
        parts.push(`${config.keywords[0]}: ${count} jobs → ${runs}x run = ${mins} min`)
      }
    }
    return parts.join(' | ')
  }

  const getFilteredJobs = () => {
    let filtered = printJobs

    // Filter by list view/tab
    if (activeTab !== "all") {
      const activeView = listViews.find(view => view.id === activeTab)
      if (activeView) {
        const viewTags = activeView.tags.split(",").filter(t => t)
        filtered = filtered.filter(job => {
          if (!job.tags) return false
          const jobTags = job.tags.split(",").filter(t => t)
          return viewTags.some(tag => jobTags.includes(tag))
        })
      }
    }

    // Sort urgent jobs first, then by receivedAt
    return [...filtered].sort((a, b) => {
      if (a.priority === "urgent" && b.priority !== "urgent") return -1
      if (a.priority !== "urgent" && b.priority === "urgent") return 1
      return new Date(a.receivedAt).getTime() - new Date(b.receivedAt).getTime()
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
    setModalImageUrl(null)
  }

  const handleResetToWaiting = async () => {
    if (!selectedJob) return
    try {
      const response = await fetch(`/api/printjobs/${selectedJob.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ printStatus: "pending", missingFile: false }),
      })
      if (!response.ok) throw new Error("Fout bij terugzetten")
      await fetchPrintJobs()
      setSelectedJob({ ...selectedJob, printStatus: "pending", missingFile: false })
    } catch (err) {
      alert("Kon printjob niet terugzetten")
      console.error(err)
    }
  }

  const handleCompleteAndNext = async () => {
    if (!selectedJob) return
    
    // Gebruik gefilterde lijst zodat we in dezelfde list view blijven
    const filteredJobs = getFilteredJobs()
    const currentIndex = filteredJobs.findIndex(job => job.id === selectedJob.id)
    
    // Update status to completed
    await updateJobStatus(selectedJob.id, "completed")
    
    // Find next job in the same filtered list
    const nextJob = filteredJobs[currentIndex + 1]
    
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

      // Fetch updated jobs and move to next in same filtered list
      const filteredJobs = getFilteredJobs()
      const currentIndex = filteredJobs.findIndex(job => job.id === selectedJob.id)
      
      await fetchPrintJobs()
      
      const nextJob = filteredJobs[currentIndex + 1]
      
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

  const fetchPickLocations = async () => {
    setPickLocationsLoading(true)
    setPickLocationsError(null)
    try {
      const res = await fetch("/api/goedgepickt/picklocations")
      if (res.ok) {
        const data = await res.json()
        const locs = data.locations || []
        if (locs.length === 0) {
          setPickLocationsError("Geen locaties gevonden in GoedGepickt. Controleer de API key in de instellingen.")
        }
        setPickLocations(locs)
      } else {
        const data = await res.json().catch(() => ({}))
        setPickLocationsError(
          res.status === 401
            ? "Sessie verlopen — log opnieuw in en probeer het opnieuw."
            : data.error || `Fout bij ophalen van locaties (HTTP ${res.status})`
        )
        setPickLocations([])
      }
    } catch {
      setPickLocationsError("Netwerkfout bij ophalen van locaties. Controleer je verbinding.")
      setPickLocations([])
    } finally {
      setPickLocationsLoading(false)
    }
  }

  const openPushToStock = async () => {
    setPushToStockOpen(true)
    setPushResult(null)
    setSelectedLocation(null)
    await fetchPickLocations()
  }

  const handlePushToStock = async () => {
    if (!selectedLocation) return
    const activeView = listViews.find((v) => v.id === activeTab)
    if (!activeView) return
    const tags = activeView.tags.split(",").filter((t) => t.trim())
    try {
      setPushing(true)
      const res = await fetch("/api/printjobs/push-to-stock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tags, locationName: selectedLocation?.name, locationUuid: selectedLocation?.uuid }),
      })
      const data = await res.json()
      setPushResult({ pushed: data.pushed || 0, failed: data.failed || 0, message: data.message || "", failedProducts: data.failedProducts || [] })
      if (data.pushed > 0) {
        await fetchPrintJobs()
      }
    } catch (err) {
      setPushResult({ pushed: 0, failed: 0, message: "Fout bij pushen naar voorraad" })
    } finally {
      setPushing(false)
    }
  }

  // Voltooide jobs in de actieve tab
  const getCompletedJobsForActiveTab = () => {
    if (activeTab === "all") return []
    const activeView = listViews.find((v) => v.id === activeTab)
    if (!activeView) return []
    const viewTags = activeView.tags.split(",").filter((t) => t)
    return printJobs.filter((job) => {
      if (job.printStatus !== "completed") return false
      if (job.missingFile) return false // Missing file jobs zijn niet geprint, niet pushen
      if (!job.tags) return false
      const jobTags = job.tags.split(",").filter((t) => t)
      return viewTags.some((tag) => jobTags.includes(tag))
    })
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

  const getStatusText = (status: string, missingFile?: boolean) => {
    if (missingFile) return "Missing File"
    switch (status) {
      case "pending": return "Wachtend"
      case "in_progress": return "Bezig"
      case "completed": return "Voltooid"
      default: return status
    }
  }

  if ((status === "loading" || loading) && !initialLoadDone) {
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
          <div className="flex items-center gap-6">
            <h1 className="text-2xl font-bold text-gray-900">Printlijst</h1>
            <nav className="flex gap-1">
              <span className="px-3 py-1.5 text-sm font-medium rounded-md bg-blue-100 text-blue-700">
                Printlijst
              </span>
              <Link
                href="/data"
                className="px-3 py-1.5 text-sm font-medium rounded-md text-gray-600 hover:text-gray-900 hover:bg-gray-100 transition-colors"
              >
                Data
              </Link>
              <Link
                href="/aftekenlijst"
                className="px-3 py-1.5 text-sm font-medium rounded-md text-gray-600 hover:text-gray-900 hover:bg-gray-100 transition-colors"
              >
                Aftekenlijst
              </Link>
            </nav>
          </div>
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
        {/* Tabs */}
        {listViews.length > 0 && (
          <div className="mb-6">
            <nav className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
              <button
                onClick={() => setActiveTab("all")}
                className={`shrink-0 px-4 py-2 rounded-full text-sm font-medium transition-all duration-150 ${
                  activeTab === "all"
                    ? "bg-blue-600 text-white shadow-sm"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
              >
                Alle ({printJobs.length})
              </button>
              {listViews.map((view) => {
                const viewTags = view.tags.split(",").filter(t => t)
                const count = printJobs.filter(job => {
                  if (!job.tags) return false
                  const jobTags = job.tags.split(",").filter(t => t)
                  return viewTags.some(tag => jobTags.includes(tag))
                }).length
                const isML = view.name.includes("ML")

                return (
                  <button
                    key={view.id}
                    onClick={() => setActiveTab(view.id)}
                    className={`shrink-0 px-4 py-2 rounded-full text-sm font-medium transition-all duration-150 ${
                      activeTab === view.id
                        ? isML
                          ? "bg-purple-600 text-white shadow-sm"
                          : "bg-blue-600 text-white shadow-sm"
                        : isML
                          ? "bg-purple-50 text-purple-700 hover:bg-purple-100 ring-1 ring-purple-200"
                          : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                    }`}
                  >
                    {view.name}
                    <span className={`ml-1.5 text-xs ${
                      activeTab === view.id
                        ? "text-white/80"
                        : isML ? "text-purple-400" : "text-gray-400"
                    }`}>
                      {count}
                    </span>
                  </button>
                )
              })}
            </nav>
          </div>
        )}

        <div className="flex justify-between items-center mb-6">
          <div>
            <h2 className="text-xl font-semibold text-gray-800">
              Actieve Printjobs ({getFilteredJobs().length})
            </h2>
            {calculatePrintTime(getFilteredJobs()) && (
              <p
                className="text-sm text-gray-500 mt-0.5"
                title={getPrintTimeBreakdown(getFilteredJobs())}
              >
                ⏱ Geschatte printtijd: <span className="font-medium text-gray-700">{calculatePrintTime(getFilteredJobs())}</span>
              </p>
            )}
          </div>
          <div className="flex gap-2">
            <button
              onClick={syncOrdersFromGoedgepickt}
              disabled={syncing}
              className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {syncing ? "⏳ Bezig..." : "📦 Orders Ophalen"}
            </button>
            <button
              onClick={refreshWithStatusSync}
              disabled={refreshing}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {refreshing ? "⏳ Statussen ophalen..." : "↻ Vernieuwen"}
            </button>
            <div className="flex items-center gap-1.5 px-3 py-2 text-xs rounded-md bg-gray-100 select-none" title={isLive ? "Real-time updates actief — elke 10 seconden" : "Verbinding verbroken"}>
              <span className={`inline-block w-2 h-2 rounded-full ${isLive ? (newOrderFlash ? "bg-green-400 animate-ping" : "bg-green-500") : "bg-red-400"}`} />
              <span className={`font-medium ${isLive ? "text-green-700" : "text-red-600"}`}>
                {isLive ? "Live" : "Offline"}
              </span>
            </div>
            {activeTab !== "all" && getCompletedJobsForActiveTab().length > 0 && (
              <button
                onClick={openPushToStock}
                className="px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-purple-500"
              >
                📦 Push to Stock ({getCompletedJobsForActiveTab().length})
              </button>
            )}
          </div>
        </div>

        {/* Sync Progress Panel */}
        {(syncProgress || refreshProgress) && (
          <div className="mb-4 bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
            <div className="flex items-center gap-3 mb-3">
              {(syncing || refreshing) ? (
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600" />
              ) : (
                <div className="w-5 h-5 bg-green-500 rounded-full flex items-center justify-center text-white text-xs">✓</div>
              )}
              <h3 className="font-semibold text-gray-800 text-sm">
                {syncing ? "Bezig met synchroniseren..." : refreshing ? "Bezig met vernieuwen..." : "Voltooid"}
              </h3>
            </div>

            {(() => {
              const progress = syncProgress || refreshProgress
              if (!progress) return null
              return (
                <div>
                  <div className="flex justify-between text-xs text-gray-600 mb-1">
                    <span>{progress.message}</span>
                    <span>Stap {progress.step}/{progress.totalSteps}</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2.5">
                    <div
                      className="bg-blue-600 h-2.5 rounded-full transition-all duration-500 ease-out"
                      style={{ width: `${Math.max(5, (progress.step / progress.totalSteps) * 100)}%` }}
                    />
                  </div>
                  {progress.detail && (
                    <p className="text-xs text-gray-500 mt-1">{progress.detail}</p>
                  )}

                  {/* Stappen overzicht voor Orders Ophalen */}
                  {syncing && syncProgress && (
                    <div className="grid grid-cols-4 gap-2 mt-3">
                      {["Opschonen", "Orders ophalen", "Verwerken", "Opslaan"].map((label, i) => {
                        const stepNum = i + 1
                        const isDone = syncProgress.step > stepNum || (syncProgress.step === syncProgress.totalSteps && syncProgress.message.includes("✅"))
                        const isActive = syncProgress.step === stepNum
                        return (
                          <div key={i} className={`text-center py-1.5 px-1 rounded text-xs font-medium ${
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

                  {/* Stappen overzicht voor Vernieuwen */}
                  {refreshing && refreshProgress && (
                    <div className="grid grid-cols-3 gap-2 mt-3">
                      {["Statussen", "Nieuwe orders", "Afronden"].map((label, i) => {
                        const stepNum = i + 1
                        const isDone = refreshProgress.step > stepNum || (refreshProgress.step === refreshProgress.totalSteps && refreshProgress.message.includes("✅"))
                        const isActive = refreshProgress.step === stepNum || (refreshProgress.step > i && refreshProgress.step <= stepNum)
                        return (
                          <div key={i} className={`text-center py-1.5 px-1 rounded text-xs font-medium ${
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
                </div>
              )
            })()}
          </div>
        )}

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
              const isUrgent = job.priority === "urgent"
              const cardColor = job.missingFile 
                ? "bg-red-50 border-2 border-red-200" 
                : job.printStatus === "completed"
                ? "bg-green-50 border-2 border-green-200"
                : isUrgent
                ? "bg-red-50 border-l-4 border-l-red-500 border border-red-200"
                : "bg-white"
              
              return (
                <div
                  key={job.id}
                  onClick={() => openJobDetails(job)}
                  className={`${cardColor} rounded-lg shadow p-6 hover:shadow-lg transition-shadow cursor-pointer`}
                >
                <div className="flex justify-between items-start mb-4">
                  <div className="flex gap-3 flex-1">
                    {job.imageUrl && (
                      <img
                        src={job.imageUrl}
                        alt={job.productName}
                        className="w-14 h-14 object-contain rounded-lg border border-gray-200 bg-white flex-shrink-0 mt-0.5"
                      />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="text-lg font-semibold text-gray-900">
                          Order #{job.orderNumber}
                        </h3>
                        {job.priority === "urgent" && (
                          <span className="px-3 py-1 rounded-full text-xs font-bold bg-red-600 text-white animate-pulse">
                            URGENT
                          </span>
                        )}
                      </div>
                      <p className="text-gray-700 mb-1 truncate">
                        <span className="font-medium">Product:</span> {job.productName}
                      </p>
                      <p className="text-gray-600 text-sm">
                        <span className="font-medium">Aantal:</span> {job.quantity}
                      </p>
                      <p className="text-gray-500 text-xs mt-2">
                        Ontvangen: {new Date(job.receivedAt).toLocaleString("nl-NL")}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-col gap-2 ml-4">
                    <span className={`px-3 py-1 rounded-md text-xs font-medium text-center ${
                      job.missingFile
                        ? "bg-red-100 text-red-800"
                        : job.printStatus === "in_progress"
                        ? "bg-yellow-100 text-yellow-800"
                        : job.printStatus === "completed"
                        ? "bg-green-100 text-green-800"
                        : "bg-gray-100 text-gray-800"
                    }`}>
                      {getStatusText(job.printStatus, job.missingFile)}
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
            <div className={`rounded-lg shadow-xl max-w-2xl w-full p-8 ${selectedJob.missingFile ? "bg-red-50 border-4 border-red-400" : selectedJob.printStatus === "completed" ? "bg-green-50 border-4 border-green-400" : "bg-white"}`}>
              <div className="flex justify-between items-start mb-4">
                <div className="flex items-center gap-3">
                  <h2 className="text-xl font-bold text-gray-900">
                    Order #{selectedJob.orderNumber}
                  </h2>
                  <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wide ${
                    selectedJob.missingFile
                      ? "bg-red-100 text-red-800 border border-red-300"
                      : selectedJob.printStatus === "completed"
                      ? "bg-green-100 text-green-800 border border-green-300"
                      : selectedJob.printStatus === "in_progress"
                      ? "bg-yellow-100 text-yellow-800 border border-yellow-300"
                      : "bg-gray-100 text-gray-700 border border-gray-300"
                  }`}>
                    {selectedJob.missingFile ? "⚠ Missing File" : selectedJob.printStatus === "completed" ? "✓ Voltooid" : selectedJob.printStatus === "in_progress" ? "Bezig" : "Wachtend"}
                  </span>
                </div>
                <button
                  onClick={closeJobDetails}
                  className="text-gray-400 hover:text-gray-600 text-2xl leading-none"
                >
                  ×
                </button>
              </div>

              <div className="mb-6">
                <div className="flex gap-4 items-start">
                  {modalImageUrl && (
                    <img
                      src={modalImageUrl}
                      alt={selectedJob.productName}
                      className="w-20 h-20 object-contain rounded-lg border border-gray-200 flex-shrink-0 bg-white"
                    />
                  )}
                  <div>
                    <p className="text-gray-700 mb-2">
                      <span className="font-medium">Product:</span> {selectedJob.productName}
                    </p>
                    <p className="text-gray-600 mb-4">
                      <span className="font-medium">Aantal:</span> {selectedJob.quantity}
                    </p>
                  </div>
                </div>
              </div>

              {selectedJob.backfile ? (
                <div className="mb-6">
                  <p className="text-sm font-medium text-gray-700 mb-3">Backfile:</p>
                  <div className="bg-white border-2 border-gray-200 rounded-lg p-6 flex flex-col items-center overflow-hidden gap-3">
                    <canvas ref={backfileCanvasRef} className="max-w-full h-auto"></canvas>
                    <p
                      className="text-sm font-mono text-gray-700 cursor-pointer select-all bg-gray-50 px-3 py-1 rounded border border-gray-200 hover:bg-gray-100"
                      title="Klik om te selecteren"
                    >
                      {selectedJob.backfile}
                    </p>
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
                  <div className="bg-white border-2 border-gray-200 rounded-lg p-6 flex flex-col items-center overflow-hidden gap-3">
                    <canvas ref={skuCanvasRef} className="max-w-full h-auto"></canvas>
                    <p
                      className="text-sm font-mono text-gray-700 cursor-pointer select-all bg-gray-50 px-3 py-1 rounded border border-gray-200 hover:bg-gray-100"
                      title="Klik om te selecteren"
                    >
                      {selectedJob.sku}.rtl
                    </p>
                  </div>
                </div>
              ) : (
                <div className="mb-6 p-4 bg-gray-100 rounded-lg text-center text-gray-500 text-sm">
                  Geen SKU beschikbaar
                </div>
              )}

              <div className="flex items-center justify-between mt-6">
                {(selectedJob.printStatus === "completed" || selectedJob.missingFile) ? (
                  <button
                    onClick={handleResetToWaiting}
                    className="px-5 py-3 bg-gray-500 text-white rounded-md hover:bg-gray-600 font-medium flex items-center gap-2"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                    </svg>
                    Terugzetten
                  </button>
                ) : (
                  <div></div>
                )}
                <div className="flex items-center gap-3">
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
          </div>
        )}
      </main>

      {/* Push to Stock modal */}
      {pushToStockOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-8">
            <div className="flex justify-between items-start mb-6">
              <h2 className="text-xl font-bold text-gray-900">📦 Push to Stock</h2>
              <button
                onClick={() => setPushToStockOpen(false)}
                className="text-gray-400 hover:text-gray-600 text-2xl leading-none"
              >
                ×
              </button>
            </div>

            {pushResult ? (
              <div className="text-center">
                <div className={`text-5xl mb-4 ${pushResult.failed > 0 ? "text-yellow-500" : "text-green-500"}`}>
                  {pushResult.failed > 0 ? "⚠️" : "✅"}
                </div>
                <p className="text-gray-800 font-medium mb-2">{pushResult.message}</p>
                {pushResult.failedProducts && pushResult.failedProducts.length > 0 && (
                  <div className="text-sm text-left bg-red-50 border border-red-200 rounded-lg p-3 mb-4">
                    <p className="font-semibold text-red-700 mb-2">Mislukt:</p>
                    {pushResult.failedProducts.map((f, i) => (
                      <div key={i} className="mb-1">
                        <span className="font-medium text-red-800">{f.name}</span>
                        <br />
                        <span className="text-red-600 text-xs">{f.error}</span>
                      </div>
                    ))}
                  </div>
                )}
                <button
                  onClick={() => setPushToStockOpen(false)}
                  className="px-6 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700"
                >
                  Sluiten
                </button>
              </div>
            ) : (
              <>
                <div className="mb-6 p-4 bg-purple-50 rounded-lg border border-purple-200">
                  <p className="text-sm text-purple-800">
                    <span className="font-semibold">{getCompletedJobsForActiveTab().length} voltooide job(s)</span>{" "}
                    van tab{" "}
                    <span className="font-semibold">
                      {listViews.find((v) => v.id === activeTab)?.name}
                    </span>{" "}
                    worden naar GoedGepickt voorraad gepusht en verdwijnen daarna uit de lijst.
                  </p>
                </div>

                <div className="mb-6">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Voorraadlocatie
                  </label>
                  {pickLocationsLoading ? (
                    <div className="flex items-center gap-2 text-sm text-gray-500 py-2">
                      <div className="w-4 h-4 border-2 border-gray-300 border-t-purple-600 rounded-full animate-spin" />
                      Locaties ophalen uit GoedGepickt...
                    </div>
                  ) : pickLocationsError ? (
                    <div className="rounded-md bg-red-50 border border-red-200 p-3">
                      <p className="text-sm text-red-700 mb-2">{pickLocationsError}</p>
                      <button
                        type="button"
                        onClick={fetchPickLocations}
                        className="text-sm font-medium text-red-700 underline hover:text-red-900"
                      >
                        Opnieuw proberen
                      </button>
                    </div>
                  ) : pickLocations.length > 0 ? (
                    <div className="border border-gray-300 rounded-md overflow-y-auto max-h-52">
                      {pickLocations.map((loc) => (
                        <button
                          key={loc.uuid}
                          type="button"
                          onClick={() => setSelectedLocation({ uuid: loc.uuid, name: loc.name })}
                          className={`w-full text-left px-3 py-2 text-sm transition-colors ${
                            selectedLocation?.uuid === loc.uuid
                              ? "bg-purple-600 text-white"
                              : "text-gray-900 hover:bg-gray-100"
                          }`}
                        >
                          {loc.name}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>

                <div className="flex gap-3 justify-end">
                  <button
                    onClick={() => setPushToStockOpen(false)}
                    className="px-5 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50"
                  >
                    Annuleren
                  </button>
                  <button
                    onClick={handlePushToStock}
                    disabled={!selectedLocation?.name || pushing}
                    className="px-5 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                  >
                    {pushing ? "⏳ Bezig met pushen..." : "📦 Push naar voorraad"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
