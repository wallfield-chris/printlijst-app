import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

// GET - Haal alle condition rules op
export async function GET() {
  try {
    const session = await auth()
    
    if (!session || session.user.role !== "admin") {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      )
    }

    const conditionRules = await prisma.conditionRule.findMany({
      orderBy: {
        createdAt: "desc"
      }
    })

    return NextResponse.json(conditionRules)
  } catch (error) {
    console.error("Error fetching condition rules:", error)
    return NextResponse.json(
      { error: "Failed to fetch condition rules" },
      { status: 500 }
    )
  }
}

// POST - Maak een nieuwe condition rule aan
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
    const { field, condition, value, active, operator, scope } = body

    // Validatie
    if (!field || !condition || !value) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      )
    }

    const conditionRule = await prisma.conditionRule.create({
      data: {
        field,
        condition,
        value,
        active: active !== undefined ? active : true,
        operator: operator || "AND",
        scope: scope || "product"
      }
    })

    return NextResponse.json(conditionRule)
  } catch (error) {
    console.error("Error creating condition rule:", error)
    return NextResponse.json(
      { error: "Failed to create condition rule" },
      { status: 500 }
    )
  }
}
