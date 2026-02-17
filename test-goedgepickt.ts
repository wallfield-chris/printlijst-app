import { PrismaClient } from '@prisma/client'
import { GoedGepicktAPI } from './lib/goedgepickt'

const prisma = new PrismaClient()

async function test() {
  try {
    console.log('🔍 Testing GoedGepickt API...\n')

    // Haal API key op
    const apiKeySetting = await prisma.setting.findUnique({
      where: { key: "goedgepickt_api_key" },
    })

    if (!apiKeySetting || !apiKeySetting.value) {
      console.error('❌ No API key found in database')
      return
    }

    console.log(`✅ API Key found: ${apiKeySetting.value.substring(0, 15)}...`)

    const api = new GoedGepicktAPI(apiKeySetting.value)

    // Test 1: Basis connectie
    console.log('\n📡 Test 1: Testing connection...')
    const connected = await api.testConnection()
    console.log(connected ? '✅ Connection OK' : '❌ Connection failed')

    // Test 2: Haal orders op zonder filter
    console.log('\n📡 Test 2: Fetching orders (no filter)...')
    const allOrders = await api.getOrders({ limit: 5 })
    console.log(`✅ Found ${allOrders.length} orders`)
    
    if (allOrders.length > 0) {
      console.log('\n📦 Sample order:')
      const sample = allOrders[0]
      console.log(`  UUID: ${sample.uuid}`)
      console.log(`  Order #: ${sample.orderNumber || sample.externalDisplayId}`)
      console.log(`  Status: ${sample.status}`)
      console.log(`  Products: ${sample.products?.length || 0}`)
    }

    // Test 3: Haal backorder orders op
    console.log('\n📡 Test 3: Fetching backorder orders (with per_page=200)...')
    const backorderOrders = await api.getOrders({ orderstatus: 'backorder', per_page: 200 })
    console.log(`✅ Found ${backorderOrders.length} backorder orders`)

    if (backorderOrders.length > 0) {
      console.log('\n📦 First 3 backorder orders:')
      backorderOrders.slice(0, 3).forEach((order, i) => {
        console.log(`  ${i + 1}. ${order.orderNumber || order.externalDisplayId} (${order.products?.length || 0} products)`)
      })
    } else {
      console.log('⚠️  No backorder orders found')
      console.log('💡 Check if there are orders in the backorder view in your GoedGepickt account')
    }

    // Test 4: Check exclusion rules
    console.log('\n📡 Test 4: Checking exclusion rules...')
    const exclusionRules = await prisma.exclusionRule.findMany({
      where: { active: true }
    })
    console.log(`✅ Found ${exclusionRules.length} active exclusion rules:`)
    exclusionRules.forEach(rule => {
      console.log(`  - ${rule.field} ${rule.condition} "${rule.value}" ${rule.reason ? `(${rule.reason})` : ''}`)
    })

    // Test 5: Simulate exclusion logic
    if (backorderOrders.length > 0) {
      console.log('\n📡 Test 5: Simulating exclusion logic on backorder orders...')
      
      let totalProducts = 0
      let excludedProducts = 0
      let duplicateOrders = 0
      
      for (const order of backorderOrders) {
        // Check if already imported
        const existing = await prisma.printJob.findMany({
          where: { orderUuid: order.uuid }
        })
        
        if (existing.length > 0) {
          duplicateOrders++
          console.log(`   ⏭️  Order ${order.orderNumber || order.uuid} already imported`)
          continue
        }
        
        if (order.products && order.products.length > 0) {
          for (const product of order.products) {
            if (product.type === "parent") continue
            
            totalProducts++
            const sku = product.sku || ""
            
            // Check exclusion
            let excluded = false
            for (const rule of exclusionRules) {
              if (rule.field === "sku") {
                if (rule.condition === "starts_with" && sku.startsWith(rule.value)) {
                  excluded = true
                  console.log(`   ⛔ Would exclude: ${sku} - ${product.productName} (${rule.reason})`)
                  break
                }
              }
            }
            
            if (excluded) {
              excludedProducts++
            } else {
              console.log(`   ✅ Would import: ${sku} - ${product.productName}`)
            }
          }
        }
      }
      
      console.log(`\n📊 Summary:`)
      console.log(`   Total orders fetched: ${backorderOrders.length}`)
      console.log(`   Duplicate orders: ${duplicateOrders}`)
      console.log(`   Total products: ${totalProducts}`)
      console.log(`   Excluded products: ${excludedProducts}`)
      console.log(`   Would import: ${totalProducts - excludedProducts} products`)
    }

  } catch (error) {
    console.error('❌ Error:', error)
  } finally {
    await prisma.$disconnect()
  }
}

test()
