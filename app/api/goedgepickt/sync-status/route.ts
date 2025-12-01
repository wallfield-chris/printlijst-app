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

    // Haal alle printjobs op die een orderUuid hebben
    // Skip alleen orders die al completed of cancelled zijn (niet null)
    const printJobs = await prisma.printJob.findMany({
      where: {
        orderUuid: {
          not: null
        },
        NOT: {
          orderStatus: {
            in: ['completed', 'cancelled']
          }
        }
      },
      select: {
        id: true,
        orderUuid: true,
        orderStatus: true,
        productName: true,
        orderNumber: true
      }
    })

    console.log(`📦 Found ${printJobs.length} printjobs with orderUuid`)

    if (printJobs.length === 0) {
      return NextResponse.json({
        success: true,
        message: "Geen printjobs gevonden om te synchroniseren",
        updated: 0,
        errors: 0
      })
    }

    // Groepeer printjobs per orderUuid om duplicaat API calls te voorkomen
    const orderUuids = [...new Set(printJobs.map(job => job.orderUuid).filter(Boolean))] as string[]
    console.log(`🔍 Checking ${orderUuids.length} unique orders...`)

    let updatedCount = 0
    let errorCount = 0
    const errors: string[] = []

    // Process orders in batches to avoid overwhelming the API
    const batchSize = 10
    for (let i = 0; i < orderUuids.length; i += batchSize) {
      const batch = orderUuids.slice(i, i + batchSize)
      
      await Promise.all(batch.map(async (orderUuid) => {
        try {
          console.log(`📦 Syncing order: ${orderUuid}`)
          
          // Haal order data op uit GoedeGepickt
          const order = await api.getOrder(orderUuid)
          
          if (!order) {
            console.warn(`⚠️  Order ${orderUuid} niet gevonden in GoedeGepickt`)
            errors.push(`Order ${orderUuid} niet gevonden`)
            errorCount++
            return
          }

          const newOrderStatus = order.status
          
          if (!newOrderStatus) {
            console.warn(`⚠️  Geen status gevonden voor order ${orderUuid}`)
            return
          }

          // Skip als de nieuwe status completed of cancelled is en we al die status hebben
          const jobsForOrder = printJobs.filter(job => job.orderUuid === orderUuid)
          
          // Check of een van de jobs al completed of cancelled is
          const hasCompletedOrCancelledStatus = jobsForOrder.some(job => 
            job.orderStatus === 'completed' || job.orderStatus === 'cancelled'
          )
          
          if (hasCompletedOrCancelledStatus && (newOrderStatus === 'completed' || newOrderStatus === 'cancelled')) {
            console.log(`⏭️  Skipping order ${orderUuid} - already has final status`)
            return
          }
          
          // Check of status update nodig is
          const needsUpdate = jobsForOrder.some(job => job.orderStatus !== newOrderStatus)
          
          if (needsUpdate) {
            console.log(`🔄 Updating ${jobsForOrder.length} printjobs: ${jobsForOrder[0].orderStatus || 'null'} → ${newOrderStatus}`)
            
            // Update alle printjobs voor deze order
            const updateResult = await prisma.printJob.updateMany({
              where: { orderUuid },
              data: { orderStatus: newOrderStatus }
            })
            
            updatedCount += updateResult.count
          } else {
            console.log(`✅ Order ${orderUuid} status already up to date (${newOrderStatus})`)
          }

        } catch (error) {
          console.error(`❌ Error syncing order ${orderUuid}:`, error)
          errors.push(`Error voor order ${orderUuid}: ${error}`)
          errorCount++
        }
      }))
      
      // Small delay between batches to be nice to the API
      if (i + batchSize < orderUuids.length) {
        await new Promise(resolve => setTimeout(resolve, 100))
      }
    }

    const duration = Date.now() - Date.now()
    console.log(`✅ OrderStatus sync completed: ${updatedCount} printjobs updated, ${errorCount} errors`)

    return NextResponse.json({
      success: true,
      message: `OrderStatus sync voltooid in ${Math.round(duration / 1000)}s`,
      totalPrintJobs: printJobs.length,
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