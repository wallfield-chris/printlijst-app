import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { GoedGepicktAPI } from "@/lib/goedgepickt"

export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session || (session.user as any).role !== "admin") {
    return NextResponse.json({ error: "Niet geautoriseerd" }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const orderNumber = searchParams.get("orderNumber")?.trim()

  if (!orderNumber || orderNumber.length < 1) {
    return NextResponse.json({ error: "Geen ordernummer opgegeven" }, { status: 400 })
  }

  // Zoek ALLE printjobs voor dit ordernummer (alle statussen, inclusief pushed)
  const jobs = await prisma.printJob.findMany({
    where: {
      orderNumber: {
        contains: orderNumber,
        mode: "insensitive",
      },
    },
    include: {
      completedByUser: {
        select: { id: true, name: true, email: true },
      },
    },
    orderBy: { receivedAt: "asc" },
  })

  // Haal optioneel live GoedGepickt data op als we een orderUuid hebben
  let liveOrder: any = null
  const orderUuid = jobs.find((j) => j.orderUuid)?.orderUuid

  if (orderUuid) {
    try {
      const apiKeySetting = await prisma.setting.findUnique({
        where: { key: "goedgepickt_api_key" },
      })
      if (apiKeySetting?.value) {
        const api = new GoedGepicktAPI(apiKeySetting.value)
        liveOrder = await api.getOrder(orderUuid)
      }
    } catch {
      // Live data ophalen mislukt — toon alleen DB data
    }
  }

  // Verrijk jobs met interpretatie van hun status (wat is er precies mee gebeurd)
  const enrichedJobs = jobs.map((job) => {
    let timeline: string
    let timelineDetail: string | null = null

    if (job.printStatus === "pushed") {
      timeline = "geprint_en_gepusht"
      timelineDetail = `Geprint${job.completedAt ? ` op ${new Date(job.completedAt).toLocaleString("nl-NL")}` : ""}${job.completedByUser ? ` door ${job.completedByUser.name}` : ""} en naar voorraad gepusht`
    } else if (job.printStatus === "completed" && job.missingFile) {
      timeline = "missing_file"
      timelineDetail = `Als 'missing file' gemarkeerd${job.completedAt ? ` op ${new Date(job.completedAt).toLocaleString("nl-NL")}` : ""}${job.completedByUser ? ` door ${job.completedByUser.name}` : ""}`
    } else if (job.printStatus === "completed") {
      timeline = "geprint"
      timelineDetail = `Geprint${job.completedAt ? ` op ${new Date(job.completedAt).toLocaleString("nl-NL")}` : ""}${job.completedByUser ? ` door ${job.completedByUser.name}` : ""}, nog niet gepusht naar voorraad`
    } else if (job.printStatus === "stock_covered") {
      timeline = "overgeslagen_voorraad"
      timelineDetail = "Overgeslagen — er was al voldoende voorraad op het moment van importeren"
    } else if (job.printStatus === "in_progress") {
      timeline = "bezig"
      timelineDetail = "Staat momenteel op 'Bezig' in de printlijst"
    } else if (job.printStatus === "pending") {
      if (job.orderStatus && ["completed", "cancelled", "shipped"].includes(job.orderStatus)) {
        timeline = "verouderd"
        timelineDetail = `Staat nog in de lijst maar order is al '${job.orderStatus}' in GoedGepickt`
      } else {
        timeline = "wachtend"
        timelineDetail = "Staat nog in de wachtrij — nog niet opgepakt door een operator"
      }
    } else {
      timeline = "onbekend"
    }

    return {
      id: job.id,
      orderNumber: job.orderNumber,
      orderUuid: job.orderUuid,
      productName: job.productName,
      sku: job.sku,
      backfile: job.backfile,
      imageUrl: job.imageUrl,
      quantity: job.quantity,
      pickedQuantity: job.pickedQuantity,
      priority: job.priority,
      tags: job.tags,
      printStatus: job.printStatus,
      orderStatus: job.orderStatus,
      missingFile: job.missingFile,
      receivedAt: job.receivedAt,
      startedAt: job.startedAt,
      completedAt: job.completedAt,
      completedByUser: job.completedByUser,
      timeline,
      timelineDetail,
    }
  })

  return NextResponse.json({
    orderNumber,
    jobs: enrichedJobs,
    liveOrder: liveOrder
      ? {
          uuid: liveOrder.uuid,
          status: liveOrder.status,
          orderNumber: liveOrder.orderNumber,
          customerName: liveOrder.customer?.name || liveOrder.customerName,
          products: (liveOrder.products || []).map((p: any) => ({
            productName: p.productName,
            sku: p.sku,
            productQuantity: p.productQuantity,
            pickedQuantity: p.pickedQuantity,
            productUuid: p.productUuid,
          })),
        }
      : null,
  })
}
