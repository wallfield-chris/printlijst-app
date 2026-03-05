import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { GoedGepicktAPI } from "@/lib/goedgepickt"

/**
 * GET /api/goedgepickt/auto-sync
 * 
 * Lightweight auto-sync: haalt pagina 1 van recente backorder orders op
 * en importeert nieuwe orders die nog niet in de database zitten.
 * 
 * Server-side rate limit: max 1x per 2 minuten.
 * Wordt automatisch aangeroepen door de printjobs pagina polling.
 */

// In-memory rate limiting
let lastSyncTime = 0
let lastSyncResult: { imported: number; checked: number; skipped: number } | null = null
const SYNC_INTERVAL_MS = 2 * 60 * 1000 // 2 minuten

export async function GET(request: NextRequest) {
  const now = Date.now()
  const timeSinceLastSync = now - lastSyncTime

  // Rate limit: als laatste sync < 2 min geleden, return cached result
  if (timeSinceLastSync < SYNC_INTERVAL_MS && lastSyncResult) {
    return NextResponse.json({
      success: true,
      skipped: true,
      reason: "Rate limited",
      nextSyncIn: Math.ceil((SYNC_INTERVAL_MS - timeSinceLastSync) / 1000),
      lastResult: lastSyncResult,
    })
  }

  try {
    // Haal API key op
    const apiKeySetting = await prisma.setting.findUnique({
      where: { key: "goedgepickt_api_key" },
    })

    if (!apiKeySetting?.value) {
      return NextResponse.json({ success: false, error: "API key niet geconfigureerd" }, { status: 400 })
    }

    // Haal actieve condition rules, exclusion rules, tag rules, priority rules op
    const [conditionRules, exclusionRules, tagRules, priorityRules] = await Promise.all([
      prisma.conditionRule.findMany({ where: { active: true } }),
      prisma.exclusionRule.findMany({ where: { active: true } }),
      prisma.tagRule.findMany({ where: { active: true } }),
      prisma.priorityRule.findMany({ where: { active: true } }),
    ])

    // Check of er een backorder condition rule is
    const hasBackorderRule = conditionRules.some(
      (r) => r.field === "orderStatus" && r.value === "backorder"
    )

    if (!hasBackorderRule) {
      lastSyncTime = now
      lastSyncResult = { imported: 0, checked: 0, skipped: 0 }
      return NextResponse.json({ success: true, message: "Geen backorder rule actief", ...lastSyncResult })
    }

    const api = new GoedGepicktAPI(apiKeySetting.value)

    // Haal ALLEEN pagina 1 op (max 15 nieuwste orders) — lightweight!
    const daysBack = 30
    const createdAfter = new Date()
    createdAfter.setDate(createdAfter.getDate() - daysBack)
    const createdAfterStr = createdAfter.toISOString().split("T")[0]

    const orders = await api.getOrders({
      orderstatus: "backorder",
      createdAfter: createdAfterStr,
      page: 1,
    })

    // Filter op echte backorder status
    const backorderOrders = orders.filter((o) => o.status === "backorder")

    // Bouw een set van bestaande orderUuid+productUuid/sku combinaties
    // Inclusief stock_covered om re-import van door voorraad gedekte producten te voorkomen
    const existingJobKeys = new Set<string>()
    const existingJobs = await prisma.printJob.findMany({
      where: { printStatus: { in: ["pending", "in_progress", "stock_covered"] } },
      select: { orderUuid: true, productUuid: true, sku: true, productName: true },
    })
    for (const job of existingJobs) {
      if (job.orderUuid && job.productUuid) {
        existingJobKeys.add(`${job.orderUuid}::${job.productUuid}`)
      }
      if (job.orderUuid && job.sku) {
        existingJobKeys.add(`${job.orderUuid}::sku::${job.sku}`)
      }
      if (job.orderUuid && job.productName) {
        existingJobKeys.add(`${job.orderUuid}::name::${job.productName}`)
      }
    }

    let imported = 0
    let skipped = 0

    for (const order of backorderOrders) {
      if (!order.uuid) continue
      if (!order.products || order.products.length === 0) continue

      // Verzamel alle SKU's voor order-brede tag matching
      const allOrderSkus = order.products
        .filter((p: any) => p.sku && p.type !== "parent")
        .map((p: any) => p.sku as string)

      for (const product of order.products) {
        // Skip parent products
        if (product.type === "parent") continue

        // Skip al gepickte producten
        if (product.pickedQuantity && product.pickedQuantity >= (product.productQuantity || 1)) {
          continue
        }

        // Check of dit specifieke product al geïmporteerd is
        const dupKeyProduct = product.productUuid ? `${order.uuid}::${product.productUuid}` : null
        const dupKeySku = product.sku ? `${order.uuid}::sku::${product.sku}` : null
        const dupKeyName = `${order.uuid}::name::${product.productName || 'unknown'}`
        if ((dupKeyProduct && existingJobKeys.has(dupKeyProduct)) || (dupKeySku && existingJobKeys.has(dupKeySku)) || existingJobKeys.has(dupKeyName)) {
          skipped++
          continue
        }

        // Check exclusion rules
        let isExcluded = false
        for (const rule of exclusionRules) {
          let fieldValue = ""
          if (rule.field === "sku") fieldValue = product.sku || ""
          else if (rule.field === "orderNumber") fieldValue = order.orderNumber || order.externalDisplayId || ""
          else if (rule.field === "customerName") fieldValue = order.customerName || order.customer?.name || ""
          else if (rule.field === "orderStatus") fieldValue = order.status || ""

          if (checkCondition(fieldValue, rule.condition, rule.value)) {
            isExcluded = true
            break
          }
        }
        if (isExcluded) continue

        // Product details ophalen voor supplierSku en afbeelding
        // Voorraad-check wordt NA de import gedaan (DB-based allocatie)
        let supplierSku: string | null = null
        let imageUrl: string | null = null

        if (product.productUuid) {
          try {
            const details = await api.getProduct(product.productUuid)
            if (details) {
              // Product details voor supplierSku en afbeelding
              if (details.supplier?.supplierSku) supplierSku = details.supplier.supplierSku
              else if ((details as any).supplierSku) supplierSku = (details as any).supplierSku

              if (details.picture && !details.picture.includes("image_placeholder")) {
                imageUrl = details.picture
              }
            }
          } catch {
            console.log(`⚠️ [auto-sync] Product details ophalen mislukt voor ${product.sku || product.productName}`)
          }
        }

        // Tags
        const appliedTags: string[] = []
        // Order tags
        if (order.tags && Array.isArray(order.tags)) {
          appliedTags.push(...order.tags.filter((t: any) => typeof t === "string"))
        }
        // Tag rules (product scope)
        for (const rule of tagRules) {
          if (rule.scope === "product" || !rule.scope) {
            let fieldValue = ""
            if (rule.field === "sku") fieldValue = product.sku || ""
            else if (rule.field === "orderStatus") fieldValue = order.status || ""

            if (checkCondition(fieldValue, rule.condition, rule.value)) {
              if (!appliedTags.includes(rule.tag)) appliedTags.push(rule.tag)
            }
          }
        }
        // Tag rules (order scope) — check alle SKU's
        for (const rule of tagRules) {
          if (rule.scope === "order") {
            for (const sku of allOrderSkus) {
              let fieldValue = ""
              if (rule.field === "sku") fieldValue = sku
              else if (rule.field === "orderStatus") fieldValue = order.status || ""

              if (checkCondition(fieldValue, rule.condition, rule.value)) {
                if (!appliedTags.includes(rule.tag)) appliedTags.push(rule.tag)
                break
              }
            }
          }
        }
        const tagsString = appliedTags.length > 0 ? appliedTags.join(", ") : null

        // Priority
        let priority = "normal"
        for (const rule of priorityRules) {
          const productsToCheck = rule.scope === "order" ? (order.products || []) : [product]
          for (const p of productsToCheck) {
            let fieldValue = ""
            if (rule.field === "sku") fieldValue = p.sku || ""
            else if (rule.field === "orderStatus") fieldValue = order.status || ""
            else if (rule.field === "customerName") fieldValue = order.customerName || order.customer?.name || ""

            if (checkCondition(fieldValue, rule.condition, rule.value)) {
              priority = rule.priority
              break
            }
          }
          if (priority !== "normal") break
        }

        // Order datum
        const orderDate = (order as any).createDate ? new Date((order as any).createDate) : new Date()
        // SKU 1041 = custom schilderij → bestand moet nog gemaakt worden
        const isCustomFile = product.sku?.startsWith("1041") || false

        // Maak printjob
        await prisma.printJob.create({
          data: {
            orderUuid: order.uuid || "",
            orderNumber: (order as any).externalDisplayId || order.orderNumber || "",
            productUuid: product.productUuid,
            productName: product.productName || "Onbekend product",
            sku: product.sku ?? null,
            backfile: supplierSku,
            imageUrl,
            quantity: product.productQuantity || 1,
            pickedQuantity: product.pickedQuantity || 0,
            priority,
            tags: tagsString,
            customerName: order.customer?.name || order.customerName,
            notes: order.notes,
            printStatus: "pending",
            orderStatus: order.status,
            backorder: true,
            missingFile: isCustomFile,
            receivedAt: orderDate,
            webhookData: JSON.stringify({ order, product, autoSync: true }, null, 2),
          },
        })

        imported++

        // Registreer in lookup set
        if (dupKeyProduct) existingJobKeys.add(dupKeyProduct)
        if (dupKeySku) existingJobKeys.add(dupKeySku)
        existingJobKeys.add(dupKeyName)
      }
    }

    lastSyncTime = now
    lastSyncResult = { imported, checked: backorderOrders.length, skipped }

    if (imported > 0) {
      console.log(`🔄 Auto-sync: ${imported} nieuwe printjobs geïmporteerd (${backorderOrders.length} orders gecheckt)`)
    }

    // === DB-BASED VOORRAAD-ALLOCATIE ===
    // Na import: evalueer voorraad voor ALLE actieve printjobs.
    // Per productUuid: haal totalStock op, sorteer jobs op datum (oudste eerst),
    // markeer de oudste `totalStock` jobs als stock_covered, rest als pending.
    let stockCovered = 0
    let stockUncovered = 0
    try {
      const allActiveJobs = await prisma.printJob.findMany({
        where: {
          productUuid: { not: null },
          printStatus: { in: ["pending", "in_progress", "stock_covered"] },
        },
        select: { id: true, productUuid: true, receivedAt: true, printStatus: true, sku: true, orderUuid: true },
        orderBy: { receivedAt: "asc" },
      })

      // Groepeer per productUuid
      const jobsByProduct = new Map<string, typeof allActiveJobs>()
      for (const job of allActiveJobs) {
        if (!job.productUuid) continue
        if (!jobsByProduct.has(job.productUuid)) jobsByProduct.set(job.productUuid, [])
        jobsByProduct.get(job.productUuid)!.push(job)
      }

      for (const [productUuid, jobs] of jobsByProduct) {
        let totalStock = 0
        let unlimited = false
        
        // Robuuste product fetch: 5 retries met exponential backoff
        for (let attempt = 1; attempt <= 5; attempt++) {
          try {
            const delay = attempt === 1 ? 400 : 400 * Math.pow(2, attempt - 1)
            await new Promise(r => setTimeout(r, delay))
            
            const details = await api.getProduct(productUuid)
            if (details) {
              const stock = (details as any).stock || {}
              totalStock = stock.totalStock ?? 0
              unlimited = stock.unlimitedStock ?? false
              break // success
            }
            
            if (attempt < 5) {
              console.log(`⏳ [auto-sync] Product ${productUuid} poging ${attempt}/5 mislukt, retry...`)
            }
          } catch {
            if (attempt === 5) {
              console.log(`❌ [auto-sync] Product ${productUuid} niet opgehaald na 5 pogingen`)
            }
          }
        }

        if (totalStock <= 0 && !unlimited) {
          // Geen voorraad: zorg dat stock_covered jobs terug naar pending gaan
          for (const job of jobs) {
            if (job.printStatus === "stock_covered") {
              await prisma.printJob.update({ where: { id: job.id }, data: { printStatus: "pending" } })
              stockUncovered++
            }
          }
          continue
        }

        const coveredCount = unlimited ? jobs.length : Math.min(totalStock, jobs.length)
        for (let i = 0; i < jobs.length; i++) {
          const job = jobs[i]
          if (i < coveredCount) {
            // Gedekt door voorraad
            if (job.printStatus === "pending") {
              await prisma.printJob.update({ where: { id: job.id }, data: { printStatus: "stock_covered" } })
              stockCovered++
            }
          } else {
            // Niet gedekt: moet geprint worden
            if (job.printStatus === "stock_covered") {
              await prisma.printJob.update({ where: { id: job.id }, data: { printStatus: "pending" } })
              stockUncovered++
            }
          }
        }
      }

      if (stockCovered > 0 || stockUncovered > 0) {
        console.log(`📦 [auto-sync] Voorraad-allocatie: ${stockCovered} stock_covered, ${stockUncovered} terug naar pending`)
      }
    } catch (err) {
      console.error(`⚠️ [auto-sync] Voorraad-allocatie fout:`, err)
    }

    return NextResponse.json({
      success: true,
      ...lastSyncResult,
      stockCovered,
      stockUncovered,
    })
  } catch (error: any) {
    console.error("❌ Auto-sync error:", error.message)
    lastSyncTime = now // Prevent rapid retries on error
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }
}

function checkCondition(fieldValue: string, condition: string, ruleValue: string): boolean {
  const f = fieldValue.toLowerCase()
  const v = ruleValue.toLowerCase()
  switch (condition) {
    case "equals": return f === v
    case "not_equals": return f !== v
    case "starts_with": return f.startsWith(v)
    case "ends_with": return f.endsWith(v)
    case "contains": return f.includes(v)
    case "not_contains": return !f.includes(v)
    default: return false
  }
}
