import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

/**
 * POST /api/printjobs/cleanup-duplicates
 * 
 * Verwijdert duplicate printjobs: als dezelfde orderUuid + productUuid (of sku)
 * meerdere keer voorkomt, wordt alleen de oudste behouden.
 * 
 * Alleen voor admins.
 */
export async function POST() {
  try {
    const session = await auth()
    if (!session || session.user.role !== "admin") {
      return NextResponse.json({ error: "Niet geautoriseerd" }, { status: 401 })
    }

    // Stap 1: Verwijder pending/stock_covered jobs waar al een completed/pushed versie bestaat
    const completedJobKeys = new Set<string>()
    const completedJobs = await prisma.printJob.findMany({
      where: { printStatus: { in: ["completed", "pushed"] } },
      select: { orderUuid: true, productUuid: true, sku: true, productName: true, orderNumber: true },
    })
    for (const job of completedJobs) {
      if (job.orderUuid && job.productUuid) completedJobKeys.add(`${job.orderUuid}::${job.productUuid}`)
      if (job.orderUuid && job.sku) completedJobKeys.add(`${job.orderUuid}::sku::${job.sku}`)
      if (job.orderUuid && job.productName) completedJobKeys.add(`${job.orderUuid}::name::${job.productName}`)
      if (job.orderNumber && job.sku) completedJobKeys.add(`${job.orderNumber}::sku::${job.sku}`)
    }

    // Haal alle actieve (niet-completed) printjobs op
    const allJobs = await prisma.printJob.findMany({
      where: {
        printStatus: { in: ["pending", "in_progress", "stock_covered"] },
      },
      orderBy: { receivedAt: "asc" }, // Oudste eerst → die houden we
      select: {
        id: true,
        orderUuid: true,
        productUuid: true,
        sku: true,
        orderNumber: true,
        productName: true,
        receivedAt: true,
      },
    })

    const seen = new Set<string>()
    const duplicateIds: string[] = []
    const duplicateDetails: { id: string; orderNumber: string; productName: string; reason: string }[] = []

    for (const job of allJobs) {
      let key: string | null = null

      if (job.orderUuid && job.productUuid) {
        key = `${job.orderUuid}::${job.productUuid}`
      } else if (job.orderUuid && job.sku) {
        key = `${job.orderUuid}::sku::${job.sku}`
      } else if (job.orderNumber && job.sku) {
        key = `${job.orderNumber}::sku::${job.sku}`
      }

      // Check: is er al een completed/pushed versie van deze job?
      const nameKey = job.orderUuid ? `${job.orderUuid}::name::${job.productName}` : null
      const alreadyCompleted =
        (key && completedJobKeys.has(key)) ||
        (nameKey && completedJobKeys.has(nameKey))

      if (alreadyCompleted) {
        duplicateIds.push(job.id)
        duplicateDetails.push({
          id: job.id,
          orderNumber: job.orderNumber,
          productName: job.productName,
          reason: "al geprint (completed/pushed versie bestaat)",
        })
        continue
      }

      if (!key) continue

      if (seen.has(key)) {
        duplicateIds.push(job.id)
        duplicateDetails.push({
          id: job.id,
          orderNumber: job.orderNumber,
          productName: job.productName,
          reason: "dubbele pending job",
        })
      } else {
        seen.add(key)
      }
    }

    if (duplicateIds.length === 0) {
      return NextResponse.json({
        success: true,
        message: "Geen duplicaten gevonden",
        totalChecked: allJobs.length,
        duplicatesRemoved: 0,
      })
    }

    // Verwijder alle duplicaten
    const result = await prisma.printJob.deleteMany({
      where: { id: { in: duplicateIds } },
    })

    return NextResponse.json({
      success: true,
      message: `${result.count} duplicaten verwijderd`,
      totalChecked: allJobs.length,
      uniqueJobs: allJobs.length - duplicateIds.length,
      duplicatesRemoved: result.count,
      details: duplicateDetails.slice(0, 50), // Max 50 details tonen
    })
  } catch (error: any) {
    console.error("❌ Cleanup error:", error)
    return NextResponse.json(
      { error: "Fout bij opschonen: " + error.message },
      { status: 500 }
    )
  }
}
