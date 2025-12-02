import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

// GET - Haal alle tag rules op
export async function GET() {
  try {
    const session = await auth()
    
    if (!session || session.user.role !== "admin") {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      )
    }

    const tagRules = await prisma.tagRule.findMany({
      orderBy: {
        createdAt: "desc"
      }
    })

    return NextResponse.json(tagRules)
  } catch (error) {
    console.error("Error fetching tag rules:", error)
    return NextResponse.json(
      { error: "Failed to fetch tag rules" },
      { status: 500 }
    )
  }
}

// POST - Maak een nieuwe tag rule aan
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
    const { field, condition, value, tag, active, operator, scope } = body

    // Validatie
    if (!field || !condition || !value || !tag) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      )
    }

    const tagRule = await prisma.tagRule.create({
      data: {
        field,
        condition,
        value,
        tag,
        active: active !== undefined ? active : true,
        operator: operator || "AND",
        scope: scope || "product"
      }
    })

    return NextResponse.json(tagRule)
  } catch (error) {
    console.error("Error creating tag rule:", error)
    return NextResponse.json(
      { error: "Failed to create tag rule" },
      { status: 500 }
    )
  }
}
