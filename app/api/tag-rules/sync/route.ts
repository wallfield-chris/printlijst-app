import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

// Helper functie om tags toe te kennen op basis van tag regels
async function applyTagRules(
  sku: string | null, 
  orderStatus: string | null
): Promise<string> {
  // Haal actieve tag regels op voor SKU en orderStatus
  const tagRules = await prisma.tagRule.findMany({
    where: { 
      active: true,
      field: { in: ["sku", "orderStatus"] }
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
    if (appliedTags.includes(tag)) continue // Skip als tag al bestaat

    // Evalueer met operator logica
    let result = false
    
    for (let i = 0; i < rules.length; i++) {
      const rule = rules[i]
      let fieldValue: string | null = null

      // Bepaal welk veld te checken
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

      // Combineer met vorige resultaat gebaseerd op operator
      if (i === 0) {
        result = matches
      } else {
        const prevRule = rules[i - 1]
        if (prevRule.operator === "OR") {
          result = result || matches
        } else { // AND
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

    console.log(`📋 Found ${printJobs.length} non-completed orders to sync`)

    let updatedCount = 0
    let errorCount = 0

    // Update elke printjob met nieuwe tags
    for (const job of printJobs) {
      try {
        const newTags = await applyTagRules(job.sku, job.orderStatus)
        
        await prisma.printJob.update({
          where: { id: job.id },
          data: { tags: newTags || null }
        })

        if (newTags !== job.tags) {
          console.log(`   ✓ Updated job ${job.orderNumber} (${job.productName}): "${job.tags || 'none'}" → "${newTags || 'none'}"`)
          updatedCount++
        }
      } catch (error) {
        console.error(`   ✗ Error updating job ${job.id}:`, error)
        errorCount++
      }
    }

    console.log(`✅ Tag sync complete: ${updatedCount} updated, ${errorCount} errors, ${printJobs.length - updatedCount - errorCount} unchanged`)

    return NextResponse.json({
      success: true,
      totalJobs: printJobs.length,
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
