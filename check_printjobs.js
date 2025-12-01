const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function main() {
  const allWithUuid = await prisma.printJob.count({
    where: { orderUuid: { not: null } }
  })
  
  const withNullStatus = await prisma.printJob.count({
    where: { 
      orderUuid: { not: null },
      orderStatus: null
    }
  })
  
  const withCompletedOrCancelled = await prisma.printJob.count({
    where: { 
      orderUuid: { not: null },
      orderStatus: { in: ['completed', 'cancelled'] }
    }
  })
  
  // Check hoeveel unieke orderUuids er zijn
  const uniqueOrders = await prisma.printJob.findMany({
    where: { 
      orderUuid: { not: null },
      NOT: { orderStatus: { in: ['completed', 'cancelled'] } }
    },
    select: { orderUuid: true },
    distinct: ['orderUuid']
  })
  
  console.log('📊 Printjob statistieken:')
  console.log(`  • Totaal met orderUuid: ${allWithUuid}`)
  console.log(`  • Met NULL orderStatus: ${withNullStatus}`)
  console.log(`  • Met completed/cancelled: ${withCompletedOrCancelled}`)
  console.log(`  • Unieke orders (niet completed/cancelled): ${uniqueOrders.length}`)
}

main().finally(() => prisma.$disconnect())
