import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { GoedGepicktAPI } from "@/lib/goedgepickt"

// Statussen die NIET meer geprint hoeven te worden
// Alles behalve 'backorder' wordt verwijderd
const KEEP_STATUSES = ["backorder"]

type SendFn = (data: Record<string, any>) => void
const noopSend: SendFn = () => {}

/**
 * POST /api/printjobs/sync-statuses
 * Controleert voor alle actieve printjobs de huidige status in GoedGepickt.
 * Verwijdert printjobs waarvan de order NIET meer in backorder is (in de wacht, afgerond, etc.).
 * Verwijdert ook producten die al gepickt zijn of op voorraad zijn.
 * Toegankelijk voor alle ingelogde gebruikers (niet alleen admin).
 * 
 * Query params:
 *  - stream: "true" — gebruik SSE streaming voor real-time voortgang
 */
export async function POST(request: NextRequest) {
  const url = new URL(request.url)
  const useStream = url.searchParams.get("stream") === "true"

  if (useStream) {
    return handleStreamingSync(request)
  }

  return handleJsonSync(request)
}

async function handleStreamingSync(request: NextRequest) {
  const session = await auth()
  if (!session) {
    return NextResponse.json({ error: "Niet geautoriseerd" }, { status: 401 })
  }

  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: Record<string, any>) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
        } catch { /* stream closed */ }
      }

      try {
        await runSyncStatusesLogic(send)
      } catch (error) {
        send({ type: "error", message: `Fout: ${error instanceof Error ? error.message : String(error)}` })
      } finally {
        controller.close()
      }
    }
  })

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    },
  })
}

async function handleJsonSync(request: NextRequest) {
  try {
    const session = await auth()
    if (!session) {
      return NextResponse.json({ error: "Niet geautoriseerd" }, { status: 401 })
    }

    const result = await runSyncStatusesLogic()
    return NextResponse.json(result)
  } catch (error: any) {
    console.error("❌ Fout bij sync-statuses:", error)
    return NextResponse.json(
      { error: "Fout bij ophalen van statussen: " + error.message },
      { status: 500 }
    )
  }
}

async function runSyncStatusesLogic(send: SendFn = noopSend) {
  send({ type: "start", step: 0, totalSteps: 2, message: "Statussen controleren..." })

  const apiKeySetting = await prisma.setting.findUnique({
    where: { key: "goedgepickt_api_key" },
  })

  if (!apiKeySetting?.value) {
    throw new Error("GoedGepickt API key niet geconfigureerd")
  }

  const api = new GoedGepicktAPI(apiKeySetting.value)

  // Haal alle actieve printjobs op die we moeten controleren
  // Inclusief stock_covered: deze moeten ook gecheckt worden op statuswijzigingen
  const activeOrders = await prisma.printJob.findMany({
    where: {
      orderUuid: { not: null },
      printStatus: { in: ["pending", "in_progress", "stock_covered"] },
    },
    select: { id: true, orderUuid: true, sku: true, productUuid: true, quantity: true, printStatus: true },
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
    send({ type: "done", step: 2, totalSteps: 2, message: "Geen actieve orders gevonden" })
    return {
      success: true,
      message: "Geen actieve orders gevonden",
      checked: 0,
      deleted: 0,
      updated: 0,
    }
  }

  send({ type: "progress", step: 1, totalSteps: 2, message: "Statussen controleren...", detail: `${orderUuids.length} orders controleren` })

  let deletedCount = 0
  let updatedCount = 0
  const DELAY_MS = 200 // 200ms tussen requests om rate limiting te voorkomen

  for (let i = 0; i < orderUuids.length; i++) {
    const orderUuid = orderUuids[i]
    const jobs = orderMap.get(orderUuid)!

    // Elke 3 orders een progress update
    if (i % 3 === 0) {
      send({ type: "progress", step: 1, totalSteps: 2, message: "Statussen controleren...", detail: `Order ${i + 1} van ${orderUuids.length}` })
    }

    try {
      const order = await api.getOrder(orderUuid)

      if (!order) continue

      const newStatus = order.status

      if (!newStatus) continue

      if (!KEEP_STATUSES.includes(newStatus)) {
        // Order is NIET meer backorder (bijv. in de wacht, afgerond, verzonden, geannuleerd)
        // → verwijder alle bijbehorende printjobs
        const result = await prisma.printJob.deleteMany({
          where: { orderUuid },
        })
        deletedCount += result.count
        console.log(
          `🗑️  Order ${orderUuid} is '${newStatus}' (niet meer backorder) → ${result.count} printjob(s) verwijderd`
        )
      } else {
        // Nog steeds backorder — update status en controleer per product
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
            continue
          }

          // Voorraad-allocatie wordt afgehandeld door sync-orders (die direct hierna draait)
          // sync-statuses doet alleen status + picked checks
        }
      }
    } catch (err) {
      console.warn(`⚠️  Kon status niet ophalen voor order ${orderUuid}:`, err)
    }

    if (i < orderUuids.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, DELAY_MS))
    }
  }

  const result = {
    success: true,
    message: `Statussen bijgewerkt: ${deletedCount} afgeronde orders verwijderd, ${updatedCount} printjobs geüpdated`,
    checked: orderUuids.length,
    deleted: deletedCount,
    updated: updatedCount,
  }

  send({ type: "done", step: 2, totalSteps: 2, message: `${deletedCount} verwijderd, ${updatedCount} geüpdated`, result })

  return result
}
