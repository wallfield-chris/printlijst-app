"use client"

import { useState, useRef } from "react"

interface CompletedByUser {
  id: string
  name: string
  email: string
}

interface EnrichedJob {
  id: string
  orderNumber: string
  orderUuid: string | null
  productName: string
  sku: string | null
  backfile: string | null
  imageUrl: string | null
  quantity: number
  pickedQuantity: number | null
  priority: string
  tags: string | null
  printStatus: string
  orderStatus: string | null
  missingFile: boolean
  receivedAt: string
  startedAt: string | null
  completedAt: string | null
  completedByUser: CompletedByUser | null
  timeline: string
  timelineDetail: string | null
}

interface LiveProduct {
  productName: string
  sku: string | null
  productQuantity: number
  pickedQuantity: number | null
  productUuid: string | null
}

interface LiveOrder {
  uuid: string
  status: string
  orderNumber: string
  customerName: string | null
  products: LiveProduct[]
}

interface LookupResult {
  orderNumber: string
  jobs: EnrichedJob[]
  liveOrder: LiveOrder | null
}

const TIMELINE_CONFIG: Record<string, { label: string; color: string; bg: string; icon: string }> = {
  geprint_en_gepusht:  { label: "Geprint & Gepusht", color: "text-green-700",  bg: "bg-green-50 border-green-200",  icon: "✅" },
  geprint:             { label: "Geprint",            color: "text-blue-700",   bg: "bg-blue-50 border-blue-200",    icon: "🖨️" },
  missing_file:        { label: "Missing File",       color: "text-red-700",    bg: "bg-red-50 border-red-200",      icon: "⚠️" },
  overgeslagen_voorraad: { label: "Overgeslagen (voorraad)", color: "text-purple-700", bg: "bg-purple-50 border-purple-200", icon: "📦" },
  bezig:               { label: "Bezig",             color: "text-yellow-700", bg: "bg-yellow-50 border-yellow-200", icon: "⏳" },
  wachtend:            { label: "In wachtrij",        color: "text-gray-700",   bg: "bg-gray-50 border-gray-200",    icon: "🕐" },
  verouderd:           { label: "Verouderd",          color: "text-orange-700", bg: "bg-orange-50 border-orange-200",icon: "🗂️" },
  onbekend:            { label: "Onbekend",           color: "text-gray-500",   bg: "bg-gray-50 border-gray-200",    icon: "❓" },
}

const GG_STATUS_LABEL: Record<string, { label: string; color: string }> = {
  backorder:  { label: "Backorder",         color: "text-blue-700 bg-blue-100" },
  completed:  { label: "Afgerond",          color: "text-green-700 bg-green-100" },
  shipped:    { label: "Verzonden",         color: "text-green-700 bg-green-100" },
  cancelled:  { label: "Geannuleerd",       color: "text-red-700 bg-red-100" },
  processing: { label: "In behandeling",   color: "text-yellow-700 bg-yellow-100" },
  pending:    { label: "Wachtend",          color: "text-gray-700 bg-gray-100" },
}

function fmt(dateStr: string | null | undefined) {
  if (!dateStr) return "—"
  return new Date(dateStr).toLocaleString("nl-NL", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  })
}

function TagBadge({ tag }: { tag: string }) {
  return (
    <span className="px-1.5 py-0.5 text-[11px] rounded bg-gray-100 text-gray-600 border border-gray-200">
      {tag}
    </span>
  )
}

