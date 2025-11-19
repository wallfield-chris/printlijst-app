import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

// GET - Haal alle list views op
export async function GET() {
  try {
    const listViews = await prisma.listView.findMany({
      where: { active: true },
      orderBy: { order: "asc" }
    })

    return NextResponse.json(listViews)
  } catch (error) {
    console.error("Error fetching list views:", error)
    return NextResponse.json(
      { error: "Failed to fetch list views" },
      { status: 500 }
    )
  }
}

// POST - Maak een nieuwe list view aan
export async function POST(request: NextRequest) {
  try {
    const session = await auth()
    
    if (!session || session.user.role !== "admin") {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      )
    }

    const body = await request.json()
    const { name, tags, order } = body

    // Validatie
    if (!name || !tags) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      )
    }

    const listView = await prisma.listView.create({
      data: {
        name,
        tags,
        order: order !== undefined ? order : 0,
        active: true
      }
    })

    return NextResponse.json(listView)
  } catch (error) {
    console.error("Error creating list view:", error)
    return NextResponse.json(
      { error: "Failed to create list view" },
      { status: 500 }
    )
  }
}
