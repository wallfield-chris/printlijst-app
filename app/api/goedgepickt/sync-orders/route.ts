import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { GoedGepicktAPI } from "@/lib/goedgepickt"

/**
 * POST /api/goedgepickt/sync-orders
 * Synchroniseer orders uit GoedGepickt op basis van condition rules
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth()

    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Haal API key op
    const apiKeySetting = await prisma.setting.findUnique({
      where: { key: "goedgepickt_api_key" },
    })

    if (!apiKeySetting || !apiKeySetting.value) {
      return NextResponse.json(
        { error: "GoedGepickt API key not configured" },
        { status: 400 }
      )
    }

    // Haal alle actieve condition rules op
    const conditionRules = await prisma.conditionRule.findMany({
      where: { active: true },
    })

    if (conditionRules.length === 0) {
      return NextResponse.json(
        { error: "No active condition rules found" },
        { status: 400 }
      )
    }

    // Haal alle actieve tag rules, priority rules en exclusion rules op
    const tagRules = await prisma.tagRule.findMany({
      where: { active: true },
    })

    const priorityRules = await prisma.priorityRule.findMany({
      where: { active: true },
    })

    const exclusionRules = await prisma.exclusionRule.findMany({
      where: { active: true },
    })

    // Initialiseer API client
    const api = new GoedGepicktAPI(apiKeySetting.value)

    console.log("📦 Syncing orders from GoedGepickt based on condition rules...")
    console.log(`📋 Found ${conditionRules.length} condition rules`)
    console.log(`🏷️  Found ${tagRules.length} tag rules`)
    console.log(`⚡ Found ${priorityRules.length} priority rules`)
    console.log(`🚫 Found ${exclusionRules.length} exclusion rules`)

    let totalImported = 0
    let totalSkipped = 0
    let totalExcluded = 0
    let totalDuplicates = 0
    const createdJobs = []
    const errors = []
    const debugInfo: any = {
      apiKeyConfigured: true,
      rulesFound: {
        conditions: conditionRules.length,
        tags: tagRules.length,
        priorities: priorityRules.length,
        exclusions: exclusionRules.length,
      },
      backorderRuleFound: false,
      ordersFromApi: 0,
      matchingOrders: 0,
      duplicateOrders: 0,
      excludedProducts: 0,
    }

    // Voor nu specifiek backorder status orders
    const backorderRule = conditionRules.find(
      (rule) => rule.field === "orderStatus" && rule.value === "backorder"
    )

    if (backorderRule) {
      debugInfo.backorderRuleFound = true
      console.log("🔍 Fetching backorder orders from GoedGepickt API...")
      console.log(`🔑 Using API key: ${apiKeySetting.value.substring(0, 10)}...`)
      
      // Gebruik createdAfter filter om alleen recente orders op te halen
      // Standaard: laatste 30 dagen, maar haal ALLE pagina's op
      const daysBack = 30
      const createdAfter = new Date()
      createdAfter.setDate(createdAfter.getDate() - daysBack)
      const createdAfterStr = createdAfter.toISOString().split('T')[0] // YYYY-MM-DD
      
      console.log(`📅 Fetching orders created after ${createdAfterStr} (last ${daysBack} days)`)
      
      // Stap 1: Haal eerste pagina op voor paginatie info
      const firstPageOrders = await api.getOrders({ 
        orderstatus: "backorder", 
        createdAfter: createdAfterStr,
        page: 1 
      })
      
      const paginationInfo = api.lastPaginationInfo
      const totalPages = paginationInfo?.lastPage || 1
      const totalItems = paginationInfo?.totalItems || firstPageOrders.length
      
      console.log(`📊 Found ${totalItems} orders across ${totalPages} pages`)
      
      // Stap 2: Haal ALLE pagina's op (van achteren naar voren voor nieuwste eerst)
      const allOrders = [...firstPageOrders]
      
      for (let page = 2; page <= totalPages; page++) {
        console.log(`📄 Fetching page ${page}/${totalPages}...`)
        const pageOrders = await api.getOrders({ 
          orderstatus: "backorder", 
          createdAfter: createdAfterStr,
          page 
        })
        
        if (pageOrders.length === 0) {
          console.log("   No more orders found")
          break
        }
        
        allOrders.push(...pageOrders)
        console.log(`   Found ${pageOrders.length} orders (total: ${allOrders.length})`)
      }
      
      // Stap 3: Filter alleen orders die daadwerkelijk status 'backorder' hebben
      // De API retourneert ook orders die ooit backorder waren maar nu een andere status hebben
      const backorderOnly = allOrders.filter(order => order.status === 'backorder')
      console.log(`🔍 ${allOrders.length} orders opgehaald, ${backorderOnly.length} hebben daadwerkelijk status 'backorder'`)
      
      const orders = backorderOnly
      debugInfo.ordersFromApi = allOrders.length
      debugInfo.actualBackorderOrders = backorderOnly.length
      debugInfo.filteredOut = allOrders.length - backorderOnly.length
      debugInfo.createdAfter = createdAfterStr
      debugInfo.totalPages = totalPages
      
      console.log(`📥 Processing ${orders.length} actual backorder orders`)
      
      let matchingOrders: typeof orders = orders
      debugInfo.matchingOrders = matchingOrders.length

      for (const order of matchingOrders) {
        try {
          // Check of order al geïmporteerd is
          const existingJobs = await prisma.printJob.findMany({
            where: { orderUuid: order.uuid },
          })

          if (existingJobs.length > 0) {
            console.log(`⏭️  Order ${order.orderNumber || order.uuid} already imported (${existingJobs.length} jobs)`)
            totalDuplicates++
            debugInfo.duplicateOrders++
            continue
          }

          let orderHasProducts = false

          // Verwerk elk product in de order
          if (order.products && order.products.length > 0) {
            for (const product of order.products) {
              // Skip parent products
              if (product.type === "parent") {
                console.log(`   ⏭️  Skipping parent product in order ${order.orderNumber}`)
                continue
              }

              // Check exclusion rules
              let isExcluded = false
              let exclusionReason = ""
              
              for (const rule of exclusionRules) {
                let fieldValue = ""
                
                if (rule.field === "sku") {
                  fieldValue = product.sku || ""
                } else if (rule.field === "orderNumber") {
                  fieldValue = order.orderNumber || ""
                } else if (rule.field === "customerName") {
                  fieldValue = order.customerName || order.customer?.name || ""
                } else if (rule.field === "orderStatus") {
                  fieldValue = order.status || ""
                }

                const matches = checkCondition(fieldValue, rule.condition, rule.value)
                if (matches) {
                  isExcluded = true
                  exclusionReason = rule.reason || `${rule.field} ${rule.condition} ${rule.value}`
                  break
                }
              }

              if (isExcluded) {
                console.log(`   ⛔ Excluded: ${product.sku || 'no-sku'} - ${product.productName} (${exclusionReason})`)
                totalExcluded++
                debugInfo.excludedProducts++
                continue
              }

              // Check of product al gepickt is (= op voorraad, niet printen)
              if (product.pickedQuantity && product.pickedQuantity >= (product.productQuantity || 1)) {
                console.log(`   ✅ Already picked: ${product.sku || 'no-sku'} - ${product.productName} (picked: ${product.pickedQuantity}/${product.productQuantity})`)
                totalExcluded++
                debugInfo.excludedProducts++
                continue
              }

              // Check stock via product details - alleen printen als NIET op voorraad
              if (product.productUuid) {
                try {
                  const stockDetails = await api.getProduct(product.productUuid)
                  if (stockDetails) {
                    const freeStock = stockDetails.stock?.freeStock ?? (stockDetails as any).freeStock ?? 0
                    const totalStock = stockDetails.stock?.totalStock ?? (stockDetails as any).totalStock ?? 0
                    
                    // Als er voldoende voorraad is, niet printen
                    if (freeStock >= (product.productQuantity || 1)) {
                      console.log(`   📦 In stock: ${product.sku || 'no-sku'} - ${product.productName} (freeStock: ${freeStock}, needed: ${product.productQuantity})`)
                      totalExcluded++
                      debugInfo.excludedProducts++
                      continue
                    }
                  }
                } catch (error) {
                  console.warn(`   ⚠️  Could not check stock for ${product.sku}, importing anyway`)
                }
              }

              orderHasProducts = true

              // Haal product details op voor supplierSku en afbeelding
              let supplierSku: string | null = null
              let imageUrl: string | null = null
              if (product.productUuid) {
                try {
                  const productDetails = await api.getProduct(product.productUuid)
                  if (productDetails) {
                    if (productDetails.supplier?.supplierSku) {
                      supplierSku = productDetails.supplier.supplierSku
                    } else if (productDetails.supplierSku) {
                      supplierSku = productDetails.supplierSku
                    }
                    // Haal product afbeelding op (skip placeholder)
                    if (productDetails.picture && !productDetails.picture.includes('image_placeholder')) {
                      imageUrl = productDetails.picture
                    }
                  }
                } catch (error) {
                  console.warn(`⚠️  Could not fetch product details for ${product.productUuid}`)
                }
              }

              // Bepaal tags op basis van tag rules
              const appliedTags: string[] = []
              for (const rule of tagRules) {
                let fieldValue = ""
                
                if (rule.field === "sku") {
                  fieldValue = product.sku || ""
                } else if (rule.field === "orderStatus") {
                  fieldValue = order.status || ""
                }

                const matches = checkCondition(fieldValue, rule.condition, rule.value)
                if (matches) {
                  appliedTags.push(rule.tag)
                }
              }

              // Bepaal priority op basis van priority rules
              // Check zowel het huidige product als alle andere producten in de order (voor scope: order)
              let priority = "normal"
              for (const rule of priorityRules) {
                if (rule.scope === "order") {
                  // Bij scope 'order': check ALLE producten in de order
                  const allProducts = order.products || []
                  for (const p of allProducts) {
                    let fieldValue = ""
                    
                    if (rule.field === "sku") {
                      fieldValue = p.sku || ""
                    } else if (rule.field === "orderStatus") {
                      fieldValue = order.status || ""
                    } else if (rule.field === "customerName") {
                      fieldValue = order.customerName || order.customer?.name || ""
                    }

                    if (checkCondition(fieldValue, rule.condition, rule.value)) {
                      priority = rule.priority
                      console.log(`   🔴 Priority ${rule.priority}: matched ${rule.field} "${fieldValue}" via product ${p.sku} (scope: order)`)
                      break
                    }
                  }
                  if (priority !== "normal") break
                } else {
                  // Bij scope 'product': check alleen het huidige product
                  let fieldValue = ""
                  
                  if (rule.field === "sku") {
                    fieldValue = product.sku || ""
                  } else if (rule.field === "orderStatus") {
                    fieldValue = order.status || ""
                  } else if (rule.field === "customerName") {
                    fieldValue = order.customerName || order.customer?.name || ""
                  }

                  if (checkCondition(fieldValue, rule.condition, rule.value)) {
                    priority = rule.priority
                  }
                }
              }

              // Combineer order tags met regel tags
              const orderTags = order.tags && Array.isArray(order.tags)
                ? order.tags.filter((t: any) => typeof t === 'string')
                : []
              
              const allTags = [...appliedTags, ...orderTags]
              const tagsString = allTags.length > 0 ? allTags.join(", ") : null

              // Gebruik order createDate als receivedAt datum
              const orderDate = order.createDate ? new Date(order.createDate) : new Date()

              // Maak printjob
              const printJob = await prisma.printJob.create({
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
                  tags: tagsString,
                  customerName: order.customer?.name || order.customerName,
                  notes: order.notes,
                  printStatus: "pending",
                  orderStatus: order.status,
                  backorder: order.status === "backorder",
                  receivedAt: orderDate,
                  webhookData: JSON.stringify({ order, product }, null, 2),
                },
              })

              createdJobs.push(printJob)
              totalImported++
            }
          }
        } catch (error: any) {
          console.error(`❌ Error processing order ${order.uuid}:`, error)
          errors.push({
            orderUuid: order.uuid,
            error: error.message,
          })
        }
      }
    } else {
      console.log("⚠️  No backorder condition rule found")
      console.log("💡 Tip: Create a condition rule with field 'orderStatus' and value 'backorder'")
    }

    totalSkipped = totalDuplicates + totalExcluded

    console.log(`\n✅ Sync complete:`)
    console.log(`   📥 ${totalImported} jobs imported`)
    console.log(`   ⏭️  ${totalDuplicates} duplicate orders skipped`)
    console.log(`   ⛔ ${totalExcluded} products excluded by rules`)
    console.log(`   📊 ${totalSkipped} total skipped`)

    return NextResponse.json({
      success: true,
      message: `Sync complete: ${totalImported} jobs created`,
      stats: {
        imported: totalImported,
        skipped: totalSkipped,
        duplicates: totalDuplicates,
        excluded: totalExcluded,
        errors: errors.length,
      },
      debug: debugInfo,
      printJobs: createdJobs.map((job) => ({
        id: job.id,
        productName: job.productName,
        quantity: job.quantity,
        priority: job.priority,
        backorder: job.backorder,
        tags: job.tags,
      })),
      errors: errors.length > 0 ? errors : undefined,
    })
  } catch (error: any) {
    console.error("❌ Sync error:", error)
    return NextResponse.json(
      { error: error.message || "Error syncing orders" },
      { status: 500 }
    )
  }
}

/**
 * Helper functie om condities te checken
 */
function checkCondition(fieldValue: string, condition: string, ruleValue: string): boolean {
  const normalizedField = fieldValue.toLowerCase()
  const normalizedValue = ruleValue.toLowerCase()

  switch (condition) {
    case "equals":
      return normalizedField === normalizedValue
    case "starts_with":
      return normalizedField.startsWith(normalizedValue)
    case "ends_with":
      return normalizedField.endsWith(normalizedValue)
    case "contains":
      return normalizedField.includes(normalizedValue)
    default:
      return false
  }
}
