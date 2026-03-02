import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

// DELETE - Verwijder een logboek entry (alleen eigen entries of admin)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()
    if (!session || session.user.role !== "admin") {
      return NextResponse.json({ error: "Niet geautoriseerd" }, { status: 401 })
    }

    const { id } = await params

    const entry = await prisma.logbookEntry.findUnique({ where: { id } })
    if (!entry) {
      return NextResponse.json({ error: "Entry niet gevonden" }, { status: 404 })
    }

    await prisma.logbookEntry.delete({ where: { id } })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error deleting logbook entry:", error)
    return NextResponse.json({ error: "Kan entry niet verwijderen" }, { status: 500 })
  }
}

// PATCH - Bewerk een logboek entry
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()
    if (!session || session.user.role !== "admin") {
      return NextResponse.json({ error: "Niet geautoriseerd" }, { status: 401 })
    }

    const { id } = await params
    const body = await request.json()
    const { content, mood } = body

    const entry = await prisma.logbookEntry.findUnique({ where: { id } })
    if (!entry) {
      return NextResponse.json({ error: "Entry niet gevonden" }, { status: 404 })
    }

    const updateData: Record<string, string> = {}
    if (content !== undefined) {
      if (content.trim().length === 0) {
        return NextResponse.json({ error: "Inhoud is verplicht" }, { status: 400 })
      }
      updateData.content = content.trim()
    }
    if (mood !== undefined) {
      const validMoods = ["good", "neutral", "bad"]
      if (validMoods.includes(mood)) {
        updateData.mood = mood
      }
    }

    const updated = await prisma.logbookEntry.update({
      where: { id },
      data: updateData,
      include: {
        author: {
          select: { id: true, name: true, email: true },
        },
      },
    })

    return NextResponse.json(updated)
  } catch (error) {
    console.error("Error updating logbook entry:", error)
    return NextResponse.json({ error: "Kan entry niet bewerken" }, { status: 500 })
  }
}
