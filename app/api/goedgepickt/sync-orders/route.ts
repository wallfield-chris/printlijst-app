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
  send({ type: "start", step: 0, totalSteps: 4, message: "Synchronisatie voorbereiden..." })

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
    send({ type: "progress", step: 1, totalSteps: 4, message: "Bestaande jobs verwijderen..." })
    const result = await prisma.printJob.deleteMany({
      where: { printStatus: "pending" },
    })
      deletedCount = result.count
      console.log(`🗑️  Reset mode: ${deletedCount} pending printjobs verwijderd`)
      send({ type: "progress", step: 1, totalSteps: 4, message: `${deletedCount} bestaande jobs verwijderd` })
    }

    // === Haal orders op uit GoedGepickt ===
    const api = new GoedGepicktAPI(apiKeySetting.value)
    
    // Bij reset: haal alle backorder orders op (breed datumbereik)
    // Bij normale sync: laatste 30 dagen
    const daysBack = resetMode ? 365 : 30
    const createdAfter = new Date()
    createdAfter.setDate(createdAfter.getDate() - daysBack)
    const createdAfterStr = `${createdAfter.getFullYear()}-${String(createdAfter.getMonth() + 1).padStart(2, "0")}-${String(createdAfter.getDate()).padStart(2, "0")}`
    
    console.log(`📅 Fetching orders created after ${createdAfterStr} (${resetMode ? "RESET" : "incremental"})`)
      
    // Stap 2: Haal eerste pagina op
    send({ type: "progress", step: 2, totalSteps: 4, message: "GoedGepickt orders ophalen...", detail: "Pagina 1 ophalen..." })
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
    send({ type: "progress", step: 2, totalSteps: 4, message: "GoedGepickt orders ophalen...", detail: `Pagina 1 van ~${totalPages}` })

    // Haal alle pagina's op
    const allOrders: any[] = []
    for (let page = totalPages; page >= 1; page--) {
      if (page === 1) {
        allOrders.push(...firstPageOrders)
        continue
      }
      send({ type: "progress", step: 2, totalSteps: 4, message: "GoedGepickt orders ophalen...", detail: `Pagina ${totalPages - page + 1} van ~${totalPages}` })
      try {
        const pageOrders = await api.getOrders({ orderstatus: "backorder", createdAfter: createdAfterStr, page })
        if (pageOrders.length > 0) allOrders.push(...pageOrders)
      } catch (err) {
        console.error(`⚠️ Fout bij pagina ${page}:`, err)
      }
    }

    // Stap 3: Filter op echte backorder status
    const orders = allOrders.filter(o => o.status === "backorder")
    console.log(`🔍 ${allOrders.length} opgehaald, ${orders.length} zijn echte backorders`)
    send({ type: "progress", step: 3, totalSteps: 4, message: "Orders verwerken...", detail: `${orders.length} backorders gevonden` })

    // === Dedup lookup: bestaande actieve jobs ===
    const existingJobKeys = new Set<string>()
    if (!resetMode) {
      const existingJobs = await prisma.printJob.findMany({
        where: { printStatus: { in: ["pending", "in_progress"] } },
        select: { orderUuid: true, productUuid: true, sku: true },
      })
      for (const job of existingJobs) {
        if (job.orderUuid && job.productUuid) existingJobKeys.add(`${job.orderUuid}::${job.productUuid}`)
        if (job.orderUuid && job.sku) existingJobKeys.add(`${job.orderUuid}::sku::${job.sku}`)
      }
    }

    // === Product detail cache (voorkomt dubbele API calls) ===
    const productCache = new Map<string, any>()
    async function getProductCached(productUuid: string) {
      if (productCache.has(productUuid)) return productCache.get(productUuid)
      try {
        const details = await api.getProduct(productUuid)
        productCache.set(productUuid, details)
        return details
      } catch {
        productCache.set(productUuid, null)
        return null
      }
    }

    // === Verwerk orders ===
    let totalImported = 0
    let totalDuplicates = 0
    let totalExcluded = 0
    let totalInStock = 0
    let totalPicked = 0
    const errors: { orderUuid: string; error: string }[] = []

    for (let orderIdx = 0; orderIdx < orders.length; orderIdx++) {
      const order = orders[orderIdx]
      // Elke 5 orders een progress update
      if (orderIdx % 5 === 0) {
        send({ type: "progress", step: 3, totalSteps: 4, message: "Orders verwerken...", detail: `Order ${orderIdx + 1} van ${orders.length} (${totalImported} geïmporteerd)` })
      }
      try {
        if (!order.products || order.products.length === 0) continue

        for (const product of order.products) {
          // Skip parent products
          if (product.type === "parent") continue

          // === Dedup check ===
          const dupKey1 = product.productUuid ? `${order.uuid}::${product.productUuid}` : null
          const dupKey2 = product.sku ? `${order.uuid}::sku::${product.sku}` : null
          if ((dupKey1 && existingJobKeys.has(dupKey1)) || (dupKey2 && existingJobKeys.has(dupKey2))) {
            totalDuplicates++
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

          // === Stock check + product details (1 API call, gecached) ===
          let supplierSku: string | null = null
          let imageUrl: string | null = null
          let stockVerified = false
          
          if (product.productUuid) {
            const details = await getProductCached(product.productUuid)
            if (details) {
              // Stock check: freeStock >= 0 = op voorraad → niet importeren
              const freeStock = details.stock?.freeStock ?? (details as any).freeStock ?? null
              if (freeStock !== null && freeStock >= 0) {
                totalInStock++
                continue
              }
              stockVerified = freeStock !== null

              // Supplier SKU
              supplierSku = details.supplier?.supplierSku || (details as any).supplierSku || null

              // Afbeelding
              if (details.picture && !details.picture.includes("image_placeholder")) {
                imageUrl = details.picture
              }
            }
            // Als getProduct faalt (null) of geen stock data:
            // NIET importeren → veiligheid boven alles
            if (!stockVerified) {
              totalInStock++ // tel als "overgeslagen"
              console.log(`⚠️ Stock niet te verifiëren voor ${product.sku || product.productName} → overgeslagen (veilig)`)
              continue
            }
          } else {
            // Geen productUuid = geen stock check mogelijk → skip
            console.log(`⚠️ Geen productUuid voor ${product.sku || product.productName} → overgeslagen`)
            continue
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
              receivedAt: orderDate,
              webhookData: JSON.stringify({ order, product }, null, 2),
            },
          })

          totalImported++
          if (dupKey1) existingJobKeys.add(dupKey1)
          if (dupKey2) existingJobKeys.add(dupKey2)
        }
      } catch (error: any) {
        console.error(`❌ Error processing order ${order.uuid}:`, error)
        errors.push({ orderUuid: order.uuid, error: error.message })
      }
    }

    console.log(`\n✅ Sync complete: ${totalImported} imported, ${totalDuplicates} dupes, ${totalExcluded} excluded, ${totalInStock} in-stock, ${totalPicked} picked`)

    const resultData = {
      success: true,
      message: `Sync complete: ${totalImported} jobs created`,
      stats: {
        imported: totalImported,
        duplicates: totalDuplicates,
        excluded: totalExcluded,
        inStock: totalInStock,
        picked: totalPicked,
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
      },
      errors: errors.length > 0 ? errors : undefined,
    }

    send({ type: "done", step: 4, totalSteps: 4, message: `${totalImported} printjobs geïmporteerd`, result: resultData.stats })

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
