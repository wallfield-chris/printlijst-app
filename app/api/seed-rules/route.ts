import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

/**
 * GET /api/seed-rules
 * Migreert alle condition rules, tag rules, priority rules,
 * exclusion rules en list views naar de productie database.
 * Slaat bestaande records over (geen duplicaten).
 */
export async function GET() {
  try {
    const results: Record<string, number> = {}

    // === CONDITION RULES ===
    const conditionRules = [
      { field: "orderStatus", condition: "equals", value: "backorder", scope: "product", operator: "AND", active: true },
    ]
    let created = 0
    for (const rule of conditionRules) {
      const exists = await prisma.conditionRule.findFirst({
        where: { field: rule.field, condition: rule.condition, value: rule.value },
      })
      if (!exists) {
        await prisma.conditionRule.create({ data: rule })
        created++
      }
    }
    results.conditionRules = created

    // === TAG RULES ===
    const tagRules = [
      { field: "sku", condition: "starts_with", value: "1027", tag: "Salontafel", scope: "product", operator: "AND", active: true },
      { field: "sku", condition: "ends_with", value: "15", tag: "100 x 150 cm", scope: "product", operator: "AND", active: true },
      { field: "sku", condition: "ends_with", value: "16", tag: "80 x 120 cm", scope: "product", operator: "AND", active: true },
      { field: "sku", condition: "ends_with", value: "13", tag: "60 x 90 cm", scope: "product", operator: "AND", active: true },
      { field: "sku", condition: "ends_with", value: "11", tag: "40 x 60 cm", scope: "product", operator: "AND", active: true },
      { field: "sku", condition: "ends_with", value: "15", tag: "100x150", scope: "product", operator: "AND", active: true },
      { field: "sku", condition: "ends_with", value: "16", tag: "80x120", scope: "product", operator: "AND", active: true },
      { field: "sku", condition: "ends_with", value: "13", tag: "60x90", scope: "product", operator: "AND", active: true },
      { field: "sku", condition: "ends_with", value: "11", tag: "40x60", scope: "product", operator: "AND", active: true },
    ]
    created = 0
    for (const rule of tagRules) {
      const exists = await prisma.tagRule.findFirst({
        where: { field: rule.field, condition: rule.condition, value: rule.value, tag: rule.tag },
      })
      if (!exists) {
        await prisma.tagRule.create({ data: rule })
        created++
      }
    }
    results.tagRules = created

    // === PRIORITY RULES ===
    const priorityRules = [
      { field: "sku", condition: "contains", value: "SHIPPING-NEXT-DAY", priority: "urgent", scope: "order", operator: "AND", active: true },
    ]
    created = 0
    for (const rule of priorityRules) {
      const exists = await prisma.priorityRule.findFirst({
        where: { field: rule.field, condition: rule.condition, value: rule.value },
      })
      if (!exists) {
        await prisma.priorityRule.create({ data: rule })
        created++
      }
    }
    results.priorityRules = created

    // === EXCLUSION RULES ===
    const exclusionRules = [
      { field: "sku", condition: "starts_with", value: "11", reason: "Zijlstra", operator: "AND", active: true },
      { field: "sku", condition: "starts_with", value: "18", reason: "Probo", operator: "AND", active: true },
      { field: "sku", condition: "contains", value: "SHIPPING-NEXT-DAY", reason: "Verzendproduct", operator: "AND", active: true },
    ]
    created = 0
    for (const rule of exclusionRules) {
      const exists = await prisma.exclusionRule.findFirst({
        where: { field: rule.field, condition: rule.condition, value: rule.value },
      })
      if (!exists) {
        await prisma.exclusionRule.create({ data: rule })
        created++
      }
    }
    results.exclusionRules = created

    // === LIST VIEWS ===
    const listViews = [
      { name: "40x60 cm", tags: "40x60,40 x 60 cm", order: 4, active: true },
      { name: "60x90 cm", tags: "60x90,60 x 90 cm", order: 4, active: true },
      { name: "80x120 cm", tags: "80x120,80 x 120 cm", order: 4, active: true },
      { name: "100x150 cm", tags: "100x150,100 x 150 cm", order: 4, active: true },
      { name: "Salontafels", tags: "Salontafel", order: 5, active: true },
    ]
    created = 0
    for (const view of listViews) {
      const exists = await prisma.listView.findFirst({
        where: { name: view.name },
      })
      if (!exists) {
        await prisma.listView.create({ data: view })
        created++
      }
    }
    results.listViews = created

    return NextResponse.json({
      success: true,
      message: "Rules en list views gemigreerd!",
      created: results,
    })
  } catch (error) {
    console.error("Seed rules error:", error)
    return NextResponse.json(
      { error: "Seed mislukt", details: String(error) },
      { status: 500 }
    )
  }
}
