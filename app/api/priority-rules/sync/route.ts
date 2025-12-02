import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

// Functie om te checken of een waarde voldoet aan een conditie
function checkCondition(fieldValue: string | null | undefined, condition: string, ruleValue: string): boolean {
  if (!fieldValue) return false
  
  const field = fieldValue.toLowerCase()
  const value = ruleValue.toLowerCase()
  
  switch (condition) {
    case "starts_with":
      return field.startsWith(value)
    case "ends_with":
      return field.endsWith(value)
    case "contains":
      return field.includes(value)
    case "equals":
      return field === value
    default:
      return false
  }
}

// Functie om priority rules toe te passen op een product
function applyPriorityRules(
  printJob: any,
  rules: any[]
): string {
  // Filter only active product-scoped rules
  const productRules = rules.filter(r => r.active && r.scope === "product")
  
  for (const rule of productRules) {
    const fieldValue = printJob[rule.field]
    
    if (checkCondition(fieldValue, rule.condition, rule.value)) {
      return rule.priority
    }
  }
  
  return printJob.priority || "normal" // Default priority
}

// Functie om order-wide priority te bepalen
function getOrderWidePriority(
  allSkusInOrder: string[],
  orderStatus: string | null,
  rules: any[]
): string | null {
  // Filter only active order-scoped rules
  const orderRules = rules.filter(r => r.active && r.scope === "order")
  
  for (const rule of orderRules) {
    // Voor orderStatus: check tegen de order status
    if (rule.field === "orderStatus") {
      if (checkCondition(orderStatus, rule.condition, rule.value)) {
        return rule.priority
      }
    }
    // Voor SKU: check of ENIGE sku in de order matcht
    else if (rule.field === "sku") {
      const matchingSku = allSkusInOrder.some(sku => 
        checkCondition(sku, rule.condition, rule.value)
      )
      
      if (matchingSku) {
        return rule.priority
      }
    }
  }
  
  return null
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth()
    
    if (!session || session.user.role !== "admin") {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      )
    }

    console.log("🔄 Starting Priority sync...")

    // Haal alle priority rules op
    const priorityRules = await prisma.priorityRule.findMany({
      where: { active: true }
    })

    if (priorityRules.length === 0) {
      return NextResponse.json({
        success: true,
        message: "Geen actieve priority rules gevonden",
        updated: 0
      })
    }

    console.log(`📋 Found ${priorityRules.length} active priority rules`)

    // Haal alle printjobs op die niet completed zijn
    const printJobs = await prisma.printJob.findMany({
      where: {
        orderStatus: {
          notIn: ['completed', 'cancelled']
        }
      },
      orderBy: {
        orderUuid: 'asc'
      }
    })

    console.log(`📦 Found ${printJobs.length} printjobs to process`)

    // Groepeer printjobs per order
    const orderGroups = new Map<string, typeof printJobs>()
    for (const job of printJobs) {
      const orderKey = job.orderUuid || job.orderNumber
      if (!orderGroups.has(orderKey)) {
        orderGroups.set(orderKey, [])
      }
      orderGroups.get(orderKey)!.push(job)
    }

    console.log(`📊 Grouped into ${orderGroups.size} orders`)

    let updatedCount = 0
    const BATCH_SIZE = 10
    const DELAY_MS = 100
    const orders = Array.from(orderGroups.entries())

    // Process orders in batches
    for (let i = 0; i < orders.length; i += BATCH_SIZE) {
      const batch = orders.slice(i, i + BATCH_SIZE)
      console.log(`🔄 Processing batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(orders.length / BATCH_SIZE)} (orders ${i + 1}-${Math.min(i + BATCH_SIZE, orders.length)})`)

      await Promise.all(batch.map(async ([orderKey, jobs]) => {
        try {
          // Verzamel alle SKUs in deze order
          const allSkusInOrder = jobs
            .map(j => j.sku)
            .filter((sku): sku is string => sku !== null && sku !== undefined)

          // Check voor order-wide priority
          const orderWidePriority = getOrderWidePriority(
            allSkusInOrder,
            jobs[0].orderStatus,
            priorityRules
          )

          console.log(`  📦 Order ${orderKey}: ${jobs.length} products, SKUs: [${allSkusInOrder.join(', ')}]`)
          
          if (orderWidePriority) {
            console.log(`  🎯 Order-wide priority: ${orderWidePriority}`)
          }

          // Update elk product in deze order
          for (const job of jobs) {
            let newPriority: string
            
            // Order-wide priority heeft voorrang
            if (orderWidePriority) {
              newPriority = orderWidePriority
            } else {
              // Anders product-specific priority
              newPriority = applyPriorityRules(job, priorityRules)
            }

            // Only update if priority changed
            if (newPriority !== job.priority) {
              await prisma.printJob.update({
                where: { id: job.id },
                data: { priority: newPriority }
              })
              
              console.log(`    ✅ Updated ${job.productName} (${job.sku}): ${job.priority} → ${newPriority}`)
              updatedCount++
            }
          }

        } catch (error) {
          console.error(`  ❌ Error processing order ${orderKey}:`, error)
        }
      }))

      // Delay between batches
      if (i + BATCH_SIZE < orders.length) {
        await new Promise(resolve => setTimeout(resolve, DELAY_MS))
      }
    }

    console.log(`✅ Priority sync completed: ${updatedCount} printjobs updated`)

    return NextResponse.json({
      success: true,
      message: `Priority sync voltooid: ${updatedCount} printjobs bijgewerkt`,
      totalJobs: printJobs.length,
      updated: updatedCount,
      rules: priorityRules.length
    })

  } catch (error) {
    console.error("Error during priority sync:", error)
    return NextResponse.json(
      { 
        success: false,
        error: "Priority sync failed: " + String(error) 
      },
      { status: 500 }
    )
  }
}
