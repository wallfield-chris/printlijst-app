import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { GoedGepicktAPI } from "@/lib/goedgepickt"

/**
 * POST /api/goedgepickt/sync-orders
 * Synchroniseer orders uit GoedGepickt op basis van condition rules.
 * 
 * Body params:
 *  - reset: boolean  (optioneel) — verwijdert alle pending printjobs voor een schone sync
 * 
 * Query params:
 *  - stream: "true" — gebruik SSE streaming voor real-time voortgang
 */
export async function POST(request: NextRequest) {
  const url = new URL(request.url)
  const useStream = url.searchParams.get("stream") === "true"

  // Parse body VOOR de stream (body kan maar 1x gelezen worden)
  let resetMode = false
  try {
    const body = await request.json()
    resetMode = body?.reset === true
  } catch {
    // Geen body = gewone sync
  }

  if (useStream) {
    return handleStreamingSync(request, resetMode)
  }

  return handleJsonSync(request, resetMode)
}

async function handleStreamingSync(request: NextRequest, resetMode: boolean) {
  const session = await auth()
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: Record<string, any>) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
        } catch { /* stream closed */ }
      }

      try {
        await runSyncLogic(resetMode, send)
      } catch (error) {
        send({ type: "error", message: `Fout: ${error instanceof Error ? error.message : String(error)}` })
      } finally {
        controller.close()
      }
    }
  })

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    },
  })
}

async function handleJsonSync(request: NextRequest, resetMode: boolean) {
  try {
    const session = await auth()
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const result = await runSyncLogic(resetMode) as any
    if (result.error) {
      return NextResponse.json({ error: result.error, debug: result.debug }, { status: result.status || 500 })
    }
    return NextResponse.json(result)
  } catch (error: any) {
    console.error("❌ Sync error:", error)
    return NextResponse.json({ error: error.message || "Error syncing orders" }, { status: 500 })
  }
}

type SendFn = (data: Record<string, any>) => void
const noopSend: SendFn = () => {}

