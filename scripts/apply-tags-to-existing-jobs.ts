import { prisma } from "../lib/prisma"

async function applyTagRules(sku: string | null, existingTags: string | null): Promise<string> {
  if (!sku) return existingTags || ""

  // Haal actieve tag regels op
  const tagRules = await prisma.tagRule.findMany({
    where: { 
      active: true,
      field: "sku"
    }
  })

  const appliedTags: string[] = []
  
  // Voeg bestaande tags toe
  if (existingTags) {
    appliedTags.push(...existingTags.split(",").map(t => t.trim()).filter(t => t))
  }

  // Pas elke regel toe
  for (const rule of tagRules) {
    let matches = false

    switch (rule.condition) {
      case "starts_with":
        matches = sku.startsWith(rule.value)
        break
      case "ends_with":
        matches = sku.endsWith(rule.value)
        break
      case "contains":
        matches = sku.includes(rule.value)
        break
      case "equals":
        matches = sku === rule.value
        break
    }

    if (matches && !appliedTags.includes(rule.tag)) {
      appliedTags.push(rule.tag)
    }
  }

  return appliedTags.join(", ")
}

async function main() {
  console.log("🏷️  Tag regels toepassen op bestaande printjobs...")

  // Haal alle printjobs op met een SKU
  const printJobs = await prisma.printJob.findMany({
    where: {
      sku: {
        not: null
      }
    }
  })

  console.log(`📦 ${printJobs.length} printjobs gevonden met SKU`)

  let updatedCount = 0

  for (const job of printJobs) {
    const oldTags = job.tags
    const newTags = await applyTagRules(job.sku, job.tags)

    if (newTags !== oldTags) {
      await prisma.printJob.update({
        where: { id: job.id },
        data: { tags: newTags }
      })

      console.log(`✅ ${job.orderNumber} - ${job.productName} (${job.sku})`)
      console.log(`   Oud: "${oldTags || "(geen)"}" → Nieuw: "${newTags}"`)
      updatedCount++
    }
  }

  console.log(`\n🎉 Klaar! ${updatedCount} printjobs bijgewerkt`)
}

main()
  .catch((e) => {
    console.error("❌ Fout:", e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
