import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const allJobs = await prisma.printJob.findMany({
    where: { webhookData: { not: null } }
  })
  
  let updated = 0
  const processedOrders = new Set<string>()
  
  for (const job of allJobs) {
    if (!job.webhookData || !job.orderUuid || processedOrders.has(job.orderUuid)) continue
    
    try {
      const data = JSON.parse(job.webhookData)
      const order = data.order
      if (!order?.products) continue
      
      const hasNextDay = order.products.some((p: any) => 
        p.sku && p.sku.toUpperCase().includes('SHIPPING-NEXT-DAY')
      )
      
      if (hasNextDay && job.priority !== 'urgent') {
        const result = await prisma.printJob.updateMany({
          where: { orderUuid: job.orderUuid },
          data: { priority: 'urgent' }
        })
        console.log(`✅ Updated ${result.count} jobs to urgent for order ${job.orderNumber}`)
        updated += result.count
        processedOrders.add(job.orderUuid)
      }
    } catch (e) {}
  }
  
  console.log(`\n🎉 Total updated to urgent: ${updated}`)
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
