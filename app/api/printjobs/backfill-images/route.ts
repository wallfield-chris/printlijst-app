import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

const GG_BASE = "https://account.goedgepickt.nl/api/v1"
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

/**
 * POST /api/printjobs/backfill-images
 * Vult ontbrekende productafbeeldingen aan voor bestaande printjobs.
 * Haalt de afbeelding op uit GoedGepickt product API.
 */
export async function POST() {
  try {
    const session = await auth()
    if (!session || (session.user as any).role !== "admin") {
      return NextResponse.json({ error: "Niet geautoriseerd" }, { status: 401 })
    }

    const apiKeySetting = await prisma.setting.findUnique({
      where: { key: "goedgepickt_api_key" },
    })
    if (!apiKeySetting?.value) {
      return NextResponse.json({ error: "Geen GoedGepickt API key geconfigureerd" }, { status: 400 })
    }

    // Vind alle printjobs zonder afbeelding maar met productUuid
    const jobs = await prisma.printJob.findMany({
      where: {
        imageUrl: null,
        productUuid: { not: null },
        printStatus: { in: ["pending", "in_progress"] },
      },
      select: { id: true, productUuid: true },
    })

    if (jobs.length === 0) {
      return NextResponse.json({ updated: 0, total: 0, message: "Alle printjobs hebben al een afbeelding" })
    }

    const headers = {
      Authorization: `Bearer ${apiKeySetting.value}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    }

    // Cache per productUuid om dubbele API calls te voorkomen
    const cache = new Map<string, string | null>()
    let updated = 0
    let failed = 0

    for (const job of jobs) {
      if (!job.productUuid) continue

      let imageUrl: string | null = null

      if (cache.has(job.productUuid)) {
        imageUrl = cache.get(job.productUuid) || null
      } else {
        try {
          const res = await fetch(`${GG_BASE}/products/${job.productUuid}`, {
            headers,
            cache: "no-store",
          })

          if (res.status === 429) {
            // Rate limited — wacht en probeer opnieuw
            const retryAfter = res.headers.get("Retry-After")
            await sleep(retryAfter ? parseInt(retryAfter) * 1000 : 5000)
            const retry = await fetch(`${GG_BASE}/products/${job.productUuid}`, {
              headers,
              cache: "no-store",
            })
            if (retry.ok) {
              const data = await retry.json()
              if (data.picture && !data.picture.includes("image_placeholder")) {
                imageUrl = data.picture
              }
            }
          } else if (res.ok) {
            const data = await res.json()
            if (data.picture && !data.picture.includes("image_placeholder")) {
              imageUrl = data.picture
            }
          }

          cache.set(job.productUuid, imageUrl)
          // Kleine pauze tussen API calls
          await sleep(300)
        } catch {
          cache.set(job.productUuid, null)
          failed++
        }
      }

      if (imageUrl) {
        await prisma.printJob.update({
          where: { id: job.id },
          data: { imageUrl },
        })
        updated++
      }
    }

    return NextResponse.json({
      updated,
      total: jobs.length,
      failed,
      uniqueProducts: cache.size,
      message: `${updated} van ${jobs.length} printjobs bijgewerkt met afbeelding`,
    })
  } catch (error) {
    console.error("Backfill images error:", error)
    return NextResponse.json(
      { error: "Fout bij ophalen van afbeeldingen" },
      { status: 500 }
    )
  }
}
