import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

// GET - Haal alle exclusion rules op
export async function GET() {
  try {
    const exclusionRules = await prisma.exclusionRule.findMany({
      orderBy: {
        createdAt: "desc",
      },
    })

    return NextResponse.json(exclusionRules)
  } catch (error) {
    console.error("Error fetching exclusion rules:", error)
    return NextResponse.json(
      { error: "Failed to fetch exclusion rules" },
      { status: 500 }
    )
  }
}

// POST - Maak een nieuwe exclusion rule
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { field, condition, value, reason, active } = body

    if (!field || !condition || !value) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      )
    }

    const exclusionRule = await prisma.exclusionRule.create({
      data: {
        field,
        condition,
        value,
        reason: reason || null,
        active: active !== undefined ? active : true,
      },
    })

    return NextResponse.json(exclusionRule)
  } catch (error) {
    console.error("Error creating exclusion rule:", error)
    return NextResponse.json(
      { error: "Failed to create exclusion rule" },
      { status: 500 }
    )
  }
}
