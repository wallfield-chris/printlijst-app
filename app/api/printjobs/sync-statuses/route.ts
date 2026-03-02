import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { GoedGepicktAPI } from "@/lib/goedgepickt"

const COMPLETED_STATUSES = ["completed", "cancelled", "shipped"]

/**
 * POST /api/printjobs/sync-statuses
 * Controleert voor alle actieve printjobs de huidige status in GoedGepickt.
 * Verwijdert printjobs waarvan de order afgerond of geannuleerd is.
 * Toegankelijk voor alle ingelogde gebruikers (niet alleen admin).
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth()

    if (!session) {
      return NextResponse.json({ error: "Niet geautoriseerd" }, { status: 401 })
    }

    const apiKeySetting = await prisma.setting.findUnique({
      where: { key: "goedgepickt_api_key" },
    })

    if (!apiKeySetting?.value) {
      return NextResponse.json(
        { error: "GoedGepickt API key niet geconfigureerd" },
        { status: 500 }
      )
    }

    const api = new GoedGepicktAPI(apiKeySetting.value)

    // Haal alle unieke orderUuids op van niet-afgeronde printjobs
    // Inclusief sku en productUuid per job (nodig voor stock check)
    const activeOrders = await prisma.printJob.findMany({
      where: {
        orderUuid: { not: null },
        OR: [
          { orderStatus: null },
          { orderStatus: { notIn: COMPLETED_STATUSES } },
        ],
      },
      select: { id: true, orderUuid: true, sku: true, productUuid: true, quantity: true },
    })

    // Groepeer per orderUuid
    const orderMap = new Map<string, typeof activeOrders>()
    for (const job of activeOrders) {
      const key = job.orderUuid!
      if (!orderMap.has(key)) orderMap.set(key, [])
      orderMap.get(key)!.push(job)
    }

    const orderUuids = Array.from(orderMap.keys())

    if (orderUuids.length === 0) {
      return NextResponse.json({
        success: true,
        message: "Geen actieve orders gevonden",
        checked: 0,
        deleted: 0,
        updated: 0,
      })
    }

    let deletedCount = 0
    let updatedCount = 0
    const DELAY_MS = 200 // 200ms tussen requests om rate limiting te voorkomen

    for (let i = 0; i < orderUuids.length; i++) {
      const orderUuid = orderUuids[i]
      const jobs = orderMap.get(orderUuid)!

      try {
        const order = await api.getOrder(orderUuid)

        if (!order) continue

        const newStatus = order.status

        if (!newStatus) continue

        if (COMPLETED_STATUSES.includes(newStatus)) {
          // Order is afgerond → verwijder alle bijbehorende printjobs
          const result = await prisma.printJob.deleteMany({
            where: { orderUuid },
          })
          deletedCount += result.count
          console.log(
            `🗑️  Order ${orderUuid} is '${newStatus}' → ${result.count} printjob(s) verwijderd`
          )
        } else {
          // Update status als die veranderd is
          const statusResult = await prisma.printJob.updateMany({
            where: { orderUuid, orderStatus: { not: newStatus } },
            data: { orderStatus: newStatus },
          })
          if (statusResult.count > 0) {
            updatedCount += statusResult.count
            console.log(`🔄 Order ${orderUuid} → status '${newStatus}' (${statusResult.count} printjobs geüpdated)`)
          }

          // Bouw een map van productUuid → product uit de live order response
          // pickedQuantity >= productQuantity = al volledig gepickt/verzonden = niet meer printen
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
              console.log(`   ✅ Al verzonden, verwijderd: ${job.sku} (picked: ${picked}/${needed})`)
            }
          }
        }
      } catch (err) {
        console.warn(`⚠️  Kon status niet ophalen voor order ${orderUuid}:`, err)
      }

      if (i < orderUuids.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, DELAY_MS))
      }
    }

    return NextResponse.json({
      success: true,
      message: `Statussen bijgewerkt: ${deletedCount} afgeronde orders verwijderd, ${updatedCount} printjobs geüpdated`,
      checked: orderUuids.length,
      deleted: deletedCount,
      updated: updatedCount,
    })
  } catch (error: any) {
    console.error("❌ Fout bij sync-statuses:", error)
    return NextResponse.json(
      { error: "Fout bij ophalen van statussen: " + error.message },
      { status: 500 }
    )
  }
}
