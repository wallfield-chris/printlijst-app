import { prisma } from "../lib/prisma"

async function main() {
  console.log("📅 Updating order dates for existing printjobs...\n")

  // Haal alle printjobs op met webhookData
  const printJobs = await prisma.printJob.findMany({
    where: {
      webhookData: {
        not: null
      }
    }
  })

  console.log(`📦 Found ${printJobs.length} printjobs with webhook data`)

  let updatedCount = 0
  let skippedCount = 0
  let errorCount = 0

  for (const job of printJobs) {
    try {
      if (!job.webhookData) {
        skippedCount++
        continue
      }

      // Parse webhook data
      const webhookData = JSON.parse(job.webhookData)
      const order = webhookData.order

      if (!order || !order.createDate) {
        console.log(`⚠️  ${job.orderNumber} - Geen createDate gevonden in webhook data`)
        skippedCount++
        continue
      }

      // Parse de createDate
      const orderDate = new Date(order.createDate)
      
      // Vergelijk met huidige receivedAt
      const currentDate = new Date(job.receivedAt)
      
      // Skip als de datums al hetzelfde zijn (binnen 1 seconde verschil)
      const timeDiff = Math.abs(orderDate.getTime() - currentDate.getTime())
      if (timeDiff < 1000) {
        skippedCount++
        continue
      }

      // Update de printjob
      await prisma.printJob.update({
        where: { id: job.id },
        data: { receivedAt: orderDate }
      })

      console.log(`✅ ${job.orderNumber} - ${job.productName}`)
      console.log(`   Oud: ${currentDate.toLocaleString("nl-NL")} → Nieuw: ${orderDate.toLocaleString("nl-NL")}`)
      
      updatedCount++
    } catch (error: any) {
      console.error(`❌ Error updating ${job.orderNumber}:`, error.message)
      errorCount++
    }
  }

  console.log(`\n🎉 Klaar!`)
  console.log(`   ✅ ${updatedCount} printjobs bijgewerkt`)
  console.log(`   ⏭️  ${skippedCount} overgeslagen (geen wijziging nodig)`)
  if (errorCount > 0) {
    console.log(`   ❌ ${errorCount} fouten`)
  }
}

main()
  .catch((e) => {
    console.error("❌ Fout:", e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
