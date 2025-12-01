const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function main() {
  // Alle unieke orderUuids (ongeacht status)
  const allUniqueOrders = await prisma.printJob.findMany({
    where: { orderUuid: { not: null } },
    select: { orderUuid: true },
    distinct: ['orderUuid']
  })
  
  // Unieke orders met NULL status
  const ordersWithNullStatus = await prisma.printJob.findMany({
    where: { 
      orderUuid: { not: null },
      orderStatus: null
    },
    select: { orderUuid: true },
    distinct: ['orderUuid']
  })
  
  // Unieke orders met completed/cancelled
  const ordersCompleted = await prisma.printJob.findMany({
    where: { 
      orderUuid: { not: null },
      orderStatus: { in: ['completed', 'cancelled'] }
    },
    select: { orderUuid: true },
    distinct: ['orderUuid']
  })
  
  console.log('📊 Order statistieken:')
  console.log(`  • Totaal unieke orders: ${allUniqueOrders.length}`)
  console.log(`  • Unieke orders met NULL status: ${ordersWithNullStatus.length}`)
  console.log(`  • Unieke orders met completed/cancelled: ${ordersCompleted.length}`)
  console.log(`  • Zouden gesynct moeten worden: ${ordersWithNullStatus.length}`)
}

main().finally(() => prisma.$disconnect())
