import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

// Helper functie om tags toe te kennen op basis van tag regels (product-specifiek)
async function applyTagRules(
  sku: string | null, 
  orderStatus: string | null
): Promise<string> {
  // Haal actieve tag regels op met scope "product"
  const tagRules = await prisma.tagRule.findMany({
    where: { 
      active: true,
      field: { in: ["sku", "orderStatus"] },
      scope: "product"
    },
    orderBy: [
      { tag: 'asc' },
      { createdAt: 'asc' }
    ]
  })

  const appliedTags: string[] = []

  // Groepeer regels per tag
  const rulesByTag = new Map<string, typeof tagRules>()
  for (const rule of tagRules) {
    if (!rulesByTag.has(rule.tag)) {
      rulesByTag.set(rule.tag, [])
    }
    rulesByTag.get(rule.tag)!.push(rule)
  }

  // Evalueer elke tag groep
  for (const [tag, rules] of rulesByTag) {
    if (appliedTags.includes(tag)) continue

    let result = false
    
    for (let i = 0; i < rules.length; i++) {
      const rule = rules[i]
      let fieldValue: string | null = null

      if (rule.field === "sku") {
        fieldValue = sku
      } else if (rule.field === "orderStatus") {
        fieldValue = orderStatus
      }

      let matches = false
      if (fieldValue) {
        switch (rule.condition) {
          case "starts_with":
            matches = fieldValue.startsWith(rule.value)
            break
          case "ends_with":
            matches = fieldValue.endsWith(rule.value)
            break
          case "contains":
            matches = fieldValue.includes(rule.value)
            break
          case "equals":
            matches = fieldValue === rule.value
            break
        }
      }

      if (i === 0) {
        result = matches
      } else {
        const prevRule = rules[i - 1]
        if (prevRule.operator === "OR") {
          result = result || matches
        } else {
          result = result && matches
        }
      }
    }

    if (result) {
      appliedTags.push(tag)
    }
  }

  return appliedTags.join(", ")
}

// Helper functie om order-brede tags te bepalen
async function getOrderWideTags(
  allSkus: string[],
  orderStatus: string | null
): Promise<string> {
  const tagRules = await prisma.tagRule.findMany({
    where: { 
      active: true,
      scope: "order",
      field: { in: ["sku", "orderStatus"] }
    },
    orderBy: [
      { tag: 'asc' },
      { createdAt: 'asc' }
    ]
  })

  const appliedTags: string[] = []
  const rulesByTag = new Map<string, typeof tagRules>()
  
  for (const rule of tagRules) {
    if (!rulesByTag.has(rule.tag)) {
      rulesByTag.set(rule.tag, [])
    }
    rulesByTag.get(rule.tag)!.push(rule)
  }

  for (const [tag, rules] of rulesByTag) {
    if (appliedTags.includes(tag)) continue

    let result = false
    
    for (let i = 0; i < rules.length; i++) {
      const rule = rules[i]
      let matches = false

      if (rule.field === "sku") {
        for (const sku of allSkus) {
          let skuMatches = false
          switch (rule.condition) {
            case "starts_with":
              skuMatches = sku.startsWith(rule.value)
              break
            case "ends_with":
              skuMatches = sku.endsWith(rule.value)
              break
            case "contains":
              skuMatches = sku.includes(rule.value)
              break
            case "equals":
              skuMatches = sku === rule.value
              break
          }
          if (skuMatches) {
            matches = true
            break
          }
        }
      } else if (rule.field === "orderStatus" && orderStatus) {
        switch (rule.condition) {
          case "starts_with":
            matches = orderStatus.startsWith(rule.value)
            break
          case "ends_with":
            matches = orderStatus.endsWith(rule.value)
            break
          case "contains":
            matches = orderStatus.includes(rule.value)
            break
          case "equals":
            matches = orderStatus === rule.value
            break
        }
      }

      if (i === 0) {
        result = matches
      } else {
        const prevRule = rules[i - 1]
        if (prevRule.operator === "OR") {
          result = result || matches
        } else {
          result = result && matches
        }
      }
    }

    if (result) {
      appliedTags.push(tag)
    }
  }

  return appliedTags.join(", ")
}

// POST - Sync tags voor alle niet-completed orders
export async function POST(request: NextRequest) {
  try {
    const session = await auth()
    
    if (!session || session.user.role !== "admin") {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      )
    }

    console.log("🔄 Starting tag sync for non-completed orders...")

    // Haal alle printjobs op die NIET completed zijn
    const printJobs = await prisma.printJob.findMany({
      where: {
        orderStatus: {
          not: "completed"
        }
      }
    })

    console.log(`📋 Found ${printJobs.length} non-completed printjobs to sync`)

    // Groepeer printjobs per orderUuid
    const jobsByOrder = new Map<string, typeof printJobs>()
    for (const job of printJobs) {
      if (!job.orderUuid) continue
      if (!jobsByOrder.has(job.orderUuid)) {
        jobsByOrder.set(job.orderUuid, [])
      }
      jobsByOrder.get(job.orderUuid)!.push(job)
    }

    console.log(`📦 Processing ${jobsByOrder.size} unique orders`)

    let updatedCount = 0
    let errorCount = 0

    // Verwerk elke order
    for (const [orderUuid, orderJobs] of jobsByOrder) {
      try {
        // Verzamel alle SKU's in deze order
        const allOrderSkus = orderJobs
          .map(job => job.sku)
          .filter((sku): sku is string => sku !== null)
        
        // Bepaal order-brede tags
        const orderWideTags = await getOrderWideTags(allOrderSkus, orderJobs[0].orderStatus)
        
        // Update elk printjob in de order
        for (const job of orderJobs) {
          // Bereken product-specifieke tags
          const productTags = await applyTagRules(job.sku, job.orderStatus)
          
          // Combineer product en order-brede tags
          const allTagsSet = new Set<string>()
          if (productTags) {
            productTags.split(",").map(t => t.trim()).filter(t => t).forEach(tag => allTagsSet.add(tag))
          }
          if (orderWideTags) {
            orderWideTags.split(",").map(t => t.trim()).filter(t => t).forEach(tag => allTagsSet.add(tag))
          }
          
          const newTags = Array.from(allTagsSet).join(", ") || null
          
          if (newTags !== job.tags) {
            await prisma.printJob.update({
              where: { id: job.id },
              data: { tags: newTags }
            })
            
            console.log(`   ✓ Updated ${job.orderNumber} - ${job.productName}: "${job.tags || 'none'}" → "${newTags || 'none'}"`)
            updatedCount++
          }
        }
      } catch (error) {
        console.error(`   ✗ Error updating order ${orderUuid}:`, error)
        errorCount++
      }
    }

    console.log(`✅ Tag sync complete: ${updatedCount} updated, ${errorCount} errors, ${printJobs.length - updatedCount - errorCount} unchanged`)

    return NextResponse.json({
      success: true,
      totalJobs: printJobs.length,
      totalOrders: jobsByOrder.size,
      updatedCount,
      errorCount,
      unchangedCount: printJobs.length - updatedCount - errorCount
    })
  } catch (error) {
    console.error("❌ Error syncing tags:", error)
    return NextResponse.json(
      { error: "Failed to sync tags" },
      { status: 500 }
    )
  }
}
