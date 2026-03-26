import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

// POST: Meld waste/afval
export async function POST(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 })
    }

    const body = await request.json()
    const { items } = body as { items: { size: string; quantity: number; reason?: string }[] }

    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: "Geen items opgegeven" }, { status: 400 })
    }

    // Valideer elk item
    const validSizes = ["40x60", "60x90", "80x120", "100x150", "salontafel"]
    for (const item of items) {
      if (!validSizes.includes(item.size)) {
        return NextResponse.json({ error: `Ongeldige maat: ${item.size}` }, { status: 400 })
      }
      if (!Number.isInteger(item.quantity) || item.quantity < 1) {
        return NextResponse.json({ error: "Quantity moet een positief geheel getal zijn" }, { status: 400 })
      }
    }

    const userId = (session.user as any).id

    // Maak waste reports aan
    const created = await prisma.wasteReport.createMany({
      data: items.map((item) => ({
        size: item.size,
        quantity: item.quantity,
        reason: item.reason || null,
        userId,
      })),
    })

    return NextResponse.json({ success: true, count: created.count })
  } catch (error) {
    console.error("Error creating waste report:", error)
    return NextResponse.json({ error: "Fout bij opslaan" }, { status: 500 })
  }
}

// GET: Haal waste reports op (voor admin dashboard)
export async function GET(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const from = searchParams.get("from")
    const to = searchParams.get("to")

    const where: any = {}
    if (from || to) {
      where.createdAt = {}
      if (from) where.createdAt.gte = new Date(from)
      if (to) where.createdAt.lte = new Date(to + "T23:59:59.999Z")
    }

    const reports = await prisma.wasteReport.findMany({
      where,
      include: { user: { select: { id: true, name: true } } },
      orderBy: { createdAt: "desc" },
    })

    // Groepeer per maat
    const bySize: Record<string, number> = {}
    const byDate: Record<string, Record<string, number>> = {}
    const byUser: Record<string, { name: string; total: number; bySize: Record<string, number> }> = {}
    let totalQuantity = 0

    for (const r of reports) {
      totalQuantity += r.quantity
      bySize[r.size] = (bySize[r.size] || 0) + r.quantity

      const dateKey = r.createdAt.toISOString().split("T")[0]
      if (!byDate[dateKey]) byDate[dateKey] = {}
      byDate[dateKey][r.size] = (byDate[dateKey][r.size] || 0) + r.quantity

      if (!byUser[r.userId]) byUser[r.userId] = { name: r.user.name, total: 0, bySize: {} }
      byUser[r.userId].total += r.quantity
      byUser[r.userId].bySize[r.size] = (byUser[r.userId].bySize[r.size] || 0) + r.quantity
    }

    return NextResponse.json({
      reports,
      summary: {
        totalQuantity,
        totalReports: reports.length,
        bySize,
        byDate,
        byUser,
      },
    })
  } catch (error) {
    console.error("Error fetching waste reports:", error)
    return NextResponse.json({ error: "Fout bij ophalen" }, { status: 500 })
  }
}
