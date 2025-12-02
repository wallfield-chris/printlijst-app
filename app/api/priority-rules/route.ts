import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

// GET - Haal alle priority rules op
export async function GET() {
  try {
    const session = await auth()
    
    if (!session || session.user.role !== "admin") {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      )
    }

    const priorityRules = await prisma.priorityRule.findMany({
      orderBy: {
        createdAt: "desc"
      }
    })

    return NextResponse.json(priorityRules)
  } catch (error) {
    console.error("Error fetching priority rules:", error)
    return NextResponse.json(
      { error: "Failed to fetch priority rules" },
      { status: 500 }
    )
  }
}

// POST - Maak een nieuwe priority rule aan
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
    const { field, condition, value, priority, active, operator, scope } = body

    // Validatie
    if (!field || !condition || !value || !priority) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      )
    }

    const priorityRule = await prisma.priorityRule.create({
      data: {
        field,
        condition,
        value,
        priority,
        active: active !== undefined ? active : true,
        operator: operator || "AND",
        scope: scope || "product"
      }
    })

    return NextResponse.json(priorityRule)
  } catch (error) {
    console.error("Error creating priority rule:", error)
    return NextResponse.json(
      { error: "Failed to create priority rule" },
      { status: 500 }
    )
  }
}