async function runSyncLogic(resetMode: boolean, send: SendFn = noopSend) {
  send({ type: "start", step: 0, totalSteps: 5, message: "Synchronisatie voorbereiden..." })

  // === Setup: API key + rules ===
  const apiKeySetting = await prisma.setting.findUnique({
    where: { key: "goedgepickt_api_key" },
  })
  if (!apiKeySetting?.value) {
    return { error: "GoedGepickt API key not configured", status: 400 }
  }

  const [conditionRules, tagRules, priorityRules, exclusionRules] = await Promise.all([
    prisma.conditionRule.findMany({ where: { active: true } }),
    prisma.tagRule.findMany({ where: { active: true } }),
    prisma.priorityRule.findMany({ where: { active: true } }),
    prisma.exclusionRule.findMany({ where: { active: true } }),
  ])

  if (conditionRules.length === 0) {
    return { error: "No active condition rules found", status: 400 }
  }

  const backorderRule = conditionRules.find(
    (r) => r.field === "orderStatus" && r.value === "backorder"
  )
  if (!backorderRule) {
    return { error: "No backorder condition rule found", status: 400 }
  }

  // === Reset mode: verwijder alle pending jobs ===
  let deletedCount = 0
  if (resetMode) {
    send({ type: "progress", step: 1, totalSteps: 5, message: "Bestaande jobs verwijderen..." })
    const result = await prisma.printJob.deleteMany({
      where: { printStatus: "pending" },
    })
      deletedCount = result.count
      console.log(`🗑️  Reset mode: ${deletedCount} pending printjobs verwijderd`)
      send({ type: "progress", step: 1, totalSteps: 5, message: `${deletedCount} bestaande jobs verwijderd` })
    }

    // === Reset stock_covered → pending zodat we opnieuw kunnen evalueren ===
    const resetCoveredResult = await prisma.printJob.updateMany({
      where: { printStatus: "stock_covered" },
      data: { printStatus: "pending" },
    })
    if (resetCoveredResult.count > 0) {
      console.log(`🔄 ${resetCoveredResult.count} stock_covered printjobs teruggezet naar pending voor herevaluatie`)
    }

    // === Haal orders op uit GoedGepickt ===
    const api = new GoedGepicktAPI(apiKeySetting.value)
    
    // Bij reset: laatste 90 dagen (ouder dan 90 dagen zijn vrijwel nooit nog backorder)
    // Bij normale sync: laatste 30 dagen
    const daysBack = resetMode ? 90 : 30
    const createdAfter = new Date()
    createdAfter.setDate(createdAfter.getDate() - daysBack)
    const createdAfterStr = `${createdAfter.getFullYear()}-${String(createdAfter.getMonth() + 1).padStart(2, "0")}-${String(createdAfter.getDate()).padStart(2, "0")}`
    
    console.log(`📅 Fetching orders created after ${createdAfterStr} (${resetMode ? "RESET" : "incremental"})`)
      
    // Stap 2: Haal eerste pagina op
    send({ type: "progress", step: 2, totalSteps: 5, message: "GoedGepickt orders ophalen...", detail: "Pagina 1 ophalen..." })
    console.log(`🔗 Calling getOrders with: orderstatus=backorder, createdAfter=${createdAfterStr}, page=1`)
    let firstPageOrders: any[]
    try {
      firstPageOrders = await api.getOrders({ orderstatus: "backorder", createdAfter: createdAfterStr, page: 1 })
      console.log(`📄 Eerste pagina: ${firstPageOrders.length} orders ontvangen`)
    } catch (fetchErr: any) {
      console.error(`❌ Fout bij ophalen eerste pagina:`, fetchErr)
      send({ type: "error", message: `GoedGepickt API fout: ${fetchErr.message}` })
      return { 
        error: `GoedGepickt API fout: ${fetchErr.message}`,
        debug: { resetMode, deletedBefore: deletedCount, createdAfter: createdAfterStr },
        status: 500
      }
    }
    const paginationInfo = api.lastPaginationInfo
    const totalPages = paginationInfo?.lastPage || 1
    
    console.log(`📊 Found ${paginationInfo?.totalItems || firstPageOrders.length} orders across ${totalPages} pages`)
    send({ type: "progress", step: 2, totalSteps: 5, message: "GoedGepickt orders ophalen...", detail: `Pagina 1 van ~${totalPages}` })

    // Haal alle pagina's op in PARALLELLE batches (5 tegelijk) i.p.v. sequentieel
    const BATCH_SIZE = 5
    const allOrders: any[] = [...firstPageOrders]
    const remainingPages: number[] = []
    for (let p = 2; p <= totalPages; p++) remainingPages.push(p)

    for (let i = 0; i < remainingPages.length; i += BATCH_SIZE) {
      const batch = remainingPages.slice(i, i + BATCH_SIZE)
      const fetched = i + batch.length
      send({
        type: "progress", step: 2, totalSteps: 5,
        message: "GoedGepickt orders ophalen...",
        detail: `Pagina ${fetched} van ~${totalPages}`,
      })
      const batchResults = await Promise.all(
        batch.map(page =>
          api.getOrders({ orderstatus: "backorder", createdAfter: createdAfterStr, page }).catch(() => [])
        )
      )
      for (const pageOrders of batchResults) {
        if (pageOrders.length > 0) allOrders.push(...pageOrders)
      }
      // Korte pauze om GoedGepickt rate limit (150 req/min) te respecteren
      if (i + BATCH_SIZE < remainingPages.length) {
        await new Promise(r => setTimeout(r, 400))
      }
    }

    // Stap 3: Filter op echte backorder status
    const orders = allOrders.filter(o => o.status === "backorder")
    console.log(`🔍 ${allOrders.length} opgehaald, ${orders.length} zijn echte backorders`)
    send({ type: "progress", step: 3, totalSteps: 5, message: "Orders verwerken...", detail: `${orders.length} backorders gevonden` })

    // === Dedup lookup: bestaande actieve jobs (inclusief stock_covered om re-import te voorkomen) ===
    // BELANGRIJK: alleen 'pushed' jobs mogen opnieuw in de wachtrij gezet worden.
    // 'completed' jobs (geprint maar nog NIET gepusht) worden NOOIT gereset — die moeten
    // eerst naar voorraad gepusht worden.
    const existingJobKeys = new Set<string>()
    const pushedJobMap = new Map<string, string>() // key → job id (alleen pushed — NIET completed!)
    if (!resetMode) {
      const existingJobs = await prisma.printJob.findMany({
        where: { printStatus: { in: ["pending", "in_progress", "stock_covered", "completed", "pushed"] } },
        select: { id: true, orderUuid: true, productUuid: true, sku: true, productName: true, printStatus: true },
      })
      for (const job of existingJobs) {
        const isPushed = job.printStatus === "pushed"
        if (job.orderUuid && job.productUuid) {
          const key = `${job.orderUuid}::${job.productUuid}`
          existingJobKeys.add(key)
          if (isPushed) pushedJobMap.set(key, job.id)
        }
        if (job.orderUuid && job.sku) {
          const key = `${job.orderUuid}::sku::${job.sku}`
          existingJobKeys.add(key)
          if (isPushed) pushedJobMap.set(key, job.id)
        }
        if (job.orderUuid && job.productName) {
          const key = `${job.orderUuid}::name::${job.productName}`
          existingJobKeys.add(key)
          if (isPushed) pushedJobMap.set(key, job.id)
        }
      }
    }

    // === Product detail cache (voorkomt dubbele API calls) ===
    const productCache = new Map<string, any>()
    const API_DELAY_MS = 400 // delay tussen product API calls om rate limiting te voorkomen
    
    async function getProductCached(productUuid: string): Promise<any> {
      if (productCache.has(productUuid)) return productCache.get(productUuid)
      
      // Retry logic: max 5 pogingen met exponential backoff
      for (let attempt = 1; attempt <= 5; attempt++) {
        try {
          const delay = attempt === 1 ? API_DELAY_MS : API_DELAY_MS * Math.pow(2, attempt - 1)
          await new Promise(r => setTimeout(r, delay))
          
          const details = await api.getProduct(productUuid)
          if (details) {
            productCache.set(productUuid, details)
            return details
          }
          
          if (attempt < 5) {
            console.log(`⏳ Product ${productUuid} poging ${attempt}/5 mislukt, retry in ${delay}ms...`)
          }
        } catch (err) {
          if (attempt < 5) {
            console.log(`⏳ Product fetch error poging ${attempt}/5, retry...`)
          }
        }
      }
      
      console.log(`❌ Product ${productUuid} niet opgehaald na 5 pogingen`)
      return null
    }

    /**
     * Pre-fetch alle product details voor een set van productUuids.
     * Retried mislukte producten in meerdere rondes totdat alles opgehaald is.
     */
    async function prefetchProducts(productUuids: string[], label: string) {
      const toFetch = productUuids.filter(uuid => !productCache.has(uuid))
      if (toFetch.length === 0) return
      
      console.log(`📦 [${label}] Pre-fetching ${toFetch.length} producten...`)
      
      // Ronde 1: haal alle producten op
      const failed: string[] = []
      for (const uuid of toFetch) {
        const result = await getProductCached(uuid)
        if (!result) failed.push(uuid)
      }
      
      // Ronde 2: retry alleen de mislukte producten met langere delays
      if (failed.length > 0) {
        console.log(`⏳ [${label}] ${failed.length} producten mislukt, wacht 3s en retry...`)
        await new Promise(r => setTimeout(r, 3000))
        
        const stillFailed: string[] = []
        for (const uuid of failed) {
          // Force retry: verwijder uit cache zodat getProductCached opnieuw probeert
          const result = await getProductCached(uuid)
          if (!result) stillFailed.push(uuid)
        }
        
        if (stillFailed.length > 0) {
          console.log(`⚠️ [${label}] ${stillFailed.length} producten definitief niet opgehaald: ${stillFailed.join(', ')}`)
        }
      }
      
      console.log(`✅ [${label}] ${productCache.size} producten in cache`)
    }

    // === Voorraad-allocatie wordt NA de import gedaan (stap 5) ===
    // Eerst alle orders importeren, daarna DB-based stock allocatie
    send({ type: "progress", step: 3, totalSteps: 5, message: "Orders verwerken...", detail: `${orders.length} backorders gevonden` })

    // === Verwerk orders ===
    let totalImported = 0
    let totalDuplicates = 0
    let totalExcluded = 0
    let totalPicked = 0
    let totalRequeued = 0
    const requeuedJobIds = new Set<string>()
    const errors: { orderUuid: string; error: string }[] = []

    for (let orderIdx = 0; orderIdx < orders.length; orderIdx++) {
      const order = orders[orderIdx]
      // Elke 5 orders een progress update
      if (orderIdx % 5 === 0) {
        send({ type: "progress", step: 4, totalSteps: 5, message: "Orders verwerken...", detail: `Order ${orderIdx + 1} van ${orders.length} (${totalImported} geïmporteerd)` })
      }
      try {
        if (!order.products || order.products.length === 0) continue

        for (const product of order.products) {
          // Skip parent products
          if (product.type === "parent") continue

          // === Dedup check (inclusief productName als fallback) ===
          const dupKey1 = product.productUuid ? `${order.uuid}::${product.productUuid}` : null
          const dupKey2 = product.sku ? `${order.uuid}::sku::${product.sku}` : null
          const dupKey3 = `${order.uuid}::name::${product.productName || 'unknown'}`
          const matchedKey = (dupKey1 && existingJobKeys.has(dupKey1)) ? dupKey1
            : (dupKey2 && existingJobKeys.has(dupKey2)) ? dupKey2
            : existingJobKeys.has(dupKey3) ? dupKey3 : null

          if (matchedKey) {
            // Alleen PUSHED jobs mogen opnieuw in de wachtrij — completed (geprint, niet gepusht) nooit aanraken.
            const pushedJobId = pushedJobMap.get(matchedKey)
            if (pushedJobId && !requeuedJobIds.has(pushedJobId)) {
              // Job was al gepusht naar voorraad maar order staat nog steeds backorder → opnieuw printen
              await prisma.printJob.update({
                where: { id: pushedJobId },
                data: {
                  printStatus: "pending",
                  completedAt: null,
                  completedBy: null,
                  startedAt: null,
                  orderStatus: order.status,
                  backorder: true,
                },
              })
              requeuedJobIds.add(pushedJobId)
              totalRequeued++
              console.log(`🔄 Job ${pushedJobId} gereset naar pending (order ${order.externalDisplayId || order.uuid} opnieuw backorder na push)`)
            } else {
              totalDuplicates++
            }
            continue
          }

          // === Exclusion rules ===
          let isExcluded = false
          for (const rule of exclusionRules) {
            let val = ""
            if (rule.field === "sku") val = product.sku || ""
            else if (rule.field === "orderNumber") val = order.orderNumber || ""
            else if (rule.field === "customerName") val = order.customerName || order.customer?.name || ""
            else if (rule.field === "orderStatus") val = order.status || ""
            if (checkCondition(val, rule.condition, rule.value)) { isExcluded = true; break }
          }
          if (isExcluded) { totalExcluded++; continue }

          // === Al gepickt? ===
          if (product.pickedQuantity && product.pickedQuantity >= (product.productQuantity || 1)) {
            totalPicked++
            continue
          }

          // === Product details ophalen ===
          let supplierSku: string | null = null
          let imageUrl: string | null = null
          
          if (product.productUuid) {
            const details = await getProductCached(product.productUuid)
            if (details) {
              // Supplier SKU
              supplierSku = details.supplier?.supplierSku || (details as any).supplierSku || null

              // Afbeelding
              if (details.picture && !details.picture.includes("image_placeholder")) {
                imageUrl = details.picture
              }
            }
          }

          // === Tags ===
          const appliedTags: string[] = []
          const orderTagsArr = (order.tags && Array.isArray(order.tags))
            ? order.tags.filter((t: any) => typeof t === "string")
            : []
          appliedTags.push(...orderTagsArr)
          
          for (const rule of tagRules) {
            let val = ""
            if (rule.field === "sku") val = product.sku || ""
            else if (rule.field === "orderStatus") val = order.status || ""
            if (checkCondition(val, rule.condition, rule.value) && !appliedTags.includes(rule.tag)) {
              appliedTags.push(rule.tag)
            }
          }

          // === Priority ===
          let priority = "normal"
          for (const rule of priorityRules) {
            const productsToCheck = rule.scope === "order" ? (order.products || []) : [product]
            for (const p of productsToCheck) {
              let val = ""
              if (rule.field === "sku") val = p.sku || ""
              else if (rule.field === "orderStatus") val = order.status || ""
              else if (rule.field === "customerName") val = order.customerName || order.customer?.name || ""
              if (checkCondition(val, rule.condition, rule.value)) { priority = rule.priority; break }
            }
            if (priority !== "normal") break
          }

          // === Maak printjob ===
          const orderDate = order.createDate ? new Date(order.createDate) : new Date()
          // SKU 1041 = custom schilderij → bestand moet nog gemaakt worden
          const isCustomFile = product.sku?.startsWith("1041") || false
          await prisma.printJob.create({
            data: {
              orderUuid: order.uuid || "",
              orderNumber: order.externalDisplayId || order.orderNumber || "",
              productUuid: product.productUuid,
              productName: product.productName || "Onbekend product",
              sku: product.sku,
              backfile: supplierSku,
              imageUrl,
              quantity: product.productQuantity || 1,
              pickedQuantity: product.pickedQuantity || 0,
              priority,
              tags: appliedTags.length > 0 ? appliedTags.join(", ") : null,
              customerName: order.customer?.name || order.customerName,
              notes: order.notes,
              printStatus: "pending",
              orderStatus: order.status,
              backorder: order.status === "backorder",
              missingFile: isCustomFile,
              receivedAt: orderDate,
              webhookData: JSON.stringify({ order, product }, null, 2),
            },
          })

          totalImported++
          if (dupKey1) existingJobKeys.add(dupKey1)
          if (dupKey2) existingJobKeys.add(dupKey2)
          existingJobKeys.add(dupKey3)
        }
      } catch (error: any) {
        console.error(`❌ Error processing order ${order.uuid}:`, error)
        errors.push({ orderUuid: order.uuid, error: error.message })
      }
    }

    // === STAP 4b: DUPLICATEN OPRUIMEN ===
    // Verwijder dubbele printjobs:
    // 1. Als er een completed/pushed job bestaat voor dezelfde order+product → verwijder de pending/stock_covered duplicate
    // 2. Binnen pending/stock_covered: behoud oudste, verwijder nieuwere
    let duplicatesRemoved = 0
    try {
      // Stap 1: Verwijder pending/stock_covered jobs waar al een completed/pushed versie bestaat
      const completedJobKeys = new Set<string>()
      const completedJobs = await prisma.printJob.findMany({
        where: { printStatus: { in: ["completed", "pushed"] } },
        select: { orderUuid: true, productName: true, productUuid: true, sku: true },
      })
      for (const job of completedJobs) {
        completedJobKeys.add(`${job.orderUuid}::${job.productName}`)
        if (job.productUuid) completedJobKeys.add(`${job.orderUuid}::${job.productUuid}`)
        if (job.sku) completedJobKeys.add(`${job.orderUuid}::sku::${job.sku}`)
      }

      const pendingJobs = await prisma.printJob.findMany({
        where: { printStatus: { in: ["pending", "stock_covered"] } },
        select: { id: true, orderUuid: true, productUuid: true, sku: true, productName: true, receivedAt: true },
        orderBy: { receivedAt: "asc" },
      })

      const duplicateIds: string[] = []

      // Verwijder pending/stock_covered die al als completed/pushed bestaat
      for (const job of pendingJobs) {
        const matchesCompleted =
          completedJobKeys.has(`${job.orderUuid}::${job.productName}`) ||
          (job.productUuid && completedJobKeys.has(`${job.orderUuid}::${job.productUuid}`)) ||
          (job.sku && completedJobKeys.has(`${job.orderUuid}::sku::${job.sku}`))
        if (matchesCompleted) {
          duplicateIds.push(job.id)
        }
      }

      // Stap 2: Binnen remaining pending/stock_covered: verwijder dubbelen (behoud oudste)
      const remainingPending = pendingJobs.filter(j => !duplicateIds.includes(j.id))
      const seenKeys = new Map<string, string>()
      for (const job of remainingPending) {
        const key = `${job.orderUuid}::${job.productName}`
        if (seenKeys.has(key)) {
          duplicateIds.push(job.id)
        } else {
          seenKeys.set(key, job.id)
        }
      }

      if (duplicateIds.length > 0) {
        const result = await prisma.printJob.deleteMany({
          where: { id: { in: duplicateIds } },
        })
        duplicatesRemoved = result.count
        console.log(`🧹 ${duplicatesRemoved} dubbele printjobs verwijderd`)
        send({ type: "progress", step: 4, totalSteps: 5, message: `${duplicatesRemoved} duplicaten opgeruimd`, detail: "" })
      }
    } catch (err) {
      console.error(`⚠️ Duplicaten opruimen gefaald:`, err)
    }

    // === STAP 5: DB-BASED VOORRAAD-ALLOCATIE ===
    // Nu alle orders geïmporteerd zijn, evalueer voorraad op basis van DB state.
    // Per productUuid: haal totalStock op, sorteer jobs op datum (oudste eerst),
    // markeer de oudste `totalStock` jobs als stock_covered.
    send({ type: "progress", step: 5, totalSteps: 5, message: "Voorraad-allocatie berekenen...", detail: "Voorraad controleren" })
    
    let totalInStock = 0
    let stockCheckedProducts = 0

    // Haal alle pending/in_progress printjobs op, gegroepeerd per productUuid
    const allActiveJobs = await prisma.printJob.findMany({
      where: {
        productUuid: { not: null },
        printStatus: { in: ["pending", "in_progress"] },
      },
      select: { id: true, productUuid: true, receivedAt: true, printStatus: true, sku: true, productName: true, orderUuid: true },
      orderBy: { receivedAt: "asc" }, // oudste eerst
    })

    // Groepeer per productUuid
    const jobsByProduct = new Map<string, typeof allActiveJobs>()
    for (const job of allActiveJobs) {
      if (!job.productUuid) continue
      if (!jobsByProduct.has(job.productUuid)) jobsByProduct.set(job.productUuid, [])
      jobsByProduct.get(job.productUuid)!.push(job)
    }

    console.log(`📊 Voorraad-check: ${jobsByProduct.size} unieke producten met actieve printjobs`)

    // Pre-fetch ALLE product details voordat we alloceren (voorkomt rate limiting issues)
    await prefetchProducts(Array.from(jobsByProduct.keys()), 'voorraad-allocatie')
    send({ type: "progress", step: 5, totalSteps: 5, message: "Voorraad-allocatie berekenen...", detail: `${productCache.size} producten opgehaald` })

    for (const [productUuid, jobs] of jobsByProduct) {
      const product = productCache.get(productUuid)
      if (!product) continue

      const stockInfo = GoedGepicktAPI.extractStockInfo(product)
      stockCheckedProducts++

      if (stockInfo.totalStock <= 0 && !stockInfo.unlimitedStock) continue // Geen voorraad

      // Jobs zijn al gesorteerd op receivedAt (oudste eerst)
      // De oudste `totalStock` jobs zijn gedekt door voorraad
      const stockToAllocate = stockInfo.unlimitedStock ? jobs.length : stockInfo.totalStock
      const coveredCount = Math.min(stockToAllocate, jobs.length)

      for (let i = 0; i < coveredCount; i++) {
        const job = jobs[i]
        if (job.printStatus === "in_progress") continue // in_progress niet aanpassen
        
        await prisma.printJob.update({
          where: { id: job.id },
          data: { printStatus: "stock_covered" },
        })
        totalInStock++
        console.log(`📦 stock_covered: ${job.sku || job.productName} (order ${job.orderUuid}) — ${stockInfo.totalStock} op voorraad`)
      }
    }

    console.log(`📊 Voorraad-allocatie: ${totalInStock} printjobs gemarkeerd als stock_covered (${stockCheckedProducts} producten gecheckt)`)

    console.log(`\n✅ Sync complete: ${totalImported} imported, ${totalRequeued} requeued, ${totalDuplicates} dupes, ${totalExcluded} excluded, ${totalInStock} in-stock, ${totalPicked} picked, ${duplicatesRemoved} duplicates removed`)

    const resultData = {
      success: true,
      message: `Sync complete: ${totalImported} jobs created${totalRequeued > 0 ? `, ${totalRequeued} opnieuw in wachtrij` : ''}`,
      stats: {
        imported: totalImported,
        requeued: totalRequeued,
        duplicates: totalDuplicates,
        excluded: totalExcluded,
        inStock: totalInStock,
        picked: totalPicked,
        duplicatesRemoved,
        errors: errors.length,
        ...(resetMode ? { deletedBefore: deletedCount } : {}),
      },
      debug: {
        resetMode,
        ordersFromApi: allOrders.length,
        actualBackorders: orders.length,
        createdAfter: createdAfterStr,
        totalPages,
        productCacheSize: productCache.size,
        stockCheckedProducts,
      },
      errors: errors.length > 0 ? errors : undefined,
    }

    send({ type: "done", step: 5, totalSteps: 5, message: `${totalImported} printjobs geïmporteerd${totalRequeued > 0 ? `, ${totalRequeued} opnieuw in wachtrij` : ''}${totalInStock > 0 ? `, ${totalInStock} verborgen (voorraad)` : ''}`, result: resultData.stats })

    return resultData
}

function checkCondition(fieldValue: string, condition: string, ruleValue: string): boolean {
  const a = fieldValue.toLowerCase()
  const b = ruleValue.toLowerCase()
  switch (condition) {
    case "equals": return a === b
    case "starts_with": return a.startsWith(b)
    case "ends_with": return a.endsWith(b)
    case "contains": return a.includes(b)
    default: return false
  }
}
