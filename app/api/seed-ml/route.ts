import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

/**
 * GET /api/seed-ml
 * Voegt ML (metallic) tag rules en list views toe aan de productie database.
 * Veilig om meerdere keren te draaien — skiptt bestaande records.
 */
export async function GET() {
  try {
    const results: string[] = []

    // === ML Tag Rules ===
    const mlTagRules = [
      { field: "sku", condition: "ends_with", value: "11ML", tag: "40x60 ML", operator: "AND", scope: "product", active: true },
      { field: "sku", condition: "ends_with", value: "13ML", tag: "60x90 ML", operator: "AND", scope: "product", active: true },
      { field: "sku", condition: "ends_with", value: "16ML", tag: "80x120 ML", operator: "AND", scope: "product", active: true },
      { field: "sku", condition: "ends_with", value: "15ML", tag: "100x150 ML", operator: "AND", scope: "product", active: true },
    ]

    for (const rule of mlTagRules) {
      const existing = await prisma.tagRule.findFirst({
        where: { field: rule.field, condition: rule.condition, value: rule.value, tag: rule.tag },
      })
      if (!existing) {
        await prisma.tagRule.create({ data: rule })
        results.push(`✅ Tag rule aangemaakt: SKU ends_with '${rule.value}' → '${rule.tag}'`)
      } else {
        results.push(`⏭️ Tag rule bestaat al: '${rule.value}' → '${rule.tag}'`)
      }
    }

    // === ML List Views ===
    // Haal bestaande views op om juiste volgorde te bepalen
    const existingViews = await prisma.listView.findMany({ orderBy: { order: "desc" } })
    let nextOrder = (existingViews[0]?.order || 0) + 1

    const mlListViews = [
      { name: "40x60 ML", tags: "40x60 ML" },
      { name: "60x90 ML", tags: "60x90 ML" },
      { name: "80x120 ML", tags: "80x120 ML" },
      { name: "100x150 ML", tags: "100x150 ML" },
    ]

    for (const view of mlListViews) {
      const existing = await prisma.listView.findFirst({
        where: { name: view.name },
      })
      if (!existing) {
        await prisma.listView.create({
          data: { ...view, order: nextOrder++, active: true },
        })
        results.push(`✅ List view aangemaakt: '${view.name}'`)
      } else {
        results.push(`⏭️ List view bestaat al: '${view.name}'`)
      }
    }

    // === Herorden list views: gewone formaten en ML naast elkaar ===
    const desiredOrder = [
      "40x60 cm", "40x60 ML",
      "60x90 cm", "60x90 ML",
      "80x120 cm", "80x120 ML",
      "100x150 cm", "100x150 ML",
      "Salontafels",
    ]

    for (let i = 0; i < desiredOrder.length; i++) {
      await prisma.listView.updateMany({
        where: { name: desiredOrder[i] },
        data: { order: i + 1 },
      })
    }
    results.push(`✅ List views herordend: ${desiredOrder.join(", ")}`)

    // === Re-tag alle bestaande printjobs met de nieuwe ML regels ===
    const allJobs = await prisma.printJob.findMany({
      where: { printStatus: { not: "completed" } },
      select: { id: true, sku: true, tags: true, orderNumber: true },
    })

    let retagged = 0
    const tagRules = await prisma.tagRule.findMany({
      where: { active: true, scope: "product" },
      orderBy: [{ tag: "asc" }, { createdAt: "asc" }],
    })

    for (const job of allJobs) {
      if (!job.sku) continue

      const appliedTags: string[] = []
      const rulesByTag = new Map<string, typeof tagRules>()
      for (const rule of tagRules) {
        if (!rulesByTag.has(rule.tag)) rulesByTag.set(rule.tag, [])
        rulesByTag.get(rule.tag)!.push(rule)
      }

      for (const [tag, rules] of rulesByTag) {
        let result = false
        for (let i = 0; i < rules.length; i++) {
          const rule = rules[i]
          let fieldValue: string | null = null
          if (rule.field === "sku") fieldValue = job.sku

          let matches = false
          if (fieldValue) {
            switch (rule.condition) {
              case "starts_with": matches = fieldValue.startsWith(rule.value); break
              case "ends_with": matches = fieldValue.endsWith(rule.value); break
              case "contains": matches = fieldValue.includes(rule.value); break
              case "not_contains": matches = !fieldValue.includes(rule.value); break
              case "equals": matches = fieldValue === rule.value; break
              case "not_equals": matches = fieldValue !== rule.value; break
            }
          }

          if (i === 0) result = matches
          else {
            const prevRule = rules[i - 1]
            if (prevRule.operator === "OR") result = result || matches
            else result = result && matches
          }
        }
        if (result) appliedTags.push(tag)
      }

      const newTags = appliedTags.join(", ")
      if (newTags !== (job.tags || "")) {
        await prisma.printJob.update({
          where: { id: job.id },
          data: { tags: newTags },
        })
        retagged++
      }
    }

    results.push(`✅ ${retagged} van ${allJobs.length} actieve printjobs ge-retagd`)

    return NextResponse.json({
      success: true,
      message: "ML tag rules, list views aangemaakt en printjobs ge-retagd",
      details: results,
    })
  } catch (error: any) {
    console.error("❌ Seed ML error:", error)
    return NextResponse.json(
      { error: error.message || "Fout bij aanmaken ML rules" },
      { status: 500 }
    )
  }
}
