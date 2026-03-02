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

    // Haal alle actieve (niet-completed) printjobs op
    const allJobs = await prisma.printJob.findMany({
      where: {
        printStatus: { in: ["pending", "in_progress"] },
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
    const duplicateDetails: { id: string; orderNumber: string; productName: string }[] = []

    for (const job of allJobs) {
      // Maak een unieke sleutel per order+product
      // Prioriteit: orderUuid+productUuid, fallback: orderUuid+sku
      let key: string | null = null

      if (job.orderUuid && job.productUuid) {
        key = `${job.orderUuid}::${job.productUuid}`
      } else if (job.orderUuid && job.sku) {
        key = `${job.orderUuid}::sku::${job.sku}`
      } else if (job.orderNumber && job.sku) {
        // Fallback als orderUuid ontbreekt
        key = `${job.orderNumber}::sku::${job.sku}`
      }

      if (!key) continue // Kan niet dedupliceren zonder key

      if (seen.has(key)) {
        // Dit is een duplicaat → verwijderen
        duplicateIds.push(job.id)
        duplicateDetails.push({
          id: job.id,
          orderNumber: job.orderNumber,
          productName: job.productName,
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
