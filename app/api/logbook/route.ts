import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

// GET - Haal logboek entries op (met paginering)
export async function GET(request: NextRequest) {
  try {
    const session = await auth()
    if (!session || session.user.role !== "admin") {
      return NextResponse.json({ error: "Niet geautoriseerd" }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const page = parseInt(searchParams.get("page") || "1")
    const limit = parseInt(searchParams.get("limit") || "50")
    const skip = (page - 1) * limit

    const [entries, total] = await Promise.all([
      prisma.logbookEntry.findMany({
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
        include: {
          author: {
            select: { id: true, name: true, email: true },
          },
        },
      }),
      prisma.logbookEntry.count(),
    ])

    return NextResponse.json({ entries, total, page, limit })
  } catch (error) {
    console.error("Error fetching logbook:", error)
    return NextResponse.json({ error: "Kan logboek niet ophalen" }, { status: 500 })
  }
}

// POST - Nieuwe logboek entry aanmaken
export async function POST(request: NextRequest) {
  try {
    const session = await auth()
    if (!session || session.user.role !== "admin") {
      return NextResponse.json({ error: "Niet geautoriseerd" }, { status: 401 })
    }

    const body = await request.json()
    const { content, mood } = body

    if (!content || content.trim().length === 0) {
      return NextResponse.json({ error: "Inhoud is verplicht" }, { status: 400 })
    }

    const validMoods = ["good", "neutral", "bad"]
    const entryMood = validMoods.includes(mood) ? mood : "neutral"

    const entry = await prisma.logbookEntry.create({
      data: {
        content: content.trim(),
        mood: entryMood,
        authorId: session.user.id,
      },
      include: {
        author: {
          select: { id: true, name: true, email: true },
        },
      },
    })

    return NextResponse.json(entry, { status: 201 })
  } catch (error) {
    console.error("Error creating logbook entry:", error)
    return NextResponse.json({ error: "Kan entry niet aanmaken" }, { status: 500 })
  }
}
