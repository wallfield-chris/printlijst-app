import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { GoedGepicktAPI } from "@/lib/goedgepickt"

// GoedGepickt rate limit: 150 req/min. 2 API calls per job → minimaal 800ms tussen jobs.
const PUSH_DELAY_MS = 900

type SendFn = (data: Record<string, any>) => void
const noopSend: SendFn = () => {}

type PushResult = {
  pushed: number
  failed: number
  failedProducts: { name: string; error: string }[]
  message: string
}

async function runPushLogic(
  tags: string[],
  locationName: string,
  locationUuid: string | undefined,
  send: SendFn
): Promise<PushResult | { error: string; status?: number }> {
  const apiKeySetting = await prisma.setting.findUnique({
    where: { key: "goedgepickt_api_key" },
  })

  if (!apiKeySetting?.value) {
    return { error: "Geen API key geconfigureerd", status: 400 }
  }

  const api = new GoedGepicktAPI(apiKeySetting.value)

  // Zoek alle voltooide printjobs die matchen met de tab-tags
  // Exclusief missingFile jobs: die zijn NIET geprint en horen niet in voorraad
  const completedJobs = await prisma.printJob.findMany({
    where: {
      printStatus: "completed",
      missingFile: false,
      AND: [
        {
          OR: [
            { orderStatus: null },
            { orderStatus: { notIn: ["completed", "cancelled"] } },
          ],
        },
      ],
    },
    select: {
      id: true,
      productUuid: true,
      quantity: true,
      tags: true,
      productName: true,
      sku: true,
    },
  })

  // Filter op basis van tab-tags
  const jobsToPush = completedJobs.filter((job) => {
    if (!job.tags) return false
    const jobTagList = job.tags.split(",").map((t) => t.trim())
    return tags.some((tag) => jobTagList.includes(tag))
  })

  if (jobsToPush.length === 0) {
    return { pushed: 0, failed: 0, failedProducts: [], message: "Geen voltooide jobs gevonden voor deze tab" }
  }

  send({ type: "start", step: 0, totalSteps: jobsToPush.length, message: `${jobsToPush.length} jobs pushen naar voorraad...` })

  let pushed = 0
  let failed = 0
  const failedProducts: { name: string; error: string }[] = []

  for (let i = 0; i < jobsToPush.length; i++) {
    const job = jobsToPush[i]
    send({
      type: "progress",
      step: i + 1,
      totalSteps: jobsToPush.length,
      message: `Job ${i + 1} van ${jobsToPush.length} verwerken...`,
      detail: job.productName || job.sku || job.id,
    })

    if (!job.productUuid) {
      // Geen productUuid: markeer alleen als pushed zonder API call
      await prisma.printJob.update({
        where: { id: job.id },
        data: { printStatus: "pushed" },
      })
      pushed++
      continue
    }

    if (!locationUuid) {
      failed++
      failedProducts.push({
        name: job.productName || job.sku || job.id,
        error: "Geen locatie UUID beschikbaar",
      })
      continue
    }

    try {
      // Stap 1: Haal huidige stock locations op voor dit product
      const stockLocations = await api.getProductStockLocations(job.productUuid)
      const existing = stockLocations.find((s) => s.picklocationUuid === locationUuid)

      let result: { ok: boolean; error?: string }

      if (existing) {
        // Stap 2a: Product heeft al stock op deze locatie → update met huidige + nieuwe hoeveelheid
        const newQuantity = existing.stockQuantity + job.quantity
        result = await api.updateStockLocation(
          job.productUuid,
          locationUuid,
          newQuantity,
          `Geprint - ${locationName}`
        )
      } else {
        // Stap 2b: Product heeft GEEN stock op deze locatie → aanmaken
        console.log(`📦 Product ${job.productUuid} heeft geen stock op ${locationName}, aanmaken...`)
        result = await api.createStockLocation(job.productUuid, locationUuid, job.quantity, 1)
      }

      if (result.ok) {
        await prisma.printJob.update({
          where: { id: job.id },
          data: { printStatus: "pushed" },
        })
        pushed++
      } else {
        failed++
        failedProducts.push({
          name: job.productName || job.sku || job.id,
          error: result.error || "Onbekende fout",
        })
      }
    } catch (error) {
      failed++
      failedProducts.push({
        name: job.productName || job.sku || job.id,
        error: String(error),
      })
    }

    // Vertraging voor rate limiting (150 req/min, 2 calls per job → min 800ms)
    await new Promise((r) => setTimeout(r, PUSH_DELAY_MS))
  }

  const message = `${pushed} jobs naar voorraad gepusht${failed > 0 ? `, ${failed} mislukt` : ""}`
  return { pushed, failed, failedProducts, message }
}

export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session) {
    return NextResponse.json({ error: "Niet geautoriseerd" }, { status: 401 })
  }

  const url = new URL(request.url)
  const useStream = url.searchParams.get("stream") === "true"

  let body: { tags: string[]; locationName: string; locationUuid?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Ongeldige request body" }, { status: 400 })
  }

  const { tags, locationName, locationUuid } = body

  if (!tags || tags.length === 0) {
    return NextResponse.json({ error: "Geen tags opgegeven" }, { status: 400 })
  }

  if (!locationName) {
    return NextResponse.json({ error: "Geen locatie geselecteerd" }, { status: 400 })
  }

  if (useStream) {
    const encoder = new TextEncoder()
    const stream = new ReadableStream({
      async start(controller) {
        const send: SendFn = (data) => {
          try {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
          } catch { /* stream closed */ }
        }
        try {
          const result = await runPushLogic(tags, locationName, locationUuid, send)
          if ("error" in result) {
            send({ type: "error", message: result.error })
          } else {
            send({ type: "done", totalSteps: 1, message: result.message, result })
          }
        } catch (error) {
          send({ type: "error", message: `Fout: ${error instanceof Error ? error.message : String(error)}` })
        } finally {
          controller.close()
        }
      },
    })

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
      },
    })
  }

  // Non-streaming fallback
  try {
    const result = await runPushLogic(tags, locationName, locationUuid, noopSend)
    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: (result as any).status || 500 })
    }
    return NextResponse.json(result)
  } catch (error) {
    console.error("Error pushing to stock:", error)
    return NextResponse.json({ error: "Fout bij pushen naar voorraad" }, { status: 500 })
  }
}

