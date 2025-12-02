import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { GoedGepicktAPI } from "@/lib/goedgepickt"

export async function POST(request: NextRequest) {
  try {
    // Check if user is authenticated and is admin
    const session = await auth()
    
    if (!session || session.user.role !== "admin") {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      )
    }

    console.log("🔄 Starting OrderStatus sync...")

    // Haal API key op uit settings
    const apiKeySetting = await prisma.setting.findUnique({
      where: { key: "goedgepickt_api_key" },
    })

    if (!apiKeySetting || !apiKeySetting.value) {
      console.error("❌ GoedGepickt API key niet geconfigureerd")
      return NextResponse.json(
        { 
          success: false,
          error: "GoedGepickt API key niet geconfigureerd in settings"
        },
        { status: 500 }
      )
    }

    // Initialiseer GoedGepickt API client
    const api = new GoedGepicktAPI(apiKeySetting.value)

    // Haal alle unieke orderUuids op die gesynchroniseerd moeten worden
    // We gebruiken hier distinct op orderUuid om duplicaten te vermijden
    const ordersToSync = await prisma.printJob.findMany({
      where: {
        orderUuid: {
          not: null
        },
        OR: [
          { orderStatus: null },  // Printjobs zonder status
          { 
            AND: [
              { orderStatus: { not: null } },
              { orderStatus: { notIn: ['completed', 'cancelled'] } }
            ]
          }
        ]
      },
      select: {
        orderUuid: true,
        orderStatus: true,
      },
      distinct: ['orderUuid']
    })
    
    // Sorteer zodat orders met null status als eerst komen
    const sortedOrders = ordersToSync.sort((a, b) => {
      if (a.orderStatus === null && b.orderStatus !== null) return -1
      if (a.orderStatus !== null && b.orderStatus === null) return 1
      return 0
    })
    
    const orderUuids = sortedOrders.map(job => job.orderUuid).filter(Boolean) as string[]
    console.log(`📦 Found ${orderUuids.length} unique orders to sync (null status prioritized)`)

    if (orderUuids.length === 0) {
      return NextResponse.json({
        success: true,
        message: "Geen orders gevonden om te synchroniseren",
        updated: 0,
        errors: 0
      })
    }

    let updatedCount = 0
    let errorCount = 0
    const errors: string[] = []

    // Process orders sequentially with delays to avoid rate limiting
    const DELAY_BETWEEN_ORDERS_MS = 300 // 300ms delay between each order
    
    console.log(`🔄 Starting sequential sync of ${orderUuids.length} orders (${DELAY_BETWEEN_ORDERS_MS}ms delay between orders)`)
    
    for (let i = 0; i < orderUuids.length; i++) {
      const orderUuid = orderUuids[i]
      const progress = `[${i + 1}/${orderUuids.length}]`
      
      try {
        console.log(`${progress} 📦 Syncing order: ${orderUuid}`)
        
        // Haal order data op uit GoedeGepickt
        const order = await api.getOrder(orderUuid)
        
        if (!order) {
          console.warn(`${progress} ⚠️  Order ${orderUuid} niet gevonden in GoedeGepickt`)
          errors.push(`Order ${orderUuid} niet gevonden`)
          errorCount++
          continue
        }

        const newOrderStatus = order.status
        
        if (!newOrderStatus) {
          console.warn(`${progress} ⚠️  Geen status gevonden voor order ${orderUuid}`)
          errors.push(`Geen status voor order ${orderUuid}`)
          errorCount++
          continue
        }

        // Check hoeveel printjobs deze order heeft
        const jobCount = await prisma.printJob.count({
          where: { orderUuid }
        })
        console.log(`${progress}    📋 Order ${orderUuid} heeft ${jobCount} printjobs, nieuwe status: ${newOrderStatus}`)
        
        // Update ALLE printjobs voor deze order naar de nieuwe status
        // Maar skip jobs die al completed of cancelled zijn (finale statussen)
        const updateResult = await prisma.printJob.updateMany({
          where: { 
            orderUuid,
            OR: [
              { orderStatus: null },  // Update jobs zonder status
              { 
                AND: [
                  { orderStatus: { not: null } },
                  { orderStatus: { notIn: ['completed', 'cancelled'] } }  // Skip finale statussen
                ]
              }
            ]
          },
          data: { orderStatus: newOrderStatus }
        })
        
        if (updateResult.count > 0) {
          console.log(`${progress}    ✅ Updated ${updateResult.count} printjobs`)
          updatedCount += updateResult.count
        } else {
          console.log(`${progress}    ℹ️  No printjobs needed update (already correct status)`)
        }

        // Delay between orders to prevent rate limiting (except after last order)
        if (i < orderUuids.length - 1) {
          await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_ORDERS_MS))
        }

      } catch (error) {
        console.error(`${progress} ❌ Error syncing order ${orderUuid}:`, error)
        errors.push(`Order ${orderUuid}: ${error}`)
        errorCount++
        
        // Continue with delay even on error
        if (i < orderUuids.length - 1) {
          await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_ORDERS_MS))
        }
      }
    }

    console.log(`✅ OrderStatus sync completed: ${updatedCount} printjobs updated, ${errorCount} errors`)

    return NextResponse.json({
      success: true,
      message: `OrderStatus sync voltooid: ${updatedCount} printjobs bijgewerkt`,
      uniqueOrders: orderUuids.length,
      updated: updatedCount,
      errors: errorCount,
      errorDetails: errors.length > 0 ? errors.slice(0, 10) : undefined // Limit error details
    })

  } catch (error) {
    console.error("Error during OrderStatus sync:", error)
    return NextResponse.json(
      { 
        success: false,
        error: "Sync failed: " + String(error) 
      },
      { status: 500 }
    )
  }
}