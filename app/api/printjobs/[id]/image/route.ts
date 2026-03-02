import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { GoedGepicktAPI } from "@/lib/goedgepickt"

/**
 * GET /api/printjobs/[id]/image
 * Haalt de product afbeelding op uit GoedGepickt en slaat deze op in de DB.
 * Geeft de imageUrl terug.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()
    if (!session) {
      return NextResponse.json({ error: "Niet geautoriseerd" }, { status: 401 })
    }

    const { id } = await params

    const printJob = await prisma.printJob.findUnique({
      where: { id },
      select: { id: true, productUuid: true, imageUrl: true },
    })

    if (!printJob) {
      return NextResponse.json({ error: "Printjob niet gevonden" }, { status: 404 })
    }

    // Als imageUrl al bekend is, direct terugsturen
    if (printJob.imageUrl) {
      return NextResponse.json({ imageUrl: printJob.imageUrl })
    }

    // Geen productUuid? Kan geen afbeelding ophalen
    if (!printJob.productUuid) {
      return NextResponse.json({ imageUrl: null })
    }

    const apiKeySetting = await prisma.setting.findUnique({
      where: { key: "goedgepickt_api_key" },
    })

    if (!apiKeySetting?.value) {
      return NextResponse.json({ imageUrl: null })
    }

    const api = new GoedGepicktAPI(apiKeySetting.value)
    const productDetails = await api.getProduct(printJob.productUuid)

    let imageUrl: string | null = null
    if (
      productDetails?.picture &&
      !productDetails.picture.includes("image_placeholder")
    ) {
      imageUrl = productDetails.picture
    }

    // Sla op in DB zodat volgende keer geen API call nodig is
    if (imageUrl) {
      await prisma.printJob.update({
        where: { id },
        data: { imageUrl },
      })
    }

    return NextResponse.json({ imageUrl })
  } catch (error: any) {
    console.error("❌ Fout bij ophalen product afbeelding:", error)
    return NextResponse.json({ imageUrl: null })
  }
}
