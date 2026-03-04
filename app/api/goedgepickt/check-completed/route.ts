import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { GoedGepicktAPI } from "@/lib/goedgepickt"

/**
 * GET /api/goedgepickt/check-completed
 * 
 * Lightweight achtergrond-check: controleert of actieve printjobs
 * een afgeronde/geannuleerde/verzonden order hebben in GoedGepickt.
 * Verwijdert deze printjobs ONMIDDELLIJK zodat ze niet meer geprint kunnen worden.
 * 
 * Server-side rate limit: max 1x per 30 seconden.
 * Wordt automatisch elke 30s aangeroepen door de printjobs pagina.
 */

const COMPLETED_STATUSES = ["completed", "cancelled", "shipped"]
const CHECK_INTERVAL_MS = 30_000 // 30 seconden
const DELAY_BETWEEN_ORDERS_MS = 100 // 100ms tussen API calls

// In-memory rate limiting
let lastCheckTime = 0
let lastCheckResult: {
  checked: number
  deleted: number
  updated: number
  deletedOrders: string[]
} | null = null

export async function GET(request: NextRequest) {
  const now = Date.now()
  const timeSinceLastCheck = now - lastCheckTime

  // Rate limit: als laatste check < 30s geleden, return cached result
  if (timeSinceLastCheck < CHECK_INTERVAL_MS && lastCheckResult) {
    return NextResponse.json({
      success: true,
      cached: true,
      nextCheckIn: Math.ceil((CHECK_INTERVAL_MS - timeSinceLastCheck) / 1000),
      ...lastCheckResult,
    })
  }

  try {
    // Haal API key op
    const apiKeySetting = await prisma.setting.findUnique({
      where: { key: "goedgepickt_api_key" },
    })

    if (!apiKeySetting?.value) {
      return NextResponse.json({
        success: true,
        checked: 0,
        deleted: 0,
        updated: 0,
        deletedOrders: [],
      })
    }

    const api = new GoedGepicktAPI(apiKeySetting.value)

    // Haal alle unieke orderUuids op van actieve printjobs
    const activeJobs = await prisma.printJob.findMany({
      where: {
        orderUuid: { not: null },
        printStatus: { not: "pushed" },
        OR: [
          { orderStatus: null },
          { orderStatus: { notIn: COMPLETED_STATUSES } },
        ],
      },
      select: {
        id: true,
        orderUuid: true,
        sku: true,
        productUuid: true,
        quantity: true,
        orderStatus: true,
      },
    })

    // Groepeer per orderUuid
    const orderMap = new Map<string, typeof activeJobs>()
    for (const job of activeJobs) {
      const key = job.orderUuid!
      if (!orderMap.has(key)) orderMap.set(key, [])
      orderMap.get(key)!.push(job)
    }

    const orderUuids = Array.from(orderMap.keys())

    if (orderUuids.length === 0) {
      lastCheckTime = now
      lastCheckResult = { checked: 0, deleted: 0, updated: 0, deletedOrders: [] }
      return NextResponse.json({ success: true, ...lastCheckResult })
    }

    let deletedCount = 0
    let updatedCount = 0
    const deletedOrders: string[] = []

    for (let i = 0; i < orderUuids.length; i++) {
      const orderUuid = orderUuids[i]
      const jobs = orderMap.get(orderUuid)!

      try {
        const order = await api.getOrder(orderUuid)
        if (!order) continue

        const newStatus = order.status
        if (!newStatus) continue

        if (COMPLETED_STATUSES.includes(newStatus)) {
          // Order is afgerond/verzonden/geannuleerd → DIRECT verwijderen
          const result = await prisma.printJob.deleteMany({
            where: { orderUuid },
          })
          deletedCount += result.count
          deletedOrders.push(orderUuid)
          console.log(
            `🗑️  [auto-check] Order ${orderUuid} is '${newStatus}' → ${result.count} printjob(s) VERWIJDERD`
          )
        } else {
          // Update orderStatus als die veranderd is
          const statusResult = await prisma.printJob.updateMany({
            where: { orderUuid, orderStatus: { not: newStatus } },
            data: { orderStatus: newStatus },
          })
          if (statusResult.count > 0) {
            updatedCount += statusResult.count
          }

          // Check of individuele producten al gepickt/verzonden zijn
          const productMap = new Map<string, any>()
          if (order.products && Array.isArray(order.products)) {
            for (const p of order.products) {
              if (p.productUuid) productMap.set(p.productUuid, p)
            }
          }

          for (const job of jobs) {
            if (!job.productUuid) continue
            const liveProduct = productMap.get(job.productUuid)
            if (!liveProduct) continue

            const picked = liveProduct.pickedQuantity ?? 0
            const needed = liveProduct.productQuantity ?? job.quantity ?? 1

            if (picked >= needed) {
              await prisma.printJob.delete({ where: { id: job.id } })
              deletedCount++
              console.log(
                `   ✅ [auto-check] Product ${job.sku} al verzonden (picked: ${picked}/${needed}) → VERWIJDERD`
              )
              continue
            }

            // Voorraad-allocatie wordt door auto-sync afgehandeld (elke 2 min)
            // check-completed focust alleen op completed orders en gepickte producten
          }
        }
      } catch (err) {
        // Silently continue — een fout bij 1 order mag niet alles blokkeren
      }

      // Kleine pauze tussen API calls
      if (i < orderUuids.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, DELAY_BETWEEN_ORDERS_MS))
      }
    }

    lastCheckTime = now
    lastCheckResult = { checked: orderUuids.length, deleted: deletedCount, updated: updatedCount, deletedOrders }

    if (deletedCount > 0) {
      console.log(
        `🔍 [auto-check] ${orderUuids.length} orders gecheckt → ${deletedCount} printjobs verwijderd`
      )
    }

    return NextResponse.json({ success: true, ...lastCheckResult })
  } catch (error: any) {
    console.error("❌ [auto-check] Error:", error.message)
    lastCheckTime = now // Prevent rapid retries on error
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }
}