function JobCard({ job }: { job: EnrichedJob }) {
  const cfg = TIMELINE_CONFIG[job.timeline] ?? TIMELINE_CONFIG.onbekend
  const tags = job.tags ? job.tags.split(",").filter(Boolean) : []

  return (
    <div className={`border rounded-xl p-5 ${cfg.bg}`}>
      <div className="flex gap-4 items-start">
        {job.imageUrl && (
          <img
            src={job.imageUrl}
            alt={job.productName}
            className="w-16 h-16 object-contain rounded-lg border border-white bg-white flex-shrink-0"
          />
        )}

        <div className="flex-1 min-w-0">
          {/* Product naam + status badge */}
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <h3 className="font-semibold text-gray-900 text-base truncate">{job.productName}</h3>
            <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold border ${cfg.bg} ${cfg.color}`}>
              {cfg.icon} {cfg.label}
            </span>
            {job.missingFile && (
              <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-700 border border-red-200">
                ⚠ Missing File
              </span>
            )}
            {job.priority === "urgent" && (
              <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-red-600 text-white animate-pulse">
                URGENT
              </span>
            )}
          </div>

          {/* Uitleg */}
          {job.timelineDetail && (
            <p className={`text-sm mb-3 ${cfg.color}`}>{job.timelineDetail}</p>
          )}

          {/* Meta grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-1 text-sm text-gray-600 mb-3">
            {job.sku && (
              <div><span className="font-medium">SKU:</span> <span className="font-mono">{job.sku}</span></div>
            )}
            {job.backfile && (
              <div><span className="font-medium">Backfile:</span> <span className="font-mono">{job.backfile}</span></div>
            )}
            <div><span className="font-medium">Aantal:</span> {job.quantity}</div>
            {job.pickedQuantity != null && (
              <div><span className="font-medium">Gepickt:</span> {job.pickedQuantity}</div>
            )}
            {job.orderStatus && (
              <div>
                <span className="font-medium">Order status:</span>{" "}
                <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${(GG_STATUS_LABEL[job.orderStatus] ?? { color: "text-gray-700 bg-gray-100" }).color}`}>
                  {(GG_STATUS_LABEL[job.orderStatus] ?? { label: job.orderStatus }).label}
                </span>
              </div>
            )}
          </div>

          {/* Tijdlijn stippen */}
          <div className="flex flex-wrap gap-4 text-xs text-gray-500 mb-3">
            <span>📥 Ontvangen: <strong className="text-gray-700">{fmt(job.receivedAt)}</strong></span>
            {job.startedAt && <span>▶️ Gestart: <strong className="text-gray-700">{fmt(job.startedAt)}</strong></span>}
            {job.completedAt && <span>✔️ Klaar: <strong className="text-gray-700">{fmt(job.completedAt)}</strong></span>}
            {job.completedByUser && (
              <span>👤 Door: <strong className="text-gray-700">{job.completedByUser.name}</strong></span>
            )}
          </div>

          {tags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {tags.map((t) => <TagBadge key={t} tag={t} />)}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default function OrderLookupPage() {
  const [query, setQuery] = useState("")
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<LookupResult | null>(null)
  const [error, setError] = useState("")
  const inputRef = useRef<HTMLInputElement>(null)

  const handleSearch = async (e?: React.FormEvent) => {
    e?.preventDefault()
    const trimmed = query.trim()
    if (!trimmed) return

    setLoading(true)
    setError("")
    setResult(null)

    try {
      const res = await fetch(`/api/admin/order-lookup?orderNumber=${encodeURIComponent(trimmed)}`)
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(data.error || `Fout bij opzoeken (HTTP ${res.status})`)
        return
      }
      const data = await res.json()
      setResult(data)
    } catch {
      setError("Netwerkfout — controleer je verbinding")
    } finally {
      setLoading(false)
    }
  }

  const ggStatus = result?.liveOrder?.status
  const ggStatusCfg = ggStatus ? (GG_STATUS_LABEL[ggStatus] ?? { label: ggStatus, color: "text-gray-700 bg-gray-100" }) : null

  // Sorteer jobs: niet-gepushte / actieve bovenaan, daarna gepusht
  const sortedJobs = result
    ? [...result.jobs].sort((a, b) => {
        const order = ["missing_file", "bezig", "wachtend", "geprint", "overgeslagen_voorraad", "verouderd", "geprint_en_gepusht", "onbekend"]
        return order.indexOf(a.timeline) - order.indexOf(b.timeline)
      })
    : []

  const noResults = result && result.jobs.length === 0

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-1">Order Lookup</h1>
        <p className="text-gray-500 text-sm">
          Zoek op (een deel van) een ordernummer om te zien wat er met die order is gedaan.
        </p>
      </div>

      {/* Zoekbalk */}
      <form onSubmit={handleSearch} className="flex gap-3 mb-8">
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Bijv. 12345 of GP-12345"
          className="flex-1 px-4 py-3 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          autoFocus
        />
        <button
          type="submit"
          disabled={loading || !query.trim()}
          className="px-6 py-3 bg-blue-600 text-white rounded-lg font-medium text-sm hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
        >
          {loading ? (
            <>
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Zoeken...
            </>
          ) : (
            <>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35m0 0A7.5 7.5 0 104.5 4.5a7.5 7.5 0 0012.15 12.15z" />
              </svg>
              Zoeken
            </>
          )}
        </button>
      </form>

      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          {error}
        </div>
      )}

      {/* Geen resultaten */}
      {noResults && (
        <div className="bg-white border border-gray-200 rounded-xl p-8 text-center">
          <div className="text-4xl mb-3">🔍</div>
          <p className="font-medium text-gray-800 mb-1">Geen resultaten gevonden voor "{result?.orderNumber}"</p>
          <p className="text-sm text-gray-500">
            Deze order is nooit in het systeem binnengekomen, of al meer dan 120 dagen geleden verwijderd.
            Controleer of het ordernummer klopt in GoedGepickt.
          </p>
        </div>
      )}

      {/* Resultaten */}
      {result && result.jobs.length > 0 && (
        <div className="space-y-6">
          {/* Order header */}
          <div className="bg-white border border-gray-200 rounded-xl p-5">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wide font-medium mb-0.5">Ordernummer</p>
                <p className="text-xl font-bold text-gray-900">{result.orderNumber}</p>
                {result.liveOrder?.customerName && (
                  <p className="text-sm text-gray-500 mt-0.5">👤 {result.liveOrder.customerName}</p>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-3">
                {ggStatusCfg && (
                  <div className="text-right">
                    <p className="text-xs text-gray-500 mb-1">Live status (GoedGepickt)</p>
                    <span className={`px-3 py-1 rounded-full text-sm font-semibold ${ggStatusCfg.color}`}>
                      {ggStatusCfg.label}
                    </span>
                  </div>
                )}
                {!result.liveOrder && result.jobs[0]?.orderUuid && (
                  <div className="text-xs text-gray-400 italic">Live GG-status niet beschikbaar</div>
                )}
                <div className="text-right">
                  <p className="text-xs text-gray-500 mb-1">Producten in systeem</p>
                  <span className="px-3 py-1 rounded-full text-sm font-semibold bg-gray-100 text-gray-700">
                    {result.jobs.length} {result.jobs.length === 1 ? "product" : "producten"}
                  </span>
                </div>
              </div>
            </div>

            {/* Live GG producten als ze NIET in de DB staan */}
            {result.liveOrder && result.liveOrder.products.length > result.jobs.length && (
              <div className="mt-4 pt-4 border-t border-gray-100">
                <p className="text-xs font-medium text-orange-700 mb-2">
                  ⚠ GoedGepickt bevat {result.liveOrder.products.length} product(en), maar slechts {result.jobs.length} staan in dit systeem.
                  Sommige producten zijn mogelijk nooit geïmporteerd (bijv. omdat ze niet aan de conditionregels voldoen).
                </p>
                <div className="grid sm:grid-cols-2 gap-2">
                  {result.liveOrder.products
                    .filter((p) => !result.jobs.some((j) => j.sku === p.sku || j.productName === p.productName))
                    .map((p, i) => (
                      <div key={i} className="bg-orange-50 border border-orange-200 rounded-lg px-3 py-2 text-sm text-orange-800">
                        <span className="font-medium">{p.productName}</span>
                        {p.sku && <span className="ml-2 font-mono text-xs text-orange-600">{p.sku}</span>}
                        <span className="ml-2 text-orange-500">× {p.productQuantity}</span>
                        {p.pickedQuantity != null && (
                          <span className="ml-1 text-orange-500">(gepickt: {p.pickedQuantity})</span>
                        )}
                      </div>
                    ))}
                </div>
              </div>
            )}
          </div>

          {/* Per-product kaarten */}
          <div>
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Producten</h2>
            <div className="space-y-3">
              {sortedJobs.map((job) => (
                <JobCard key={job.id} job={job} />
              ))}
            </div>
          </div>

          {/* Samenvatting */}
          <div className="bg-white border border-gray-200 rounded-xl p-5">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Samenvatting</h2>
            <div className="flex flex-wrap gap-3">
              {Object.entries(
                sortedJobs.reduce((acc, job) => {
                  acc[job.timeline] = (acc[job.timeline] || 0) + 1
                  return acc
                }, {} as Record<string, number>)
              ).map(([timeline, count]) => {
                const cfg = TIMELINE_CONFIG[timeline] ?? TIMELINE_CONFIG.onbekend
                return (
                  <div key={timeline} className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm ${cfg.bg} ${cfg.color}`}>
                    <span>{cfg.icon}</span>
                    <span className="font-medium">{cfg.label}</span>
                    <span className="font-bold">{count}×</span>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* Lege toestand */}
      {!result && !loading && !error && (
        <div className="text-center text-gray-400 py-16">
          <div className="text-5xl mb-4">🔎</div>
          <p className="text-sm">Voer een ordernummer in om te zoeken</p>
        </div>
      )}
    </div>
  )
}
