import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { GoedGepicktAPI } from "@/lib/goedgepickt"

export async function POST(request: NextRequest) {
  try {
    const session = await auth()
    if (!session) {
      return NextResponse.json({ error: "Niet geautoriseerd" }, { status: 401 })
    }

    const body = await request.json()
    const { tags, locationName, locationUuid } = body as {
      tags: string[]       // tags van de actieve list-view tab (bijv. ["40x60","40 x 60 cm"])
      locationName: string // naam van de geselecteerde locatie (voor mutationReason)
      locationUuid?: string // UUID van de picklocation in GoedGepickt
    }

    if (!tags || tags.length === 0) {
      return NextResponse.json({ error: "Geen tags opgegeven" }, { status: 400 })
    }

    if (!locationName) {
      return NextResponse.json({ error: "Geen locatie geselecteerd" }, { status: 400 })
    }

    const apiKeySetting = await prisma.setting.findUnique({
      where: { key: "goedgepickt_api_key" },
    })

    if (!apiKeySetting?.value) {
      return NextResponse.json({ error: "Geen API key geconfigureerd" }, { status: 400 })
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
      return NextResponse.json({ pushed: 0, failed: 0, message: "Geen voltooide jobs gevonden voor deze tab" })
    }

    let pushed = 0
    let failed = 0
    const failedProducts: { name: string; error: string }[] = []

    for (const job of jobsToPush) {
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
          // Stap 2b: Product heeft GEEN stock op deze locatie → aanmaken met hoeveelheid
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

      // Kleine vertraging voor rate limiting (150 req/min)
      await new Promise((r) => setTimeout(r, 200))
    }

    return NextResponse.json({
      pushed,
      failed,
      failedProducts,
      message: `${pushed} jobs naar voorraad gepusht${failed > 0 ? `, ${failed} mislukt` : ""}`,
    })
  } catch (error) {
    console.error("Error pushing to stock:", error)
    return NextResponse.json({ error: "Fout bij pushen naar voorraad" }, { status: 500 })
  }
}
