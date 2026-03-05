import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

// ===================================================================
// Zorg dat de ChecklistEntry tabel bestaat (self-healing)
// Dit lost het probleem op dat prisma migrate deploy faalt door
// incompatibele SQLite migraties in de migrations map.
// ===================================================================
let tableReady = false

async function ensureTable() {
  if (tableReady) return
  try {
    // Test of de tabel bestaat door een simpele query
    await prisma.$queryRawUnsafe(`SELECT 1 FROM "ChecklistEntry" LIMIT 1`)
    tableReady = true
  } catch {
    // Tabel bestaat niet — maak hem aan
    console.log("ChecklistEntry tabel niet gevonden, wordt aangemaakt...")
    try {
      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "ChecklistEntry" (
          "id" TEXT NOT NULL,
          "date" TEXT NOT NULL,
          "printerCleaned" BOOLEAN NOT NULL DEFAULT false,
          "workplaceClean" BOOLEAN NOT NULL DEFAULT false,
          "returnsProcessed" BOOLEAN NOT NULL DEFAULT false,
          "wasteDisposed" BOOLEAN NOT NULL DEFAULT false,
          "notes" TEXT,
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT "ChecklistEntry_pkey" PRIMARY KEY ("id")
        )
      `)
      await prisma.$executeRawUnsafe(
        `CREATE UNIQUE INDEX IF NOT EXISTS "ChecklistEntry_date_key" ON "ChecklistEntry"("date")`
      )
      await prisma.$executeRawUnsafe(
        `CREATE INDEX IF NOT EXISTS "ChecklistEntry_date_idx" ON "ChecklistEntry"("date")`
      )
      console.log("ChecklistEntry tabel succesvol aangemaakt")
      tableReady = true
    } catch (createErr) {
      console.error("Kon ChecklistEntry tabel niet aanmaken:", createErr)
    }
  }
}

// ===================================================================
// GET /api/checklist — Haal aftekenlijst entries op (gedeeld per dag)
// Geen auth vereist — volledig openbaar
// ===================================================================
export async function GET(request: NextRequest) {
  try {
    await ensureTable()

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
// Geen auth vereist — volledig openbaar
// Body: { date?, field, value }
// ===================================================================
export async function POST(request: NextRequest) {
  try {
    await ensureTable()

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
        create: createData as any,
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
