import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { GoedGepicktAPI } from "@/lib/goedgepickt"

// ===================================================================
// POST /api/admin/goedgepickt/diagnose-orders
// Zoek specifieke orders op in GoedGepickt en analyseer waarom ze
// niet in de printjobs terechtkomen.
//
// Body: { orderNumbers: ["FR70912", "WN210764", ...], forceImport?: boolean }
// ===================================================================

const GG_BASE = "https://account.goedgepickt.nl/api/v1"
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function fetchGG(url: string, apiKey: string, retries = 3): Promise<any> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      cache: "no-store",
    })
    if (res.status === 429) {
      const wait = 3000 * Math.pow(2, attempt)
      await sleep(wait)
      continue
    }
    if (res.status !== 200) {
      const text = await res.text()
      throw new Error(`HTTP ${res.status}: ${text.substring(0, 200)}`)
    }
    return res.json()
  }
  throw new Error("Too many retries (rate limit)")
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

export async function POST(request: NextRequest) {
  try {
    const session = await auth()
    if (!session || (session.user as any).role !== "admin") {
      return NextResponse.json({ error: "Niet geautoriseerd" }, { status: 401 })
    }

    const body = await request.json()
    const orderNumbers: string[] = body.orderNumbers || []
    const forceImport: boolean = body.forceImport === true
    const fixVisibility: boolean = body.fixVisibility === true
    const fixJobId: string | null = body.fixJobId || null // Fix single job

    // === Quick path: fix single job by ID ===
    if (fixJobId) {
      const job = await prisma.printJob.findUnique({ where: { id: fixJobId }, select: { id: true, printStatus: true, orderStatus: true } })
      if (!job) return NextResponse.json({ error: "Job niet gevonden" }, { status: 404 })
      await prisma.printJob.update({
        where: { id: fixJobId },
        data: {
          orderStatus: "backorder",
          printStatus: ["stock_covered", "pushed"].includes(job.printStatus) ? "pending" : job.printStatus,
        },
      })
      return NextResponse.json({ success: true, fixedJobId: fixJobId })
    }

    if (orderNumbers.length === 0 || orderNumbers.length > 20) {
      return NextResponse.json({ error: "Geef 1-20 ordernummers op" }, { status: 400 })
    }

    // API key ophalen
    const apiKeySetting = await prisma.setting.findUnique({
      where: { key: "goedgepickt_api_key" },
    })
    if (!apiKeySetting?.value) {
      return NextResponse.json({ error: "GoedGepickt API key niet geconfigureerd" }, { status: 400 })
    }
    const apiKey = apiKeySetting.value

    // Exclusion rules ophalen
    const exclusionRules = await prisma.exclusionRule.findMany({ where: { active: true } })

    // ==========================================
    // STAP 1: Check database voor bestaande jobs
    // ==========================================
    const HIDDEN_ORDER_STATUSES = ["completed", "cancelled", "shipped"]
    const HIDDEN_PRINT_STATUSES = ["pushed", "stock_covered"]

    const dbResults: Record<string, any[]> = {}
    for (const orderNum of orderNumbers) {
      const jobs = await prisma.printJob.findMany({
        where: { orderNumber: orderNum },
        select: {
          id: true,
          orderNumber: true,
          orderUuid: true,
          productUuid: true,
          productName: true,
          sku: true,
          printStatus: true,
          orderStatus: true,
          backorder: true,
          receivedAt: true,
          completedAt: true,
          pickedQuantity: true,
          quantity: true,
        },
      })
      dbResults[orderNum] = jobs
    }

    // ==========================================
    // FIX VISIBILITY: reset orderStatus + printStatus
    // ==========================================
    let fixedCount = 0
    if (fixVisibility) {
      for (const orderNum of orderNumbers) {
        const jobs = dbResults[orderNum] || []
        for (const job of jobs) {
          const needsFix =
            HIDDEN_ORDER_STATUSES.includes(job.orderStatus || "") ||
            HIDDEN_PRINT_STATUSES.includes(job.printStatus)
          if (needsFix) {
            await prisma.printJob.update({
              where: { id: job.id },
              data: {
                orderStatus: "backorder",
                printStatus: job.printStatus === "stock_covered" ? "pending" : job.printStatus === "pushed" ? "pending" : job.printStatus,
              },
            })
            fixedCount++
          }
        }
      }
      // Re-fetch na fix
      for (const orderNum of orderNumbers) {
        dbResults[orderNum] = await prisma.printJob.findMany({
          where: { orderNumber: orderNum },
          select: {
            id: true, orderNumber: true, orderUuid: true, productUuid: true, productName: true,
            sku: true, printStatus: true, orderStatus: true, backorder: true,
            receivedAt: true, completedAt: true, pickedQuantity: true, quantity: true,
          },
        })
      }
    }

    // ==========================================
    // STAP 2: Zoek in GoedGepickt API (ALLE statussen, 365 dagen)
    // ==========================================
    const createdAfter = new Date()
    createdAfter.setDate(createdAfter.getDate() - 365)
    const createdAfterStr = `${createdAfter.getFullYear()}-${String(createdAfter.getMonth() + 1).padStart(2, "0")}-${String(createdAfter.getDate()).padStart(2, "0")}`

    // Haal alle orders op ZONDER orderstatus filter
    const allOrders: any[] = []
    let page = 1
    let lastPage = 1

    while (page <= lastPage && page <= 100) {
      const url = `${GG_BASE}/orders?createdAfter=${createdAfterStr}&page=${page}`
      try {
        const data = await fetchGG(url, apiKey)
        if (data.pageInfo) lastPage = data.pageInfo.lastPage || 1
        const items = data.items || data.data || data.orders || (Array.isArray(data) ? data : [])
        allOrders.push(...items)
        if (items.length === 0) break
        if (page < lastPage) await sleep(400)
        page++
      } catch {
        break
      }
    }

    // Zoek de specifieke orders
    const orderNumberSet = new Set(orderNumbers.map((n) => n.toUpperCase()))
    const foundOrders = new Map<string, any>()

    for (const order of allOrders) {
      const possibleNumbers = [
        order.externalDisplayId,
        order.orderNumber,
        order.order_number,
      ].filter(Boolean).map((n: string) => n.toUpperCase())

      for (const num of possibleNumbers) {
        if (orderNumberSet.has(num)) {
          foundOrders.set(num, order)
          break
        }
      }
    }

    // ==========================================
    // STAP 3: Analyseer elke order
    // ==========================================
    const results: any[] = []
    let importedCount = 0

    for (const orderNum of orderNumbers) {
      const order = foundOrders.get(orderNum.toUpperCase())
      const dbJobs = dbResults[orderNum] || []

      const result: any = {
        orderNumber: orderNum,
        inDatabase: dbJobs.length > 0,
        dbJobs: dbJobs.map((j: any) => {
          // Visibility check: zou deze job zichtbaar zijn in de printlijst?
          const hiddenByOrderStatus = HIDDEN_ORDER_STATUSES.includes(j.orderStatus || "")
          const hiddenByPrintStatus = HIDDEN_PRINT_STATUSES.includes(j.printStatus)
          const isVisible = !hiddenByOrderStatus && !hiddenByPrintStatus
          const hiddenReasons: string[] = []
          if (hiddenByOrderStatus) hiddenReasons.push(`orderStatus="${j.orderStatus}" wordt gefilterd`)
          if (hiddenByPrintStatus) hiddenReasons.push(`printStatus="${j.printStatus}" is niet zichtbaar`)
          return {
            id: j.id,
            printStatus: j.printStatus,
            orderStatus: j.orderStatus,
            productName: j.productName,
            productUuid: j.productUuid,
            sku: j.sku,
            quantity: j.quantity,
            pickedQuantity: j.pickedQuantity,
            receivedAt: j.receivedAt,
            isVisible,
            hiddenReasons,
          }
        }),
        foundInGG: !!order,
        ggStatus: order?.status || null,
        ggCreatedAt: order?.createDate || order?.createdAt || null,
        ggUuid: order?.uuid || null,
        customer: order?.customer?.name || order?.customerName || null,
        tags: order?.tags || [],
        reasons: [] as string[],
        products: [] as any[],
      }

      if (!order) {
        result.reasons.push("Order niet gevonden in GoedGepickt (afgelopen 365 dagen)")
        results.push(result)
        continue
      }

      // Analyse: waarom niet geïmporteerd?

      // Reden: status is niet backorder
      if (order.status !== "backorder") {
        result.reasons.push(`Status is "${order.status}" — sync haalt alleen "backorder" op`)
      }

      // Reden: ouder dan 30 dagen
      if (order.createDate) {
        const orderDate = new Date(order.createDate)
        const thirtyDaysAgo = new Date()
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
        if (orderDate < thirtyDaysAgo) {
          result.reasons.push(`Order is ouder dan 30 dagen (${order.createDate.split("T")[0]}) — normale sync kijkt maar 30 dagen terug`)
        }
      }

      // Geen producten
      if (!order.products || order.products.length === 0) {
        result.reasons.push("Order heeft geen producten")
        results.push(result)
        continue
      }

      // Producten analyseren
      for (const product of order.products) {
        const picked = product.pickedQuantity || 0
        const qty = product.productQuantity || 1
        const isPicked = picked >= qty
        const isParent = product.type === "parent"
        const productReasons: string[] = []

        if (isParent) productReasons.push("Type is parent → wordt overgeslagen")
        if (isPicked) productReasons.push(`Al gepickt (${picked}/${qty}) → wordt overgeslagen`)

        // Exclusion rules check
        for (const rule of exclusionRules) {
          let val = ""
          if (rule.field === "sku") val = product.sku || ""
          else if (rule.field === "orderNumber") val = orderNum
          else if (rule.field === "customerName") val = order.customerName || order.customer?.name || ""
          else if (rule.field === "orderStatus") val = order.status || ""
          if (checkCondition(val, rule.condition, rule.value)) {
            productReasons.push(`ExclusionRule: ${rule.field} ${rule.condition} "${rule.value}"`)
          }
        }

        // Dedup check
        if (order.uuid && product.productUuid) {
          const existing = await prisma.printJob.findFirst({
            where: {
              orderUuid: order.uuid,
              OR: [
                { productUuid: product.productUuid },
                ...(product.sku ? [{ sku: product.sku }] : []),
              ],
            },
            select: { id: true, printStatus: true },
          })
          if (existing) {
            productReasons.push(`Staat al in database als "${existing.printStatus}"`)
          }
        }

        result.products.push({
          productName: product.productName || "Onbekend",
          sku: product.sku || null,
          productUuid: product.productUuid || null,
          type: product.type || "normal",
          quantity: qty,
          pickedQuantity: picked,
          reasons: productReasons,
        })
      }

      // ==========================================
      // FORCE IMPORT als gevraagd
      // ==========================================
      if (forceImport && order && !dbJobs.length) {
        const api = new GoedGepicktAPI(apiKey)

        // Tag rules en priority rules ophalen
        const [tagRules, priorityRules] = await Promise.all([
          prisma.tagRule.findMany({ where: { active: true } }),
          prisma.priorityRule.findMany({ where: { active: true } }),
        ])

        for (const product of order.products || []) {
          if (product.type === "parent") continue

          // Check of al bestaat
          const existing = order.uuid && product.productUuid
            ? await prisma.printJob.findFirst({
                where: { orderUuid: order.uuid, productUuid: product.productUuid },
              })
            : null
          if (existing) continue

          // Product details ophalen
          let supplierSku: string | null = null
          let imageUrl: string | null = null
          if (product.productUuid) {
            try {
              const details = await api.getProduct(product.productUuid)
              if (details) {
                supplierSku = (details as any).supplier?.supplierSku || (details as any).supplierSku || null
                if ((details as any).picture && !(details as any).picture.includes("image_placeholder")) {
                  imageUrl = (details as any).picture
                }
              }
              await sleep(400)
            } catch { /* ignore */ }
          }

          // Tags
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

          // Priority
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

          const orderDate = order.createDate ? new Date(order.createDate) : new Date()
          const isCustomFile = product.sku?.startsWith("1041") || false

          await prisma.printJob.create({
            data: {
              orderUuid: order.uuid || "",
              orderNumber: order.externalDisplayId || order.orderNumber || orderNum,
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
              webhookData: JSON.stringify({ order, product, source: "force-import" }, null, 2),
            },
          })
          importedCount++
        }
        result.forceImported = true
      }

      // === STOCK CHECK voor stock_covered jobs ===
      if (result.inDatabase) {
        const api = new GoedGepicktAPI(apiKey)
        const stockChecked = new Set<string>()
        for (const dbJob of dbJobs) {
          if (dbJob.productUuid && !stockChecked.has(dbJob.productUuid)) {
            stockChecked.add(dbJob.productUuid)
            try {
              const stockInfo = await api.getProductTotalStock(dbJob.productUuid)
              result.stockInfo = result.stockInfo || []
              result.stockInfo.push({
                productUuid: dbJob.productUuid,
                sku: dbJob.sku,
                productName: dbJob.productName,
                totalStock: stockInfo.totalStock,
                freeStock: stockInfo.freeStock,
                reservedStock: stockInfo.reservedStock,
                unlimitedStock: stockInfo.unlimitedStock,
                debug: stockInfo.debug,
              })
              await sleep(400)
            } catch { /* ignore stock errors */ }
          }
        }
      }

      results.push(result)
    }

    // Status verdeling
    const statusCounts: Record<string, number> = {}
    for (const order of allOrders) {
      const s = order.status || "unknown"
      statusCounts[s] = (statusCounts[s] || 0) + 1
    }

    return NextResponse.json({
      results,
      summary: {
        searched: orderNumbers.length,
        foundInGG: [...foundOrders.keys()].length,
        notFoundInGG: orderNumbers.length - foundOrders.size,
        alreadyInDB: Object.values(dbResults).filter((jobs) => jobs.length > 0).length,
        forceImported: importedCount,
        fixedVisibility: fixedCount,
      },
      ggStats: {
        totalOrdersFetched: allOrders.length,
        dateRange: `${createdAfterStr} - vandaag`,
        statusDistribution: statusCounts,
      },
    })
  } catch (error) {
    console.error("Diagnose error:", error)
    return NextResponse.json(
      { error: `Fout bij diagnose: ${error instanceof Error ? error.message : String(error)}` },
      { status: 500 }
    )
  }
}
