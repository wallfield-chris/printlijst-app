import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

// ===================================================================
// GET /api/checklist — Haal aftekenlijst entries op (gedeeld per dag)
// Query params:
//   startDate: YYYY-MM-DD (default: 30 dagen geleden)
//   endDate: YYYY-MM-DD (default: vandaag)
// ===================================================================
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl
    const now = new Date()
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`

    const thirtyDaysAgo = new Date(now)
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
    const defaultStart = `${thirtyDaysAgo.getFullYear()}-${String(thirtyDaysAgo.getMonth() + 1).padStart(2, "0")}-${String(thirtyDaysAgo.getDate()).padStart(2, "0")}`

    const startDate = searchParams.get("startDate") || defaultStart
    const endDate = searchParams.get("endDate") || today

    const entries = await prisma.checklistEntry.findMany({
      where: { date: { gte: startDate, lte: endDate } },
      orderBy: { date: "desc" },
    })

    return NextResponse.json(entries)
  } catch (error) {
    console.error("Error fetching checklist:", error)
    return NextResponse.json({ error: "Kan aftekenlijst niet laden" }, { status: 500 })
  }
}

// ===================================================================
// POST /api/checklist — Toggle een item op de dagelijkse aftekenlijst
// Body: { date?, field, value }
// ===================================================================
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    const now = new Date()
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`
    const date = body.date || today

    const validFields = [
      "printerCleaned", "workplaceClean", "returnsProcessed", "wasteDisposed", "notes",
    ]

    // Bulk update (hele checklist tegelijk opslaan)
    if (body.data && typeof body.data === "object") {
      const updateData: Record<string, any> = {}
      const createData: Record<string, any> = { date }
      for (const [key, val] of Object.entries(body.data)) {
        if (validFields.includes(key)) {
          updateData[key] = val
          createData[key] = val
        }
      }

      const entry = await prisma.checklistEntry.upsert({
        where: { date },
        create: createData,
        update: updateData,
      })

      return NextResponse.json(entry)
    }

    // Enkel veld togglen
    const { field, value } = body
    if (!field || !validFields.includes(field)) {
      return NextResponse.json({ error: "Ongeldig veld" }, { status: 400 })
    }

    const entry = await prisma.checklistEntry.upsert({
      where: { date },
      create: { date, [field]: value },
      update: { [field]: value },
    })

    return NextResponse.json(entry)
  } catch (error) {
    console.error("Error saving checklist:", error)
    return NextResponse.json({ error: "Kan aftekenlijst niet opslaan" }, { status: 500 })
  }
}
