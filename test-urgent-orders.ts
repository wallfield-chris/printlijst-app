import { PrismaClient } from '@prisma/client'
import { GoedGepicktAPI } from './lib/goedgepickt'

const prisma = new PrismaClient()

async function main() {
  const setting = await prisma.setting.findUnique({
    where: { key: 'goedgepickt_api_key' }
  })
  
  if (!setting?.value) return
  
  const api = new GoedGepicktAPI(setting.value)

  // Check of die orders nog in de DB staan
  const orderNumbers = ['SE128829', 'SE128830', 'FR70819']
  for (const num of orderNumbers) {
    const jobs = await prisma.printJob.findMany({
      where: { orderNumber: num },
      select: { orderNumber: true, productName: true, sku: true, priority: true, orderUuid: true }
    })
    console.log(`\n${num}: ${jobs.length} jobs in DB`)
    jobs.forEach(j => console.log(`  ${j.productName} (${j.sku}) priority: ${j.priority}`))
  }

  // Haal FR70819 op uit GoedGepickt om te zien wat erin zit
  console.log('\n\n=== FR70819 details uit GoedGepickt ===')
  const orders = await api.getOrders({ orderstatus: 'backorder', createdAfter: '2026-02-16' })
  
  const targetOrders = orders.filter(o => 
    ['SE128829', 'SE128830', 'FR70819'].includes(o.externalDisplayId || '')
  )
  
  for (const order of targetOrders) {
    console.log(`\nOrder: ${order.externalDisplayId} (status: ${order.status})`)
    console.log(`Products: ${order.products?.length}`)
    for (const p of order.products || []) {
      console.log(`  - ${p.productName} (SKU: ${p.sku})`)
      console.log(`    type: ${p.type}, qty: ${p.productQuantity}, picked: ${p.pickedQuantity}`)
      
      // Check stock
      if (p.productUuid) {
        try {
          const details = await api.getProduct(p.productUuid)
          const freeStock = details?.stock?.freeStock ?? (details as any)?.freeStock ?? 'N/A'
          console.log(`    freeStock: ${freeStock}`)
        } catch (e) {
          console.log(`    stock check failed`)
        }
      }
    }
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
